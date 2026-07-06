# parse_cbs_log.ps1
# Parses C:\Windows\Logs\CBS\CBS.log to extract corrupt/repairable files reported
# by SFC and DISM. NEW - no equivalent existed; users had to manually read CBS.log.
# Returns the list of files SFC could not repair, plus a summary.
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $cbsLog = "$env:SystemRoot\Logs\CBS\CBS.log"
    if (-not (Test-Path $cbsLog)) {
        Write-JsonResult @{ success = $false; error = 'CBS.log not found. Run SFC first.'; corruptFiles = @() } (Get-TimerElapsedSec $timer)
        exit 0
    }

    # Read last 5000 lines (CBS.log can be huge - we don't want to load 100MB into memory)
    $lines = Get-Content $cbsLog -Tail 5000 -ErrorAction Stop

    # SFC writes lines like:
    #   "Cannot repair member file ... [l:36{18}]"test.txt" of test, Version 1.0"
    #   "Repairing file: C:\Windows\System32\..."
    #   "Not fixing file ..." (when source is missing)
    # The corruption markers are usually: "Cannot repair" / "could not be repaired" / "corrupt"
    $corruptFiles = @()
    $repairAttempts = @()
    $repairFailures = @()

    foreach ($line in $lines) {
        # Extract file paths from "Cannot repair" lines
        if ($line -match '(?i)cannot repair member file.*?"([^"]+)"') {
            $corruptFiles += $Matches[1]
        }
        elseif ($line -match '(?i)could not be repaired') {
            # Capture the surrounding context
            if ($line -match '"([^"]+\.\w+)"') { $repairFailures += $Matches[1] }
        }
        elseif ($line -match '(?i)repairing (member )?file.*?"([^"]+)"') {
            $repairAttempts += $Matches[2]
        }
        elseif ($line -match '(?i)not fixing (member )?file.*?"([^"]+)"') {
            $repairFailures += $Matches[2]
        }
    }

    # Deduplicate
    $corruptFiles = $corruptFiles | Select-Object -Unique
    $repairAttempts = $repairAttempts | Select-Object -Unique
    $repairFailures = $repairFailures | Select-Object -Unique

    # Determine overall SFC outcome by looking for the final summary line
    $sfcResult = 'Unknown'
    foreach ($line in $lines) {
        if ($line -match '(?i)Windows Resource Protection found (integrity violations|corrupt files)') { $sfcResult = 'FoundCorrupt' }
        elseif ($line -match '(?i)Windows Resource Protection found corrupt files but was unable to fix') { $sfcResult = 'FoundButCannotFix' }
        elseif ($line -match '(?i)Windows Resource Protection did not find any integrity violations') { $sfcResult = 'Clean' }
        elseif ($line -match '(?i)Windows Resource Protection successfully repaired') { $sfcResult = 'Repaired' }
    }

    Write-JsonResult @{
        success = $true
        sfcResult = $sfcResult
        corruptFilesFound = $corruptFiles
        repairAttempts = $repairAttempts
        unrepairedFiles = $repairFailures
        corruptCount = $corruptFiles.Count
        unrepairedCount = $repairFailures.Count
        message = switch ($sfcResult) {
            'Clean'              { 'No integrity violations found.' }
            'Repaired'           { "SFC successfully repaired $($repairAttempts.Count) file(s)." }
            'FoundButCannotFix'  { "SFC found $($corruptFiles.Count) corrupt file(s) but could NOT repair them. Run DISM /RestoreHealth, then re-run SFC." }
            'FoundCorrupt'       { "SFC found $($corruptFiles.Count) corrupt file(s)." }
            default              { 'Could not determine SFC outcome from CBS.log. SFC may not have run yet.' }
        }
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message; corruptFilesFound = @() } (Get-TimerElapsedSec $timer)
}
