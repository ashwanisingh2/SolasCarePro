# driver_verifier.ps1
# Enables/disables Windows Driver Verifier for advanced BSOD diagnosis.
# Driver Verifier stresses drivers to catch bugs that cause blue screens.
# NEW - no equivalent existed.
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('enable-standard', 'enable-all', 'disable', 'status')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

try {
    switch ($Action) {
        'status' {
            # Query current verifier status.
            $r = Invoke-WithTimeout -FilePath 'verifier.exe' -ArgumentList '/query' -TimeoutSec 15
            $enabled = ($r.StdOut -and $r.StdOut -notmatch '(?i)no drivers are currently verified')
            $verifiedDrivers = @()
            if ($r.StdOut) {
                $verifiedDrivers = ($r.StdOut -split "`n" | Where-Object { $_ -match '\.sys' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
            }
            Write-JsonResult @{
                success = $true
                action = 'status'
                enabled = $enabled
                verifiedDriverCount = $verifiedDrivers.Count
                verifiedDrivers = $verifiedDrivers
                message = if ($enabled) { "Driver Verifier is ENABLED with $($verifiedDrivers.Count) driver(s) being monitored." } else { 'Driver Verifier is currently disabled.' }
            } (Get-TimerElapsedSec $timer)
        }

        'enable-standard' {
            # Enable standard flags on all non-Microsoft drivers (recommended for BSOD diagnosis).
            # Flags: 0x209BB = Special Pool, Force IRQL Checking, Pool Tracking, Force Pending I/O,
            #         IRP Logging, Deadlock Detection, Enhanced I/O Verification.
            $r = Invoke-WithTimeout -FilePath 'verifier.exe' -ArgumentList '/standard /driver' -TimeoutSec 60
            Write-JsonResult @{
                success = ($r.ExitCode -eq 0)
                action = 'enable-standard'
                exitCode = $r.ExitCode
                message = 'Driver Verifier enabled with standard flags on all third-party drivers. REBOOT REQUIRED for changes to take effect.'
                rebootRequired = $true
            } (Get-TimerElapsedSec $timer)
        }

        'enable-all' {
            # Enable on ALL drivers (including Microsoft) - very aggressive, will slow the system.
            $r = Invoke-WithTimeout -FilePath 'verifier.exe' -ArgumentList '/standard /driver *' -TimeoutSec 60
            Write-JsonResult @{
                success = ($r.ExitCode -eq 0)
                action = 'enable-all'
                exitCode = $r.ExitCode
                message = 'Driver Verifier enabled on ALL drivers (including Microsoft). System will be slow. REBOOT REQUIRED.'
                rebootRequired = $true
            } (Get-TimerElapsedSec $timer)
        }

        'disable' {
            # Disable Driver Verifier completely.
            $r = Invoke-WithTimeout -FilePath 'verifier.exe' -ArgumentList '/reset' -TimeoutSec 60
            Write-JsonResult @{
                success = ($r.ExitCode -eq 0)
                action = 'disable'
                exitCode = $r.ExitCode
                message = 'Driver Verifier disabled. REBOOT REQUIRED for changes to take effect.'
                rebootRequired = $true
            } (Get-TimerElapsedSec $timer)
        }
    }
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
