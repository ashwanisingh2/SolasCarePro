# get_drives_info.ps1
$ErrorActionPreference = 'Stop'

$results = @()
$osVersion = [System.Environment]::OSVersion.Version

try {
    if ($osVersion.Major -ge 10) {
        $volumes = Get-Volume -ErrorAction Stop | Where-Object { $_.DriveLetter }
        foreach ($vol in $volumes) {
            $letter = $vol.DriveLetter.ToString()
            $partition = $null
            try { $partition = Get-Partition -DriveLetter $letter -ErrorAction Stop } catch {}
            $mediaType = "Unspecified"
            if ($partition) {
                try {
                    $phys = Get-PhysicalDisk -DeviceID $partition.DiskNumber -ErrorAction Stop
                    if ($phys) { $mediaType = $phys.MediaType.ToString() }
                } catch {}
            }
            # Fix: do not fabricate random fragmentation %. Real fragmentation
            # requires `defrag /A` which can take minutes per drive. Leave as
            # null and let the UI render "N/A" instead of fake numbers.
            $results += [PSCustomObject]@{
                DriveLetter = $letter
                MediaType = $mediaType
                Size = $vol.Size
                FreeSpace = $vol.SizeRemaining
                FragBefore = $null
                FragAfter = $null
            }
        }
    } else {
        # Windows 7 / 8 compatibility mode fallback
        $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction Stop
        foreach ($d in $disks) {
            $letter = $d.DeviceID.Replace(":", "")
            # Fix: do not assume C is SSD - we don't know without querying Win32_DiskDrive.
            # Leave MediaType as "Unknown" so UI can render it accordingly.
            $results += [PSCustomObject]@{
                DriveLetter = $letter
                MediaType = "Unknown"
                Size = $d.Size
                FreeSpace = $d.FreeSpace
                FragBefore = $null
                FragAfter = $null
            }
        }
    }
} catch {
    # Fix: do not fabricate a fake C: drive on error. Surface the error as JSON.
    Write-Output ('{"error":"' + ($_.Exception.Message -replace '[\\"]',' ') + '"}')
    exit 0
}

# Fix: empty array on PS 5.1 emits nothing via ConvertTo-Json. Force array shape.
if ($results.Count -eq 0) {
    Write-Output "[]"
} elseif ($results.Count -eq 1) {
    Write-Output "[$($results | ConvertTo-Json -Compress)]"
} else {
    Write-Output ($results | ConvertTo-Json -Compress)
}
