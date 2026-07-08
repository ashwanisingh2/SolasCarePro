param(
    [switch]$DryRun
)

. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

$bloatwareList = @(
    '*CandyCrush*',
    '*McAfee*',
    '*XboxApp*',
    '*ZuneVideo*',
    '*BingSports*',
    '*BingNews*',
    '*BingWeather*',
    '*BingFinance*',
    '*SkypeApp*',
    '*SolitaireCollection*'
)

try {
    $removed = @()
    foreach ($app in $bloatwareList) {
        $packages = Get-AppxPackage -Name $app -ErrorAction SilentlyContinue
        foreach ($pkg in $packages) {
            if (-not $DryRun) {
                Remove-AppxPackage -Package $pkg.PackageFullName -ErrorAction SilentlyContinue
            }
            $removed += $pkg.Name
        }
    }
    
    Write-JsonResult @{ success = $true; removed = $removed; count = $removed.Count; dryRun = $DryRun.IsPresent } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
