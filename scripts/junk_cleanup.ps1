# junk_cleanup.ps1
param (
    [string]$Action = "scan", # scan, clean, undo, commit
    [string]$BackupDir = "",
    [string]$FilesJson = "", # JSON list of paths to clean (fallback)
    [string]$FilesPath = "", # JSON file path of paths to clean (main)
    [bool]$IncludeRecycleBin = $false
)

$ErrorActionPreference = 'SilentlyContinue'

$logDir = "$env:APPDATA\SolasCare"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logFile = "$logDir\cleanup_log_$(Get-Date -Format 'yyyyMMdd').txt"

function Write-CleanupLog($msg) {
    $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$time] $msg" | Out-File -FilePath $logFile -Append -Encoding UTF8
}

function Get-JunkFiles {
    $files = @()
    $now = Get-Date
    
    # Define targets and age rules
    $targets = @(
        @{ Path = "$env:TEMP"; AgeDays = 1; Category = "User Temp" },
        @{ Path = "$env:SystemRoot\Temp"; AgeDays = 1; Category = "System Temp" },
        @{ Path = "$env:SystemRoot\Prefetch"; AgeDays = 7; Category = "Prefetch" },
        @{ Path = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache"; AgeDays = 0; Category = "Chrome Cache" },
        @{ Path = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Cache"; AgeDays = 0; Category = "Edge Cache" }
    )
    
    foreach ($target in $targets) {
        if (Test-Path $target.Path) {
            $col = Get-ChildItem -Path $target.Path -File -Recurse -ErrorAction SilentlyContinue
            foreach ($f in $col) {
                # 5-minute whitelist protection for active sessions
                $ageMin = ($now - $f.LastWriteTime).TotalMinutes
                if ($ageMin -lt 5) { continue }
                
                # Custom day thresholds
                if ($target.AgeDays -gt 0) {
                    $ageDays = ($now - $f.LastWriteTime).TotalDays
                    if ($ageDays -lt $target.AgeDays) { continue }
                }
                
                $files += [PSCustomObject]@{
                    Path = $f.FullName
                    Size = $f.Length
                    Category = $target.Category
                }
            }
        }
    }
    
    # Recycle Bin query using Shell COM
    if ($IncludeRecycleBin) {
        try {
            $shell = New-Object -ComObject Shell.Application
            $recycleBin = $shell.Namespace(0x0a)
            foreach ($item in $recycleBin.Items()) {
                $files += [PSCustomObject]@{
                    Path = $item.Path
                    Size = $item.Size
                    Category = "Recycle Bin"
                }
            }
        } catch {}
    }
    
    return $files
}

switch ($Action) {
    "scan" {
        $files = Get-JunkFiles
        Write-Output ($files | ConvertTo-Json -Compress)
    }
    
    "clean" {
        $paths = @()
        if ($FilesPath -and (Test-Path $FilesPath)) {
            $paths = Get-Content $FilesPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
            Remove-Item $FilesPath -Force -ErrorAction SilentlyContinue | Out-Null
        } elseif ($FilesJson) {
            $paths = $FilesJson | ConvertFrom-Json
        } else {
            Write-Error "FilesPath or FilesJson is required for clean action."
            exit 1
        }
        
        $backupTimestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $backupPath = "$env:TEMP\SolasCareBackup_$backupTimestamp"
        New-Item -ItemType Directory -Path $backupPath | Out-Null
        
        $mapping = @()
        $successPaths = @()
        
        foreach ($p in $paths) {
            if (Test-Path $p) {
                $fileId = [Guid]::NewGuid().ToString()
                $backupFile = Join-Path $backupPath $fileId
                
                try {
                    # Copy to backup to allow undo
                    Copy-Item -Path $p -Destination $backupFile -Force -ErrorAction Stop
                    # Remove original
                    Remove-Item -Path $p -Force -Recurse -ErrorAction Stop
                    
                    $mapping += @{
                        BackupPath = $backupFile
                        OriginalPath = $p
                    }
                    $successPaths += $p
                    Write-CleanupLog "Cleaned: $p"
                } catch {
                    # Clean up copied file if removal failed
                    if (Test-Path $backupFile) { Remove-Item $backupFile -Force -ErrorAction SilentlyContinue }
                    Write-CleanupLog "Failed to clean: $p - Error: $_"
                }
            }
        }
        
        # Save mapping
        $mapping | ConvertTo-Json | Out-File -FilePath "$backupPath\mapping.json" -Encoding UTF8 -Force
        
        # Return backup directory name so frontend can issue commit/undo
        @{
            BackupDir = $backupPath
            CleanedCount = $successPaths.Count
        } | ConvertTo-Json -Compress
    }
    
    "undo" {
        if (-not $BackupDir -or -not (Test-Path $BackupDir)) {
            Write-Error "Valid BackupDir is required for undo action."
            exit 1
        }
        
        $mappingFile = "$BackupDir\mapping.json"
        if (Test-Path $mappingFile) {
            $mapping = Get-Content $mappingFile -Raw | ConvertFrom-Json
            foreach ($item in $mapping) {
                if (Test-Path $item.BackupPath) {
                    # Create parent folder if deleted
                    $parent = Split-Path $item.OriginalPath -Parent
                    if (-not (Test-Path $parent)) {
                        New-Item -ItemType Directory -Path $parent -Force | Out-Null
                    }
                    Move-Item -Path $item.BackupPath -Destination $item.OriginalPath -Force
                    Write-CleanupLog "Undone restoration: $($item.OriginalPath)"
                }
            }
        }
        Remove-Item -Path $BackupDir -Recurse -Force
        Write-Output "Undo completed."
    }
    
    "commit" {
        if (-not $BackupDir -or -not (Test-Path $BackupDir)) {
            exit 0
        }
        
        $mappingFile = "$BackupDir\mapping.json"
        if (Test-Path $mappingFile) {
            $mapping = Get-Content $mappingFile -Raw | ConvertFrom-Json
            [void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic')
            
            foreach ($item in $mapping) {
                if (Test-Path $item.BackupPath) {
                    try {
                        [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($item.BackupPath, 'OnlyErrorDialogs', 'SendToRecycleBin')
                    } catch {
                        Remove-Item $item.BackupPath -Force -ErrorAction SilentlyContinue
                    }
                }
            }
        }
        Remove-Item -Path $BackupDir -Recurse -Force
        Write-Output "Commit completed."
    }
}
