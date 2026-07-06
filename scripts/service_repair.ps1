[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('list', 'repair', 'restart', 'set-startup')]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$ServiceName,

    [Parameter(Mandatory=$false)]
    [ValidateSet('Automatic', 'Manual', 'Disabled')]
    [string]$StartupType = 'Automatic'
)

# IMPROVEMENT: dot-source shared helpers for JSON output and timing.
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'

# Services that should never be restarted (would destabilise the system or
# trigger an immediate reboot). Restarting RpcSs freezes the session,
# restarting Schedule kills all scheduled tasks until reboot, etc.
$neverRestart = @('RpcSs', 'Schedule', 'Winlogon', 'WinInit', 'csrss', 'lsass', 'services')

$criticalServicesList = @(
    'wuauserv', 'bits', 'WSearch', 'Spooler', 'MpsSvc',
    'WinDefend', 'Audiosrv', 'AudioEndpointBuilder', 'DHCP',
    'Dnscache', 'LanmanWorkstation', 'RpcSs', 'Schedule', 'Themes'
)

$requiredServices = @('RpcSs', 'Schedule', 'DHCP', 'Dnscache', 'LanmanWorkstation')

$timer = Start-Timer

if ($Action -eq 'list') {
    try {
        $services = @()
        foreach ($name in $criticalServicesList) {
            $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
            if ($svc) {
                $startType = $svc.StartType.ToString()
                # IMPROVEMENT: surface service dependency tree so the UI can
                # show "Cannot start Spooler because RPCSS is stopped" instead
                # of a generic error. BlockedBy = dependencies that are not Running.
                $dependsOn = @($svc.ServicesDependedOn | ForEach-Object { $_.Name })
                $dependedBy = @($svc.DependentServices | ForEach-Object { $_.Name })
                $blockedBy = @()
                foreach ($dep in $svc.ServicesDependedOn) {
                    try {
                        $depSvc = Get-Service -Name $dep.Name -ErrorAction Stop
                        if ($depSvc.Status -ne 'Running') { $blockedBy += $dep.Name }
                    } catch {}
                }
                $services += [PSCustomObject]@{
                    Name = $svc.Name
                    DisplayName = $svc.DisplayName
                    Status = $svc.Status.ToString()
                    StartType = $startType
                    CanStop = $svc.CanStop
                    IsRequired = $requiredServices -contains $svc.Name
                    DependsOn = $dependsOn
                    DependedBy = $dependedBy
                    BlockedBy = $blockedBy
                }
            } else {
                $services += [PSCustomObject]@{
                    Name = $name
                    DisplayName = "Service '$name' not found"
                    Status = 'NotFound'
                    StartType = 'N/A'
                    CanStop = $false
                    IsRequired = $requiredServices -contains $name
                    DependsOn = @()
                    DependedBy = @()
                    BlockedBy = @()
                }
            }
        }
        Write-JsonResult @{ data = $services } (Get-TimerElapsedSec $timer)
    } catch {
        Write-JsonError $_.Exception.Message 'list'
    }
}
elseif ($Action -eq 'repair') {
    try {
        if (-not $ServiceName) { throw "ServiceName parameter is required." }

        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Service '$ServiceName' does not exist." }

        # IMPROVEMENT: check dependencies before attempting to start so we can
        # give the user an actionable error ("Cannot start Spooler because
        # RPCSS is stopped. Restart RPCSS first.") instead of a cryptic
        # "Cannot start service" exception.
        $blockedBy = @()
        foreach ($dep in $svc.ServicesDependedOn) {
            try {
                $depSvc = Get-Service -Name $dep.Name -ErrorAction Stop
                if ($depSvc.Status -ne 'Running') { $blockedBy += $dep.Name }
            } catch {}
        }
        if ($blockedBy.Count -gt 0 -and $svc.Status -ne 'Running') {
            $result = @{
                success = $false
                message = "Cannot start '$ServiceName' because required dependencies are stopped: $($blockedBy -join ', '). Please start them first."
                blockedBy = $blockedBy
            }
            Write-JsonResult $result (Get-TimerElapsedSec $timer)
            exit 0
        }

        Set-Service -Name $ServiceName -StartupType Automatic -ErrorAction Stop
        if ($svc.Status -ne 'Running') {
            Start-Service -Name $ServiceName -ErrorAction Stop
        }

        $result = @{
            success = $true
            message = "Service '$ServiceName' has been set to Automatic and started."
        }
        Write-JsonResult $result (Get-TimerElapsedSec $timer)
    } catch {
        Write-JsonResult @{ success = $false; message = $_.Exception.Message } (Get-TimerElapsedSec $timer)
    }
}
elseif ($Action -eq 'restart') {
    try {
        if (-not $ServiceName) { throw "ServiceName parameter is required." }
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Service '$ServiceName' does not exist." }

        # IMPROVEMENT: refuse to restart critical system services that would
        # destabilise the session. Previously a curious user could click
        # "Restart" on RpcSs and lose their whole desktop session.
        if ($neverRestart -contains $ServiceName) {
            $result = @{
                success = $false
                message = "Refusing to restart critical system service '$ServiceName' - this would destabilise your session. Reboot Windows instead."
            }
            Write-JsonResult $result (Get-TimerElapsedSec $timer)
            exit 0
        }

        Restart-Service -Name $ServiceName -Force -ErrorAction Stop

        $result = @{
            success = $true
            message = "Service '$ServiceName' was successfully restarted."
        }
        Write-JsonResult $result (Get-TimerElapsedSec $timer)
    } catch {
        Write-JsonResult @{ success = $false; message = $_.Exception.Message } (Get-TimerElapsedSec $timer)
    }
}
elseif ($Action -eq 'set-startup') {
    try {
        if (-not $ServiceName) { throw "ServiceName parameter is required." }
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Service '$ServiceName' does not exist." }

        Set-Service -Name $ServiceName -StartupType $StartupType -ErrorAction Stop

        $result = @{
            success = $true
            message = "Service '$ServiceName' startup type set to $StartupType."
        }
        Write-JsonResult $result (Get-TimerElapsedSec $timer)
    } catch {
        Write-JsonResult @{ success = $false; message = $_.Exception.Message } (Get-TimerElapsedSec $timer)
    }
}
