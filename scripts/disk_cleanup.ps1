# disk_cleanup.ps1
# Runs Windows Disk Cleanup (cleanmgr.exe) in unattended mode using a pre-configured
# sageset profile. NEW - junk_cleanup.ps1 only handles temp/junk files, not the full
# cleanmgr suite (Windows Update cache, delivery optimization, old OS files, etc.).
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidateSet('quick', 'deep', 'system')]
    [string]$Mode = 'quick'
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

# cleanmgr sageset stateful registry approach: sageset:n writes the selected
# categories to registry, sagerun:n runs cleanup with those settings.
# We use StateFlags0064 (n=100) for our preset.
$cleanupKey = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches'

# Categories to clean - matching cleanmgr's checkbox names.
$quickCategories = @(
    'Temporary Files', 'Temporary Setup Files', 'Old Setup Files',
    'Recycle Bin', 'Thumbnail Cache', 'Delivery Optimization Files'
)
$deepCategories = $quickCategories + @(
    'Windows Error Reporting Files', 'Windows Upgrade Log Files',
    'Language Pack', 'Previous Installations', 'Update Cleanup',
    'Device Driver Packages', 'Windows Defender'
)
$systemCategories = $deepCategories + @(
    'Windows ESD installation files', 'BranchCache', 'User history files',
    'System error memory dump files', 'System error minidump files',
    'Per user queued Windows Error Reporting Files',
    'Queued Windows Error Reporting Files'
)

$categories = switch ($Mode) {
    'quick'  { $quickCategories }
    'deep'   { $deepCategories }
    'system' { $systemCategories }
}

try {
    # Configure sageset: write StateFlags0064=2 (enabled) for selected categories,
    # =0 (disabled) for the rest.
    if (Test-Path $cleanupKey) {
        Get-ChildItem $cleanupKey | ForEach-Object {
            $name = $_.PSChildName
            $value = if ($categories -contains $name) { 2 } else { 0 }
            try {
                Set-ItemProperty -Path $_.PSPath -Name 'StateFlags0064' -Value $value -Type DWord -ErrorAction SilentlyContinue
            } catch {}
        }
    }

    # Run cleanmgr with sagerun:100 (10 min timeout; can take a while for deep/system).
    $timeout = switch ($Mode) { 'quick' { 300 } 'deep' { 900 } 'system' { 1800 } }
    $r = Invoke-WithTimeout -FilePath 'cleanmgr.exe' -ArgumentList '/sagerun:100' -TimeoutSec $timeout

    Write-JsonResult @{
        success = ($r.ExitCode -eq 0)
        mode = $Mode
        categoriesConfigured = $categories.Count
        exitCode = $r.ExitCode
        message = "Disk cleanup ($Mode mode) completed."
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; mode = $Mode; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
