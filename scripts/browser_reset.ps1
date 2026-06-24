[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('chrome', 'firefox', 'edge', 'brave', 'all')]
    [string]$Browser,

    [Parameter(Mandatory=$true)]
    [ValidateSet('reset-cache', 'reset-full', 'detect')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

$chromeCache = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"
$chromeFull = @(
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Network\Cookies",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Network\Cookies-journal",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\History",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\History-journal",
    "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Local Storage"
)

$edgeCache = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"
$edgeFull = @(
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Network\Cookies",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Network\Cookies-journal",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\History",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\History-journal",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Local Storage"
)

$braveCache = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Cache"
$braveFull = @(
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Cache",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Network\Cookies",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Network\Cookies-journal",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\History",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\History-journal",
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data\Default\Local Storage"
)

function Get-FirefoxCachePaths {
    $profilesDir = "$env:APPDATA\Mozilla\Firefox\Profiles"
    if (Test-Path $profilesDir) {
        return Get-ChildItem -Path $profilesDir -Directory | ForEach-Object { Join-Path $_.FullName "cache2" }
    }
    return @()
}

function Get-FirefoxFullPaths {
    $profilesDir = "$env:APPDATA\Mozilla\Firefox\Profiles"
    $paths = @()
    if (Test-Path $profilesDir) {
        $dirs = Get-ChildItem -Path $profilesDir -Directory
        foreach ($d in $dirs) {
            $paths += Join-Path $d.FullName "cache2"
            $paths += Join-Path $d.FullName "cookies.sqlite"
            $paths += Join-Path $d.FullName "places.sqlite"
            $paths += Join-Path $d.FullName "webappsstore.sqlite"
            $paths += Join-Path $d.FullName "storage"
        }
    }
    return $paths
}

function Test-BrowserInstalled ($name) {
    if ($name -eq 'chrome') {
        return (Test-Path "$env:ProgramFiles\Google\Chrome\Application\chrome.exe") -or 
               (Test-Path "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe") -or
               (Test-Path "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
    }
    if ($name -eq 'firefox') {
        return (Test-Path "$env:ProgramFiles\Mozilla Firefox\firefox.exe") -or 
               (Test-Path "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe")
    }
    if ($name -eq 'edge') {
        return (Test-Path "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") -or 
               (Test-Path "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe")
    }
    if ($name -eq 'brave') {
        return (Test-Path "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe") -or 
               (Test-Path "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe") -or
               (Test-Path "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe")
    }
    return $false
}

function Get-PathSizeMB ($paths) {
    $total = 0
    foreach ($p in $paths) {
        if (Test-Path $p) {
            if ((Get-Item $p).PSIsContainer) {
                $subFiles = Get-ChildItem -Path $p -Recurse -File -ErrorAction SilentlyContinue
                if ($subFiles) {
                    $total += ($subFiles | Measure-Object -Property Length -Sum).Sum
                }
            } else {
                $total += (Get-Item $p).Length
            }
        }
    }
    return [math]::Round($total / (1024*1024), 2)
}

function Remove-BrowserPath ($paths) {
    foreach ($p in $paths) {
        if (Test-Path $p) {
            try {
                if ((Get-Item $p).PSIsContainer) {
                    Remove-Item "$p\*" -Recurse -Force -ErrorAction SilentlyContinue
                } else {
                    Remove-Item $p -Force -ErrorAction SilentlyContinue
                }
            } catch {}
        }
    }
}

function Kill-BrowserProcess ($name) {
    $procNames = @()
    if ($name -eq 'chrome') { $procNames += 'chrome' }
    if ($name -eq 'firefox') { $procNames += 'firefox' }
    if ($name -eq 'edge') { $procNames += 'msedge' }
    if ($name -eq 'brave') { $procNames += 'brave' }
    if ($name -eq 'all') { $procNames += @('chrome', 'firefox', 'msedge', 'brave') }

    foreach ($pn in $procNames) {
        Stop-Process -Name $pn -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

if ($Action -eq 'detect') {
    $status = @{
        chrome = Test-BrowserInstalled 'chrome'
        firefox = Test-BrowserInstalled 'firefox'
        edge = Test-BrowserInstalled 'edge'
        brave = Test-BrowserInstalled 'brave'
    }
    Write-Output (ConvertTo-Json $status -Compress)
}
else {
    $selectedBrowsers = @()
    if ($Browser -eq 'all') {
        $selectedBrowsers += @('chrome', 'firefox', 'edge', 'brave')
    } else {
        $selectedBrowsers += $Browser
    }

    $totalFreed = 0
    $results = @()

    foreach ($b in $selectedBrowsers) {
        if (-not (Test-BrowserInstalled $b)) {
            continue
        }

        $targetPaths = @()
        if ($Action -eq 'reset-cache') {
            if ($b -eq 'chrome') { $targetPaths += $chromeCache }
            elseif ($b -eq 'edge') { $targetPaths += $edgeCache }
            elseif ($b -eq 'brave') { $targetPaths += $braveCache }
            elseif ($b -eq 'firefox') { $targetPaths += Get-FirefoxCachePaths }
        } else {
            Kill-BrowserProcess $b
            if ($b -eq 'chrome') { $targetPaths += $chromeFull }
            elseif ($b -eq 'edge') { $targetPaths += $edgeFull }
            elseif ($b -eq 'brave') { $targetPaths += $braveFull }
            elseif ($b -eq 'firefox') { $targetPaths += Get-FirefoxFullPaths }
        }

        $sizeMB = Get-PathSizeMB $targetPaths
        Remove-BrowserPath $targetPaths
        
        $totalFreed += $sizeMB
        $results += @{
            browser = $b
            success = $true
            freedSpaceMB = $sizeMB
        }
    }

    $finalOutput = @{
        browser = $Browser
        success = $true
        freedSpaceMB = $totalFreed
        details = $results
    }
    Write-Output (ConvertTo-Json $finalOutput -Compress)
}
