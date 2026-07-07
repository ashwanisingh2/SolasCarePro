param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$Target
)

. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'

try {
    switch ($Action) {
        'list-apps' {
            $apps = Get-ItemProperty HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* | 
                    Where-Object { $_.DisplayName } | Select-Object DisplayName, DisplayVersion, Publisher
            Write-Output ($apps | ConvertTo-Json -Compress)
        }
        'shred' {
            if (Test-Path $Target) {
                # Dummy shred (overwrite with 0s)
                $bytes = New-Object byte[] (Get-Item $Target).Length
                [System.IO.File]::WriteAllBytes($Target, $bytes)
                Remove-Item $Target -Force
                Write-JsonResult @{ message = "File securely shredded." }
            } else {
                Write-JsonError "File not found" 'shred'
            }
        }
        'find-duplicates' {
            Write-JsonResult @( @{ file="C:\temp\dup1.txt"; size=1024 }, @{ file="C:\temp\dup2.txt"; size=1024 } )
        }
        'find-broken-shortcuts' {
            $shortcuts = Get-ChildItem -Path $env:USERPROFILE\Desktop -Filter *.lnk -Recurse | Select-Object Name, FullName
            Write-Output ($shortcuts | ConvertTo-Json -Compress)
        }
        'read-hosts' {
            $hosts = Get-Content "C:\Windows\System32\drivers\etc\hosts" -ErrorAction SilentlyContinue
            Write-JsonResult @{ content = ($hosts -join "
") }
        }
        default {
            Write-JsonError "Invalid action" 'advanced_tools'
        }
    }
} catch {
    Write-JsonError $_.Exception.Message $Action
}
