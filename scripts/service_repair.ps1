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

$ErrorActionPreference = 'Stop'

$criticalServicesList = @(
    'wuauserv', 'bits', 'WSearch', 'Spooler', 'MpsSvc', 
    'WinDefend', 'Audiosrv', 'AudioEndpointBuilder', 'DHCP', 
    'Dnscache', 'LanmanWorkstation', 'RpcSs', 'Schedule', 'Themes'
)

$requiredServices = @('RpcSs', 'Schedule', 'DHCP', 'Dnscache', 'LanmanWorkstation')

if ($Action -eq 'list') {
    try {
        $services = @()
        foreach ($name in $criticalServicesList) {
            $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
            if ($svc) {
                $startType = $svc.StartType.ToString()
                $services += @{
                    Name = $svc.Name
                    DisplayName = $svc.DisplayName
                    Status = $svc.Status.ToString()
                    StartType = $startType
                    CanStop = $svc.CanStop
                    IsRequired = $requiredServices -contains $svc.Name
                }
            } else {
                $services += @{
                    Name = $name
                    DisplayName = "Service '$name' not found"
                    Status = "Stopped"
                    StartType = "Disabled"
                    CanStop = $false
                    IsRequired = $requiredServices -contains $name
                }
            }
        }
        Write-Output (ConvertTo-Json $services -Compress)
    } catch {
        $result = @{
            error = $_.Exception.Message
        }
        Write-Output (ConvertTo-Json $result -Compress)
    }
}
elseif ($Action -eq 'repair') {
    try {
        if (-not $ServiceName) { throw "ServiceName parameter is required." }
        
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Service '$ServiceName' does not exist." }

        Set-Service -Name $ServiceName -StartupType Automatic
        if ($svc.Status -ne 'Running') {
            Start-Service -Name $ServiceName
        }

        $result = @{
            success = $true
            message = "Service '$ServiceName' has been set to Automatic and started."
        }
        Write-Output (ConvertTo-Json $result -Compress)
    } catch {
        $result = @{
            success = $false
            message = $_.Exception.Message
        }
        Write-Output (ConvertTo-Json $result -Compress)
    }
}
elseif ($Action -eq 'restart') {
    try {
        if (-not $ServiceName) { throw "ServiceName parameter is required." }
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Service '$ServiceName' does not exist." }

        Restart-Service -Name $ServiceName -Force

        $result = @{
            success = $true
            message = "Service '$ServiceName' was successfully restarted."
        }
        Write-Output (ConvertTo-Json $result -Compress)
    } catch {
        $result = @{
            success = $false
            message = $_.Exception.Message
        }
        Write-Output (ConvertTo-Json $result -Compress)
    }
}
elseif ($Action -eq 'set-startup') {
    try {
        if (-not $ServiceName) { throw "ServiceName parameter is required." }
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if (-not $svc) { throw "Service '$ServiceName' does not exist." }

        Set-Service -Name $ServiceName -StartupType $StartupType

        $result = @{
            success = $true
            message = "Service '$ServiceName' startup type set to $StartupType."
        }
        Write-Output (ConvertTo-Json $result -Compress)
    } catch {
        $result = @{
            success = $false
            message = $_.Exception.Message
        }
        Write-Output (ConvertTo-Json $result -Compress)
    }
}
