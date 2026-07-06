# health_score.ps1
# Calculates a numeric health score (0-100) based on system metrics.
# Extracted from generate_report.ps1 so the dashboard can show it live.
# NEW - no equivalent existed (score was only in the HTML report).
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $score = 100
    $breakdown = @()
    $issues = @()

    # 1. RAM usage
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / (1024*1024), 2)
    $ramFreeGB = [math]::Round($os.FreePhysicalMemory / (1024*1024), 2)
    $ramUsedGB = $ramTotalGB - $ramFreeGB
    $ramUsedPercent = if ($ramTotalGB -gt 0) { [math]::Round(($ramUsedGB / $ramTotalGB) * 100, 1) } else { 0 }
    if ($ramUsedPercent -gt 90) {
        $score -= 20; $issues += "Critical RAM usage: $ramUsedPercent%"
        $breakdown += @{ category = 'RAM'; status = 'critical'; value = $ramUsedPercent; penalty = 20 }
    } elseif ($ramUsedPercent -gt 80) {
        $score -= 10; $issues += "High RAM usage: $ramUsedPercent%"
        $breakdown += @{ category = 'RAM'; status = 'warning'; value = $ramUsedPercent; penalty = 10 }
    } else {
        $breakdown += @{ category = 'RAM'; status = 'good'; value = $ramUsedPercent; penalty = 0 }
    }

    # 2. Disk space on C:
    $cDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
    if ($cDrive -and $cDrive.Size -gt 0) {
        $cFreePercent = [math]::Round(($cDrive.FreeSpace / $cDrive.Size) * 100, 1)
        if ($cFreePercent -lt 5) {
            $score -= 20; $issues += "Critical disk space: only $cFreePercent% free on C:"
            $breakdown += @{ category = 'Disk Space'; status = 'critical'; value = $cFreePercent; penalty = 20 }
        } elseif ($cFreePercent -lt 15) {
            $score -= 10; $issues += "Low disk space: $cFreePercent% free on C:"
            $breakdown += @{ category = 'Disk Space'; status = 'warning'; value = $cFreePercent; penalty = 10 }
        } else {
            $breakdown += @{ category = 'Disk Space'; status = 'good'; value = $cFreePercent; penalty = 0 }
        }
    }

    # 3. Pending Windows Updates
    $pendingUpdates = 0
    try {
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $result = $searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingUpdates = $result.Updates.Count
        if ($pendingUpdates -gt 20) {
            $score -= 10; $issues += "$pendingUpdates pending Windows updates"
            $breakdown += @{ category = 'Windows Update'; status = 'warning'; value = $pendingUpdates; penalty = 10 }
        } else {
            $breakdown += @{ category = 'Windows Update'; status = 'good'; value = $pendingUpdates; penalty = 0 }
        }
    } catch {
        $breakdown += @{ category = 'Windows Update'; status = 'unknown'; value = $null; penalty = 0 }
    }

    # 4. Driver problems
    $badDrivers = 0
    try {
        $badDrivers = (Get-CimInstance Win32_PnPEntity -Filter "ConfigManagerErrorCode != 0" -ErrorAction SilentlyContinue).Count
        if ($badDrivers -gt 5) {
            $score -= 15; $issues += "$badDrivers problematic devices"
            $breakdown += @{ category = 'Drivers'; status = 'critical'; value = $badDrivers; penalty = 15 }
        } elseif ($badDrivers -gt 0) {
            $score -= 5; $issues += "$badDrivers problematic device(s)"
            $breakdown += @{ category = 'Drivers'; status = 'warning'; value = $badDrivers; penalty = 5 }
        } else {
            $breakdown += @{ category = 'Drivers'; status = 'good'; value = 0; penalty = 0 }
        }
    } catch {
        $breakdown += @{ category = 'Drivers'; status = 'unknown'; value = $null; penalty = 0 }
    }

    # 5. Recent error events (last 24h)
    $errorEvents = 0
    try {
        $errorEvents = (Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 100 -ErrorAction SilentlyContinue).Count
        if ($errorEvents -gt 50) {
            $score -= 10; $issues += "$errorEvents system errors in last 24h"
            $breakdown += @{ category = 'Error Events'; status = 'warning'; value = $errorEvents; penalty = 10 }
        } else {
            $breakdown += @{ category = 'Error Events'; status = 'good'; value = $errorEvents; penalty = 0 }
        }
    } catch {
        $breakdown += @{ category = 'Error Events'; status = 'unknown'; value = $null; penalty = 0 }
    }

    # 6. Disk SMART status
    try {
        $failingDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | Where-Object {
            $_.HealthStatus -ne 'Healthy' -or $_.OperationalStatus -ne 'OK'
        }).Count
        if ($failingDisks -gt 0) {
            $score -= 20; $issues += "$failingDisks disk(s) reporting health issues"
            $breakdown += @{ category = 'Disk Health'; status = 'critical'; value = $failingDisks; penalty = 20 }
        } else {
            $breakdown += @{ category = 'Disk Health'; status = 'good'; value = 0; penalty = 0 }
        }
    } catch {
        $breakdown += @{ category = 'Disk Health'; status = 'unknown'; value = $null; penalty = 0 }
    }

    # Clamp score
    $score = [math]::Max(0, [math]::Min(100, $score))

    # Determine overall status
    $status = if ($score -ge 85) { 'Excellent' }
              elseif ($score -ge 70) { 'Good' }
              elseif ($score -ge 50) { 'Fair' }
              else { 'Poor' }

    $statusColor = if ($score -ge 85) { '#34D399' }
                   elseif ($score -ge 70) { '#FBBF24' }
                   elseif ($score -ge 50) { '#F87171' }
                   else { '#DC2626' }

    Write-JsonResult @{
        success = $true
        score = $score
        status = $status
        statusColor = $statusColor
        breakdown = $breakdown
        issues = $issues
        issueCount = $issues.Count
        ramUsedPercent = $ramUsedPercent
        diskFreePercent = $cFreePercent
        pendingUpdates = $pendingUpdates
        badDrivers = $badDrivers
        errorEvents = $errorEvents
        message = "System health score: $score/100 ($status)"
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message; score = 0 } (Get-TimerElapsedSec $timer)
}
