# parse_dism_log.ps1
# Parses C:\Windows\Logs\DISM\dism.log to extract errors, warnings, and repair
# outcomes from the last DISM operation. NEW - no equivalent existed.
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $dismLog = "$env:SystemRoot\Logs\DISM\dism.log"
    if (-not (Test-Path $dismLog)) {
        Write-JsonResult @{ success = $false; error = 'dism.log not found. Run DISM first.'; errors = @(); warnings = @() } (Get-TimerElapsedSec $timer)
        exit 0
    }

    # Read last 5000 lines (DISM log can be very large)
    $lines = Get-Content $dismLog -Tail 5000 -ErrorAction Stop

    $errors = @()
    $warnings = @()
    $info = @()
    $lastOperation = $null

    foreach ($line in $lines) {
        # DISM log format: [Timestamp] [Severity] [Source] Message
        # Severity levels: Error, Warning, Info
        if ($line -match '(?i)\[Error\]') {
            $msg = ($line -replace '^\[[^\]]+\]\s*\[Error\]\s*', '').Trim()
            if ($msg) { $errors += $msg }
        }
        elseif ($line -match '(?i)\[Warning\]') {
            $msg = ($line -replace '^\[[^\]]+\]\s*\[Warning\]\s*', '').Trim()
            if ($msg) { $warnings += $msg }
        }
        elseif ($line -match '(?i)(Repairing|Restoring|Successfully|completed|Operation complete)') {
            $msg = ($line -replace '^\[[^\]]+\]\s*\[Info\]\s*', '').Trim()
            if ($msg) { $info += $msg }
        }

        # Track the last operation type
        if ($line -match '(?i)Starting (RestoreHealth|ScanHealth|Cleanup|StartComponentCleanup)') {
            $lastOperation = $Matches[1]
        }
    }

    # Determine overall outcome
    $outcome = 'Unknown'
    if ($info | Where-Object { $_ -match '(?i)successfully|completed|Operation complete' }) {
        $outcome = if ($errors.Count -gt 0) { 'CompletedWithErrors' } else { 'Success' }
    }
    elseif ($errors.Count -gt 0) {
        $outcome = 'Failed'
    }

    Write-JsonResult @{
        success = $true
        lastOperation = $lastOperation
        outcome = $outcome
        errorCount = $errors.Count
        warningCount = $warnings.Count
        errors = $errors | Select-Object -Last 20
        warnings = $warnings | Select-Object -Last 20
        info = $info | Select-Object -Last 10
        message = switch ($outcome) {
            'Success'             { "DISM $lastOperation completed successfully." }
            'CompletedWithErrors' { "DISM $lastOperation completed with $($errors.Count) error(s)." }
            'Failed'              { "DISM $lastOperation failed with $($errors.Count) error(s)." }
            default               { 'Could not determine DISM outcome.' }
        }
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message; errors = @() } (Get-TimerElapsedSec $timer)
}
