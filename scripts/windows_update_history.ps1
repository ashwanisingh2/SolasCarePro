# windows_update_history.ps1
# Returns the last N Windows Update installations with status (Succeeded/Failed/Aborted),
# HResult, KB article URL, and category. NEW - no equivalent existed (only pending scan did).
. (Join-Path $PSScriptRoot '_common.ps1')

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

try {
    $session  = New-Object -ComObject Microsoft.Update.Session
    $searcher = $session.CreateUpdateSearcher()
    $count = $searcher.GetTotalHistoryCount()
    $take  = [math]::Min(50, $count)

    if ($take -eq 0) {
        Write-JsonResult @{ data = @(); totalCount = 0 } (Get-TimerElapsedSec $timer)
        exit 0
    }

    $history = $searcher.QueryHistory(0, $take)
    $result = foreach ($h in $history) {
        $status = switch ($h.ResultCode) {
            1 { 'InProgress' }
            2 { 'Succeeded' }
            3 { 'SucceededWithErrors' }
            4 { 'Failed' }
            5 { 'Aborted' }
            default { 'Unknown' }
        }
        $kbUrl = $null
        if ($h.Title -match 'KB(\d+)') {
            $kbUrl = "https://support.microsoft.com/help/$($Matches[1])"
        }
        [PSCustomObject]@{
            Date     = $h.Date.ToString('yyyy-MM-dd HH:mm:ss')
            Title    = $h.Title
            Status   = $status
            HResult  = ('0x{0:X8}' -f $h.HResult)
            KbUrl    = $kbUrl
            Category = ($h.Categories | Select-Object -ExpandProperty Name -First 1)
        }
    }
    Write-JsonResult @{ data = @($result); totalCount = $count } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; error = $_.Exception.Message; data = @() } (Get-TimerElapsedSec $timer)
}
