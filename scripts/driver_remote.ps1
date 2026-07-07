# driver_remote.ps1
# Remote driver operations via PowerShell remoting (spec TASK 9).
# WinRM-based. No external dependencies; uses native PS remoting cmdlets.
param(
    [ValidateSet('test','scan','install','backup')]
    [string]$Action,
    [string]$ComputerName,
    [string]$InfPath,            # For install (will be copied to remote)
    [string]$RemoteSavePath,     # For backup
    [string]$CredentialJson      # JSON {user:'...',password:'...'} - cleared from memory after use
)
$ErrorActionPreference = 'Stop'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

if (-not $Action) {
    Write-Output '{\"success\":false,\"error\":\"Action required\"}'
    exit 1
}
if (-not $ComputerName) {
    Write-Output '{\"success\":false,\"error\":\"ComputerName required\"}'
    exit 1
}
# ComputerName validation: hostnames or FQDNs only
if ($ComputerName -notmatch '^[A-Za-z0-9._\-]+$') {
    Write-Output '{\"success\":false,\"error\":\"Invalid ComputerName format\"}'
    exit 1
}

# Build PSCredential if provided
$cred = $null
if ($CredentialJson) {
    try {
        $c = $CredentialJson | ConvertFrom-Json
        $user = [string]$c.user
        $pass = [string]$c.password
        if ($user -and $pass) {
            $securePass = ConvertTo-SecureString -String $pass -AsPlainText -Force
            $cred = New-Object System.Management.Automation.PSCredential($user, $securePass)
        }
    } catch {
        Write-Output '{\"success\":false,\"error\":\"Invalid CredentialJson format\"}'
        exit 1
    } finally {
        # Clear plaintext from memory
        if ($pass) { $pass = $null }
        if ($c) { $c = $null }
    }
}

# Test connection first - confirm WinRM is reachable
function Test-WinRM {
    param([string]$Target, [System.Management.Automation.PSCredential]$Credential)
    try {
        $params = @{ ComputerName = $Target; ErrorAction = 'Stop' }
        if ($Credential) { $params.Credential = $Credential }
        $r = Test-WSMan @params
        return $true
    } catch {
        return $false
    }
}

switch ($Action) {
    'test' {
        $ok = Test-WinRM -Target $ComputerName -Credential $cred
        $result = [PSCustomObject]@{
            success = $ok
            computerName = $ComputerName
            winrmReachable = $ok
            timestamp = (Get-Date).ToString('o')
        }
        if (-not $ok) {
            $result | Add-Member -NotePropertyName error -NotePropertyValue 'WinRM not reachable. Verify target has Enable-PSRemoting enabled and firewall allows TCP 5985/5986.'
        }
        Write-Output ($result | ConvertTo-Json -Compress)
        Write-AuditLog -Action 'driver-remote-test' -Result $(if ($ok) {'success'} else {'failure'}) -Target $ComputerName
    }

    'scan' {
        if (-not (Test-WinRM -Target $ComputerName -Credential $cred)) {
            Write-Output "{`"success`":false,`"error`":`"WinRM connection failed to $ComputerName`"}"
            exit 1
        }
        $script = {
            $signedDrivers = @(Get-CimInstance -ClassName Win32_PnPSignedDriver)
            $allEntities   = @(Get-CimInstance -ClassName Win32_PnPEntity)
            $entityErrors = @{}
            foreach ($e in $allEntities) {
                if ($e.ConfigManagerErrorCode -ne 0) { $entityErrors[$e.DeviceID] = [int]$e.ConfigManagerErrorCode }
            }
            $devices = @()
            foreach ($d in $signedDrivers) {
                if (-not $d.DeviceID) { continue }
                $probCode = 0
                if ($entityErrors.ContainsKey($d.DeviceID)) { $probCode = $entityErrors[$d.DeviceID] }
                $status = if ($probCode -eq 0) { 'OK' }
                          elseif ($probCode -eq 22) { 'Disabled' }
                          elseif ($probCode -eq 28 -or $probCode -eq 1) { 'Missing' }
                          else { 'Warning' }
                $devices += [PSCustomObject]@{
                    DeviceName     = $d.DeviceName
                    Manufacturer   = $d.Manufacturer
                    DriverVersion  = $d.DriverVersion
                    DriverDate     = if ($d.DriverDate) { ([DateTime]$d.DriverDate).ToString('yyyy-MM-dd') } else { '' }
                    DriverProvider = $d.DriverProviderName
                    IsSigned       = [bool]$d.IsSigned
                    Signer         = $d.Signer
                    InfName        = $d.InfName
                    PnpDeviceId    = $d.DeviceID
                    HardwareId     = if ($d.HardWareID) { $d.HardWareID[0] } else { '' }
                    Status         = $status
                    ProblemCode    = $probCode
                    DeviceClass    = $d.DeviceClass
                }
            }
            $devices | ConvertTo-Json -Depth 4 -Compress
        }
        $params = @{ ComputerName = $ComputerName; ScriptBlock = $script; ErrorAction = 'Stop' }
        if ($cred) { $params.Credential = $cred }
        try {
            $out = Invoke-Command @params
            $devices = $out | ConvertFrom-Json
            $result = [PSCustomObject]@{
                success = $true
                computerName = $ComputerName
                deviceCount = ($devices | Measure-Object).Count
                devices = $devices
                scannedAt = (Get-Date).ToString('o')
            }
            Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
            Write-AuditLog -Action 'driver-remote-scan' -Result 'success' -Target $ComputerName -Details "$($result.deviceCount) devices found"
        } catch {
            Write-Output "{`"success`":false,`"error`":`"$($_.Exception.Message)`"}"
            Write-AuditLog -Action 'driver-remote-scan' -Result 'failure' -Target $ComputerName -Details $_.Exception.Message
        }
    }

    'install' {
        if (-not $InfPath -or -not (Test-Path $InfPath)) {
            Write-Output '{\"success\":false,\"error\":\"Valid local InfPath required\"}'
            exit 1
        }
        if (-not (Test-WinRM -Target $ComputerName -Credential $cred)) {
            Write-Output "{`"success`":false,`"error`":`"WinRM connection failed to $ComputerName`"}"
            exit 1
        }
        # Copy INF to remote then install via pnputil
        $remoteDir = "\\$ComputerName\ADMIN$\Temp\SolasRemoteInstall"
        try {
            if (-not (Test-Path $remoteDir)) { New-Item -ItemType Directory -Path $remoteDir -Force | Out-Null }
            $remoteFile = Join-Path $remoteDir (Split-Path $InfPath -Leaf)
            Copy-Item -Path $InfPath -Destination $remoteFile -Force
            $localRemotePath = "C:\Windows\Temp\SolasRemoteInstall\$(Split-Path $InfPath -Leaf)"
            $params = @{ ComputerName = $ComputerName; ArgumentList = $localRemotePath; ErrorAction = 'Stop' }
            if ($cred) { $params.Credential = $cred }
            $out = Invoke-Command @params -ScriptBlock {
                param($p)
                $o = & pnputil.exe /add-driver $p /install 2>&1
                return [PSCustomObject]@{
                    exitCode = $LASTEXITCODE
                    output = ($o -join "`n")
                    rebootRequired = ($LASTEXITCODE -eq 3010)
                }
            }
            $result = [PSCustomObject]@{
                success = ($out.exitCode -eq 0 -or $out.exitCode -eq 3010)
                computerName = $ComputerName
                infPath = $InfPath
                exitCode = $out.exitCode
                rebootRequired = $out.rebootRequired
                output = $out.output
                installedAt = (Get-Date).ToString('o')
            }
            Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
            Write-AuditLog -Action 'driver-remote-install' -Result $(if ($result.success) {'success'} else {'failure'}) -Target $ComputerName -Details "INF=$InfPath, Exit=$($out.exitCode)"
        } catch {
            Write-Output "{`"success`":false,`"error`":`"$($_.Exception.Message)`"}"
            Write-AuditLog -Action 'driver-remote-install' -Result 'failure' -Target $ComputerName -Details $_.Exception.Message
        }
    }

    'backup' {
        if (-not $RemoteSavePath) {
            Write-Output '{\"success\":false,\"error\":\"RemoteSavePath required for backup\"}'
            exit 1
        }
        if (-not (Test-WinRM -Target $ComputerName -Credential $cred)) {
            Write-Output "{`"success`":false,`"error`":`"WinRM connection failed to $ComputerName`"}"
            exit 1
        }
        $params = @{ ComputerName = $ComputerName; ArgumentList = $RemoteSavePath; ErrorAction = 'Stop' }
        if ($cred) { $params.Credential = $cred }
        try {
            $out = Invoke-Command @params -ScriptBlock {
                param($p)
                if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
                $o = Export-WindowsDriver -Online -Destination $p 2>&1
                $files = @(Get-ChildItem -Path $p -Recurse -File)
                return [PSCustomObject]@{
                    fileCount = $files.Count
                    sizeBytes = ($files | Measure-Object Length -Sum).Sum
                    output = ($o | Out-String)
                }
            }
            $result = [PSCustomObject]@{
                success = $true
                computerName = $ComputerName
                remoteSavePath = $RemoteSavePath
                fileCount = $out.fileCount
                sizeBytes = $out.sizeBytes
                backupAt = (Get-Date).ToString('o')
            }
            Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
        } catch {
            Write-Output "{`"success`":false,`"error`":`"$($_.Exception.Message)`"}"
        }
    }

    default {
        Write-Output "{`"success`":false,`"error`":`"Unknown action: $Action`"}"
    }
}

# Clear credential from memory
if ($cred) { $cred = $null }
