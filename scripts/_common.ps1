# scripts/_common.ps1
# Shared helpers for all SolasCarePro PowerShell scripts.
# Dot-source at the top of every script: `. (Join-Path $PSScriptRoot '_common.ps1')`
#
# Provides:
#   ConvertTo-JsonArray  - PS 5.1-safe JSON array serialization
#   Write-JsonError      - JSON error object to stdout (not stderr)
#   Write-JsonResult     - JSON success/result object to stdout with durationSec
#   Invoke-WithTimeout   - run an external tool with a hard timeout + kill
#   Invoke-WithRetry     - retry a flaky scriptblock with backoff
#   Get-OSMajorVersion   - cached Windows major version
#   Assert-Admin         - exit with JSON error if not elevated
#   Start-Timer          - stopwatch wrapper for durationSec tracking
#   Get-EnabledAdapters  - cached Win32_NetworkAdapterConfiguration(IPEnabled=true)

# --- JSON output helpers ---

function ConvertTo-JsonArray {
    param([Parameter(ValueFromPipeline=$true)][object[]]$List)
    begin { $items = @() }
    process { if ($_) { $items += $_ } }
    end {
        # PS 5.1 emits nothing on empty array; PS 7 emits 'null'. Force '[]'.
        if ($items.Count -eq 0) { return '[]' }
        if ($items.Count -eq 1) { return "[$($items[0] | ConvertTo-Json -Compress)]" }
        return ($items | ConvertTo-Json -Compress)
    }
}

function Write-JsonError {
    param([string]$Message, [string]$Source = $null)
    $safe = ($Message -replace '[\\"]',' ').Trim()
    if ($Source) { $safe = "${Source}: ${safe}" }
    Write-Output ('{"success":false,"error":"' + $safe + '"}')
}

function Write-JsonResult {
    param([hashtable]$Data, [double]$DurationSec)
    if ($null -eq $Data) { $Data = @{} }
    if (-not $Data.ContainsKey('success')) { $Data['success'] = $true }
    if ($DurationSec -gt 0) { $Data['durationSec'] = [math]::Round($DurationSec, 2) }
    Write-Output ($Data | ConvertTo-Json -Compress)
}

# --- Process / timeout helpers ---

function Invoke-WithTimeout {
    param(
        [string]$FilePath,
        [string]$ArgumentList,
        [int]$TimeoutSec = 600,
        [string]$WorkingDirectory = $null
    )
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FilePath
    $psi.Arguments = $ArgumentList
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    if ($WorkingDirectory) { $psi.WorkingDirectory = $WorkingDirectory }

    $p = [System.Diagnostics.Process]::Start($psi)
    try {
        if (-not $p.WaitForExit($TimeoutSec * 1000)) {
            try { $p.Kill() } catch {}
            try { $p.WaitForExit(2000) | Out-Null } catch {}
            throw "Process '$FilePath' exceeded ${TimeoutSec}s timeout and was terminated."
        }
    } finally {
        $stdout = $p.StandardOutput.ReadToEnd()
        $stderr = $p.StandardError.ReadToEnd()
        if (-not $p.HasExited) { try { $p.Kill() } catch {} }
        $p.Dispose()
    }
    return @{ ExitCode = $p.ExitCode; StdOut = $stdout; StdErr = $stderr }
}

function Invoke-WithRetry {
    param(
        [scriptblock]$Block,
        [int]$MaxAttempts = 3,
        [int]$BackoffBaseSec = 2,
        [string]$OperationName = 'operation'
    )
    $lastErr = $null
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            return & $Block
        } catch {
            $lastErr = $_
            if ($attempt -lt $MaxAttempts) {
                Start-Sleep -Seconds ($BackoffBaseSec * $attempt)
            }
        }
    }
    throw "Invoke-WithRetry ($OperationName) failed after $MaxAttempts attempts: $($lastErr.Exception.Message)"
}

# --- Environment / version helpers ---

$_osMajorCache = $null
function Get-OSMajorVersion {
    if ($null -ne $_osMajorCache) { return $_osMajorCache }
    try {
        $_osMajorCache = [System.Environment]::OSVersion.Version.Major
    } catch {
        $_osMajorCache = 10
    }
    return $_osMajorCache
}

function Assert-Admin {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($id)
        if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            Write-JsonError 'Administrator elevation required' 'Assert-Admin'
            exit 1
        }
    } catch {
        Write-JsonError "Failed to check admin status: $($_.Exception.Message)" 'Assert-Admin'
        exit 1
    }
}

# --- Timer (for durationSec tracking) ---

function Start-Timer {
    return [PSCustomObject]@{
        Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        StartedIso = (Get-Date -Format 'o')
    }
}

# Helper: read elapsed seconds from a timer object returned by Start-Timer.
function Get-TimerElapsedSec {
    param($Timer)
    if ($null -eq $Timer -or $null -eq $Timer.Stopwatch) { return 0 }
    return $Timer.Stopwatch.Elapsed.TotalSeconds
}

# Helper: convenience wrapper that wraps Write-JsonResult and reads the timer.
function Write-TimedJsonResult {
    param([hashtable]$Data, $Timer)
    $elapsed = Get-TimerElapsedSec $Timer
    Write-JsonResult -Data $Data -DurationSec $elapsed
}

# --- Network adapter cache (called frequently by network_optimize.ps1 and update_software.ps1) ---

$_enabledAdaptersCache = $null
function Get-EnabledAdapters {
    if ($null -ne $_enabledAdaptersCache) { return $_enabledAdaptersCache }
    try {
        # WQL server-side filter is much faster than | Where-Object
        $_enabledAdaptersCache = @(Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" -ErrorAction Stop)
    } catch {
        try {
            $_enabledAdaptersCache = @(Get-WmiObject -Class Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" -ErrorAction SilentlyContinue)
        } catch {
            $_enabledAdaptersCache = @()
        }
    }
    return $_enabledAdaptersCache
}

# Export nothing - dot-sourcing imports all functions into the caller's scope.
