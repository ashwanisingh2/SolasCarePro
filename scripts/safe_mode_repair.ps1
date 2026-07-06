# safe_mode_repair.ps1
# Configures Windows to boot into Safe Mode on next restart, optionally running
# a repair command. NEW - no equivalent existed.
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('configure', 'cancel', 'status')]
    [string]$Action = 'status',

    [string]$RepairCommand = ''
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

try {
    $bcdEditKey = 'HKLM:\SYSTEM\CurrentControlSet\Control\SafeBoot'

    switch ($Action) {
        'status' {
            # Check current safe mode configuration via bcdedit.
            $r = Invoke-WithTimeout -FilePath 'bcdedit.exe' -ArgumentList '/enum {current}' -TimeoutSec 15
            $safeboot = ($r.StdOut -match '(?i)safeboot')
            $minimal = ($r.StdOut -match '(?i)minimal')
            $network = ($r.StdOut -match '(?i)network')

            $mode = 'Normal'
            if ($safeboot -and $network) { $mode = 'SafeModeWithNetworking' }
            elseif ($safeboot -and $minimal) { $mode = 'SafeMode' }

            Write-JsonResult @{
                success = $true
                action = 'status'
                mode = $mode
                message = "Current boot mode: $mode"
            } (Get-TimerElapsedSec $timer)
        }

        'configure' {
            # Configure Safe Mode boot using bcdedit /set safeboot minimal|network.
            # We use 'minimal' (standard Safe Mode) - user can change to 'network' if needed.
            $r = Invoke-WithTimeout -FilePath 'bcdedit.exe' -ArgumentList '/set {current} safeboot minimal' -TimeoutSec 15
            if ($r.ExitCode -ne 0) {
                throw "bcdedit failed: $($r.StdErr)"
            }

            # If a repair command was specified, set it to run once on next boot
            # via the RunOnce registry key.
            $runOnceSet = $false
            if ($RepairCommand) {
                try {
                    $runOnceKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
                    Set-ItemProperty -Path $runOnceKey -Name 'SolasSafeModeRepair' -Value $RepairCommand -Type String -ErrorAction Stop
                    $runOnceSet = $true
                } catch {
                    # Non-fatal - safe mode is still configured.
                }
            }

            Write-JsonResult @{
                success = $true
                action = 'configure'
                mode = 'SafeMode'
                repairCommand = $RepairCommand
                runOnceSet = $runOnceSet
                message = "Windows configured to boot into Safe Mode on next restart" + $(if($runOnceSet){'. Repair command will run automatically on boot.'}else{'.'})
                rebootRequired = $true
            } (Get-TimerElapsedSec $timer)
        }

        'cancel' {
            # Remove safe boot configuration.
            $r = Invoke-WithTimeout -FilePath 'bcdedit.exe' -ArgumentList '/deletevalue {current} safeboot' -TimeoutSec 15
            $deleted = ($r.ExitCode -eq 0)

            # Also clear RunOnce entry if present.
            try {
                $runOnceKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce'
                Remove-ItemProperty -Path $runOnceKey -Name 'SolasSafeModeRepair' -ErrorAction SilentlyContinue
            } catch {}

            Write-JsonResult @{
                success = $deleted
                action = 'cancel'
                message = if ($deleted) { 'Safe Mode boot configuration cancelled. Next boot will be normal.' } else { 'No Safe Mode configuration found.' }
            } (Get-TimerElapsedSec $timer)
        }
    }
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
