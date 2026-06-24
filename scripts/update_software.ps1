# update_software.ps1
param (
    [Parameter(Mandatory=$true)]
    [string]$Id
)

$ErrorActionPreference = "Continue"

Write-Output "Starting update process for package: $Id"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Output "[ERROR] Winget is not installed on this system."
    exit 1
}

# Run winget upgrade silently with progress redirected to console
# If network resolution error (-2147012851) occurs, execute automated DNS/Source self-healing bypass
$process = Start-Process winget -ArgumentList "upgrade --id $Id --silent --accept-package-agreements --accept-source-agreements" -NoNewWindow -PassThru -ErrorAction SilentlyContinue
$process.WaitForExit()
$exitCode = $process.ExitCode

if ($exitCode -eq -2147012851) {
    Write-Output "[SYSTEM] Network Name Resolution Error detected. Initializing self-repair protocol..."
    
    # 1. Reset and update winget sources
    Write-Output "[SYSTEM] Resetting Winget sources..."
    winget source reset --force | Out-Null
    winget source update | Out-Null
    
    # 2. Atomic DNS Backup
    $backupPath = "$env:TEMP\solas_dns_backup.json"
    if (-not (Test-Path $backupPath)) {
        Write-Output "[SYSTEM] Creating atomic DNS backup in %TEMP%..."
        $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled }
        $backupData = @()
        foreach ($adapter in $adapters) {
            $backupData += @{
                Index = $adapter.Index
                Description = $adapter.Description
                DNSServerSearchOrder = $adapter.DNSServerSearchOrder
                DHCPEnabled = $adapter.DHCPEnabled
            }
        }
        $backupData | ConvertTo-Json | Out-File -FilePath $backupPath -Encoding UTF8 -Force
    }

    # 3. Verify Google DNS Connectivity before switching
    Write-Output "[SYSTEM] Verifying Google DNS connectivity via Port 53..."
    $connectionTest = Test-NetConnection 8.8.8.8 -Port 53 -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    
    if ($connectionTest.TcpTestSucceeded -eq $true) {
        Write-Output "[SYSTEM] Google DNS is reachable. Temporarily setting Google DNS..."
        # Set DNS using WMI (netsh fails on some systems)
        $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled }
        foreach ($adapter in $adapters) {
            $adapter.SetDNSServerSearchOrder(@("8.8.8.8", "8.8.4.4")) | Out-Null
        }
        
        Write-Output "[SYSTEM] Flushing client DNS resolver cache..."
        ipconfig /flushdns | Out-Null
        Clear-DnsClientCache
    } else {
        Write-Output "[WARNING] Google DNS is unreachable. Skipping DNS modification."
    }
    
    # 4. Retry Winget Upgrade with a 5-minute timeout watchdog
    Write-Output "[SYSTEM] Retrying winget upgrade with 5-minute watchdog..."
    $retryProcess = Start-Process winget -ArgumentList "upgrade --id $Id --silent --accept-package-agreements --accept-source-agreements" -NoNewWindow -PassThru -ErrorAction SilentlyContinue
    
    $timeoutSeconds = 300 # 5 minutes
    $elapsed = 0
    while (-not $retryProcess.HasExited -and $elapsed -lt $timeoutSeconds) {
        Start-Sleep -Seconds 1
        $elapsed++
    }
    
    if (-not $retryProcess.HasExited) {
        Write-Output "[SYSTEM] Winget execution timed out. Killing task process..."
        $retryProcess | Stop-Process -Force -ErrorAction SilentlyContinue
        $exitCode = -1
    } else {
        $exitCode = $retryProcess.ExitCode
    }

    # 5. ALWAYS Restore original DNS settings from backup
    Write-Output "[SYSTEM] Restoring original network DNS adapter settings..."
    if (Test-Path $backupPath) {
        try {
            $dnsRestore = Get-Content -Path $backupPath -Raw | ConvertFrom-Json
            $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled }
            foreach ($adapter in $adapters) {
                # Find matching adapter from backup
                $matched = $null
                foreach ($item in $dnsRestore) {
                    if ($item.Index -eq $adapter.Index -or $item.Description -eq $adapter.Description) {
                        $matched = $item
                        break
                    }
                }
                if ($null -ne $matched) {
                    if ($matched.DHCPEnabled -or $null -eq $matched.DNSServerSearchOrder) {
                        $adapter.SetDNSServerSearchOrder($null) | Out-Null
                    } else {
                        $adapter.SetDNSServerSearchOrder($matched.DNSServerSearchOrder) | Out-Null
                    }
                } else {
                    $adapter.SetDNSServerSearchOrder($null) | Out-Null
                }
            }
        } catch {
            # Fallback to DHCP auto-DNS
            $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled }
            foreach ($adapter in $adapters) {
                $adapter.SetDNSServerSearchOrder($null) | Out-Null
            }
        }
        Remove-Item $backupPath -Force -ErrorAction SilentlyContinue
    } else {
        # Fallback to DHCP auto-DNS if backup missing
        Write-Output "[WARNING] Backup file missing. Resetting DNS to DHCP auto-DNS..."
        $adapters = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled }
        foreach ($adapter in $adapters) {
            $adapter.SetDNSServerSearchOrder($null) | Out-Null
        }
    }
    
    ipconfig /flushdns | Out-Null
    Clear-DnsClientCache
    Write-Output "[SYSTEM] DNS restore complete."
}

if ($exitCode -eq 0) {
    Write-Output "Successfully updated package: $Id"
} else {
    $explanation = switch ($exitCode) {
        -2147012851 { "Network Name Resolution Failed. Your DNS cannot resolve the Winget repository server. Please check your internet connection or run the DNS Flush in One-Click Care." }
        -1978335181 { "Package is pinned or locked. If the app is currently open, close it and try again." }
        -2147024891 { "Access Denied. Solas must be elevated as Administrator." }
        -2147023293 { "Installer failed (0x80070643). The application installer crashed or had a compatibility issue." }
        default { "Unknown installation error." }
    }
    Write-Output "[ERROR] Winget upgrade exited with error code: $exitCode ($explanation)"
}

exit $exitCode
