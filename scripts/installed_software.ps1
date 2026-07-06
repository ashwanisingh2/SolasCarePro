# installed_software.ps1
# Full installed software inventory from registry (all 3 Uninstall keys).
# Returns name, publisher, version, install date, size, uninstall command.
# NEW - only appwiz.cpl launch + winget upgradable list existed.
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $keys = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )

    $allApps = @()
    foreach ($key in $keys) {
        try {
            $apps = Get-ItemProperty $key -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -and -not $_.SystemComponent }
            foreach ($app in $apps) {
                $installDate = $null
                if ($app.InstallDate) {
                    try {
                        $installDate = [datetime]::ParseExact($app.InstallDate, 'yyyyMMdd', $null).ToString('yyyy-MM-dd')
                    } catch {
                        $installDate = $app.InstallDate
                    }
                }

                $sizeMB = $null
                if ($app.EstimatedSize) {
                    $sizeMB = [math]::Round($app.EstimatedSize / 1024, 1)
                }

                $allApps += [PSCustomObject]@{
                    Name = $app.DisplayName
                    Publisher = $app.Publisher
                    Version = $app.DisplayVersion
                    InstallDate = $installDate
                    SizeMB = $sizeMB
                    UninstallString = $app.UninstallString
                    QuietUninstallString = $app.QuietUninstallString
                    InstallLocation = $app.InstallLocation
                    URLInfoAbout = $app.URLInfoAbout
                    RegistryKey = $key -replace '\*$','' -replace 'HKLM:','HKLM\' -replace 'HKCU:','HKCU\'
                }
            }
        } catch {}
    }

    # Deduplicate by Name+Version (some apps appear in both HKLM and Wow6432Node)
    $unique = $allApps | Group-Object { "$($_.Name)|$($_.Version)" } | ForEach-Object { $_.Group[0] } | Sort-Object Name

    $totalSizeMB = ($unique | Where-Object { $_.SizeMB } | Measure-Object SizeMB -Sum).Sum
    $totalSizeGB = [math]::Round($totalSizeMB / 1024, 2)

    Write-JsonResult @{
        success = $true
        count = $unique.Count
        totalSizeGB = $totalSizeGB
        apps = $unique
        message = "Found $($unique.Count) installed applications (~$totalSizeGB GB)"
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message; apps = @() } (Get-TimerElapsedSec $timer)
}
