# schedule_care.ps1
param (
    [string]$Day = "Sunday",
    [string]$Time = "03:00"
)

$ErrorActionPreference = 'Stop'
$taskName = "SolasSystemCarePro_WeeklyCare"
$scriptPath = Join-Path $PSScriptRoot "iobit_one_click_care.ps1"

if (-not (Test-Path $scriptPath)) {
    Write-Error "Could not find iobit_one_click_care.ps1 at path: $scriptPath"
    exit 1
}

# Delete existing task first
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $Time
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Description "Weekly automated Solas System Care maintenance task." -Force

# Verify task creation via schtasks XML
$xml = schtasks /Query /TN $taskName /XML
if ($xml -match "<RunLevel>HighestAvailable</RunLevel>") {
    Write-Output "Successfully scheduled weekly care task on $Day at $Time with SYSTEM HighestAvailable privileges."
} else {
    Write-Warning "Task registered, but failed to verify HighestAvailable runlevel in schtasks XML."
}
