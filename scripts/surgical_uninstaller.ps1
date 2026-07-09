# surgical_uninstaller.ps1
# SolasCare Pro - Feature 1: Surgical Uninstaller
# Tracks installs via point-in-time snapshots (NOT always-on FileSystemWatcher,
# which is unreliable on Windows). Computes diffs after install, then force-deletes
# all leftovers when user uninstalls. Orphan scanner handles pre-existing apps.
#
# Actions:
#   take-snapshot       - Snapshot FS + registry + services + tasks. Returns snapshotId.
#   compute-diff        - Re-scan and diff against snapshot. Returns added/modified/removed.
#   scan-orphans        - Heuristic scan for residue from previously uninstalled apps.
#   surgical-uninstall  - Run silent uninstaller + sweep leftover files/keys from snapshot/orphan data.
#   get-footprint       - Get combined footprint (snapshot diff + orphan scan) for one app.
#
# All FS scans are depth-limited (top 2-3 levels) for speed. Full recursive scans
# of AppData would take 30+ seconds on a typical PC.

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$SnapshotId,
    [string]$AppKey,           # PSChildName from registry (e.g. '{GUID}' or 'App Name_is1')
    [string]$DisplayName,      # Human-readable app name for orphan matching
    [int]$Depth = 2
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage paths (mirror main.js convention: %APPDATA%\SolasCare\...) ---
function Get-SurgicalRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'surgical'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-SnapshotsDir {
    $dir = Join-Path (Get-SurgicalRoot) 'snapshots'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-FootprintsDir {
    $dir = Join-Path (Get-SurgicalRoot) 'footprints'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}

# --- Path safety (matches Test-SafePath in advanced_tools.ps1) ---
function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"]') { return $false }
    if ($p -match '\.\.') { return $false }
    return $true
}

# --- Snapshot collectors ---

function Get-FilesystemSnapshot {
    param([int]$MaxDepth = 2)
    # Scan key install locations. Depth-limited for speed.
    $roots = @(
        @{ Path = $env:ProgramFiles; Label = 'ProgramFiles' }
        @{ Path = ${env:ProgramFiles(x86)}; Label = 'ProgramFilesx86' }
        @{ Path = Join-Path $env:LOCALAPPDATA ''; Label = 'LocalAppData' }
        @{ Path = $env:APPDATA; Label = 'AppDataRoaming' }
        @{ Path = $env:PROGRAMDATA; Label = 'ProgramData' }
    )
    $entries = @()
    foreach ($r in $roots) {
        if (-not $r.Path -or -not (Test-Path $r.Path)) { continue }
        try {
            $files = Get-ChildItem -Path $r.Path -Recurse -Depth $MaxDepth -File -ErrorAction SilentlyContinue |
                     Select-Object FullName, Length, LastWriteTime
            foreach ($f in $files) {
                $entries += [PSCustomObject]@{
                    root = $r.Label
                    path = $f.FullName
                    size = $f.Length
                    mtime = $f.LastWriteTime.ToString('o')
                }
            }
        } catch {}
    }
    return $entries
}

function Get-RegistrySnapshot {
    # Snapshot the Uninstall keys (full) + top-level vendor keys (depth-limited).
    $entries = @()
    $uninstallPaths = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($p in $uninstallPaths) {
        if (-not (Test-Path $p)) { continue }
        try {
            $keys = Get-ChildItem -Path $p -ErrorAction SilentlyContinue
            foreach ($k in $keys) {
                $entries += [PSCustomObject]@{
                    hive = 'Uninstall'
                    path = $k.PSPath
                    name = $k.PSChildName
                }
            }
        } catch {}
    }
    # Also snapshot top-level HKLM/HKCU Software vendor keys (depth=1)
    foreach ($p in 'HKLM:\Software','HKCU:\Software') {
        if (-not (Test-Path $p)) { continue }
        try {
            $keys = Get-ChildItem -Path $p -ErrorAction SilentlyContinue | Select-Object -First 500
            foreach ($k in $keys) {
                $entries += [PSCustomObject]@{
                    hive = 'Software'
                    path = $k.PSPath
                    name = $k.PSChildName
                }
            }
        } catch {}
    }
    return $entries
}

function Get-ServiceSnapshot {
    try {
        return @(Get-CimInstance -ClassName Win32_Service -ErrorAction SilentlyContinue |
                 Select-Object Name, DisplayName, State, PathName)
    } catch { return @() }
}

function Get-ScheduledTaskSnapshot {
    try {
        return @(Get-ScheduledTask -ErrorAction SilentlyContinue |
                 Where-Object { $_.TaskPath -notlike '\Microsoft\*' } |
                 Select-Object TaskName, TaskPath, State)
    } catch { return @() }
}

function Get-InstalledAppsMap {
    # Returns hashtable: PSChildName -> @{ DisplayName; Publisher; UninstallString; InstallLocation }
    $map = @{}
    $regPaths = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($rp in $regPaths) {
        try {
            $items = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
                     Where-Object { $_.DisplayName }
            foreach ($it in $items) {
                $key = $it.PSChildName
                if (-not $map.ContainsKey($key)) {
                    $map[$key] = @{
                        DisplayName      = $it.DisplayName
                        Publisher        = $it.Publisher
                        DisplayVersion   = $it.DisplayVersion
                        UninstallString  = $it.UninstallString
                        QuietUninstallString = $it.QuietUninstallString
                        InstallLocation  = $it.InstallLocation
                        RegPath          = $it.PSPath
                    }
                }
            }
        } catch {}
    }
    return $map
}

# --- Actions ---

function Invoke-TakeSnapshot {
    $id = 'snap_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0,8)
    Write-Output "[SNAPSHOT] Capturing baseline (id=$id, depth=$Depth)..."

    $fs = Get-FilesystemSnapshot -MaxDepth $Depth
    Write-Output "[SNAPSHOT] Files: $($fs.Count)"

    $reg = Get-RegistrySnapshot
    Write-Output "[SNAPSHOT] Registry keys: $($reg.Count)"

    $svc = Get-ServiceSnapshot
    Write-Output "[SNAPSHOT] Services: $($svc.Count)"

    $tasks = Get-ScheduledTaskSnapshot
    Write-Output "[SNAPSHOT] Scheduled tasks: $($tasks.Count)"

    $snapshot = @{
        id = $id
        createdIso = (Get-Date).ToString('o')
        depth = $Depth
        filesystem = $fs
        registry = $reg
        services = $svc
        tasks = $tasks
    }

    $path = Join-Path (Get-SnapshotsDir) "$id.json"
    $snapshot | ConvertTo-Json -Depth 6 -Compress | Out-File -FilePath $path -Encoding UTF8

    Write-AuditLog -Action 'surgical-take-snapshot' -Result 'success' -Target $id -Details "Files=$($fs.Count), Reg=$($reg.Count), Svc=$($svc.Count), Tasks=$($tasks.Count)"

    Write-TimedJsonResult @{
        success = $true
        snapshotId = $id
        counts = @{
            files = $fs.Count
            registry = $reg.Count
            services = $svc.Count
            tasks = $tasks.Count
        }
        message = "Baseline snapshot captured."
    } $timer
}

function Invoke-ComputeDiff {
    if (-not (Test-SafePath $SnapshotId)) {
        Write-JsonError 'Invalid snapshot id.' 'compute-diff'
        exit 1
    }
    $snapPath = Join-Path (Get-SnapshotsDir) "$SnapshotId.json"
    if (-not (Test-Path $snapPath)) {
        Write-JsonError "Snapshot not found: $SnapshotId" 'compute-diff'
        exit 1
    }
    Write-Output "[DIFF] Loading snapshot $SnapshotId..."
    $snap = Get-Content -Path $snapPath -Raw | ConvertFrom-Json
    $depth = $snap.depth
    if (-not $depth) { $depth = 2 }

    Write-Output "[DIFF] Re-scanning current state..."
    $fsNow = Get-FilesystemSnapshot -MaxDepth $depth
    $regNow = Get-RegistrySnapshot
    $svcNow = Get-ServiceSnapshot
    $tasksNow = Get-ScheduledTaskSnapshot

    # Index snapshots for fast lookup
    $fsBefore = @{}
    foreach ($e in $snap.filesystem) { $fsBefore[$e.path] = $e }
    $regBefore = @{}
    foreach ($e in $snap.registry) { $regBefore[$e.path] = $e }
    $svcBefore = @{}
    foreach ($e in $snap.services) { $svcBefore[$e.Name] = $e }
    $taskBefore = @{}
    foreach ($e in $snap.tasks) { $taskBefore[($e.TaskPath + $e.TaskName)] = $e }

    $fsAdded = @($fsNow | Where-Object { -not $fsBefore.ContainsKey($_.path) } |
                 Select-Object path, size, mtime, root)
    $fsRemoved = @($snap.filesystem | Where-Object { -not ($fsNow | Where-Object { $_.path -eq $args[0].path }) })
    # Above is slow; use hashtable-based approach
    $fsNowMap = @{}
    foreach ($e in $fsNow) { $fsNowMap[$e.path] = $e }
    $fsRemoved = @($snap.filesystem | Where-Object { -not $fsNowMap.ContainsKey($_.path) } |
                   Select-Object path, size, mtime, root)

    $regAdded = @($regNow | Where-Object { -not $regBefore.ContainsKey($_.path) } | Select-Object path, name, hive)
    $regRemoved = @($snap.registry | Where-Object {
        $key = $_.path
        -not ($regNow | Where-Object { $_.path -eq $key })
    } | Select-Object path, name, hive)
    $regNowMap = @{}
    foreach ($e in $regNow) { $regNowMap[$e.path] = $e }
    $regRemoved = @($snap.registry | Where-Object { -not $regNowMap.ContainsKey($_.path) } |
                    Select-Object path, name, hive)

    $svcAdded = @($svcNow | Where-Object { -not $svcBefore.ContainsKey($_.Name) } | Select-Object Name, DisplayName, State, PathName)
    $svcRemoved = @($snap.services | Where-Object { -not ($svcNow | Where-Object { $_.Name -eq $args[0].Name }) })
    $svcNowMap = @{}
    foreach ($e in $svcNow) { $svcNowMap[$e.Name] = $e }
    $svcRemoved = @($snap.services | Where-Object { -not $svcNowMap.ContainsKey($_.Name) } |
                    Select-Object Name, DisplayName, State, PathName)

    $tasksAdded = @($tasksNow | Where-Object {
        $k = $_.TaskPath + $_.TaskName
        -not $taskBefore.ContainsKey($k)
    } | Select-Object TaskName, TaskPath, State)
    $tasksNowMap = @{}
    foreach ($e in $tasksNow) { $tasksNowMap[($e.TaskPath + $e.TaskName)] = $e }
    $tasksRemoved = @($snap.tasks | Where-Object {
        $k = $_.TaskPath + $_.TaskName
        -not $tasksNowMap.ContainsKey($k)
    } | Select-Object TaskName, TaskPath, State)

    $diff = @{
        snapshotId = $SnapshotId
        computedIso = (Get-Date).ToString('o')
        filesAdded = $fsAdded
        filesRemoved = $fsRemoved
        registryAdded = $regAdded
        registryRemoved = $regRemoved
        servicesAdded = $svcAdded
        servicesRemoved = $svcRemoved
        tasksAdded = $tasksAdded
        tasksRemoved = $tasksRemoved
    }

    Write-Output "[DIFF] Files: +$($fsAdded.Count) -$($fsRemoved.Count) | Reg: +$($regAdded.Count) -$($regRemoved.Count) | Svc: +$($svcAdded.Count) -$($svcRemoved.Count) | Tasks: +$($tasksAdded.Count) -$($tasksRemoved.Count)"

    Write-AuditLog -Action 'surgical-compute-diff' -Result 'success' -Target $SnapshotId -Details "Files:+$($fsAdded.Count)/-$($fsRemoved.Count), Reg:+$($regAdded.Count)/-$($regRemoved.Count)"

    Write-TimedJsonResult @{
        success = $true
        diff = $diff
        summary = @{
            filesAdded = $fsAdded.Count
            filesRemoved = $fsRemoved.Count
            registryAdded = $regAdded.Count
            registryRemoved = $regRemoved.Count
            servicesAdded = $svcAdded.Count
            servicesRemoved = $svcRemoved.Count
            tasksAdded = $tasksAdded.Count
            tasksRemoved = $tasksRemoved.Count
        }
    } $timer
}

function Invoke-ScanOrphans {
    # Heuristic: for each currently-installed app, find leftover junk from
    # OTHER (uninstalled) apps that share the vendor name or have orphaned keys.
    # Also detect: AppData folders with no matching installed app, services
    # pointing to missing binaries, etc.
    Write-Output "[ORPHAN] Scanning for leftover residue..."

    $apps = Get-InstalledAppsMap
    $installedNames = @($apps.Values | ForEach-Object { $_.DisplayName }) | Where-Object { $_ }
    $installedNamesLower = @($installedNames | ForEach-Object { $_.ToLower() })

    $orphans = @()

    # 1. Orphaned registry Uninstall keys (keys with DisplayName but missing InstallLocation binary)
    $regPaths = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($rp in $regPaths) {
        try {
            $items = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
                     Where-Object { $_.DisplayName }
            foreach ($it in $items) {
                $loc = $it.InstallLocation
                if ($loc -and $loc.Trim() -ne '' -and -not (Test-Path $loc)) {
                    $orphans += [PSCustomObject]@{
                        type = 'registry-orphan-install-loc'
                        appName = $it.DisplayName
                        detail = "InstallLocation missing: $loc"
                        regPath = $it.PSPath
                        regChild = $it.PSChildName
                        sizeHint = 0
                    }
                }
            }
        } catch {}
    }

    # 2. Orphaned AppData folders (folders that don't match any installed app name)
    $appDataRoots = @(
        Join-Path $env:LOCALAPPDATA '',
        $env:APPDATA,
        $env:PROGRAMDATA
    )
    foreach ($root in $appDataRoots) {
        if (-not (Test-Path $root)) { continue }
        try {
            $dirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue
            foreach ($d in $dirs) {
                $name = $d.Name.ToLower()
                # Skip well-known system folders
                if ($name -in @('microsoft','packages','temp','temporarily cached','publisher','programs','connecteddevicesplatform','crashdumps','virtualstore','microsoft sql server','.net','iss','pulse','adobe','nvidia corporation','amd','intel','google','mozilla','code','git','docker')) { continue }
                # Heuristic: if folder name doesn't appear in any installed app name, it might be orphaned
                # BUT we don't want false positives. Only flag if size > 10 MB AND no matching app.
                $isOrphan = $true
                foreach ($n in $installedNamesLower) {
                    if (-not $n) { continue }
                    # Match if app name contains folder name OR vice versa (length >= 4 to avoid false matches)
                    if ($name.Length -ge 4 -and ($n.Contains($name) -or $name.Contains($n))) { $isOrphan = $false; break }
                }
                if ($isOrphan) {
                    try {
                        $size = (Get-ChildItem -Path $d.FullName -Recurse -File -ErrorAction SilentlyContinue |
                                 Measure-Object -Property Length -Sum).Sum
                        if ($size -gt 10MB) {
                            $orphans += [PSCustomObject]@{
                                type = 'appdata-orphan-folder'
                                appName = $d.Name
                                detail = "Orphaned folder: $($d.FullName)"
                                path = $d.FullName
                                sizeHint = [math]::Round($size / 1MB, 2)
                            }
                        }
                    } catch {}
                }
            }
        } catch {}
    }

    # 3. Orphaned services (service PathName binary missing)
    try {
        $svcs = Get-CimInstance -ClassName Win32_Service -ErrorAction SilentlyContinue
        foreach ($s in $svcs) {
            $pn = $s.PathName
            if (-not $pn) { continue }
            # Extract binary path from quoted/unquoted service path
            $bin = $null
            if ($pn -match '^"([^"]+)"') { $bin = $matches[1] }
            elseif ($pn -match '^(\S+\.exe)') { $bin = $matches[1] }
            if ($bin -and -not (Test-Path $bin)) {
                $orphans += [PSCustomObject]@{
                    type = 'service-orphan-binary'
                    appName = $s.Name
                    detail = "Service binary missing: $bin"
                    serviceName = $s.Name
                    sizeHint = 0
                }
            }
        }
    } catch {}

    Write-Output "[ORPHAN] Found $($orphans.Count) potential orphan items."
    Write-AuditLog -Action 'surgical-scan-orphans' -Result 'success' -Details "Found $($orphans.Count) orphans"

    Write-TimedJsonResult @{
        success = $true
        orphans = $orphans
        count = $orphans.Count
        message = "Found $($orphans.Count) potential orphan items."
    } $timer
}

function Invoke-SurgicalUninstall {
    # Steps:
    # 1. Run the silent uninstaller (from UninstallString)
    # 2. Wait for completion
    # 3. Sweep leftover files (from snapshot diff or AppData folders matching app name)
    # 4. Sweep leftover registry keys
    # 5. Sweep orphaned services pointing to app's install dir
    # 6. Return summary of what was deleted
    if (-not (Test-SafePath $AppKey)) {
        Write-JsonError 'Invalid AppKey.' 'surgical-uninstall'
        exit 1
    }

    $apps = Get-InstalledAppsMap
    if (-not $apps.ContainsKey($AppKey)) {
        Write-JsonError "App not found in registry: $AppKey" 'surgical-uninstall'
        exit 1
    }
    $app = $apps[$AppKey]
    $name = $app.DisplayName
    Write-Output "[SURGICAL] Starting surgical uninstall for: $name"

    $deletedFiles = 0
    $deletedKeys = 0
    $deletedServices = 0
    $failedDeletes = 0
    $uninstallExitCode = $null

    # STEP 1: Run silent uninstaller
    $uninstallCmd = $app.QuietUninstallString
    if (-not $uninstallCmd) { $uninstallCmd = $app.UninstallString }
    if ($uninstallCmd) {
        # Append silent flags if MSI-based
        if ($uninstallCmd -match 'MsiExec' -and $uninstallCmd -notmatch '/quiet') {
            $uninstallCmd += ' /quiet /norestart'
        }
        Write-Output "[SURGICAL] Running uninstaller: $uninstallCmd"
        try {
            $out = & cmd.exe /c $uninstallCmd 2>&1
            $uninstallExitCode = $LASTEXITCODE
            Write-Output "[SURGICAL] Uninstaller exit code: $uninstallExitCode"
        } catch {
            Write-Output "[SURGICAL] Uninstaller threw: $($_.Exception.Message)"
        }
        # Give uninstaller a moment to release file handles
        Start-Sleep -Seconds 2
    } else {
        Write-Output "[SURGICAL] No UninstallString found; proceeding directly to residue sweep."
    }

    # STEP 2: Sweep InstallLocation directory if it still exists
    if ($app.InstallLocation -and (Test-Path $app.InstallLocation)) {
        Write-Output "[SURGICAL] Removing InstallLocation: $($app.InstallLocation)"
        try {
            Get-ChildItem -Path $app.InstallLocation -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
                try { Remove-Item -Path $_.FullName -Force -ErrorAction Stop; $deletedFiles++ }
                catch { $failedDeletes++ }
            }
            try { Remove-Item -Path $app.InstallLocation -Recurse -Force -ErrorAction Stop } catch {}
        } catch {
            Write-Output "[SURGICAL] Failed to remove InstallLocation: $($_.Exception.Message)"
        }
    }

    # STEP 3: Sweep AppData folders matching app name
    if ($name) {
        $safeName = $name -replace '[\\/:*?"<>|]', ''
        $appDataCandidates = @(
            Join-Path $env:LOCALAPPDATA $safeName
            Join-Path $env:LOCALAPPDATA ($safeName -replace ' ','')
            Join-Path $env:APPDATA $safeName
            Join-Path $env:APPDATA ($safeName -replace ' ','')
            Join-Path $env:PROGRAMDATA $safeName
            Join-Path $env:PROGRAMDATA ($safeName -replace ' ','')
            # Also check vendor-based paths (e.g. "Adobe" for "Adobe Acrobat")
            $(if ($app.Publisher) { Join-Path $env:LOCALAPPDATA $app.Publisher })
            $(if ($app.Publisher) { Join-Path $env:APPDATA $app.Publisher })
        ) | Where-Object { $_ -and (Test-Path $_) }

        foreach ($p in $appDataCandidates) {
            Write-Output "[SURGICAL] Removing AppData residue: $p"
            try {
                Get-ChildItem -Path $p -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
                    try { Remove-Item -Path $_.FullName -Force -ErrorAction Stop; $deletedFiles++ }
                    catch { $failedDeletes++ }
                }
                try { Remove-Item -Path $p -Recurse -Force -ErrorAction Stop } catch {}
            } catch {}
        }
    }

    # STEP 4: Sweep registry Uninstall key for this app
    $regPaths = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($rp in $regPaths) {
        $keyPath = Join-Path $rp $AppKey
        if (Test-Path $keyPath) {
            Write-Output "[SURGICAL] Removing registry key: $keyPath"
            try {
                Remove-Item -Path $keyPath -Recurse -Force -ErrorAction Stop
                $deletedKeys++
            } catch { $failedDeletes++ }
        }
    }

    # STEP 5: Sweep services whose binary path is under the InstallLocation
    if ($app.InstallLocation) {
        try {
            $svcs = Get-CimInstance -ClassName Win32_Service -ErrorAction SilentlyContinue
            $installLocLower = $app.InstallLocation.ToLower()
            foreach ($s in $svcs) {
                $pn = $s.PathName
                if (-not $pn) { continue }
                if ($pn.ToLower().Contains($installLocLower)) {
                    Write-Output "[SURGICAL] Removing service: $($s.Name)"
                    try {
                        Stop-Service -Name $s.Name -Force -ErrorAction SilentlyContinue
                        Start-Sleep -Seconds 1
                        sc.exe delete $s.Name | Out-Null
                        if ($LASTEXITCODE -eq 0) { $deletedServices++ } else { $failedDeletes++ }
                    } catch { $failedDeletes++ }
                }
            }
        } catch {}
    }

    $summary = @{
        appName = $name
        uninstallExitCode = $uninstallExitCode
        deletedFiles = $deletedFiles
        deletedRegistryKeys = $deletedKeys
        deletedServices = $deletedServices
        failedDeletes = $failedDeletes
    }

    Write-AuditLog -Action 'surgical-uninstall' -Result $(if ($failedDeletes -eq 0) {'success'} else {'partial'}) -Target $name -Details "Files=$deletedFiles, Keys=$deletedKeys, Svc=$deletedServices, Failed=$failedDeletes"

    Write-TimedJsonResult @{
        success = ($failedDeletes -eq 0)
        summary = $summary
        message = "Surgical uninstall complete. Deleted: $deletedFiles files, $deletedKeys registry keys, $deletedServices services. ($failedDeletes failed)"
    } $timer
}

function Invoke-GetFootprint {
    # Return combined footprint for a single app: install location size, AppData residue,
    # services, scheduled tasks. Used for the "Installation Diff View" before uninstall.
    if (-not (Test-SafePath $AppKey)) {
        Write-JsonError 'Invalid AppKey.' 'get-footprint'
        exit 1
    }
    $apps = Get-InstalledAppsMap
    if (-not $apps.ContainsKey($AppKey)) {
        Write-JsonError "App not found: $AppKey" 'get-footprint'
        exit 1
    }
    $app = $apps[$AppKey]
    $name = $app.DisplayName

    $footprint = @{
        appKey = $AppKey
        displayName = $name
        publisher = $app.Publisher
        version = $app.DisplayVersion
        installLocation = $app.InstallLocation
        installLocationSize = 0
        appDataFolders = @()
        appDataSize = 0
        services = @()
        registryKeys = @()
    }

    # Install location size
    if ($app.InstallLocation -and (Test-Path $app.InstallLocation)) {
        try {
            $size = (Get-ChildItem -Path $app.InstallLocation -Recurse -File -ErrorAction SilentlyContinue |
                     Measure-Object -Property Length -Sum).Sum
            $footprint.installLocationSize = [math]::Round($size / 1MB, 2)
        } catch {}
    }

    # AppData folders
    if ($name) {
        $safeName = $name -replace '[\\/:*?"<>|]', ''
        $candidates = @(
            Join-Path $env:LOCALAPPDATA $safeName
            Join-Path $env:LOCALAPPDATA ($safeName -replace ' ','')
            Join-Path $env:APPDATA $safeName
            Join-Path $env:APPDATA ($safeName -replace ' ','')
            Join-Path $env:PROGRAMDATA $safeName
            Join-Path $env:PROGRAMDATA ($safeName -replace ' ','')
        ) | Where-Object { $_ -and (Test-Path $_) }
        $totalAppData = 0
        foreach ($p in $candidates) {
            try {
                $size = (Get-ChildItem -Path $p -Recurse -File -ErrorAction SilentlyContinue |
                         Measure-Object -Property Length -Sum).Sum
                $sizeMB = [math]::Round($size / 1MB, 2)
                $footprint.appDataFolders += @{ path = $p; sizeMB = $sizeMB }
                $totalAppData += $sizeMB
            } catch {}
        }
        $footprint.appDataSize = $totalAppData
    }

    # Services
    if ($app.InstallLocation) {
        try {
            $installLocLower = $app.InstallLocation.ToLower()
            $svcs = Get-CimInstance -ClassName Win32_Service -ErrorAction SilentlyContinue
            foreach ($s in $svcs) {
                if ($s.PathName -and $s.PathName.ToLower().Contains($installLocLower)) {
                    $footprint.services += @{ name = $s.Name; displayName = $s.DisplayName; state = $s.State; path = $s.PathName }
                }
            }
        } catch {}
    }

    # Registry keys
    $regPaths = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    foreach ($rp in $regPaths) {
        $keyPath = Join-Path $rp $AppKey
        if (Test-Path $keyPath) {
            $footprint.registryKeys += $keyPath
        }
    }

    Write-TimedJsonResult @{
        success = $true
        footprint = $footprint
        totalSizeMB = [math]::Round($footprint.installLocationSize + $footprint.appDataSize, 2)
        message = "Footprint for $name"
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'take-snapshot'       { Invoke-TakeSnapshot }
        'compute-diff'        { Invoke-ComputeDiff }
        'scan-orphans'        { Invoke-ScanOrphans }
        'surgical-uninstall'  { Invoke-SurgicalUninstall }
        'get-footprint'       { Invoke-GetFootprint }
        default {
            Write-JsonError "Invalid action: $Action" 'surgical_uninstaller'
        }
    }
} catch {
    Write-AuditLog -Action "surgical-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "surgical_uninstaller.$Action"
}
