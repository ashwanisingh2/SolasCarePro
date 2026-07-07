# advanced_tools.ps1
# Advanced tools: force uninstaller, file shredder, file unlocker, driver sweeper,
# duplicate finder, broken shortcut scanner, hosts file editor.
# All actions are real Windows operations - no mock data.
param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$Target
)
. (Join-Path $PSScriptRoot '_common.ps1')
$ErrorActionPreference = 'Stop'

function Test-SafePath {
    param([string]$p)
    if (-not $p) { return $false }
    if ($p -match '[<>|"]') { return $false }
    if ($p -match '\.\.') { return $false }
    return $true
}

try {
    switch ($Action) {
        'list-apps' {
            # Real registry enumeration of installed programs (both 64-bit and 32-bit views).
            $apps = @()
            $regPaths = @(
                'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
                'HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
                'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
            )
            foreach ($rp in $regPaths) {
                try {
                    $items = Get-ItemProperty $rp -ErrorAction SilentlyContinue |
                             Where-Object { $_.DisplayName } |
                             Select-Object DisplayName, DisplayVersion, Publisher, UninstallString, PSChildName
                    $apps += $items
                } catch {}
            }
            # Deduplicate by DisplayName+DisplayVersion
            $unique = $apps | Group-Object { "$($_.DisplayName)|$($_.DisplayVersion)" } | ForEach-Object { $_.Group[0] }
            Write-Output ($unique | ConvertTo-Json -Depth 3 -Compress)
            Write-AuditLog -Action 'advanced-list-apps' -Result 'success' -Details "Listed $($unique.Count) apps"
        }

        'force-uninstall' {
            # Force-uninstall by UninstallString or product GUID.
            if (-not (Test-SafePath $Target)) {
                Write-JsonError 'Invalid target. Must be a UninstallString or product GUID.' 'force-uninstall'
                exit 1
            }
            # If Target is a GUID like {xxxx-xxxx-...}, find the UninstallString
            if ($Target -match '^\{[0-9A-Fa-f\-]+\}$') {
                $found = $null
                foreach ($rp in 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
                    $found = Get-ItemProperty $rp -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -eq $Target.Trim('{}') -or $_.PSChildName -eq $Target }
                    if ($found) { break }
                }
                if (-not $found -or -not $found.UninstallString) {
                    Write-JsonError "Could not find UninstallString for product $Target" 'force-uninstall'
                    exit 1
                }
                $Target = $found.UninstallString
            }
            # Append /quiet /norestart for silent uninstall
            $cmd = $Target
            if ($cmd -notmatch '/quiet') { $cmd += ' /quiet' }
            if ($cmd -notmatch '/norestart') { $cmd += ' /norestart' }
            Write-Output "[FORCE-UNINSTALL] Running: $cmd"
            $out = & cmd.exe /c $cmd 2>&1
            $exitCode = $LASTEXITCODE
            Write-AuditLog -Action 'advanced-force-uninstall' -Result $(if ($exitCode -eq 0) {'success'} else {'failure'}) -Target $Target -Details "ExitCode=$exitCode"
            Write-JsonResult @{
                success  = ($exitCode -eq 0)
                exitCode = $exitCode
                output   = ($out -join "`n")
                message  = if ($exitCode -eq 0) { 'Uninstall completed.' } else { "Uninstall returned exit code $exitCode" }
            } 0
        }

        'shred' {
            # Secure shred: 3-pass overwrite (0x00, 0xFF, random) then delete.
            if (-not (Test-SafePath $Target) -or -not (Test-Path $Target)) {
                Write-JsonError 'Invalid or non-existent file path.' 'shred'
                exit 1
            }
            $file = Get-Item $Target -ErrorAction Stop
            if ($file.Attributes -band [System.IO.FileAttributes]::Directory) {
                Write-JsonError 'Target is a directory. Use a file path.' 'shred'
                exit 1
            }
            $len = $file.Length
            Write-Output "[SHRED] Shredding $Target ($len bytes, 3-pass)..."
            # Pass 1: 0x00
            $zeros = New-Object byte[] $len
            [System.IO.File]::WriteAllBytes($Target, $zeros)
            # Pass 2: 0xFF
            $ones = New-Object byte[] $len
            for ($i = 0; $i -lt $len; $i++) { $ones[$i] = 0xFF }
            [System.IO.File]::WriteAllBytes($Target, $ones)
            # Pass 3: random
            $rand = New-Object byte[] $len
            $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $rng.GetBytes($rand)
            [System.IO.File]::WriteAllBytes($Target, $rand)
            # Delete
            Remove-Item $Target -Force
            Write-AuditLog -Action 'advanced-shred' -Result 'success' -Target $Target -Details "Bytes=$len, Passes=3"
            Write-JsonResult @{
                success = $true
                message = "File securely shredded (3-pass overwrite + delete). Path: $Target"
                bytes   = $len
                passes  = 3
            } 0
        }

        'unlock' {
            # List processes locking a file (via openfiles.exe) and optionally kill them.
            if (-not (Test-SafePath $Target) -or -not (Test-Path $Target)) {
                Write-JsonError 'Invalid or non-existent file path.' 'unlock'
                exit 1
            }
            # openfiles requires 'openfiles /local on' + reboot to be enabled.
            # Fallback: use Get-Process | Where-Object { $_.Modules.FileName -contains $Target }
            $lockers = @()
            try {
                $lockers = @(Get-Process | Where-Object {
                    try { $_.Modules.FileName -contains $Target } catch { $false }
                } | Select-Object Id, Name, Path)
            } catch {}
            $arr = @($lockers | ForEach-Object {
                @{ pid=$_.Id; name=$_.Name; path=$_.Path }
            })
            Write-AuditLog -Action 'advanced-unlock-list' -Result 'success' -Target $Target -Details "Lockers=$($arr.Count)"
            if ($arr.Count -eq 0) {
                Write-JsonResult @{
                    success = $true
                    message = "No processes are currently locking $Target"
                    lockers = @()
                } 0
            } else {
                Write-JsonResult @{
                    success = $true
                    message = "$($arr.Count) process(es) locking $Target"
                    lockers = $arr
                } 0
            }
        }

        'unlock-kill' {
            # Kill all processes locking the file.
            if (-not (Test-SafePath $Target) -or -not (Test-Path $Target)) {
                Write-JsonError 'Invalid or non-existent file path.' 'unlock-kill'
                exit 1
            }
            $killed = 0
            $failed = 0
            try {
                $procs = @(Get-Process | Where-Object {
                    try { $_.Modules.FileName -contains $Target } catch { $false }
                })
                foreach ($p in $procs) {
                    try {
                        Stop-Process -Id $p.Id -Force -ErrorAction Stop
                        $killed++
                    } catch { $failed++ }
                }
            } catch {}
            Write-AuditLog -Action 'advanced-unlock-kill' -Result 'success' -Target $Target -Details "Killed=$killed, Failed=$failed"
            Write-JsonResult @{
                success = ($failed -eq 0)
                killed  = $killed
                failed  = $failed
                message = "Killed $killed process(es) locking $Target"
            } 0
        }

        'find-duplicates' {
            # Real duplicate finder: hash files in user-selected folder (default: USERPROFILE)
            $searchPath = if ($Target) { $Target } else { "$env:USERPROFILE\Downloads" }
            if (-not (Test-SafePath $searchPath) -or -not (Test-Path $searchPath)) {
                Write-JsonError "Invalid search path: $searchPath" 'find-duplicates'
                exit 1
            }
            Write-Output "[DUP] Scanning $searchPath for duplicates (this may take a while)..."
            # Only hash files > 1MB to avoid hashing thousands of tiny files
            $files = @(Get-ChildItem -Path $searchPath -Recurse -File -ErrorAction SilentlyContinue |
                       Where-Object { $_.Length -gt 1MB } |
                       Select-Object -First 500)
            $byHash = @{}
            $i = 0
            foreach ($f in $files) {
                $i++
                if ($i % 50 -eq 0) { Write-Output "[DUP] Hashing $i / $($files.Count)..." }
                try {
                    $hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
                    if (-not $byHash.ContainsKey($hash)) { $byHash[$hash] = @() }
                    $byHash[$hash] += [PSCustomObject]@{
                        Path = $f.FullName
                        Size = $f.Length
                        SizeMB = [math]::Round($f.Length / 1MB, 2)
                    }
                } catch {}
            }
            $duplicates = @($byHash.Values | Where-Object { $_.Count -gt 1 } | ForEach-Object {
                @{ hash = 'redacted'; files = $_; totalSizeMB = (($_ | Measure-Object Size -Sum).Sum / 1MB) }
            })
            Write-AuditLog -Action 'advanced-find-duplicates' -Result 'success' -Target $searchPath -Details "Files=$($files.Count), DuplicateGroups=$($duplicates.Count)"
            Write-JsonResult @{
                success = $true
                scannedFiles = $files.Count
                duplicateGroups = $duplicates.Count
                duplicates = $duplicates
                message = "Scanned $($files.Count) files; found $($duplicates.Count) duplicate group(s)."
            } 0
        }

        'find-broken-shortcuts' {
            # Scan common shortcut locations for broken .lnk files (target missing).
            $searchPaths = @(
                "$env:USERPROFILE\Desktop",
                "$env:PUBLIC\Desktop",
                "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
                "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"
            )
            $broken = @()
            $shell = New-Object -ComObject WScript.Shell
            foreach ($sp in $searchPaths) {
                if (-not (Test-Path $sp)) { continue }
                $lnks = Get-ChildItem -Path $sp -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue
                foreach ($lnk in $lnks) {
                    try {
                        $shortcut = $shell.CreateShortcut($lnk.FullName)
                        $targetPath = $shortcut.TargetPath
                        if ($targetPath -and -not (Test-Path $targetPath)) {
                            $broken += [PSCustomObject]@{
                                ShortcutPath = $lnk.FullName
                                TargetPath   = $targetPath
                                Name         = $lnk.BaseName
                            }
                        }
                    } catch {}
                }
            }
            Write-AuditLog -Action 'advanced-find-broken-shortcuts' -Result 'success' -Details "Found $($broken.Count) broken shortcuts"
            if ($broken.Count -eq 0) {
                Write-Output '[]'
            } elseif ($broken.Count -eq 1) {
                Write-Output "[$($broken | ConvertTo-Json -Compress -Depth 3)]"
            } else {
                Write-Output ($broken | ConvertTo-Json -Compress -Depth 3)
            }
        }

        'read-hosts' {
            # Read the Windows hosts file content. JSON-safe (no embedded newlines).
            $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
            if (-not (Test-Path $hostsPath)) {
                Write-JsonError 'Hosts file not found.' 'read-hosts'
                exit 1
            }
            $content = Get-Content -Path $hostsPath -Raw -ErrorAction Stop
            # Split into lines and return as JSON array - this keeps the JSON valid.
            $lines = $content -split "`r?`n"
            $result = [PSCustomObject]@{
                success = $true
                path    = $hostsPath
                lines   = $lines
                lineCount = $lines.Count
            }
            Write-Output ($result | ConvertTo-Json -Depth 3 -Compress)
            Write-AuditLog -Action 'advanced-read-hosts' -Result 'success' -Details "$($lines.Count) lines"
        }

        'write-hosts' {
            # Overwrite hosts file with provided content (Target = full new content as multi-line string).
            if (-not $Target) {
                Write-JsonError 'Target content required for write-hosts.' 'write-hosts'
                exit 1
            }
            $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
            # Backup current hosts
            $backup = "$hostsPath.solas-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            Copy-Item -Path $hostsPath -Destination $backup -Force -ErrorAction SilentlyContinue
            # Write new content (Target may be \n-escaped JSON; unescape
            $content = $Target -replace '\\n', "`n" -replace '\\r', "`r"
            Set-Content -Path $hostsPath -Value $content -Encoding ASCII -Force
            Write-AuditLog -Action 'advanced-write-hosts' -Result 'success' -Target $hostsPath -Details "Backup=$backup"
            Write-JsonResult @{
                success = $true
                backupPath = $backup
                message = "Hosts file updated. Previous version backed up to: $backup"
            } 0
        }

        'add-hosts-entry' {
            # Add a single hosts entry: Target = "1.2.3.4 example.com"
            if (-not $Target -or $Target -notmatch '^\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s+\S+\s*$') {
                Write-JsonError 'Target must be in format: "IP hostname" (e.g. "0.0.0.0 adserver.com")' 'add-hosts-entry'
                exit 1
            }
            $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
            Add-Content -Path $hostsPath -Value "`n# SolasCarePro block: $Target`n$Target" -Encoding ASCII
            Write-AuditLog -Action 'advanced-add-hosts-entry' -Result 'success' -Target $Target
            Write-JsonResult @{ success = $true; message = "Hosts entry added: $Target" } 0
        }

        default {
            Write-JsonError "Invalid action: $Action" 'advanced_tools'
        }
    }
} catch {
    Write-AuditLog -Action "advanced-$Action" -Result 'failure' -Details $_.Exception.Message
    Write-JsonError $_.Exception.Message "advanced_tools.$Action"
}
