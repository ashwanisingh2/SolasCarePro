# scan_software_updates.ps1
$ErrorActionPreference = "Continue"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Output "[]"
    exit 0
}

$tempFile = [System.IO.Path]::GetTempFileName()
try {
    $process = Start-Process winget -ArgumentList "upgrade --accept-source-agreements" -NoNewWindow -PassThru -RedirectStandardOutput $tempFile -RedirectStandardError "$tempFile.err"
    $process.WaitForExit()

    if (-not (Test-Path $tempFile)) {
        Write-Output "[]"
        exit 0
    }

    $lines = Get-Content $tempFile -Encoding utf8
}
finally {
    if (Test-Path $tempFile) { Remove-Item $tempFile -ErrorAction SilentlyContinue }
    if (Test-Path "$tempFile.err") { Remove-Item "$tempFile.err" -ErrorAction SilentlyContinue }
}

$updates = @()
$startParsing = $false

foreach ($line in $lines) {
    $line = $line -replace '\x1b\[[0-9;]*[a-zA-Z]', '' # Strip ANSI colors
    $line = $line.Trim()
    
    if ($line -match "Name\s+Id\s+Version\s+Available") {
        $startParsing = $true
        continue
    }
    
    if ($startParsing) {
        if ($line.StartsWith("-")) { continue }
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -match "^\d+\s+upgrades?\s+available" -or $line -match "package\(s\) have version numbers") {
            break
        }
        
        $parts = $line -split '\s{2,}'
        if ($parts.Count -ge 4) {
            $name = $parts[0].Trim()
            $id = $parts[1].Trim()
            $version = $parts[2].Trim()
            $available = $parts[3].Trim()
            $source = if ($parts.Count -ge 5) { $parts[4].Trim() } else { "winget" }
            
            $updates += [PSCustomObject]@{
                Name = $name
                Id = $id
                CurrentVersion = $version
                AvailableVersion = $available
                Source = $source
            }
        }
    }
}

Write-Output ($updates | ConvertTo-Json -Compress)
