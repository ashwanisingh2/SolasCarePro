$ErrorActionPreference = 'SilentlyContinue'
try {
    Write-Output "Initializing Windows Update Session..."
    $UpdateSession = New-Object -ComObject Microsoft.Update.Session
    $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
    
    Write-Output "Searching for pending updates..."
    $SearchResult = $UpdateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
    $Updates = $SearchResult.Updates
    
    if (-not $Updates -or $Updates.Count -eq 0) {
        Write-Output "No updates pending."
        exit 0
    }
    
    Write-Output "Found $($Updates.Count) pending updates. Preparing download..."
    $UpdateCollection = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($Update in $Updates) {
        $UpdateCollection.Add($Update) | Out-Null
    }
    
    $Downloader = $UpdateSession.CreateUpdateDownloader()
    $Downloader.Updates = $UpdateCollection
    $Downloader.Download()
    Write-Output "Download complete. Starting installation..."
    
    $Installer = $UpdateSession.CreateUpdateInstaller()
    $Installer.Updates = $UpdateCollection
    $InstallationResult = $Installer.Install()
    
    Write-Output "Installation complete. Result Code: $($InstallationResult.ResultCode)"
    Write-Output "Reboot Required: $($InstallationResult.RebootRequired)"
} catch {
    Write-Output "ERROR: Failed to process Windows Updates: $($_.Exception.Message)"
}
