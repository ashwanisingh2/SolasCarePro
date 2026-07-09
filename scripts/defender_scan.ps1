. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    Start-MpScan -ScanType QuickScan -ErrorAction Stop
    Write-JsonResult @{ success = $true; message = 'Quick scan completed successfully.' } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
