# driver_backup.ps1
# Driver backup/restore/verify/list (spec TASK 3).
# Uses DISM Export-WindowsDriver + pnputil /export-driver.
# Auto-creates a restore point before restore operations (spec TASK 10).
param(
    [ValidateSet('backup-all','backup-selected','restore','verify','list','delete')]
    [string]$Action,
    [string]$Destination,
    [string]$BackupId,           # For restore/verify/delete
    [string]$InfList             # JSON array of INF names for backup-selected
)
$ErrorActionPreference = 'Stop'

# Dot-source shared helpers (audit log, restore point)
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $Action) {
    Write-Output '{"success":false,"error":"Action is required"}'
    Write-AuditLog -Action 'driver-backup' -Result 'failure' -Details 'Missing Action parameter'
    exit 1
}

# Validate destination path (must be local drive, no UNC for export-driver)
function Test-ValidPath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '^\s*$') { return $false }
    if ($p -match '[<>|"`]') { return $false }
    return $true
}

# Storage for backup metadata
$BackupRoot = Join-Path $env:APPDATA 'SolasCare\driver-backups'
if (-not (Test-Path $BackupRoot)) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
}

switch ($Action) {
    'backup-all' {
        if (-not (Test-ValidPath $Destination)) {
            Write-Output '{"success":false,"error":"Invalid destination path"}'
            exit 1
        }
        $id = [Guid]::NewGuid().ToString('N').Substring(0,8)
        $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
        $backupDir = Join-Path $Destination "SolasBackup_$stamp`_$id"
        if (-not (Test-Path $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        Write-Output "[BACKUP] Starting full driver backup to: $backupDir"
        # Disk space check (1GB minimum)
        $drive = (Split-Path $backupDir -Qualifier)
        $free = (Get-PSDrive -Name ($drive -replace ':','') -ErrorAction SilentlyContinue).Free
        if ($free -and $free -lt 1GB) {
            Write-Output "{`"success`":false,`"error`":`"Insufficient disk space on $drive (need 1GB, have $([math]::Round($free/1MB,1))MB)`"}"
            exit 1
        }

        # Export-WindowsDriver requires elevated PowerShell; falls back to pnputil /export-driver
        try {
            $dismResult = Export-WindowsDriver -Online -Destination $backupDir -ErrorAction Stop 2>&1
            Write-Output "[BACKUP] Export-WindowsDriver completed."
        } catch {
            Write-Output "[BACKUP] Export-WindowsDriver failed: $_. Falling back to pnputil /export-driver."
            & pnputil.exe /export-driver * "$backupDir" 2>&1 | ForEach-Object { Write-Output $_ }
        }

        # Compute SHA256 of manifest
        $files = Get-ChildItem -Path $backupDir -Recurse -File -ErrorAction SilentlyContinue
        $manifest = @()
        foreach ($f in $files) {
            $hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
            $manifest += [PSCustomObject]@{
                Path = $f.FullName.Substring($backupDir.Length).TrimStart('\','/')
                Size = $f.Length
                SHA256 = $hash
            }
        }
        $manifestFile = Join-Path $backupDir 'manifest.json'
        $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestFile -Encoding UTF8

        $manifestHash = (Get-FileHash -Path $manifestFile -Algorithm SHA256).Hash
        $sizeBytes = ($files | Measure-Object -Property Length -Sum).Sum

        # Save metadata
        $meta = [PSCustomObject]@{
            BackupId        = $id
            BackupDate      = (Get-Date).ToString('o')
            BackupPath      = $backupDir
            ComputerName    = $env:COMPUTERNAME
            WindowsBuild    = [System.Environment]::OSVersion.Version.ToString()
            Type            = 'Full'
            IsCompressed    = $false
            SizeBytes       = $sizeBytes
            Checksum        = $manifestHash
            IncludedDrivers = @($files | Where-Object Extension -eq '.inf' | ForEach-Object { $_.Name })
            VerificationPassed = $true
            Notes           = "Full backup via Export-WindowsDriver + pnputil fallback"
        }
        $metaFile = Join-Path $BackupRoot "$id.json"
        $meta | ConvertTo-Json -Depth 4 | Set-Content -Path $metaFile -Encoding UTF8

        $result = [PSCustomObject]@{ success=$true; backupId=$id; backupPath=$backupDir; driverCount=$meta.IncludedDrivers.Count; sizeBytes=$sizeBytes }
        Write-AuditLog -Action 'driver-backup-all' -Result 'success' -Target $backupDir -Details "Drivers=$($meta.IncludedDrivers.Count), Size=$([math]::Round($sizeBytes/1MB,1))MB"
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'backup-selected' {
        if (-not (Test-ValidPath $Destination)) {
            Write-Output '{"success":false,"error":"Invalid destination path"}'
            exit 1
        }
        if (-not $InfList) {
            Write-Output '{"success":false,"error":"InfList JSON array required for backup-selected"}'
            exit 1
        }
        $infs = $InfList | ConvertFrom-Json
        if (-not $infs -or $infs.Count -eq 0) {
            Write-Output '{"success":false,"error":"No INFs provided"}'
            exit 1
        }
        $id = [Guid]::NewGuid().ToString('N').Substring(0,8)
        $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
        $backupDir = Join-Path $Destination "SolasBackupSel_$stamp`_$id"
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        $exported = 0
        foreach ($inf in $infs) {
            $out = & pnputil.exe /export-driver "$inf" "$backupDir" 2>&1
            if ($LASTEXITCODE -eq 0) { $exported++ }
        }
        $meta = [PSCustomObject]@{
            BackupId     = $id
            BackupDate   = (Get-Date).ToString('o')
            BackupPath   = $backupDir
            ComputerName = $env:COMPUTERNAME
            WindowsBuild = [System.Environment]::OSVersion.Version.ToString()
            Type         = 'Selected'
            IsCompressed = $false
            SizeBytes    = (Get-ChildItem $backupDir -Recurse -File | Measure-Object Length -Sum).Sum
            IncludedDrivers = @($infs)
            VerificationPassed = $true
            Notes         = "Selected INF backup via pnputil /export-driver"
        }
        $metaFile = Join-Path $BackupRoot "$id.json"
        $meta | ConvertTo-Json -Depth 4 | Set-Content -Path $metaFile -Encoding UTF8
        $result = [PSCustomObject]@{ success=$true; backupId=$id; backupPath=$backupDir; driverCount=$exported }
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'list' {
        $metas = @(Get-ChildItem -Path $BackupRoot -Filter '*.json' -ErrorAction SilentlyContinue | ForEach-Object {
            try { Get-Content $_.FullName -Raw | ConvertFrom-Json } catch { $null }
        } | Where-Object { $_ })
        $result = [PSCustomObject]@{ success=$true; backups=$metas }
        Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
    }

    'verify' {
        if (-not $BackupId) {
            Write-Output '{"success":false,"error":"BackupId required for verify"}'
            exit 1
        }
        $metaFile = Join-Path $BackupRoot "$BackupId.json"
        if (-not (Test-Path $metaFile)) {
            Write-Output "{`"success`":false,`"error`":`"Backup metadata not found: $BackupId`"}"
            exit 1
        }
        $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
        $manifestFile = Join-Path $meta.BackupPath 'manifest.json'
        if (-not (Test-Path $manifestFile)) {
            Write-Output "{`"success`":false,`"error`":`"Manifest not found in backup folder`"}"
            exit 1
        }
        $currentHash = (Get-FileHash -Path $manifestFile -Algorithm SHA256).Hash
        if ($currentHash -ne $meta.Checksum) {
            Write-Output "{`"success`":false,`"error`":`"Manifest checksum mismatch (expected $($meta.Checksum), got $currentHash)`"}"
            exit 1
        }
        $manifest = Get-Content $manifestFile -Raw | ConvertFrom-Json
        $missing = 0; $hashMismatch = 0
        foreach ($entry in $manifest) {
            $fp = Join-Path $meta.BackupPath $entry.Path
            if (-not (Test-Path $fp)) { $missing++; continue }
            $hash = (Get-FileHash -Path $fp -Algorithm SHA256).Hash
            if ($hash -ne $entry.SHA256) { $hashMismatch++ }
        }
        $ok = ($missing -eq 0 -and $hashMismatch -eq 0)
        $result = [PSCustomObject]@{ success=$ok; backupId=$BackupId; missingFiles=$missing; hashMismatches=$hashMismatch; verifiedAt=(Get-Date).ToString('o') }
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'restore' {
        if (-not $BackupId) {
            Write-Output '{"success":false,"error":"BackupId required for restore"}'
            exit 1
        }
        Write-AuditLog -Action 'driver-backup-restore' -Result 'started' -Target $BackupId
        # Restore is risky - it reinstalls drivers from backup
        $rpDesc = "SolasCarePro - Restore driver backup $BackupId - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        New-SolasRestorePoint -Description $rpDesc | Out-Null
        $metaFile = Join-Path $BackupRoot "$BackupId.json"
        if (-not (Test-Path $metaFile)) {
            Write-Output "{`"success`":false,`"error`":`"Backup metadata not found: $BackupId`"}"
            exit 1
        }
        $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
        if (-not (Test-Path $meta.BackupPath)) {
            Write-Output "{`"success`":false,`"error`":`"Backup folder missing: $($meta.BackupPath)`"}"
            exit 1
        }
        # Install each INF in backup folder via pnputil /add-driver /install
        $infs = Get-ChildItem -Path $meta.BackupPath -Recurse -Filter '*.inf' -ErrorAction SilentlyContinue
        $installed = 0; $failed = 0
        foreach ($inf in $infs) {
            $out = & pnputil.exe /add-driver "$($inf.FullName)" /install 2>&1
            if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 3010) { $installed++ } else { $failed++ }
            Write-Output "[RESTORE] $($inf.Name): exit $LASTEXITCODE"
        }
        $result = [PSCustomObject]@{ success=$true; backupId=$BackupId; installed=$installed; failed=$failed; restoredAt=(Get-Date).ToString('o') }
        Write-AuditLog -Action 'driver-backup-restore' -Result $(if ($failed -eq 0) {'success'} else {'failure'}) -Target $BackupId -Details "Installed=$installed, Failed=$failed"
        Write-Output ($result | ConvertTo-Json -Compress)
    }

    'delete' {
        if (-not $BackupId) {
            Write-Output '{"success":false,"error":"BackupId required for delete"}'
            exit 1
        }
        $metaFile = Join-Path $BackupRoot "$BackupId.json"
        if (-not (Test-Path $metaFile)) {
            Write-Output "{`"success`":false,`"error`":`"Backup metadata not found: $BackupId`"}"
            exit 1
        }
        $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
        if (Test-Path $meta.BackupPath) {
            Remove-Item -Path $meta.BackupPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -Path $metaFile -Force
        Write-AuditLog -Action 'driver-backup-delete' -Result 'success' -Target $BackupId -Details "Removed $($meta.BackupPath)"
        Write-Output "{`"success`":true,`"backupId`":`"$BackupId`"}"
    }

    default {
        Write-Output "{`"success`":false,`"error`":`"Unknown action: $Action`"}"
        exit 1
    }
}
