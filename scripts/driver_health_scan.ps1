# driver_health_scan.ps1
# Driver health scanner (spec TASK 2).
# Returns JSON { healthScore, scoreLabel, scoreColor, issues: [{deviceName, pnpDeviceId, issueType, severity, details}], summary: {...} }
param(
    [ValidateSet('scan','full')]
    [string]$Mode = 'scan'
)
$ErrorActionPreference = 'SilentlyContinue'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

# ---------- Issue severity definitions ----------
$SeverityMap = @{
    MissingDriver      = 'Critical'
    UnknownDevice      = 'Critical'
    CorruptedDriver    = 'Critical'
    DriverConflict     = 'High'
    UnsignedDriver     = 'High'
    OutdatedDriver     = 'Medium'
    DisabledDevice     = 'Medium'
    VersionMismatch    = 'Medium'
    ProblemCode        = 'Low'
    EventLogError      = 'Low'
    BrokenDependency   = 'High'
    InstallFailure     = 'High'
}

$ScoreDeduction = @{
    MissingDriver      = 20
    CorruptedDriver    = 15
    UnsignedDriver     = 10
    DriverConflict     = 10
    OutdatedDriver     = 5
    DisabledDevice     = 5
    ProblemCode        = 3
    EventLogError      = 2
    VersionMismatch    = 4
    BrokenDependency   = 8
    InstallFailure     = 8
    UnknownDevice      = 15
}

# ---------- CM_PROB code -> DriverIssueType ----------
function Get-IssueType {
    param([int]$Code, [bool]$IsSigned, [string]$Signer)
    if ($Code -eq 28 -or $Code -eq 1) { return 'MissingDriver' }
    if ($Code -eq 49 -or $Code -eq 43) { return 'UnknownDevice' }
    if ($Code -eq 19 -or $Code -eq 10 -or $Code -eq 32 -or $Code -eq 33 -or $Code -eq 34) { return 'CorruptedDriver' }
    if ($Code -eq 22) { return 'DisabledDevice' }
    if ($Code -eq 14 -or $Code -eq 45 -or $Code -eq 47) { return 'ProblemCode' }
    if ($Code -gt 0) { return 'ProblemCode' }
    if (-not $IsSigned) { return 'UnsignedDriver' }
    if ($Signer -and $Signer -notmatch 'Microsoft|Windows Hardware Compatibility') { return 'UnsignedDriver' }
    return $null
}

# ---------- Step 1: Get device list (reuse scan_drivers.ps1 logic inline) ----------
$signedDrivers = @(Get-CimInstance -ClassName Win32_PnPSignedDriver)
$allEntities   = @(Get-CimInstance -ClassName Win32_PnPEntity)

# Build error lookup
$entityErrors = @{}
foreach ($e in $allEntities) {
    if ($e.ConfigManagerErrorCode -ne 0) {
        $entityErrors[$e.DeviceID] = [int]$e.ConfigManagerErrorCode
    }
}

# ---------- Step 2: Scan for issues ----------
$issues = @()
$score = 100

# Device-level issues from signed drivers
foreach ($d in $signedDrivers) {
    if (-not $d.DeviceID) { continue }
    $probCode = 0
    if ($entityErrors.ContainsKey($d.DeviceID)) { $probCode = $entityErrors[$d.DeviceID] }
    $issueType = Get-IssueType -Code $probCode -IsSigned ([bool]$d.IsSigned) -Signer "$($d.Signer)"
    if (-not $issueType) { continue }

    $score -= $ScoreDeduction[$issueType]
    $issues += [PSCustomObject]@{
        DeviceName   = $d.DeviceName
        PnpDeviceId  = $d.DeviceID
        IssueType    = $issueType
        Severity     = $SeverityMap[$issueType]
        ProblemCode  = $probCode
        Details      = if ($probCode -gt 0) { "CM_PROB code $probCode" } else { "Driver not signed or non-WHQL signer" }
        DriverVersion = $d.DriverVersion
        DriverProvider = $d.DriverProviderName
    }
}

# Phantom/unknown entities (not in signed driver list, with errors)
$signedIds = @($signedDrivers | ForEach-Object { $_.DeviceID }) | Where-Object { $_ }
foreach ($e in $allEntities) {
    if ($signedIds -contains $e.DeviceID) { continue }
    if ($e.ConfigManagerErrorCode -eq 0) { continue }
    $probCode = [int]$e.ConfigManagerErrorCode
    $issueType = Get-IssueType -Code $probCode -IsSigned $false -Signer ''
    if (-not $issueType) { $issueType = 'UnknownDevice' }
    $score -= $ScoreDeduction[$issueType]
    $issues += [PSCustomObject]@{
        DeviceName   = $e.Name
        PnpDeviceId  = $e.DeviceID
        IssueType    = $issueType
        Severity     = $SeverityMap[$issueType]
        ProblemCode  = $probCode
        Details      = "Phantom/unknown device with CM_PROB code $probCode"
        DriverVersion = 'N/A'
        DriverProvider = 'N/A'
    }
}

# ---------- Step 3: Event log scan for driver-related errors (last 30 days) ----------
if ($Mode -eq 'full') {
    $driverEventIds = @(7000,7001,7003,7009,7011,7016,7017,7019,7020,7021,7022,7023,7024,7026,7031,7032,7034,7038,7040)
    $events = Get-WinEvent -FilterHashtable @{ LogName='System'; Id=$driverEventIds; StartTime=(Get-Date).AddDays(-30) } -MaxEvents 200 -ErrorAction SilentlyContinue
    foreach ($ev in $events) {
        $score -= $ScoreDeduction.EventLogError
        $issues += [PSCustomObject]@{
            DeviceName   = ($ev.Message -split "`n")[0]
            PnpDeviceId  = ''
            IssueType    = 'EventLogError'
            Severity     = $SeverityMap.EventLogError
            ProblemCode  = $ev.Id
            Details      = "System event $($ev.Id) at $($ev.TimeCreated): $($ev.Message -replace "`r`n",' ' -replace "`n",' ')"
            DriverVersion = ''
            DriverProvider = ''
        }
    }
}

# ---------- Step 4: SetupAPI log parsing for install failures ----------
if ($Mode -eq 'full') {
    $setupApiLog = "$env:WINDIR\INF\setupapi.dev.log"
    if (Test-Path $setupApiLog) {
        try {
            $matches_ = Select-String -Path $setupApiLog -Pattern 'Failed to install|Error.*0x[0-9A-Fa-f]+|Error exit code' -AllMatches -ErrorAction SilentlyContinue | Select-Object -First 30
            foreach ($m in $matches_) {
                $score -= $ScoreDeduction.InstallFailure
                $issues += [PSCustomObject]@{
                    DeviceName   = 'SetupAPI Install Failure'
                    PnpDeviceId  = ''
                    IssueType    = 'InstallFailure'
                    Severity     = $SeverityMap.InstallFailure
                    ProblemCode  = 0
                    Details      = "Line $($m.LineNumber): $($m.Line -replace "`r`n",' ' -replace "`n",' ')"
                    DriverVersion = ''
                    DriverProvider = ''
                }
            }
        } catch {}
    }
}

# ---------- Step 5: Clamp score 0-100 ----------
if ($score -lt 0) { $score = 0 }
if ($score -gt 100) { $score = 100 }

# ---------- Step 6: Determine label/color ----------
$label = if ($score -ge 90) { 'Excellent' }
         elseif ($score -ge 70) { 'Good' }
         elseif ($score -ge 50) { 'Warning' }
         else { 'Critical' }
$color = if ($score -ge 90) { 'green' }
         elseif ($score -ge 70) { 'blue' }
         elseif ($score -ge 50) { 'amber' }
         else { 'red' }

# ---------- Step 7: Build summary ----------
$summary = [PSCustomObject]@{
    TotalDevices      = $signedDrivers.Count
    MissingDrivers    = ($issues | Where-Object IssueType -eq 'MissingDriver').Count
    OutdatedDrivers   = ($issues | Where-Object IssueType -eq 'OutdatedDriver').Count
    UnsignedDrivers   = ($issues | Where-Object IssueType -eq 'UnsignedDriver').Count
    CorruptedDrivers  = ($issues | Where-Object IssueType -eq 'CorruptedDriver').Count
    DisabledDevices   = ($issues | Where-Object IssueType -eq 'DisabledDevice').Count
    UnknownDevices    = ($issues | Where-Object IssueType -eq 'UnknownDevice').Count
    EventLogErrors    = ($issues | Where-Object IssueType -eq 'EventLogError').Count
    InstallFailures   = ($issues | Where-Object IssueType -eq 'InstallFailure').Count
    TotalIssues       = $issues.Count
}

# ---------- Step 8: Output ----------
$result = [PSCustomObject]@{
    HealthScore = $score
    ScoreLabel  = $label
    ScoreColor  = $color
    Issues      = $issues
    Summary     = $summary
    ScanTime    = (Get-Date).ToString('o')
    Mode        = $Mode
}
Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
Write-AuditLog -Action 'driver-health-scan' -Result 'success' -Details "Mode=$Mode, Score=$score, Issues=$($issues.Count)"
