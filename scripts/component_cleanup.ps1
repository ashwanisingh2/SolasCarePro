[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('analyze', 'cleanup')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

if ($Action -eq 'analyze') {
    try {
        $dismOut = DISM /Online /Cleanup-Image /AnalyzeComponentStore
        $text = [string]::Join("`r`n", $dismOut)

        $totalSizeGB = 0.0
        if ($text -match "(?i)(Component Store Size|Actual Size of Component Store)\s*:\s*([\d\.]+)\s*(GB|MB)") {
            $val = [double]$Matches[2]
            $unit = $Matches[3].ToUpper()
            if ($unit -eq 'MB') {
                $totalSizeGB = [math]::Round($val / 1024, 2)
            } else {
                $totalSizeGB = $val
            }
        }

        $reclaimableGB = 0.0
        if ($text -match "(?i)Reclaimable\s*Space\s*:\s*([\d\.]+)\s*(GB|MB)") {
            $val = [double]$Matches[1]
            $unit = $Matches[2].ToUpper()
            if ($unit -eq 'MB') {
                $reclaimableGB = [math]::Round($val / 1024, 2)
            } else {
                $reclaimableGB = $val
            }
        } elseif ($text -match "(?i)Number of Reclaimable Packages\s*:\s*(\d+)") {
            $pkgCount = [int]$Matches[1]
            if ($pkgCount -gt 0) {
                $reclaimableGB = [math]::Round($pkgCount * 0.4, 2)
            }
        }

        $lastCleanupDate = "Unknown"
        if ($text -match "(?i)Date of Last Cleanup\s*:\s*([^\r\n]+)") {
            $lastCleanupDate = $Matches[1].Trim()
        }

        $output = @{
            totalSizeGB = $totalSizeGB
            reclaimableGB = $reclaimableGB
            lastCleanupDate = $lastCleanupDate
        }

        Write-Output (ConvertTo-Json $output -Compress)
    } catch {
        $err = @{
            totalSizeGB = 0.0
            reclaimableGB = 0.0
            lastCleanupDate = "Error: $($_.Exception.Message)"
        }
        Write-Output (ConvertTo-Json $err -Compress)
    }
}
elseif ($Action -eq 'cleanup') {
    try {
        Write-Output "[SYSTEM] Starting component store deep cleanup..."
        Write-Output "[SYSTEM] Warning: This operation removes superseded packages permanently and cannot be undone."
        
        $driveBefore = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='C:'"
        $freeBefore = $driveBefore.FreeSpace

        DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase
        
        $driveAfter = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='C:'"
        $freeAfter = $driveAfter.FreeSpace

        $freedBytes = $freeAfter - $freeBefore
        $freedGB = 0.0
        if ($freedBytes -gt 0) {
            $freedGB = [math]::Round($freedBytes / (1024*1024*1024), 2)
        }

        $output = @{
            success = $true
            freedSpaceGB = $freedGB
        }
        Write-Output (ConvertTo-Json $output -Compress)
    } catch {
        $err = @{
            success = $false
            freedSpaceGB = 0.0
            error = $_.Exception.Message
        }
        Write-Output (ConvertTo-Json $err -Compress)
    }
}
