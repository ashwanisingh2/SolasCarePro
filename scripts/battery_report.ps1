# battery_report.ps1
$ErrorActionPreference = 'SilentlyContinue'

# 1. Detect battery presence FIRST
$bat = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue
if (-not $bat) {
    # Desktop PC - No Battery Detected
    @{
        BatteryPresent = $false
    } | ConvertTo-Json -Compress
    exit 0
}

$batteryExists = $true
$designCapacity = 0
$fullChargeCapacity = 0
$cycleCount = 0
$chemistry = "Unknown"
$chargePercent = $bat.EstimatedChargeRemaining
$status = $bat.BatteryStatus
$isCharging = $status -eq 2 -or $status -eq 6 -or $status -eq 7 -or $status -eq 8

# 2. Run powercfg battery report to temporary file
$reportPath = "$env:TEMP\batteryreport.html"
if (Test-Path $reportPath) { Remove-Item $reportPath -Force }

# Run powercfg silently
Start-Process powercfg -ArgumentList "/batteryreport /output `"$reportPath`"" -NoNewWindow -Wait

$parsedSuccessfully = $false
if (Test-Path $reportPath) {
    try {
        $html = Get-Content -Path $reportPath -Raw -Encoding UTF8
        
        # Design Capacity parsing
        if ($html -match 'DESIGN CAPACITY\s*</td>\s*<td>\s*([\d,]+)\s*mWh') {
            $designCapacity = [int]($Matches[1] -replace '[^\d]', '')
        }
        
        # Full Charge Capacity parsing
        if ($html -match 'FULL CHARGE CAPACITY\s*</td>\s*<td>\s*([\d,]+)\s*mWh') {
            $fullChargeCapacity = [int]($Matches[1] -replace '[^\d]', '')
        }
        
        # Cycle Count parsing
        if ($html -match 'CYCLE COUNT\s*</td>\s*<td>\s*([\d,]+)\s*') {
            $cycleCount = [int]($Matches[1] -replace '[^\d]', '')
        }
        
        # Chemistry parsing
        if ($html -match 'CHEMISTRY\s*</td>\s*<td>\s*(\S+)\s*') {
            $chemistry = $Matches[1].Trim()
        }
        
        if ($designCapacity -gt 0 -and $fullChargeCapacity -gt 0) {
            $parsedSuccessfully = $true
        }
    } catch {}
}

# 3. WMI Fallback if powercfg fails or returns empty/invalid results
if (-not $parsedSuccessfully) {
    $static = Get-CimInstance -Namespace root\wmi -ClassName BatteryStaticData -ErrorAction SilentlyContinue
    $fcc = Get-CimInstance -Namespace root\wmi -ClassName BatteryFullChargeCapacity -ErrorAction SilentlyContinue
    $cycle = Get-CimInstance -Namespace root\wmi -ClassName BatteryCycleCount -ErrorAction SilentlyContinue
    
    if ($static) {
        $designCapacity = $static.DesignedCapacity
        $chemistry = $static.Chemistry
    }
    if ($fcc) {
        $fullChargeCapacity = $fcc.FullChargeCapacity
    }
    if ($cycle) {
        $cycleCount = $cycle.CycleCount
    }
}

# Clean up report HTML file
if (Test-Path $reportPath) { Remove-Item $reportPath -Force }

# Fix: previously the script fabricated realistic-looking defaults (50000 mAh,
# 47500 mAh, 45 cycles, "LION") when parsing failed, and synthesized a fake
# 6-month capacity history. The UI then displayed these as real measurements,
# misleading users. Now we surface a `parsedSuccessfully=false` flag and let
# the UI render "N/A" instead of fake numbers.
$parsedSuccessfully = ($designCapacity -gt 0 -and $fullChargeCapacity -gt 0)
if (-not $parsedSuccessfully) {
    $designCapacity = 0
    $fullChargeCapacity = 0
    $cycleCount = 0
}

$healthPercent = if ($designCapacity -gt 0) {
    [Math]::Round(($fullChargeCapacity / $designCapacity) * 100, 1)
} else { 0 }

# Real capacity history comes from the battery report HTML. Without parsing it,
# we emit an empty array - do NOT fabricate linear-subtraction history.
$capacityHistory = @()

$report = @{
    BatteryPresent      = $true
    ParsedSuccessfully  = $parsedSuccessfully
    DesignCapacity      = $designCapacity
    FullChargeCapacity  = $fullChargeCapacity
    HealthPercent       = $healthPercent
    CycleCount          = $cycleCount
    Chemistry           = $chemistry
    ChargePercent       = $chargePercent
    IsCharging          = $isCharging
    History             = $capacityHistory
}

Write-Output ($report | ConvertTo-Json -Compress)
