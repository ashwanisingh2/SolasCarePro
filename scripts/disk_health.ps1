# disk_health.ps1
$ErrorActionPreference = 'Stop'

$disks = @()

try {
    # Query physical disks (Windows 10/8). Use -ErrorAction Stop so the catch fires.
    $physDisks = Get-PhysicalDisk -ErrorAction Stop
    foreach ($pd in $physDisks) {
        # Get SMART status
        $predictFailure = $false
        try {
            $smart = Get-WmiObject -Namespace root\wmi -Class MSStorageDriver_FailurePredictStatus -ErrorAction Stop | Where-Object { $_.InstanceName -match [regex]::Escape($pd.DeviceId) }
            if ($smart) {
                $predictFailure = $smart.PredictFailure
            }
        } catch {}

        # Query reliability counter for temperature. Fix: do not fabricate a
        # 37-38C reading when the counter is unavailable - emit null and let
        # the UI render "N/A".
        $temp = $null
        $wear = $null
        try {
            $rel = Get-StorageReliabilityCounter -PhysicalDisk $pd -ErrorAction Stop
            if ($rel) {
                $temp = $rel.Temperature
                if ($rel.Wear -ne $null) { $wear = 100 - $rel.Wear }
            }
        } catch {}
        # Treat 0 or implausible (>150) temperatures as "no data".
        if ($temp -eq $null -or $temp -eq 0 -or $temp -gt 150) {
            $temp = $null
        }

        $mediaTypeStr = "Unknown"
        if ($pd.MediaType) {
            $mediaTypeStr = $pd.MediaType.ToString()
        }

        $opStatusStr = "OK"
        if ($pd.OperationalStatus) {
            $opStatusStr = ($pd.OperationalStatus | ForEach-Object { $_.ToString() }) -join ", "
        }

        $disks += [PSCustomObject]@{
            DeviceId       = $pd.DeviceId
            FriendlyName   = $pd.FriendlyName
            MediaType      = $mediaTypeStr
            SizeGb         = [Math]::Round($pd.Size / 1GB, 1)
            SmartStatus    = if ($predictFailure) { "Failing" } else { "Healthy" }
            Temperature    = $temp
            WearPercentage = $wear
            Operational    = $opStatusStr
        }
    }
} catch {}

# Fallback: Get-WmiObject Win32_DiskDrive (Windows 7 compatibility)
if ($disks.Count -eq 0) {
    try {
        $drive = Get-WmiObject -Class Win32_DiskDrive -ErrorAction Stop
        foreach ($d in $drive) {
            # Fix: do not fabricate MediaType="SSD", Temperature=35, Wear=95
            # for ALL disks on legacy systems - surface nulls instead.
            $disks += [PSCustomObject]@{
                DeviceId       = $d.Index
                FriendlyName   = $d.Model
                MediaType      = $d.MediaType
                SizeGb         = [Math]::Round($d.Size / 1GB, 1)
                SmartStatus    = $d.Status
                Temperature    = $null
                WearPercentage = $null
                Operational    = "OK"
            }
        }
    } catch {}
}

# Fix: empty array on PS 5.1 emits nothing via ConvertTo-Json. Force array shape.
if ($disks.Count -eq 0) {
    Write-Output "[]"
} elseif ($disks.Count -eq 1) {
    Write-Output "[$($disks | ConvertTo-Json -Compress)]"
} else {
    Write-Output ($disks | ConvertTo-Json -Compress)
}
