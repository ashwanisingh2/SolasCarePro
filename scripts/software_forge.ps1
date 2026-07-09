# software_forge.ps1
# SolasCare Pro - Feature 4: Software Forge (Silent App Manager)
#
# Actions:
#   list-catalog           - Returns the built-in catalog (for verification - JS is source of truth)
#   install-selected       - Batch silent-install apps via Winget. JsonArg = ["wingetId1", "wingetId2"]
#   list-bloatware         - Detect known bloatware (Candy Crush, Xbox Game Bar, Teams Personal, etc.)
#   remove-bloatware       - Remove selected AppxPackages. JsonArg = ["pkg1", "pkg2"]
#   update-all             - winget upgrade --all --silent
#   list-driver-backups    - List driver backups from existing driver_backup.ps1 history
#   rollback-driver        - Roll back a driver using pnputil. JsonArg = {"pnpDeviceId": "...", "backupDir": "..."}
#
# Winget IDs are validated against an allowlist pattern (alphanumeric, dots, dashes only).
# AppxPackage names are validated similarly. No shell metacharacters allowed.

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$JsonArg
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Validation ---

function Test-SafeWingetId {
    param([string]$id)
    if (-not $id) { return $false }
    if ($id.Length -gt 200) { return $false }
    # Winget IDs: alphanumeric, dot, dash, underscore, at (for scoped like scope.App)
    if ($id -match '[^A-Za-z0-9\.\-_@]') { return $false }
    return $true
}

function Test-SafeAppxName {
    param([string]$name)
    if (-not $name) { return $false }
    if ($name.Length -gt 300) { return $false }
    # Appx package names look like: Microsoft.WindowsCalculator_10.2101.8.0_x64__8wekyb3d8bbwe
    if ($name -match '[^A-Za-z0-9\.\-_]') { return $false }
    return $true
}

function Test-SafePnpDeviceId {
    param([string]$id)
    if (-not $id) { return $false }
    if ($id.Length -gt 500) { return $false }
    # PnP device IDs contain backslashes, ampersands, alphanumerics
    if ($id -match '[<>|"`$;]') { return $false }
    return $true
}

function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"]') { return $false }
    if ($p -match '\.\.') { return $false }
    return $true
}

# --- Actions ---

function Invoke-ListCatalog {
    # Returns a placeholder catalog message; actual catalog lives in JS (forgeStore.js)
    Write-TimedJsonResult @{
        success = $true
        message = 'Catalog is owned by JS layer (forgeStore.js). Use forge-get-catalog IPC instead.'
    } $timer
}

function Invoke-InstallSelected {
    if (-not $JsonArg) {
        Write-JsonError 'JsonArg required (array of Winget IDs).' 'install-selected'
        exit 1
    }
    try {
        $ids = $JsonArg | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid JSON: $($_.Exception.Message)" 'install-selected'
        exit 1
    }
    if (-not (Test-Path Variable:ids) -or -not $ids) {
        Write-JsonError 'Empty or invalid Winget ID array.' 'install-selected'
        exit 1
    }
    # Validate every ID before touching Winget (fail-fast)
    foreach ($id in $ids) {
        if (-not (Test-SafeWingetId $id)) {
            Write-JsonError "Invalid Winget ID rejected: $id" 'install-selected'
            exit 1
        }
    }

    # Verify winget is available
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-JsonError 'Winget not found. Install App Installer from Microsoft Store.' 'install-selected'
        exit 1
    }

    $results = @()
    $installed = 0
    $failed = 0
    $skipped = 0

    foreach ($id in $ids) {
        Write-Output "[FORGE] Installing $id ..."
        try {
            # Check if already installed
            $listOut = winget list --id $id --accept-source-agreements 2>$null | Out-String
            if ($LASTEXITCODE -eq 0 -and $listOut -match [regex]::Escape($id)) {
                Write-Output "[FORGE] Already installed: $id (skipping)"
                $results += @{ id = $id; status = 'skipped'; message = 'Already installed' }
                $skipped++
                continue
            }
            # Install silently
            $out = winget install --id $id --silent --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0) {
                Write-Output "[FORGE] Installed: $id"
                $results += @{ id = $id; status = 'installed'; message = 'Success' }
                $installed++
            } else {
                $msg = ($out -split "`n" | Select-Object -Last 3) -join ' '
                Write-Output "[FORGE] Failed ($exitCode): $id - $msg"
                $results += @{ id = $id; status = 'failed'; message = "Exit $exitCode"; exitCode = $exitCode }
                $failed++
            }
        } catch {
            Write-Output "[FORGE] Exception for $id : $($_.Exception.Message)"
            $results += @{ id = $id; status = 'failed'; message = $_.Exception.Message }
            $failed++
        }
    }

    Write-AuditLog -Action 'forge-install-selected' -Result $(if ($failed -eq 0) {'success'} else {'partial'}) -Details "Installed=$installed, Failed=$failed, Skipped=$skipped, Total=$($ids.Count)"

    Write-TimedJsonResult @{
        success = ($failed -eq 0)
        results = $results
        summary = @{ installed = $installed; failed = $failed; skipped = $skipped; total = $ids.Count }
        message = "Installed: $installed, Skipped: $skipped, Failed: $failed"
    } $timer
}

# --- Bloatware ---

# Curated bloatware detection list. Each entry: { AppxName (regex pattern), DisplayName, Category, Risk }
$BLOATWARE_CATALOG = @(
    @{ Pattern = 'Microsoft\.BingWeather';           Name = 'MSN Weather';            Category = 'Bing';        Risk = 'low' },
    @{ Pattern = 'Microsoft\.BingNews';              Name = 'MSN News';               Category = 'Bing';        Risk = 'low' },
    @{ Pattern = 'Microsoft\.BingFinance';           Name = 'MSN Money';              Category = 'Bing';        Risk = 'low' },
    @{ Pattern = 'Microsoft\.BingSports';            Name = 'MSN Sports';             Category = 'Bing';        Risk = 'low' },
    @{ Pattern = 'Microsoft\.BingTranslator';        Name = 'Bing Translator';        Category = 'Bing';        Risk = 'low' },
    @{ Pattern = 'Microsoft\.GetHelp';               Name = 'Get Help';               Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.Getstarted';            Name = 'Microsoft Tips';         Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.Microsoft3DViewer';     Name = '3D Viewer';              Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.MicrosoftOfficeHub';    Name = 'Office Hub';             Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.MicrosoftSolitaireCollection'; Name = 'Solitaire Collection'; Category = 'Games'; Risk = 'low' },
    @{ Pattern = 'Microsoft\.MicrosoftStickyNotes';  Name = 'Sticky Notes';           Category = 'Microsoft';   Risk = 'medium' },
    @{ Pattern = 'Microsoft\.MinecraftUWP';          Name = 'Minecraft';              Category = 'Games';       Risk = 'low' },
    @{ Pattern = 'Microsoft\.OneConnect';            Name = 'Paid Wi-Fi & Cellular';  Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.People';                Name = 'People';                 Category = 'Microsoft';   Risk = 'medium' },
    @{ Pattern = 'Microsoft\.SkypeApp';              Name = 'Skype';                  Category = 'Microsoft';   Risk = 'medium' },
    @{ Pattern = 'Microsoft\.WindowsCommunicationsApps'; Name = 'Mail & Calendar';    Category = 'Microsoft';   Risk = 'high' },
    @{ Pattern = 'Microsoft\.WindowsFeedbackHub';    Name = 'Feedback Hub';           Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.WindowsMaps';           Name = 'Windows Maps';           Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.WindowsSoundRecorder';  Name = 'Voice Recorder';         Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.XboxApp';               Name = 'Xbox Console Companion'; Category = 'Xbox';        Risk = 'medium' },
    @{ Pattern = 'Microsoft\.XboxGameCallableUI';    Name = 'Xbox Game UI';           Category = 'Xbox';        Risk = 'high' },
    @{ Pattern = 'Microsoft\.XboxGamingOverlay';     Name = 'Xbox Game Bar';          Category = 'Xbox';        Risk = 'medium' },
    @{ Pattern = 'Microsoft\.XboxIdentityProvider';  Name = 'Xbox Identity Provider'; Category = 'Xbox';        Risk = 'high' },
    @{ Pattern = 'Microsoft\.XboxSpeechToTextOverlay'; Name = 'Xbox Speech Overlay';  Category = 'Xbox';        Risk = 'medium' },
    @{ Pattern = 'Microsoft\.ZuneMusic';             Name = 'Groove Music';           Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'Microsoft\.ZuneVideo';             Name = 'Movies & TV';            Category = 'Microsoft';   Risk = 'low' },
    @{ Pattern = 'king\.com\.CandyCrush';            Name = 'Candy Crush';            Category = 'Bloatware';   Risk = 'low' },
    @{ Pattern = 'king\.com\.';                      Name = 'King.com Game';          Category = 'Bloatware';   Risk = 'low' },
    @{ Pattern = 'E046963F\.LenovoCompanion';        Name = 'Lenovo Companion';       Category = 'OEM';         Risk = 'low' },
    @{ Pattern = 'DellInc\.DellSupportAssist';       Name = 'Dell SupportAssist';     Category = 'OEM';         Risk = 'medium' },
    @{ Pattern = 'AdobeSystemsIncorporated\.AdobeCreativeCloudExpress'; Name = 'Adobe CC Express'; Category = 'OEM'; Risk = 'low' }
)

function Invoke-ListBloatware {
    Write-Output "[FORGE] Scanning for bloatware..."
    $found = @()
    try {
        $packages = Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue
    } catch {
        Write-JsonError "Failed to enumerate Appx packages: $($_.Exception.Message)" 'list-bloatware'
        exit 1
    }

    foreach ($pkg in $packages) {
        foreach ($bloat in $BLOATWARE_CATALOG) {
            if ($pkg.PackageFullName -match $bloat.Pattern) {
                $found += [PSCustomObject]@{
                    packageFullName = $pkg.PackageFullName
                    name = $pkg.Name
                    displayName = $bloat.Name
                    category = $bloat.Category
                    risk = $bloat.Risk
                    version = $pkg.Version
                    publisher = $pkg.Publisher
                    installLocation = $pkg.InstallLocation
                }
                break  # don't match same package against multiple bloat entries
            }
        }
    }

    Write-Output "[FORGE] Found $($found.Count) bloatware packages"
    Write-AuditLog -Action 'forge-list-bloatware' -Result 'success' -Details "Found $($found.Count) bloatware"

    Write-TimedJsonResult @{
        success = $true
        bloatware = $found
        count = $found.Count
        message = "Found $($found.Count) potential bloatware package(s)."
    } $timer
}

function Invoke-RemoveBloatware {
    if (-not $JsonArg) {
        Write-JsonError 'JsonArg required (array of package full names).' 'remove-bloatware'
        exit 1
    }
    try {
        $packages = $JsonArg | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid JSON: $($_.Exception.Message)" 'remove-bloatware'
        exit 1
    }
    $results = @()
    $removed = 0
    $failed = 0
    foreach ($pkg in $packages) {
        if (-not (Test-SafeAppxName $pkg)) {
            $results += @{ package = $pkg; status = 'failed'; message = 'Invalid package name' }
            $failed++
            continue
        }
        Write-Output "[FORGE] Removing $pkg ..."
        try {
            # Remove for all users (requires admin)
            Remove-AppxPackage -Package $pkg -AllUsers -ErrorAction Stop
            Write-Output "[FORGE] Removed: $pkg"
            $results += @{ package = $pkg; status = 'removed'; message = 'Success' }
            $removed++
        } catch {
            # Try without -AllUsers (some packages can't be removed for all users)
            try {
                Remove-AppxPackage -Package $pkg -ErrorAction Stop
                $results += @{ package = $pkg; status = 'removed'; message = 'Success (current user only)' }
                $removed++
            } catch {
                Write-Output "[FORGE] Failed: $pkg - $($_.Exception.Message)"
                $results += @{ package = $pkg; status = 'failed'; message = $_.Exception.Message }
                $failed++
            }
        }
    }
    Write-AuditLog -Action 'forge-remove-bloatware' -Result $(if ($failed -eq 0) {'success'} else {'partial'}) -Details "Removed=$removed, Failed=$failed, Total=$($packages.Count)"
    Write-TimedJsonResult @{
        success = ($failed -eq 0)
        results = $results
        summary = @{ removed = $removed; failed = $failed; total = $packages.Count }
        message = "Removed: $removed, Failed: $failed"
    } $timer
}

function Invoke-UpdateAll {
    Write-Output "[FORGE] Updating all Winget-managed apps..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        Write-JsonError 'Winget not found.' 'update-all'
        exit 1
    }
    try {
        $out = winget upgrade --all --silent --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        # Winget exit 0 = success, 0x8A150023 = no updates available (still a success case)
        $noUpdates = ($out -match 'No installed package found matching input criteria|No updates available')
        if ($exitCode -eq 0 -or $noUpdates) {
            Write-AuditLog -Action 'forge-update-all' -Result 'success' -Details "ExitCode=$exitCode, NoUpdates=$noUpdates"
            Write-TimedJsonResult @{
                success = $true
                exitCode = $exitCode
                noUpdates = $noUpdates
                output = $out
                message = if ($noUpdates) { 'All apps up to date.' } else { 'Update complete.' }
            } $timer
        } else {
            Write-AuditLog -Action 'forge-update-all' -Result 'failure' -Details "ExitCode=$exitCode"
            Write-TimedJsonResult @{
                success = $false
                exitCode = $exitCode
                output = $out
                message = "Update failed (exit $exitCode)"
            } $timer
        }
    } catch {
        Write-JsonError "Update threw: $($_.Exception.Message)" 'update-all'
        exit 1
    }
}

function Invoke-ListDriverBackups {
    # Driver backups are created by existing driver_backup.ps1 and stored under
    # %APPDATA%\SolasCare\DriverBackups\<pnpDeviceId_safe>\<timestamp>\
    $root = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'DriverBackups'
    if (-not (Test-Path $root)) {
        Write-TimedJsonResult @{ success = $true; backups = @(); count = 0; message = 'No driver backups dir.' } $timer
        return
    }
    $backups = @()
    try {
        $deviceDirs = Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue
        foreach ($deviceDir in $deviceDirs) {
            $timeDirs = Get-ChildItem -Path $deviceDir.FullName -Directory -ErrorAction SilentlyContinue |
                        Sort-Object Name -Descending
            foreach ($tDir in $timeDirs) {
                $infFiles = @(Get-ChildItem -Path $tDir.FullName -Filter '*.inf' -ErrorAction SilentlyContinue)
                $backups += [PSCustomObject]@{
                    deviceDir = $deviceDir.Name
                    timestamp = $tDir.Name
                    path = $tDir.FullName
                    infCount = $infFiles.Count
                    createdIso = $tDir.CreationTime.ToString('o')
                }
            }
        }
    } catch {}
    Write-TimedJsonResult @{
        success = $true
        backups = $backups
        count = $backups.Count
    } $timer
}

function Invoke-RollbackDriver {
    if (-not $JsonArg) {
        Write-JsonError 'JsonArg required ({pnpDeviceId, backupDir}).' 'rollback-driver'
        exit 1
    }
    try {
        $cfg = $JsonArg | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid JSON: $($_.Exception.Message)" 'rollback-driver'
        exit 1
    }
    $pnpId = $cfg.pnpDeviceId
    $backupDir = $cfg.backupDir
    if (-not (Test-SafePnpDeviceId $pnpId)) {
        Write-JsonError 'Invalid PnP device id.' 'rollback-driver'
        exit 1
    }
    if (-not (Test-SafePath $backupDir) -or -not (Test-Path $backupDir)) {
        Write-JsonError 'Invalid or missing backup directory.' 'rollback-driver'
        exit 1
    }

    # Find .inf files in the backup
    $infFiles = @(Get-ChildItem -Path $backupDir -Filter '*.inf' -ErrorAction SilentlyContinue)
    if ($infFiles.Count -eq 0) {
        Write-JsonError "No .inf files found in backup: $backupDir" 'rollback-driver'
        exit 1
    }

    Write-Output "[FORGE] Rolling back driver for $pnpId ..."
    $results = @()
    $installed = 0
    $failed = 0
    foreach ($inf in $infFiles) {
        Write-Output "[FORGE] Installing INF: $($inf.Name)"
        try {
            # pnputil /add-driver <inf> /install. Use /subdir for nested .inf referencing.
            $out = pnputil /add-driver $inf.FullName /install 2>&1 | Out-String
            $exitCode = $LASTEXITCODE
            if ($exitCode -eq 0 -or $out -match 'Published name|Driver package added') {
                Write-Output "[FORGE] INF installed: $($inf.Name)"
                $results += @{ inf = $inf.Name; status = 'installed'; output = $out }
                $installed++
            } else {
                $results += @{ inf = $inf.Name; status = 'failed'; exitCode = $exitCode; output = $out }
                $failed++
            }
        } catch {
            $results += @{ inf = $inf.Name; status = 'failed'; message = $_.Exception.Message }
            $failed++
        }
    }

    Write-AuditLog -Action 'forge-rollback-driver' -Result $(if ($failed -eq 0) {'success'} else {'partial'}) -Target $pnpId -Details "Installed=$installed, Failed=$failed"

    Write-TimedJsonResult @{
        success = ($failed -eq 0)
        results = $results
        summary = @{ installed = $installed; failed = $failed }
        pnpDeviceId = $pnpId
        message = "Rollback: $installed INF(s) installed, $failed failed"
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'list-catalog'         { Invoke-ListCatalog }
        'install-selected'     { Invoke-InstallSelected }
        'list-bloatware'       { Invoke-ListBloatware }
        'remove-bloatware'     { Invoke-RemoveBloatware }
        'update-all'           { Invoke-UpdateAll }
        'list-driver-backups'  { Invoke-ListDriverBackups }
        'rollback-driver'      { Invoke-RollbackDriver }
        default {
            Write-JsonError "Invalid action: $Action" 'software_forge'
        }
    }
} catch {
    Write-AuditLog -Action "forge-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "software_forge.$Action"
}
