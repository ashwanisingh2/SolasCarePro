# cpu_stress_test.ps1
# Runs a CPU stress test for the specified duration by spawning parallel CPU-bound jobs.
# No third-party tools - uses native PowerShell runspace math operations.
param(
    [int]$DurationSec = 30,
    [int]$Cores = 0   # 0 = auto-detect (use all logical cores)
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if ($DurationSec -lt 1 -or $DurationSec -gt 600) {
    Write-JsonError 'DurationSec must be between 1 and 600' 'cpu_stress_test'
    exit 1
}

if ($Cores -le 0) {
    $Cores = [Environment]::ProcessorCount
}
if ($Cores -gt [Environment]::ProcessorCount) {
    $Cores = [Environment]::ProcessorCount
}

Write-Output "[STRESS] Starting CPU stress test: $DurationSec seconds on $Cores cores."
Write-AuditLog -Action 'cpu-stress-test' -Result 'started' -Details "Duration=${DurationSec}s, Cores=$Cores"

$endTime = (Get-Date).AddSeconds($DurationSec)
$jobs = @()

# Each job runs a tight math loop - pure CPU bound, no I/O.
$scriptBlock = {
    param($EndTime)
    $iterations = 0
    $x = 1.0001
    while ((Get-Date) -lt $EndTime) {
        for ($i = 0; $i -lt 100000; $i++) {
            $x = $x * 1.0000001
            if ($x -gt 1e10) { $x = 1.0001 }
        }
        $iterations++
    }
    return $iterations
}

try {
    # Spawn $Cores background jobs
    for ($i = 0; $i -lt $Cores; $i++) {
        $jobs += Start-Job -ScriptBlock $scriptBlock -ArgumentList $endTime
    }

    # Stream progress every 5 seconds
    while ((Get-Date) -lt $endTime) {
        $remaining = [math]::Ceiling(($endTime - (Get-Date)).TotalSeconds)
        Write-Output "[STRESS] $remaining seconds remaining... Active jobs: $($jobs.Count)"
        Start-Sleep -Seconds 5
    }

    # Wait for jobs to finish
    $jobs | Wait-Job -Timeout 10 | Out-Null
    $jobs | Stop-Job -ErrorAction SilentlyContinue
    $results = $jobs | Receive-Job -ErrorAction SilentlyContinue
    $jobs | Remove-Job -Force

    $totalIterations = ($results | Measure-Object -Sum).Sum
    Write-Output "[STRESS] Completed. Total iterations across $Cores cores: $totalIterations"
    Write-AuditLog -Action 'cpu-stress-test' -Result 'success' -Details "Iterations=$totalIterations, Cores=$Cores, Duration=${DurationSec}s"

    $result = [PSCustomObject]@{
        success      = $true
        durationSec  = $DurationSec
        cores        = $Cores
        iterations   = $totalIterations
        completedAt  = (Get-Date).ToString('o')
    }
    Write-Output ($result | ConvertTo-Json -Compress)
} catch {
    $jobs | Stop-Job -ErrorAction SilentlyContinue
    $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
    Write-AuditLog -Action 'cpu-stress-test' -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message 'cpu_stress_test'
}
