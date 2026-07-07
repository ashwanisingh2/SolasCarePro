# check_task_status.ps1
$ErrorActionPreference = 'SilentlyContinue'
$taskName = "SolasSystemCarePro_WeeklyCare"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    $info = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
    
    # Verify XML structure
    $xml = ""
    try {
        $xml = schtasks /Query /TN $taskName /XML
    } catch {}

    $hasHighest = $false
    if ($xml -match "<RunLevel>HighestAvailable</RunLevel>") {
        $hasHighest = $true
    }

    @{
        Registered      = $true
        State           = $task.State.ToString()
        LastRunTime     = if ($info.LastRunTime -and $info.LastRunTime -ne [datetime]::MinValue -and $info.LastRunTime.Year -gt 1601) { $info.LastRunTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "N/A" }
        LastTaskResult  = $info.LastTaskResult
        HighestPrivilege= $hasHighest
    } | ConvertTo-Json -Compress
} else {
    @{ Registered = $false } | ConvertTo-Json -Compress
}
