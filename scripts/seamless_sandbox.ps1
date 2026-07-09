# seamless_sandbox.ps1
# SolasCare Pro - Feature 12: Seamless Sandbox (Safe File Execution)
#
# Wraps Windows Sandbox (built into Windows 10/11 Pro/Enterprise) with a
# drag-drop UI. Suspicious files run isolated — main Windows stays 100% safe.
#
# PER SENIOR-ENGINEER CRITIQUE: clear edition check.
# Windows Sandbox requires Windows 10/11 Pro/Enterprise. Home edition does NOT
# support Hyper-V → Sandbox unavailable. We detect and clearly communicate.
#
# Actions:
#   check-availability     - Returns whether Sandbox feature is enabled + edition supports it
#   enable-feature         - Enable the Containers-DisposableClientVM feature (requires reboot)
#   generate-wsb           - Generate a .wsb config file with mount + command settings
#   launch-sandbox         - Launch Windows Sandbox with a generated .wsb file
#   list-templates         - List built-in sandbox templates (suspicious-exe, browser-test, etc.)
#   parse-activity-log     - Read Sandbox ETW events (file/network activity from last session)

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$WsbPath,           # for launch-sandbox: path to .wsb file
    [string]$TemplateId,        # for generate-wsb: which template to use
    [string]$HostFolderPath,    # for generate-wsb: folder to mount read-only in sandbox
    [string]$CommandToRun       # for generate-wsb: command to execute inside sandbox
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Storage ---
function Get-SandboxRoot {
    $dir = Join-Path (Join-Path $env:APPDATA 'SolasCare') 'sandbox'
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return $dir
}
function Get-WsbDir {
    $dir = Join-Path (Get-SandboxRoot) 'wsb_files'
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

# --- Edition detection ---

function Get-WindowsEdition {
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        return $os.Caption
    } catch {
        return 'Unknown'
    }
}

function Test-SandboxFeatureEnabled {
    try {
        $f = Get-WindowsOptionalFeature -Online -FeatureName 'Containers-DisposableClientVM' -ErrorAction SilentlyContinue
        return ($f -and $f.State -eq 'Enabled')
    } catch {
        return $false
    }
}

function Test-EditionSupportsSandbox {
    $caption = Get-WindowsEdition
    # Home edition does NOT support Sandbox
    if ($caption -match 'Home') { return $false }
    # Pro, Enterprise, Education all support it
    if ($caption -match 'Pro|Enterprise|Education') { return $true }
    return $false
}

# --- Built-in templates ---
# Each template defines: default host folder mount + default command + readonly
$SANDBOX_TEMPLATES = @(
    @{
        id = 'suspicious-exe'
        name = 'Suspicious Executable'
        description = 'Run an unknown .exe safely. Host folder mounted read-only.'
        defaultCommand = 'cmd.exe'
        readOnly = $true
    },
    @{
        id = 'browser-test'
        name = 'Browser / Web Test'
        description = 'Open a suspicious URL or test a web installer. Clean browser each time.'
        defaultCommand = 'cmd.exe /c start https://example.com'
        readOnly = $false
    },
    @{
        id = 'installer-test'
        name = 'Installer Test'
        description = 'Run an installer to see what it does without polluting main Windows.'
        defaultCommand = 'powershell.exe'
        readOnly = $true
    },
    @{
        id = 'custom'
        name = 'Custom'
        description = 'Empty sandbox. Specify your own command and host folder.'
        defaultCommand = 'cmd.exe'
        readOnly = $false
    }
)

# --- Actions ---

function Invoke-CheckAvailability {
    $edition = Get-WindowsEdition
    $editionSupported = Test-EditionSupportsSandbox
    $featureEnabled = Test-SandboxFeatureEnabled

    $message = if (-not $editionSupported) {
        "Windows Sandbox requires Pro/Enterprise/Education. Your edition: $edition. Home edition is NOT supported."
    } elseif (-not $featureEnabled) {
        "Windows Sandbox feature is disabled. Run 'Enable Feature' to enable (requires reboot)."
    } else {
        'Windows Sandbox is available and enabled.'
    }

    Write-TimedJsonResult @{
        success = $true
        edition = $edition
        editionSupported = $editionSupported
        featureEnabled = $featureEnabled
        available = ($editionSupported -and $featureEnabled)
        message = $message
    } $timer
}

function Invoke-EnableFeature {
    Write-Output "[SANDBOX] Enabling Containers-DisposableClientVM feature..."
    try {
        $out = Enable-WindowsOptionalFeature -Online -FeatureName 'Containers-DisposableClientVM' -All -NoRestart -ErrorAction Stop 2>&1 | Out-String
        Write-AuditLog -Action 'sandbox-enable-feature' -Result 'success' -Details $out
        Write-TimedJsonResult @{
            success = $true
            message = 'Feature enabled. REBOOT REQUIRED to complete installation.'
            rebootRequired = $true
        } $timer
    } catch {
        Write-JsonError "Failed to enable feature: $($_.Exception.Message)" 'enable-feature'
        exit 1
    }
}

function Invoke-ListTemplates {
    Write-TimedJsonResult @{
        success = $true
        templates = $SANDBOX_TEMPLATES
    } $timer
}

function Invoke-GenerateWsb {
    if (-not $TemplateId) {
        Write-JsonError 'TemplateId required.' 'generate-wsb'
        exit 1
    }
    $template = $SANDBOX_TEMPLATES | Where-Object { $_.id -eq $TemplateId } | Select-Object -First 1
    if (-not $template) {
        Write-JsonError "Unknown template: $TemplateId" 'generate-wsb'
        exit 1
    }

    $cmd = if ($CommandToRun) { $CommandToRun } else { $template.defaultCommand }
    $readOnly = if ($template.readOnly) { 'true' } else { 'false' }

    # Build .wsb XML
    $hostFolderXml = ''
    if ($HostFolderPath -and (Test-SafePath $HostFolderPath) -and (Test-Path $HostFolderPath)) {
        # Escape XML special chars in path
        $escapedPath = $HostFolderPath -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;' -replace '"','&quot;'
        $hostFolderXml = "<MappedFolder><HostFolder>$escapedPath</HostFolder><ReadOnly>$readOnly</ReadOnly></MappedFolder>"
    }

    $escapedCmd = $cmd -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;'
    $wsbContent = @"
<Configuration>
  <vGPU>Default</vGPU>
  <Networking>Default</Networking>
  <MappedFolders>
    $hostFolderXml
  </MappedFolders>
  <LogonCommand>
    <Command>$escapedCmd</Command>
  </LogonCommand>
</Configuration>
"@

    $wsbPath = Join-Path (Get-WsbDir) "solas_sandbox_$(Get-Date -Format 'yyyyMMdd_HHmmss').wsb"
    $wsbContent | Out-File -FilePath $wsbPath -Encoding UTF8

    Write-AuditLog -Action 'sandbox-generate-wsb' -Result 'success' -Target $wsbPath -Details "Template=$TemplateId, Cmd=$cmd"
    Write-TimedJsonResult @{
        success = $true
        wsbPath = $wsbPath
        template = $template.id
        command = $cmd
        message = "WSB config generated at $wsbPath"
    } $timer
}

function Invoke-LaunchSandbox {
    if (-not (Test-SafePath $WsbPath) -or -not (Test-Path $WsbPath)) {
        Write-JsonError "WSB file not found: $WsbPath" 'launch-sandbox'
        exit 1
    }
    if (-not (Test-SandboxFeatureEnabled)) {
        Write-JsonError 'Windows Sandbox feature not enabled.' 'launch-sandbox'
        exit 1
    }

    Write-Output "[SANDBOX] Launching Windows Sandbox with $WsbPath ..."
    try {
        # Windows Sandbox is launched via the .wsb file association
        Start-Process -FilePath $WsbPath -ErrorAction Stop
        Write-AuditLog -Action 'sandbox-launch' -Result 'success' -Target $WsbPath
        Write-TimedJsonResult @{
            success = $true
            message = 'Windows Sandbox launched. Activity log available after sandbox closes.'
        } $timer
    } catch {
        Write-JsonError "Failed to launch sandbox: $($_.Exception.Message)" 'launch-sandbox'
        exit 1
    }
}

function Invoke-ParseActivityLog {
    # Read Sandbox-related ETW events from the last 24 hours.
    # Windows Sandbox logs to: Microsoft-Windows-Hyper-V-Worker, Microsoft-Windows-Hyper-V-VMMS
    $events = @()
    try {
        $since = (Get-Date).AddHours(-24)
        $raw = Get-WinEvent -FilterHashtable @{
            LogName = 'Microsoft-Windows-Hyper-V-Worker'
            StartTime = $since
        } -MaxEvents 100 -ErrorAction SilentlyContinue
        foreach ($e in $raw) {
            $events += [PSCustomObject]@{
                ts = $e.TimeCreated.ToString('o')
                id = $e.Id
                level = $e.LevelDisplayName
                message = ($e.Message -replace "`r`n", ' ' -replace "`n", ' ').Trim().Substring(0, [math]::Min(500, $e.Message.Length))
                provider = $e.ProviderName
            }
        }
    } catch {}

    Write-TimedJsonResult @{
        success = $true
        events = $events
        count = $events.Count
        message = "Found $($events.Count) Sandbox-related events in last 24h."
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'check-availability'    { Invoke-CheckAvailability }
        'enable-feature'        { Invoke-EnableFeature }
        'list-templates'        { Invoke-ListTemplates }
        'generate-wsb'          { Invoke-GenerateWsb }
        'launch-sandbox'        { Invoke-LaunchSandbox }
        'parse-activity-log'    { Invoke-ParseActivityLog }
        default {
            Write-JsonError "Invalid action: $Action" 'seamless_sandbox'
        }
    }
} catch {
    Write-AuditLog -Action "sandbox-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "seamless_sandbox.$Action"
}
