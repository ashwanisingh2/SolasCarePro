$ErrorActionPreference = 'Stop'

try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem | Select-Object -First 1
    
    # 1. Edition
    $edition = $os.Caption
    
    # 2. Build
    $build = $os.BuildNumber
    
    # 3. Version (e.g. 23H2)
    $version = "Unknown"
    try {
        $version = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").DisplayVersion
        if (-not $version) {
            $version = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").ReleaseId
        }
    } catch {}

    # 4. Architecture
    $arch = $os.OSArchitecture
    
    # 5. Install Date
    $installDate = "Unknown"
    if ($os.InstallDate) {
        $installDate = $os.InstallDate.ToString("yyyy-MM-dd")
    }

    # 6. Last Boot Time
    $lastBootTime = "Unknown"
    if ($os.LastBootUpTime) {
        $lastBootTime = $os.LastBootUpTime.ToString("yyyy-MM-ddTHH:mm:ss")
    }

    # 7. Activation status & Expiry
    $activationStatus = "Unknown"
    $activationExpiry = "N/A"
    
    try {
        $license = Get-CimInstance -ClassName SoftwareLicensingProduct | Where-Object { $_.ApplicationID -eq '55c92734-d682-4d71-983e-d6ec3f16059f' -and $_.PartialProductKey -ne $null } | Select-Object -First 1
        if ($license) {
            if ($license.LicenseStatus -eq 1) { 
                $activationStatus = "Licensed" 
            } elseif ($license.LicenseStatus -eq 0) { 
                $activationStatus = "Unlicensed" 
            } elseif ($license.LicenseStatus -eq 5) { 
                $activationStatus = "Notification" 
            } else {
                $activationStatus = "Notification"
            }
        }
    } catch {}

    try {
        $slmgrXpr = cscript //nologo C:\Windows\System32\slmgr.vbs /xpr 2>&1
        $xprText = [string]::Join(" ", $slmgrXpr)
        if ($xprText -match "permanently activated") {
            $activationExpiry = "Permanent"
        } elseif ($xprText -match "will expire ([\d/\-\:\s\w]+)") {
            $activationExpiry = $Matches[1].Trim()
        } else {
            $activationExpiry = "Permanent"
        }
    } catch {
        if ($activationStatus -eq "Licensed") {
            $activationExpiry = "Permanent"
        }
    }

    # 8. Pending Updates
    $pendingUpdates = 0
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $searchResult = $updateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
        $pendingUpdates = $searchResult.Updates.Count
    } catch {}

    # 9. Last Update Date
    $lastUpdateDate = "N/A"
    try {
        $updateSession = New-Object -ComObject Microsoft.Update.Session
        $updateSearcher = $updateSession.CreateUpdateSearcher()
        $historyCount = $updateSearcher.GetTotalHistoryCount()
        if ($historyCount -gt 0) {
            $history = $updateSearcher.QueryHistory(0, 1)
            foreach ($h in $history) {
                $lastUpdateDate = $h.Date.ToString("yyyy-MM-dd")
            }
        }
    } catch {}

    $output = @{
        Edition = $edition
        Build = $build
        Version = $version
        Architecture = $arch
        InstallDate = $installDate
        LastBootTime = $lastBootTime
        ActivationStatus = $activationStatus
        ActivationExpiry = $activationExpiry
        PendingUpdates = $pendingUpdates
        LastUpdateDate = $lastUpdateDate
    }

    Write-Output (ConvertTo-Json $output -Compress)

} catch {
    $errObj = @{
        error = $_.Exception.Message
    }
    Write-Output (ConvertTo-Json $errObj -Compress)
}
