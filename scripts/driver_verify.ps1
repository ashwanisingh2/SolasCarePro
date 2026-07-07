# driver_verify.ps1
# Driver verification service (spec TASK 5).
# Uses Get-AuthenticodeSignature + PE header parsing for arch + INF metadata parsing.
param(
    [string]$InfPath,           # INF to verify
    [string]$DriverPath         # Specific .sys/.dll to verify (optional)
)
$ErrorActionPreference = 'SilentlyContinue'

# Dot-source shared helpers (audit log)
. (Join-Path $PSScriptRoot '_common.ps1')

function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"`]' -or $p -match '\.\.') { return $false }
    return (Test-Path $p)
}

function Get-PeArchitecture {
    param([string]$filePath)
    if (-not (Test-Path $filePath)) { return 'Unknown' }
    try {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        if ($bytes.Length -lt 64) { return 'Unknown' }
        # DOS header: MZ at 0, PE header offset at 0x3C
        if ($bytes[0] -ne 0x4D -or $bytes[1] -ne 0x5A) { return 'Unknown' }
        $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
        if ($peOffset -ge $bytes.Length - 6) { return 'Unknown' }
        # PE signature: 'PE\0\0'
        if ($bytes[$peOffset] -ne 0x50 -or $bytes[$peOffset+1] -ne 0x45) { return 'Unknown' }
        # Machine type at PE offset + 4 (2 bytes, little-endian)
        $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
        switch ($machine) {
            0x8664 { return 'AMD64' }
            0xAA64 { return 'ARM64' }
            0x014C { return 'x86' }
            default { return "Unknown_0x$('{0:X4}' -f $machine)" }
        }
    } catch {
        return 'Unknown'
    }
}

function Get-InfMetadata {
    param([string]$infPath)
    $meta = [PSCustomObject]@{
        Manufacturer = ''
        Provider     = ''
        DriverVer    = ''
        Class        = ''
        ClassGuid    = ''
        TargetOS     = @()
    }
    if (-not (Test-Path $infPath)) { return $meta }
    $lines = Get-Content $infPath -ErrorAction SilentlyContinue
    $inManufacturerSection = $false
    foreach ($line in $lines) {
        $l = $line.Trim()
        if ($l -match '^\[Manufacturer\]') { $inManufacturerSection = $true; continue }
        if ($l -match '^\[') { $inManufacturerSection = $false }
        if ($inManufacturerSection -and $l -match '^[^=]+=\s*[^,]+,\s*NT([a-z0-9.]*)') {
            $targetOs = $matches[1]
            if ($targetOs) { $meta.TargetOS += $targetOs }
        }
        if ($l -match '^Provider\s*=\s*(.+)$') { $meta.Provider = $matches[1].Trim().Trim('"') }
        if ($l -match '^DriverVer\s*=\s*([^,]+),([^,]+),([^,\s]+)') {
            $meta.DriverVer = "$($matches[2].Trim())/$($matches[3].Trim())"
        }
        if ($l -match '^Class\s*=\s*(.+)$') { $meta.Class = $matches[1].Trim().Trim('"') }
        if ($l -match '^ClassGuid\s*=\s*(.+)$') { $meta.ClassGuid = $matches[1].Trim().Trim('"') }
    }
    return $meta
}

if (-not (Test-SafePath $InfPath)) {
    Write-Output '{\"success\":false,\"error\":\"Invalid INF path\"}'
    exit 1
}

# ----- Step 1: Authenticode signature of INF -----
$sig = Get-AuthenticodeSignature -FilePath $InfPath
$infSigned = $sig.Status -eq 'Valid'
$signerName = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }
$thumbprint = if ($sig.SignerCertificate) { $sig.SignerCertificate.Thumbprint } else { '' }
$certExpiry = if ($sig.SignerCertificate) { $sig.SignerCertificate.NotAfter.ToString('o') } else { '' }
$isWhql = $signerName -match 'Microsoft Windows Hardware Compatibility Publisher'

# ----- Step 2: Find the .sys file referenced in the INF and verify it -----
$sysPath = ''
$infDir = Split-Path $InfPath -Parent
$infLines = Get-Content $InfPath -ErrorAction SilentlyContinue
foreach ($line in $infLines) {
    if ($line -match '^\s*CopyFiles\s*=') { continue }
    if ($line -match '\.sys' -and $line -match '^\s*[A-Za-z0-9_\-]+\.sys') {
        $sysName = ($line -split ',')[0].Trim()
        $candidate = Join-Path $infDir $sysName
        if (Test-Path $candidate) { $sysPath = $candidate; break }
    }
}

$sysSigned = $false; $sysSigner = ''; $sysThumbprint = ''
$computedSha256 = ''
$archMatch = $false; $sysArch = 'Unknown'
if ($sysPath -and (Test-Path $sysPath)) {
    $sysSig = Get-AuthenticodeSignature -FilePath $sysPath
    $sysSigned = $sysSig.Status -eq 'Valid'
    $sysSigner = if ($sysSig.SignerCertificate) { $sysSig.SignerCertificate.Subject } else { '' }
    $sysThumbprint = if ($sysSig.SignerCertificate) { $sysSig.SignerCertificate.Thumbprint } else { '' }
    $computedSha256 = (Get-FileHash -Path $sysPath -Algorithm SHA256).Hash
    $sysArch = Get-PeArchitecture -filePath $sysPath
    # Compare against running architecture
    $currentArch = 'AMD64'
    if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq 'Arm64') { $currentArch = 'ARM64' }
    elseif ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq 'X86') { $currentArch = 'x86' }
    $archMatch = ($sysArch -eq $currentArch)
}

# ----- Step 3: Catalog file check -----
$catFile = ''
Get-ChildItem -Path $infDir -Filter '*.cat' -ErrorAction SilentlyContinue | Select-Object -First 1 | ForEach-Object { $catFile = $_.FullName }
$catValid = $false
if ($catFile) {
    $catSig = Get-AuthenticodeSignature -FilePath $catFile
    $catValid = $catSig.Status -eq 'Valid'
}

# ----- Step 4: INF metadata for OS build compatibility -----
$infMeta = Get-InfMetadata -infPath $InfPath
$currentBuild = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue).CurrentBuild
$osBuildCompatible = $true
if ($infMeta.TargetOS.Count -gt 0) {
    # If INF specifies TargetOS, ensure one matches current build
    $osBuildCompatible = $false
    foreach ($t in $infMeta.TargetOS) {
        # Format: amd64.10.0...22000
        if ($t -match '\.(\d+)\.\d+\.\.\.(\d+)') {
            $buildMin = [int]$matches[1]
            $buildMax = [int]$matches[2]
            $current = [int]$currentBuild
            if ($current -ge $buildMin -and $current -le $buildMax) { $osBuildCompatible = $true; break }
        }
    }
}

# ----- Step 5: Overall status -----
$failureReasons = @()
if (-not $infSigned) { $failureReasons += 'INF is not digitally signed' }
if ($sysPath -and -not $sysSigned) { $failureReasons += "Driver .sys file ($([System.IO.Path]::GetFileName($sysPath))) is not signed" }
if (-not $isWhql) { $failureReasons += 'Driver is not WHQL certified' }
if ($sysPath -and -not $archMatch) { $failureReasons += "Architecture mismatch (driver=$sysArch, system=$currentArch)" }
if (-not $osBuildCompatible) { $failureReasons += "INF does not target current Windows build ($currentBuild)" }
if (-not $catValid -and $catFile) { $failureReasons += "Catalog file signature invalid: $catFile" }

$overall = if ($failureReasons.Count -eq 0) { 'Verified' } elseif ($failureReasons.Count -le 2) { 'Warning' } else { 'Failed' }

$result = [PSCustomObject]@{
    success              = ($overall -ne 'Failed')
    infPath              = $InfPath
    isInfSigned          = $infSigned
    isWhqlCertified      = $isWhql
    signerName           = $signerName
    certificateThumbprint = $thumbprint
    certificateExpiry    = $certExpiry
    sysPath              = $sysPath
    isSysSigned          = $sysSigned
    sysSigner            = $sysSigner
    sysArch              = $sysArch
    archMatch            = $archMatch
    computedSha256       = $computedSha256
    catalogFile          = $catFile
    catalogValid         = $catValid
    infMetadata          = $infMeta
    osBuildCompatible    = $osBuildCompatible
    overallStatus        = $overall
    failureReasons       = $failureReasons
    timestamp            = (Get-Date).ToString('o')
}
Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
Write-AuditLog -Action 'driver-verify' -Result 'success' -Target $InfPath -Details "Status=$overall, Failures=$($failureReasons.Count)"
