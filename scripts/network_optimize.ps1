# network_optimize.ps1
param (
    [string]$Action = "check",
    [string]$SSID = ""
)

$ErrorActionPreference = 'SilentlyContinue'

if ($Action -eq "check") {
    # Check network I/O for active downloads (measure traffic over 1 second)
    $stat1 = Get-NetAdapterStatistics | Measure-Object -Property ReceivedBytes -Sum
    Start-Sleep -Seconds 1
    $stat2 = Get-NetAdapterStatistics | Measure-Object -Property ReceivedBytes -Sum
    $bytesSec = 0
    if ($stat1 -and $stat2) {
        $bytesSec = $stat2.Sum - $stat1.Sum
    }
    
    # Check if connected via WiFi and get current SSID
    $wifiInterface = netsh wlan show interfaces
    $ssidName = ""
    $isWifi = $false
    foreach ($line in ($wifiInterface -split "`n")) {
        if ($line -match "^\s+SSID\s+:\s+(.+)$") {
            $ssidName = $Matches[1].Trim()
            $isWifi = $true
            break
        }
    }
    
    @{
        BytesPerSec = $bytesSec
        ActiveDownload = $bytesSec -gt 204800 # 200 KB/s threshold for warning
        IsWifi = $isWifi
        SSID = $ssidName
    } | ConvertTo-Json -Compress
    exit 0
}

if ($Action -eq "reset") {
    Write-Output "[SYSTEM] Resetting... Starting Winsock catalog reset."
    netsh winsock reset | Out-Null
    Write-Output "[SYSTEM] Resetting... Flushing internet protocol tables."
    netsh int ip reset | Out-Null
    
    Write-Output "[SYSTEM] Reconnecting... Power cycling network adapters."
    $osVersion = [System.Environment]::OSVersion.Version
    if ($osVersion.Major -ge 10) {
        # Check adapters and reset physical ethernet
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' }
        foreach ($a in $adapters) {
            Disable-NetAdapter -Name $a.Name -Confirm:$false
            Start-Sleep -Seconds 1
            Enable-NetAdapter -Name $a.Name -Confirm:$false
        }
    }
    
    if ($SSID) {
        Write-Output "[SYSTEM] Reconnecting... Authenticating with SSID: $SSID."
        netsh wlan connect name="$SSID" | Out-Null
    }
    
    # Wait up to 10 seconds to verify network ping
    $connected = $false
    Write-Output "[SYSTEM] Reconnecting... Verifying routing tables."
    for ($i = 0; $i -lt 10; $i++) {
        Start-Sleep -Seconds 1
        $ping = Test-Connection -ComputerName 8.8.8.8 -Count 1 -ErrorAction SilentlyContinue
        if ($ping) {
            $connected = $true
            break
        }
    }
    
    if ($connected) {
        Write-Output "[SYSTEM] Connected! Network socket stack successfully repaired."
    } else {
        Write-Output "[WARNING] Reconnected with local status. Full internet access may require system restart."
    }
}
