# god_mode_tweaker.ps1
# SolasCare Pro - Feature 3: God Mode Visual Tweaker + 1-Click Undo
#
# Generic registry-tweak engine: caller (JS) provides the catalog (tweak definitions),
# this script performs the actual backup + apply + undo operations against the registry.
#
# Why generic: registry tweaks are highly varied. Hardcoding each tweak here (like the
# existing apply-win-tweak does for 4 tweaks) doesn't scale to 15+ tweaks with bundles.
# JS owns the catalog (single source of truth for UI + branding); PowerShell stays
# focused on the safe low-level reg operations.
#
# Actions:
#   backup-value  - Read current value, persist to a JSON file. Returns previousValue (or null).
#   apply-value   - Backup-then-set. Idempotent.
#   undo-value    - Restore from backup file (or delete value if it didn't exist before).
#   list-backups  - List all backup files in the backups dir.
#   delete-backup - Remove a specific backup file.
#
# Registry paths use the PowerShell PSDrive format (HKLM:\, HKCU:\) and are
# strictly validated against an ALLOWED_HIVES list. Value data is type-checked.

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$BackupId,
    [string]$RegKey,
    [string]$ValueName,
    [string]$ValueType,     # REG_DWORD | REG_SZ | REG_QWORD | REG_EXPAND_SZ | REG_MULTI_SZ
    [string]$ValueData
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage ---
function Get-TweakerRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'tweaker'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-BackupsDir {
    $dir = Join-Path (Get-TweakerRoot) 'backups'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

# --- Validation ---
# Allowed hives (PSDrive format). Anything outside these is rejected.
$ALLOWED_HIVES = @('HKLM:\','HKCU:\','HKCR:\','HKU:\','HKCC:\')

function Test-AllowedRegistryPath {
    param([string]$p)
    if (-not $p) { return $false }
    # Reject shell metacharacters
    if ($p -match '[<>|"`$;]') { return $false }
    if ($p -match '\.\.') { return $false }
    # Must start with one of the allowed hive prefixes
    $matched = $false
    foreach ($h in $ALLOWED_HIVES) {
        if ($p -like "$h*") { $matched = $true; break }
    }
    if (-not $matched) { return $false }
    # Reject traversal past root
    if ($p -match '^(HKLM:\\|HKCU:\\|HKCR:\\|HKU:\\|HKCC:\\)$') { return $false }
    return $true
}

function Test-SafeBackupId {
    param([string]$id)
    if (-not $id) { return $false }
    if ($id.Length -gt 200) { return $false }
    if ($id -match '[^A-Za-z0-9_\-]') { return $false }
    return $true
}

function Test-AllowedValueType {
    param([string]$t)
    return $t -in @('REG_DWORD','REG_SZ','REG_QWORD','REG_EXPAND_SZ','REG_MULTI_SZ')
}

function ConvertTo-RegValue {
    param([string]$type, [string]$data)
    switch ($type) {
        'REG_DWORD'  { try { return [int]([long]$data) } catch { throw "Invalid DWORD: $data" } }
        'REG_QWORD'  { try { return [long]$data } catch { throw "Invalid QWORD: $data" } }
        'REG_SZ'     { return [string]$data }
        'REG_EXPAND_SZ' { return [string]$data }
        'REG_MULTI_SZ'  {
            # Multi-string: data is pipe-separated
            return ($data -split '\|')
        }
        default { throw "Unsupported type: $type" }
    }
}

# --- Actions ---

function Invoke-BackupValue {
    if (-not (Test-SafeBackupId $BackupId)) {
        Write-JsonError 'Invalid BackupId.' 'backup-value'
        exit 1
    }
    if (-not (Test-AllowedRegistryPath $RegKey)) {
        Write-JsonError "Blocked registry path: $RegKey" 'backup-value'
        exit 1
    }
    # Split key path into parent + leaf for Get-ItemProperty
    $parts = $RegKey -split '\\'
    $leaf = $parts[-1]
    $parent = ($parts[0..($parts.Count-2)] -join '\')

    $existed = $false
    $prevValue = $null
    $prevType = $null

    if (Test-Path $RegKey) {
        try {
            $props = Get-ItemProperty -Path $RegKey -Name $ValueName -ErrorAction SilentlyContinue
            if ($null -ne $props -and $props.PSObject.Properties.Name -contains $ValueName) {
                $existed = $true
                $prevValue = $props.$ValueName
                # Determine type via registry view
                $keyObj = Get-Item -Path $RegKey -ErrorAction SilentlyContinue
                if ($keyObj) {
                    $valKind = $keyObj.GetValueKind($ValueName) -ErrorAction SilentlyContinue
                    $prevType = switch ($valKind) {
                        'String'      { 'REG_SZ' }
                        'DWord'       { 'REG_DWORD' }
                        'QWord'       { 'REG_QWORD' }
                        'ExpandString'{ 'REG_EXPAND_SZ' }
                        'MultiString' { 'REG_MULTI_SZ' }
                        default       { 'REG_SZ' }
                    }
                }
            }
        } catch {}
    }

    $backup = @{
        backupId  = $BackupId
        regKey    = $RegKey
        valueName = $ValueName
        existed   = $existed
        prevValue = $prevValue
        prevType  = $prevType
        backedUpIso = (Get-Date).ToString('o')
    }

    $path = Join-Path (Get-BackupsDir) "$BackupId.json"
    $backup | ConvertTo-Json -Depth 4 | Out-File -FilePath $path -Encoding UTF8

    Write-AuditLog -Action 'tweaker-backup' -Result 'success' -Target "$RegKey\$ValueName" -Details "Existed=$existed"

    Write-TimedJsonResult @{
        success = $true
        backup = $backup
        message = if ($existed) { "Backed up existing value: $prevValue" } else { "No prior value; undo will delete." }
    } $timer
}

function Invoke-ApplyValue {
    if (-not (Test-SafeBackupId $BackupId)) {
        Write-JsonError 'Invalid BackupId.' 'apply-value'
        exit 1
    }
    if (-not (Test-AllowedRegistryPath $RegKey)) {
        Write-JsonError "Blocked registry path: $RegKey" 'apply-value'
        exit 1
    }
    if (-not (Test-AllowedValueType $ValueType)) {
        Write-JsonError "Invalid value type: $ValueType" 'apply-value'
        exit 1
    }
    if ($ValueData -eq $null) { $ValueData = '' }
    if ($ValueData.Length -gt 10000) {
        Write-JsonError 'Value data too long.' 'apply-value'
        exit 1
    }

    # STEP 1: Backup current value (overwrite any existing backup with same id)
    $backup = Invoke-BackupValueInternal
    Write-Output "[TWEAKER] Backup created (existed=$($backup.existed))"

    # STEP 2: Ensure the key exists
    if (-not (Test-Path $RegKey)) {
        try {
            New-Item -Path $RegKey -Force -ErrorAction Stop | Out-Null
            Write-Output "[TWEAKER] Created key: $RegKey"
        } catch {
            Write-JsonError "Failed to create key: $($_.Exception.Message)" 'apply-value'
            exit 1
        }
    }

    # STEP 3: Set the value
    try {
        $typedValue = ConvertTo-RegValue -Type $ValueType -Data $ValueData
        # Map to Set-ItemProperty -Type parameter
        $psType = switch ($ValueType) {
            'REG_DWORD'      { 'DWord' }
            'REG_QWORD'      { 'QWord' }
            'REG_SZ'         { 'String' }
            'REG_EXPAND_SZ'  { 'ExpandString' }
            'REG_MULTI_SZ'   { 'MultiString' }
        }
        Set-ItemProperty -Path $RegKey -Name $ValueName -Value $typedValue -Type $psType -Force -ErrorAction Stop
        Write-Output "[TWEAKER] Set $RegKey\$ValueName = $ValueData (type $ValueType)"
    } catch {
        Write-JsonError "Failed to set value: $($_.Exception.Message)" 'apply-value'
        exit 1
    }

    Write-AuditLog -Action 'tweaker-apply' -Result 'success' -Target "$RegKey\$ValueName" -Details "Type=$ValueType, Data=$ValueData, BackupId=$BackupId"

    Write-TimedJsonResult @{
        success = $true
        backupId = $BackupId
        regKey = $RegKey
        valueName = $ValueName
        appliedValue = $ValueData
        appliedType = $ValueType
        message = "Tweak applied. Undo available via backup id: $BackupId"
    } $timer
}

function Invoke-BackupValueInternal {
    # Internal helper - returns the backup hashtable without writing JSON output.
    $existed = $false
    $prevValue = $null
    $prevType = $null
    if (Test-Path $RegKey) {
        try {
            $props = Get-ItemProperty -Path $RegKey -Name $ValueName -ErrorAction SilentlyContinue
            if ($null -ne $props -and $props.PSObject.Properties.Name -contains $ValueName) {
                $existed = $true
                $prevValue = $props.$ValueName
                $keyObj = Get-Item -Path $RegKey -ErrorAction SilentlyContinue
                if ($keyObj) {
                    $valKind = $keyObj.GetValueKind($ValueName) -ErrorAction SilentlyContinue
                    $prevType = switch ($valKind) {
                        'String'      { 'REG_SZ' }
                        'DWord'       { 'REG_DWORD' }
                        'QWord'       { 'REG_QWORD' }
                        'ExpandString'{ 'REG_EXPAND_SZ' }
                        'MultiString' { 'REG_MULTI_SZ' }
                        default       { 'REG_SZ' }
                    }
                }
            }
        } catch {}
    }
    $backup = @{
        backupId = $BackupId
        regKey = $RegKey
        valueName = $ValueName
        existed = $existed
        prevValue = $prevValue
        prevType = $prevType
        backedUpIso = (Get-Date).ToString('o')
    }
    $path = Join-Path (Get-BackupsDir) "$BackupId.json"
    $backup | ConvertTo-Json -Depth 4 | Out-File -FilePath $path -Encoding UTF8
    return $backup
}

function Invoke-UndoValue {
    if (-not (Test-SafeBackupId $BackupId)) {
        Write-JsonError 'Invalid BackupId.' 'undo-value'
        exit 1
    }
    $path = Join-Path (Get-BackupsDir) "$BackupId.json"
    if (-not (Test-Path $path)) {
        Write-JsonError "Backup not found: $BackupId" 'undo-value'
        exit 1
    }
    try {
        $backup = Get-Content -Path $path -Raw | ConvertFrom-Json
    } catch {
        Write-JsonError "Failed to read backup: $($_.Exception.Message)" 'undo-value'
        exit 1
    }

    # Safety: re-validate the registry path stored in the backup before touching it
    if (-not (Test-AllowedRegistryPath $backup.regKey)) {
        Write-JsonError "Backup contains blocked registry path: $($backup.regKey)" 'undo-value'
        exit 1
    }

    if (-not $backup.existed) {
        # Value didn't exist before; remove it if it exists now
        if (Test-Path $backup.regKey) {
            try {
                Remove-ItemProperty -Path $backup.regKey -Name $backup.valueName -Force -ErrorAction SilentlyContinue
                Write-Output "[TWEAKER] Removed value $($backup.regKey)\$($backup.valueName)"
            } catch {}
        }
    } else {
        # Restore prior value
        if (-not (Test-Path $backup.regKey)) {
            try { New-Item -Path $backup.regKey -Force | Out-Null } catch {}
        }
        try {
            $psType = switch ($backup.prevType) {
                'REG_DWORD'      { 'DWord' }
                'REG_QWORD'      { 'QWord' }
                'REG_SZ'         { 'String' }
                'REG_EXPAND_SZ'  { 'ExpandString' }
                'REG_MULTI_SZ'   { 'MultiString' }
                default          { 'String' }
            }
            Set-ItemProperty -Path $backup.regKey -Name $backup.valueName -Value $backup.prevValue -Type $psType -Force -ErrorAction Stop
            Write-Output "[TWEAKER] Restored $($backup.regKey)\$($backup.valueName) = $($backup.prevValue)"
        } catch {
            Write-JsonError "Failed to restore: $($_.Exception.Message)" 'undo-value'
            exit 1
        }
    }

    # Delete the backup file (undo is one-shot)
    try { Remove-Item -Path $path -Force -ErrorAction SilentlyContinue } catch {}

    Write-AuditLog -Action 'tweaker-undo' -Result 'success' -Target "$($backup.regKey)\$($backup.valueName)" -Details "BackupId=$BackupId, Existed=$($backup.existed)"

    Write-TimedJsonResult @{
        success = $true
        backupId = $BackupId
        restored = $true
        message = "Tweak undone. Original state restored."
    } $timer
}

function Invoke-ListBackups {
    $dir = Get-BackupsDir
    $backups = @()
    try {
        $files = Get-ChildItem -Path $dir -Filter '*.json' -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            try {
                $b = Get-Content -Path $f.FullName -Raw | ConvertFrom-Json
                $backups += [PSCustomObject]@{
                    backupId = $b.backupId
                    regKey = $b.regKey
                    valueName = $b.valueName
                    existed = $b.existed
                    backedUpIso = $b.backedUpIso
                    fileSize = $f.Length
                }
            } catch {}
        }
    } catch {}
    Write-TimedJsonResult @{
        success = $true
        backups = $backups
        count = $backups.Count
    } $timer
}

function Invoke-DeleteBackup {
    if (-not (Test-SafeBackupId $BackupId)) {
        Write-JsonError 'Invalid BackupId.' 'delete-backup'
        exit 1
    }
    $path = Join-Path (Get-BackupsDir) "$BackupId.json"
    if (Test-Path $path) {
        Remove-Item -Path $path -Force
        Write-AuditLog -Action 'tweaker-delete-backup' -Result 'success' -Target $BackupId
        Write-TimedJsonResult @{ success = $true; deleted = $true; backupId = $BackupId } $timer
    } else {
        Write-TimedJsonResult @{ success = $true; deleted = $false; backupId = $BackupId; message = 'No backup file found.' } $timer
    }
}

# --- Dispatch ---
try {
    switch ($Action) {
        'backup-value'  { Invoke-BackupValue }
        'apply-value'   { Invoke-ApplyValue }
        'undo-value'    { Invoke-UndoValue }
        'list-backups'  { Invoke-ListBackups }
        'delete-backup' { Invoke-DeleteBackup }
        default {
            Write-JsonError "Invalid action: $Action" 'god_mode_tweaker'
        }
    }
} catch {
    Write-AuditLog -Action "tweaker-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "god_mode_tweaker.$Action"
}
