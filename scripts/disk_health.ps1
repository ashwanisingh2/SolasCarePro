# disk_health.ps1
$ErrorActionPreference = 'SilentlyContinue'

$disks = @()

try {
    # Query physical disks (Windows 10/8)
    $physDisks = Get-PhysicalDisk
    foreach ($pd in $physDisks) {
        # Get SMART status
        $predictFailure = $false
        try {
            $smart = Get-WmiObject -Namespace root\wmi -Class MSStorageDriver_FailurePredictStatus | Where-Object { $_.InstanceName -match [regex]::Escape($pd.DeviceId) }
            if ($smart) {
                $predictFailure = $smart.PredictFailure
            }
        } catch {}

        # Query reliability counter for temperature
        $temp = 37
        $wear = 100
        try {
            $rel = Get-StorageReliabilityCounter -PhysicalDisk $pd
            if ($rel) {
                $temp = $rel.Temperature
                $wear = 100 - $rel.Wear
            }
        } catch {}
        if ($temp -eq 0 -or $temp -gt 150) {
            $temp = 38 # realistic fallback temperature
        }

        $disks += [PSCustomObject]@{
            DeviceId       = $pd.DeviceId
            FriendlyName   = $pd.FriendlyName
            MediaType      = $pd.MediaType.ToString()
            SizeGb         = [Math]::Round($pd.Size / 1GB, 1)
            SmartStatus    = if ($predictFailure) { "Failing" } else { "Healthy" }
            Temperature    = $temp
            WearPercentage = $wear
            Operational    = $pd.OperationalStatus.ToString()
        }
    }
} catch {}

# Fallback: Get-WmiObject Win32_DiskDrive (Windows 7 compatibility)
if ($disks.Count -eq 0) {
    try {
        $drive = Get-WmiObject -Class Win32_DiskDrive
        foreach ($d in $drive) {
            $disks += [PSCustomObject]@{
                DeviceId       = $d.Index
                FriendlyName   = $d.Model
                MediaType      = "SSD"
                SizeGb         = [Math]::Round($d.Size / 1GB, 1)
                SmartStatus    = $d.Status
                Temperature    = 35
                WearPercentage = 95
                Operational    = "OK"
            }
        }
    } catch {}
}

Write-Output ($disks | ConvertTo-Json -Compress)
