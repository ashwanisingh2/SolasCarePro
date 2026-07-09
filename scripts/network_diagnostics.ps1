# network_diagnostics.ps1
# SolasCare Pro - Network Diagnostics (Missing Sub-Feature from Brain.md)
#
# Speed test (download/upload via Cloudflare speed endpoints),
# DNS response time check, active connections list with per-process usage.
#
# Actions:
#   speed-test       - Download + upload speed test (via Cloudflare)
#   dns-check        - DNS response time for current + popular DNS servers
#   active-connections - List TCP connections with process names

param(
    [Parameter(Mandatory=$true)][string]$Action
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# --- Actions ---

function Invoke-SpeedTest {
    # Download speed: fetch a known large file from Cloudflare's speed test endpoint
    # Upload speed: POST random data to Cloudflare's upload endpoint
    # These are the same endpoints used by speed.cloudflare.com
    Write-Output "[NETDIAG] Running download speed test..."

    $downloadUrl = 'https://speed.cloudflare.com/__down?bytes=25000000'  # 25MB
    $downloadSpeedMbps = 0
    $downloadDurationMs = 0

    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri $downloadUrl -UseBasicParsing -ErrorAction Stop
        $sw.Stop()
        $downloadDurationMs = $sw.ElapsedMilliseconds
        $bytesDownloaded = $response.RawContentLength
        if ($downloadDurationMs -gt 0) {
            $downloadSpeedMbps = [math]::Round(($bytesDownloaded * 8) / $downloadDurationMs / 1000, 2)
        }
        Write-Output "[NETDIAG] Download: $downloadSpeedMbps Mbps (${downloadDurationMs}ms for $([math]::Round($bytesDownloaded/1MB, 1))MB)"
    } catch {
        Write-Output "[NETDIAG] Download test failed: $($_.Exception.Message)"
        $downloadSpeedMbps = 0
    }

    Write-Output "[NETDIAG] Running upload speed test..."
    $uploadSpeedMbps = 0
    $uploadDurationMs = 0

    try {
        $uploadUrl = 'https://speed.cloudflare.com/__up'
        # Generate 5MB of random data
        $uploadData = New-Object byte[] 5000000
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($uploadData)
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri $uploadUrl -Method Post -Body $uploadData -UseBasicParsing -ErrorAction Stop
        $sw.Stop()
        $uploadDurationMs = $sw.ElapsedMilliseconds
        if ($uploadDurationMs -gt 0) {
            $uploadSpeedMbps = [math]::Round(($uploadData.Length * 8) / $uploadDurationMs / 1000, 2)
        }
        Write-Output "[NETDIAG] Upload: $uploadSpeedMbps Mbps (${uploadDurationMs}ms)"
    } catch {
        Write-Output "[NETDIAG] Upload test failed: $($_.Exception.Message)"
        $uploadSpeedMbps = 0
    }

    # Latency check (ping Cloudflare)
    $latencyMs = 0
    try {
        $ping = Test-Connection -ComputerName '1.1.1.1' -Count 3 -ErrorAction SilentlyContinue
        if ($ping) {
            $latencyMs = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average, 1)
        }
    } catch {}

    $result = @{
        downloadMbps = $downloadSpeedMbps
        uploadMbps = $uploadSpeedMbps
        latencyMs = $latencyMs
        downloadDurationMs = $downloadDurationMs
        uploadDurationMs = $uploadDurationMs
        server = 'Cloudflare (speed.cloudflare.com)'
    }

    Write-AuditLog -Action 'netdiag-speed-test' -Result 'success' -Details "Down=${downloadSpeedMbps}Mbps, Up=${uploadSpeedMbps}Mbps, Latency=${latencyMs}ms"

    Write-TimedJsonResult @{
        success = $true
        result = $result
        message = "Speed: ↓${downloadSpeedMbps} Mbps / ↑${uploadSpeedMbps} Mbps · Latency: ${latencyMs}ms"
    } $timer
}

function Invoke-DnsCheck {
    # Check DNS response time for current DNS + popular alternatives
    Write-Output "[NETDIAG] Checking DNS response times..."

    $dnsServers = @(
        @{ name = 'Current DNS'; ip = $null },  # uses system default
        @{ name = 'Cloudflare'; ip = '1.1.1.1' },
        @{ name = 'Google'; ip = '8.8.8.8' },
        @{ name = 'Quad9'; ip = '9.9.9.9' },
        @{ name = 'OpenDNS'; ip = '208.67.222.222' }
    )

    # Get current DNS
    try {
        $adapters = Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled = TRUE" -ErrorAction SilentlyContinue
        $currentDns = $adapters | Where-Object { $_.DNSServerSearchOrder } | Select-Object -First 1
        if ($currentDns) {
            $dnsServers[0].ip = $currentDns.DNSServerSearchOrder[0]
            $dnsServers[0].name = "Current ($($currentDns.DNSServerSearchOrder[0]))"
        }
    } catch {}

    $results = @()
    $testDomain = 'example.com'

    foreach ($dns in $dnsServers) {
        $responseMs = $null
        try {
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            if ($dns.ip) {
                # Use Resolve-DnsName with specific server
                $null = Resolve-DnsName -Name $testDomain -Server $dns.ip -ErrorAction Stop -Type A
            } else {
                $null = Resolve-DnsName -Name $testDomain -ErrorAction Stop -Type A
            }
            $sw.Stop()
            $responseMs = [math]::Round($sw.ElapsedMilliseconds, 1)
        } catch {
            $responseMs = $null
        }
        $results += [PSCustomObject]@{
            name = $dns.name
            ip = $dns.ip
            responseMs = $responseMs
            status = if ($responseMs) { 'ok' } else { 'failed' }
        }
        Write-Output "[NETDIAG] $($dns.name): $(if ($responseMs) { "${responseMs}ms" } else { 'failed' })"
    }

    # Find fastest
    $fastest = $results | Where-Object { $_.responseMs } | Sort-Object responseMs | Select-Object -First 1

    Write-TimedJsonResult @{
        success = $true
        results = $results
        fastest = $fastest
        recommendation = if ($fastest -and $fastest.name -notmatch 'Current') {
            "Switch to $($fastest.name) ($($fastest.ip)) for $($fastest.responseMs)ms response (faster than current)."
        } else {
            'Your current DNS is already the fastest option.'
        }
    } $timer
}

function Invoke-ActiveConnections {
    # List active TCP connections with process names
    Write-Output "[NETDIAG] Listing active connections..."

    $connections = @()
    try {
        $tcpConns = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue
        foreach ($conn in $tcpConns) {
            $procName = ''
            try {
                $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                if ($proc) { $procName = $proc.Name }
            } catch {}

            $connections += [PSCustomObject]@{
                localAddress = $conn.LocalAddress
                localPort = $conn.LocalPort
                remoteAddress = $conn.RemoteAddress
                remotePort = $conn.RemotePort
                processName = $procName
                processId = $conn.OwningProcess
                state = $conn.State
            }
        }
    } catch {}

    # Sort by process name for readability
    $connections = $connections | Sort-Object processName

    Write-TimedJsonResult @{
        success = $true
        connections = $connections
        count = $connections.Count
        message = "$($connections.Count) active TCP connections."
    } $timer
}

# --- Dispatch ---
try {
    switch ($Action) {
        'speed-test'           { Invoke-SpeedTest }
        'dns-check'            { Invoke-DnsCheck }
        'active-connections'   { Invoke-ActiveConnections }
        default {
            Write-JsonError "Invalid action: $Action" 'network_diagnostics'
        }
    }
} catch {
    Write-AuditLog -Action "netdiag-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "network_diagnostics.$Action"
}
