# repair_user_profile.ps1
# User profile repair - fixes corrupt profile symptoms by rebuilding caches
# and repairing permissions. NEW - no equivalent existed (repair-file-permissions
# only did icacls /verify, not actual fixes).
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('all', 'icon-cache', 'thumbnail-cache', 'font-cache', 'perms')]
    [string]$Action = 'all'
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

$steps = @()

function Repair-IconCache {
    # Kill explorer, delete IconCache.db and iconcache_*.db files, restart explorer.
    try {
        Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        $iconCache = "$env:LOCALAPPDATA\IconCache.db"
        if (Test-Path $iconCache) { Remove-Item $iconCache -Force -ErrorAction SilentlyContinue }
        Get-ChildItem "$env:LOCALAPPDATA" -Filter 'iconcache_*.db' -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue
        Start-Process explorer.exe
        return @{ step = 'icon-cache'; success = $true }
    } catch {
        return @{ step = 'icon-cache'; success = $false; error = $_.Exception.Message }
    }
}

function Repair-ThumbnailCache {
    try {
        Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter 'thumbcache_*.db' -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue
        Start-Process explorer.exe
        return @{ step = 'thumbnail-cache'; success = $true }
    } catch {
        return @{ step = 'thumbnail-cache'; success = $false; error = $_.Exception.Message }
    }
}

function Repair-FontCache {
    # Stop and restart the Windows Font Cache service; delete stale cache files.
    try {
        Stop-Service -Name FontCache3.0.0.0 -Force -ErrorAction SilentlyContinue
        Stop-Service -Name 'FontCache' -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Get-ChildItem "$env:Windows\ServiceProfiles\LocalService\AppData\Local\FontCache" -Filter '*.dat' -ErrorAction SilentlyContinue |
            Remove-Item -Force -ErrorAction SilentlyContinue
        Start-Service -Name 'FontCache' -ErrorAction SilentlyContinue
        Start-Service -Name FontCache3.0.0.0 -ErrorAction SilentlyContinue
        return @{ step = 'font-cache'; success = $true }
    } catch {
        return @{ step = 'font-cache'; success = $false; error = $_.Exception.Message }
    }
}

function Repair-ProfilePermissions {
    # Reset NTFS permissions on the user profile to defaults ( ProfilePath, /T = recursive).
    try {
        $profilePath = $env:USERPROFILE
        $r = Invoke-WithTimeout -FilePath 'icacls.exe' `
            -ArgumentList "`"$profilePath`" /reset /T /C /Q" -TimeoutSec 300
        # Reset inheritance
        $r2 = Invoke-WithTimeout -FilePath 'icacls.exe' `
            -ArgumentList "`"$profilePath`" /inheritance:e /T /C /Q" -TimeoutSec 300
        return @{ step = 'profile-perms'; success = ($r.ExitCode -eq 0 -and $r2.ExitCode -eq 0); exitCode = $r.ExitCode }
    } catch {
        return @{ step = 'profile-perms'; success = $false; error = $_.Exception.Message }
    }
}

try {
    switch ($Action) {
        'icon-cache'     { $steps += Repair-IconCache }
        'thumbnail-cache'{ $steps += Repair-ThumbnailCache }
        'font-cache'     { $steps += Repair-FontCache }
        'perms'          { $steps += Repair-ProfilePermissions }
        'all'            {
            $steps += Repair-IconCache
            $steps += Repair-ThumbnailCache
            $steps += Repair-FontCache
            $steps += Repair-ProfilePermissions
        }
    }

    $successCount = ($steps | Where-Object { $_.success }).Count
    $failCount = $steps.Count - $successCount

    Write-JsonResult @{
        success = ($failCount -eq 0)
        action = $Action
        steps = $steps
        successCount = $successCount
        failureCount = $failCount
        message = "User profile repair '$Action' completed. $successCount/$($steps.Count) steps succeeded."
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message; steps = $steps } (Get-TimerElapsedSec $timer)
}
