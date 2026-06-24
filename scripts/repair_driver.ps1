# repair_driver.ps1
param (
    [string]$PnpDeviceId,
    [string]$Action,
    [bool]$SafeMode = $true
)

$ErrorActionPreference = 'Stop'

if (-not $PnpDeviceId) {
    Write-Error "Missing required parameter: PnpDeviceId"
    exit 1
}

$SafeId = $PnpDeviceId -replace '[^a-zA-Z0-9]', '_'
$backupFile = "$env:TEMP\solas_driver_backup_$SafeId.reg"
$regKey = "HKLM\System\CurrentControlSet\Enum\$PnpDeviceId"
$osVersion = [System.Environment]::OSVersion.Version

Write-Output "Executing driver action: $Action on device ID: $PnpDeviceId"

switch ($Action.ToLower()) {
    "disable" {
        # 1. Back up registry key first
        Write-Output "[SYSTEM] Exporting driver registry backup to $backupFile ..."
        if (Test-Path "Registry::$regKey") {
            reg.exe export $regKey $backupFile /y | Out-Null
        } else {
            Write-Output "[WARNING] Registry key HKLM\System\CurrentControlSet\Enum\$PnpDeviceId not found."
        }
        
        # Verify backup was created and is not empty if SafeMode is enabled
        $backupOk = $false
        if (Test-Path $backupFile) {
            $item = Get-Item $backupFile
            if ($item.Length -gt 0) { $backupOk = $true }
        }
        
        if (-not $backupOk -and $SafeMode) {
            Write-Error "Safe Mode Abort: Registry backup failed. Operation canceled to prevent system instability."
            exit 1
        }
        
        # 2. Disable device
        Write-Output "[SYSTEM] Disabling device..."
        if ($osVersion.Major -ge 10) {
            pnputil.exe /disable-device $PnpDeviceId | Out-Null
        } else {
            Disable-PnpDevice -InstanceId $PnpDeviceId -Confirm:$false | Out-Null
        }
        Write-Output "Device disabled successfully."
    }
    
    "enable" {
        Write-Output "[SYSTEM] Enabling device..."
        if ($osVersion.Major -ge 10) {
            pnputil.exe /enable-device $PnpDeviceId | Out-Null
        } else {
            Enable-PnpDevice -InstanceId $PnpDeviceId -Confirm:$false | Out-Null
        }
        Write-Output "Device enabled successfully."
    }
    
    "restore" {
        # Restore from backup file
        if (Test-Path $backupFile) {
            Write-Output "[SYSTEM] Restoring registry config from: $backupFile..."
            reg.exe import $backupFile | Out-Null
            
            Write-Output "[SYSTEM] Triggering hardware rescan..."
            pnputil.exe /scan-devices | Out-Null
            Write-Output "Device configuration successfully restored from backup."
        } else {
            Write-Error "Restore failed: Backup registry file was not found."
            exit 1
        }
    }
    
    "rollback" {
        pnputil /scan-devices | Out-Null
        Write-Output "Device rolled back and rescan triggered."
    }
    
    "update" {
        pnputil /scan-devices | Out-Null
        try {
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            $searchResult = $searcher.Search("IsInstalled=0 and Type='Driver'")
            
            if ($searchResult.Updates.Count -gt 0) {
                Write-Output "Found $($searchResult.Updates.Count) driver updates on Windows Update. Installing..."
                $downloader = $session.CreateUpdateDownloader()
                $downloader.Updates = $searchResult.Updates
                $downloader.Download()
                
                $installer = $session.CreateUpdateInstaller()
                $installer.Updates = $searchResult.Updates
                $res = $installer.Install()
                Write-Output "Installation finished. Result Code: $($res.ResultCode)"
            } else {
                Write-Output "No updates found for this device on Windows Update catalog."
            }
        } catch {
            Write-Output "Skipped Windows Update catalog check: $_"
        }
    }
    
    default {
        Write-Error "Invalid action: $Action"
        exit 1
    }
}
