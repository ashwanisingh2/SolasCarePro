# error_log_analyzer.ps1
# Unified Windows error log analyzer. Scans System + Application + Security logs
# for the last N days, classifies by severity, groups by provider/source.
# NEW - no equivalent existed (individual CBS/DISM log parsers existed only).
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [int]$DaysBack = 7,
    [int]$MaxEvents = 500
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $cutoff = (Get-Date).AddDays(-$DaysBack)
    $cutoffIso = $cutoff.ToString('o')

    $result = @{
        period = "$DaysBack days"
        totalErrors = 0
        totalWarnings = 0
        totalCritical = 0
        byLog = @{}
        byProvider = @{}
        recentErrors = @()
    }

    $logs = @(
        @{ Name = 'System';      Level = @(1,2,3) }
        @{ Name = 'Application'; Level = @(1,2,3) }
        @{ Name = 'Setup';       Level = @(1,2,3) }
    )

    foreach ($log in $logs) {
        $logName = $log.Name
        try {
            $events = Get-WinEvent -FilterHashtable @{
                LogName = $logName
                StartTime = $cutoff
            } -MaxEvents $MaxEvents -ErrorAction SilentlyContinue | Where-Object {
                $_.Level -le 3  # 1=Critical, 2=Error, 3=Warning
            }

            $critical = @($events | Where-Object { $_.Level -eq 1 })
            $errors = @($events | Where-Object { $_.Level -eq 2 })
            $warnings = @($events | Where-Object { $_.Level -eq 3 })

            $result.byLog[$logName] = @{
                critical = $critical.Count
                errors = $errors.Count
                warnings = $warnings.Count
                total = $events.Count
            }

            $result.totalCritical += $critical.Count
            $result.totalErrors += $errors.Count
            $result.totalWarnings += $warnings.Count

            # Group by provider
            $events | Group-Object ProviderName | ForEach-Object {
                $existing = $result.byProvider[$_.Name]
                if ($existing) {
                    $existing.count += $_.Count
                } else {
                    $result.byProvider[$_.Name] = @{ count = $_.Count; log = $logName }
                }
            }

            # Collect the 10 most recent critical/error events for display
            $recentErrorEvents = @($events | Where-Object { $_.Level -le 2 } | Sort-Object TimeCreated -Descending | Select-Object -First 10)
            foreach ($e in $recentErrorEvents) {
                $result.recentErrors += @{
                    time = $e.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')
                    log = $logName
                    level = switch ($e.Level) { 1 { 'Critical' } 2 { 'Error' } 3 { 'Warning' } default { 'Info' } }
                    provider = $e.ProviderName
                    id = $e.Id
                    message = ($e.Message -replace "`r`n", ' ' -replace "`n", ' ').Substring(0, [math]::Min(200, ($e.Message -replace "`r`n", ' ' -replace "`n", ' ').Length))
                }
            }
        } catch {
            $result.byLog[$logName] = @{ error = $_.Exception.Message }
        }
    }

    # Sort providers by count
    $topProviders = $result.byProvider.GetEnumerator() |
        Sort-Object { $_.Value.count } -Descending |
        Select-Object -First 15 |
        ForEach-Object { @{ name = $_.Key; count = $_.Value.count; log = $_.Value.log } }

    # Severity assessment
    $severity = if ($result.totalCritical -gt 10 -or $result.totalErrors -gt 100) { 'High' }
                elseif ($result.totalCritical -gt 0 -or $result.totalErrors -gt 30) { 'Medium' }
                elseif ($result.totalErrors -gt 10 -or $result.totalWarnings -gt 50) { 'Low' }
                else { 'Clean' }

    $message = switch ($severity) {
        'High'   { "High error activity detected: $($result.totalCritical) critical, $($result.totalErrors) errors in last $DaysBack days." }
        'Medium' { "Moderate error activity: $($result.totalErrors) errors in last $DaysBack days." }
        'Low'    { "Low error activity: $($result.totalErrors) errors in last $DaysBack days." }
        'Clean'  { "No significant errors in the last $DaysBack days." }
    }

    Write-JsonResult @{
        success = $true
        severity = $severity
        totalCritical = $result.totalCritical
        totalErrors = $result.totalErrors
        totalWarnings = $result.totalWarnings
        byLog = $result.byLog
        topProviders = $topProviders
        recentErrors = $result.recentErrors
        message = $message
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
