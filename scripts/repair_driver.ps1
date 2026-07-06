# repair_driver.ps1
param (
    [string]$PnpDeviceId,
    [ValidateSet('disable','enable','restore','rollback','update','')]
    [string]$Action,
    [bool]$SafeMode = $true
)

$ErrorActionPreference = 'Stop'

if (-not $PnpDeviceId) {
    # Emit a JSON error object instead of Write-Error (which goes to stderr
    # and leaves the app's stdout parser with nothing to parse).
    Write-Output '{"success":false,"error":"Missing required parameter: PnpDeviceId"}'
    exit 1
}

# Fix: $Action.ToLower() throws NullReferenceException when $Action is empty.
# Validate explicitly first, and use a defensive null-coalesce.
if (-not $Action) {
    Write-Output '{"success":false,"error":"Missing required parameter: Action"}'
    exit 1
}

# Validate PnpDeviceId format to prevent WQL/reg.exe/pnputil injection.
# Real PnP IDs only contain alphanumerics, backslash, ampersand, underscore, dot, hyphen.
if ($PnpDeviceId -notmatch '^[A-Za-z0-9\\&_\.\-]+$') {
    Write-Output '{"success":false,"error":"Invalid PnpDeviceId format"}'
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
        Write-Output "[SYSTEM] Triggering driver rollback and hardware rescan..."
        pnputil.exe /scan-devices | Out-Null
        Write-Output "Device rolled back and rescan triggered."
    }
    
    "update" {
        Write-Output "[SYSTEM] Initiating driver search, download, and update for device: $PnpDeviceId..."
        
        # Method 1: Using pnputil /update-device (Win 10/11 native, robust)
        try {
            Write-Output "[SYSTEM] Triggering pnputil update-device..."
            $pnpOut = pnputil.exe /update-device $PnpDeviceId 2>&1
            Write-Output $pnpOut
            if ($pnpOut -match "successfully" -or $pnpOut -match "updated" -or $LASTEXITCODE -eq 0) {
                Write-Output "[SUCCESS] Driver update succeeded via pnputil."
                exit 0
            }
        } catch {
            Write-Output "[WARNING] pnputil update-device failed or not supported: $_"
        }

        # Method 2: Fall back to Windows Update Agent COM search
        try {
            Write-Output "[SYSTEM] Falling back to Windows Update Agent COM search..."
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            # Find drivers that are not installed
            $searchResult = $searcher.Search("IsInstalled=0 and Type='Driver'")
            
            # Match updates that belong to our device
            $matchedUpdate = $null
            $device = Get-WmiObject -Class Win32_PnPEntity -Filter "DeviceID='$PnpDeviceId'"
            $hwIds = $device.HardwareID
            
            Write-Output "Found $($searchResult.Updates.Count) total pending driver updates. Matching with device..."
            foreach ($update in $searchResult.Updates) {
                # Check if update description or title matches our device name or hardware ID
                foreach ($hwId in $hwIds) {
                    if ($update.Title -like "*$hwId*" -or $update.Description -like "*$hwId*") {
                        $matchedUpdate = $update
                        break
                    }
                }
                if ($matchedUpdate) { break }
                if ($update.Title -like "*$($device.Name)*") {
                    $matchedUpdate = $update
                    break
                }
            }
            
            if ($matchedUpdate) {
                Write-Output "Matched driver update found: $($matchedUpdate.Title). Downloading..."
                
                $updatesColl = New-Object -ComObject Microsoft.Update.UpdateColl
                $updatesColl.Add($matchedUpdate) | Out-Null
                
                $downloader = $session.CreateUpdateDownloader()
                $downloader.Updates = $updatesColl
                $downloader.Download()
                
                Write-Output "Installing driver update..."
                $installer = $session.CreateUpdateInstaller()
                $installer.Updates = $updatesColl
                $res = $installer.Install()
                
                Write-Output "Installation finished. Result Code: $($res.ResultCode)"
                if ($res.ResultCode -eq 2 -or $res.ResultCode -eq 3) {
                    Write-Output "[SUCCESS] Driver update installed successfully."
                } else {
                    Write-Error "Driver installation failed with code: $($res.ResultCode)"
                }
            } else {
                Write-Output "No matching driver updates found in Windows Update catalog."
            }
        } catch {
            Write-Error "Driver update failed: $_"
            exit 1
        }
    }
    
    default {
        Write-Error "Invalid action: $Action"
        exit 1
    }
}
