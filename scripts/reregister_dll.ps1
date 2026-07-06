# reregister_dll.ps1
# Re-register Windows DLLs via regsvr32. NEW - no equivalent existed.
# Supports two modes:
#   -Action reregister -DllPath "C:\Windows\System32\vbscript.dll"
#   -Action common    (re-registers a curated list of common Windows DLLs)
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('reregister', 'common')]
    [string]$Action = 'common',

    [string]$DllPath
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

# Curated list of commonly-problematic Windows DLLs that benefit from re-registration
# when COM/ActiveX errors, broken file associations, or shell issues occur.
$commonDlls = @(
    'vbscript.dll',
    'jscript.dll',
    'mshtml.dll',
    'shdocvw.dll',
    'shell32.dll',
    'actxprxy.dll',
    'msxml3.dll',
    'msxml6.dll',
    'oleaut32.dll',
    'activeds.dll',
    'wscript.exe'
)

function Invoke-Regsvr32 {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        return @{ dll = $Path; success = $false; error = 'File not found' }
    }
    try {
        $r = Invoke-WithTimeout -FilePath 'regsvr32.exe' -ArgumentList "/s `"$Path`"" -TimeoutSec 30
        return @{ dll = $Path; success = ($r.ExitCode -eq 0); exitCode = $r.ExitCode; stderr = $r.StdErr }
    } catch {
        return @{ dll = $Path; success = $false; error = $_.Exception.Message }
    }
}

try {
    $results = @()

    if ($Action -eq 'reregister') {
        if (-not $DllPath) { throw 'DllPath is required for reregister action' }
        # Security: only allow DLLs in System32, SysWOW64, or under Program Files.
        $resolved = (Resolve-Path $DllPath -ErrorAction Stop).Path
        $allowedRoots = @(
            "$env:SystemRoot\System32",
            "$env:SystemRoot\SysWOW64",
            "$env:ProgramFiles",
            ${env:ProgramFiles(x86)}
        ) | Where-Object { $_ }
        $allowed = $false
        foreach ($root in $allowedRoots) {
            if ($resolved -like "$root\*") { $allowed = $true; break }
        }
        if (-not $allowed) {
            throw "Security: DLL must reside in System32, SysWOW64, or Program Files. Refused: $resolved"
        }
        $results += (Invoke-Regsvr32 $resolved)
    }
    elseif ($Action -eq 'common') {
        foreach ($dll in $commonDlls) {
            $sysPath = Join-Path "$env:SystemRoot\System32" $dll
            $results += (Invoke-Regsvr32 $sysPath)
        }
    }

    $successCount = ($results | Where-Object { $_.success }).Count
    $failCount = $results.Count - $successCount

    Write-JsonResult @{
        success = ($failCount -eq 0)
        action = $Action
        results = $results
        successCount = $successCount
        failureCount = $failCount
        message = "Re-registered $successCount of $($results.Count) DLLs."
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; action = $Action; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
