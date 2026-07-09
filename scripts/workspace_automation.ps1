# workspace_automation.ps1
# SolasCare Pro - Feature 2: Smart Workspace Automation
# Context-aware profiles that bundle: app launch/kill, Focus Assist, power plan,
# Windows Update pause. Each apply captures before-state so restore is exact.
#
# Actions:
#   get-current-state   - Snapshot of power plan / Focus Assist / WU / running procs.
#   apply-profile       - Capture before-state, then apply all actions in the profile JSON.
#   restore-profile     - Restore the before-state captured during the last apply.
#   launch-apps         - Launch a list of app paths (no profile needed; used by quick-launch).
#   kill-apps           - Kill a list of process names.
#
# Profile JSON shape (passed via -ProfileJson):
#   {
#     "id": "ws_xxx",
#     "name": "Coding Mode",
#     "actions": {
#       "launchApps": ["code", "chrome"],
#       "killApps":   ["spotify", "discord"],
#       "focusAssist": true,
#       "powerPlan":  "high",          # high | balanced | saver | ultimate
#       "pauseWindowsUpdate": true
#     }
#   }
#
# Note: We avoid UIAutomation (flaky, requires admin) and instead use:
#   - powercfg /SETACTIVE for power plans
#   - HKCU registry for Focus Assist
#   - HKLM registry for Windows Update pause (sets target release + pause)

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$ProfileJson
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage paths ---
function Get-WorkspaceRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'workspace'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-AppliedStatePath {
    return Join-Path (Get-WorkspaceRoot) 'applied.json'
}

# --- Safety ---
function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"]') { return $false }
    if ($p -match '\.\.') { return $false }
    return $true
}

# --- State readers ---

function Get-PowerPlanGuid {
    # Returns the GUID of the currently active power plan.
    try {
        $line = (powercfg /getactivescheme 2>$null) -join ''
        if ($line -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
            return $matches[1]
        }
    } catch {}
    return $null
}

function Get-FocusAssistState {
    # Returns 'priority' | 'alarms' | 'off' based on the registry.
    # HKCU\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings
    #   NOC_GLOBAL_SETTING_TOASTS_ENABLED = 1 means notifications on (off DND)
    try {
        $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings'
        if (Test-Path $key) {
            $props = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
            $val = $props.NOC_GLOBAL_SETTING_TOASTS_ENABLED
            if ($null -ne $val) {
                # 0 = DND on (toasts disabled), 1 = off (toasts enabled)
                if ($val -eq 0) { return 'priority' }
                return 'off'
            }
        }
    } catch {}
    return 'unknown'
}

function Get-WindowsUpdateState {
    # Returns 'paused' | 'active'. Checks HKLM for pause flags.
    try {
        $key = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
        if (Test-Path $key) {
            $props = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
            if ($props.PauseUpdatesExpiryTime) {
                $expiry = $props.PauseUpdatesExpiryTime
                $now = (Get-Date).ToString('o')
                if ($expiry -gt $now) { return 'paused' }
            }
        }
    } catch {}
    return 'active'
}

function Get-RunningProcessNames {
    try {
        return @(Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name -Unique)
    } catch { return @() }
}

# --- State setters ---

function Set-PowerPlan {
    param([string]$Plan)
    # Map friendly name -> well-known GUID (Windows 10/11 defaults).
    $guids = @{
        'saver'     = 'a1841308-3541-4fab-bc81-f71556f20b4a'
        'balanced'  = '381b4222-f694-41f0-9685-ff5bb260df2e'
        'high'      = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
        'ultimate'  = 'e9a42b02-d5df-448d-aa00-03f14749eb61'
    }
    $g = $guids[$Plan.ToLower()]
    if (-not $g) {
        Write-JsonError "Unknown power plan: $Plan" 'set-power-plan'
        return $false
    }
    # For 'ultimate', the plan may not exist on default Windows. Try to unlock first.
    if ($Plan.ToLower() -eq 'ultimate') {
        try { powercfg /duplicatescheme $guids['ultimate'] 2>$null | Out-Null } catch {}
    }
    $out = powercfg /setactive $g 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Output "[WORKSPACE] powercfg failed: $out"
        return $false
    }
    return $true
}

function Set-FocusAssist {
    param([bool]$Enable)
    # Setting Focus Assist via registry is the only documented non-API way.
    # NOC_GLOBAL_SETTING_TOASTS_ENABLED: 1 = on (DND off), 0 = off (DND on/priority only)
    try {
        $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings'
        if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
        $val = if ($Enable) { 0 } else { 1 }
        Set-ItemProperty -Path $key -Name 'NOC_GLOBAL_SETTING_TOASTS_ENABLED' -Value $val -Type DWord -Force
        return $true
    } catch {
        Write-Output "[WORKSPACE] Failed to set Focus Assist: $($_.Exception.Message)"
        return $false
    }
}

function Set-WindowsUpdatePause {
    param([bool]$Pause)
    try {
        $key = 'HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings'
        if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
        if ($Pause) {
            # Pause for 7 days (35 days is max; using 7 to be conservative).
            $expiry = (Get-Date).AddDays(7).ToString('o')
            Set-ItemProperty -Path $key -Name 'PauseUpdatesExpiryTime' -Value $expiry -Type String -Force
            Set-ItemProperty -Path $key -Name 'PauseFeatureUpdatesStartTime' -Value (Get-Date).ToString('o') -Type String -Force
            Set-ItemProperty -Path $key -Name 'PauseQualityUpdatesStartTime' -Value (Get-Date).ToString('o') -Type String -Force
            return $true
        } else {
            Remove-ItemProperty -Path $key -Name 'PauseUpdatesExpiryTime' -ErrorAction SilentlyContinue
            Remove-ItemProperty -Path $key -Name 'PauseFeatureUpdatesStartTime' -ErrorAction SilentlyContinue
            Remove-ItemProperty -Path $key -Name 'PauseQualityUpdatesStartTime' -ErrorAction SilentlyContinue
            return $true
        }
    } catch {
        Write-Output "[WORKSPACE] Failed to set WU pause: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-LaunchApps {
    param([string[]]$Paths)
    $launched = 0
    $failed = 0
    foreach ($p in $Paths) {
        if (-not (Test-SafePath $p)) { $failed++; continue }
        try {
            # If it's a bare name like "code" or "chrome", use Start-Process which uses PATH.
            # If it's a path with .exe, use the path directly.
            if ($p -match '\.exe$' -or $p -match '^[A-Za-z]:\\') {
                Start-Process -FilePath $p -ErrorAction Stop
            } else {
                Start-Process -FilePath $p -ErrorAction Stop
            }
            $launched++
        } catch {
            Write-Output "[WORKSPACE] Failed to launch $p : $($_.Exception.Message)"
            $failed++
        }
    }
    return @{ launched = $launched; failed = $failed }
}

function Invoke-KillApps {
    param([string[]]$Names)
    $killed = 0
    $failed = 0
    foreach ($n in $Names) {
        if (-not (Test-SafePath $n)) { $failed++; continue }
        try {
            $procs = @(Get-Process -Name $n -ErrorAction SilentlyContinue)
            foreach ($pr in $procs) {
                try {
                    Stop-Process -Id $pr.Id -Force -ErrorAction Stop
                    $killed++
                } catch { $failed++ }
            }
        } catch { $failed++ }
    }
    return @{ killed = $killed; failed = $failed }
}

# --- Actions ---

function Invoke-GetCurrentState {
    $state = @{
        powerPlanGuid = Get-PowerPlanGuid
        focusAssist   = Get-FocusAssistState
        windowsUpdate = Get-WindowsUpdateState
        runningApps   = Get-RunningProcessNames
    }
    Write-TimedJsonResult @{
        success = $true
        state = $state
        message = 'Current system state snapshot.'
    } $timer
}

function Invoke-ApplyProfile {
    if (-not $ProfileJson) {
        Write-JsonError 'ProfileJson required for apply-profile.' 'apply-profile'
        exit 1
    }
    try {
        $profile = $ProfileJson | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid profile JSON: $($_.Exception.Message)" 'apply-profile'
        exit 1
    }

    $profileId = $profile.id
    $profileName = $profile.name
    if (-not $profileId) {
        Write-JsonError 'Profile missing id.' 'apply-profile'
        exit 1
    }

    Write-Output "[WORKSPACE] Applying profile: $profileName ($profileId)"

    # STEP 1: Capture before-state (for restore)
    $beforeState = @{
        powerPlanGuid = Get-PowerPlanGuid
        focusAssist   = Get-FocusAssistState
        windowsUpdate = Get-WindowsUpdateState
        killedApps    = @()  # populated below if killApps action runs
    }

    # STEP 2: Apply actions
    $actions = $profile.actions
    $results = @{
        launched = @{ launched = 0; failed = 0 }
        killed   = @{ killed = 0; failed = 0 }
        focusAssistSet = $false
        powerPlanSet   = $false
        wuPausedSet    = $false
    }

    if ($actions.killApps -and $actions.killApps.Count -gt 0) {
        Write-Output "[WORKSPACE] Killing apps: $($actions.killApps -join ', ')"
        $killResult = Invoke-KillApps -Names $actions.killApps
        $results.killed = $killResult
        $beforeState.killedApps = $actions.killApps
    }

    if ($actions.focusAssist -ne $null) {
        $enable = [bool]$actions.focusAssist
        Write-Output "[WORKSPACE] Setting Focus Assist (DND) = $enable"
        $results.focusAssistSet = Set-FocusAssist -Enable $enable
    }

    if ($actions.powerPlan) {
        Write-Output "[WORKSPACE] Setting power plan = $($actions.powerPlan)"
        $results.powerPlanSet = Set-PowerPlan -Plan $actions.powerPlan
    }

    if ($actions.pauseWindowsUpdate -ne $null) {
        $pause = [bool]$actions.pauseWindowsUpdate
        Write-Output "[WORKSPACE] Setting Windows Update pause = $pause"
        $results.wuPausedSet = Set-WindowsUpdatePause -Pause $pause
    }

    if ($actions.launchApps -and $actions.launchApps.Count -gt 0) {
        Write-Output "[WORKSPACE] Launching apps: $($actions.launchApps -join ', ')"
        $launchResult = Invoke-LaunchApps -Paths $actions.launchApps
        $results.launched = $launchResult
    }

    # STEP 3: Persist applied state for restore
    $appliedEntry = @{
        profileId   = $profileId
        profileName = $profileName
        appliedIso  = (Get-Date).ToString('o')
        beforeState = $beforeState
        results     = $results
    }
    $appliedEntry | ConvertTo-Json -Depth 6 | Out-File -FilePath (Get-AppliedStatePath) -Encoding UTF8

    Write-AuditLog -Action 'workspace-apply-profile' -Result 'success' -Target $profileName -Details "Launched=$($results.launched.launched), Killed=$($results.killed.killed), FocusAssist=$($results.focusAssistSet), PowerPlan=$($results.powerPlanSet), WUPause=$($results.wuPausedSet)"

    Write-TimedJsonResult @{
        success = $true
        profileId = $profileId
        profileName = $profileName
        results = $results
        message = "Profile '$profileName' applied. Use restore to revert."
    } $timer
}

function Invoke-RestoreProfile {
    $appliedPath = Get-AppliedStatePath
    if (-not (Test-Path $appliedPath)) {
        Write-JsonError 'No profile is currently applied.' 'restore-profile'
        exit 1
    }
    try {
        $applied = Get-Content -Path $appliedPath -Raw | ConvertFrom-Json
    } catch {
        Write-JsonError "Failed to read applied state: $($_.Exception.Message)" 'restore-profile'
        exit 1
    }

    $before = $applied.beforeState
    Write-Output "[WORKSPACE] Restoring profile: $($applied.profileName) ($($applied.profileId))"

    $results = @{
        focusAssistRestored = $false
        powerPlanRestored   = $false
        wuRestored          = $false
    }

    # Restore Focus Assist (only if we changed it)
    if ($before.focusAssist -and $before.focusAssist -ne 'unknown') {
        # 'priority' or 'alarms' = DND was on, 'off' = DND was off
        $wasDndOn = ($before.focusAssist -ne 'off')
        Write-Output "[WORKSPACE] Restoring Focus Assist to: $($before.focusAssist)"
        $results.focusAssistRestored = Set-FocusAssist -Enable $wasDndOn
    }

    # Restore power plan
    if ($before.powerPlanGuid) {
        Write-Output "[WORKSPACE] Restoring power plan: $($before.powerPlanGuid)"
        $out = powercfg /setactive $before.powerPlanGuid 2>&1
        $results.powerPlanRestored = ($LASTEXITCODE -eq 0)
    }

    # Restore WU state (only if it was active before)
    if ($before.windowsUpdate -eq 'active') {
        Write-Output "[WORKSPACE] Restoring Windows Update (unpausing)"
        $results.wuRestored = Set-WindowsUpdatePause -Pause $false
    }

    # Delete the applied state file so a second restore is a no-op
    try { Remove-Item -Path $appliedPath -Force -ErrorAction SilentlyContinue } catch {}

    Write-AuditLog -Action 'workspace-restore-profile' -Result 'success' -Target $applied.profileName -Details "FocusAssist=$($results.focusAssistRestored), PowerPlan=$($results.powerPlanRestored), WU=$($results.wuRestored)"

    Write-TimedJsonResult @{
        success = $true
        profileId = $applied.profileId
        profileName = $applied.profileName
        results = $results
        message = "Profile '$($applied.profileName)' restored to previous state."
    } $timer
}

function Invoke-LaunchAppsAction {
    if (-not $ProfileJson) {
        Write-JsonError 'ProfileJson required for launch-apps.' 'launch-apps'
        exit 1
    }
    try {
        $apps = $ProfileJson | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid app list JSON: $($_.Exception.Message)" 'launch-apps'
        exit 1
    }
    $result = Invoke-LaunchApps -Paths $apps
    Write-TimedJsonResult @{
        success = $true
        result = $result
        message = "Launched $($result.launched) app(s); $($result.failed) failed."
    } $timer
}

function Invoke-KillAppsAction {
    if (-not $ProfileJson) {
        Write-JsonError 'ProfileJson required for kill-apps.' 'kill-apps'
        exit 1
    }
    try {
        $apps = $ProfileJson | ConvertFrom-Json
    } catch {
        Write-JsonError "Invalid app list JSON: $($_.Exception.Message)" 'kill-apps'
        exit 1
    }
    $result = Invoke-KillApps -Names $apps
    Write-TimedJsonResult @{
        success = $true
        result = $result
        message = "Killed $($result.killed) process(es); $($result.failed) failed."
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'get-current-state' { Invoke-GetCurrentState }
        'apply-profile'     { Invoke-ApplyProfile }
        'restore-profile'   { Invoke-RestoreProfile }
        'launch-apps'       { Invoke-LaunchAppsAction }
        'kill-apps'         { Invoke-KillAppsAction }
        default {
            Write-JsonError "Invalid action: $Action" 'workspace_automation'
        }
    }
} catch {
    Write-AuditLog -Action "workspace-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "workspace_automation.$Action"
}
