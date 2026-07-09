# v_cache.ps1
# SolasCare Pro - Feature 11: Solas V-Cache (RAM Disk)
#
# Creates a RAM disk via ImDisk (open-source, proven). Redirects browser caches
# and temp folders to it for ~100x speedup (RAM 50GB/s vs SSD 500MB/s).
#
# PER SENIOR-ENGINEER CRITIQUE: clear crash-data-loss warnings.
# RAM disk contents are LOST on power loss / crash. We only redirect
# REGENERATABLE caches (browser cache, temp files, shader cache) — never user files.
#
# Actions:
#   check-imdisk         - Returns whether ImDisk driver is installed
#   install-imdisk       - Downloads + installs ImDisk (requires user confirm; ~5MB)
#   create-ramdisk       - Create RAM disk at drive letter, format NTFS, mount
#   remove-ramdisk       - Detach RAM disk (drive letter freed)
#   get-status           - Current RAM disk status (drive letter, size, free, redirects)
#   redirect-cache       - Create symbolic link from a cache path to the RAM disk
#   unredirect-cache     - Restore original cache folder (remove symlink)
#   get-recommendations  - Returns recommended RAM disk size based on system RAM

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$DriveLetter,
    [int]$SizeMB = 1024,
    [string]$CachePath,        # for redirect-cache: original cache folder path
    [string]$CacheLabel        # for redirect-cache: friendly label (e.g. "Chrome Cache")
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage ---
function Get-VCacheRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'vcache'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-RedirectsFile {
    return Join-Path (Get-VCacheRoot) 'redirects.json'
}

# --- Safety ---
function Test-SafeDriveLetter {
    param([string]$d)
    if (-not $d) { return $false }
    if ($d.Length -ne 1) { return $false }
    if ($d -notmatch '^[A-Z]$') { return $false }
    # Block A (floppy) and C (system drive)
    if ($d -in @('A','B','C')) { return $false }
    return $true
}

function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"]') { return $false }
    if ($p -match '\.\.') { return $false }
    return $true
}

# --- ImDisk detection ---

function Test-ImDiskInstalled {
    try {
        $driver = Get-Service -Name 'imdisk' -ErrorAction SilentlyContinue
        if ($driver) { return $true }
        $exe = Get-Command 'imdisk.exe' -ErrorAction SilentlyContinue
        if ($exe) { return $true }
    } catch {}
    return $false
}

function Test-WindowsSandboxAvailable {
    try {
        $f = Get-WindowsOptionalFeature -Online -FeatureName 'Containers-DisposableClientVM' -ErrorAction SilentlyContinue
        return ($f -and $f.State -eq 'Enabled')
    } catch {
        return $false
    }
}

# --- Actions ---

function Invoke-CheckImDisk {
    Write-TimedJsonResult @{
        success = $true
        imdiskInstalled = (Test-ImDiskInstalled)
        message = if (Test-ImDiskInstalled) { 'ImDisk driver installed.' } else { 'ImDisk not installed.' }
    } $timer
}

function Invoke-InstallImDisk {
    # ImDisk is signed by its author (Olof Lagerkvist). We download from his official
    # sourceforge mirror. User must confirm in UI before this runs.
    Write-Output "[VCACHE] Downloading ImDisk installer..."
    $installerPath = Join-Path $env:TEMP 'imdiskinst.exe'
    try {
        # Official URL: https://sourceforge.net/projects/imdisk-toolkit/files/latest/download
        # We use the direct exe from the imdisk-toolkit site
        $url = 'https://sourceforge.net/projects/imdisk-toolkit/files/latest/download'
        Invoke-WebRequest -Uri $url -OutFile $installerPath -UseBasicParsing -ErrorAction Stop
        Write-Output "[VCACHE] Downloaded $installerPath. Running silent install..."
        $out = Start-Process -FilePath $installerPath -ArgumentList '/S' -Wait -PassThru -ErrorAction Stop
        if ($out.ExitCode -eq 0) {
            Write-AuditLog -Action 'vcache-install-imdisk' -Result 'success'
            Write-TimedJsonResult @{
                success = $true
                message = 'ImDisk installed. Reboot may be required.'
            } $timer
        } else {
            Write-JsonError "ImDisk install failed (exit $($out.ExitCode))." 'install-imdisk'
            exit 1
        }
    } catch {
        Write-JsonError "ImDisk download/install failed: $($_.Exception.Message)" 'install-imdisk'
        exit 1
    } finally {
        if (Test-Path $installerPath) { Remove-Item $installerPath -Force -ErrorAction SilentlyContinue }
    }
}

function Invoke-CreateRamdisk {
    if (-not (Test-SafeDriveLetter $DriveLetter)) {
        Write-JsonError "Invalid drive letter: $DriveLetter (must be single letter A-Z, not A/B/C)" 'create-ramdisk'
        exit 1
    }
    if ($SizeMB -lt 100 -or $SizeMB -gt 32768) {
        Write-JsonError "Size must be 100MB - 32GB." 'create-ramdisk'
        exit 1
    }
    if (-not (Test-ImDiskInstalled)) {
        Write-JsonError 'ImDisk not installed. Run install-imdisk first.' 'create-ramdisk'
        exit 1
    }
    # Check drive letter not in use
    $existing = (Get-PSDrive -PSProvider FileSystem).Name
    if ($existing -contains $DriveLetter) {
        Write-JsonError "Drive letter $DriveLetter is already in use." 'create-ramdisk'
        exit 1
    }

    Write-Output "[VCACHE] Creating ${SizeMB}MB RAM disk at ${DriveLetter}: ..."
    try {
        # imdisk.exe -a -t vm -m <drive>: -s <size>M
        $out = imdisk.exe -a -t vm -m "${DriveLetter}:" -s "${SizeMB}M" 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            Write-JsonError "imdisk attach failed: $out" 'create-ramdisk'
            exit 1
        }
        # Format as NTFS
        Write-Output "[VCACHE] Formatting ${DriveLetter}: as NTFS..."
        $fmtOut = & format "${DriveLetter}:" /FS:NTFS /Q /Y 2>&1 | Out-String
        # Format exits non-zero even on success sometimes; check volume exists
        Start-Sleep -Seconds 1
        $vol = Get-Volume -DriveLetter $DriveLetter -ErrorAction SilentlyContinue
        if (-not $vol -or $vol.FileSystem -ne 'NTFS') {
            Write-JsonError "Format failed: $fmtOut" 'create-ramdisk'
            # Detach the orphaned disk
            try { imdisk.exe -D -m "${DriveLetter}:" 2>&1 | Out-Null } catch {}
            exit 1
        }
        # Set label
        try { Set-Volume -DriveLetter $DriveLetter -NewFileSystemLabel 'SolasVCache' -ErrorAction SilentlyContinue } catch {}

        Write-AuditLog -Action 'vcache-create-ramdisk' -Result 'success' -Target "${DriveLetter}:" -Details "Size=${SizeMB}MB"
        Write-TimedJsonResult @{
            success = $true
            driveLetter = $DriveLetter
            sizeMB = $SizeMB
            message = "RAM disk created at ${DriveLetter}: (${SizeMB}MB). WARNING: contents LOST on reboot/crash."
        } $timer
    } catch {
        Write-JsonError "Failed to create RAM disk: $($_.Exception.Message)" 'create-ramdisk'
        exit 1
    }
}

function Invoke-RemoveRamdisk {
    if (-not (Test-SafeDriveLetter $DriveLetter)) {
        Write-JsonError "Invalid drive letter: $DriveLetter" 'remove-ramdisk'
        exit 1
    }
    Write-Output "[VCACHE] Removing RAM disk at ${DriveLetter}: ..."
    try {
        $out = imdisk.exe -D -m "${DriveLetter}:" 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) {
            Write-JsonError "imdisk detach failed: $out" 'remove-ramdisk'
            exit 1
        }
        Write-AuditLog -Action 'vcache-remove-ramdisk' -Result 'success' -Target "${DriveLetter}:"
        Write-TimedJsonResult @{
            success = $true
            message = "RAM disk at ${DriveLetter}: removed. All contents lost."
        } $timer
    } catch {
        Write-JsonError "Failed to remove RAM disk: $($_.Exception.Message)" 'remove-ramdisk'
        exit 1
    }
}

function Invoke-GetStatus {
    $status = @{
        imdiskInstalled = (Test-ImDiskInstalled)
        ramdiskActive = $false
        driveLetter = $null
        sizeBytes = 0
        freeBytes = 0
        usedBytes = 0
        redirects = @()
    }
    # Find SolasVCache volume
    try {
        $vol = Get-Volume -FileSystemLabel 'SolasVCache' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($vol -and $vol.DriveLetter) {
            $status.ramdiskActive = $true
            $status.driveLetter = $vol.DriveLetter
            $status.sizeBytes = $vol.Size
            $status.freeBytes = $vol.SizeRemaining
            $status.usedBytes = $vol.Size - $vol.SizeRemaining
        }
    } catch {}

    # Load redirects
    $redirectsFile = Get-RedirectsFile
    if (Test-Path $redirectsFile) {
        try {
            $status.redirects = Get-Content $redirectsFile -Raw | ConvertFrom-Json
        } catch {}
    }

    Write-TimedJsonResult @{
        success = $true
        status = $status
    } $timer
}

function Invoke-RedirectCache {
    if (-not (Test-SafePath $CachePath)) {
        Write-JsonError "Invalid cache path: $CachePath" 'redirect-cache'
        exit 1
    }
    if (-not $CacheLabel -or $CacheLabel.Length -gt 100) {
        Write-JsonError 'CacheLabel required (max 100 chars)' 'redirect-cache'
        exit 1
    }
    # Find RAM disk drive letter
    $vol = Get-Volume -FileSystemLabel 'SolasVCache' -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $vol -or -not $vol.DriveLetter) {
        Write-JsonError 'RAM disk not active. Create it first.' 'redirect-cache'
        exit 1
    }
    $ramDrive = "$($vol.DriveLetter):"

    if (-not (Test-Path $CachePath)) {
        Write-JsonError "Cache path not found: $CachePath" 'redirect-cache'
        exit 1
    }

    # Compute target path on RAM disk
    $safeLabel = $CacheLabel -replace '[^A-Za-z0-9_\-]', '_'
    $targetPath = Join-Path $ramDrive $safeLabel

    Write-Output "[VCACHE] Redirecting $CachePath -> $targetPath"

    # Backup original (rename to .solas-original)
    $backupPath = "$CachePath.solas-original"
    if (Test-Path $backupPath) {
        Write-JsonError "Backup already exists at $backupPath — unredirect first." 'redirect-cache'
        exit 1
    }
    try {
        Rename-Item -Path $CachePath -NewName (Split-Path $backupPath -Leaf) -ErrorAction Stop
    } catch {
        Write-JsonError "Failed to backup original: $($_.Exception.Message)" 'redirect-cache'
        exit 1
    }

    # Create target folder on RAM disk
    if (-not (Test-Path $targetPath)) {
        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
    }

    # Create symlink: original path -> target on RAM disk
    try {
        New-Item -ItemType SymbolicLink -Path $CachePath -Target $targetPath -ErrorAction Stop | Out-Null
    } catch {
        # Restore backup on failure
        try { Rename-Item -Path $backupPath -NewName (Split-Path $CachePath -Leaf) } catch {}
        Write-JsonError "Failed to create symlink: $($_.Exception.Message)" 'redirect-cache'
        exit 1
    }

    # Record redirect
    $redirectsFile = Get-RedirectsFile
    $redirects = @()
    if (Test-Path $redirectsFile) {
        try { $redirects = @(Get-Content $redirectsFile -Raw | ConvertFrom-Json) } catch {}
    }
    $redirects += @{
        label = $CacheLabel
        originalPath = $CachePath
        backupPath = $backupPath
        targetPath = $targetPath
        redirectedIso = (Get-Date).ToString('o')
    }
    $redirects | ConvertTo-Json -Depth 4 | Out-File -FilePath $redirectsFile -Encoding UTF8

    Write-AuditLog -Action 'vcache-redirect-cache' -Result 'success' -Target $CachePath -Details "Target=$targetPath"
    Write-TimedJsonResult @{
        success = $true
        message = "Cache redirected: $CacheLabel -> $targetPath (original backed up at $backupPath)"
    } $timer
}

function Invoke-UnredirectCache {
    if (-not (Test-SafePath $CachePath)) {
        Write-JsonError "Invalid cache path: $CachePath" 'unredirect-cache'
        exit 1
    }
    $redirectsFile = Get-RedirectsFile
    if (-not (Test-Path $redirectsFile)) {
        Write-JsonError 'No redirects configured.' 'unredirect-cache'
        exit 1
    }
    $redirects = @(Get-Content $redirectsFile -Raw | ConvertFrom-Json)
    $match = $redirects | Where-Object { $_.originalPath -eq $CachePath } | Select-Object -First 1
    if (-not $match) {
        Write-JsonError "No redirect found for: $CachePath" 'unredirect-cache'
        exit 1
    }

    Write-Output "[VCACHE] Removing redirect for $CachePath"

    # Remove symlink
    if (Test-Path $CachePath) {
        try {
            Remove-Item -Path $CachePath -Force -ErrorAction Stop
        } catch {
            Write-JsonError "Failed to remove symlink: $($_.Exception.Message)" 'unredirect-cache'
            exit 1
        }
    }

    # Restore backup
    if (Test-Path $match.backupPath) {
        try {
            Rename-Item -Path $match.backupPath -NewName (Split-Path $CachePath -Leaf) -ErrorAction Stop
        } catch {
            Write-JsonError "Failed to restore backup: $($_.Exception.Message)" 'unredirect-cache'
            exit 1
        }
    }

    # Remove from redirects file
    $remaining = @($redirects | Where-Object { $_.originalPath -ne $CachePath })
    $remaining | ConvertTo-Json -Depth 4 | Out-File -FilePath $redirectsFile -Encoding UTF8

    Write-AuditLog -Action 'vcache-unredirect-cache' -Result 'success' -Target $CachePath
    Write-TimedJsonResult @{
        success = $true
        message = "Redirect removed. Original cache folder restored."
    } $timer
}

function Invoke-GetRecommendations {
    # Recommend RAM disk size based on total system RAM.
    # Rule: max(512MB, min(totalRAM * 25%, 8GB))
    try {
        $totalRam = (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue).TotalPhysicalMemory
        if (-not $totalRam) {
            $totalRam = (Get-CimInstance -ClassName Win32_PhysicalMemory -ErrorAction SilentlyContinue |
                         Measure-Object -Property Capacity -Sum).Sum
        }
    } catch { $totalRam = 8GB }

    $recommendedMB = [math]::Max(512, [math]::Min([math]::Round($totalRam * 0.25 / 1MB), 8192))

    # Common cache paths user might want to redirect
    $candidates = @(
        @{ label = 'Chrome Cache'; path = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache" },
        @{ label = 'Edge Cache'; path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache" },
        @{ label = 'Firefox Cache'; path = "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles" },
        @{ label = 'Windows Temp'; path = $env:TEMP },
        @{ label = 'Shader Cache (NVIDIA)'; path = "$env:LOCALAPPDATA\NVIDIA\DXCache" }
    ) | Where-Object { Test-Path $_.path } | ForEach-Object {
        @{ label = $_.label; path = $_.path; exists = $true }
    }

    Write-TimedJsonResult @{
        success = $true
        recommendedSizeMB = $recommendedMB
        totalRamBytes = $totalRam
        candidateCaches = $candidates
        message = "Recommended RAM disk size: ${recommendedMB}MB (25% of $([math]::Round($totalRam/1GB, 1))GB system RAM)"
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'check-imdisk'        { Invoke-CheckImDisk }
        'install-imdisk'      { Invoke-InstallImDisk }
        'create-ramdisk'      { Invoke-CreateRamdisk }
        'remove-ramdisk'      { Invoke-RemoveRamdisk }
        'get-status'          { Invoke-GetStatus }
        'redirect-cache'      { Invoke-RedirectCache }
        'unredirect-cache'    { Invoke-UnredirectCache }
        'get-recommendations' { Invoke-GetRecommendations }
        default {
            Write-JsonError "Invalid action: $Action" 'v_cache'
        }
    }
} catch {
    Write-AuditLog -Action "vcache-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "v_cache.$Action"
}
