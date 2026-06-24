$ErrorActionPreference = 'Stop'

try {
    $slmgr = cscript //nologo C:\Windows\System32\slmgr.vbs /xpr 2>&1
    $dli = cscript //nologo C:\Windows\System32\slmgr.vbs /dli 2>&1

    $xprText = [string]::Join(" ", $slmgr)
    $dliText = [string]::Join("`r`n", $dli)

    # Defaults
    $productName = "Unknown Windows Edition"
    $partialKey = "Unknown"
    $licenseStatus = "Unknown"
    $expiryInfo = $xprText.Trim()
    $kmsServer = $null
    $gracePeriodDays = $null

    if ($dliText -match "(?i)Name:\s*(.+)") {
        $productName = $Matches[1].Trim()
    }
    if ($dliText -match "(?i)Partial Product Key:\s*(.+)") {
        $partialKey = $Matches[1].Trim()
    }
    if ($dliText -match "(?i)License Status:\s*(.+)") {
        $licenseStatus = $Matches[1].Trim()
    }
    if ($dliText -match "(?i)(KMS machine name from DNS|Registered KMS machine name):\s*([^:\r\n\s]+)") {
        $kmsServer = $Matches[2].Trim()
    }
    if ($dliText -match "(?i)Time remaining:\s*(\d+)\s*minute") {
        $minutes = [int]$Matches[1]
        $gracePeriodDays = [math]::Round($minutes / 1440, 1)
    }

    $output = @{
        ProductName = $productName
        PartialKey = $partialKey
        LicenseStatus = $licenseStatus
        ExpiryInfo = $expiryInfo
        KMSServer = $kmsServer
        GracePeriodDays = $gracePeriodDays
    }

    Write-Output (ConvertTo-Json $output -Compress)

} catch {
    $errObj = @{
        error = $_.Exception.Message
    }
    Write-Output (ConvertTo-Json $errObj -Compress)
}
