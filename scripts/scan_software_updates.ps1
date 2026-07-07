# scan_software_updates.ps1
$ErrorActionPreference = "Continue"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Output "[]"
    exit 0
}

$tempFile = [System.IO.Path]::GetTempFileName()
try {
    # Fix: add --accept-package-agreements and --disable-interactivity so winget
    # does not block on an interactive prompt when stdout is redirected.
    # Add a 60-second timeout so a hung winget doesn't block the UI forever.
    $process = Start-Process winget -ArgumentList "upgrade --accept-source-agreements --disable-interactivity" -NoNewWindow -PassThru -RedirectStandardOutput $tempFile -RedirectStandardError "$tempFile.err"
    if (-not $process.WaitForExit(60000)) {
        try { $process.Kill() } catch {}
        Write-Output "[]"
        exit 0
    }

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

# Fix: empty array on PS 5.1 emits nothing via ConvertTo-Json. Force array shape.
if (-not $updates -or $updates.Count -eq 0) {
    Write-Output "[]"
} elseif ($updates.Count -eq 1) {
    Write-Output "[$($updates | ConvertTo-Json -Compress)]"
} else {
    Write-Output ($updates | ConvertTo-Json -Compress)
}
