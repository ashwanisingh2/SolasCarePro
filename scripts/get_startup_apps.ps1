$ErrorActionPreference = 'SilentlyContinue'
$apps = @()

# Helper to check StartupApproved keys
function Get-ApprovedStatus($keyPath, $name) {
    try {
        $reg = Get-ItemProperty -Path $keyPath -Name $name -ErrorAction SilentlyContinue
        if ($reg) {
            $bytes = $reg.$name
            if ($bytes -and $bytes[0] -ne 0x02) {
                return $false # Disabled
            }
        }
    } catch {}
    return $true # Enabled by default
}

# 1. Read HKCU Run
$hkcuRunPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$hkcuApprovedPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
Get-Item -Path $hkcuRunPath | Select-Object -ExpandProperty Property | ForEach-Object {
    $val = Get-ItemProperty -Path $hkcuRunPath -Name $_
    $enabled = Get-ApprovedStatus $hkcuApprovedPath $_
    $apps += [PSCustomObject]@{
        Name = $_
        Command = $val.$_
        Location = "HKCU\...\Run"
        RegistryPath = "HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
        ApprovedPath = "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
        Enabled = $enabled
    }
}

# 2. Read HKLM Run
$hklmRunPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"
$hklmApprovedPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
Get-Item -Path $hklmRunPath | Select-Object -ExpandProperty Property | ForEach-Object {
    $val = Get-ItemProperty -Path $hklmRunPath -Name $_
    $enabled = Get-ApprovedStatus $hklmApprovedPath $_
    $apps += [PSCustomObject]@{
        Name = $_
        Command = $val.$_
        Location = "HKLM\...\Run"
        RegistryPath = "HKLM\Software\Microsoft\Windows\CurrentVersion\Run"
        ApprovedPath = "HKLM\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
        Enabled = $enabled
    }
}

# 3. Startup Folder HKCU
$startupFolder = [System.IO.Path]::Combine([Environment]::GetFolderPath("Startup"))
if (Test-Path $startupFolder) {
    $hkcuStartupApprovedPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"
    Get-ChildItem -Path $startupFolder -Filter *.lnk | ForEach-Object {
        # Check shortcut target
        $sh = New-Object -ComObject WScript.Shell
        $target = $sh.CreateShortcut($_.FullName).TargetPath
        $enabled = Get-ApprovedStatus $hkcuStartupApprovedPath $_.Name
        $apps += [PSCustomObject]@{
            Name = $_.Name
            Command = $target
            Location = "Startup Folder"
            ShortcutPath = $_.FullName
            ApprovedPath = "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder"
            Enabled = $enabled
        }
    }
}

$apps | ConvertTo-Json -Compress
