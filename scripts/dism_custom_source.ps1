# dism_custom_source.ps1
# DISM /RestoreHealth using a custom source (Windows ISO / WIM / mounted install.wim).
# NEW - only DISM /RestoreHealth from Windows Update existed (fails when offline
# or when WU is broken).
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [Parameter(Mandatory=$true)]
    [string]$SourcePath,

    [int]$SourceIndex = 1
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

try {
    # Validate source path - must be a .wim, .esd, or mounted ISO folder.
    $resolved = (Resolve-Path $SourcePath -ErrorAction Stop).Path
    if (-not (Test-Path $resolved)) { throw "Source path not found: $resolved" }

    $isWim = $resolved -match '\.(wim|esd)$'
    $isDir = (Get-Item $resolved).PSIsContainer
    if (-not $isWim -and -not $isDir) {
        throw "Source must be a .wim/.esd file or a folder containing install.wim"
    }

    # Build the DISM command with /Source and /LimitAccess (don't use WU).
    if ($isWim) {
        $sourceArg = "/Source:wim:$resolved`:$SourceIndex"
    } else {
        $wimPath = Join-Path $resolved 'sources\install.wim'
        if (Test-Path $wimPath) {
            $sourceArg = "/Source:wim:$wimPath`:$SourceIndex"
        } else {
            $sourceArg = "/Source:$resolved"
        }
    }

    # DISM /RestoreHealth with custom source + /LimitAccess (no WU fallback).
    # Timeout: 60 min (custom source is slower than WU for large images).
    $r = Invoke-WithTimeout -FilePath 'DISM.exe' `
        -ArgumentList "/Online /Cleanup-Image /RestoreHealth $sourceArg /LimitAccess" `
        -TimeoutSec 3600

    Write-JsonResult @{
        success = ($r.ExitCode -eq 0)
        source = $resolved
        sourceIndex = $SourceIndex
        exitCode = $r.ExitCode
        output = ($r.StdOut -split "`n" | Select-Object -Last 20) -join "`n"
        message = if ($r.ExitCode -eq 0) {
            "DISM /RestoreHealth completed successfully using custom source."
        } else {
            "DISM /RestoreHealth failed with exit code $($r.ExitCode). Check dism.log."
        }
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message; source = $SourcePath } (Get-TimerElapsedSec $timer)
}
