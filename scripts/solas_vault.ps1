# solas_vault.ps1
# SolasCare Pro - Feature 6: Solas Vault (Ransomware-Proof Storage)
#
# Creates a VHD file, mounts it as a drive letter, optionally BitLockers it.
# Vault metadata (drive letter, mount time) lives in electron/vaultStore.js.
#
# Actions:
#   create-vault       - Create VHD, mount, optional BitLocker init, format
#   mount-vault        - Mount existing VHD with password (BitLocker unlock)
#   unmount-vault      - Detach VHD (drive disappears from Explorer)
#   list-vaults        - List all .vhd files in vault root with mount status
#   delete-vault       - Delete VHD file (irreversible - data loss)
#   get-activity-log   - Read activity log JSONL
#
# Why diskpart (not Hyper-V cmdlets): Hyper-V cmdlets (Mount-VHD) require the
# Hyper-V feature; diskpart is built into every Windows 10/11. Broader compat.
#
# BitLocker notes:
#   - BitLocker is Pro/Enterprise only (not Home). Script auto-detects via
#     Get-WindowsOptionalFeature and returns clear error if missing.
#   - manage-bde is used for unlock (not PowerShell cmdlets) for same reason.
#   - If BitLocker is unavailable, vault still works but unencrypted (warning shown).

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$VaultId,
    [string]$VaultPath,
    [string]$Password,
    [int]$SizeMB = 1024
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage ---
function Get-VaultRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'vault'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-VaultsDir {
    # Default vault storage location. VHD files live here by default.
    # User can also specify an absolute path via -VaultPath.
    $dir = Join-Path (Get-VaultRoot) 'vhd'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-ActivityLogPath {
    return Join-Path (Get-VaultRoot) 'activity.jsonl'
}
function Get-DiskpartScriptsDir {
    $dir = Join-Path (Get-VaultRoot) 'dp_scripts'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

# --- Safety ---
function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"]') { return $false }
    if ($p -match '\.\.') { return $false }
    return $true
}

function Test-SafeVaultId {
    param([string]$id)
    if (-not $id) { return $false }
    if ($id.Length -gt 200) { return $false }
    if ($id -match '[^A-Za-z0-9_\-]') { return $false }
    return $true
}

function Test-BitLockerAvailable {
    try {
        $f = Get-WindowsOptionalFeature -Online -FeatureName BitLocker -ErrorAction SilentlyContinue
        return ($f -and $f.State -eq 'Enabled')
    } catch {
        # Fallback: check for manage-bde.exe existence
        return (Test-Path "$env:SystemRoot\System32\manage-bde.exe")
    }
}

# Find a free drive letter starting from Z (avoid common letters)
function Get-FreeDriveLetter {
    $used = (Get-PSDrive -PSProvider FileSystem).Name
    for ($c = 90; $c -ge 70; $c--) {  # Z down to F
        $letter = [char]$c
        if ($used -notcontains $letter) { return $letter }
    }
    return $null
}

# --- Activity log ---
function Write-VaultActivity {
    param([string]$Action, [string]$VaultId, [string]$Result, [string]$Details = '')
    $entry = [ordered]@{
        ts = (Get-Date).ToString('o')
        action = $Action
        vaultId = $VaultId
        result = $Result
        details = ($Details -replace "`r`n",' ' -replace "`n",' ').Trim()
    }
    $line = $entry | ConvertTo-Json -Compress
    Add-Content -Path (Get-ActivityLogPath) -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

# --- Actions ---

function Invoke-CreateVault {
    if (-not (Test-SafeVaultId $VaultId)) {
        Write-JsonError 'Invalid VaultId.' 'create-vault'
        exit 1
    }
    if (-not $VaultPath) { $VaultPath = Join-Path (Get-VaultsDir) "$VaultId.vhdx" }
    if (-not (Test-SafePath $VaultPath)) {
        Write-JsonError 'Invalid vault path.' 'create-vault'
        exit 1
    }
    if (-not ($VaultPath -match '\.(vhd|vhdx)$')) {
        Write-JsonError 'Vault path must end in .vhd or .vhdx' 'create-vault'
        exit 1
    }
    if ($SizeMB -lt 100 -or $SizeMB -gt 2097152) {
        Write-JsonError 'Size must be 100MB - 2TB.' 'create-vault'
        exit 1
    }
    if (Test-Path $VaultPath) {
        Write-JsonError "Vault already exists: $VaultPath" 'create-vault'
        exit 1
    }

    $bitlockerAvailable = Test-BitLockerAvailable
    $blSuffix = if ($bitlockerAvailable) { ' + BitLocker' } else { ' (no BitLocker)' }
    Write-Output "[VAULT] Creating VHD: $VaultPath ($SizeMB MB)$blSuffix"

    # STEP 1: Create VHD via diskpart script
    $dpScript = Join-Path (Get-DiskpartScriptsDir) "create_$VaultId.txt"
    $vhdType = if ($VaultPath -match '\.vhdx$') { 'expandable' } else { 'expandable' }
    $lines = @(
        "create vdisk file=`"$VaultPath`" maximum=$SizeMB type=$vhdType",
        "select vdisk file=`"$VaultPath`"",
        "attach vdisk",
        "create partition primary",
        "format fs=ntfs label=`"SolasVault`" quick",
        "assign"
    )
    $lines | Out-File -FilePath $dpScript -Encoding ASCII -Force

    Write-Output "[VAULT] Running diskpart..."
    $out = diskpart /s $dpScript 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-JsonError "diskpart failed (exit $LASTEXITCODE): $out" 'create-vault'
        exit 1
    }

    # Find the drive letter that was assigned
    $driveLetter = $null
    if ($out -match 'Volume \d+\s+([A-Z])\s+SolasVault') {
        $driveLetter = $matches[1]
    } else {
        # Fallback: scan for newly-mounted volumes labeled SolasVault
        try {
            $vol = Get-Volume -FileSystemLabel 'SolasVault' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($vol -and $vol.DriveLetter) { $driveLetter = $vol.DriveLetter }
        } catch {}
    }

    if (-not $driveLetter) {
        Write-Output "[VAULT] WARNING: Could not detect assigned drive letter. VHD created but not formatted properly."
    }

    # STEP 2: BitLocker (optional, if available and password provided)
    $bitlockerEnabled = $false
    if ($bitlockerAvailable -and $Password -and $driveLetter) {
        Write-Output "[VAULT] Enabling BitLocker on drive $driveLetter`:"
        try {
            # Convert password to secure string for manage-bde
            $securePwd = ConvertTo-SecureString $Password -AsPlainText -Force
            # Enable BitLocker with password protector
            $out = manage-bde -on "${driveLetter}:" -PasswordProtector -Password $Password 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                $bitlockerEnabled = $true
                Write-Output "[VAULT] BitLocker enabled."
                # Save BitLocker recovery key to a backup file (NOT to the vault itself)
                $recoveryKeyPath = Join-Path (Get-VaultRoot) "$VaultId.bek"
                manage-bde -protectors -add "${driveLetter}:" -RecoveryPassword 2>&1 | Out-Null
                manage-bde -protectors -get "${driveLetter}:" 2>&1 | Out-File -FilePath $recoveryKeyPath -Encoding ASCII
                Write-Output "[VAULT] Recovery key saved to: $recoveryKeyPath"
            } else {
                Write-Output "[VAULT] WARNING: BitLocker enable failed: $out"
            }
        } catch {
            Write-Output "[VAULT] WARNING: BitLocker threw: $($_.Exception.Message)"
        }
    }

    # STEP 3: Detach (vault is created unmounted; user mounts with password)
    $dpDetach = Join-Path (Get-DiskpartScriptsDir) "detach_$VaultId.txt"
    "select vdisk file=`"$VaultPath`"", "detach vdisk" | Out-File -FilePath $dpDetach -Encoding ASCII -Force
    diskpart /s $dpDetach 2>&1 | Out-Null

    Write-VaultActivity -Action 'create' -VaultId $VaultId -Result 'success' -Details "Path=$VaultPath, Size=$SizeMB MB, BitLocker=$bitlockerEnabled, DriveLetter=$driveLetter"
    Write-AuditLog -Action 'vault-create' -Result 'success' -Target $VaultId -Details "Path=$VaultPath, SizeMB=$SizeMB, BitLocker=$bitlockerEnabled"

    Write-TimedJsonResult @{
        success = $true
        vaultId = $VaultId
        vaultPath = $VaultPath
        driveLetter = $driveLetter
        sizeMB = $SizeMB
        bitlockerEnabled = $bitlockerEnabled
        bitlockerAvailable = $bitlockerAvailable
        message = "Vault created at $VaultPath ($SizeMB MB). BitLocker: $(if ($bitlockerEnabled) {'enabled'} elseif (-not $bitlockerAvailable) {'unavailable (Home edition)'} else {'disabled (no password)'})"
    } $timer
}

function Invoke-MountVault {
    if (-not (Test-SafeVaultId $VaultId)) {
        Write-JsonError 'Invalid VaultId.' 'mount-vault'
        exit 1
    }
    if (-not $VaultPath) { $VaultPath = Join-Path (Get-VaultsDir) "$VaultId.vhdx" }
    if (-not (Test-SafePath $VaultPath) -or -not (Test-Path $VaultPath)) {
        Write-JsonError "Vault not found: $VaultPath" 'mount-vault'
        exit 1
    }

    $driveLetter = Get-FreeDriveLetter
    if (-not $driveLetter) {
        Write-JsonError 'No free drive letter available.' 'mount-vault'
        exit 1
    }

    Write-Output "[VAULT] Mounting $VaultPath at ${driveLetter}:"

    # Attach VHD read/write
    $dpScript = Join-Path (Get-DiskpartScriptsDir) "mount_$VaultId.txt"
    "select vdisk file=`"$VaultPath`"", "attach vdisk", "select vdisk file=`"$VaultPath`"", "select partition 1", "assign letter=$driveLetter" | Out-File -FilePath $dpScript -Encoding ASCII -Force
    $out = diskpart /s $dpScript 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-JsonError "diskpart attach failed: $out" 'mount-vault'
        exit 1
    }

    # If BitLocker-protected, unlock
    $unlocked = $true
    try {
        $status = manage-bde -status "${driveLetter}:" 2>&1 | Out-String
        if ($status -match 'Protection Status:\s+Protection On') {
            Write-Output "[VAULT] Vault is BitLocker-protected; unlocking..."
            if (-not $Password) {
                Write-JsonError 'Vault is BitLocker-protected; password required.' 'mount-vault'
                # Detach VHD before failing
                $dpDetach = Join-Path (Get-DiskpartScriptsDir) "unmount_$VaultId.txt"
                "select vdisk file=`"$VaultPath`"", "detach vdisk" | Out-File -FilePath $dpDetach -Encoding ASCII -Force
                diskpart /s $dpDetach 2>&1 | Out-Null
                exit 1
            }
            $unlockOut = manage-bde -unlock "${driveLetter}:" -Password $Password 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) {
                Write-JsonError "BitLocker unlock failed: $unlockOut" 'mount-vault'
                $dpDetach = Join-Path (Get-DiskpartScriptsDir) "unmount_$VaultId.txt"
                "select vdisk file=`"$VaultPath`"", "detach vdisk" | Out-File -FilePath $dpDetach -Encoding ASCII -Force
                diskpart /s $dpDetach 2>&1 | Out-Null
                exit 1
            }
            $unlocked = $true
            Write-Output "[VAULT] BitLocker unlocked."
        }
    } catch {
        Write-Output "[VAULT] BitLocker status check failed (continuing): $($_.Exception.Message)"
    }

    Write-VaultActivity -Action 'mount' -VaultId $VaultId -Result 'success' -Details "Drive=$driveLetter, Path=$VaultPath, BitLockerUnlocked=$unlocked"
    Write-AuditLog -Action 'vault-mount' -Result 'success' -Target $VaultId -Details "Drive=${driveLetter}:"

    Write-TimedJsonResult @{
        success = $true
        vaultId = $VaultId
        driveLetter = $driveLetter
        vaultPath = $VaultPath
        bitlockerUnlocked = $unlocked
        message = "Vault mounted at ${driveLetter}:. Use SolasCare to unmount when done."
    } $timer
}

function Invoke-UnmountVault {
    if (-not (Test-SafeVaultId $VaultId)) {
        Write-JsonError 'Invalid VaultId.' 'unmount-vault'
        exit 1
    }
    if (-not $VaultPath) { $VaultPath = Join-Path (Get-VaultsDir) "$VaultId.vhdx" }
    if (-not (Test-SafePath $VaultPath)) {
        Write-JsonError 'Invalid vault path.' 'unmount-vault'
        exit 1
    }

    Write-Output "[VAULT] Unmounting $VaultPath"
    $dpScript = Join-Path (Get-DiskpartScriptsDir) "unmount_$VaultId.txt"
    "select vdisk file=`"$VaultPath`"", "detach vdisk" | Out-File -FilePath $dpScript -Encoding ASCII -Force
    $out = diskpart /s $dpScript 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-JsonError "diskpart detach failed: $out" 'unmount-vault'
        exit 1
    }

    Write-VaultActivity -Action 'unmount' -VaultId $VaultId -Result 'success' -Details "Path=$VaultPath"
    Write-AuditLog -Action 'vault-unmount' -Result 'success' -Target $VaultId

    Write-TimedJsonResult @{
        success = $true
        vaultId = $VaultId
        message = "Vault unmounted. Drive letter released."
    } $timer
}

function Invoke-ListVaults {
    $vaults = @()
    $vaultsDir = Get-VaultsDir
    try {
        $files = Get-ChildItem -Path $vaultsDir -Filter '*.vhd*' -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            $vaultId = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
            $isMounted = $false
            $driveLetter = $null
            # Check if VHD is currently attached by querying diskpart list
            $listOut = diskpart /s (Join-Path (Get-DiskpartScriptsDir) 'list_vdisks.txt' 2>$null) 2>&1 | Out-String
            # Simpler: try attaching read-only check via Get-Disk (Hyper-V not required)
            try {
                $disks = Get-Disk -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'Virtual|Microsoft' -and $_.Size -eq $f.Length }
                if ($disks) {
                    $isMounted = $true
                    $vol = $disks | Get-Partition -ErrorAction SilentlyContinue | Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | Select-Object -First 1
                    if ($vol) { $driveLetter = $vol.DriveLetter }
                }
            } catch {}

            $vaults += [PSCustomObject]@{
                vaultId = $vaultId
                path = $f.FullName
                sizeBytes = $f.Length
                sizeMB = [math]::Round($f.Length / 1MB, 2)
                isMounted = $isMounted
                driveLetter = $driveLetter
                createdIso = $f.CreationTime.ToString('o')
                modifiedIso = $f.LastWriteTime.ToString('o')
            }
        }
    } catch {}

    Write-TimedJsonResult @{
        success = $true
        vaults = $vaults
        count = $vaults.Count
    } $timer
}

function Invoke-DeleteVault {
    if (-not (Test-SafeVaultId $VaultId)) {
        Write-JsonError 'Invalid VaultId.' 'delete-vault'
        exit 1
    }
    if (-not $VaultPath) { $VaultPath = Join-Path (Get-VaultsDir) "$VaultId.vhdx" }
    if (-not (Test-SafePath $VaultPath) -or -not (Test-Path $VaultPath)) {
        Write-JsonError "Vault not found: $VaultPath" 'delete-vault'
        exit 1
    }
    # Safety: detach if mounted before deleting
    $dpDetach = Join-Path (Get-DiskpartScriptsDir) "detach_$VaultId.txt"
    "select vdisk file=`"$VaultPath`"", "detach vdisk" | Out-File -FilePath $dpDetach -Encoding ASCII -Force
    diskpart /s $dpDetach 2>&1 | Out-Null

    try {
        Remove-Item -Path $VaultPath -Force -ErrorAction Stop
        # Remove recovery key file
        $bekPath = Join-Path (Get-VaultRoot) "$VaultId.bek"
        if (Test-Path $bekPath) { Remove-Item -Path $bekPath -Force -ErrorAction SilentlyContinue }
    } catch {
        Write-JsonError "Delete failed: $($_.Exception.Message)" 'delete-vault'
        exit 1
    }

    Write-VaultActivity -Action 'delete' -VaultId $VaultId -Result 'success' -Details "Path=$VaultPath"
    Write-AuditLog -Action 'vault-delete' -Result 'success' -Target $VaultId -Details "Path=$VaultPath"

    Write-TimedJsonResult @{
        success = $true
        vaultId = $VaultId
        deleted = $true
        message = "Vault deleted. All data irreversibly lost."
    } $timer
}

function Invoke-GetActivityLog {
    $path = Get-ActivityLogPath
    $entries = @()
    if (Test-Path $path) {
        try {
            $lines = Get-Content -Path $path -Encoding UTF8 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if (-not $line) { continue }
                try { $entries += ($line | ConvertFrom-Json) } catch {}
            }
        } catch {}
    }
    Write-TimedJsonResult @{
        success = $true
        entries = $entries
        count = $entries.Count
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'create-vault'      { Invoke-CreateVault }
        'mount-vault'       { Invoke-MountVault }
        'unmount-vault'     { Invoke-UnmountVault }
        'list-vaults'       { Invoke-ListVaults }
        'delete-vault'      { Invoke-DeleteVault }
        'get-activity-log'  { Invoke-GetActivityLog }
        default {
            Write-JsonError "Invalid action: $Action" 'solas_vault'
        }
    }
} catch {
    Write-VaultActivity -Action $Action -VaultId $VaultId -Result 'failure' -Details $_.Exception.Message
    Write-AuditLog -Action "vault-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "solas_vault.$Action"
}
