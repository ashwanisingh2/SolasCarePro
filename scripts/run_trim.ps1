# run_trim.ps1
param (
    [string]$Drive = "C"
)

$ErrorActionPreference = 'Stop'

try {
    # 1. Verify and enable TRIM support if disabled
    Write-Output "[SYSTEM] Checking Windows TRIM status..."
    $notify = fsutil behavior query DisableDeleteNotify
    if ($notify -match "= 1") {
        Write-Output "[SYSTEM] TRIM is disabled. Attempting to enable TRIM support..."
        fsutil behavior set DisableDeleteNotify 0 | Out-Null
        Write-Output "[SYSTEM] TRIM support successfully enabled in Windows system behavior settings."
    } else {
        Write-Output "[SYSTEM] TRIM support is already enabled."
    }

    # 2. Run ReTrim optimization based on OS Version
    Write-Output "[SYSTEM] Initializing TRIM optimization command on Volume ${Drive}:..."
    $osVersion = [System.Environment]::OSVersion.Version
    if ($osVersion.Major -lt 10) {
        # Windows 7 / 8 SP1: defrag /L command triggers TRIM
        Write-Output "[SYSTEM] Operating system detected: Windows 7/8. Using legacy defrag TRIM command..."
        defrag.exe "$($Drive):" /L /V
    } else {
        # Windows 10/11: Optimize-Volume
        Optimize-Volume -DriveLetter $Drive -ReTrim -Verbose
    }

    Write-Output "[SYSTEM] Volume TRIM optimization completed successfully!"
} catch {
    Write-Output "[ERROR] TRIM command failed. Detailed explanation: $_"
    exit 1
}
