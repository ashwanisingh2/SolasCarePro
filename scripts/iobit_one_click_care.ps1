# iobit_one_click_care.ps1
# ===================================================================
# SYNC NOTICE: This script's step list mirrors the 'pc-slow' recipe
# defined in electron/commandExecutor.js (smart-repair-recipe handler).
# Both run the same 7 steps in the same order:
#   1. Create Restore Point
#   2. Clean Temporary Files
#   3. Flush DNS Cache
#   4. Reset Winsock
#   5. Reset TCP/IP
#   6. SSD TRIM Optimization
#   7. System File Checker (SFC)
# If you add/remove/reorder a step here, mirror the change in the JS
# recipe, and vice versa. The PS version exists only because Windows
# Task Scheduler (schedule_care.ps1) cannot invoke JS handlers.
# ===================================================================
$ErrorActionPreference = 'Continue'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

Write-Output "=== SOLAS SYSTEM CARE PRO ONE-CLICK MAINTENANCE ==="
Write-AuditLog -Action 'one-click-care' -Result 'started'

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

# 1. Restore Point  (mirrors: create-restore-point)
Run-Step "Create System Restore Point" {
    $registryPath = "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\SystemRestore"
    if (Test-Path $registryPath) {
        Set-ItemProperty -Path $registryPath -Name "SystemRestorePointCreationFrequency" -Value 0 -ErrorAction SilentlyContinue
    }
    Enable-ComputerRestore -Drive "C:\" -ErrorAction SilentlyContinue
    Checkpoint-Computer -Description "SolasCarePro Automated Restore Point" -RestorePointType "APPLICATION_INSTALL" -Confirm:$false
}

# 2. Clean Temporary Files  (mirrors: repair-temp-cleanup)
Run-Step "Clean Temporary Files" {
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
    Write-Output "Cleared temporary files. Freed: $mbCleaned MB"
}

# 3. Flush DNS Cache  (mirrors: flush-dns)
Run-Step "Flush DNS Cache" {
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    ipconfig /flushdns | Out-Null
    Write-Output "DNS client cache cleared."
}

# 4. Reset Winsock  (mirrors: repair-winsock)
Run-Step "Reset Winsock" {
    netsh winsock reset | Out-Null
    Write-Output "Winsock catalog reset."
}

# 5. Reset TCP/IP  (mirrors: repair-tcpip)
Run-Step "Reset TCP/IP" {
    netsh int ip reset | Out-Null
    Write-Output "TCP/IP stack reset."
}

# 6. SSD TRIM Optimization  (mirrors: run-trim)
Run-Step "SSD TRIM Optimization" {
    $driveLetter = $env:SystemDrive.TrimEnd('\').TrimEnd(':')
    if (-not $driveLetter) { $driveLetter = 'C' }
    $drive = Get-PhysicalDisk | Where-Object { $_.MediaType -eq 'SSD' } | Select-Object -First 1
    if ($drive) {
        Optimize-Volume -DriveLetter $driveLetter -ReTrim -Verbose -ErrorAction SilentlyContinue
        Write-Output "TRIM optimization issued on drive $driveLetter`."
    } else {
        Write-Output "No SSD detected - skipping TRIM."
    }
}

# 7. System File Checker (SFC)  (mirrors: repair-system-sfc)
Run-Step "System File Checker (SFC)" {
    sfc /scannow
}

Write-Output ""
Write-Output "=== System Care Routine Execution Completed ==="
Write-AuditLog -Action 'one-click-care' -Result 'success'
