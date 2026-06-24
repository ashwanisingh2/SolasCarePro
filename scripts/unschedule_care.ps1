# unschedule_care.ps1
$ErrorActionPreference = 'Stop'
$taskName = "SolasSystemCarePro_WeeklyCare"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Successfully removed scheduled care task."
} else {
    Write-Output "No scheduled care task found to remove."
}
