[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('chrome', 'firefox', 'edge', 'brave', 'opera', 'all')]
    [string]$Browser,

    [Parameter(Mandatory=$true)]
    [ValidateSet('reset-cache', 'reset-full', 'detect')]
    [string]$Action
)

$ErrorActionPreference = 'SilentlyContinue'

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

$operaCache = "$env:LOCALAPPDATA\Opera Software\Opera Stable\Cache"
$operaFull = @(
    "$env:LOCALAPPDATA\Opera Software\Opera Stable\Cache",
    "$env:LOCALAPPDATA\Opera Software\Opera Stable\Network\Cookies",
    "$env:LOCALAPPDATA\Opera Software\Opera Stable\Network\Cookies-journal",
    "$env:LOCALAPPDATA\Opera Software\Opera Stable\History",
    "$env:LOCALAPPDATA\Opera Software\Opera Stable\History-journal",
    "$env:LOCALAPPDATA\Opera Software\Opera Stable\Local Storage"
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
    # 1. Standard Filesystem path check
    $paths = @()
    if ($name -eq 'chrome') {
        $paths = @(
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
        )
    } elseif ($name -eq 'firefox') {
        $paths = @(
            "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
            "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
        )
    } elseif ($name -eq 'edge') {
        $paths = @(
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
        )
    } elseif ($name -eq 'brave') {
        $paths = @(
            "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
            "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
            "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
        )
    } elseif ($name -eq 'opera') {
        $paths = @(
            "$env:ProgramFiles\Opera\opera.exe",
            "${env:ProgramFiles(x86)}\Opera\opera.exe",
            "$env:LOCALAPPDATA\Programs\Opera\opera.exe",
            "$env:LOCALAPPDATA\Programs\Opera Developer\opera.exe"
        )
    }

    foreach ($p in $paths) {
        if (Test-Path $p) { return $true }
    }

    # 2. Windows StartMenuInternet registration check
    $regRoots = @("HKLM:\SOFTWARE\Clients\StartMenuInternet", "HKCU:\SOFTWARE\Clients\StartMenuInternet")
    foreach ($root in $regRoots) {
        if (Test-Path $root) {
            $subkeys = Get-ChildItem -Path $root -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
            foreach ($sk in $subkeys) {
                if ($name -eq 'chrome' -and $sk -match "Chrome") { return $true }
                if ($name -eq 'firefox' -and $sk -match "Firefox") { return $true }
                if ($name -eq 'edge' -and $sk -match "MSEdge") { return $true }
                if ($name -eq 'brave' -and $sk -match "Brave") { return $true }
                if ($name -eq 'opera' -and $sk -match "Opera") { return $true }
            }
        }
    }

    # 3. App Paths Registry checks
    $appPathsKey = "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
    $exeName = switch ($name) {
        'chrome'  { "chrome.exe" }
        'firefox' { "firefox.exe" }
        'edge'    { "msedge.exe" }
        'brave'   { "brave.exe" }
        'opera'   { "opera.exe" }
    }
    
    if ($exeName) {
        foreach ($hive in @("HKLM", "HKCU")) {
            $pathToCheck = "$($hive):\$appPathsKey\$exeName"
            if (Test-Path $pathToCheck) {
                return $true
            }
        }
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
    if ($name -eq 'opera') { $procNames += 'opera' }
    if ($name -eq 'all') { $procNames += @('chrome', 'firefox', 'msedge', 'brave', 'opera') }

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
        opera = Test-BrowserInstalled 'opera'
    }
    Write-Output (ConvertTo-Json $status -Compress)
}
else {
    $selectedBrowsers = @()
    if ($Browser -eq 'all') {
        $selectedBrowsers += @('chrome', 'firefox', 'edge', 'brave', 'opera')
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
            elseif ($b -eq 'opera') { $targetPaths += $operaCache }
            elseif ($b -eq 'firefox') { $targetPaths += Get-FirefoxCachePaths }
        } else {
            Kill-BrowserProcess $b
            if ($b -eq 'chrome') { $targetPaths += $chromeFull }
            elseif ($b -eq 'edge') { $targetPaths += $edgeFull }
            elseif ($b -eq 'brave') { $targetPaths += $braveFull }
            elseif ($b -eq 'opera') { $targetPaths += $operaFull }
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
