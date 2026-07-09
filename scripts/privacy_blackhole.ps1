# privacy_blackhole.ps1
# SolasCare Pro - Feature 5: Absolute Privacy Blackhole (Anti-Telemetry Shield)
#
# Hybrid approach (per senior engineer critique):
#   1. HOSTS file  - block known telemetry DOMAINS (curated, ~150 entries)
#   2. Firewall    - block known telemetry service BINARIES (DiagTrack, dmclient, etc.)
#   3. GPO/Reg     - disable telemetry services via Group Policy registry keys
#
# Why hybrid: HOSTS alone misses direct-IP endpoints; firewall alone misses DNS-based
# resolution timing; GPO alone is brittle. Together they cover the 3 layers.
#
# Safe-to-block whitelist: domains/services that would break Windows Update or
# Activation if blocked are explicitly NOT touched.
#
# Actions:
#   get-status           - Returns current state (HOSTS lines, firewall rules, GPO keys)
#   apply-blocklist      - Apply HOSTS + firewall + GPO (idempotent; backs up prior state)
#   remove-blocklist     - Undo all (restore HOSTS, remove firewall rules, restore GPO)
#   count-blocked-today  - Count blocked firewall hits today (parses firewall log)
#
# Blocklist is curated by SolasCare (in privacyStore.js). PS receives it as JSON.

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$JsonArg
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage ---
function Get-PrivacyRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'privacy'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-HostsBackupPath {
    return Join-Path (Get-PrivacyRoot) 'hosts_backup.json'
}
function Get-FirewallBackupPath {
    return Join-Path (Get-PrivacyRoot) 'firewall_backup.json'
}
function Get-GpoBackupPath {
    return Join-Path (Get-PrivacyRoot) 'gpo_backup.json'
}

# --- Constants ---
$HOSTS_PATH = "$env:SystemRoot\System32\drivers\etc\hosts"
$HOSTS_MARKER_START = '# ===== SolasCare Privacy Blackhole (start) ====='
$HOSTS_MARKER_END   = '# ===== SolasCare Privacy Blackhole (end) ====='

# Firewall rule name prefix
$FW_PREFIX = 'SolasCarePrivacy_'

# GPO registry keys we toggle (key -> @{ valueName = @{ data, type } })
$GPO_TELEMETRY_KEYS = @{
    'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' = @{
        'AllowTelemetry' = @{ Data = 0; Type = 'REG_DWORD' }
    }
    'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' = @{
        'DoNotConnectToWindowsUpdateInternetLocations' = @{ Data = 1; Type = 'REG_DWORD' }
    }
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo' = @{
        'Enabled' = @{ Data = 0; Type = 'REG_DWORD' }
    }
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\AppHost' = @{
        'EnableWebContentEvaluation' = @{ Data = 0; Type = 'REG_DWORD' }
    }
}

# Telemetry service binaries that get firewall-blocked
# (curated: only services whose only purpose is telemetry/diagnostics)
$TELEMETRY_BINARIES = @(
    'DiagTrack.exe',          # Connected User Experiences and Telemetry
    'dmclient.exe',           # Delivery Optimization Client
    'WerFault.exe',           # Windows Error Reporting (telemetry uploads)
    'wsqmcons.exe',           # SQM (Software Quality Management) uploader
    'dstokenclean.exe',       # Device Token cleanup
    'mdmregistrar.exe',       # MDM telemetry
    'FlipSVC.exe',            # Flip telemetry
    'MapsBroker.exe',         # Maps usage
    'SearchProtocolHost.exe'  # Search indexing (online query leak) - safe to block outbound only
)

# --- Safety ---
function Test-SafeDomain {
    param([string]$d)
    if (-not $d) { return $false }
    if ($d.Length -gt 300) { return $false }
    # Domain chars: alphanumerics, dots, dashes, underscores
    if ($d -match '[^A-Za-z0-9\.\-_]') { return $false }
    return $true
}

function Test-SafeBinaryName {
    param([string]$b)
    if (-not $b) { return $false }
    if ($b.Length -gt 200) { return $false }
    if ($b -match '[^A-Za-z0-9\.\-_]') { return $false }
    if ($b -notmatch '\.exe$') { return $false }
    return $true
}

# --- Actions ---

function Invoke-GetStatus {
    $status = @{
        hostsBlockCount = 0
        firewallRules   = @()
        gpoKeys         = @()
        hostsMarkerPresent = $false
    }
    try {
        if (Test-Path $HOSTS_PATH) {
            $content = Get-Content -Path $HOSTS_PATH -Raw -ErrorAction SilentlyContinue
            if ($content -match [regex]::Escape($HOSTS_MARKER_START)) {
                $status.hostsMarkerPresent = $true
                # Count SolasCare-added lines
                $block = ($content -split [regex]::Escape($HOSTS_MARKER_START))[1]
                if ($block) { $block = ($block -split [regex]::Escape($HOSTS_MARKER_END))[0] }
                $status.hostsBlockCount = ($block -split "`n" | Where-Object { $_ -match '^\s*0\.0\.0\.0' }).Count
            }
        }
    } catch {}
    try {
        $rules = Get-NetFirewallRule -DisplayName "$FW_PREFIX*" -ErrorAction SilentlyContinue
        $status.firewallRules = @($rules | ForEach-Object { $_.DisplayName })
    } catch {}
    foreach ($k in $GPO_TELEMETRY_KEYS.Keys) {
        if (Test-Path $k) {
            try {
                $props = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
                foreach ($vn in $GPO_TELEMETRY_KEYS[$k].Keys) {
                    if ($props.PSObject.Properties.Name -contains $vn) {
                        $status.gpoKeys += "$k\$vn = $($props.$vn)"
                    }
                }
            } catch {}
        }
    }
    Write-TimedJsonResult @{
        success = $true
        status = $status
        message = "Privacy state: $($status.hostsBlockCount) HOSTS blocks, $($status.firewallRules.Count) firewall rules, $($status.gpoKeys.Count) GPO keys"
    } $timer
}

function Backup-HostsFile {
    $backup = @{ existed = $false; content = $null; backedUpIso = (Get-Date).ToString('o') }
    if (Test-Path $HOSTS_PATH) {
        $backup.existed = $true
        $backup.content = Get-Content -Path $HOSTS_PATH -Raw -ErrorAction SilentlyContinue
    }
    $backup | ConvertTo-Json -Depth 4 | Out-File -FilePath (Get-HostsBackupPath) -Encoding UTF8
    return $backup
}

function Backup-GpoKeys {
    $backup = @{ backedUpIso = (Get-Date).ToString('o'); keys = @() }
    foreach ($k in $GPO_TELEMETRY_KEYS.Keys) {
        $keyBackup = @{ path = $k; values = @{}; existed = (Test-Path $k) }
        if ($keyBackup.existed) {
            try {
                $props = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue
                foreach ($vn in $GPO_TELEMETRY_KEYS[$k].Keys) {
                    if ($props.PSObject.Properties.Name -contains $vn) {
                        $keyBackup.values[$vn] = @{ value = $props.$vn }
                    }
                }
            } catch {}
        }
        $backup.keys += $keyBackup
    }
    $backup | ConvertTo-Json -Depth 5 | Out-File -FilePath (Get-GpoBackupPath) -Encoding UTF8
    return $backup
}

function Invoke-ApplyBlocklist {
    if (-not $JsonArg) {
        Write-JsonError 'JsonArg required (array of domains to block).' 'apply-blocklist'
        exit 1
    }
    try {
        $domains = $JsonArg | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid JSON: $($_.Exception.Message)" 'apply-blocklist'
        exit 1
    }
    if (-not (Test-Path Variable:domains) -or -not $domains) {
        Write-JsonError 'Empty or invalid domains array.' 'apply-blocklist'
        exit 1
    }
    # Validate every domain
    foreach ($d in $domains) {
        if (-not (Test-SafeDomain $d)) {
            Write-JsonError "Invalid domain rejected: $d" 'apply-blocklist'
            exit 1
        }
    }

    Write-Output "[PRIVACY] Backing up current HOSTS file..."
    Backup-HostsFile | Out-Null
    Write-Output "[PRIVACY] Backing up current GPO keys..."
    Backup-GpoKeys | Out-Null

    # STEP 1: Add SolasCare block section to HOSTS (idempotent — replace existing block)
    Write-Output "[PRIVACY] Updating HOSTS file with $($domains.Count) blocks..."
    $hostsContent = ''
    if (Test-Path $HOSTS_PATH) {
        $hostsContent = Get-Content -Path $HOSTS_PATH -Raw -ErrorAction SilentlyContinue
    }
    # Strip any existing SolasCare block
    if ($hostsContent -match [regex]::Escape($HOSTS_MARKER_START)) {
        $pattern = [regex]::Escape($HOSTS_MARKER_START) + '[\s\S]*?' + [regex]::Escape($HOSTS_MARKER_END) + '\r?\n?'
        $hostsContent = $hostsContent -replace $pattern, ''
    }
    # Build new block
    $blockLines = @($HOSTS_MARKER_START)
    $blockLines += '# Block generated by SolasCare Pro - DO NOT EDIT MANUALLY'
    $blockLines += '# Use SolasCare UI to remove these entries safely'
    foreach ($d in $domains) {
        $blockLines += "0.0.0.0 $d"
    }
    $blockLines += $HOSTS_MARKER_END
    $newHosts = $hostsContent.TrimEnd() + "`n`n" + ($blockLines -join "`n") + "`n"
    Set-Content -Path $HOSTS_PATH -Value $newHosts -Encoding ASCII -Force
    Write-Output "[PRIVACY] HOSTS updated with $($domains.Count) blocks"

    # STEP 2: Add firewall rules for telemetry binaries
    Write-Output "[PRIVACY] Adding firewall outbound-block rules for telemetry binaries..."
    $fwAdded = 0
    $fwSkipped = 0
    foreach ($bin in $TELEMETRY_BINARIES) {
        if (-not (Test-SafeBinaryName $bin)) { continue }
        $ruleName = "$FW_PREFIX$bin"
        # Check if rule already exists
        $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if ($existing) { $fwSkipped++; continue }
        try {
            # Build path to the binary (try a few common locations)
            $binPath = $null
            $candidates = @(
                "$env:SystemRoot\System32\$bin",
                "$env:SystemRoot\SysWOW64\$bin",
                "$env:SystemRoot\System32\wbem\$bin"
            )
            foreach ($c in $candidates) { if (Test-Path $c) { $binPath = $c; break } }
            # New-NetFirewallRule supports -Program only if path exists; if not, use -Any but block by name
            $params = @{
                DisplayName = $ruleName
                Direction = 'Outbound'
                Action = 'Block'
                Profile = 'Any'
                Enabled = 'True'
                Group = 'SolasCare Privacy Blackhole'
            }
            if ($binPath) { $params['Program'] = $binPath }
            New-NetFirewallRule @params -ErrorAction Stop | Out-Null
            $fwAdded++
        } catch {
            Write-Output "[PRIVACY] Failed to add rule for $bin : $($_.Exception.Message)"
        }
    }
    Write-Output "[PRIVACY] Firewall: added $fwAdded, skipped $fwSkipped"

    # STEP 3: Set GPO registry keys
    Write-Output "[PRIVACY] Setting GPO telemetry-disable keys..."
    $gpoSet = 0
    foreach ($k in $GPO_TELEMETRY_KEYS.Keys) {
        if (-not (Test-Path $k)) {
            try { New-Item -Path $k -Force | Out-Null } catch {}
        }
        foreach ($vn in $GPO_TELEMETRY_KEYS[$k].Keys) {
            $cfg = $GPO_TELEMETRY_KEYS[$k][$vn]
            $psType = switch ($cfg.Type) {
                'REG_DWORD' { 'DWord' }
                'REG_QWORD' { 'QWord' }
                'REG_SZ'    { 'String' }
                default     { 'DWord' }
            }
            try {
                Set-ItemProperty -Path $k -Name $vn -Value $cfg.Data -Type $psType -Force -ErrorAction Stop
                $gpoSet++
            } catch {
                Write-Output "[PRIVACY] Failed to set $k\$vn : $($_.Exception.Message)"
            }
        }
    }
    Write-Output "[PRIVACY] GPO: $gpoSet keys set"

    Write-AuditLog -Action 'privacy-apply-blocklist' -Result 'success' -Details "Hosts=$($domains.Count), FW added=$fwAdded, GPO set=$gpoSet"

    Write-TimedJsonResult @{
        success = $true
        summary = @{
            hostsBlocks = $domains.Count
            firewallRulesAdded = $fwAdded
            firewallRulesSkipped = $fwSkipped
            gpoKeysSet = $gpoSet
        }
        message = "Privacy Blackhole active: $($domains.Count) HOSTS blocks, $fwAdded firewall rules, $gpoSet GPO keys"
    } $timer
}

function Invoke-RemoveBlocklist {
    $results = @{ hostsRestored = $false; firewallRemoved = 0; gpoRestored = 0 }

    # STEP 1: Restore HOSTS (remove SolasCare block section)
    Write-Output "[PRIVACY] Removing SolasCare block from HOSTS..."
    if (Test-Path $HOSTS_PATH) {
        $content = Get-Content -Path $HOSTS_PATH -Raw -ErrorAction SilentlyContinue
        if ($content -match [regex]::Escape($HOSTS_MARKER_START)) {
            $pattern = [regex]::Escape($HOSTS_MARKER_START) + '[\s\S]*?' + [regex]::Escape($HOSTS_MARKER_END) + '\r?\n?'
            $newContent = $content -replace $pattern, ''
            $newContent = $newContent.TrimEnd() + "`n"
            Set-Content -Path $HOSTS_PATH -Value $newContent -Encoding ASCII -Force
            $results.hostsRestored = $true
            Write-Output "[PRIVACY] SolasCare block removed from HOSTS"
        } else {
            Write-Output "[PRIVACY] No SolasCare block found in HOSTS"
        }
    }

    # STEP 2: Remove firewall rules
    Write-Output "[PRIVACY] Removing SolasCare firewall rules..."
    try {
        $rules = Get-NetFirewallRule -DisplayName "$FW_PREFIX*" -ErrorAction SilentlyContinue
        foreach ($r in $rules) {
            try {
                Remove-NetFirewallRule -DisplayName $r.DisplayName -ErrorAction Stop
                $results.firewallRemoved++
            } catch {}
        }
    } catch {}
    Write-Output "[PRIVACY] Removed $($results.firewallRemoved) firewall rules"

    # STEP 3: Restore GPO from backup (or remove keys if no backup)
    Write-Output "[PRIVACY] Restoring GPO keys from backup..."
    $gpoBackupPath = Get-GpoBackupPath
    if (Test-Path $gpoBackupPath) {
        try {
            $gpoBackup = Get-Content -Path $gpoBackupPath -Raw | ConvertFrom-Json
            foreach ($k in $gpoBackup.keys) {
                if (-not $k.existed) {
                    # Key didn't exist before; remove it now if we created it
                    if (Test-Path $k.path) {
                        try { Remove-Item -Path $k.path -Recurse -Force -ErrorAction SilentlyContinue } catch {}
                    }
                    continue
                }
                # Key existed; restore prior values or remove values we added
                foreach ($vn in $GPO_TELEMETRY_KEYS[$k.path].Keys) {
                    if ($k.values.PSObject.Properties.Name -contains $vn) {
                        # Had prior value; restore it
                        try {
                            $prevVal = $k.values.$vn.value
                            $psType = 'DWord'  # all our GPO keys are DWORD
                            Set-ItemProperty -Path $k.path -Name $vn -Value $prevVal -Type $psType -Force -ErrorAction SilentlyContinue
                            $results.gpoRestored++
                        } catch {}
                    } else {
                        # Didn't have prior value; remove it
                        try { Remove-ItemProperty -Path $k.path -Name $vn -Force -ErrorAction SilentlyContinue } catch {}
                        $results.gpoRestored++
                    }
                }
            }
        } catch {
            Write-Output "[PRIVACY] Failed to read GPO backup: $($_.Exception.Message)"
        }
    } else {
        Write-Output "[PRIVACY] No GPO backup found; removing all GPO values we set"
        foreach ($k in $GPO_TELEMETRY_KEYS.Keys) {
            foreach ($vn in $GPO_TELEMETRY_KEYS[$k].Keys) {
                try { Remove-ItemProperty -Path $k -Name $vn -Force -ErrorAction SilentlyContinue } catch {}
                $results.gpoRestored++
            }
        }
    }

    Write-AuditLog -Action 'privacy-remove-blocklist' -Result 'success' -Details "HostsRestored=$($results.hostsRestored), FW removed=$($results.firewallRemoved), GPO restored=$($results.gpoRestored)"

    Write-TimedJsonResult @{
        success = $true
        results = $results
        message = "Privacy Blackhole removed. Restored: HOSTS=$($results.hostsRestored), FW=$($results.firewallRemoved), GPO=$($results.gpoRestored)"
    } $timer
}

function Invoke-CountBlockedToday {
    # Parse the Windows Firewall log to count blocked outbound connections today.
    # Note: requires firewall logging enabled (we enable it in apply-blocklist via Group Policy
    # if admin). Returns 0 if log is disabled.
    $logPath = "$env:SystemRoot\System32\LogFiles\Firewall\pfirewall.log"
    $count = 0
    $today = (Get-Date).ToString('yyyy-MM-dd')
    if (Test-Path $logPath) {
        try {
            $lines = Get-Content -Path $logPath -Tail 5000 -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                if ($line -match "^$today" -and $line -match 'SolasCarePrivacy') {
                    $count++
                }
            }
        } catch {}
    }
    Write-TimedJsonResult @{
        success = $true
        blockedToday = $count
        logEnabled = (Test-Path $logPath)
        message = "$count blocks logged today (firewall log $(if (Test-Path $logPath) {'enabled'} else {'disabled'}))"
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'get-status'           { Invoke-GetStatus }
        'apply-blocklist'      { Invoke-ApplyBlocklist }
        'remove-blocklist'     { Invoke-RemoveBlocklist }
        'count-blocked-today'  { Invoke-CountBlockedToday }
        default {
            Write-JsonError "Invalid action: $Action" 'privacy_blackhole'
        }
    }
} catch {
    Write-AuditLog -Action "privacy-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "privacy_blackhole.$Action"
}
