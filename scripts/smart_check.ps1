# smart_check.ps1
# Runs a SMART (Self-Monitoring, Analysis and Reporting Technology) check on a physical disk.
# Uses Get-PhysicalDisk + Get-StorageReliabilityCounter (Windows 8+).
param(
    [string]$DriveLetter  # e.g. 'C' - we resolve to the underlying physical disk
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $DriveLetter -or $DriveLetter -notmatch '^[A-Za-z]$') {
    Write-JsonError 'DriveLetter must be a single letter (e.g. C)' 'smart_check'
    exit 1
}

$letter = $DriveLetter.ToUpper()
Write-Output "[SMART] Checking drive $letter`:"
Write-AuditLog -Action 'smart-check' -Result 'started' -Target "$letter`:"

try {
    # Resolve drive letter -> partition -> disk -> physical disk
    $partition = Get-Partition -DriveLetter $letter -ErrorAction Stop
    $disk = $partition | Get-Disk -ErrorAction Stop
    $physicalDisk = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq $disk.Number } -ErrorAction SilentlyContinue | Select-Object -First 1

    if (-not $physicalDisk) {
        Write-JsonError "Could not resolve physical disk for drive $letter" 'smart_check'
        exit 1
    }

    $reliability = $physicalDisk | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue

    # Determine health status
    $healthStatus = $physicalDisk.HealthStatus
    $operationalStatus = $physicalDisk.OperationalStatus
    $isHealthy = ($healthStatus -eq 'Healthy')

    # Collect SMART-relevant attributes
    $smart = [PSCustomObject]@{
        success              = $true
        driveLetter          = $letter
        friendlyName         = $physicalDisk.FriendlyName
        mediaType            = $physicalDisk.MediaType
        busType              = $physicalDisk.BusType
        healthStatus         = "$healthStatus"
        operationalStatus    = "$operationalStatus"
        sizeBytes            = $physicalDisk.Size
        spindleSpeed         = $reliability.SpinUpTime
        temperatureC         = $reliability.Temperature
        readErrorsTotal      = $reliability.ReadErrorsTotal
        writeErrorsTotal     = $reliability.WriteErrorsTotal
        wear                 = $reliability.Wear
        powerOnHours         = $reliability.PowerOnHours
        startStopCycleCount  = $reliability.StartStopCycleCount
        isHealthy            = $isHealthy
        checkedAt            = (Get-Date).ToString('o')
    }

    Write-Output "[SMART] Drive $letter`: Health=$healthStatus, Temp=$($reliability.Temperature)C, Wear=$($reliability.Wear)%"
    Write-AuditLog -Action 'smart-check' -Result 'success' -Target "$letter`:" -Details "Health=$healthStatus, Temp=$($reliability.Temperature)C"
    Write-Output ($smart | ConvertTo-Json -Depth 3 -Compress)
} catch {
    Write-AuditLog -Action 'smart-check' -Result 'failure' -Target "$letter`:" -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message 'smart_check'
}
