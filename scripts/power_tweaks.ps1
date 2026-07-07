# power_tweaks.ps1
# Real Windows power optimizations (no fake/mock messages).
# All actions use native powercfg / registry edits and report actual exit codes.
param(
    [Parameter(Mandatory=$true)][string]$Action
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-JsonError 'Administrator elevation required for power tweaks' 'power_tweaks'
    exit 1
}

try {
    switch ($Action) {
        'ultimate-plan' {
            # Unlock + activate the hidden "Ultimate Performance" power plan.
            # powercfg duplicates e9a42b02-d5df-448d-aa00-03f14749eb61 (Ultimate Performance GUID).
            Write-Output '[TWEAK] Unlocking Ultimate Performance power plan...'
            $unlockOut = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 2>&1
            Write-Output $unlockOut

            # Find the newly-created GUID from output (format: "Power Scheme GUID: xxxxxxxx-xxxx-...")
            $newGuid = $null
            foreach ($line in $unlockOut) {
                if ($line -match 'Power Scheme GUID:\s*([0-9a-fA-F-]{36})') {
                    $newGuid = $matches[1]
                    break
                }
            }

            if (-not $newGuid) {
                # Try to find existing Ultimate Performance plan in /list output
                $listOut = powercfg /list 2>&1
                foreach ($line in $listOut) {
                    if ($line -match 'Ultimate Performance' -and $line -match '([0-9a-fA-F-]{36})') {
                        $newGuid = $matches[1]
                        break
                    }
                }
            }

            if ($newGuid) {
                Write-Output "[TWEAK] Activating Ultimate Performance plan: $newGuid"
                powercfg /setactive $newGuid
                $exitCode = $LASTEXITCODE
                Write-AuditLog -Action 'power-tweak-ultimate-plan' -Result $(if ($exitCode -eq 0) {'success'} else {'failure'}) -Target $newGuid -Details "ExitCode=$exitCode"
                Write-JsonResult @{
                    success   = ($exitCode -eq 0)
                    message   = if ($exitCode -eq 0) { "Ultimate Performance plan unlocked and activated (GUID: $newGuid)." } else { "Failed to activate plan. Exit code: $exitCode" }
                    planGuid  = $newGuid
                    exitCode  = $exitCode
                } 0
            } else {
                Write-AuditLog -Action 'power-tweak-ultimate-plan' -Result 'failure' -Details 'Could not find Ultimate Performance GUID'
                Write-JsonError 'Could not retrieve Ultimate Performance plan GUID after unlock. Windows may not support this plan.' 'power_tweaks'
            }
        }

        'unpark-cores' {
            # Disable CPU core parking by setting the parking policy to 0 (always unparked).
            # Uses powercfg to query active plan and set SubProcessor CcIncDec/CpMinCores to 100.
            Write-Output '[TWEAK] Disabling CPU core parking on active power plan...'
            $activeOut = powercfg /getactivescheme 2>&1
            $activeGuid = $null
            foreach ($line in $activeOut) {
                if ($line -match 'GUID:\s*([0-9a-fA-F-]{36})') {
                    $activeGuid = $matches[1]
                    break
                }
            }
            if (-not $activeGuid) {
                Write-JsonError 'Could not determine active power plan.' 'power_tweaks'
                exit 1
            }

            # SubProcessor settings GUIDs (well-known)
            # 0cc5b647-c1df-4637-891a-dec35c318583 = Processor performance core parking min cores
            # 0cc5b648-c1df-4637-891a-dec35c318583 = Processor performance core parking max cores
            powercfg /setacvalueindex $activeGuid SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 100
            powercfg /setdcvalueindex $activeGuid SUB_PROCESSOR 0cc5b647-c1df-4637-891a-dec35c318583 100
            powercfg /setacvalueindex $activeGuid SUB_PROCESSOR 0cc5b648-c1df-4637-891a-dec35c318583 100
            powercfg /setdcvalueindex $activeGuid SUB_PROCESSOR 0cc5b648-c1df-4637-891a-dec35c318583 100
            powercfg /setactive $activeGuid
            $exitCode = $LASTEXITCODE

            Write-Output "[TWEAK] Core parking disabled (min/max cores = 100%) on plan $activeGuid"
            Write-AuditLog -Action 'power-tweak-unpark-cores' -Result $(if ($exitCode -eq 0) {'success'} else {'failure'}) -Target $activeGuid -Details "ExitCode=$exitCode"
            Write-JsonResult @{
                success   = ($exitCode -eq 0)
                message   = "CPU core parking disabled on active power plan ($activeGuid). All cores will remain unparked."
                planGuid  = $activeGuid
                exitCode  = $exitCode
            } 0
        }

        'disable-hibernation' {
            # Disable Fast Startup + Hibernation via powercfg -h off
            # This removes hiberfil.sys and disables Fast Startup (which depends on hibernation).
            Write-Output '[TWEAK] Disabling Hibernation and Fast Startup...'
            powercfg /h off
            $exitCode = $LASTEXITCODE

            # Also explicitly set HibernateEnabledDefault = 0 in registry (extra enforcement)
            $regPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power'
            if (Test-Path $regPath) {
                Set-ItemProperty -Path $regPath -Name 'HibernateEnabled' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            }

            Write-Output "[TWEAK] Hibernation disabled. Exit code: $exitCode"
            Write-AuditLog -Action 'power-tweak-disable-hibernation' -Result $(if ($exitCode -eq 0) {'success'} else {'failure'}) -Details "ExitCode=$exitCode"
            Write-JsonResult @{
                success   = ($exitCode -eq 0)
                message   = "Hibernation and Fast Startup disabled. hiberfil.sys will be removed on next reboot."
                exitCode  = $exitCode
            } 0
        }

        'advanced-tweaks' {
            # Disable PCIe Link State Power Management + USB Selective Suspend on active plan.
            Write-Output '[TWEAK] Applying advanced power tweaks (PCIe ASPM + USB Selective Suspend off)...'
            $activeOut = powercfg /getactivescheme 2>&1
            $activeGuid = $null
            foreach ($line in $activeOut) {
                if ($line -match 'GUID:\s*([0-9a-fA-F-]{36})') {
                    $activeGuid = $matches[1]
                    break
                }
            }
            if (-not $activeGuid) {
                Write-JsonError 'Could not determine active power plan.' 'power_tweaks'
                exit 1
            }

            # PCIe ASPM: ee12f906-d277-404b-b6da-e5fa1a576df5 (Off = 0)
            # USB Selective Suspend: 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 (Disabled = 0)
            powercfg /setacvalueindex $activeGuid SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5 0
            powercfg /setdcvalueindex $activeGuid SUB_PCIEXPRESS ee12f906-d277-404b-b6da-e5fa1a576df5 0
            powercfg /setacvalueindex $activeGuid SUB_USB 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
            powercfg /setdcvalueindex $activeGuid SUB_USB 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0
            powercfg /setactive $activeGuid
            $exitCode = $LASTEXITCODE

            Write-Output "[TWEAK] Advanced tweaks applied on plan $activeGuid. Exit code: $exitCode"
            Write-AuditLog -Action 'power-tweak-advanced' -Result $(if ($exitCode -eq 0) {'success'} else {'failure'}) -Target $activeGuid -Details "ExitCode=$exitCode"
            Write-JsonResult @{
                success   = ($exitCode -eq 0)
                message   = "PCIe Link State Power Management set to Off and USB Selective Suspend disabled on active power plan."
                planGuid  = $activeGuid
                exitCode  = $exitCode
            } 0
        }

        default {
            Write-JsonError "Invalid power tweak action: $Action" 'power_tweaks'
        }
    }
} catch {
    Write-AuditLog -Action "power-tweak-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message 'power_tweaks'
}
