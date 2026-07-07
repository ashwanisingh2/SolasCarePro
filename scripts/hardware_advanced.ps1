param([Parameter(Mandatory=$true)][string]$Action)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
try {
    if ($Action -eq 'gpu') {
        $gpus = Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM, VideoProcessor, Status
        Write-Output ($gpus | ConvertTo-Json -Compress)
    } elseif ($Action -eq 'bios') {
        $bios = Get-CimInstance Win32_BIOS | Select-Object Manufacturer, Name, Version, ReleaseDate, SMBIOSBIOSVersion
        $board = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product, Version
        Write-JsonResult @{ bios = $bios; board = $board }
    } else {
        Write-JsonError "Invalid action" 'hardware_advanced'
    }
} catch {
    Write-JsonError $_.Exception.Message 'hardware_advanced'
}
