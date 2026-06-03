# create_restore_point.ps1
$ErrorActionPreference = 'SilentlyContinue'

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$description = "SolasCare_$timestamp"

Write-Output "[SYSTEM] Initializing Windows System Restore point..."
try {
    # Create restore point using WMI SystemRestore class
    $sysRestore = [wmiclass]"\\.\root\default:SystemRestore"
    $result = $sysRestore.CreateRestorePoint($description, 0, 100)
    
    # Allow index compilation
    Start-Sleep -Seconds 2
    
    # Query back to verify creation
    $verify = Get-ComputerRestorePoint | Where-Object { $_.Description -eq $description } | Select-Object -First 1
    if ($verify) {
        @{
            Success = $true
            SequenceNumber = $verify.SequenceNumber
            Description = $verify.Description
            CreationTime = $verify.CreationTime
        } | ConvertTo-Json -Compress
    } else {
        # Check ReturnValue (e.g. 0x00000000 is success, others are error)
        $errCode = if ($result) { $result.ReturnValue } else { "Unknown" }
        @{
            Success = $false
            Error = "Restore point was not verified. System Restore might be disabled on C: drive. WMI ReturnValue: $errCode"
        } | ConvertTo-Json -Compress
    }
} catch {
    @{
        Success = $false
        Error = "WMI privilege exception or system restore block: $_"
    } | ConvertTo-Json -Compress
}
