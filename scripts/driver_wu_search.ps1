# driver_wu_search.ps1
# Search Windows Update for pending driver updates (spec TASK 6).
# Uses Microsoft.Update.Session COM object - native Windows API only.
param(
    [ValidateSet('search','download','install')]
    [string]$Action = 'search',
    [string]$UpdateId    # For download/install
)
$ErrorActionPreference = 'Stop'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $Action) { $Action = 'search' }

switch ($Action) {
    'search' {
        try {
            Write-Output "[WU] Searching Windows Update for pending driver updates..."
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            $searcher.Online = $true
            $result = $searcher.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")

            $updates = @()
            foreach ($u in $result.Updates) {
                $kbIds = @()
                if ($u.KBArticleIDs) {
                    foreach ($kb in $u.KBArticleIDs) { $kbIds += [string]$kb }
                }
                $updates += [PSCustomObject]@{
                    Title              = $u.Title
                    Description        = $u.Description
                    DriverClass        = $u.DriverClass
                    DriverHardwareID   = $u.DriverHardwareID
                    DriverManufacturer = $u.DriverManufacturer
                    DriverModel        = $u.DriverModel
                    DriverProvider     = $u.DriverProvider
                    DriverVerDate      = if ($u.DriverVerDate) { $u.DriverVerDate.ToString('o') } else { '' }
                    DriverVerVersion   = "$($u.DriverVerVersion)"
                    KBArticleIDs       = $kbIds
                    SizeBytes          = $u.MaxDownloadSize
                    UpdateId           = $u.Identity.UpdateID
                    RevisionNumber     = $u.Identity.RevisionNumber
                }
            }
            $resultObj = [PSCustomObject]@{
                success      = $true
                count        = $updates.Count
                updates      = $updates
                searchedAt   = (Get-Date).ToString('o')
            }
            Write-Output ($resultObj | ConvertTo-Json -Depth 5 -Compress)
            Write-AuditLog -Action 'driver-wu-search' -Result 'success' -Details "Found $($updates.Count) pending driver updates"
        } catch {
            $resultObj = [PSCustomObject]@{
                success = $false
                error   = $_.Exception.Message
                count   = 0
                updates = @()
            }
            Write-Output ($resultObj | ConvertTo-Json -Compress)
            Write-AuditLog -Action 'driver-wu-search' -Result 'failure' -Details $_.Exception.Message
        }
    }

    'download' {
        if (-not $UpdateId) {
            Write-Output '{\"success\":false,\"error\":\"UpdateId required for download\"}'
            exit 1
        }
        try {
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            $result = $searcher.Search("IsInstalled=0 and Type='Driver'")
            $target = $null
            foreach ($u in $result.Updates) {
                if ($u.Identity.UpdateID -eq $UpdateId) { $target = $u; break }
            }
            if (-not $target) {
                Write-Output '{\"success\":false,\"error\":\"Update not found\"}'
                exit 1
            }
            if (-not $target.IsDownloaded) {
                $coll = New-Object -ComObject Microsoft.Update.UpdateColl
                $coll.Add($target) | Out-Null
                $dl = $session.CreateUpdateDownloader()
                $dl.Updates = $coll
                $dl.Download() | Out-Null
            }
            Write-Output "{`"success`":true,`"updateId`":`"$UpdateId`",`"downloaded`":true}"
        } catch {
            Write-Output "{`"success`":false,`"error`":`"$($_.Exception.Message)`"}"
        }
    }

    'install' {
        if (-not $UpdateId) {
            Write-Output '{\"success\":false,\"error\":\"UpdateId required for install\"}'
            exit 1
        }
        try {
            $session = New-Object -ComObject Microsoft.Update.Session
            $searcher = $session.CreateUpdateSearcher()
            $result = $searcher.Search("IsInstalled=0 and Type='Driver'")
            $target = $null
            foreach ($u in $result.Updates) {
                if ($u.Identity.UpdateID -eq $UpdateId) { $target = $u; break }
            }
            if (-not $target) {
                Write-Output '{\"success\":false,\"error\":\"Update not found\"}'
                exit 1
            }
            if (-not $target.IsDownloaded) {
                $coll = New-Object -ComObject Microsoft.Update.UpdateColl
                $coll.Add($target) | Out-Null
                $dl = $session.CreateUpdateDownloader()
                $dl.Updates = $coll
                $dl.Download() | Out-Null
            }
            if ($target.EulaAccepted -eq $false) { $target.AcceptEula() }
            $coll = New-Object -ComObject Microsoft.Update.UpdateColl
            $coll.Add($target) | Out-Null
            $inst = $session.CreateUpdateInstaller()
            $inst.Updates = $coll
            $res = $inst.Install()
            # ResultCode: 2=Succeeded, 3=SucceededWithErrors, 4=Failed, 5=Aborted
            $success = ($res.ResultCode -eq 2 -or $res.ResultCode -eq 3)
            $reboot = $res.RebootRequired
            $resultObj = [PSCustomObject]@{
                success        = $success
                resultCode     = $res.ResultCode
                rebootRequired = $reboot
                updateId       = $UpdateId
                installedAt    = (Get-Date).ToString('o')
            }
            Write-Output ($resultObj | ConvertTo-Json -Compress)
            Write-AuditLog -Action 'driver-wu-install' -Result $(if ($success) {'success'} else {'failure'}) -Target $UpdateId -Details "ResultCode=$($res.ResultCode), Reboot=$reboot"
        } catch {
            Write-Output "{`"success`":false,`"error`":`"$($_.Exception.Message)`"}"
            Write-AuditLog -Action 'driver-wu-install' -Result 'failure' -Target $UpdateId -Details $_.Exception.Message
        }
    }

    default {
        Write-Output "{`"success`":false,`"error`":`"Unknown action: $Action`"}"
    }
}
