# get_drives_info.ps1
# IMPROVEMENT: opt-in switch to run real fragmentation analysis via `defrag /A`.
# Default is fast scan (no frag %). Pass -IncludeFragAnalysis for real numbers.
param(
    [switch]$IncludeFragAnalysis
)

# IMPROVEMENT: dot-source shared helpers (JSON output, timeout, OS version).
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'

$results = @()

function Get-DriveFragmentation {
    param([string]$DriveLetter)
    # Run `defrag <drive>: /A` (analysis only, no changes) with a 2-minute timeout.
    # SSDs on Win10+ report "Solid state drives don't need defragmentation" -
    # we return null for those (let the UI render "N/A").
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $r = Invoke-WithTimeout -FilePath 'defrag.exe' `
            -ArgumentList "$($DriveLetter): /A /V" -TimeoutSec 120
        if ($r.ExitCode -ne 0 -and $r.ExitCode -ne 1) {
            # Exit code 1 = "drive doesn't need defrag" (SSD or already clean)
            return $null
        }
        $out = $r.StdOut
        if ($out -match '(?i)do not need|solid state') { return $null }
        $fragPct = $null
        if ($out -match '(?i)fragmentation\s*[:\s]*([\d\.]+)\s*%') { $fragPct = [double]$Matches[1] }
        return $fragPct
    } catch {
        return $null
    } finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

try {
    $osMajor = Get-OSMajorVersion
    if ($osMajor -ge 10) {
        $volumes = Get-Volume -ErrorAction Stop | Where-Object { $_.DriveLetter }
        foreach ($vol in $volumes) {
            $letter = $vol.DriveLetter.ToString()
            $partition = $null
            try { $partition = Get-Partition -DriveLetter $letter -ErrorAction Stop } catch {}
            $mediaType = "Unspecified"
            if ($partition) {
                try {
                    $phys = Get-PhysicalDisk -DeviceID $partition.DiskNumber -ErrorAction Stop
                    if ($phys) { $mediaType = $phys.MediaType.ToString() }
                } catch {}
            }
            $fragBefore = $null
            if ($IncludeFragAnalysis -and $mediaType -ne 'SSD') {
                $fragBefore = Get-DriveFragmentation $letter
            }
            $results += [PSCustomObject]@{
                DriveLetter = $letter
                MediaType = $mediaType
                Size = $vol.Size
                FreeSpace = $vol.SizeRemaining
                FragBefore = $fragBefore
                FragAfter = $null
                FragAnalyzed = $IncludeFragAnalysis.IsPresent
            }
        }
    } else {
        # Windows 7 / 8 compatibility mode fallback
        $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction Stop
        foreach ($d in $disks) {
            $letter = $d.DeviceID.Replace(":", "")
            $fragBefore = $null
            if ($IncludeFragAnalysis) {
                $fragBefore = Get-DriveFragmentation $letter
            }
            $results += [PSCustomObject]@{
                DriveLetter = $letter
                MediaType = "Unknown"
                Size = $d.Size
                FreeSpace = $d.FreeSpace
                FragBefore = $fragBefore
                FragAfter = $null
                FragAnalyzed = $IncludeFragAnalysis.IsPresent
            }
        }
    }
} catch {
    Write-JsonError $_.Exception.Message 'get_drives_info'
    exit 0
}

Write-Output (ConvertTo-JsonArray $results)
