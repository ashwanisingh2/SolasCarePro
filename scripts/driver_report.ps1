# driver_report.ps1
# Driver scan report generator (spec TASK 8).
# Outputs HTML, JSON, or CSV file at given path.
param(
    [ValidateSet('html','json','csv')]
    [string]$Format = 'html',
    [string]$OutputPath,
    [switch]$IncludeHealth
)
$ErrorActionPreference = 'SilentlyContinue'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $OutputPath) {
    $reportsDir = Join-Path $env:APPDATA 'SolasCare\reports'
    if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null }
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $ext = if ($Format -eq 'html') { 'html' } elseif ($Format -eq 'json') { 'json' } else { 'csv' }
    $OutputPath = Join-Path $reportsDir "driver_report_$stamp.$ext"
}

# Validate output path
if ($OutputPath -match '[<>|"`]' -or $OutputPath -match '\.\.') {
    Write-Output '{\"success\":false,\"error\":\"Invalid output path\"}'
    exit 1
}

# Gather data
$computerName = $env:COMPUTERNAME
$osVersion = [System.Environment]::OSVersion.Version.ToString()
$currentBuild = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue).CurrentBuild
$productName = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue).ProductName
$arch = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
$scanDate = Get-Date

# Reuse scan_drivers logic inline (single source of truth)
$signedDrivers = @(Get-CimInstance -ClassName Win32_PnPSignedDriver)
$allEntities   = @(Get-CimInstance -ClassName Win32_PnPEntity)
$entityErrors = @{}
foreach ($e in $allEntities) {
    if ($e.ConfigManagerErrorCode -ne 0) { $entityErrors[$e.DeviceID] = [int]$e.ConfigManagerErrorCode }
}

$devices = @()
foreach ($d in $signedDrivers) {
    if (-not $d.DeviceID) { continue }
    $probCode = 0
    if ($entityErrors.ContainsKey($d.DeviceID)) { $probCode = $entityErrors[$d.DeviceID] }
    $status = if ($probCode -eq 0) { 'OK' }
              elseif ($probCode -eq 22) { 'Disabled' }
              elseif ($probCode -eq 28 -or $probCode -eq 1) { 'Missing' }
              else { 'Warning' }
    $devices += [PSCustomObject]@{
        DeviceName     = $d.DeviceName
        Manufacturer   = $d.Manufacturer
        DriverVersion  = $d.DriverVersion
        DriverDate     = if ($d.DriverDate) { ([DateTime]$d.DriverDate).ToString('yyyy-MM-dd') } else { '' }
        DriverProvider = $d.DriverProviderName
        IsSigned       = [bool]$d.IsSigned
        Signer         = $d.Signer
        InfName        = $d.InfName
        PnpDeviceId    = $d.DeviceID
        HardwareId     = if ($d.HardWareID) { $d.HardWareID[0] } else { '' }
        Status         = $status
        ProblemCode    = $probCode
        DeviceClass    = $d.DeviceClass
    }
}

$summary = [PSCustomObject]@{
    TotalDevices     = $devices.Count
    MissingDrivers   = ($devices | Where-Object Status -eq 'Missing').Count
    DisabledDevices  = ($devices | Where-Object Status -eq 'Disabled').Count
    WarningDevices   = ($devices | Where-Object Status -eq 'Warning').Count
    HealthyDevices   = ($devices | Where-Object Status -eq 'OK').Count
    UnsignedDrivers  = ($devices | Where-Object IsSigned -eq $false).Count
}

$reportId = [Guid]::NewGuid().ToString('N')

switch ($Format) {
    'json' {
        $report = [PSCustomObject]@{
            reportId       = $reportId
            computerName   = $computerName
            windowsVersion = "$productName (Build $currentBuild)"
            windowsBuild   = $currentBuild
            architecture   = $arch
            scanDate       = $scanDate.ToString('o')
            scanDuration   = 'PT0S'
            healthScore    = 100 - ($summary.MissingDrivers * 20 + $summary.UnsignedDrivers * 10 + $summary.WarningDevices * 5)
            summary        = $summary
            devices        = $devices
            generatedBy    = 'SolasCarePro v3.1.0'
        }
        $report | ConvertTo-Json -Depth 5 | Set-Content -Path $OutputPath -Encoding UTF8
    }

    'csv' {
        # RFC 4180: fields containing comma/quote/newline are quoted and quotes doubled
        $csv = 'DeviceName,Manufacturer,DriverVersion,DriverDate,DriverProvider,IsSigned,Signer,InfName,PnpDeviceId,HardwareId,Status,ProblemCode,DeviceClass'
        foreach ($d in $devices) {
            $row = @($d.DeviceName, $d.Manufacturer, $d.DriverVersion, $d.DriverDate, $d.DriverProvider, $d.IsSigned, $d.Signer, $d.InfName, $d.PnpDeviceId, $d.HardwareId, $d.Status, $d.ProblemCode, $d.DeviceClass) |
                ForEach-Object {
                    $v = "$_"
                    if ($v -match '[,"`\r`\n]') { '"' + ($v -replace '"','""') + '"' } else { $v }
                }
            $csv += "`n" + ($row -join ',')
        }
        Set-Content -Path $OutputPath -Value $csv -Encoding UTF8
    }

    'html' {
        $html = @"
<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='UTF-8'>
<title>Driver Scan Report - $computerName</title>
<style>
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background:#0F172A; color:#E2E8F0; margin:0; padding:24px; }
  h1 { color:#8B5CF6; margin:0 0 4px 0; font-size:28px; }
  h2 { color:#06B6D4; margin:24px 0 8px 0; font-size:18px; border-bottom:1px solid #334155; padding-bottom:6px; }
  .meta { color:#94A3B8; font-size:12px; margin-bottom:16px; }
  .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin:16px 0; }
  .card { background:#1E293B; border:1px solid #334155; padding:12px; border-radius:8px; }
  .card .label { font-size:10px; color:#94A3B8; text-transform:uppercase; letter-spacing:0.5px; }
  .card .value { font-size:22px; font-weight:700; margin-top:4px; }
  .ok { color:#10B981; } .warn { color:#F59E0B; } .err { color:#EF4444; } .info { color:#06B6D4; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { background:#1E293B; color:#94A3B8; text-align:left; padding:8px; font-weight:600; text-transform:uppercase; font-size:10px; letter-spacing:0.5px; }
  td { padding:8px; border-bottom:1px solid #1E293B; }
  tr:hover td { background:#1E293B; }
  .badge { padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; }
  .badge-ok { background:rgba(16,185,129,0.15); color:#10B981; }
  .badge-warn { background:rgba(245,158,11,0.15); color:#F59E0B; }
  .badge-err { background:rgba(239,68,68,0.15); color:#EF4444; }
  .badge-disabled { background:rgba(245,158,11,0.15); color:#F59E0B; }
  footer { color:#64748B; font-size:10px; text-align:center; margin-top:24px; }
</style>
</head>
<body>
<h1>Driver Scan Report</h1>
<div class='meta'>Computer: <strong>$computerName</strong> &middot; Windows: $productName Build $currentBuild &middot; Architecture: $arch &middot; Scan Date: $($scanDate.ToString('yyyy-MM-dd HH:mm:ss')) &middot; Report ID: $reportId</div>

<h2>Summary</h2>
<div class='summary'>
  <div class='card'><div class='label'>Total Devices</div><div class='value info'>$($summary.TotalDevices)</div></div>
  <div class='card'><div class='label'>Healthy</div><div class='value ok'>$($summary.HealthyDevices)</div></div>
  <div class='card'><div class='label'>Missing</div><div class='value err'>$($summary.MissingDrivers)</div></div>
  <div class='card'><div class='label'>Disabled</div><div class='value warn'>$($summary.DisabledDevices)</div></div>
  <div class='card'><div class='label'>Warnings</div><div class='value warn'>$($summary.WarningDevices)</div></div>
  <div class='card'><div class='label'>Unsigned</div><div class='value err'>$($summary.UnsignedDrivers)</div></div>
</div>

<h2>Device Inventory ($($devices.Count) devices)</h2>
<table>
<thead><tr>
<th>Device Name</th><th>Manufacturer</th><th>Version</th><th>Date</th><th>Provider</th><th>Signed</th><th>Status</th><th>Problem Code</th>
</tr></thead>
<tbody>
"@
        foreach ($d in $devices) {
            $badgeClass = switch ($d.Status) {
                'OK'        { 'badge-ok' }
                'Disabled'  { 'badge-disabled' }
                'Missing'   { 'badge-err' }
                default     { 'badge-warn' }
            }
            $signedLabel = if ($d.IsSigned) { 'Yes' } else { 'No' }
            $signerLabel = if ($d.Signer) { " ($($d.Signer))" } else { '' }
            $html += "<tr><td>$($d.DeviceName)</td><td>$($d.Manufacturer)</td><td>$($d.DriverVersion)</td><td>$($d.DriverDate)</td><td>$($d.DriverProvider)</td><td>$signedLabel$signerLabel</td><td><span class='badge $badgeClass'>$($d.Status)</span></td><td>$($d.ProblemCode)</td></tr>"
        }
        $html += @"
</tbody></table>
<footer>Generated by SolasCarePro v3.1.0 &middot; $computerName &middot; $($scanDate.ToString('o'))</footer>
</body></html>
"@
        Set-Content -Path $OutputPath -Value $html -Encoding UTF8
    }
}

$result = [PSCustomObject]@{
    success    = $true
    format     = $Format
    outputPath = $OutputPath
    deviceCount = $devices.Count
    generatedAt = (Get-Date).ToString('o')
}
Write-Output ($result | ConvertTo-Json -Compress)
Write-AuditLog -Action 'driver-report' -Result 'success' -Target $OutputPath -Details "Format=$Format, Devices=$($devices.Count)"
