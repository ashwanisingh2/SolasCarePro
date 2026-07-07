# scan_drivers.ps1
# Comprehensive driver/device enumeration for SolasCarePro DriverManager.
# Returns JSON array of devices with full DeviceInfo schema (spec TASK 1).
$ErrorActionPreference = 'SilentlyContinue'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

# SetupAPI class GUIDs for category detection
$CategoryGuids = @{
    '4D36E968-E325-11CE-BFC1-08002BE10318' = 'GPU'
    '4D36E96C-E325-11CE-BFC1-08002BE10318' = 'Audio'
    '4D36E972-E325-11CE-BFC1-08002BE10318' = 'Network'
    '4D36E967-E325-11CE-BFC1-08002BE10318' = 'Disk'
    '36FC9E60-C465-11CF-8056-444553540000' = 'USB'
    'E0CBF06C-CD8B-4647-BB8A-263B43F0F974' = 'Bluetooth'
    '745A17A0-74D3-11D0-B6FE-00A0C90F57DA' = 'HID'
    '53D29EF7-377C-4D14-864B-EB3A85769359' = 'Biometric'
    'D94EE5D8-D189-4994-83D2-F68D7D41B0E4' = 'TPM'
    '50127DC3-0F36-415E-A6CC-4CB3BE910B65' = 'CPU'
    '{50127DC3-0F36-415E-A6CC-4CB3BE910B65}' = 'CPU'
    '{4D36E968-E325-11CE-BFC1-08002BE10318}' = 'GPU'
    '{4D36E96C-E325-11CE-BFC1-08002BE10318}' = 'Audio'
    '{4D36E972-E325-11CE-BFC1-08002BE10318}' = 'Network'
    '{4D36E967-E325-11CE-BFC1-08002BE10318}' = 'Disk'
    '{36FC9E60-C465-11CF-8056-444553540000}' = 'USB'
}

# CM_PROB_* codes -> human status mapping (subset of 56 codes per spec)
function Get-ProblemStatus {
    param([int]$Code)
    switch ($Code) {
        0  { @{ Status='OK';        Issue='None' } }
        1  { @{ Status='Missing';   Issue='NOT_CONFIGURED' } }
        10 { @{ Status='Error';     Issue='FAILED_START' } }
        12 { @{ Status='Error';     Issue='NO_VALID_CONFIG' } }
        14 { @{ Status='Warning';   Issue='NEED_RESTART' } }
        16 { @{ Status='Error';     Issue='REGISTRY_TOO_SMALL' } }
        18 { @{ Status='Error';     Issue='REINSTALL' } }
        19 { @{ Status='Error';     Issue='REGISTRY' } }
        21 { @{ Status='Error';     Issue='HALTED' } }
        22 { @{ Status='Disabled';  Issue='DISABLED' } }
        24 { @{ Status='Error';     Issue='NO_VALID_LOG_CONFIG' } }
        28 { @{ Status='Missing';   Issue='FAILED_INSTALL' } }
        29 { @{ Status='Error';     Issue='DISABLED_SERVICE' } }
        31 { @{ Status='Error';     Issue='FAILED_ADD' } }
        32 { @{ Status='Error';     Issue='FAILED_DRIVER_ENTRY' } }
        33 { @{ Status='Error';     Issue='INVALID_DRIVER' } }
        34 { @{ Status='Error';     Issue='DRIVER_FAILED_LOAD' } }
        35 { @{ Status='Error';     Issue='DRIVER_FAILED_LOAD_2' } }
        36 { @{ Status='Error';     Issue='DRIVER_FAILED_LOAD_3' } }
        37 { @{ Status='Error';     Issue='FAILED_INITIALIZE' } }
        38 { @{ Status='Error';     Issue='NO_MORE_RESOURCES' } }
        39 { @{ Status='Error';     Issue='NO_VALID_LOG_CONFIG_2' } }
        40 { @{ Status='Error';     Issue='NO_VALID_LOG_CONFIG_3' } }
        41 { @{ Status='Error';     Issue='FAILED_START_2' } }
        42 { @{ Status='Error';     Issue='DUPLICATE_DEVICE' } }
        43 { @{ Status='Error';     Issue='FAILED_POST_START' } }
        44 { @{ Status='Error';     Issue='HALTED_2' } }
        45 { @{ Status='Warning';   Issue='NOT_PRESENT' } }
        46 { @{ Status='Warning';   Issue='HELD_FOR_EJECT' } }
        47 { @{ Status='Warning';   Issue='HELD_FOR_EJECT_2' } }
        48 { @{ Status='Error';     Issue='TRANSLATION_FAIL' } }
        49 { @{ Status='Error';     Issue='UNKNOWN_RESOURCE' } }
        50 { @{ Status='Error';     Issue='TRANSLATION_FAIL_2' } }
        51 { @{ Status='Error';     Issue='TRANSLATION_FAIL_3' } }
        52 { @{ Status='Error';     Issue='DRIVER_FAILED_LOAD_4' } }
        53 { @{ Status='Error';     Issue='OUT_OF_MEMORY' } }
        54 { @{ Status='Error';     Issue='TRANSLATION_FAIL_4' } }
        55 { @{ Status='Error';     Issue='TRANSLATION_FAIL_5' } }
        56 { @{ Status='Error';     Issue='TRANSLATION_FAIL_6' } }
        57 { @{ Status='Error';     Issue='TRANSLATION_FAIL_7' } }
        58 { @{ Status='Error';     Issue='TRANSLATION_FAIL_8' } }
        59 { @{ Status='Error';     Issue='TRANSLATION_FAIL_9' } }
        60 { @{ Status='Error';     Issue='TRANSLATION_FAIL_10' } }
        61 { @{ Status='Error';     Issue='TRANSLATION_FAIL_11' } }
        62 { @{ Status='Error';     Issue='TRANSLATION_FAIL_12' } }
        63 { @{ Status='Error';     Issue='TRANSLATION_FAIL_13' } }
        64 { @{ Status='Error';     Issue='TRANSLATION_FAIL_14' } }
        65 { @{ Status='Error';     Issue='TRANSLATION_FAIL_15' } }
        66 { @{ Status='Error';     Issue='TRANSLATION_FAIL_16' } }
        67 { @{ Status='Error';     Issue='TRANSLATION_FAIL_17' } }
        68 { @{ Status='Error';     Issue='TRANSLATION_FAIL_18' } }
        69 { @{ Status='Error';     Issue='TRANSLATION_FAIL_19' } }
        70 { @{ Status='Error';     Issue='TRANSLATION_FAIL_20' } }
        71 { @{ Status='Error';     Issue='TRANSLATION_FAIL_21' } }
        72 { @{ Status='Error';     Issue='TRANSLATION_FAIL_22' } }
        default { @{ Status='Warning'; Issue="CODE_$Code" } }
    }
}

# Step 1: Get all signed drivers with full detail
$signedDrivers = @(Get-CimInstance -ClassName Win32_PnPSignedDriver -ErrorAction SilentlyContinue)

# Step 2: Get all PnP entities with problem codes
$allEntities = @(Get-CimInstance -ClassName Win32_PnPEntity -ErrorAction SilentlyContinue)

# Build a lookup of PnP entity -> ConfigManagerErrorCode
$entityErrors = @{}
foreach ($e in $allEntities) {
    if ($e.ConfigManagerErrorCode -ne 0) {
        $entityErrors[$e.DeviceID] = $e.ConfigManagerErrorCode
    }
}

# Build device list
$devices = @()
$seen = @{}

foreach ($d in $signedDrivers) {
    if (-not $d.DeviceName -or -not $d.DeviceID) { continue }
    if ($seen.ContainsKey($d.DeviceID)) { continue }
    $seen[$d.DeviceID] = $true

    # Parse vendor/device IDs from HardwareID like PCI\VEN_8086&DEV_3E9B
    $vendorId = ''; $deviceId = ''
    $hwIds = @($d.HardWareID)
    if (-not $hwIds -or $hwIds.Count -eq 0) { $hwIds = @() }
    $primaryHwId = if ($hwIds.Count -gt 0) { $hwIds[0] } else { '' }
    if ($primaryHwId -match 'VEN_([0-9A-Fa-f]{4})') { $vendorId = $matches[1] }
    if ($primaryHwId -match 'DEV_([0-9A-Fa-f]{4})') { $deviceId = $matches[1] }

    # Determine status from problem code
    $probCode = 0
    if ($entityErrors.ContainsKey($d.DeviceID)) { $probCode = [int]$entityErrors[$d.DeviceID] }
    $statusInfo = Get-ProblemStatus -Code $probCode

    # Determine category from class GUID
    $category = 'Other'
    $classGuid = "$($d.ClassGuid)"
    if ($classGuid -and $CategoryGuids.ContainsKey($classGuid)) {
        $category = $CategoryGuids[$classGuid]
    } elseif ($d.DeviceClass) {
        $category = $d.DeviceClass
    }

    $dateStr = 'Unknown'
    if ($d.DriverDate) {
        try { $dateStr = ([DateTime]$d.DriverDate).ToString('yyyy-MM-dd') } catch {}
    }

    $devices += [PSCustomObject]@{
        DeviceName        = $d.DeviceName
        DeviceInstanceId  = $d.DeviceID
        PnpDeviceId       = $d.DeviceID
        HardwareId        = $primaryHwId
        AllHardwareIds    = $hwIds
        CompatibleIds     = @($d.CompatID)
        VendorId          = $vendorId
        DeviceId          = $deviceId
        Manufacturer      = $d.Manufacturer
        DriverVersion     = $d.DriverVersion
        DriverDate        = $dateStr
        DriverProvider    = $d.DriverProviderName
        DriverInfName     = $d.InfName
        DriverClass       = $d.DeviceClass
        DriverClassGuid   = $classGuid
        DigitalSigner     = $d.Signer
        IsDigitallySigned = [bool]$d.IsSigned
        IsWhqlCertified   = ($d.Signer -match 'Microsoft Windows Hardware Compatibility Publisher')
        Status            = $statusInfo.Status
        ProblemCode       = $probCode
        ProblemIssue      = $statusInfo.Issue
        Category          = $category
        IsPresent         = $d.Present
        LastInstalled     = $dateStr
    }
}

# Step 3: Add PnP entities that don't appear in signed driver list (these are the truly "missing" ones)
foreach ($e in $allEntities) {
    if ($seen.ContainsKey($e.DeviceID)) { continue }
    if ($e.ConfigManagerErrorCode -eq 0) { continue }  # Skip healthy unsigned entities

    $probCode = [int]$e.ConfigManagerErrorCode
    $statusInfo = Get-ProblemStatus -Code $probCode

    $hwIds = @($e.HardwareID)
    $primaryHwId = if ($hwIds.Count -gt 0) { $hwIds[0] } else { '' }
    $vendorId = ''; $deviceId = ''
    if ($primaryHwId -match 'VEN_([0-9A-Fa-f]{4})') { $vendorId = $matches[1] }
    if ($primaryHwId -match 'DEV_([0-9A-Fa-f]{4})') { $deviceId = $matches[1] }

    $devices += [PSCustomObject]@{
        DeviceName        = $e.Name
        DeviceInstanceId  = $e.DeviceID
        PnpDeviceId       = $e.DeviceID
        HardwareId        = $primaryHwId
        AllHardwareIds    = $hwIds
        CompatibleIds     = @()
        VendorId          = $vendorId
        DeviceId          = $deviceId
        Manufacturer      = $e.Manufacturer
        DriverVersion     = 'N/A'
        DriverDate        = 'Unknown'
        DriverProvider    = 'N/A'
        DriverInfName     = ''
        DriverClass       = ''
        DriverClassGuid   = ''
        DigitalSigner     = ''
        IsDigitallySigned = $false
        IsWhqlCertified   = $false
        Status            = $statusInfo.Status
        ProblemCode       = $probCode
        ProblemIssue      = $statusInfo.Issue
        Category          = 'Unknown'
        IsPresent         = [bool]$e.Present
        LastInstalled     = 'Unknown'
    }
    $seen[$e.DeviceID] = $true
}

# Step 4: Output as JSON (force array shape)
if ($devices.Count -eq 0) {
    Write-Output '[]'
} elseif ($devices.Count -eq 1) {
    Write-Output "[$($devices | ConvertTo-Json -Compress -Depth 4)]"
} else {
    Write-Output ($devices | ConvertTo-Json -Compress -Depth 4)
}
Write-AuditLog -Action 'driver-scan' -Result 'success' -Details "Enumerated $($devices.Count) devices"
