# network_adapters.ps1
# Enumerates all network adapters with status, MAC, IP, and type info.
# Returns JSON array of adapter objects.
$ErrorActionPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot '_common.ps1')

Write-AuditLog -Action 'network-adapters' -Result 'started'

try {
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Visible -ne $false })

    $result = @()
    foreach ($a in $adapters) {
        $ipConfig = $a | Get-NetIPConfiguration -ErrorAction SilentlyContinue
        $ipAddress = 'Not connected'
        if ($ipConfig -and $ipConfig.IPv4Address) {
            $ipAddress = "$($ipConfig.IPv4Address.IPAddress)"
        } elseif ($ipConfig -and $ipConfig.IPv6Address) {
            $ipAddress = "$($ipConfig.IPv6Address.IPAddress)"
        }

        $mac = ($a.MacAddress -replace '-',':')
        if (-not $mac) { $mac = '00:00:00:00:00:00' }

        # Determine adapter type from interface description
        $type = 'Ethernet'
        if ($a.InterfaceDescription -match 'Wireless|Wi-Fi|802\.11') { $type = 'Wireless' }
        elseif ($a.InterfaceDescription -match 'Bluetooth') { $type = 'Bluetooth' }
        elseif ($a.InterfaceDescription -match 'Virtual|Hyper-V|VMware|VirtualBox') { $type = 'Virtual' }
        elseif ($a.MediaType -eq '802.11') { $type = 'Wireless' }

        $result += [PSCustomObject]@{
            name        = $a.Name
            description = $a.InterfaceDescription
            macAddress  = $mac
            ipAddress   = $ipAddress
            status      = "$($a.Status)"
            type        = $type
            linkSpeed   = "$($a.LinkSpeed)"
            ifIndex     = $a.ifIndex
        }
    }

    Write-AuditLog -Action 'network-adapters' -Result 'success' -Details "Found $($result.Count) adapters"

    if ($result.Count -eq 0) {
        Write-Output '[]'
    } elseif ($result.Count -eq 1) {
        Write-Output "[$($result | ConvertTo-Json -Compress -Depth 3)]"
    } else {
        Write-Output ($result | ConvertTo-Json -Compress -Depth 3)
    }
} catch {
    Write-AuditLog -Action 'network-adapters' -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message 'network_adapters'
}
