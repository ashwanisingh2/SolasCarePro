[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('list', 'enable', 'disable')]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$ItemName,

    [Parameter(Mandatory=$false)]
    [string]$RegistryPath,

    [Parameter(Mandatory=$false)]
    [string]$Command
)

$ErrorActionPreference = 'Stop'

function Validate-RegistryPath ($path) {
    if (-not $path) { return $false }
    $pathNormalized = $path.ToUpper()
    if ($pathNormalized -match "^(HKLM|HKCU|HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER)\\SOFTWARE\\MICROSOFT\\WINDOWS\\CURRENTVERSION\\RUN$") {
        return $true
    }
    return $false
}

if ($Action -eq 'list') {
    try {
        $items = Get-CimInstance -ClassName Win32_StartupCommand
        $resultList = @()
        foreach ($item in $items) {
            $resultList += @{
                Name = $item.Name
                Command = $item.Command
                Location = $item.Location
                User = $item.User
            }
        }
        Write-Output (ConvertTo-Json $resultList -Compress)
    } catch {
        Write-Output "[]"
    }
}
elseif ($Action -eq 'enable') {
    try {
        if (-not $ItemName -or -not $RegistryPath -or -not $Command) {
            throw "ItemName, RegistryPath, and Command parameters are required for enable action."
        }
        
        if (-not (Validate-RegistryPath $RegistryPath)) {
            throw "Security violation: Invalid or unauthorized registry path '$RegistryPath'. You can only add keys to Windows Startup 'Run' paths."
        }

        $targetPath = $RegistryPath
        if ($RegistryPath.StartsWith("HKLM", [System.StringComparison]::OrdinalIgnoreCase)) {
            $targetPath = "HKLM" + $RegistryPath.Substring(4)
        } elseif ($RegistryPath.StartsWith("HKCU", [System.StringComparison]::OrdinalIgnoreCase)) {
            $targetPath = "HKCU" + $RegistryPath.Substring(4)
        }

        $proc = Start-Process reg.exe -ArgumentList "add `\"$targetPath`\" /v `\"$ItemName`\" /t REG_SZ /d `\"$Command`\" /f" -Wait -NoNewWindow -PassThru
        if ($proc.ExitCode -ne 0) {
            throw "Reg add failed with exit code $($proc.ExitCode)"
        }

        $result = @{
            success = $true
            message = "Successfully enabled startup item '$ItemName' in $RegistryPath"
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
elseif ($Action -eq 'disable') {
    try {
        if (-not $ItemName -or -not $RegistryPath) {
            throw "ItemName and RegistryPath parameters are required for disable action."
        }

        if (-not (Validate-RegistryPath $RegistryPath)) {
            throw "Security violation: Invalid or unauthorized registry path '$RegistryPath'. You can only delete keys from Windows Startup 'Run' paths."
        }

        $targetPath = $RegistryPath
        if ($RegistryPath.StartsWith("HKLM", [System.StringComparison]::OrdinalIgnoreCase)) {
            $targetPath = "HKLM" + $RegistryPath.Substring(4)
        } elseif ($RegistryPath.StartsWith("HKCU", [System.StringComparison]::OrdinalIgnoreCase)) {
            $targetPath = "HKCU" + $RegistryPath.Substring(4)
        }

        $proc = Start-Process reg.exe -ArgumentList "delete `\"$targetPath`\" /v `\"$ItemName`\" /f" -Wait -NoNewWindow -PassThru
        
        $result = @{
            success = $true
            message = "Successfully disabled/deleted startup item '$ItemName' in $RegistryPath"
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
