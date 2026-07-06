# repair_boot.ps1
# Boot sector / MBR / BCD repair. NEW - existing code only had bcdedit /enum all,
# bootrec /scanos, and bootrec /rebuildbcd. This script adds the missing /fixmbr
# and /fixboot operations, and a full "repair-all" sequence with proper reporting.
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('fixmbr', 'fixboot', 'rebuildbcd', 'scanos', 'repair-all')]
    [string]$Action = 'repair-all'
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

try {
    $steps = @()

    switch ($Action) {
        'fixmbr' {
            # Writes a new MBR compatible with the current Windows installation.
            # Required when a non-Windows bootloader (GRUB, etc.) overwrote the MBR.
            $r = Invoke-WithTimeout -FilePath 'bootrec.exe' -ArgumentList '/fixmbr' -TimeoutSec 60
            $steps += @{ step = 'fixmbr'; exitCode = $r.ExitCode; stderr = $r.StdErr }
        }
        'fixboot' {
            # Writes a new boot sector to the system partition.
            # Required when the boot sector is corrupt (BOOTMGR is missing/ corrupt).
            $r = Invoke-WithTimeout -FilePath 'bootrec.exe' -ArgumentList '/fixboot' -TimeoutSec 60
            $steps += @{ step = 'fixboot'; exitCode = $r.ExitCode; stderr = $r.StdErr }
        }
        'rebuildbcd' {
            # Scans all disks for Windows installations and adds them to the BCD store.
            # Required when the Boot Configuration Data store is missing/corrupt.
            $r = Invoke-WithTimeout -FilePath 'bootrec.exe' -ArgumentList '/rebuildbcd' -TimeoutSec 120
            $steps += @{ step = 'rebuildbcd'; exitCode = $r.ExitCode; stdout = $r.StdOut }
        }
        'scanos' {
            # Scans all disks for installations compatible with Windows.
            $r = Invoke-WithTimeout -FilePath 'bootrec.exe' -ArgumentList '/scanos' -TimeoutSec 120
            $steps += @{ step = 'scanos'; exitCode = $r.ExitCode; stdout = $r.StdOut }
        }
        'repair-all' {
            # Full sequence: fixmbr -> fixboot -> scanos -> rebuildbcd
            foreach ($arg in @('/fixmbr', '/fixboot', '/scanos', '/rebuildbcd')) {
                $timeout = if ($arg -eq '/rebuildbcd' -or $arg -eq '/scanos') { 120 } else { 60 }
                $r = Invoke-WithTimeout -FilePath 'bootrec.exe' -ArgumentList $arg -TimeoutSec $timeout
                $steps += @{ step = $arg.TrimStart('/'); exitCode = $r.ExitCode; stdout = ($r.StdOut -join ' ').Trim() }
                # Don't abort on individual step failure - continue with the rest.
            }
        }
    }

    $allOk = $true
    foreach ($s in $steps) { if ($s.exitCode -ne 0) { $allOk = $false; break } }

    Write-JsonResult @{
        success = $allOk
        action = $Action
        steps = $steps
        message = if ($allOk) { "Boot repair '$Action' completed successfully." } else { "Boot repair '$Action' completed with one or more step failures - check step exit codes." }
        rebootRequired = $true
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
