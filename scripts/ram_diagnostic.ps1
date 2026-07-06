[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('schedule', 'check-result')]
    [string]$Action
)

$ErrorActionPreference = 'Stop'

if ($Action -eq 'schedule') {
    try {
        Start-Process "mdsched.exe"
        $result = @{
            success = $true
            message = "Scheduled Windows Memory Diagnostic (mdsched.exe launched)"
        }
        Write-Output (ConvertTo-Json $result -Compress)
    } catch {
        $result = @{
            success = $false
            message = $_.Exception.Message
        }
        Write-Output (ConvertTo-Json $result -Compress)
    }
}
elseif ($Action -eq 'check-result') {
    try {
        $hasResult = $false
        $resultText = "No memory diagnostic results found in event log."
        $testDate = "N/A"
        
        $events = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-MemoryDiagnostics-Results'} -MaxEvents 5 -ErrorAction SilentlyContinue
        
        if (-not $events) {
            $events = Get-WinEvent -FilterHashtable @{LogName='System'; Id=@(1201, 1202, 1101)} -MaxEvents 5 -ErrorAction SilentlyContinue
        }
        
        $debugEvents = Get-WinEvent -LogName "Microsoft-Windows-MemoryDiagnostics-Results/Debug" -MaxEvents 2 -ErrorAction SilentlyContinue
        
        $allEvents = @()
        if ($events) { $allEvents += $events }
        if ($debugEvents) { $allEvents += $debugEvents }
        
        if ($allEvents.Count -gt 0) {
            $latest = $allEvents | Sort-Object TimeCreated -Descending | Select-Object -First 1
            $hasResult = $true
            $testDate = $latest.TimeCreated.ToString("yyyy-MM-dd HH:mm:ss")
            
            if ($latest.Id -eq 1201) {
                $resultText = "No errors found"
            } elseif ($latest.Id -eq 1202) {
                $resultText = "Hardware problems detected"
            } else {
                $msg = $latest.Message.ToLower()
                # Fix: `-contains` tests collection membership, not substring match.
                # For substring matching use `-match` (regex) or `-like` (wildcard).
                if ($msg -match "no errors" -or $msg -match "passed") {
                    $resultText = "No errors found"
                } elseif ($msg -match "error" -or $msg -match "fail" -or $msg -match "hardware") {
                    $resultText = "Hardware problems detected"
                } else {
                    $resultText = "Test incomplete"
                }
            }
        }
        
        $output = @{
            hasResult = $hasResult
            result = $resultText
            testDate = $testDate
        }
        Write-Output (ConvertTo-Json $output -Compress)
    } catch {
        $result = @{
            hasResult = $false
            result = "Error checking result: $($_.Exception.Message)"
            testDate = "N/A"
        }
        Write-Output (ConvertTo-Json $result -Compress)
    }
}
