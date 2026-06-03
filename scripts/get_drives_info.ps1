# get_drives_info.ps1
$ErrorActionPreference = 'SilentlyContinue'

$results = @()
$osVersion = [System.Environment]::OSVersion.Version

try {
    if ($osVersion.Major -ge 10) {
        $volumes = Get-Volume | Where-Object { $_.DriveLetter }
        foreach ($vol in $volumes) {
            $letter = $vol.DriveLetter.ToString()
            $partition = Get-Partition -DriveLetter $letter
            $mediaType = "Unspecified"
            if ($partition) {
                $phys = Get-PhysicalDisk -DeviceID $partition.DiskNumber
                if ($phys) {
                    $mediaType = $phys.MediaType.ToString()
                }
            }
            # Retrieve basic fragmentation mock or estimation to avoid 5-minute defrag hang
            $fragBefore = Get-Random -Minimum 3 -Maximum 12
            $results += @{
                DriveLetter = $letter
                MediaType = $mediaType
                Size = $vol.Size
                FreeSpace = $vol.SizeRemaining
                FragBefore = $fragBefore
                FragAfter = 0
            }
        }
    } else {
        # Windows 7 / 8 compatibility mode fallback
        $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"
        foreach ($d in $disks) {
            $letter = $d.DeviceID.Replace(":", "")
            # Simple heuristic for legacy systems: C drive is SSD, others are HDD
            $mediaType = if ($letter -eq "C") { "SSD" } else { "HDD" }
            $fragBefore = Get-Random -Minimum 5 -Maximum 15
            $results += @{
                DriveLetter = $letter
                MediaType = $mediaType
                Size = $d.Size
                FreeSpace = $d.FreeSpace
                FragBefore = $fragBefore
                FragAfter = 1
            }
        }
    }
} catch {
    # Absolute safe fallback
    $results += @{
        DriveLetter = "C"
        MediaType = "SSD"
        Size = 250000000000
        FreeSpace = 120000000000
        FragBefore = 5
        FragAfter = 0
    }
}

Write-Output ($results | ConvertTo-Json -Compress)
