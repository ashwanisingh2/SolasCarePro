$ErrorActionPreference = 'SilentlyContinue'

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$reportDir = Join-Path $env:APPDATA "SolasCare\reports"
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}
$reportPath = Join-Path $reportDir "SystemReport_$timestamp.html"

# Gather data
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$cpu = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
$ramTotalGB = [math]::Round($os.TotalVisibleMemorySize / (1024*1024), 2)
$ramFreeGB = [math]::Round($os.FreePhysicalMemory / (1024*1024), 2)
$ramUsedGB = $ramTotalGB - $ramFreeGB
$ramUsedPercent = [math]::Round(($ramUsedGB / $ramTotalGB) * 100, 1)

$cDrive = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='C:'"
$cTotalGB = [math]::Round($cDrive.Size / (1024*1024*1024), 2)
$cFreeGB = [math]::Round($cDrive.FreeSpace / (1024*1024*1024), 2)
$cUsedGB = $cTotalGB - $cFreeGB
$cFreePercent = [math]::Round(($cFreeGB / $cTotalGB) * 100, 1)

# Health Score
$score = 100
if ($ramUsedPercent -gt 85) { $score -= 10 }
if ($cFreePercent -lt 15) { $score -= 20 }

$pendingUpdates = 0
try {
    $updateSession = New-Object -ComObject Microsoft.Update.Session
    $updateSearcher = $updateSession.CreateUpdateSearcher()
    $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
    $pendingUpdates = $searchResult.Updates.Count
} catch {}
if ($pendingUpdates -gt 5) { $score -= 15 }

$badDrivers = Get-PnpDevice | Where-Object { $_.Status -ne 'OK' }
if ($badDrivers) {
    $deduct = $badDrivers.Count * 5
    if ($deduct -gt 25) { $deduct = 25 }
    $score -= $deduct
}

$events = Get-WinEvent -FilterHashtable @{LogName=@('System', 'Application'); Level=@(1, 2)} -MaxEvents 50 -ErrorAction SilentlyContinue
if ($events) {
    $score -= 10
}
if ($score -lt 10) { $score = 10 }

# Driver Issues
$driverRows = ""
if ($badDrivers) {
    foreach ($drv in $badDrivers) {
        $driverRows += "<tr><td>$($drv.FriendlyName)</td><td>$($drv.Class)</td><td>$($drv.Status)</td><td>$($drv.InstanceId)</td></tr>"
    }
} else {
    $driverRows = "<tr><td colspan='4' class='text-success'>All drivers are operating normally (OK).</td></tr>"
}

# Critical events
$eventRows = ""
if ($events) {
    foreach ($ev in $events) {
        $level = if ($ev.Level -eq 1) { "Critical" } else { "Error" }
        $class = if ($ev.Level -eq 1) { "level-critical" } else { "level-error" }
        $eventRows += "<tr class='$class'><td>$($ev.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss'))</td><td>$($ev.LogName)</td><td>$level</td><td>$($ev.ProviderName)</td><td>$($ev.Message)</td></tr>"
    }
} else {
    $eventRows = "<tr><td colspan='5' class='text-success'>No critical or error events in the last 50 log records.</td></tr>"
}

# Disk SMART
$disks = Get-PhysicalDisk
$diskRows = ""
if ($disks) {
    foreach ($d in $disks) {
        $capGB = [math]::Round($d.Size / (1024*1024*1024), 2)
        $diskRows += "<tr><td>$($d.DeviceId)</td><td>$($d.FriendlyName)</td><td>$($d.MediaType)</td><td>$($d.HealthStatus)</td><td>$($d.OperationalStatus)</td><td>$capGB GB</td></tr>"
    }
} else {
    $diskRows = "<tr><td colspan='6'>No physical disks found.</td></tr>"
}

# Network
$adapters = Get-NetAdapter
$netRows = ""
foreach ($a in $adapters) {
    $speed = if ($a.LinkSpeed) { $a.LinkSpeed } else { "N/A" }
    $netRows += "<tr><td>$($a.Name)</td><td>$($a.InterfaceDescription)</td><td>$($a.Status)</td><td>$speed</td></tr>"
}

# Startup list
$startups = Get-CimInstance -ClassName Win32_StartupCommand
$startupRows = ""
if ($startups) {
    foreach ($s in $startups) {
        $startupRows += "<tr><td>$($s.Name)</td><td class='font-mono'>$($s.Command)</td><td>$($s.Location)</td></tr>"
    }
} else {
    $startupRows = "<tr><td colspan='3'>No startup items found.</td></tr>"
}

# Software count
$installedCount = 0
try {
    $keys = @(
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $installedCount = (Get-ItemProperty $keys -Name DisplayName -ErrorAction SilentlyContinue | Select-Object -Unique DisplayName).Count
} catch {}

# Build HTML template
$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solas Care Pro System Diagnostics Report</title>
    <style>
        :root {
            --bg-dark: #0a0f1d;
            --panel-dark: #121829;
            --border-color: #1e293b;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --brand-violet: #8b5cf6;
            --brand-cyan: #06b6d4;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
        }
        body {
            background-color: var(--bg-dark);
            color: var(--text-main);
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 2rem;
            line-height: 1.5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
        }
        .logo {
            font-size: 1.75rem;
            font-weight: 900;
            background: linear-gradient(to right, var(--brand-violet), var(--brand-cyan));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: 1px;
        }
        .timestamp {
            font-size: 0.85rem;
            color: var(--text-muted);
            font-weight: 600;
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .card {
            background-color: var(--panel-dark);
            border: 1px solid var(--border-color);
            border-radius: 1rem;
            padding: 1.5rem;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        .card-title {
            font-size: 1rem;
            font-weight: 800;
            color: var(--text-muted);
            text-transform: uppercase;
            margin-bottom: 1rem;
            border-bottom: 1px solid #1e293b;
            padding-bottom: 0.5rem;
            display: flex;
            justify-content: space-between;
        }
        .metric {
            font-size: 2.25rem;
            font-weight: 900;
            margin: 0.5rem 0;
        }
        .metric.success { color: var(--success); }
        .metric.warning { color: var(--warning); }
        .metric.danger { color: var(--danger); }
        
        .score-circle {
            width: 120px;
            height: 120px;
            border-radius: 50%;
            border: 8px solid;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            font-weight: 900;
            margin: 1rem auto;
        }
        .score-good {
            border-color: var(--success);
            color: var(--success);
        }
        .score-warn {
            border-color: var(--warning);
            color: var(--warning);
        }
        .score-bad {
            border-color: var(--danger);
            color: var(--danger);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
            text-align: left;
            font-size: 0.9rem;
        }
        th, td {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border-color);
        }
        th {
            background-color: rgba(255,255,255,0.02);
            color: var(--text-muted);
            font-weight: 700;
        }
        tr:hover {
            background-color: rgba(255,255,255,0.01);
        }
        .font-mono {
            font-family: Consolas, Monaco, monospace;
        }
        .text-success { color: var(--success) !important; }
        .text-warning { color: var(--warning) !important; }
        .text-danger { color: var(--danger) !important; }
        
        .section-title {
            font-size: 1.25rem;
            font-weight: 800;
            margin: 2.5rem 0 1rem 0;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .section-title::before {
            content: '';
            display: inline-block;
            width: 4px;
            height: 1.25rem;
            background-color: var(--brand-violet);
            border-radius: 2px;
        }
        
        .level-critical {
            background-color: rgba(239, 68, 68, 0.08);
        }
        .level-error {
            background-color: rgba(239, 68, 68, 0.03);
        }
        
        .list-unstyled {
            list-style: none;
            padding: 0;
            margin: 0;
        }
        .list-unstyled li {
            padding: 0.25rem 0;
            display: flex;
            justify-content: space-between;
        }
        .list-unstyled li span:first-child {
            color: var(--text-muted);
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div>
                <span class="logo">SOLAS SYSTEM CARE PRO</span>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">Advanced Diagnostics Report</div>
            </div>
            <div class="timestamp">GENERATED: $($os.LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss"))</div>
        </header>

        <div class="grid">
            <div class="card" style="text-align: center;">
                <div class="card-title">System Health Score</div>
                <div class="score-circle $((if($score -ge 85){'score-good'}elseif($score -ge 60){'score-warn'}else{'score-bad'}))">
                    $score
                </div>
                <div style="font-weight: 700; margin-top: 1rem;">
                    $((if($score -ge 85){'System is Healthy'}elseif($score -ge 60){'Warnings Detected'}else{'Immediate Attention Required'}))
                </div>
            </div>
            
            <div class="card">
                <div class="card-title">Hardware Overview</div>
                <ul class="list-unstyled">
                    <li><span>OS:</span> <span>$($os.Caption)</span></li>
                    <li><span>OS Build:</span> <span>$build</span></li>
                    <li><span>CPU:</span> <span>$($cpu.Name)</span></li>
                    <li><span>RAM Memory:</span> <span>$ramUsedGB GB / $ramTotalGB GB ($ramUsedPercent%)</span></li>
                    <li><span>C: Drive Storage:</span> <span>$cUsedGB GB / $cTotalGB GB (Free: $cFreePercent%)</span></li>
                </ul>
            </div>
            
            <div class="card">
                <div class="card-title">Issues Alert Panel</div>
                <ul class="list-unstyled">
                    <li><span>Pending Updates:</span> <span class="$((if($pendingUpdates -gt 0){'text-warning'}{'text-success'}))">$pendingUpdates Updates</span></li>
                    <li><span>Driver Anomalies:</span> <span class="$((if($badDrivers){'text-danger'}{'text-success'}))">$((if($badDrivers){$badDrivers.Count}{0})) Failed</span></li>
                    <li><span>Installed Software:</span> <span>$installedCount apps</span></li>
                    <li><span>Last Boot:</span> <span>$($os.LastBootUpTime.ToString("yyyy-MM-dd HH:mm:ss"))</span></li>
                </ul>
            </div>
        </div>

        <div class="section-title">Hardware Driver Health</div>
        <div class="card" style="padding: 0; overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Device Name</th>
                        <th>Class</th>
                        <th>Status</th>
                        <th>Instance ID</th>
                    </tr>
                </thead>
                <tbody>
                    $driverRows
                </tbody>
            </table>
        </div>

        <div class="section-title">SMART Disk Health Summary</div>
        <div class="card" style="padding: 0; overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Model Name</th>
                        <th>Media Type</th>
                        <th>Health Status</th>
                        <th>Operational Status</th>
                        <th>Capacity</th>
                    </tr>
                </thead>
                <tbody>
                    $diskRows
                </tbody>
            </table>
        </div>

        <div class="section-title">Network Configuration</div>
        <div class="card" style="padding: 0; overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Adapter Name</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Link Speed</th>
                    </tr>
                </thead>
                <tbody>
                    $netRows
                </tbody>
            </table>
        </div>

        <div class="section-title">Startup Programs</div>
        <div class="card" style="padding: 0; overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Application</th>
                        <th>Execution Path</th>
                        <th>Registry/Folder Location</th>
                    </tr>
                </thead>
                <tbody>
                    $startupRows
                </tbody>
            </table>
        </div>

        <div class="section-title">Recent System/Application Errors (Last 50)</div>
        <div class="card" style="padding: 0; overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="min-width: 130px;">Time</th>
                        <th>Log</th>
                        <th>Level</th>
                        <th>Source</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    $eventRows
                </tbody>
            </table>
        </div>
    </div>
</body>
</html>
"@

$html | Out-File -FilePath $reportPath -Encoding utf8

Start-Process "$reportPath"

$result = @{
    success = $true
    reportPath = $reportPath
}
Write-Output (ConvertTo-Json $result -Compress)
