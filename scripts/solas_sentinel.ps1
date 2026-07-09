# solas_sentinel.ps1
# SolasCare Pro - Feature 10: Solas Sentinel (Background Watchdog & Auto-Healing)
#
# Lightweight PS-side helper for the Sentinel watcher. The actual rule engine
# (if-then logic) lives in electron/sentinelStore.js (JS). This script:
#   - Reads current system state (network drops, stuck services, RAM spikes, CPU temp)
#   - Applies heal actions when JS layer asks (via run-sentinel-tool IPC)
#
# Why PS-only-for-state + JS-for-rules: rules need to be editable by the user
# via a UI; storing them in JS (with JSON persistence) keeps them versionable
# and human-readable. PS just executes heal actions safely.
#
# Actions:
#   get-status              - Snapshot of network adapters, services, RAM, CPU, disk
#   reset-network-adapter   - Restart a specific network adapter by name
#   restart-service         - Restart a Windows service by name (with safety check)
#   kill-process            - Kill a process by name (not PID — avoids stale PIDs)
#   clear-print-spooler     - Stop spooler, delete queued jobs, start spooler
#   flush-dns               - ipconfig /flushdns

param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$ServiceName,
    [string]$ActionArg
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Safety ---

function Test-SafeServiceName {
    param([string]$s)
    if (-not $s) { return $false }
    if ($s.Length -gt 200) { return $false }
    if ($s -match '[^A-Za-z0-9_\.\-]') { return $false }
    # Blacklist critical Windows services that should never be restarted
    $blacklist = @('Winlogon','lsass','services','csrss','wininit','smss','svchost','System')
    if ($blacklist -contains $s) { return $false }
    return $true
}

function Test-SafeProcessName {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p.Length -gt 200) { return $false }
    if ($p -match '[<>|"`$;]') { return $false }
    # Blacklist critical processes
    $blacklist = @('winlogon','lsass','services','csrss','wininit','smss','svchost','System','explorer','dwm')
    if ($blacklist -contains $p.ToLower()) { return $false }
    return $true
}

function Test-SafeAdapterName {
    param([string]$n)
    if (-not $n) { return $false }
    if ($n.Length -gt 200) { return $false }
    if ($n -match '[<>|"`$;]') { return $false }
    return $true
}

# --- Actions ---

function Invoke-GetStatus {
    $status = @{
        polledIso = (Get-Date).ToString('o')
        networkAdapters = @()
        services = @()
        ram = @{ totalBytes = 0; freeBytes = 0; usedPercent = 0 }
        cpu = @{ loadPercent = 0; tempCelsius = $null }
        disk = @{ systemDrive = ''; totalBytes = 0; freeBytes = 0; usedPercent = 0 }
        topProcesses = @()
    }

    # Network adapters
    try {
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' -or $_.Status -eq 'Disconnected' }
        foreach ($a in $adapters) {
            $status.networkAdapters += @{
                name = $a.Name
                interfaceDescription = $a.InterfaceDescription
                status = $a.Status
                linkSpeed = $a.LinkSpeed
                macAddress = $a.MacAddress
            }
        }
    } catch {}

    # Services (top 20 by status — only stopped auto-start services are interesting)
    try {
        $svcs = Get-CimInstance -ClassName Win32_Service -ErrorAction SilentlyContinue |
                Where-Object { $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' } |
                Select-Object -First 20
        foreach ($s in $svcs) {
            $status.services += @{
                name = $s.Name
                displayName = $s.DisplayName
                state = $s.State
                startMode = $s.StartMode
            }
        }
    } catch {}

    # RAM
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $status.ram.totalBytes = $os.TotalVisibleMemorySize * 1024
            $status.ram.freeBytes = $os.FreePhysicalMemory * 1024
            $used = $status.ram.totalBytes - $status.ram.freeBytes
            if ($status.ram.totalBytes -gt 0) {
                $status.ram.usedPercent = [math]::Round(($used / $status.ram.totalBytes) * 100, 1)
            }
        }
    } catch {}

    # CPU load
    try {
        $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($cpu) {
            $status.cpu.loadPercent = $cpu.LoadPercentage
        }
    } catch {}

    # CPU temp (best-effort, vendor-specific)
    try {
        $zones = Get-CimInstance -Namespace 'root\WMI' -ClassName 'MSAcpi_ThermalZoneTemperature' -ErrorAction SilentlyContinue
        $zone = $zones | Select-Object -First 1
        if ($zone -and $zone.CurrentTemperature) {
            $status.cpu.tempCelsius = [math]::Round(($zone.CurrentTemperature / 10) - 273.15, 1)
        }
    } catch {}

    # Disk
    try {
        $sysDrive = $env:SystemDrive
        $vol = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID = '$sysDrive'" -ErrorAction SilentlyContinue
        if ($vol) {
            $status.disk.systemDrive = $sysDrive
            $status.disk.totalBytes = $vol.Size
            $status.disk.freeBytes = $vol.FreeSpace
            $used = $vol.Size - $vol.FreeSpace
            if ($vol.Size -gt 0) {
                $status.disk.usedPercent = [math]::Round(($used / $vol.Size) * 100, 1)
            }
        }
    } catch {}

    # Top 5 processes by memory
    try {
        $top = Get-Process -ErrorAction SilentlyContinue |
               Sort-Object WorkingSet64 -Descending |
               Select-Object -First 5 Name, @{N='memMB';E={[math]::Round($_.WorkingSet64 / 1MB, 1)}}, Id
        $status.topProcesses = @($top | ForEach-Object {
            @{ name = $_.Name; memMB = $_.memMB; pid = $_.Id }
        })
    } catch {}

    Write-TimedJsonResult @{
        success = $true
        status = $status
        message = "Sentinel status polled: $($status.networkAdapters.Count) adapters, $($status.services.Count) stopped services, RAM $($status.ram.usedPercent)%, CPU $($status.cpu.loadPercent)%"
    } $timer
}

function Invoke-ResetNetworkAdapter {
    if (-not (Test-SafeAdapterName $ActionArg)) {
        Write-JsonError "Invalid adapter name or blocked: $ActionArg" 'reset-network-adapter'
        exit 1
    }
    Write-Output "[SENTINEL] Restarting network adapter: $ActionArg"
    try {
        # Disable then Enable (Restart-NetAdapter exists but can hang in some Windows builds)
        Disable-NetAdapter -Name $ActionArg -Confirm:$false -ErrorAction Stop
        Start-Sleep -Seconds 2
        Enable-NetAdapter -Name $ActionArg -Confirm:$false -ErrorAction Stop
        Write-AuditLog -Action 'sentinel-reset-adapter' -Result 'success' -Target $ActionArg
        Write-TimedJsonResult @{
            success = $true
            adapter = $ActionArg
            message = "Network adapter '$ActionArg' reset successfully."
        } $timer
    } catch {
        Write-JsonError "Failed to reset adapter: $($_.Exception.Message)" 'reset-network-adapter'
        exit 1
    }
}

function Invoke-RestartService {
    if (-not (Test-SafeServiceName $ServiceName)) {
        Write-JsonError "Invalid or blocked service name: $ServiceName" 'restart-service'
        exit 1
    }
    Write-Output "[SENTINEL] Restarting service: $ServiceName"
    try {
        $svc = Get-Service -Name $ServiceName -ErrorAction Stop
        if ($svc.Status -eq 'Running') {
            Stop-Service -Name $ServiceName -Force -ErrorAction Stop
            Start-Sleep -Seconds 1
        }
        Start-Service -Name $ServiceName -ErrorAction Stop
        Write-AuditLog -Action 'sentinel-restart-service' -Result 'success' -Target $ServiceName
        Write-TimedJsonResult @{
            success = $true
            service = $ServiceName
            message = "Service '$ServiceName' restarted successfully."
        } $timer
    } catch {
        Write-JsonError "Failed to restart service: $($_.Exception.Message)" 'restart-service'
        exit 1
    }
}

function Invoke-KillProcess {
    if (-not (Test-SafeProcessName $ActionArg)) {
        Write-JsonError "Invalid or blocked process name: $ActionArg" 'kill-process'
        exit 1
    }
    Write-Output "[SENTINEL] Killing process: $ActionArg"
    try {
        $procs = Get-Process -Name $ActionArg -ErrorAction SilentlyContinue
        if (-not $procs) {
            Write-TimedJsonResult @{ success = $true; killed = 0; message = "No process named '$ActionArg' found." } $timer
            return
        }
        $killed = 0
        $failed = 0
        foreach ($p in $procs) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed++ } catch { $failed++ }
        }
        Write-AuditLog -Action 'sentinel-kill-process' -Result 'success' -Target $ActionArg -Details "Killed=$killed, Failed=$failed"
        Write-TimedJsonResult @{
            success = ($failed -eq 0)
            killed = $killed
            failed = $failed
            message = "Killed $killed process(es) named '$ActionArg'."
        } $timer
    } catch {
        Write-JsonError "Failed to kill process: $($_.Exception.Message)" 'kill-process'
        exit 1
    }
}

function Invoke-ClearPrintSpooler {
    Write-Output "[SENTINEL] Clearing print spooler..."
    try {
        Stop-Service -Name Spooler -Force -ErrorAction SilentlyContinue
        $printDir = "$env:windir\System32\spool\PRINTERS"
        if (Test-Path $printDir) {
            Get-ChildItem -Path $printDir -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
        }
        Start-Service -Name Spooler -ErrorAction SilentlyContinue
        Write-AuditLog -Action 'sentinel-clear-spooler' -Result 'success'
        Write-TimedJsonResult @{
            success = $true
            message = 'Print spooler cleared and restarted.'
        } $timer
    } catch {
        Write-JsonError "Failed to clear spooler: $($_.Exception.Message)" 'clear-print-spooler'
        exit 1
    }
}

function Invoke-FlushDns {
    Write-Output "[SENTINEL] Flushing DNS cache..."
    try {
        $out = ipconfig /flushdns 2>&1 | Out-String
        Write-AuditLog -Action 'sentinel-flush-dns' -Result 'success'
        Write-TimedJsonResult @{
            success = $true
            message = 'DNS cache flushed.'
            output = $out
        } $timer
    } catch {
        Write-JsonError "Failed to flush DNS: $($_.Exception.Message)" 'flush-dns'
        exit 1
    }
}

# --- Dispatch ---
try {
    switch ($Action) {
        'get-status'              { Invoke-GetStatus }
        'reset-network-adapter'   { Invoke-ResetNetworkAdapter }
        'restart-service'         { Invoke-RestartService }
        'kill-process'            { Invoke-KillProcess }
        'clear-print-spooler'     { Invoke-ClearPrintSpooler }
        'flush-dns'               { Invoke-FlushDns }
        default {
            Write-JsonError "Invalid action: $Action" 'solas_sentinel'
        }
    }
} catch {
    Write-AuditLog -Action "sentinel-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "solas_sentinel.$Action"
}
