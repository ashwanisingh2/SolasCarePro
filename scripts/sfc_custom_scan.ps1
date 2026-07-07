# sfc_custom_scan.ps1
# SFC scan for a specific file (sfc /scanfile) or verify a specific file
# (sfc /verifyfile). NEW - only full sfc /scannow existed before.
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('scanfile', 'verifyfile')]
    [string]$Action = 'scanfile',

    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

try {
    # Security: validate the file path is under System32, SysWOW64, or Windows.
    $resolved = (Resolve-Path $FilePath -ErrorAction Stop).Path
    $allowedRoots = @("$env:SystemRoot\System32", "$env:SystemRoot\SysWOW64", "$env:SystemRoot")
    $allowed = $false
    foreach ($root in $allowedRoots) {
        if ($resolved -like "$root\*") { $allowed = $true; break }
    }
    if (-not $allowed) {
        throw "Security: file must reside under $env:SystemRoot. Refused: $resolved"
    }

    if (-not (Test-Path $resolved)) {
        throw "File not found: $resolved"
    }

    $arg = if ($Action -eq 'scanfile') { '/scanfile' } else { '/verifyfile' }

    # SFC for a single file is much faster than full scan - 1-3 min typically.
    $r = Invoke-WithTimeout -FilePath 'sfc.exe' -ArgumentList "$arg `"$resolved`"" -TimeoutSec 600

    $output = $r.StdOut
    $result = 'Unknown'
    if ($output -match '(?i)did not find any integrity violations') { $result = 'Clean' }
    elseif ($output -match '(?i)successfully repaired') { $result = 'Repaired' }
    elseif ($output -match '(?i)could not be repaired|unable to repair') { $result = 'CannotRepair' }
    elseif ($output -match '(?i)found corrupt files') { $result = 'FoundCorrupt' }

    Write-JsonResult @{
        success = ($r.ExitCode -eq 0)
        action = $Action
        file = $resolved
        sfcResult = $result
        exitCode = $r.ExitCode
        message = switch ($result) {
            'Clean'        { "No integrity violations found in $resolved" }
            'Repaired'     { "SFC successfully repaired $resolved" }
            'CannotRepair' { "SFC could NOT repair $resolved. Run DISM /RestoreHealth first, then retry." }
            'FoundCorrupt' { "SFC found corruption in $resolved" }
            default        { "SFC completed with exit code $($r.ExitCode)" }
        }
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
