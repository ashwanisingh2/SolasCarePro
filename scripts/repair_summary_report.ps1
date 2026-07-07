# repair_summary_report.ps1
# Generates an HTML summary report of the last repair operation (or all repairs
# in the last 24h). Reads from audit.log + CBS.log + DISM.log + system metrics.
# NEW - no equivalent existed (generate_report.ps1 is a general system report).
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [int]$HoursBack = 24
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $auditLog = "$env:APPDATA\SolasCare\logs\audit.jsonl"
    $reportDir = "$env:APPDATA\SolasCare\reports"
    if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }

    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $reportPath = Join-Path $reportDir "RepairSummary_$timestamp.html"

    # Read audit log entries from the last N hours.
    # Schema: {"ts":"ISO 8601","user":"...","action":"...","target":"...",
    #          "result":"success|failure","details":"...","script":"..."}
    # Both main.js (IPC layer) and PS scripts (_common.ps1 Write-AuditLog) write here.
    $auditEntries = @()
    if (Test-Path $auditLog) {
        $cutoff = (Get-Date).AddHours(-$HoursBack)
        Get-Content $auditLog -Tail 500 | ForEach-Object {
            try {
                $entry = $_ | ConvertFrom-Json
                # Unified schema uses 'ts' (ISO 8601). Fall back to legacy 'timestamp' field.
                $entryTs = if ($entry.ts) { $entry.ts } else { $entry.timestamp }
                if ($entryTs -and ([datetime]$entryTs -ge $cutoff)) {
                    $auditEntries += $entry
                }
            } catch {}
        }
    }

    $successCount = ($auditEntries | Where-Object { $_.result -eq 'SUCCESS' }).Count
    $failureCount = ($auditEntries | Where-Object { $_.result -eq 'FAILURE' }).Count
    $totalOps = $auditEntries.Count

    # System snapshot
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    $ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $ramUsedPct = [math]::Round((($ramTotal - $ramFree) / $ramTotal) * 100, 1)

    # Build HTML
    $html = @"
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SolasCarePro Repair Summary - $timestamp</title>
<style>
body { font-family: 'Segoe UI', Arial, sans-serif; background: #0F172A; color: #E2E8F0; margin: 0; padding: 20px; }
.container { max-width: 900px; margin: 0 auto; }
h1 { color: #8B5CF6; border-bottom: 2px solid #8B5CF6; padding-bottom: 10px; }
h2 { color: #06B6D4; margin-top: 30px; }
.card { background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin: 12px 0; }
.stat { display: inline-block; margin: 8px 16px 8px 0; }
.stat-num { font-size: 28px; font-weight: bold; }
.stat-label { font-size: 11px; color: #94A3B8; text-transform: uppercase; }
.success { color: #34D399; }
.failure { color: #F87171; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #334155; font-size: 12px; }
th { background: #0F172A; color: #94A3B8; text-transform: uppercase; font-size: 10px; }
.timestamp { color: #94A3B8; font-size: 11px; }
</style>
</head>
<body>
<div class="container">
<h1>SolasCarePro Repair Summary Report</h1>
<p class="timestamp">Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Window: Last $HoursBack hours</p>

<div class="card">
<div class="stat"><div class="stat-num">$totalOps</div><div class="stat-label">Total Operations</div></div>
<div class="stat"><div class="stat-num success">$successCount</div><div class="stat-label">Successful</div></div>
<div class="stat"><div class="stat-num failure">$failureCount</div><div class="stat-label">Failed</div></div>
<div class="stat"><div class="stat-num">$([math]::Round(($successCount / [math]::Max($totalOps,1)) * 100, 1))%</div><div class="stat-label">Success Rate</div></div>
</div>

<h2>System Snapshot</h2>
<div class="card">
<table>
<tr><th>Property</th><th>Value</th></tr>
<tr><td>OS</td><td>$($os.Caption) (Build $($os.BuildNumber))</td></tr>
<tr><td>CPU</td><td>$($cpu.Name)</td></tr>
<tr><td>RAM</td><td>$ramFree GB free / $ramTotal GB total ($ramUsedPct% used)</td></tr>
<tr><td>Last Boot</td><td>$($os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm:ss'))</td></tr>
</table>
</div>

<h2>Repair Operations (Last $HoursBack hours)</h2>
<div class="card">
"@

    if ($auditEntries.Count -eq 0) {
        $html += '<p>No repair operations recorded in this period.</p>'
    } else {
        $html += '<table><tr><th>Time</th><th>Action</th><th>Result</th><th>User</th><th>Error</th></tr>'
        foreach ($e in $auditEntries) {
            $resultClass = if ($e.result -eq 'SUCCESS') { 'success' } else { 'failure' }
            $html += "<tr><td class='timestamp'>$([datetime]$e.timestamp).ToString('yyyy-MM-dd HH:mm:ss')</td><td>$($e.action)</td><td class='$resultClass'>$($e.result)</td><td>$($e.user)</td><td>$(if($e.error){$e.error}else{'-'})</td></tr>"
        }
        $html += '</table>'
    }

    $html += @"
</div>
<p class="timestamp" style="margin-top:20px">Generated by SolasCarePro Smart Repair Center</p>
</div>
</body>
</html>
"@

    $html | Out-File -FilePath $reportPath -Encoding UTF8

    Write-JsonResult @{
        success = $true
        reportPath = $reportPath
        totalOps = $totalOps
        successCount = $successCount
        failureCount = $failureCount
        successRate = [math]::Round(($successCount / [math]::Max($totalOps,1)) * 100, 1)
        message = "Repair summary report generated at $reportPath"
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
