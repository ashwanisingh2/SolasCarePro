# pre_repair_health_check.ps1
# Pre-repair health check - verifies the system is in a safe state to run repairs.
# Returns warnings (not blockers) and blockers (must-fix before proceeding).
# NEW - no equivalent existed; repairs ran without pre-flight checks.
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $warnings = @()
    $blockers = @()

    # 1. Disk space check - DISM cleanup needs 10GB+; SFC needs 1GB+ for temp.
    $sysDrive = (Get-Location).Drive.Name + ':'
    if (-not $sysDrive) { $sysDrive = 'C:' }
    try {
        $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$sysDrive'" -ErrorAction Stop
        $freeGB = [math]::Round($drive.FreeSpace / 1GB, 2)
        if ($freeGB -lt 1) {
            $blockers += "Disk space critically low: ${freeGB} GB free on ${sysDrive}. Repairs require at least 1 GB."
        } elseif ($freeGB -lt 5) {
            $warnings += "Low disk space: ${freeGB} GB free on ${sysDrive}. DISM cleanup may fail; recommend 10 GB+."
        }
    } catch {
        $warnings += "Could not check disk space: $($_.Exception.Message)"
    }

    # 2. Battery check (laptops only) - long repairs can drain battery mid-operation.
    try {
        $battery = Get-CimInstance -ClassName Win32_Battery -ErrorAction Stop
        if ($battery -and $battery.BatteryStatus -ne 2) {
            # BatteryStatus 2 = AC Powered
            $charge = $battery.EstimatedChargeRemaining
            if ($charge -lt 30) {
                $warnings += "Battery low: ${charge}%. Long repairs (SFC, DISM) may drain battery. Plug in AC adapter."
            } elseif ($charge -lt 50) {
                $warnings += "Battery at ${charge}%. Consider plugging in AC adapter for long repairs."
            }
        }
    } catch {
        # Desktop machines have no battery - silently ignore.
    }

    # 3. Network connectivity - some repairs (DISM /RestoreHealth, Windows Update) need internet.
    try {
        $r = Invoke-WithTimeout -FilePath 'powershell.exe' `
            -ArgumentList '-NoProfile -Command "Test-NetConnection -ComputerName www.microsoft.com -Port 443 -InformationLevel Quiet"' `
            -TimeoutSec 15
        $online = ($r.ExitCode -eq 0)
        if (-not $online) {
            $warnings += 'No network connectivity. DISM /RestoreHealth from Windows Update will fail; SFC will still work offline.'
        }
    } catch {
        $warnings += 'Could not verify network connectivity.'
    }

    # 4. Pending reboot - SFC/DISM results are unreliable if a reboot is pending.
    try {
        $pendingReboot = $false
        $pendingKeys = @(
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
            'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired',
            'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations'
        )
        foreach ($k in $pendingKeys) {
            if (Test-Path $k) { $pendingReboot = $true; break }
        }
        if ($pendingReboot) {
            $warnings += 'A system reboot is pending. SFC/DISM may report inaccurate results. Reboot before trusting repair output.'
        }
    } catch {}

    # 5. Windows Update service state - some repairs depend on it.
    try {
        $wuSvc = Get-Service -Name wuauserv -ErrorAction SilentlyContinue
        if ($wuSvc -and $wuSvc.Status -ne 'Running') {
            $warnings += "Windows Update service (wuauserv) is $($wuSvc.Status). DISM /RestoreHealth from WU may fail."
        }
    } catch {}

    # 6. System Restore status - warn if disabled (no safety net for repairs).
    try {
        $srStatus = Get-ComputerRestorePoint -ErrorAction SilentlyContinue
        if (-not $srStatus) {
            $warnings += 'No system restore points found. Repairs cannot be rolled back if something goes wrong.'
        }
    } catch {}

    # 7. Recent BSOD check - if BSOD happened in last 24h, repairs may not be the right tool.
    try {
        $bsodEvents = Get-WinEvent -FilterHashtable @{ LogName='System'; Id=1001; StartTime=(Get-Date).AddHours(-24) } -MaxEvents 1 -ErrorAction SilentlyContinue
        if ($bsodEvents) {
            $warnings += 'A blue screen (BugCheck) occurred in the last 24 hours. Consider analyzing the BSOD before running repairs.'
        }
    } catch {}

    $canProceed = $blockers.Count -eq 0

    Write-JsonResult @{
        success = $true
        canProceed = $canProceed
        blockers = $blockers
        warnings = $warnings
        diskFreeGB = $freeGB
        online = $online
        pendingReboot = $pendingReboot
        message = if ($canProceed) {
            if ($warnings.Count -gt 0) { "Pre-repair check passed with $($warnings.Count) warning(s)." } else { 'Pre-repair check passed - all clear.' }
        } else {
            "Pre-repair check FAILED with $($blockers.Count) blocker(s). Resolve them before proceeding."
        }
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; canProceed = $true; error = $_.Exception.Message; warnings = @('Pre-check itself failed - proceeding anyway.'); blockers = @() } (Get-TimerElapsedSec $timer)
}
