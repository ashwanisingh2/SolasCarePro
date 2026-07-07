[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('backup', 'list', 'restore')]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$BackupName = "ManualRegistryBackup",

    [Parameter(Mandatory=$false)]
    [string]$RestoreFile
)

$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Output '{"success":false,"error":"This operation requires Administrator privileges."}'
    exit 1
}

$backupDir = Join-Path $env:APPDATA "SolasCare\RegBackups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}

if ($Action -eq 'backup') {
    try {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $hklmFile = Join-Path $backupDir "HKLM_$timestamp.reg"
        $hkcuFile = Join-Path $backupDir "HKCU_$timestamp.reg"
        $metadataFile = Join-Path $backupDir "Metadata_$timestamp.json"

        # Run native reg export command
        $procHklm = Start-Process reg.exe -ArgumentList "export `\"HKLM\SOFTWARE\Microsoft\Windows`\" `\"$hklmFile`\" /y" -Wait -NoNewWindow -PassThru
        $procHkcu = Start-Process reg.exe -ArgumentList "export `\"HKCU\SOFTWARE`\" `\"$hkcuFile`\" /y" -Wait -NoNewWindow -PassThru

        if ($procHklm.ExitCode -ne 0 -or $procHkcu.ExitCode -ne 0) {
            throw "Reg export process failed with exit codes: HKLM=$($procHklm.ExitCode), HKCU=$($procHkcu.ExitCode)"
        }

        # Calculate sizes
        $hklmSize = (Get-Item $hklmFile).Length
        $hkcuSize = (Get-Item $hkcuFile).Length

        $meta = @{
            Timestamp = (Get-Date -Format "o")
            BackupName = $BackupName
            HKLMFile = $hklmFile
            HKLMSize = $hklmSize
            HKCUFile = $hkcuFile
            HKCUSize = $hkcuSize
        }
        
        $meta | ConvertTo-Json | Out-File $metadataFile -Encoding utf8

        $result = @{
            success = $true
            files = @($hklmFile, $hkcuFile)
            timestamp = $meta.Timestamp
            message = "Backup created successfully"
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
elseif ($Action -eq 'list') {
    try {
        $backups = @()
        $files = Get-ChildItem -Path $backupDir -Filter "Metadata_*.json"
        foreach ($file in $files) {
            try {
                $content = Get-Content -Path $file.FullName -Raw | ConvertFrom-Json
                $backups += @{
                    metadataFile = $file.FullName
                    backupName = $content.BackupName
                    timestamp = $content.Timestamp
                    hklmFile = $content.HKLMFile
                    hklmSize = $content.HKLMSize
                    hkcuFile = $content.HKCUFile
                    hkcuSize = $content.HKCUSize
                }
            } catch {
                # skip corrupted metadata file
            }
        }
        Write-Output (ConvertTo-Json $backups -Compress)
    } catch {
        Write-Output "[]"
    }
}
elseif ($Action -eq 'restore') {
    try {
        if (-not $RestoreFile) {
            throw "RestoreFile parameter is required for restore action."
        }
        
        # Security validation: Must reside inside the backup directory
        $resolvedRestore = [System.IO.Path]::GetFullPath($RestoreFile)
        $resolvedBackupDir = [System.IO.Path]::GetFullPath($backupDir)
        if (-not $resolvedRestore.ToLower().StartsWith($resolvedBackupDir.ToLower())) {
            throw "Security violation: Restore path is outside the allowed backup folder."
        }
        if (-not (Test-Path $resolvedRestore)) {
            throw "Restore file not found: $RestoreFile"
        }

        # Import the file
        $proc = Start-Process reg.exe -ArgumentList "import `\"$resolvedRestore`\"" -Wait -NoNewWindow -PassThru
        if ($proc.ExitCode -ne 0) {
            throw "Reg import failed with exit code $($proc.ExitCode)"
        }

        $result = @{
            success = $true
            message = "Successfully imported registry file: $(Split-Path $resolvedRestore -Leaf)"
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
