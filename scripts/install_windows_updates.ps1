# Fix: $ErrorActionPreference = 'SilentlyContinue' defeats the try/catch below
# (non-terminating errors from COM cmdlets don't trigger the catch block).
# Use 'Stop' so any failure surfaces in catch, and emit a JSON status object
# at the end so the app's stdout parser has a structured result.
$ErrorActionPreference = 'Stop'
try {
    $UpdateSession = New-Object -ComObject Microsoft.Update.Session
    $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()

    $SearchResult = $UpdateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
    $Updates = $SearchResult.Updates

    if (-not $Updates -or $Updates.Count -eq 0) {
        Write-Output '{"success":true,"installedCount":0,"rebootRequired":false,"message":"No updates pending."}'
        exit 0
    }

    $UpdateCollection = New-Object -ComObject Microsoft.Update.UpdateColl
    foreach ($Update in $Updates) {
        $UpdateCollection.Add($Update) | Out-Null
    }

    $Downloader = $UpdateSession.CreateUpdateDownloader()
    $Downloader.Updates = $UpdateCollection
    $Downloader.Download()

    $Installer = $UpdateSession.CreateUpdateInstaller()
    $Installer.Updates = $UpdateCollection
    $InstallationResult = $Installer.Install()

    $result = @{
        success = $true
        installedCount = $Updates.Count
        resultCode = $InstallationResult.ResultCode
        rebootRequired = [bool]$InstallationResult.RebootRequired
    }
    Write-Output ($result | ConvertTo-Json -Compress)
} catch {
    $err = @{ success = $false; error = $_.Exception.Message }
    Write-Output ($err | ConvertTo-Json -Compress)
}
