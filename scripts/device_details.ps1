# SolasCare Pro - Comprehensive Device Details Collector
# Emits a single JSON object to stdout. Every section is wrapped in try/catch so a
# failure in one area never breaks the rest; unavailable values fall back to "N/A".

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference    = 'SilentlyContinue'
$WarningPreference     = 'SilentlyContinue'

function Coalesce($v) {
  if ($null -eq $v) { return 'N/A' }
  $s = "$v".Trim()
  if ($s -eq '' -or $s -eq 'To Be Filled By O.E.M.' -or $s -eq 'Default string' -or $s -eq 'System Serial Number') { return 'N/A' }
  return $s
}
function Section($block) { try { & $block } catch { @{} } }

# ---------------------------------------------------------------- lookups
$chassisMap = @{
  '3'='Desktop';'4'='Low Profile Desktop';'5'='Pizza Box';'6'='Mini Tower';'7'='Tower';
  '8'='Portable';'9'='Laptop';'10'='Notebook';'11'='Handheld';'12'='Docking Station';
  '13'='All-in-One';'14'='Sub-Notebook';'15'='Space-Saving';'16'='Lunch Box';'17'='Main Server';
  '18'='Expansion Chassis';'21'='Peripheral';'22'='Storage';'23'='Rack Mount';'24'='Sealed-Case PC';
  '30'='Tablet';'31'='Convertible';'32'='Detachable'
}
$memTypeMap = @{ '20'='DDR';'21'='DDR2';'22'='DDR2 FB-DIMM';'24'='DDR3';'26'='DDR4';'34'='DDR5';'35'='DDR5' }
$editionMap = @{ '1'='Ultimate';'4'='Enterprise';'6'='Business';'11'='Starter';'27'='Enterprise N';'48'='Professional';'49'='Professional N';'98'='Home N';'100'='Home Single Language';'101'='Home';'121'='Education';'122'='Education N';'125'='Enterprise LTSB';'161'='Pro for Workstations' }

# ---------------------------------------------------------------- base CIM objects (fetched once)
$cs   = Get-CimInstance Win32_ComputerSystem
$csp  = Get-CimInstance Win32_ComputerSystemProduct
$bios = Get-CimInstance Win32_BIOS
$enc  = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
$osi   = Get-CimInstance Win32_OperatingSystem
$cpui  = Get-CimInstance Win32_Processor | Select-Object -First 1
$bb   = Get-CimInstance Win32_BaseBoard | Select-Object -First 1

# ============================================================ BASIC
$Basic = Section {
  $chassisCode = "$($enc.ChassisTypes | Select-Object -First 1)"
  [ordered]@{
    'Device Name (Hostname)' = Coalesce $env:COMPUTERNAME
    'Computer Name'          = Coalesce $cs.Name
    'Device ID'              = Coalesce $csp.UUID
    'Asset Tag'              = Coalesce $enc.SMBIOSAssetTag
    'Serial Number'          = Coalesce $bios.SerialNumber
    'Model'                  = Coalesce $cs.Model
    'Manufacturer (OEM)'     = Coalesce $cs.Manufacturer
    'Product Number (SKU)'   = Coalesce $cs.SystemSKUNumber
    'Chassis Type'           = if ($chassisMap.ContainsKey($chassisCode)) { $chassisMap[$chassisCode] } else { 'N/A' }
    'Device Type'            = Coalesce $cs.SystemType
  }
}

# ============================================================ OS
$OS = Section {
  $installDate = if ($osi.InstallDate) { $osi.InstallDate.ToString('yyyy-MM-dd HH:mm') } else { 'N/A' }
  $lastBoot    = if ($osi.LastBootUpTime) { $osi.LastBootUpTime.ToString('yyyy-MM-dd HH:mm') } else { 'N/A' }
  $uptime = 'N/A'
  if ($osi.LastBootUpTime) { $u = (Get-Date) - $osi.LastBootUpTime; $uptime = "{0}d {1}h {2}m" -f $u.Days, $u.Hours, $u.Minutes }
  $activation = 'N/A'
  try {
    $lic = Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationId='55c92734-d682-4d71-983e-d6ec3f16059f' AND PartialProductKey IS NOT NULL" | Select-Object -First 1
    if ($lic) { $activation = if ($lic.LicenseStatus -eq 1) { 'Activated' } else { 'Not Activated' } }
  } catch {}
  [ordered]@{
    'OS Name'           = Coalesce $osi.Caption
    'OS Edition'        = if ($editionMap.ContainsKey("$($osi.OperatingSystemSKU)")) { $editionMap["$($osi.OperatingSystemSKU)"] } else { Coalesce $osi.OperatingSystemSKU }
    'OS Version'        = Coalesce $osi.Version
    'Build Number'      = Coalesce $osi.BuildNumber
    'Architecture'      = Coalesce $osi.OSArchitecture
    'Install Date'      = $installDate
    'Last Boot Time'    = $lastBoot
    'System Uptime'     = $uptime
    'Activation Status' = $activation
  }
}

# ============================================================ CPU
$CPU = Section {
  [ordered]@{
    'CPU Name'           = Coalesce $cpui.Name
    'Manufacturer'       = Coalesce $cpui.Manufacturer
    'Base Clock Speed'   = if ($cpui.MaxClockSpeed) { "{0:N2} GHz" -f ($cpui.MaxClockSpeed/1000) } else { 'N/A' }
    'Current Clock'      = if ($cpui.CurrentClockSpeed) { "{0:N2} GHz" -f ($cpui.CurrentClockSpeed/1000) } else { 'N/A' }
    'Number of Cores'    = Coalesce $cpui.NumberOfCores
    'Logical Processors' = Coalesce $cpui.NumberOfLogicalProcessors
    'CPU Usage %'        = if ($null -ne $cpui.LoadPercentage) { "$($cpui.LoadPercentage)%" } else { 'N/A' }
  }
}

# ============================================================ RAM
$RAM = Section {
  $modules = @(Get-CimInstance Win32_PhysicalMemory)
  $arr     = Get-CimInstance Win32_PhysicalMemoryArray | Select-Object -First 1
  $totalGB = if ($cs.TotalPhysicalMemory) { [math]::Round($cs.TotalPhysicalMemory/1GB,2) } else { 'N/A' }
  $freeGB  = if ($osi.FreePhysicalMemory)  { [math]::Round($osi.FreePhysicalMemory/1MB,2) } else { $null }
  $usedGB  = if ($freeGB -ne $null -and $totalGB -ne 'N/A') { [math]::Round($totalGB - $freeGB,2) } else { 'N/A' }
  $slots   = if ($arr.MemoryDevices) { $arr.MemoryDevices } else { $modules.Count }
  $typeCode = "$($modules[0].SMBIOSMemoryType)"
  [ordered]@{
    'Total RAM'      = if ($totalGB -ne 'N/A') { "$totalGB GB" } else { 'N/A' }
    'Available RAM'  = if ($freeGB -ne $null)  { "$freeGB GB" } else { 'N/A' }
    'Used RAM'       = if ($usedGB -ne 'N/A')  { "$usedGB GB" } else { 'N/A' }
    'RAM Type'       = if ($memTypeMap.ContainsKey($typeCode)) { $memTypeMap[$typeCode] } else { 'N/A' }
    'RAM Speed'      = if ($modules[0].Speed) { "$($modules[0].Speed) MHz" } else { 'N/A' }
    'Total Slots'    = Coalesce $slots
    'Used Slots'     = $modules.Count
    'Free Slots'     = if ($slots -is [int] -or "$slots" -match '^\d+$') { [int]$slots - $modules.Count } else { 'N/A' }
  }
}
$RAMModules = Section {
  @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
    [ordered]@{
      'Slot'         = Coalesce $_.DeviceLocator
      'Capacity'     = if ($_.Capacity) { "{0} GB" -f [math]::Round($_.Capacity/1GB,0) } else { 'N/A' }
      'Speed'        = if ($_.Speed) { "$($_.Speed) MHz" } else { 'N/A' }
      'Manufacturer' = Coalesce $_.Manufacturer
      'Part Number'  = Coalesce $_.PartNumber
    }
  })
}

# ============================================================ STORAGE
$Storage = Section {
  $phys = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
  $logical = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3")
  @($logical | ForEach-Object {
    $ld = $_
    [ordered]@{
      'Drive Letter'   = Coalesce $ld.DeviceID
      'Volume Name'    = Coalesce $ld.VolumeName
      'File System'    = Coalesce $ld.FileSystem
      'Total Capacity' = if ($ld.Size) { "{0} GB" -f [math]::Round($ld.Size/1GB,1) } else { 'N/A' }
      'Free Space'     = if ($ld.FreeSpace) { "{0} GB" -f [math]::Round($ld.FreeSpace/1GB,1) } else { 'N/A' }
      'Used Space'     = if ($ld.Size -and $ld.FreeSpace) { "{0} GB" -f [math]::Round(($ld.Size-$ld.FreeSpace)/1GB,1) } else { 'N/A' }
    }
  }) + @($phys | ForEach-Object {
    [ordered]@{
      'Disk Model'    = Coalesce $_.FriendlyName
      'Media Type'    = Coalesce $_.MediaType
      'Bus Type'      = Coalesce $_.BusType
      'Total Capacity'= if ($_.Size) { "{0} GB" -f [math]::Round($_.Size/1GB,0) } else { 'N/A' }
      'Health Status' = Coalesce $_.HealthStatus
    }
  })
}

# ============================================================ MOTHERBOARD / BIOS / TPM / SECURE BOOT
$Motherboard = Section {
  $biosDate = if ($bios.ReleaseDate) { $bios.ReleaseDate.ToString('yyyy-MM-dd') } else { 'N/A' }
  $tpmVer = 'N/A'; $tpmEnabled = 'N/A'
  try { $tpm = Get-Tpm -ErrorAction SilentlyContinue; if ($tpm) { $tpmEnabled = if ($tpm.TpmPresent) { 'Present' } else { 'Not Present' } } } catch {}
  try {
    $tpmObj = Get-CimInstance -Namespace 'root\cimv2\security\microsofttpm' -ClassName Win32_Tpm -ErrorAction SilentlyContinue
    if ($tpmObj) { $tpmVer = Coalesce($tpmObj.SpecVersion -split ',' | Select-Object -First 1) }
  } catch {}
  $secureBoot = 'N/A'
  try { $secureBoot = if (Confirm-SecureBootUEFI -ErrorAction SilentlyContinue) { 'Enabled' } else { 'Disabled' } } catch { $secureBoot = 'Legacy/Unsupported' }
  $firmware = 'N/A'
  try { $firmware = if ($env:firmware_type) { $env:firmware_type } elseif ((Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control' -Name 'PEFirmwareType' -ErrorAction SilentlyContinue).PEFirmwareType -eq 2) { 'UEFI' } else { 'Legacy BIOS' } } catch {}
  [ordered]@{
    'Motherboard Manufacturer' = Coalesce $bb.Manufacturer
    'Model'                    = Coalesce $bb.Product
    'Serial Number'            = Coalesce $bb.SerialNumber
    'BIOS Version'             = Coalesce $bios.SMBIOSBIOSVersion
    'BIOS Release Date'        = $biosDate
    'TPM Status'               = $tpmEnabled
    'TPM Version'              = $tpmVer
    'Secure Boot Status'       = $secureBoot
    'Firmware Mode'            = $firmware
  }
}

# ============================================================ GPU
$GPU = Section {
  @(Get-CimInstance Win32_VideoController | ForEach-Object {
    $dDate = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { 'N/A' }
    [ordered]@{
      'GPU Name'       = Coalesce $_.Name
      'VRAM'           = if ($_.AdapterRAM -and $_.AdapterRAM -gt 0) { "{0} GB" -f [math]::Round($_.AdapterRAM/1GB,2) } else { 'N/A' }
      'Driver Version' = Coalesce $_.DriverVersion
      'Driver Date'    = $dDate
      'Resolution'     = if ($_.CurrentHorizontalResolution) { "$($_.CurrentHorizontalResolution) x $($_.CurrentVerticalResolution)" } else { 'N/A' }
      'Refresh Rate'   = if ($_.CurrentRefreshRate) { "$($_.CurrentRefreshRate) Hz" } else { 'N/A' }
    }
  })
}

# ============================================================ DISPLAY
$Display = Section {
  @(Get-CimInstance -Namespace 'root\wmi' -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue | ForEach-Object {
    $diag = 'N/A'
    if ($_.MaxHorizontalImageSize -and $_.MaxVerticalImageSize) {
      $h = $_.MaxHorizontalImageSize/2.54; $v = $_.MaxVerticalImageSize/2.54
      $diag = "{0:N1} inch" -f ([math]::Sqrt($h*$h + $v*$v))
    }
    [ordered]@{ 'Screen Size' = $diag }
  })
}

# ============================================================ BATTERY
$Battery = Section {
  $bat = Get-CimInstance Win32_Battery | Select-Object -First 1
  if (-not $bat) { return @{ 'Battery' = 'No battery detected (Desktop)' } }
  $statusMap = @{ '1'='Discharging';'2'='Plugged In (AC)';'3'='Fully Charged';'4'='Low';'5'='Critical';'6'='Charging';'7'='Charging High';'8'='Charging Low' }
  $design = 'N/A'; $full = 'N/A'; $health = 'N/A'
  try {
    $ds = Get-CimInstance -Namespace 'root\wmi' -ClassName BatteryStaticData -ErrorAction SilentlyContinue | Select-Object -First 1
    $fc = Get-CimInstance -Namespace 'root\wmi' -ClassName BatteryFullChargedCapacity -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ds.DesignedCapacity) { $design = "$($ds.DesignedCapacity) mWh" }
    if ($fc.FullChargedCapacity) { $full = "$($fc.FullChargedCapacity) mWh" }
    if ($ds.DesignedCapacity -and $fc.FullChargedCapacity) { $health = "{0}%" -f [math]::Round(($fc.FullChargedCapacity/$ds.DesignedCapacity)*100,0) }
  } catch {}
  $rt = if ($bat.EstimatedRunTime -and $bat.EstimatedRunTime -lt 71582788) { "{0} min" -f $bat.EstimatedRunTime } else { 'N/A' }
  [ordered]@{
    'Battery Percentage'    = if ($null -ne $bat.EstimatedChargeRemaining) { "$($bat.EstimatedChargeRemaining)%" } else { 'N/A' }
    'Charging Status'       = if ($statusMap.ContainsKey("$($bat.BatteryStatus)")) { $statusMap["$($bat.BatteryStatus)"] } else { 'N/A' }
    'Design Capacity'       = $design
    'Full Charge Capacity'  = $full
    'Battery Health'        = $health
    'Estimated Remaining'   = $rt
  }
}

# ============================================================ NETWORK
$Network = Section {
  $adapters = @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "IPEnabled=True")
  $primary  = $adapters | Where-Object { $_.DefaultIPGateway } | Select-Object -First 1
  if (-not $primary) { $primary = $adapters | Select-Object -First 1 }
  $ipv4 = ($primary.IPAddress | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1)
  $ipv6 = ($primary.IPAddress | Where-Object { $_ -match ':' } | Select-Object -First 1)
  $inet = 'N/A'
  try { $inet = if (Test-Connection 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue) { 'Connected' } else { 'Disconnected' } } catch {}
  [ordered]@{
    'Computer Domain' = Coalesce $cs.Domain
    'Workgroup'       = if ($cs.PartOfDomain) { 'Domain-joined' } else { Coalesce $cs.Workgroup }
    'IPv4 Address'    = Coalesce $ipv4
    'IPv6 Address'    = Coalesce $ipv6
    'MAC Address'     = Coalesce $primary.MACAddress
    'Gateway'         = Coalesce($primary.DefaultIPGateway | Select-Object -First 1)
    'DNS Server'      = Coalesce($primary.DNSServerSearchOrder | Select-Object -First 1)
    'DHCP Enabled'    = if ($null -ne $primary.DHCPEnabled) { "$($primary.DHCPEnabled)" } else { 'N/A' }
    'Internet Status' = $inet
  }
}

# ============================================================ SECURITY
$Security = Section {
  $avName = 'N/A'; $avStatus = 'N/A'
  try {
    $av = Get-CimInstance -Namespace 'root\SecurityCenter2' -ClassName AntiVirusProduct -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($av) { $avName = Coalesce $av.displayName; $avStatus = if (($av.productState -band 0x1000) -ne 0) { 'Enabled' } else { 'Disabled/Snoozed' } }
  } catch {}
  $fw = 'N/A'
  try { $profiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue; if ($profiles) { $fw = if ($profiles | Where-Object { $_.Enabled }) { 'Enabled' } else { 'Disabled' } } } catch {}
  $bl = 'N/A'
  try { $blv = Get-BitLockerVolume -ErrorAction SilentlyContinue | Where-Object { $_.MountPoint -eq $env:SystemDrive }; if ($blv) { $bl = "$($blv.ProtectionStatus)" } } catch {}
  $def = 'N/A'
  try { $mp = Get-MpComputerStatus -ErrorAction SilentlyContinue; if ($mp) { $def = if ($mp.RealTimeProtectionEnabled) { 'Real-Time On' } else { 'Real-Time Off' } } } catch {}
  [ordered]@{
    'Antivirus Name'          = $avName
    'Antivirus Status'        = $avStatus
    'Firewall Status'         = $fw
    'BitLocker Status'        = $bl
    'Windows Defender'        = $def
  }
}

# ============================================================ DRIVERS
$Drivers = Section {
  $problem = @(Get-CimInstance Win32_PnPEntity -Filter "ConfigManagerErrorCode <> 0")
  [ordered]@{
    'Total Devices'     = @(Get-CimInstance Win32_PnPEntity).Count
    'Problem Devices'   = $problem.Count
    'Missing Drivers'   = if ($problem.Count -gt 0) { ($problem | Select-Object -First 5 | ForEach-Object { $_.Name }) -join '; ' } else { 'None' }
  }
}

# ============================================================ SOFTWARE (summary)
$Software = Section {
  $net = 'N/A'
  try { $net = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -ErrorAction SilentlyContinue).Version } catch {}
  $office = 'N/A'
  try {
    $o = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Office\*\*\Common\InstallRoot' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($o) { $office = 'Installed' }
  } catch {}
  [ordered]@{
    '.NET Version'      = Coalesce $net
    'Microsoft Office'  = $office
    'Installed Apps'    = @(Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object { $_.DisplayName }).Count
  }
}

# ============================================================ WINDOWS UPDATE
$WindowsUpdate = Section {
  $last = 'N/A'
  try { $hf = Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1; if ($hf.InstalledOn) { $last = $hf.InstalledOn.ToString('yyyy-MM-dd') } } catch {}
  $reboot = $false
  try {
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $reboot = $true }
    if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $reboot = $true }
  } catch {}
  [ordered]@{
    'Last Update Date'  = $last
    'Reboot Required'   = if ($reboot) { 'Yes' } else { 'No' }
    'Hotfixes Installed'= @(Get-HotFix).Count
  }
}

# ============================================================ USERS
$Users = Section {
  @(Get-CimInstance Win32_UserAccount -Filter "LocalAccount=True" | ForEach-Object {
    [ordered]@{
      'User Name'    = Coalesce $_.Name
      'Full Name'    = Coalesce $_.FullName
      'Enabled'      = if ($_.Disabled) { 'No' } else { 'Yes' }
      'Is Admin'     = if ($_.SID -match '-500$') { 'Yes (Built-in)' } else { 'Standard' }
    }
  })
}

# ============================================================ HARDWARE HEALTH
$HardwareHealth = Section {
  $cpuiTemp = 'N/A'
  try {
    $t = Get-CimInstance -Namespace 'root\wmi' -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($t.CurrentTemperature) { $cpuiTemp = "{0:N1} °C" -f (($t.CurrentTemperature/10)-273.15) }
  } catch {}
  $smart = 'N/A'
  try { $d = Get-CimInstance Win32_DiskDrive | Select-Object -First 1; if ($d) { $smart = Coalesce $d.Status } } catch {}
  [ordered]@{
    'CPU Temperature' = $cpuiTemp
    'SMART Status'    = $smart
    'Disk Health'     = try { Coalesce(@(Get-PhysicalDisk)[0].HealthStatus) } catch { 'N/A' }
  }
}

# ============================================================ CONNECTIVITY
$Connectivity = Section {
  [ordered]@{
    'Bluetooth'    = if (@(Get-PnpDevice -Class Bluetooth -Status OK -ErrorAction SilentlyContinue).Count -gt 0) { 'Available' } else { 'Not Available' }
    'Webcam'       = if (@(Get-PnpDevice -Class Camera,Image -Status OK -ErrorAction SilentlyContinue).Count -gt 0) { 'Available' } else { 'Not Available' }
    'Audio Device' = if (@(Get-PnpDevice -Class AudioEndpoint,Media -Status OK -ErrorAction SilentlyContinue).Count -gt 0) { 'Available' } else { 'Not Available' }
    'USB Devices'  = @(Get-PnpDevice -Class USB -Status OK -ErrorAction SilentlyContinue).Count
    'Printers'     = @(Get-Printer -ErrorAction SilentlyContinue).Count
  }
}

# ============================================================ EVENTS
$Events = Section {
  $errCount = 0; $critCount = 0; $bsod = 0
  try { $errCount = @(Get-WinEvent -FilterHashtable @{LogName='System'; Level=2} -MaxEvents 50 -ErrorAction SilentlyContinue).Count } catch {}
  try { $critCount = @(Get-WinEvent -FilterHashtable @{LogName='System'; Level=1} -MaxEvents 50 -ErrorAction SilentlyContinue).Count } catch {}
  try { $bsod = @(Get-WinEvent -FilterHashtable @{LogName='System'; ID=1001} -MaxEvents 50 -ErrorAction SilentlyContinue).Count } catch {}
  [ordered]@{
    'System Errors (recent)'   = $errCount
    'Critical Events (recent)' = $critCount
    'Blue Screen History'      = $bsod
  }
}

# ============================================================ REMOTE
$Remote = Section {
  $rdp = 'N/A'
  try { $rdp = if ((Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -ErrorAction SilentlyContinue).fDenyTSConnections -eq 0) { 'Enabled' } else { 'Disabled' } } catch {}
  $winrm = 'N/A'
  try { $winrm = "$((Get-Service WinRM -ErrorAction SilentlyContinue).Status)" } catch {}
  [ordered]@{
    'Remote Desktop' = $rdp
    'WinRM Service'  = Coalesce $winrm
  }
}

# ============================================================ ASSEMBLE
$result = [ordered]@{
  Basic          = $Basic
  OS             = $OS
  CPU            = $CPU
  RAM            = $RAM
  RAMModules     = $RAMModules
  Storage        = $Storage
  Motherboard    = $Motherboard
  GPU            = $GPU
  Display        = $Display
  Battery        = $Battery
  Network        = $Network
  Security       = $Security
  Drivers        = $Drivers
  Software       = $Software
  WindowsUpdate  = $WindowsUpdate
  Users          = $Users
  HardwareHealth = $HardwareHealth
  Connectivity   = $Connectivity
  Events         = $Events
  Remote         = $Remote
}

$result | ConvertTo-Json -Depth 6 -Compress
