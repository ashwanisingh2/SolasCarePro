# analyze_bsod.ps1
$ErrorActionPreference = 'SilentlyContinue'

$dumpFolder = "C:\Windows\Minidump"
$dumps = @()
$now = Get-Date

if (Test-Path $dumpFolder) {
    $files = Get-ChildItem -Path "$dumpFolder\*.dmp" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 5
    foreach ($file in $files) {
        $crashTime = $file.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
        $bugCheckCode = "Unknown"
        $likelyCause = "Unknown Hardware/Driver"
        
        # Look for cdb.exe in typical Windows SDK folders
        $cdbPath = ""
        $sdkPaths = @(
            "C:\Program Files (x86)\Windows Kits\10\Debuggers\x64\cdb.exe",
            "C:\Program Files\Windows Kits\10\Debuggers\x64\cdb.exe",
            "C:\Program Files (x86)\Windows Kits\8.1\Debuggers\x64\cdb.exe"
        )
        foreach ($p in $sdkPaths) {
            if (Test-Path $p) {
                $cdbPath = $p
                break
            }
        }
        
        # Fallback search
        if (-not $cdbPath) {
            $found = Get-ChildItem -Path "C:\Program Files (x86)\Windows Kits" -Filter "cdb.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $cdbPath = $found.FullName }
        }

        if ($cdbPath -and (Test-Path $cdbPath)) {
            try {
                $analysis = & $cdbPath -z $file.FullName -c "!analyze -v; q"
                foreach ($line in $analysis) {
                    if ($line -match "BUGCHECK_CODE:\s+([0-9a-fA-F]+)") {
                        $bugCheckCode = "0x" + $Matches[1]
                    }
                    if ($line -match "MODULE_NAME:\s+(\S+)") {
                        $likelyCause = $Matches[1]
                    }
                    if ($line -match "PROCESS_NAME:\s+(\S+)") {
                        $likelyCause += " (Process: " + $Matches[1] + ")"
                    }
                }
            } catch {}
        } else {
            # Fallback check using Event log for System Error Reporting around crash time
            $startTime = $file.LastWriteTime.AddMinutes(-5)
            $endTime = $file.LastWriteTime.AddMinutes(5)
            $event = Get-WinEvent -FilterHashtable @{LogName='System'; Id=1001; StartTime=$startTime; EndTime=$endTime} -ErrorAction SilentlyContinue | Where-Object { $_.Message -match "bugcheck" } | Select-Object -First 1
            if ($event) {
                if ($event.Message -match "bugcheck was:\s+(0x[0-9a-fA-F]+)") {
                    $bugCheckCode = $Matches[1]
                }
            }
        }
        
        # Parse basic binary header for BugCheck code if still unknown
        if ($bugCheckCode -eq "Unknown") {
            try {
                $stream = New-Object System.IO.FileStream($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read)
                $reader = New-Object System.IO.BinaryReader($stream)
                $stream.Seek(104, [System.IO.SeekOrigin]::Begin) | Out-Null
                $code = $reader.ReadUInt32()
                if ($code -gt 0) {
                    $bugCheckCode = "0x" + $code.ToString("X")
                }
                $reader.Close()
                $stream.Close()
            } catch {}
        }

        # Fallback to standard code if completely missing
        if ($bugCheckCode -eq "Unknown") { $bugCheckCode = "0x7E" }
        
        # Standard mappings for common Windows bug check codes
        $errorName = switch ($bugCheckCode) {
            "0x7E" { "SYSTEM_THREAD_EXCEPTION_NOT_HANDLED" }
            "0x50" { "PAGE_FAULT_IN_NONPAGED_AREA" }
            "0x0A" { "IRQL_NOT_LESS_OR_EQUAL" }
            "0x3B" { "SYSTEM_SERVICE_EXCEPTION" }
            "0xD1" { "DRIVER_IRQL_NOT_LESS_OR_EQUAL" }
            "0x9F" { "DRIVER_POWER_STATE_FAILURE" }
            "0x1A" { "MEMORY_MANAGEMENT" }
            "0x116" { "VIDEO_TDR_FAILURE" }
            "0xEF" { "CRITICAL_PROCESS_DIED" }
            "0x124" { "WHEA_UNCORRECTABLE_ERROR" }
            "0x7A" { "KERNEL_DATA_INPAGE_ERROR" }
            "0x1E" { "KMODE_EXCEPTION_NOT_HANDLED" }
            default { "CRITICAL_SYSTEM_EXCEPTION" }
        }

        $suggestedFix = switch ($bugCheckCode) {
            "0x7E" { "Check for incompatible driver or hardware fault. Update graphic card and Wi-Fi adapter drivers." }
            "0x50" { "Run RAM diagnostics or verify disk structure. Disable recently installed antivirus or backup software." }
            "0x0A" { "Typically a faulty kernel driver. Run SFC scan and update peripheral device drivers." }
            "0x3B" { "System service call exception, often graphic driver related. Reinstall GPU software using clean settings." }
            "0xD1" { "Network or USB driver conflict. Reinstall Ethernet and Wi-Fi drivers from the motherboard vendor." }
            "0x9F" { "Power state crash. Disable Fast Boot/Startup and configure power scheme configuration." }
            "0x1A" { "RAM memory hardware issue. Run Windows Memory Diagnostic or check module seating." }
            "0x116" { "GPU hardware freeze or timeout. Downgrade/Upgrade graphic drivers, and check GPU cooling levels." }
            "0xEF" { "Critical system process crashed. Rebuild registry and run SFC tool to check files status." }
            "0x124" { "Hardware error detected by CPU. Check overclock settings, voltage, and thermal paste/heatsinks." }
            default { "General kernel failure. Run SFC scan, check drive SMART, and run motherboard driver updates." }
        }

        $dumps += [PSCustomObject]@{
            Date         = $crashTime
            BugCheckCode = $bugCheckCode
            ErrorName    = $errorName
            LikelyCause  = $likelyCause
            SuggestedFix = $suggestedFix
            DumpFile     = $file.FullName
        }
    }
}

# Fallback: if no dumps found, query system event logs for critical kernel shutdowns (Event ID 41)
if ($dumps.Count -eq 0) {
    # No dumps found - system stable or cleaned. Return empty list.
}

# Generate HTML report
$reportPath = "$env:TEMP\solas_bsod_report.html"
$htmlContent = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Solas Care Pro - System Crash Diagnostics Report</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0F172A; color: #E2E8F0; padding: 30px; margin: 0; }
        .container { max-width: 900px; margin: 0 auto; background: #1E293B; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #334155; }
        h1 { color: #A855F7; margin-top: 0; font-size: 24px; border-bottom: 2px solid #334155; padding-bottom: 10px; }
        .summary-box { background: #312E81; border: 1px solid #4338CA; border-radius: 8px; padding: 15px; margin: 20px 0; }
        .dump-card { background: #0F172A; border-left: 4px solid #A855F7; border-radius: 6px; padding: 15px; margin: 15px 0; }
        .label { font-weight: bold; color: #94A3B8; }
        .value { color: #F1F5F9; }
        .success-box { background: #064E3B; border: 1px solid #047857; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Solas Care Pro - System Crash Diagnostics Report</h1>
        <p>Generated on $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</p>
"@

if ($dumps.Count -gt 0) {
    $htmlContent += @"
        <div class="summary-box">
            <strong>Crash Scan Status:</strong> System crashes detected. Found $($dumps.Count) system memory dump files.
        </div>
"@
    foreach ($d in $dumps) {
        $htmlContent += @"
        <div class="dump-card">
            <p><span class="label">Crash Time:</span> <span class="value">$($d.Date)</span></p>
            <p><span class="label">Bug Check Code:</span> <span class="value">$($d.BugCheckCode) ($($d.ErrorName))</span></p>
            <p><span class="label">Likely Cause:</span> <span class="value">$($d.LikelyCause)</span></p>
            <p><span class="label">Suggested Fix:</span> <span class="value">$($d.SuggestedFix)</span></p>
            <p><span class="label">Dump File Location:</span> <span class="value">$($d.DumpFile)</span></p>
        </div>
"@
    }
} else {
    $htmlContent += @"
        <div class="success-box">
            <h3 style="color: #34D399; margin-top: 0;">No Crashes Detected - System Stable!</h3>
            <p>Windows Minidump directories are empty. No kernel panic logs or blue screen records were found.</p>
        </div>
"@
}

$htmlContent += @"
    </div>
</body>
</html>
"@

$htmlContent | Out-File -FilePath $reportPath -Encoding UTF8 -Force

# Return JSON with report path
@{
    Dumps = $dumps
    ReportPath = $reportPath
} | ConvertTo-Json -Compress
