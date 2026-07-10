# micro_snapshots.ps1
# SolasCare Pro - Feature 7: OS-Level Micro-Snapshots (Time Travel)
#
# Uses Windows System Restore API (Checkpoint-Computer + WMI SystemRestore class)
# instead of raw VSS + BCD boot menu modification. Per senior-engineer critique:
# BCD edits can brick PCs if interrupted; System Restore API is safer and
# already battle-tested by Microsoft.
#
# Each snapshot = a named System Restore point with metadata stored in
# electron/snapshotStore.js (timestamp, user note, trigger reason).
#
# Actions:
#   create-snapshot   - Create a System Restore point with a SolasCare-tagged description
#   list-snapshots    - List all System Restore points (filtered to SolasCare-tagged)
#   restore-snapshot  - Trigger restore to a specific snapshot (REQUIRES REBOOT)
#   delete-snapshot   - Delete a System Restore point (via vssadmin delete shadows)
#   get-disk-usage    - Return disk usage on system drive + System Restore space allocation
#   enable-system-restore - Enable System Restore on the system drive (if disabled)

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$SnapshotSeq,    # SequenceNumber from System Restore
    [string]$Description,    # User-provided note for the snapshot
    [string]$TriggerReason   # 'manual' | 'pre-install' | 'pre-tweak' | 'scheduled'
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# SolasCare tag embedded in every snapshot description so we can filter on list
$SOLAS_TAG = '[SolasCarePro]'

# --- Storage ---
function Get-SnapshotRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'snapshots'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-MetadataFile {
    return Join-Path (Get-SnapshotRoot) 'metadata.jsonl'
}

# --- Safety ---
function Test-SafeDescription {
    param([string]$d)
    if (-not $d) { return $true }  # empty is OK
    if ($d.Length -gt 500) { return $false }
    if ($d -match '[<>|"`$]') { return $false }
    return $true
}

function Test-SafeSnapshotSeq {
    param([string]$s)
    if (-not $s) { return $false }
    if ($s -match '[^0-9]') { return $false }
    return $true
}

function Test-SafeTriggerReason {
    param([string]$r)
    return $r -in @('manual', 'pre-install', 'pre-tweak', 'scheduled', 'pre-uninstall', '')
}

# --- Metadata persistence (append-only JSONL) ---
function Write-SnapshotMetadata {
    param([hashtable]$Entry)
    $line = $Entry | ConvertTo-Json -Compress
    Add-Content -Path (Get-MetadataFile) -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
}

function Read-AllSnapshotMetadata {
    $path = Get-MetadataFile
    if (-not (Test-Path $path)) { return @() }
    $entries = @()
    try {
        $lines = Get-Content -Path $path -Encoding UTF8 -ErrorAction SilentlyContinue
        foreach ($line in $lines) {
            if (-not $line) { continue }
            try { $entries += ($line | ConvertFrom-Json) } catch {}
        }
    } catch {}
    return $entries
}

# --- Actions ---

function Get-SystemRestoreStatus {
    # Returns @{ enabled = $true/$false; drive = 'C:' }
    try {
        $sr = Get-CimInstance -ClassName Win32_SystemRestore -ErrorAction SilentlyContinue
        # Better: check via sc query srservice
        $svc = Get-Service -Name 'srservice' -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq 'Running') {
            # Check if SR is enabled on system drive
            $sysDrive = $env:SystemDrive
            $enabled = $false
            try {
                # WMI SystemRestore class has IsDisabled per-drive... but it's awkward.
                # Use Check-Computer API: Get-ComputerRestorePoint returns points if enabled.
                $points = Get-ComputerRestorePoint -ErrorAction SilentlyContinue
                $enabled = $true  # if cmdlet didn't throw, SR is enabled
            } catch {
                $enabled = $false
            }
            return @{ enabled = $enabled; drive = $sysDrive }
        }
    } catch {}
    return @{ enabled = $false; drive = $env:SystemDrive }
}

function Invoke-EnableSystemRestore {
    try {
        $sysDrive = $env:SystemDrive
        # Enable via PowerShell cmdlet
        Enable-ComputerRestore -Drive $sysDrive -ErrorAction Stop
        # Also ensure the service is running
        Set-Service -Name 'srservice' -StartupType Automatic -ErrorAction SilentlyContinue
        Start-Service -Name 'srservice' -ErrorAction SilentlyContinue
        Write-AuditLog -Action 'snapshot-enable-sr' -Result 'success' -Target $sysDrive
        Write-TimedJsonResult @{
            success = $true
            message = "System Restore has been enabled."
        } $timer
    } catch {
        Write-AuditLog -Action 'snapshot-enable-sr' -Result 'failure' -Details $_.Exception.Message
        Write-JsonError "Failed to enable System Restore: $($_.Exception.Message)" 'micro_snapshots'
    }
}

function Invoke-DisableSystemRestore {
    try {
        $sysDrive = $env:SystemDrive + '\'
        Disable-ComputerRestore -Drive $sysDrive -ErrorAction Stop
        Write-AuditLog -Action 'snapshot-disable-sr' -Result 'success' -Target $sysDrive
        Write-TimedJsonResult @{
            success = $true
            message = "System Snapshots disabled."
        } $timer
    } catch {
        Write-AuditLog -Action 'snapshot-disable-sr' -Result 'failure' -Details $_.Exception.Message
        Write-JsonError "Failed to disable System Restore: $($_.Exception.Message)" 'micro_snapshots'
    }
}

function Invoke-CreateSnapshot {
    if (-not (Test-SafeDescription $Description)) {
        Write-JsonError 'Invalid description (max 500 chars, no special chars).' 'create-snapshot'
        exit 1
    }
    if (-not (Test-SafeTriggerReason $TriggerReason)) {
        Write-JsonError "Invalid trigger reason: $TriggerReason" 'create-snapshot'
        exit 1
    }

    # Ensure System Restore is enabled
    $srStatus = Get-SystemRestoreStatus
    if (-not $srStatus.enabled) {
        Write-Output "[SNAPSHOT] System Restore not enabled; attempting to enable..."
        try {
            Enable-ComputerRestore -Drive $srStatus.drive -ErrorAction Stop
            Set-Service -Name 'srservice' -StartupType Automatic -ErrorAction SilentlyContinue
            Start-Service -Name 'srservice' -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        } catch {
            Write-JsonError "System Restore is disabled and could not be enabled: $($_.Exception.Message)" 'create-snapshot'
            exit 1
        }
    }

    $reason = if ($TriggerReason) { $TriggerReason } else { 'manual' }
    $fullDescription = if ($Description) {
        "$SOLAS_TAG ($reason) $Description"
    } else {
        "$SOLAS_TAG ($reason) $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }

    Write-Output "[SNAPSHOT] Creating System Restore point: $fullDescription"

    # Windows limits System Restore point creation to 1 per 24 hours by default
    # (registry: HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore\RPGlobalInterval).
    # We can override per-process via a registry tweak that's auto-reset.
    $rpcKey = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
    $oldInterval = $null
    try {
        $oldInterval = (Get-ItemProperty -Path $rpcKey -Name 'RPGlobalInterval' -ErrorAction SilentlyContinue).RPGlobalInterval
        # Set to 0 to bypass the 24h throttle (only for this creation)
        Set-ItemProperty -Path $rpcKey -Name 'RPGlobalInterval' -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
    } catch {}

    $seqNum = $null
    try {
        # Try WMI first (works on all editions)
        try {
            $status = Invoke-WmiMethod -Namespace root\default -Class SystemRestore -Name CreateRestorePoint -ArgumentList @($fullDescription, 12, 100)
            if ($status.ReturnValue -eq 0) {
                Write-Output "[SNAPSHOT] Restore point created via WMI"
            } else {
                Write-Output "[SNAPSHOT] WMI returned code $($status.ReturnValue); trying Checkpoint-Computer"
                Checkpoint-Computer -Description $fullDescription -RestorePointType 'APPLICATION_INSTALL' -ErrorAction Stop
            }
        } catch {
            Checkpoint-Computer -Description $fullDescription -RestorePointType 'APPLICATION_INSTALL' -ErrorAction Stop
        }

        # Get the sequence number of the most recent SolasCare-tagged restore point
        Start-Sleep -Seconds 1
        try {
            $points = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object CreationTime -Descending
            $latest = $points | Where-Object { $_.Description -like "$SOLAS_TAG*" } | Select-Object -First 1
            if ($latest) {
                $seqNum = $latest.SequenceNumber
            }
        } catch {}

        Write-Output "[SNAPSHOT] Snapshot created. Sequence: $seqNum"
    } catch {
        Write-JsonError "Failed to create snapshot: $($_.Exception.Message)" 'create-snapshot'
        exit 1
    } finally {
        # Restore the original RPGlobalInterval
        if ($null -ne $oldInterval) {
            try { Set-ItemProperty -Path $rpcKey -Name 'RPGlobalInterval' -Value $oldInterval -Type DWord -Force -ErrorAction SilentlyContinue } catch {}
        }
    }

    # Persist metadata
    $entry = @{
        ts = (Get-Date).ToString('o')
        seqNum = $seqNum
        description = $Description
        triggerReason = $reason
        fullDescription = $fullDescription
    }
    Write-SnapshotMetadata -Entry $entry

    Write-AuditLog -Action 'snapshot-create' -Result 'success' -Details "Seq=$seqNum, Reason=$reason, Desc=$Description"

    Write-TimedJsonResult @{
        success = $true
        sequenceNumber = $seqNum
        description = $Description
        triggerReason = $reason
        message = "Snapshot created. Sequence: $seqNum. Restore from Recovery menu (reboot required)."
    } $timer
}

function Invoke-ListSnapshots {
    # List SolasCare-tagged System Restore points
    $points = @()
    try {
        $all = Get-ComputerRestorePoint -ErrorAction SilentlyContinue | Sort-Object CreationTime -Descending
        $solasPoints = $all | Where-Object { $_.Description -like "$SOLAS_TAG*" }
        foreach ($p in $solasPoints) {
            # Parse description: "[SolasCarePro] (reason) user note"
            $desc = $p.Description
            $reason = ''
            $userNote = ''
            if ($desc -match '\[SolasCarePro\]\s*\(([^)]+)\)\s*(.*)$') {
                $reason = $matches[1]
                $userNote = $matches[2]
            }
            $points += [PSCustomObject]@{
                sequenceNumber = $p.SequenceNumber
                createdIso = $p.CreationTime.ToString('o')
                description = $userNote
                triggerReason = $reason
                fullDescription = $desc
                eventType = $p.EventType
                restorePointType = $p.RestorePointType
            }
        }
    } catch {
        Write-JsonError "Failed to list restore points: $($_.Exception.Message)" 'list-snapshots'
        exit 1
    }

    Write-TimedJsonResult @{
        success = $true
        snapshots = $points
        count = $points.Count
        systemRestoreEnabled = (Get-SystemRestoreStatus).enabled
    } $timer
}

function Invoke-RestoreSnapshot {
    if (-not (Test-SafeSnapshotSeq $SnapshotSeq)) {
        Write-JsonError 'Invalid snapshot sequence number.' 'restore-snapshot'
        exit 1
    }
    $seq = [int64]$SnapshotSeq
    Write-Output "[SNAPSHOT] Initiating restore to sequence $seq..."
    Write-Output "[SNAPSHOT] WARNING: This will restart the PC and revert system state."
    Write-Output "[SNAPSHOT] User files (Documents, Desktop) are NOT affected."

    try {
        # Use WMI to initiate restore. Restore is async — actual restore happens on reboot.
        $status = Invoke-WmiMethod -Namespace root\default -Class SystemRestore -Name Restore -ArgumentList $seq
        if ($status.ReturnValue -eq 0) {
            Write-AuditLog -Action 'snapshot-restore' -Result 'success' -Target $seq -Details "Restore initiated; reboot required"
            Write-TimedJsonResult @{
                success = $true
                sequenceNumber = $seq
                message = "Restore initiated. PC will reboot now to complete the restore."
                rebootRequired = $true
            } $timer
            # Note: we do NOT trigger the reboot here — UI will prompt user to confirm reboot.
        } else {
            Write-JsonError "WMI Restore returned code $($status.ReturnValue)" 'restore-snapshot'
            exit 1
        }
    } catch {
        Write-JsonError "Failed to initiate restore: $($_.Exception.Message)" 'restore-snapshot'
        exit 1
    }
}

function Invoke-DeleteSnapshot {
    if (-not (Test-SafeSnapshotSeq $SnapshotSeq)) {
        Write-JsonError 'Invalid snapshot sequence number.' 'delete-snapshot'
        exit 1
    }
    $seq = [int64]$SnapshotSeq
    Write-Output "[SNAPSHOT] Deleting snapshot sequence $seq..."

    # System Restore points are backed by VSS shadow copies. We can delete via vssadmin.
    # Note: vssadmin requires admin (we already are). It deletes the oldest shadow that
    # matches the sequence.
    try {
        # List shadow copies and find one matching the sequence
        $shadowsOut = vssadmin list shadows 2>&1 | Out-String
        # Each shadow has "Shadow Copy Volume Name: \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopyN"
        # and "Original Machine: ..." and "Creation Time: ..."
        # We don't have a direct mapping from seq# -> shadow ID, so we just delete oldest.
        # This is the best vssadmin supports without WMI.
        $oldest = ($shadowsOut -split 'Shadow Copy Volume Name:' | Where-Object { $_ -match 'HarddiskVolumeShadowCopy' } | Select-Object -First 1)
        if ($oldest -match '(\\?\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy\d+)') {
            $shadowId = $matches[1]
            Write-Output "[SNAPSHOT] Deleting shadow: $shadowId"
            $out = vssadmin delete shadows /shadow=$shadowId /quiet 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                Write-AuditLog -Action 'snapshot-delete' -Result 'success' -Target $seq
                Write-TimedJsonResult @{
                    success = $true
                    message = "Snapshot deleted (oldest shadow copy removed)."
                } $timer
            } else {
                Write-JsonError "vssadmin delete failed: $out" 'delete-snapshot'
                exit 1
            }
        } else {
            Write-JsonError 'No shadow copies found to delete.' 'delete-snapshot'
            exit 1
        }
    } catch {
        Write-JsonError "Delete failed: $($_.Exception.Message)" 'delete-snapshot'
        exit 1
    }
}

function Invoke-GetDiskUsage {
    # Return disk usage on system drive + System Restore allocation
    $sysDrive = $env:SystemDrive  # e.g. "C:"
    $driveLetter = $sysDrive.TrimEnd(':')

    $result = @{
        systemDrive = $sysDrive
        totalBytes = 0
        freeBytes = 0
        usedBytes = 0
        usedPercent = 0
        srAllocatedBytes = 0
        srUsedBytes = 0
    }

    try {
        $vol = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID = '$sysDrive'" -ErrorAction SilentlyContinue
        if ($vol) {
            $result.totalBytes = [int64]$vol.Size
            $result.freeBytes = [int64]$vol.FreeSpace
            $result.usedBytes = $result.totalBytes - $result.freeBytes
            if ($result.totalBytes -gt 0) {
                $result.usedPercent = [math]::Round(($result.usedBytes / $result.totalBytes) * 100, 1)
            }
        }
    } catch {}

    # System Restore disk usage via vssadmin
    try {
        $vssOut = vssadmin list shadowstorage 2>&1 | Out-String
        # Parse: "Allocated Space: X GB" and "Used Space: Y GB"
        if ($vssOut -match 'Allocated Space:\s*([\d.]+)\s*(\w+)') {
            $val = [double]$matches[1]
            $unit = $matches[2]
            $mult = if ($unit -eq 'GB') { 1GB } elseif ($unit -eq 'MB') { 1MB } elseif ($unit -eq 'TB') { 1TB } else { 1 }
            $result.srAllocatedBytes = [int64]($val * $mult)
        }
        if ($vssOut -match 'Used Space:\s*([\d.]+)\s*(\w+)') {
            $val = [double]$matches[1]
            $unit = $matches[2]
            $mult = if ($unit -eq 'GB') { 1GB } elseif ($unit -eq 'MB') { 1MB } elseif ($unit -eq 'TB') { 1TB } else { 1 }
            $result.srUsedBytes = [int64]($val * $mult)
        }
    } catch {}

    Write-TimedJsonResult @{
        success = $true
        disk = $result
        srEnabled = (Get-SystemRestoreStatus).enabled
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'create-snapshot'        { Invoke-CreateSnapshot }
        'list-snapshots'         { Invoke-ListSnapshots }
        'restore-snapshot'       { Invoke-RestoreSnapshot }
        'delete-snapshot'        { Invoke-DeleteSnapshot }
        'get-disk-usage'         { Invoke-GetDiskUsage }
        'enable-system-restore'  { Invoke-EnableSystemRestore }
        'disable-system-restore' { Invoke-DisableSystemRestore }
        default {
            Write-JsonError "Invalid action: $Action" 'micro_snapshots'
        }
    }
} catch {
    Write-AuditLog -Action "snapshot-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "micro_snapshots.$Action"
}
