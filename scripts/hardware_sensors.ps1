# hardware_sensors.ps1
# Queries WMI for hardware sensor data: CPU temperature (MSAcpi_ThermalZone),
# fan speed (Win32_Fan), voltage probes (Win32_VoltageProbe), temperature probes
# (Win32_TemperatureProbe). NEW - no equivalent existed.
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $sensors = @{
        cpuTemperatures = @()
        fanSpeeds = @()
        voltageProbes = @()
        temperatureProbes = @()
        batteryInfo = @()
        notes = @()
    }

    # 1. CPU/Ambient Temperature via MSAcpi_ThermalZoneTemperature
    # Note: This often returns only 1-2 "thermal zones" (not per-core CPU temp).
    # The temperature is in tenths of Kelvin - convert to Celsius.
    try {
        $thermalZones = Get-CimInstance -Namespace 'root/wmi' -ClassName 'MSAcpi_ThermalZoneTemperature' -ErrorAction Stop
        foreach ($zone in $thermalZones) {
            $kelvinTenths = $zone.CurrentTemperature
            if ($kelvinTenths -and $kelvinTenths -gt 0) {
                $celsius = [math]::Round(($kelvinTenths / 10) - 273.15, 1)
                $sensors.cpuTemperatures += @{
                    instanceName = $zone.InstanceName
                    temperatureC = $celsius
                    criticalTripPoint = if ($zone.CriticalTripPoint) { [math]::Round(($zone.CriticalTripPoint / 10) - 273.15, 1) } else { $null }
                }
            }
        }
        if ($sensors.cpuTemperatures.Count -eq 0) {
            $sensors.notes += 'MSAcpi_ThermalZoneTemperature returned no active thermal zones (common on many OEM systems).'
        }
    } catch {
        $sensors.notes += 'MSAcpi_ThermalZoneTemperature not available: ' + $_.Exception.Message
    }

    # 2. Fan Speed via Win32_Fan
    try {
        $fans = Get-CimInstance -ClassName 'Win32_Fan' -ErrorAction Stop
        foreach ($fan in $fans) {
            $sensors.fanSpeeds += @{
                name = $fan.Name
                description = $fan.Description
                status = $fan.Status
                desiredSpeed = $fan.DesiredSpeed
                variableSpeed = $fan.VariableSpeed
                activeCooling = $fan.ActiveCooling
            }
        }
        if ($sensors.fanSpeeds.Count -eq 0) {
            $sensors.notes += 'Win32_Fan returned no fan data (most consumer motherboards do not expose fan info via WMI).'
        }
    } catch {
        $sensors.notes += 'Win32_Fan not available: ' + $_.Exception.Message
    }

    # 3. Voltage Probes via Win32_VoltageProbe
    try {
        $voltages = Get-CimInstance -ClassName 'Win32_VoltageProbe' -ErrorAction Stop
        foreach ($v in $voltages) {
            $sensors.voltageProbes += @{
                name = $v.Name
                description = $v.Description
                currentReading = $v.CurrentReading
                status = $v.Status
            }
        }
    } catch {
        $sensors.notes += 'Win32_VoltageProbe not available.'
    }

    # 4. Temperature Probes via Win32_TemperatureProbe
    try {
        $tempProbes = Get-CimInstance -ClassName 'Win32_TemperatureProbe' -ErrorAction Stop
        foreach ($t in $tempProbes) {
            $sensors.temperatureProbes += @{
                name = $t.Name
                description = $t.Description
                currentReading = $t.CurrentReading
                status = $t.Status
            }
        }
    } catch {
        $sensors.notes += 'Win32_TemperatureProbe not available.'
    }

    # 5. Battery info (already exists in battery_report.ps1, but include basic info here)
    try {
        $batteries = Get-CimInstance -ClassName 'Win32_Battery' -ErrorAction Stop
        foreach ($bat in $batteries) {
            $sensors.batteryInfo += @{
                name = $bat.Name
                estimatedChargeRemaining = $bat.EstimatedChargeRemaining
                batteryStatus = switch ($bat.BatteryStatus) {
                    1 { 'Discharging' }
                    2 { 'AC Connected' }
                    3 { 'Fully Charged' }
                    4 { 'Low' }
                    5 { 'Critical' }
                    6 { 'Charging' }
                    7 { 'Charging High' }
                    default { "Unknown ($($bat.BatteryStatus))" }
                }
                chemistry = $bat.Chemistry
            }
        }
    } catch {
        # Desktop machines have no battery - silently ignore.
    }

    # Summary
    $totalSensors = $sensors.cpuTemperatures.Count + $sensors.fanSpeeds.Count +
                    $sensors.voltageProbes.Count + $sensors.temperatureProbes.Count

    Write-JsonResult @{
        success = $true
        cpuTemperatures = $sensors.cpuTemperatures
        fanSpeeds = $sensors.fanSpeeds
        voltageProbes = $sensors.voltageProbes
        temperatureProbes = $sensors.temperatureProbes
        batteryInfo = $sensors.batteryInfo
        notes = $sensors.notes
        totalSensorsFound = $totalSensors
        message = "Sensor scan complete: $totalSensors sensor(s) found." +
                  $(if($sensors.notes.Count -gt 0){' Note: ' + ($sensors.notes -join ' ')}else{''})
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
