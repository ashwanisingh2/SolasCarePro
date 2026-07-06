# iobit_one_click_care.ps1
$ErrorActionPreference = 'Continue'

Write-Output "=== SOLAS SYSTEM CARE PRO ONE-CLICK MAINTENANCE ==="

function Run-Step {
    param([string]$Name, [scriptblock]$Action)
    Write-Output ""
    Write-Output "[STEP_START] $Name"
    try {
        & $Action
        Write-Output "[STEP_SUCCESS] $Name completed."
    } catch {
        Write-Output "[STEP_ERROR] $Name failed: $_"
    }
}

# 1. Restore Point
Run-Step "Create System Restore Point" {
    $registryPath = "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\SystemRestore"
    if (Test-Path $registryPath) {
        Set-ItemProperty -Path $registryPath -Name "SystemRestorePointCreationFrequency" -Value 0 -ErrorAction SilentlyContinue
    }
    # Fix: Enable-ComputerRestorePoint is NOT a real cmdlet. The correct name
    # is Enable-ComputerRestore (note: no "Point" suffix). Without this fix,
    # system restore was never actually enabled before the checkpoint call,
    # so Checkpoint-Computer would silently fail when System Protection was off.
    Enable-ComputerRestore -Drive "C:\" -ErrorAction SilentlyContinue
    Checkpoint-Computer -Description "SolasCarePro Automated Restore Point" -RestorePointType "APPLICATION_INSTALL" -Confirm:$false
}

# 2. Junk Cleanup
Run-Step "System Junk Cleanup" {
    $tempFolders = @($env:TEMP, "$env:SystemRoot\Temp")
    $totalCleaned = 0
    foreach ($folder in $tempFolders) {
        if (Test-Path $folder) {
            $files = Get-ChildItem -Path $folder -Recurse -File -ErrorAction SilentlyContinue
            foreach ($f in $files) {
                $size = $f.Length
                try {
                    Remove-Item -Path $f.FullName -Force -Confirm:$false -ErrorAction Stop
                    $totalCleaned += $size
                } catch {}
            }
        }
    }
    $mbCleaned = [Math]::Round($totalCleaned / 1024 / 1024, 2)
    Write-Output "Cleared temporary junk files. Freed: $mbCleaned MB"
}

# 3. Network Optimize
Run-Step "Network Optimization" {
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    netsh winsock reset | Out-Null
    netsh int ip reset | Out-Null
    netsh int tcp set global autotuninglevel=normal -ErrorAction SilentlyContinue
    Write-Output "Network socket stack refreshed & DNS flushed."
}

# 4. SFC Scan
Run-Step "System File Checker" {
    sfc /scannow
}

# 5. SSD TRIM
Run-Step "Disk Speed Optimization" {
    Optimize-Volume -DriveLetter C -ReTrim -Verbose -ErrorAction SilentlyContinue
}

# 6. Security Audit
Run-Step "Security Shield Audit" {
    $defender = Get-Service -Name "WinDefend" -ErrorAction SilentlyContinue
    if ($defender) {
        Write-Output "Windows Defender Protection Status: $($defender.Status)"
    }
    $firewall = netsh advfirewall show allprofiles state
    Write-Output "Active Firewall State:"
    Write-Output ($firewall | Select-String "State")
}

Write-Output ""
Write-Output "=== System Care Routine Execution Completed ==="
