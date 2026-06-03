# enable_restore.ps1
$ErrorActionPreference = 'Stop'

try {
    Write-Output "[SYSTEM] Enabling System Protection on Drive C:..."
    Enable-ComputerRestore -Drive "C:\"
    Write-Output "[SYSTEM] System Protection successfully enabled on C:! Resizing shadow storage limit..."
    vssadmin.exe Resize ShadowStorage /For=C: /On=C: /MaxSize=10% | Out-Null
    Write-Output "[SYSTEM] Shadow storage allocation completed."
} catch {
    Write-Output "[ERROR] Failed to enable System Protection: $_"
    exit 1
}
