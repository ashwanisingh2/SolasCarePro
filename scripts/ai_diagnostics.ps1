# ai_diagnostics.ps1
# AI Diagnostic Engine - rule-based expert system that analyzes system health
# and provides intelligent recommendations. NEW - no equivalent existed.
# This is NOT a neural network - it's a deterministic expert system that
# mimics AI behavior through weighted rules + pattern matching.
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('diagnose', 'recommend', 'predict', 'self-heal')]
    [string]$Action = 'diagnose'
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

# ─── Expert System Rules ───
# Each rule: condition (scriptblock) -> diagnosis + recommendation + severity
$diagnosticRules = @(
    @{
        id = 'high-ram-usage'
        check = { $metrics.ramUsedPercent -gt 85 }
        diagnosis = "Critical RAM usage detected ($($metrics.ramUsedPercent)%). The system is running low on physical memory, causing excessive paging to disk which slows down all operations."
        recommendation = "Close memory-hungry applications, disable unnecessary startup programs, or install more RAM. Run 'Maintenance Hub > Junk Cleanup' to free resources. Consider running the 'PC Slow' repair recipe."
        severity = 'critical'
        category = 'Performance'
    },
    @{
        id = 'low-disk-space'
        check = { $metrics.diskFreePercent -lt 10 }
        diagnosis = "Critical disk space shortage on C: drive ($($metrics.diskFreePercent)% free). Low disk space can cause system instability, failed updates, and performance degradation."
        recommendation = "Run 'Disk Cleanup (Deep mode)' immediately. Empty the Recycle Bin. Uninstall unused applications. Move large files to another drive. Target: at least 15% free space."
        severity = 'critical'
        category = 'Storage'
    },
    @{
        id = 'pending-updates'
        check = { $metrics.pendingUpdates -gt 15 }
        diagnosis = "$($metrics.pendingUpdates) Windows Updates are pending installation. Outdated system files may contain security vulnerabilities and bug fixes that affect stability."
        recommendation = "Run the 'Windows Update Stuck' repair recipe, then install pending updates via the Software tab. Reboot after installation."
        severity = 'warning'
        category = 'Security'
    },
    @{
        id = 'bad-drivers'
        check = { $metrics.badDrivers -gt 3 }
        diagnosis = "$($metrics.badDrivers) device driver(s) are reporting errors. Faulty drivers are the #1 cause of Blue Screen of Death (BSOD) crashes and hardware malfunctions."
        recommendation = "Open the Drivers tab and scan for problem devices. Use 'Update' on devices with Error/Missing status. If a recent driver update caused issues, use 'Rollback'. Run 'Driver Verifier' for deep BSOD diagnosis."
        severity = 'warning'
        category = 'Drivers'
    },
    @{
        id = 'error-events'
        check = { $metrics.errorEvents -gt 50 }
        diagnosis = "High error activity in the last 24 hours ($($metrics.errorEvents) events). This indicates recurring system issues that may escalate to crashes or data loss."
        recommendation = "Open the Error Log Analyzer to identify the top error sources. If BSOD events are present, run the 'Blue Screen' repair recipe. Check the Diagnostics tab for crash analysis."
        severity = 'warning'
        category = 'Stability'
    },
    @{
        id = 'failing-disks'
        check = { $metrics.failingDisks -gt 0 }
        diagnosis = "CRITICAL: $($metrics.failingDisks) disk(s) are reporting SMART health warnings. This is an early warning of imminent disk failure. Data loss is likely if not addressed."
        recommendation = "BACK UP YOUR DATA IMMEDIATELY. Replace the failing disk. Run 'chkdsk /f /r' to attempt bad sector recovery. Do NOT ignore this warning."
        severity = 'critical'
        category = 'Storage'
    },
    @{
        id = 'moderate-ram'
        check = { $metrics.ramUsedPercent -gt 70 -and $metrics.ramUsedPercent -le 85 }
        diagnosis = "Moderate RAM usage ($($metrics.ramUsedPercent)%). The system has adequate memory but is under load. Performance may degrade during heavy multitasking."
        recommendation = "Consider closing unused applications. Check the Startup Manager for programs that auto-launch and consume memory. Performance Mode 'Work' profile can help optimize resource allocation."
        severity = 'info'
        category = 'Performance'
    },
    @{
        id = 'pending-reboot'
        check = { $metrics.pendingReboot }
        diagnosis = "A system reboot is pending. Some recently installed updates or configuration changes have not been applied yet. SFC and DISM results may be inaccurate until reboot."
        recommendation = "Reboot your computer at the earliest convenience to complete pending changes and ensure accurate diagnostic results."
        severity = 'info'
        category = 'System'
    }
)

# ─── Predictive failure rules (based on trends) ───
$predictiveRules = @(
    @{
        id = 'disk-wear-high'
        condition = 'diskWearPercent > 90'
        message = "Disk wear is above 90%. SSD lifespan is approaching end-of-life. Plan for replacement within 3-6 months."
        probability = 'High'
        timeframe = '3-6 months'
    },
    @{
        id = 'ram-error-trend'
        condition = 'ramDiagnosticErrors > 0'
        message = "Memory diagnostic detected errors. RAM failure likely within 1-2 months. Replace faulty DIMM."
        probability = 'Medium'
        timeframe = '1-2 months'
    },
    @{
        id = 'bsod-frequency'
        condition = 'bsodCountLast30Days > 3'
        message = "Multiple BSODs in 30 days. Hardware or driver failure escalating. Identify the faulty component before total failure."
        probability = 'High'
        timeframe = 'Imminent'
    }
)

function Get-SystemMetrics {
    $m = @{}
    # RAM
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    if ($os) {
        $ramTotal = $os.TotalVisibleMemorySize
        $ramFree = $os.FreePhysicalMemory
        $m.ramUsedPercent = if ($ramTotal -gt 0) { [math]::Round((($ramTotal - $ramFree) / $ramTotal) * 100, 1) } else { 0 }
    }
    # Disk
    $cDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction SilentlyContinue
    if ($cDrive -and $cDrive.Size -gt 0) {
        $m.diskFreePercent = [math]::Round(($cDrive.FreeSpace / $cDrive.Size) * 100, 1)
    }
    # Pending updates
    try {
        $session = New-Object -ComObject Microsoft.Update.Session
        $searcher = $session.CreateUpdateSearcher()
        $m.pendingUpdates = $searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0").Updates.Count
    } catch { $m.pendingUpdates = 0 }
    # Bad drivers
    try { $m.badDrivers = (Get-CimInstance Win32_PnPEntity -Filter "ConfigManagerErrorCode != 0" -ErrorAction SilentlyContinue).Count } catch { $m.badDrivers = 0 }
    # Error events
    try { $m.errorEvents = (Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=(Get-Date).AddHours(-24)} -MaxEvents 200 -ErrorAction SilentlyContinue).Count } catch { $m.errorEvents = 0 }
    # Failing disks
    try { $m.failingDisks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | Where-Object { $_.HealthStatus -ne 'Healthy' }).Count } catch { $m.failingDisks = 0 }
    # Pending reboot
    $m.pendingReboot = $false
    @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
    ) | ForEach-Object { if (Test-Path $_) { $m.pendingReboot = $true } }
    return $m
}

try {
    $metrics = Get-SystemMetrics

    switch ($Action) {
        'diagnose' {
            # Run all diagnostic rules and return findings
            $findings = @()
            foreach ($rule in $diagnosticRules) {
                try {
                    $triggered = & $rule.check
                    if ($triggered) {
                        $findings += @{
                            id = $rule.id
                            diagnosis = $rule.diagnosis
                            recommendation = $rule.recommendation
                            severity = $rule.severity
                            category = $rule.category
                        }
                    }
                } catch {}
            }

            $criticalCount = ($findings | Where-Object { $_.severity -eq 'critical' }).Count
            $warningCount = ($findings | Where-Object { $_.severity -eq 'warning' }).Count

            $overall = if ($criticalCount -gt 0) { 'Critical issues detected' }
                       elseif ($warningCount -gt 0) { 'Warnings detected' }
                       else { 'System healthy' }

            Write-JsonResult @{
                success = $true
                action = 'diagnose'
                metrics = $metrics
                findings = $findings
                findingCount = $findings.Count
                criticalCount = $criticalCount
                warningCount = $warningCount
                overallStatus = $overall
                message = "$overall. $criticalCount critical, $warningCount warning(s), $($findings.Count) total finding(s)."
            } (Get-TimerElapsedSec $timer)
        }

        'recommend' {
            # Return actionable recommendations prioritized by severity
            $recommendations = @()
            foreach ($rule in $diagnosticRules) {
                try {
                    if (& $rule.check) {
                        $recommendations += @{
                            priority = $rule.severity
                            category = $rule.category
                            title = $rule.diagnosis.Split('.')[0]
                            action = $rule.recommendation
                            recipe = switch ($rule.id) {
                                'high-ram-usage' { 'pc-slow' }
                                'low-disk-space' { 'freshen-windows' }
                                'pending-updates' { 'windows-update-stuck' }
                                'bad-drivers' { $null }
                                'error-events' { 'blue-screen' }
                                'failing-disks' { 'disk-issues' }
                                default { $null }
                            }
                        }
                    }
                } catch {}
            }
            # Sort by severity: critical > warning > info
            $priorityOrder = @{ 'critical' = 0; 'warning' = 1; 'info' = 2 }
            $recommendations = $recommendations | Sort-Object { $priorityOrder[$_.priority] }

            Write-JsonResult @{
                success = $true
                action = 'recommend'
                recommendations = $recommendations
                count = $recommendations.Count
                message = "$($recommendations.Count) recommendation(s) generated."
            } (Get-TimerElapsedSec $timer)
        }

        'predict' {
            # Predictive failure detection - check trends and warn
            $predictions = @()

            # Disk wear
            try {
                $disks = Get-PhysicalDisk -ErrorAction SilentlyContinue
                foreach ($d in $disks) {
                    try {
                        $rel = Get-StorageReliabilityCounter -PhysicalDisk $d -ErrorAction SilentlyContinue
                        if ($rel -and $rel.Wear) {
                            $wearPct = 100 - $rel.Wear
                            if ($wearPct -gt 90) {
                                $predictions += @{
                                    component = "Disk: $($d.FriendlyName)"
                                    failureType = 'SSD Wear'
                                    probability = 'High'
                                    timeframe = '3-6 months'
                                    detail = "Wear level: $wearPct%. Plan for replacement."
                                    severity = 'critical'
                                }
                            } elseif ($wearPct -gt 75) {
                                $predictions += @{
                                    component = "Disk: $($d.FriendlyName)"
                                    failureType = 'SSD Wear'
                                    probability = 'Medium'
                                    timeframe = '6-12 months'
                                    detail = "Wear level: $wearPct%. Monitor closely."
                                    severity = 'warning'
                                }
                            }
                        }
                    } catch {}
                }
            } catch {}

            # BSOD frequency
            try {
                $bsodCount = (Get-WinEvent -FilterHashtable @{LogName='System'; Id=1001; StartTime=(Get-Date).AddDays(-30)} -ErrorAction SilentlyContinue).Count
                if ($bsodCount -gt 3) {
                    $predictions += @{
                        component = 'System Stability'
                        failureType = 'BSOD Escalation'
                        probability = 'High'
                        timeframe = 'Imminent'
                        detail = "$bsodCount BSODs in 30 days. Identify faulty driver or hardware."
                        severity = 'critical'
                    }
                } elseif ($bsodCount -gt 1) {
                    $predictions += @{
                        component = 'System Stability'
                        failureType = 'BSOD Pattern'
                        probability = 'Medium'
                        timeframe = '1-4 weeks'
                        detail = "$bsodCount BSODs in 30 days. Monitor and analyze minidumps."
                        severity = 'warning'
                    }
                }
            } catch {}

            # Disk free space trend
            if ($metrics.diskFreePercent -and $metrics.diskFreePercent -lt 15) {
                $predictions += @{
                    component = 'C: Drive'
                    failureType = 'Disk Full'
                    probability = 'High'
                    timeframe = '1-4 weeks'
                    detail = "Only $($metrics.diskFreePercent)% free. System will become unstable below 5%."
                    severity = if ($metrics.diskFreePercent -lt 8) { 'critical' } else { 'warning' }
                }
            }

            # Battery degradation
            try {
                $batteries = Get-CimInstance Win32_Battery -ErrorAction Stop
                if ($batteries) {
                    # We can't get full battery health without powercfg, but low charge is a sign
                    if ($batteries.EstimatedChargeRemaining -lt 50 -and $batteries.BatteryStatus -eq 1) {
                        $predictions += @{
                            component = 'Battery'
                            failureType = 'Battery Degradation'
                            probability = 'Medium'
                            timeframe = '6-12 months'
                            detail = "Battery discharging rapidly. May need replacement."
                            severity = 'info'
                        }
                    }
                }
            } catch {}

            $criticalPredictions = ($predictions | Where-Object { $_.severity -eq 'critical' }).Count
            $message = if ($predictions.Count -eq 0) {
                'No imminent failures predicted. System health is stable.'
            } else {
                "$($predictions.Count) prediction(s): $criticalPredictions critical risk(s) identified."
            }

            Write-JsonResult @{
                success = $true
                action = 'predict'
                predictions = $predictions
                count = $predictions.Count
                criticalCount = $criticalPredictions
                message = $message
            } (Get-TimerElapsedSec $timer)
        }

        'self-heal' {
            # AI Self-Healing: diagnose -> pick best recipe -> recommend execution
            $findings = @()
            foreach ($rule in $diagnosticRules) {
                try {
                    if (& $rule.check) {
                        $findings += $rule
                    }
                } catch {}
            }

            if ($findings.Count -eq 0) {
                Write-JsonResult @{
                    success = $true
                    action = 'self-heal'
                    healingNeeded = $false
                    message = 'No issues detected. Self-healing not needed.'
                } (Get-TimerElapsedSec $timer)
                return
            }

            # Prioritize: critical first, then by category
            $priorityOrder = @{ 'critical' = 0; 'warning' = 1; 'info' = 2 }
            $sortedFindings = $findings | Sort-Object { $priorityOrder[$_.severity] }
            $topIssue = $sortedFindings[0]

            # Map to repair recipe
            $recipeMap = @{
                'high-ram-usage' = 'pc-slow'
                'low-disk-space' = 'freshen-windows'
                'pending-updates' = 'windows-update-stuck'
                'bad-drivers' = $null
                'error-events' = 'blue-screen'
                'failing-disks' = 'disk-issues'
                'moderate-ram' = 'pc-slow'
                'pending-reboot' = $null
            }

            $recommendedRecipe = $recipeMap[$topIssue.id]

            Write-JsonResult @{
                success = $true
                action = 'self-heal'
                healingNeeded = $true
                topIssue = @{
                    id = $topIssue.id
                    diagnosis = $topIssue.diagnosis
                    severity = $topIssue.severity
                    category = $topIssue.category
                }
                recommendedRecipe = $recommendedRecipe
                recommendation = $topIssue.recommendation
                allIssues = ($sortedFindings | ForEach-Object { $_.id })
                message = if ($recommendedRecipe) {
                    "Self-heal analysis complete. Recommended action: run '$recommendedRecipe' repair recipe to address: $($topIssue.diagnosis.Split('.')[0])."
                } else {
                    "Self-heal analysis complete. Issue detected: $($topIssue.diagnosis.Split('.')[0]). No automated recipe available - manual intervention required."
                }
            } (Get-TimerElapsedSec $timer)
        }
    }
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
