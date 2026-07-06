# disk_benchmark.ps1
# Disk speed benchmark using winsat (built into Windows). NEW - no equivalent existed.
# Runs sequential read/write tests and returns MB/s scores.
. (Join-Path $PSScriptRoot '_common.ps1')

param(
    [ValidatePattern('^[A-Za-z]$')]
    [string]$Drive = 'C'
)

$ErrorActionPreference = 'Stop'
$timer = Start-Timer

Assert-Admin

try {
    $Drive = $Drive.ToUpper()

    # winsat disk -seq -read -drive C  -> sequential read speed
    # winsat disk -seq -write -drive C -> sequential write speed (requires admin)
    # winsat disk -ran -read -drive C  -> random read speed
    # Results are stored in C:\Windows\Performance\WinSAT\DataStore\*.xml
    # We parse the most recent Formal.Assessment XML for the scores.

    # Run winsat disk assessment (sequential read - fastest, ~30 seconds)
    $r = Invoke-WithTimeout -FilePath 'winsat.exe' -ArgumentList "disk -seq -read -drive $Drive" -TimeoutSec 120

    # Also run sequential write
    $r2 = Invoke-WithTimeout -FilePath 'winsat.exe' -ArgumentList "disk -seq -write -drive $Drive" -TimeoutSec 120

    # Parse the latest WinSAT assessment XML for disk scores
    $satDir = "$env:SystemRoot\Performance\WinSAT\DataStore"
    $latestAssessment = Get-ChildItem $satDir -Filter 'Formal.Assessment.*.WinSAT.xml' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    $seqReadMBps = $null
    $seqWriteMBps = $null
    $ranReadMBps = $null

    if ($latestAssessment) {
        try {
            [xml]$xml = Get-Content $latestAssessment.FullName -ErrorAction Stop
            $diskMetrics = $xml.WinSAT.Metrics.DiskMetrics
            if ($diskMetrics) {
                $seqReadMBps = [math]::Round([double]$diskMetrics.SequentialRead.Metric, 2)
                $seqWriteMBps = [math]::Round([double]$diskMetrics.SequentialWrite.Metric, 2)
                $ranReadMBps = [math]::Round([double]$diskMetrics.RandomRead.Metric, 2)
            }
        } catch {}
    }

    # Determine drive type for context
    $mediaType = 'Unknown'
    try {
        $partition = Get-Partition -DriveLetter $Drive -ErrorAction Stop
        $phys = Get-PhysicalDisk -DeviceID $partition.DiskNumber -ErrorAction Stop
        if ($phys) { $mediaType = $phys.MediaType.ToString() }
    } catch {}

    # Score interpretation (rough thresholds)
    $rating = if ($seqReadMBps -ge 3000) { 'Excellent (NVMe SSD)' }
              elseif ($seqReadMBps -ge 500) { 'Good (SATA SSD)' }
              elseif ($seqReadMBps -ge 100) { 'Fair (HDD)' }
              elseif ($seqReadMBps -gt 0) { 'Poor' }
              else { 'Unknown' }

    Write-JsonResult @{
        success = ($r.ExitCode -eq 0)
        drive = "${Drive}:"
        mediaType = $mediaType
        sequentialReadMBps = $seqReadMBps
        sequentialWriteMBps = $seqWriteMBps
        randomReadMBps = $ranReadMBps
        rating = $rating
        message = "Disk benchmark completed for ${Drive}: $rating"
    } (Get-TimerElapsedSec $timer)
} catch {
    Write-JsonResult @{ success = $false; drive = "${Drive}:"; error = $_.Exception.Message } (Get-TimerElapsedSec $timer)
}
