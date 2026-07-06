# run_trim.ps1
param (
    [ValidatePattern('^[A-Za-z]$')]
    [string]$Drive = "C"
)

# IMPROVEMENT: dot-source shared helpers (JSON output, timeout, timing).
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    Assert-Admin

    $Drive = $Drive.ToUpper()
    $status = @{ drive = "${Drive}:"; steps = @() }

    # 1. Verify and enable TRIM support if disabled
    $status.steps += 'checking-trim-status'
    $notify = fsutil behavior query DisableDeleteNotify 2>&1 | Out-String
    $trimWasEnabled = -not ($notify -match "= 1")
    if (-not $trimWasEnabled) {
        fsutil behavior set DisableDeleteNotify 0 | Out-Null
        $status.trimEnabledNow = $true
    } else {
        $status.trimEnabledNow = $false
    }

    # 2. Run ReTrim optimization based on OS Version.
    # IMPROVEMENT: hard 10-minute timeout so a hung Optimize-Volume doesn't
    # block the parent process forever (especially when run via scheduled task).
    $osMajor = Get-OSMajorVersion
    $status.osMajor = $osMajor

    if ($osMajor -lt 10) {
        # Windows 7 / 8 SP1: defrag /L command triggers TRIM
        $status.steps += 'trim-legacy-defrag'
        $r = Invoke-WithTimeout -FilePath 'defrag.exe' -ArgumentList "$($Drive): /L /V" -TimeoutSec 600
        if ($r.ExitCode -ne 0) {
            throw "defrag.exe /L exited with code $($r.ExitCode). Stderr: $($r.StdErr)"
        }
    } else {
        # Windows 10/11: Optimize-Volume -ReTrim
        $status.steps += 'trim-optimize-volume'
        $r = Invoke-WithTimeout -FilePath 'powershell.exe' `
            -ArgumentList "-NoProfile -Command `"Optimize-Volume -DriveLetter $Drive -ReTrim -Verbose -ErrorAction Stop`"" `
            -TimeoutSec 600
        if ($r.ExitCode -ne 0) {
            throw "Optimize-Volume exited with code $($r.ExitCode). StdErr: $($r.StdErr)"
        }
    }

    $status.steps += 'completed'
    Write-JsonResult @{
        success = $true
        drive = "${Drive}:"
        trimWasAlreadyEnabled = $trimWasEnabled
        steps = $status.steps
        message = "Volume TRIM optimization completed on ${Drive}:"
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{
        success = $false
        drive = "${Drive}:"
        error = $_.Exception.Message
    } (Get-TimerElapsedSec $timer)
    exit 1
}
