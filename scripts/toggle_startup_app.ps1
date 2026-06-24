param (
    [string]$Name,
    [string]$ApprovedPath,
    [string]$Action # "enable" or "disable"
)
$ErrorActionPreference = 'SilentlyContinue'

if (-not $Name -or -not $ApprovedPath) {
    Write-Output "ERROR: Missing parameters"
    exit 1
}

# Normalize registry path for registry commands (e.g. replace HKCU: with Registry::HKEY_CURRENT_USER etc. if needed,
# but Set-ItemProperty works natively with HKCU: and HKLM: providers!)
$path = $ApprovedPath
if ($path -like "HKCU\*" -and -not ($path -like "HKCU:\*")) {
    $path = $path.Replace("HKCU", "HKCU:")
}
if ($path -like "HKLM\*" -and -not ($path -like "HKLM:\*")) {
    $path = $path.Replace("HKLM", "HKLM:")
}

# Create binary value (12 bytes)
# 02 for enabled, 03 for disabled
$firstByte = if ($Action -eq "enable") { 0x02 } else { 0x03 }
$bytes = [byte[]]@($firstByte, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00)

try {
    # Check if the registry path exists, create if not
    if (-not (Test-Path $path)) {
        New-Item -Path $path -Force | Out-Null
    }
    Set-ItemProperty -Path $path -Name $Name -Value $bytes -Type Binary -Force | Out-Null
    Write-Output "SUCCESS: $Action completed for $Name"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
}
