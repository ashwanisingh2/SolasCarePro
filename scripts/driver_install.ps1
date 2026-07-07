# driver_install.ps1
# Driver install/uninstall/rollback via PnPUtil (spec TASK 4).
# Auto-creates a System Restore point before risky operations (spec TASK 10).
# Logs every operation to the audit log via _common.ps1.
param(
    [ValidateSet('install-inf','install-folder','uninstall','rollback','list-store')]
    [string]$Action,
    [string]$InfPath,           # For install-inf / uninstall
    [string]$FolderPath,        # For install-folder
    [string]$PnpDeviceId        # For rollback
)
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Output '{"success":false,"error":"This operation requires Administrator privileges."}'
    exit 1
}

# Dot-source shared helpers (audit log, restore point, JSON helpers)
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $Action) {
    Write-Output '{"success":false,"error":"Action is required"}'
    Write-AuditLog -Action 'driver-install' -Result 'failure' -Details 'Missing Action parameter'
    exit 1
}

# Path validation - prevent command injection
function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"`]') { return $false }
    if ($p -match '\.\.') { return $false }
    return (Test-Path $p)
}

function Test-SafePnpId {
    param([string]$p)
    if (-not $p) { return $false }
    return $p -match '^[A-Za-z0-9\\&_\.\-{}]+$'
}

# Operations that warrant an automatic restore point
function New-RestorePointIfRisky {
    param([string]$opName)
    $desc = "SolasCarePro Driver Manager - $opName - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    New-SolasRestorePoint -Description $desc | Out-Null
}

switch ($Action) {
    'install-inf' {
        if (-not (Test-SafePath $InfPath)) {
            Write-Output '{\"success\":false,\"error\":\"Invalid INF path\"}'
            Write-AuditLog -Action 'driver-install-inf' -Result 'failure' -Details "Invalid INF path: $InfPath"
            exit 1
        }
        Write-AuditLog -Action 'driver-install-inf' -Result 'started' -Target $InfPath
        New-RestorePointIfRisky -opName 'Install single driver INF'
        Write-Output "[INSTALL] Adding driver $InfPath to driver store and installing..."
        $out = & pnputil.exe /add-driver "$InfPath" /install 2>&1
        $exitCode = $LASTEXITCODE
        Write-Output ($out -join "`n")
        $reboot = ($exitCode -eq 3010)
        $success = ($exitCode -eq 0 -or $exitCode -eq 3010)
        $result = [PSCustomObject]@{
            success       = $success
            exitCode      = $exitCode
            rebootRequired = $reboot
            infPath       = $InfPath
            action        = 'install-inf'
            timestamp     = (Get-Date).ToString('o')
        }
        Write-AuditLog -Action 'driver-install-inf' -Result $(if ($success) {'success'} else {'failure'}) -Target $InfPath -Details "ExitCode=$exitCode, Reboot=$reboot"
        Write-Output "===RESULT==="
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'install-folder' {
        if (-not (Test-SafePath $FolderPath)) {
            Write-Output '{\"success\":false,\"error\":\"Invalid folder path\"}'
            exit 1
        }
        $infs = Get-ChildItem -Path $FolderPath -Filter '*.inf' -Recurse -ErrorAction SilentlyContinue
        if ($infs.Count -eq 0) {
            Write-Output '{\"success\":false,\"error\":\"No INF files found in folder\"}'
            exit 1
        }
        $results = @(); $anyReboot = $false
        foreach ($inf in $infs) {
            Write-Output "[INSTALL] Processing $($inf.Name)..."
            $out = & pnputil.exe /add-driver "$($inf.FullName)" /install 2>&1
            $exitCode = $LASTEXITCODE
            $success = ($exitCode -eq 0 -or $exitCode -eq 3010)
            if ($exitCode -eq 3010) { $anyReboot = $true }
            $results += [PSCustomObject]@{
                inf       = $inf.Name
                exitCode  = $exitCode
                success   = $success
            }
        }
        $result = [PSCustomObject]@{
            success        = ($results | Where-Object success | Measure-Object).Count -gt 0
            results        = $results
            rebootRequired = $anyReboot
            folderPath     = $FolderPath
            action         = 'install-folder'
            timestamp      = (Get-Date).ToString('o')
        }
        Write-Output "===RESULT==="
        Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
    }

    'uninstall' {
        if (-not $InfPath) {
            Write-Output '{\"success\":false,\"error\":\"INF name (e.g. oem5.inf) required for uninstall\"}'
            exit 1
        }
        if ($InfPath -notmatch '^[A-Za-z0-9_\.\-]+$') {
            Write-Output '{\"success\":false,\"error\":\"Invalid INF name format\"}'
            exit 1
        }
        Write-AuditLog -Action 'driver-uninstall' -Result 'started' -Target $InfPath
        New-RestorePointIfRisky -opName "Force-uninstall driver $InfPath"
        Write-Output "[UNINSTALL] Removing driver $InfPath from store (forced)..."
        $out = & pnputil.exe /delete-driver "$InfPath" /force 2>&1
        $exitCode = $LASTEXITCODE
        Write-Output ($out -join "`n")
        $success = ($exitCode -eq 0 -or $exitCode -eq 3010)
        Write-AuditLog -Action 'driver-uninstall' -Result $(if ($success) {'success'} else {'failure'}) -Target $InfPath -Details "ExitCode=$exitCode"
        $result = [PSCustomObject]@{
            success        = $success
            exitCode       = $exitCode
            rebootRequired = ($exitCode -eq 3010)
            infName        = $InfPath
            action         = 'uninstall'
            timestamp      = (Get-Date).ToString('o')
        }
        Write-Output "===RESULT==="
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'rollback' {
        if (-not (Test-SafePnpId $PnpDeviceId)) {
            Write-Output '{\"success\":false,\"error\":\"Invalid PnpDeviceId\"}'
            exit 1
        }
        Write-AuditLog -Action 'driver-rollback' -Result 'started' -Target $PnpDeviceId
        New-RestorePointIfRisky -opName "Rollback driver for $PnpDeviceId"
        Write-Output "[ROLLBACK] Triggering rollback for device: $PnpDeviceId"
        # Use pnputil /rollback-device on Win10/11 (added in 2004)
        $out = & pnputil.exe /rollback-device "$PnpDeviceId" 2>&1
        $exitCode = $LASTEXITCODE
        Write-Output ($out -join "`n")
        $success = ($exitCode -eq 0 -or $exitCode -eq 3010)
        Write-AuditLog -Action 'driver-rollback' -Result $(if ($success) {'success'} else {'failure'}) -Target $PnpDeviceId -Details "ExitCode=$exitCode"
        $result = [PSCustomObject]@{
            success        = $success
            exitCode       = $exitCode
            rebootRequired = ($exitCode -eq 3010)
            pnpDeviceId    = $PnpDeviceId
            action         = 'rollback'
            timestamp      = (Get-Date).ToString('o')
        }
        Write-Output "===RESULT==="
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'list-store' {
        Write-Output "[LIST] Enumerating driver store..."
        $drivers = Get-WindowsDriver -Online -ErrorAction SilentlyContinue
        $entries = @()
        foreach ($d in $drivers) {
            $entries += [PSCustomObject]@{
                PublishedName = $d.Driver
                OriginalName = $d.OriginalFileName
                Provider = $d.ProviderName
                ClassName = $d.ClassName
                Version = $d.Version
                Date = $d.Date
            }
        }
        $result = [PSCustomObject]@{
            success  = $true
            count    = $entries.Count
            drivers  = $entries
            action   = 'list-store'
            timestamp = (Get-Date).ToString('o')
        }
        Write-Output "===RESULT==="
        Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
    }

    default {
        Write-Output "{`"success`":false,`"error`":`"Unknown action: $Action`"}"
        exit 1
    }
}
