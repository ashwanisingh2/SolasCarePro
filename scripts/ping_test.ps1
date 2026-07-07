# ping_test.ps1
# Runs a ping test against a hostname/IP and returns parsed stats.
param(
    [string]$Hostname = '8.8.8.8',
    [int]$Count = 4
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $Hostname -or $Hostname.Length -gt 255 -or $Hostname -match '[<>|"`]') {
    Write-JsonError 'Invalid hostname' 'ping_test'
    exit 1
}
if ($Count -lt 1 -or $Count -gt 20) { $Count = 4 }

Write-Output "[PING] Testing $Hostname ($Count pings)..."
Write-AuditLog -Action 'ping-test' -Result 'started' -Target $Hostname

try {
    $replies = @(Test-Connection -ComputerName $Hostname -Count $Count -ErrorAction SilentlyContinue)
    $successCount = ($replies | Where-Object { $_.StatusCode -eq 0 }).Count
    $failedCount = $Count - $successCount
    $packetLossPct = if ($Count -gt 0) { [math]::Round(($failedCount / $Count) * 100, 1) } else { 0 }

    $latencies = $replies | Where-Object { $_.StatusCode -eq 0 } | ForEach-Object { $_.ResponseTime }
    $avgMs = if ($latencies.Count -gt 0) { [math]::Round(($latencies | Measure-Object -Average).Average, 1) } else { 0 }
    $minMs = if ($latencies.Count -gt 0) { ($latencies | Measure-Object -Minimum).Minimum } else { 0 }
    $maxMs = if ($latencies.Count -gt 0) { ($latencies | Measure-Object -Maximum).Maximum } else { 0 }

    $output = ($replies | ForEach-Object {
        $status = if ($_.StatusCode -eq 0) { 'Reply' } else { 'Timeout' }
        "$status from $Hostname`: time=$($_.ResponseTime)ms TTL=$($_.TimeToLive)"
    }) -join "`n"

    $result = [PSCustomObject]@{
        success      = ($successCount -gt 0)
        hostname     = $Hostname
        count        = $Count
        successCount = $successCount
        failedCount  = $failedCount
        packetLossPct= $packetLossPct
        avgMs        = $avgMs
        minMs        = $minMs
        maxMs        = $maxMs
        output       = $output
        testedAt     = (Get-Date).ToString('o')
    }
    Write-AuditLog -Action 'ping-test' -Result 'success' -Target $Hostname -Details "Avg=${avgMs}ms, Loss=${packetLossPct}%"
    Write-Output ($result | ConvertTo-Json -Depth 3 -Compress)
} catch {
    Write-AuditLog -Action 'ping-test' -Result 'failure' -Target $Hostname -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message 'ping_test'
}
