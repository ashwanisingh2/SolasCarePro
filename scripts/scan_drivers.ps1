# scan_drivers.ps1
$ErrorActionPreference = 'SilentlyContinue'

$drivers = @()

# Query WMI for signed drivers
$signed = Get-WmiObject -Class Win32_PnPSignedDriver
foreach ($d in $signed) {
    if (-not $d.DeviceName) { continue }
    
    # WMI often returns null status for working signed drivers; default to OK
    $statusVal = "OK"
    if ($d.Status -and $d.Status -ne "OK") {
        $statusVal = "Warning"
    }

    $drivers += [PSCustomObject]@{
        DeviceName = $d.DeviceName
        Vendor     = $d.Manufacturer
        Provider   = $d.ProviderName
        Version    = $d.DriverVersion
        Status     = $statusVal
        HardwareId = $d.HardwareID
        PnpDeviceId= $d.DeviceID
        Date       = if ($d.DriverDate) { $d.DriverDate.ToString("yyyy-MM-dd") } else { "Unknown" }
        IsSigned   = $true
    }
}

# Query WMI for PnP entities with error codes (e.g. Error 28 = missing driver)
$errors = Get-WmiObject -Class Win32_PnPEntity -Filter "ConfigManagerErrorCode > 0"
foreach ($e in $errors) {
    $errorCode = $e.ConfigManagerErrorCode
    $statusStr = switch ($errorCode) {
        22      { "Disabled" }
        28      { "Missing" }
        10      { "Corrupted" }
        default { "Error" }
    }
    
    # Update existing status or append as new broken device entry
    $existing = $drivers | Where-Object { $_.PnpDeviceId -eq $e.DeviceID }
    if ($existing) {
        $existing.Status = $statusStr
    } else {
        $hwId = if ($e.HardwareID) { $e.HardwareID[0] } else { "" }
        $drivers += [PSCustomObject]@{
            DeviceName = $e.Name
            Vendor     = $e.Manufacturer
            Provider   = "N/A"
            Version    = "N/A"
            Status     = $statusStr
            HardwareId = $hwId
            PnpDeviceId= $e.DeviceID
            Date       = "Unknown"
            IsSigned   = $false
        }
    }
}

# Remove duplicate entries and group uniquely
$uniqueDrivers = $drivers | Group-Object PnpDeviceId | ForEach-Object { $_.Group[0] }

# Fix: empty array on PS 5.1 emits nothing via ConvertTo-Json. Force array shape.
if (-not $uniqueDrivers -or $uniqueDrivers.Count -eq 0) {
    Write-Output "[]"
} elseif ($uniqueDrivers.Count -eq 1) {
    Write-Output "[$($uniqueDrivers | ConvertTo-Json -Compress)]"
} else {
    Write-Output ($uniqueDrivers | ConvertTo-Json -Compress)
}
