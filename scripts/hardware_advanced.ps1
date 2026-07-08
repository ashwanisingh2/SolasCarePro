# hardware_advanced.ps1
# Advanced hardware queries: GPU info, BIOS/motherboard info.
# Real WMI/CIM queries - no mock data.
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('gpu','bios','cpu','memory')]
    [string]$Action
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'

try {
    switch ($Action) {
        'gpu' {
            $gpus = @(Get-CimInstance Win32_VideoController -ErrorAction Stop |
                     Select-Object Name, DriverVersion, DriverDate, AdapterRAM,
                             VideoProcessor, Status, CurrentHorizontalResolution,
                             CurrentVerticalResolution, CurrentRefreshRate)
            # Convert dates to ISO 8601 for JSON safety
            foreach ($g in $gpus) {
                if ($g.DriverDate) {
                    try { $g.DriverDate = ([DateTime]$g.DriverDate).ToString('yyyy-MM-dd') } catch {}
                }
                if ($g.AdapterRAM) {
                    $g | Add-Member -NotePropertyName AdapterRAMMB -NotePropertyValue ([math]::Round($g.AdapterRAM / 1MB, 1)) -Force
                }
            }
            if ($gpus.Count -eq 0) {
                Write-Output '[]'
            } elseif ($gpus.Count -eq 1) {
                Write-Output "[$($gpus | ConvertTo-Json -Compress -Depth 3)]"
            } else {
                Write-Output ($gpus | ConvertTo-Json -Compress -Depth 3)
            }
            Write-AuditLog -Action 'hardware-gpu' -Result 'success' -Details "GPUs=$($gpus.Count)"
        }
        'bios' {
            $bios = Get-CimInstance Win32_BIOS -ErrorAction Stop |
                    Select-Object Manufacturer, Name, Version, ReleaseDate, SMBIOSBIOSVersion, SerialNumber
            $board = Get-CimInstance Win32_BaseBoard -ErrorAction Stop |
                     Select-Object Manufacturer, Product, Version, SerialNumber
            if ($bios.ReleaseDate) {
                try { $bios.ReleaseDate = ([DateTime]$bios.ReleaseDate).ToString('yyyy-MM-dd') } catch {}
            }
            $result = [PSCustomObject]@{
                success = $true
                bios    = $bios
                board   = $board
            }
            Write-Output ($result | ConvertTo-Json -Depth 4 -Compress)
            Write-AuditLog -Action 'hardware-bios' -Result 'success' -Details "Manufacturer=$($bios.Manufacturer)"
        }
        'cpu' {
            $cpus = @(Get-CimInstance Win32_Processor -ErrorAction Stop |
                      Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors,
                              MaxClockSpeed, CurrentClockSpeed, L2CacheSize, L3CacheSize, Architecture)
            # Architecture mapping
            foreach ($c in $cpus) {
                $archNum = [int]$c.Architecture
                $archName = switch ($archNum) {
                    0  { 'x86' }
                    5  { 'ARM' }
                    9  { 'x64' }
                    12 { 'ARM64' }
                    default { "Unknown($archNum)" }
                }
                $c | Add-Member -NotePropertyName ArchitectureName -NotePropertyValue $archName -Force
            }
            if ($cpus.Count -eq 0) {
                Write-Output '[]'
            } elseif ($cpus.Count -eq 1) {
                Write-Output "[$($cpus | ConvertTo-Json -Compress -Depth 3)]"
            } else {
                Write-Output ($cpus | ConvertTo-Json -Compress -Depth 3)
            }
            Write-AuditLog -Action 'hardware-cpu' -Result 'success'
        }
        'memory' {
            $mems = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction Stop |
                      Select-Object Manufacturer, Capacity, Speed, ConfiguredClockSpeed,
                              PartNumber, SerialNumber, MemoryType, FormFactor, BankLabel, DeviceLocator)
            # Add human-readable fields
            foreach ($m in $mems) {
                if ($m.Capacity) {
                    $m | Add-Member -NotePropertyName CapacityGB -NotePropertyValue ([math]::Round($m.Capacity / 1GB, 1)) -Force
                }
                # MemoryType codes: 20=DDR, 21=DDR2, 24=DDR3, 26=DDR4, 34=DDR5
                $mtNum = [int]$m.MemoryType
                $mtName = switch ($mtNum) {
                    20 { 'DDR' }
                    21 { 'DDR2' }
                    24 { 'DDR3' }
                    26 { 'DDR4' }
                    34 { 'DDR5' }
                    0  { 'Unknown' }
                    default { "Type$mtNum" }
                }
                $m | Add-Member -NotePropertyName MemoryTypeName -NotePropertyValue $mtName -Force
                # Form factor: 8=DIMM, 12=SODIMM
                $ffNum = [int]$m.FormFactor
                $ffName = switch ($ffNum) {
                    8  { 'DIMM' }
                    12 { 'SODIMM' }
                    default { "FF$ffNum" }
                }
                $m | Add-Member -NotePropertyName FormFactorName -NotePropertyValue $ffName -Force
            }
            if ($mems.Count -eq 0) {
                Write-Output '[]'
            } elseif ($mems.Count -eq 1) {
                Write-Output "[$($mems | ConvertTo-Json -Compress -Depth 3)]"
            } else {
                Write-Output ($mems | ConvertTo-Json -Compress -Depth 3)
            }
            Write-AuditLog -Action 'hardware-memory' -Result 'success' -Details "Sticks=$($mems.Count)"
        }
        default {
            Write-JsonError "Invalid action: $Action" 'hardware_advanced'
        }
    }
} catch {
    Write-AuditLog -Action "hardware-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "hardware_advanced.$Action"
}
