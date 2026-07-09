# pc_clone.ps1
# SolasCare Pro - Feature 8: One-Click PC Clone (Migration Master)
#
# Exports an encrypted .solasclone file containing:
#   - Installed apps (winget export)
#   - Wi-Fi profiles (netsh wlan export profile)
#   - SolasCare Workspace profiles (from workspaceStore)
#   - SolasCare Tweak catalog + applied state (from tweakerStore)
#
# Import restores everything on a new PC.
#
# Encryption: AES-256-GCM via Node.js (handled in electron/cloneStore.js — PS just
# collects raw export data and writes it to a temp file; JS encrypts and saves the
# final .solasclone file).
#
# Actions:
#   get-exportable-items - Returns counts of apps / Wi-Fi profiles / tweaks available
#   export-clone         - Collects raw export data, writes to a temp .json file
#                          (JS layer reads this, encrypts, writes .solasclone)
#   import-clone         - Reads .solasclone (JS decrypts first, writes temp .json),
#                          PS reads temp .json and applies (winget import, netsh wlan add, etc.)

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$ExportPath,    # for export: temp .json path; for import: decrypted .json path
    [string]$JsonArg        # for import: JSON config {installApps, restoreWifi, restoreTweaks, restoreWorkspaces}
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage ---
function Get-CloneRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'clone'
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

# --- Actions ---

function Invoke-GetExportableItems {
    # Return counts of what can be exported
    $result = @{
        wingetApps = 0
        wifiProfiles = 0
        solasWorkspaces = 0
        solasTweaksApplied = 0
        wingetAvailable = $false
    }

    # Winget availability + app count
    try {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            $result.wingetAvailable = $true
            $listOut = winget list --accept-source-agreements 2>$null | Out-String
            # Count lines that look like app entries (skip header lines)
            $lines = $listOut -split "`n" | Where-Object { $_ -match '^\s+\S+\s+\S+\s+\S+' }
            $result.wingetApps = $lines.Count
        }
    } catch {}

    # Wi-Fi profiles
    try {
        $wifiOut = netsh wlan show profiles 2>&1 | Out-String
        $profiles = $wifiOut -split "`n" | Where-Object { $_ -match 'All User Profile\s+:\s+(.+)$' }
        $result.wifiProfiles = $profiles.Count
    } catch {}

    # SolasCare workspaces + tweaks — read from JSON files
    try {
        $wsFile = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'workspace\profiles.json'
        if (Test-Path $wsFile) {
            $ws = Get-Content $wsFile -Raw | ConvertFrom-Json
            $result.solasWorkspaces = @($ws).Count
        }
    } catch {}
    try {
        $twFile = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'tweaker\applied.jsonl'
        if (Test-Path $twFile) {
            $lines = Get-Content $twFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ }
            $applies = @($lines | ForEach-Object { try { ($_ | ConvertFrom-Json) } catch {} } |
                         Where-Object { $_.action -eq 'apply' })
            $undones = @($lines | ForEach-Object { try { ($_ | ConvertFrom-Json) } catch {} } |
                        Where-Object { $_.action -eq 'undo' })
            # Rough count of currently-applied tweaks (apply count minus undo count)
            $result.solasTweaksApplied = [Math]::Max(0, $applies.Count - $undones.Count)
        }
    } catch {}

    Write-TimedJsonResult @{
        success = $true
        items = $result
        message = "Exportable: $($result.wingetApps) apps, $($result.wifiProfiles) Wi-Fi profiles, $($result.solasWorkspaces) workspaces, $($result.solasTweaksApplied) tweaks applied"
    } $timer
}

function Invoke-ExportClone {
    if (-not $ExportPath) {
        Write-JsonError 'ExportPath required (temp .json path for raw export).' 'export-clone'
        exit 1
    }
    if (-not (Test-SafePath $ExportPath)) {
        Write-JsonError 'Invalid export path.' 'export-clone'
        exit 1
    }

    $export = @{
        solasCloneVersion = 1
        exportedAtIso = (Get-Date).ToString('o')
        sourceMachine = $env:COMPUTERNAME
        sourceUser = $env:USERNAME
        wingetApps = @()
        wifiProfiles = @()
        solasWorkspaces = @()
        solasTweaksApplied = @()
    }

    Write-Output "[CLONE] Step 1/4: Exporting Winget app list..."

    # STEP 1: Winget export
    try {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            $tempWingetJson = Join-Path (Get-CloneRoot) 'winget_export_temp.json'
            winget export -o $tempWingetJson --accept-source-agreements 2>&1 | Out-Null
            if (Test-Path $tempWingetJson) {
                $wingetData = Get-Content $tempWingetJson -Raw | ConvertFrom-Json
                if ($wingetData.Sources) {
                    foreach ($src in $wingetData.Sources) {
                        foreach ($pkg in $src.Packages) {
                            $export.wingetApps += @{
                                id = $pkg.PackageIdentifier
                                source = $src.SourceDetails.Name
                            }
                        }
                    }
                }
                Remove-Item $tempWingetJson -Force -ErrorAction SilentlyContinue
            }
            Write-Output "[CLONE] Exported $($export.wingetApps.Count) Winget apps"
        } else {
            Write-Output "[CLONE] Winget not available; skipping app export"
        }
    } catch {
        Write-Output "[CLONE] Winget export failed: $($_.Exception.Message)"
    }

    Write-Output "[CLONE] Step 2/4: Exporting Wi-Fi profiles..."

    # STEP 2: Wi-Fi profiles (export to temp XML files, read them, delete temp files)
    try {
        $wifiTempDir = Join-Path (Get-CloneRoot) 'wifi_temp'
        if (Test-Path $wifiTempDir) { Remove-Item $wifiTempDir -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Path $wifiTempDir -Force | Out-Null

        netsh wlan export profile key=clear folder="$wifiTempDir" 2>&1 | Out-Null
        $wifiFiles = Get-ChildItem -Path $wifiTempDir -Filter '*.xml' -ErrorAction SilentlyContinue
        foreach ($f in $wifiFiles) {
            try {
                $xml = Get-Content $f.FullName -Raw
                # Extract SSID name from XML
                $ssid = ''
                if ($xml -match '<name>([^<]+)</name>') { $ssid = $matches[1] }
                $export.wifiProfiles += @{
                    ssid = $ssid
                    xml = $xml
                }
            } catch {}
        }
        Remove-Item $wifiTempDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Output "[CLONE] Exported $($export.wifiProfiles.Count) Wi-Fi profiles (with passwords in clear)"
    } catch {
        Write-Output "[CLONE] Wi-Fi export failed: $($_.Exception.Message)"
    }

    Write-Output "[CLONE] Step 3/4: Exporting SolasCare workspaces..."

    # STEP 3: SolasCare workspace profiles
    try {
        $wsFile = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'workspace\profiles.json'
        if (Test-Path $wsFile) {
            $ws = Get-Content $wsFile -Raw | ConvertFrom-Json
            $export.solasWorkspaces = @($ws)
            Write-Output "[CLONE] Exported $($export.solasWorkspaces.Count) workspace profiles"
        }
    } catch {
        Write-Output "[CLONE] Workspace export failed: $($_.Exception.Message)"
    }

    Write-Output "[CLONE] Step 4/4: Exporting SolasCare tweak history..."

    # STEP 4: Tweak history (we export the full history; import replays apply actions)
    try {
        $twFile = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'tweaker\applied.jsonl'
        if (Test-Path $twFile) {
            $lines = Get-Content $twFile -Encoding UTF8 -ErrorAction SilentlyContinue | Where-Object { $_ }
            foreach ($line in $lines) {
                try { $export.solasTweaksApplied += ($line | ConvertFrom-Json) } catch {}
            }
            Write-Output "[CLONE] Exported $($export.solasTweaksApplied.Count) tweak log entries"
        }
    } catch {
        Write-Output "[CLONE] Tweak export failed: $($_.Exception.Message)"
    }

    # Write raw export JSON to ExportPath (JS will encrypt it next)
    $export | ConvertTo-Json -Depth 8 | Out-File -FilePath $ExportPath -Encoding UTF8

    Write-AuditLog -Action 'clone-export' -Result 'success' -Target $ExportPath -Details "Apps=$($export.wingetApps.Count), Wifi=$($export.wifiProfiles.Count), WS=$($export.solasWorkspaces.Count), Tweaks=$($export.solasTweaksApplied.Count)"

    Write-TimedJsonResult @{
        success = $true
        exportPath = $ExportPath
        counts = @{
            wingetApps = $export.wingetApps.Count
            wifiProfiles = $export.wifiProfiles.Count
            solasWorkspaces = $export.solasWorkspaces.Count
            solasTweaksApplied = $export.solasTweaksApplied.Count
        }
        message = "Raw export ready at $ExportPath. JS layer will encrypt to .solasclone."
    } $timer
}

function Invoke-ImportClone {
    if (-not $ExportPath) {
        Write-JsonError 'ExportPath required (path to decrypted .json file).' 'import-clone'
        exit 1
    }
    if (-not (Test-SafePath $ExportPath) -or -not (Test-Path $ExportPath)) {
        Write-JsonError "Decrypted JSON file not found: $ExportPath" 'import-clone'
        exit 1
    }

    # Parse import config (what to restore)
    $cfg = @{ installApps = $true; restoreWifi = $true; restoreTweaks = $true; restoreWorkspaces = $true }
    if ($JsonArg) {
        try { $cfg = ($JsonArg | ConvertFrom-Json) } catch {}
    }

    # Read decrypted clone data
    try {
        $data = Get-Content $ExportPath -Raw | ConvertFrom-Json
    } catch {
        Write-JsonError "Failed to read clone data: $($_.Exception.Message)" 'import-clone'
        exit 1
    }

    $results = @{
        appsInstalled = 0
        appsFailed = 0
        appsSkipped = 0
        wifiRestored = 0
        wifiFailed = 0
        workspacesRestored = 0
        tweaksApplied = 0
        tweaksFailed = 0
    }

    # STEP 1: Winget import
    if ($cfg.installApps -and $data.wingetApps) {
        Write-Output "[CLONE] Step 1/4: Installing $($data.wingetApps.Count) Winget apps..."
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            foreach ($app in $data.wingetApps) {
                $id = $app.id
                if (-not $id) { continue }
                Write-Output "[CLONE] Installing $id ..."
                try {
                    $out = winget install --id $id --silent --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | Out-String
                    if ($LASTEXITCODE -eq 0) {
                        $results.appsInstalled++
                    } elseif ($out -match 'already installed|No applicable update') {
                        $results.appsSkipped++
                    } else {
                        $results.appsFailed++
                        Write-Output "[CLONE] Failed: $id - $out"
                    }
                } catch {
                    $results.appsFailed++
                }
            }
        } else {
            Write-Output "[CLONE] Winget not available on this PC; skipping app install"
        }
    }

    # STEP 2: Wi-Fi profiles
    if ($cfg.restoreWifi -and $data.wifiProfiles) {
        Write-Output "[CLONE] Step 2/4: Restoring $($data.wifiProfiles.Count) Wi-Fi profiles..."
        $wifiTempDir = Join-Path (Get-CloneRoot) 'wifi_import_temp'
        if (Test-Path $wifiTempDir) { Remove-Item $wifiTempDir -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Path $wifiTempDir -Force | Out-Null

        foreach ($wifi in $data.wifiProfiles) {
            try {
                $xmlPath = Join-Path $wifiTempDir "$($wifi.ssid).xml"
                $wifi.xml | Out-File -FilePath $xmlPath -Encoding UTF8
                $out = netsh wlan add profile filename="$xmlPath" user=current 2>&1 | Out-String
                if ($out -match 'added') {
                    $results.wifiRestored++
                } else {
                    $results.wifiFailed++
                }
            } catch {
                $results.wifiFailed++
            }
        }
        Remove-Item $wifiTempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    # STEP 3: SolasCare workspaces
    if ($cfg.restoreWorkspaces -and $data.solasWorkspaces) {
        Write-Output "[CLONE] Step 3/4: Restoring $($data.solasWorkspaces.Count) workspace profiles..."
        try {
            $wsFile = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'workspace\profiles.json'
            $wsDir = Split-Path $wsFile -Parent
            if (-not (Test-Path $wsDir)) { New-Item -ItemType Directory -Path $wsDir -Force | Out-Null }
            # Merge with existing workspaces (don't overwrite)
            $existing = @()
            if (Test-Path $wsFile) {
                $existing = @(Get-Content $wsFile -Raw | ConvertFrom-Json)
            }
            $existingIds = @($existing | ForEach-Object { $_.id })
            $newWorkspaces = @()
            foreach ($ws in $data.solasWorkspaces) {
                if ($existingIds -notcontains $ws.id) {
                    $newWorkspaces += $ws
                }
            }
            $merged = @($existing) + @($newWorkspaces)
            $merged | ConvertTo-Json -Depth 6 | Out-File -FilePath $wsFile -Encoding UTF8
            $results.workspacesRestored = $newWorkspaces.Count
        } catch {
            Write-Output "[CLONE] Workspace restore failed: $($_.Exception.Message)"
        }
    }

    # STEP 4: SolasCare tweaks — replay apply actions (skip undones)
    if ($cfg.restoreTweaks -and $data.solasTweaksApplied) {
        Write-Output "[CLONE] Step 4/4: Replaying $($data.solasTweaksApplied.Count) tweak log entries..."
        # We don't auto-apply tweaks here — that would require running the tweaker PS engine
        # from this script. Instead we just write the history file so user can see what was
        # applied on the source PC and manually re-apply from the God Mode UI.
        try {
            $twFile = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'tweaker\applied.jsonl'
            $twDir = Split-Path $twFile -Parent
            if (-not (Test-Path $twDir)) { New-Item -ItemType Directory -Path $twDir -Force | Out-Null }
            $existing = ''
            if (Test-Path $twFile) { $existing = Get-Content $twFile -Raw -Encoding UTF8 }
            $appended = 0
            foreach ($entry in $data.solasTweaksApplied) {
                if ($entry.action -eq 'apply') {
                    $existing += ($entry | ConvertTo-Json -Compress) + "`n"
                    $appended++
                }
            }
            $existing | Out-File -FilePath $twFile -Encoding UTF8
            $results.tweaksApplied = $appended
            Write-Output "[CLONE] Note: $appended tweak entries written to history. Use God Mode UI to re-apply them."
        } catch {
            Write-Output "[CLONE] Tweak history restore failed: $($_.Exception.Message)"
        }
    }

    Write-AuditLog -Action 'clone-import' -Result 'success' -Details "Apps=$($results.appsInstalled)/$($results.appsFailed), Wifi=$($results.wifiRestored)/$($results.wifiFailed), WS=$($results.workspacesRestored), Tweaks=$($results.tweaksApplied)"

    Write-TimedJsonResult @{
        success = $true
        results = $results
        message = "Clone import complete. Apps: $($results.appsInstalled) installed / $($results.appsSkipped) skipped / $($results.appsFailed) failed. Wi-Fi: $($results.wifiRestored). Workspaces: $($results.workspacesRestored)."
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'get-exportable-items' { Invoke-GetExportableItems }
        'export-clone'         { Invoke-ExportClone }
        'import-clone'         { Invoke-ImportClone }
        default {
            Write-JsonError "Invalid action: $Action" 'pc_clone'
        }
    }
} catch {
    Write-AuditLog -Action "clone-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "pc_clone.$Action"
}
