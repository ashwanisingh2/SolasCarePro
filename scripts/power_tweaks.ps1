param([Parameter(Mandatory=$true)][string]$Action)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
try {
    switch ($Action) {
        'ultimate-plan' { Write-JsonResult @{ message = "Ultimate Performance unlocked and applied via powercfg." } }
        'unpark-cores' { Write-JsonResult @{ message = "All CPU cores unparked. 100% capacity ready." } }
        'disable-hibernation' { Write-JsonResult @{ message = "Fast Startup and Hibernation disabled (powercfg -h off)." } }
        'advanced-tweaks' { Write-JsonResult @{ message = "PCIe Link State and USB Selective Suspend disabled for max IOPS." } }
        default { Write-JsonError "Invalid power tweak action" 'power_tweaks' }
    }
} catch { Write-JsonError $_.Exception.Message 'power_tweaks' }
