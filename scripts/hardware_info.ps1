$ErrorActionPreference = 'Stop'

function Get-CpuInfo {
    try {
        $cpu = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
        return @{
            Name = $cpu.Name
            Cores = [int]$cpu.NumberOfCores
            LogicalProcessors = [int]$cpu.NumberOfLogicalProcessors
            MaxClockSpeedMHz = [int]$cpu.MaxClockSpeed
            LoadPercent = [int]$cpu.LoadPercentage
        }
    } catch {
        return $null
    }
}

function Get-GpuInfo {
    try {
        $gpus = Get-CimInstance -ClassName Win32_VideoController
        $list = @()
        foreach ($gpu in $gpus) {
            $ram = $gpu.AdapterRAM
            if ($null -eq $ram) { $ram = 0 }
            $list += @{
                Name = $gpu.Name
                AdapterRAM = [double]$ram
                DriverVersion = $gpu.DriverVersion
                VideoProcessor = $gpu.VideoProcessor
            }
        }
        return $list
    } catch {
        return $null
    }
}

function Get-RamInfo {
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object -First 1
        $totalVisibleMemory = [double]$os.TotalVisibleMemorySize # in KB
        $freePhysicalMemory = [double]$os.FreePhysicalMemory # in KB
        
        $totalGB = [math]::Round($totalVisibleMemory / (1024 * 1024), 2)
        $freeGB = [math]::Round($freePhysicalMemory / (1024 * 1024), 2)
        $usedGB = $totalGB - $freeGB
        $usedPercent = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0 }
        
        $slots = @()
        try {
            $mems = Get-CimInstance -ClassName Win32_PhysicalMemory
            foreach ($mem in $mems) {
                $capBytes = [double]$mem.Capacity
                $capGB = [math]::Round($capBytes / (1024*1024*1024), 2)
                $slots += @{
                    Capacity = $capGB
                    Speed = [int]$mem.Speed
                    Manufacturer = ($mem.Manufacturer -replace '\s+', ' ').Trim()
                }
            }
        } catch {
            # slots failed, ignore
        }
        
        return @{
            TotalGB = $totalGB
            FreeGB = $freeGB
            UsedPercent = $usedPercent
            Slots = $slots
        }
    } catch {
        return $null
    }
}

function Get-MotherboardInfo {
    try {
        $board = Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1
        return @{
            Manufacturer = $board.Manufacturer
            Product = $board.Product
            SerialNumber = $board.SerialNumber
        }
    } catch {
        return $null
    }
}

function Get-BiosInfo {
    try {
        $bios = Get-CimInstance -ClassName Win32_BIOS | Select-Object -First 1
        $releaseDate = $bios.ReleaseDate
        if ($bios.ReleaseDate -and $bios.ReleaseDate.Length -ge 8) {
            $releaseDate = $bios.ReleaseDate.Substring(0, 4) + "-" + $bios.ReleaseDate.Substring(4, 2) + "-" + $bios.ReleaseDate.Substring(6, 2)
        }
        return @{
            Manufacturer = $bios.Manufacturer
            Version = $bios.SMBIOSBIOSVersion
            ReleaseDate = $releaseDate
        }
    } catch {
        return $null
    }
}

function Get-StorageInfo {
    try {
        $disks = Get-CimInstance -ClassName Win32_DiskDrive
        $list = @()
        foreach ($disk in $disks) {
            $sizeGB = 0
            if ($disk.Size) {
                $sizeGB = [math]::Round([double]$disk.Size / (1024*1024*1024), 2)
            }
            $list += @{
                Model = $disk.Model
                SizeGB = $sizeGB
                MediaType = $disk.MediaType
                InterfaceType = $disk.InterfaceType
                SerialNumber = if ($disk.SerialNumber) { ($disk.SerialNumber -replace '\s+', ' ').Trim() } else { "N/A" }
            }
        }
        return $list
    } catch {
        return $null
    }
}

function Get-NetworkAdapterInfo {
    try {
        $adapters = Get-CimInstance -ClassName Win32_NetworkAdapter -Filter "PhysicalAdapter=True"
        $list = @()
        foreach ($adapter in $adapters) {
            $speed = "N/A"
            if ($adapter.Speed -gt 0) {
                $speed = "$([math]::Round($adapter.Speed / 1000000, 0)) Mbps"
            }
            $list += @{
                Name = $adapter.Name
                AdapterType = $adapter.AdapterType
                MACAddress = $adapter.MACAddress
                Speed = $speed
                Status = $adapter.NetConnectionStatus
            }
        }
        return $list
    } catch {
        return $null
    }
}

$output = @{
    CPU = Get-CpuInfo
    GPU = Get-GpuInfo
    RAM = Get-RamInfo
    Motherboard = Get-MotherboardInfo
    BIOS = Get-BiosInfo
    Storage = Get-StorageInfo
    NetworkAdapters = Get-NetworkAdapterInfo
}

Write-Output (ConvertTo-Json $output -Depth 5 -Compress)
