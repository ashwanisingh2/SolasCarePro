<#
.SYNOPSIS
    Pester v5 unit tests for SolasCarePro PowerShell scripts.
.DESCRIPTION
    Tests for: disk_cleanup.ps1, create_restore_point.ps1, network_optimize.ps1, _common.ps1/Write-AuditLog.
    All external system commands are mocked where possible; tests run WITHOUT administrator rights.
.NOTES
    Run:  Invoke-Pester -Path ./scripts/tests/ -Tag Unit -Output Detailed
#>

# Fix path: $PSCommandPath is .../scripts/tests/SolasCarePro.Tests.ps1
# Going up ONCE gives .../scripts/tests, going up TWICE gives .../scripts (repo scripts dir).
# We need to go up THREE levels to reach the repo root, then down into scripts.
BeforeAll {
    $script:testDir = $PSScriptRoot                          # .../scripts/tests
    $script:scriptsDir = Split-Path -Parent $script:testDir  # .../scripts
    $script:repoRoot   = Split-Path -Parent $script:scriptsDir

    # Save original APPDATA so we can restore it after tests.
    $script:origAppData = $env:APPDATA
}

AfterAll {
    $env:APPDATA = $script:origAppData
}

# =====================================================================
# Describe 1: All scripts parse without syntax errors
# =====================================================================
Describe 'All PowerShell scripts parse without syntax errors' -Tag 'Unit' {

    BeforeAll {
        $script:allScripts = Get-ChildItem -Path $script:scriptsDir -Filter '*.ps1' -File
    }

    It 'Should have at least 40 .ps1 scripts in /scripts/' {
        $script:allScripts.Count | Should -BeGreaterOrEqual 40
    }

    It 'Each script should parse without syntax errors - <_ .Name>' -ForEach @(
        Get-ChildItem -Path $script:scriptsDir -Filter '*.ps1' -File | ForEach-Object {
            @{ Name = $_.Name; Path = $_.FullName }
        }
    ) {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
        $errors.Count | Should -Be 0 -Because "script '$Name' must have no syntax errors"
    }
}

# =====================================================================
# Describe 2: disk_cleanup.ps1 — behavioral tests
# =====================================================================
Describe 'disk_cleanup.ps1' -Tag 'Unit' {

    BeforeAll {
        $script:diskCleanupPath = Join-Path $script:scriptsDir 'disk_cleanup.ps1'
    }

    Context 'script structure and validation' {

        It 'should exist' {
            Test-Path $script:diskCleanupPath | Should -BeTrue
        }

        It 'should accept Mode parameter with valid values' {
            $content = Get-Content -Path $script:diskCleanupPath -Raw
            $content | Should -Match 'param\s*\('
            $content | Should -Match '\[ValidateSet\([^)]*quick[^)]*deep[^)]*system'
            $content | Should -Match '\$Mode'
        }

        It 'should reference cleanmgr.exe in its body' {
            $content = Get-Content -Path $script:diskCleanupPath -Raw
            $content | Should -Match 'cleanmgr'
        }
    }

    Context 'script handles non-admin / non-Windows gracefully' {

        BeforeAll {
            $script:isWin = ($PSVersionTable.Platform -eq 'WinNT' -or $PSVersionTable.OS -match 'Windows' -or [System.Environment]::OSVersion.VersionString -match 'Windows')
        }

        It 'should not leave an unhandled exception when run without admin rights' -Skip:(-not $script:isWin) {
            # On a non-admin or non-Windows session, Assert-Admin writes JSON error and exits 1.
            # We just verify no unhandled terminating exception escapes (exit 1 is acceptable).
            $output = & $script:diskCleanupPath -Mode 'quick' 2>&1 | Out-String
            $LASTEXITCODE | Should -BeIn 0,1 -Because 'exit 1 (admin required) is acceptable; non-zero unhandled exceptions are not'
        }
    }
}

# =====================================================================
# Describe 3: create_restore_point.ps1 — behavioral tests
# =====================================================================
Describe 'create_restore_point.ps1' -Tag 'Unit' {

    BeforeAll {
        $script:createRpPath = Join-Path $script:scriptsDir 'create_restore_point.ps1'
    }

    Context 'script structure' {

        It 'should exist' {
            Test-Path $script:createRpPath | Should -BeTrue
        }

        It 'should call WMI SystemRestore class' {
            $content = Get-Content -Path $script:createRpPath -Raw
            $content | Should -Match 'SystemRestore'
        }

        It 'should have a try/catch block for error handling' {
            $content = Get-Content -Path $script:createRpPath -Raw
            $content | Should -Match 'try\s*\{'
            $content | Should -Match 'catch\s*\{'
        }
    }

    Context 'script handles WMI failure gracefully' {

        BeforeAll {
            $script:isWin = ($PSVersionTable.Platform -eq 'WinNT' -or $PSVersionTable.OS -match 'Windows' -or [System.Environment]::OSVersion.VersionString -match 'Windows')
        }

        It 'should output JSON (success or failure) without unhandled exceptions' -Skip:(-not $script:isWin) {
            $output = & $script:createRpPath 2>&1 | Out-String
            # Look for the last JSON-looking line in the output
            $jsonLines = ($output -split "`n") | Where-Object { $_ -match '^\s*\{.*\}\s*$' }
            $jsonLines.Count | Should -BeGreaterOrEqual 1 -Because 'script must emit at least one JSON object'
        }

        It 'should include Success boolean field in output JSON' -Skip:(-not $script:isWin) {
            $output = & $script:createRpPath 2>&1 | Out-String
            $jsonLine = ($output -split "`n") | Where-Object { $_ -match '^\s*\{.*\}\s*$' } | Select-Object -Last 1
            if ($jsonLine) {
                $parsed = $jsonLine.Trim() | ConvertFrom-Json
                # Success may be true (admin) or false (non-admin); both are valid responses
                ($parsed.Success -is [bool]) | Should -BeTrue
            }
        }

        It 'should not propagate unhandled exceptions' -Skip:(-not $script:isWin) {
            { & $script:createRpPath 2>&1 | Out-Null } | Should -Not -Throw
        }
    }
}

# =====================================================================
# Describe 4: network_optimize.ps1 — behavioral tests
# =====================================================================
Describe 'network_optimize.ps1' -Tag 'Unit' {

    BeforeAll {
        $script:netOptPath = Join-Path $script:scriptsDir 'network_optimize.ps1'
    }

    Context 'check action' {

        BeforeAll {
            # network_optimize.ps1 uses Windows-only cmdlets (Get-NetAdapterStatistics, netsh)
            # Skip execution tests on non-Windows. Structure tests still run.
            $script:isWin = ($PSVersionTable.Platform -eq 'WinNT' -or $PSVersionTable.OS -match 'Windows' -or [System.Environment]::OSVersion.VersionString -match 'Windows')
        }

        It 'should accept Action parameter' {
            $content = Get-Content -Path $script:netOptPath -Raw
            $content | Should -Match 'param\s*\('
            $content | Should -Match '\$Action'
        }

        It 'should produce some output for check action (even on failure paths)' -Skip:(-not $script:isWin) {
            $output = & $script:netOptPath -Action 'check' 2>&1 | Out-String
            $output.Trim() | Should -Not -BeNullOrEmpty -Because 'check action must emit JSON status'
        }

        It 'should output text containing Network or DNS keyword on reset action' -Skip:(-not $script:isWin) {
            $output = & $script:netOptPath -Action 'reset' 2>&1 | Out-String
            ($output -match 'DNS|Network|Reconnecting|Connected|stack|SYSTEM') | Should -BeTrue
        }
    }

    Context 'reset action flow' {

        BeforeAll {
            $script:isWin = ($PSVersionTable.Platform -eq 'WinNT' -or $PSVersionTable.OS -match 'Windows' -or [System.Environment]::OSVersion.VersionString -match 'Windows')
        }

        It 'should mention netsh reset commands in reset output' -Skip:(-not $script:isWin) {
            $output = & $script:netOptPath -Action 'reset' 2>&1 | Out-String
            ($output -match 'Resetting|winsock|catalog|Flushing') | Should -BeTrue
        }

        It 'should have a reset branch in source code' {
            $content = Get-Content -Path $script:netOptPath -Raw
            $content | Should -Match "Action -eq .reset."
            $content | Should -Match 'netsh winsock reset'
            $content | Should -Match 'netsh int ip reset'
        }
    }
}

# =====================================================================
# Describe 5: _common.ps1 / Write-AuditLog
# =====================================================================
Describe '_common.ps1 / Write-AuditLog' -Tag 'Unit' {

    BeforeAll {
        # Dot-source _common.ps1 to import Write-AuditLog into the test scope
        $script:commonPath = Join-Path $script:scriptsDir '_common.ps1'
        . $script:commonPath

        # Set APPDATA to THIS Describe's TestDrive so we don't pollute the real profile.
        # Pester v5 gives each Describe its own TestDrive, so this must be done here,
        # not in the file-level BeforeAll.
        $env:APPDATA = $TestDrive
        $script:auditLogPath = Join-Path (Join-Path $env:APPDATA 'SolasCare') (Join-Path 'logs' 'audit.jsonl')
    }

    AfterAll {
        $env:APPDATA = $script:origAppData
    }

    Context 'Write-AuditLog creates and appends to audit log file' {

        BeforeEach {
            # Clean state before each test
            if (Test-Path $script:auditLogPath) {
                Remove-Item $script:auditLogPath -Force
            }
        }

        It 'Should create the audit log file on first call' {
            Write-AuditLog -Action 'TestAction' -Result 'success' -Details 'unit test entry'
            Test-Path $script:auditLogPath | Should -BeTrue -Because 'audit log file must be created'
        }

        It 'Should append (not overwrite) on subsequent calls' {
            Write-AuditLog -Action 'First' -Result 'success'
            Write-AuditLog -Action 'Second' -Result 'success'
            $lines = Get-Content -Path $script:auditLogPath
            ($lines.Count) | Should -Be 2 -Because 'each call must append a new line'
        }

        It 'Should include the Action parameter value in the log entry' {
            $testAction = "Action_$(Get-Random)"
            Write-AuditLog -Action $testAction -Result 'success'
            $line = Get-Content -Path $script:auditLogPath -First 1
            $line | Should -Match $testAction -Because 'log entry must contain the Action value'
        }

        It 'Should include an ISO 8601 timestamp in the log entry' {
            Write-AuditLog -Action 'TimestampTest' -Result 'success'
            $line = Get-Content -Path $script:auditLogPath -First 1
            $line | Should -Match '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}' -Because 'log entry must contain an ISO 8601 timestamp'
        }

        It 'Should produce valid JSON for each line' {
            Write-AuditLog -Action 'JsonTest' -Result 'success' -Details 'validation test'
            $line = Get-Content -Path $script:auditLogPath -First 1
            { $line | ConvertFrom-Json } | Should -Not -Throw -Because 'every audit log line must be valid JSON'
        }

        It 'Should include all required fields (ts, user, action, target, result, details, script)' {
            Write-AuditLog -Action 'FieldTest' -Target 'C:\test' -Result 'failure' -Details 'failed deliberately'
            $line = Get-Content -Path $script:auditLogPath -First 1
            $parsed = $line | ConvertFrom-Json
            $parsed.ts       | Should -Not -BeNullOrEmpty
            $parsed.user     | Should -Not -BeNullOrEmpty
            $parsed.action   | Should -Be 'FieldTest'
            $parsed.target   | Should -Be 'C:\test'
            $parsed.result   | Should -Be 'failure'
            $parsed.details  | Should -Be 'failed deliberately'
            $parsed.script   | Should -Not -BeNullOrEmpty
        }

        It 'Should not throw even if APPDATA log dir does not exist (creates it)' {
            $logsDir = Split-Path $script:auditLogPath -Parent
            if (Test-Path $logsDir) { Remove-Item $logsDir -Recurse -Force }
            { Write-AuditLog -Action 'DirCreateTest' } | Should -Not -Throw
            Test-Path $script:auditLogPath | Should -BeTrue
        }

        It 'Should sanitize newlines in Details field to keep each entry on one line' {
            Write-AuditLog -Action 'NewlineTest' -Details "line1`nline2`r`nline3"
            $lineCount = (Get-Content -Path $script:auditLogPath).Count
            $lineCount | Should -Be 1 -Because 'multi-line details must be flattened to a single JSONL line'
        }
    }

    Context 'Write-AuditLog rotation (10 MB cap)' {

        It 'Should rotate the log when it exceeds 10 MB' {
            $logsDir = Split-Path $script:auditLogPath -Parent
            New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
            # Pre-create an 11 MB audit.jsonl to trigger rotation on next write
            $bigContent = 'X' * (11 * 1MB)
            Set-Content -Path $script:auditLogPath -Value $bigContent -NoNewline

            Write-AuditLog -Action 'RotationTrigger' -Result 'success'

            # The rotated .1 file should exist with the old big content
            $rotatedPath = "$script:auditLogPath.1"
            Test-Path $rotatedPath | Should -BeTrue -Because 'oversized log must be rotated to .1'

            # Current log file should be small (just the new entry)
            $currentSize = (Get-Item $script:auditLogPath).Length
            $currentSize | Should -BeLessThan 1KB -Because 'after rotation, current log should only contain the new entry'
        }
    }

    Context 'Other _common.ps1 helpers' {

        It 'ConvertTo-JsonArray should return [] for empty input' {
            $result = ConvertTo-JsonArray @()
            $result | Should -Be '[]' -Because 'PS 5.1 emits nothing for empty arrays; helper must force []'
        }

        It 'ConvertTo-JsonArray should wrap single-item arrays correctly' {
            $result = ConvertTo-JsonArray @([PSCustomObject]@{ Name = 'One' })
            $result | Should -Match '^\[' -Because 'single-item input must still be wrapped in array'
            $result | Should -Match '\]$'
        }

        It 'Write-JsonError should emit a JSON object with success:false' {
            $output = Write-JsonError 'test error message' 'TestSource'
            $parsed = $output | ConvertFrom-Json
            $parsed.success | Should -BeFalse
            $parsed.error | Should -Match 'test error message'
        }

        It 'Start-Timer should return an object with a Stopwatch property' {
            $t = Start-Timer
            $t.Stopwatch | Should -Not -BeNull
            $t.StartedIso | Should -Not -BeNullOrEmpty
        }

        It 'Get-TimerElapsedSec should return a positive number for a started timer' {
            $t = Start-Timer
            Start-Sleep -Milliseconds 100
            $elapsed = Get-TimerElapsedSec $t
            $elapsed | Should -BeGreaterThan 0
        }
    }
}

# =====================================================================
# Final hint - print run command
# =====================================================================
Write-Host ""
Write-Host "Run all tests with:" -ForegroundColor Cyan
Write-Host "  Invoke-Pester -Path ./scripts/tests/ -Tag Unit -Output Detailed" -ForegroundColor Cyan
Write-Host ""
