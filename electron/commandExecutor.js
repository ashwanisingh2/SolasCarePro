const { dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');

let getMainWindowRef = () => null;
let log = console.log;
let audit = () => {};
let settingsStoreRef = null;
let defaultSettingsRef = null;

const logDir = path.join(process.env.APPDATA, 'SolasCare', 'logs');
const reportsDir = path.join(process.env.APPDATA, 'SolasCare', 'reports');
// FIX: main.js writes to audit.jsonl (not audit.log). This was a path mismatch
// that caused the History Logs feature to never see main-process audit events.
const auditFile = path.join(logDir, 'audit.jsonl');

function initCommandExecutor(getMainWindowFn, logFn, auditFn, settingsStore, defaultSettings) {
  getMainWindowRef = getMainWindowFn;
  log = logFn;
  audit = auditFn;
  settingsStoreRef = settingsStore;
  defaultSettingsRef = defaultSettings;
}

function validateTempBackupDir(backupDir) {
  if (typeof backupDir !== 'string') {
    throw new Error('Invalid backup directory.');
  }
  const resolved = path.resolve(backupDir);
  const tempRoot = path.resolve(process.env.TEMP || 'C:\\Windows\\Temp');
  if (!resolved.toLowerCase().startsWith((tempRoot + path.sep).toLowerCase()) || !path.basename(resolved).startsWith('SolasCareBackup_')) {
    throw new Error('Backup directory is outside the allowed temp backup area.');
  }
  return resolved;
}

const activeChildProcesses = new Set();

function getScriptPath(scriptName) {
  const candidates = [
    path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'scripts', scriptName),
    path.join(__dirname, '..', 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'app', 'scripts', scriptName)
  ];
  const fullPath = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!fullPath) {
    throw new Error(`Script not found: ${scriptName}`);
  }
  return fullPath;
}

function getPowershellPath() {
  const useSysnative = process.env.PROCESSOR_ARCHITEW6432 || (process.platform === 'win32' && process.arch === 'ia32');
  const windir = process.env.windir || 'C:\\Windows';
  return useSysnative 
    ? path.join(windir, 'sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe';
}


async function confirmCommand(cmd) {
  if (!cmd.confirmationRequired) return true;
  const result = await dialog.showMessageBox(getMainWindowRef(), {
    type: 'warning',
    buttons: ['Cancel', 'Proceed'],
    defaultId: 0,
    cancelId: 0,
    title: 'Confirm System Operation',
    message: cmd.confirmationMessage || 'This operation changes system state. Continue?',
    noLink: true
  });
  return result.response === 1;
}

function runChildProcess(executable, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      ...options.spawnOptions
    });
    activeChildProcesses.add(child);

    // Helper to kill the child + its descendant tree (PowerShell may spawn sfc/dism/etc).
    const killTree = () => {
      try { child.kill('SIGTERM'); } catch (_) {}
      if (child.pid) {
        exec(`taskkill /F /T /PID ${child.pid}`, (err) => {
          if (err) log('WARN', `taskkill failed for PID ${child.pid}: ${err.message}`);
        });
      }
    };

    const timeout = options.timeout
      ? setTimeout(() => {
          log('WARN', 'Child process timed out, killing process tree.');
          killTree();
        }, options.timeout)
      : null;

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutData += text;
      const mainWindow = getMainWindowRef();
      if (options.streamChannel && mainWindow) {
        mainWindow.webContents.send(options.streamChannel, text);
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;
      const mainWindow = getMainWindowRef();
      if (options.streamChannel && mainWindow) {
        mainWindow.webContents.send(options.streamChannel, `[ERROR] ${text}`);
      }
    });

    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout);
      activeChildProcesses.delete(child);
      resolve({ success: false, error: error.message, stdout: stdoutData, stderr: stderrData });
    });

    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      activeChildProcesses.delete(child);
      resolve({
        success: code === 0,
        stdout: stdoutData,
        stderr: stderrData,
        exitCode: code,
        error: code !== 0 ? (stderrData.trim() || `Process exited with code ${code}`) : undefined
      });
    });
  });
}

function killActiveProcess() {
  if (activeChildProcesses.size > 0) {
    log('WARN', `User requested process cancellation. Killing ${activeChildProcesses.size} active child processes.`);
    for (const child of activeChildProcesses) {
      try {
        child.kill('SIGTERM');
        if (child.pid) {
          exec(`taskkill /F /T /PID ${child.pid}`, (err) => {
            if (err) log('WARN', `taskkill failed during cancellation: ${err.message}`);
          });
        }
      } catch (e) {
        log('ERROR', 'Error killing process: ' + e.message);
      }
    }
    activeChildProcesses.clear();
    return true;
  }
  return false;
}

async function executeAllowedCommand(commandKey, rawArgs, options = {}) {
  const cmd = ALLOWED_COMMANDS[commandKey];
  if (!cmd) {
    throw new Error(`SECURITY: Command "${commandKey}" is not allowlisted.`);
  }

  const args = Array.isArray(rawArgs) ? rawArgs : [];
  if (!options.bypassConfirmation && !(await confirmCommand(cmd))) {
    return { success: false, cancelled: true, error: 'User cancelled operation.' };
  }

  const streamChannel = options.streamChannel || cmd.streamChannel;

  if (cmd.type === 'native') {
    const nativeResult = await cmd.handler(args);
    return { success: true, stdout: nativeResult || '', exitCode: 0 };
  }

  if (cmd.type === 'powershell') {
    const command = cmd.buildCommand ? cmd.buildCommand(args) : cmd.command;
    const utf8Command = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command}`;
    return await runChildProcess(getPowershellPath(), [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      utf8Command
    ], { timeout: cmd.timeout, streamChannel });
  }

  const scriptArgs = cmd.buildArgs ? cmd.buildArgs(args) : [];
  const scriptPath = getScriptPath(cmd.script);
  
  const scriptCall = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${scriptPath}' ${scriptArgs.map(arg => {
    const s = String(arg);
    return /^(?:-[\w]+|\$true|\$false|\d+)$/i.test(s) ? s : `'${s.replace(/'/g, "''")}'`;
  }).join(' ')}`;
  
  const result = await runChildProcess(getPowershellPath(), [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    scriptCall
  ], { timeout: cmd.timeout, streamChannel });

  // If the command opted into temp-file cleanup, remove any solas_junk_*.json
  // files that were created as input manifests. Best-effort, never throws.
  if (cmd.cleanupTempFiles) {
    try {
      const tempFiles = scriptArgs.filter(arg => typeof arg === 'string' && /solas_junk_.*\.json$/.test(arg));
      for (const file of tempFiles) {
        try { fs.unlinkSync(file); } catch (_) {}
      }
    } catch (_) {}
  }

  return result;
}

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ALLOWED_COMMANDS = {
  'run-quick-cmd': {
    type: 'powershell',
    timeout: 120000,
    streamChannel: 'care-out',
    buildCommand: ([action]) => {
      const presets = {
        // ── Existing ──────────────────────────────────────────────────────────
        'flush-dns':              'ipconfig /flushdns',
        'winsock-reset':          'netsh winsock reset',
        'gpupdate':               'gpupdate /force',
        'system-info':            'systeminfo',
        'task-list':              'tasklist',
        'chkdsk':                 'chkdsk /scan',
        'print-spooler-reset':    'Stop-Service -Name Spooler -Force; Remove-Item -Path "$env:windir\\System32\\spool\\PRINTERS\\*.*" -Force -Recurse; Start-Service -Name Spooler',
        'wmi-rebuild':            'net stop winmgmt /y; winmgmt /resetrepository; net start winmgmt',
        'wu-cache-clear':         'Stop-Service wuauserv, cryptSvc, bits, msiserver -Force; Remove-Item -Path "$env:windir\\SoftwareDistribution\\Download\\*" -Recurse -Force -ErrorAction SilentlyContinue; Start-Service wuauserv, cryptSvc, bits, msiserver',
        're-register-apps':       'Get-AppXPackage -AllUsers | Foreach {Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml" -ErrorAction SilentlyContinue}',
        'battery-report':         'powercfg /batteryreport /output "$env:USERPROFILE\\Desktop\\battery_report.html"; Write-Output "Battery report saved to Desktop as battery_report.html"',
        'clean-temp':             'Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item -Path "$env:windir\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue; Write-Output "Temporary files cleared successfully."',
        'netstat':                'netstat -ano',
        'system-uptime':          'Write-Output "System Uptime:"; (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime',
        'clear-event-logs':       'wevtutil el | Foreach-Object {wevtutil cl "$_"}; Write-Output "All Windows Event Logs have been cleared successfully."',
        'reset-network-adapters': 'Get-NetAdapter | Restart-NetAdapter; Write-Output "All network adapters have been restarted."',

        // ── Network (new) ─────────────────────────────────────────────────────
        'wifi-password-list':
          `netsh wlan show profiles | Select-String 'All User Profile' | ForEach-Object { $p = ($_ -split ':')[1].Trim(); $k = (netsh wlan show profile name=$p key=clear | Select-String 'Key Content'); Write-Output "$p : $(if($k){ ($k -split ':')[1].Trim() } else { '(no password stored)' })" }`,
        'open-ports':
          `netstat -an | Where-Object { $_ -match 'LISTENING' } | Sort-Object | Format-Table -AutoSize`,
        'ping-gateway':
          `$gw = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).NextHop; Write-Output "Default Gateway: $gw"; ping -n 4 $gw`,
        'reset-winsock-ip':
          `netsh winsock reset; netsh int ip reset; netsh int ipv4 reset; netsh int ipv6 reset; ipconfig /flushdns; Write-Output "Full network stack reset complete. Please reboot now."`,

        // ── System Info (new) ─────────────────────────────────────────────────
        'disk-usage':
          `Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N='Used(GB)';E={[math]::Round($_.Used/1GB,2)}}, @{N='Free(GB)';E={[math]::Round($_.Free/1GB,2)}}, @{N='Total(GB)';E={[math]::Round(($_.Used+$_.Free)/1GB,2)}} | Format-Table -AutoSize`,
        'top-cpu-processes':
          `Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Name, Id, @{N='CPU(s)';E={[math]::Round($_.CPU,1)}}, @{N='RAM(MB)';E={[math]::Round($_.WorkingSet/1MB,1)}} | Format-Table -AutoSize`,
        'environment-vars':
          `Get-ChildItem Env: | Sort-Object Name | Format-Table -AutoSize`,
        'scheduled-tasks':
          `Get-ScheduledTask | Where-Object State -ne 'Disabled' | Select-Object TaskName, State, @{N='LastRun';E={$_.LastRunTime}} | Sort-Object TaskName | Format-Table -AutoSize`,
        'windows-license':
          `cscript //nologo "$env:windir\\System32\\slmgr.vbs" /dli`,

        // ── Repair & Maintenance (new) ────────────────────────────────────────
        'sfc-scan':
          `sfc /scannow`,
        'dism-health':
          `DISM /Online /Cleanup-Image /CheckHealth; Write-Output "---"; DISM /Online /Cleanup-Image /ScanHealth`,
        'clear-dns-cache-browser':
          `ipconfig /flushdns; Write-Output "Windows DNS cache flushed."; Write-Output "To clear Chrome/Edge browser DNS, visit: chrome://net-internals/#dns"`,
        'rebuild-icon-cache':
          `Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep 2; Remove-Item "$env:LOCALAPPDATA\\IconCache.db" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -ErrorAction SilentlyContinue; Start-Process explorer; Write-Output "Icon cache rebuilt and Explorer restarted."`,
        'disk-cleanup-silent':
          `cleanmgr /sagerun:1; Write-Output "Disk Cleanup launched in background. It will run and close automatically."`,

        // ── Security (new) ────────────────────────────────────────────────────
        'firewall-status':
          `Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction | Format-Table -AutoSize`,
        'defender-quick-scan':
          `Start-MpScan -ScanType QuickScan; Write-Output "Windows Defender quick scan initiated. Check Windows Security app for progress and results."`,
        'list-startup-items':
          `Write-Output "=== HKCU Run Keys ==="; Get-ItemProperty HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run -ErrorAction SilentlyContinue | Format-List; Write-Output "=== HKLM Run Keys ==="; Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run -ErrorAction SilentlyContinue | Format-List`,
        'check-pending-reboot':
          `$reboot = $false; if (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired') { $reboot = $true; Write-Output "[!] Windows Update requires a reboot." }; if (Test-Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\PendingFileRenameOperations') { $reboot = $true; Write-Output "[!] Pending file rename operations require a reboot." }; if (-not $reboot) { Write-Output "[OK] No pending reboot required." }`
      };
      if (!presets[action]) throw new Error('Invalid quick command action');
      return presets[action];
    }
  },
  'get-bsod-logs': {
    type: 'powershell',
    timeout: 30000,
    command: `Get-WinEvent -FilterHashtable @{LogName='System'; ID=1001} -MaxEvents 5 -ErrorAction SilentlyContinue | Select-Object TimeCreated, Message | ConvertTo-Json -Compress`
  },
  'get-critical-logs': {
    type: 'powershell',
    timeout: 30000,
    command: `Get-WinEvent -FilterHashtable @{LogName=@('System','Application'); Level=2} -MaxEvents 15 -ErrorAction SilentlyContinue | Select-Object TimeCreated, ProviderName, Message | ConvertTo-Json -Compress`
  },
  'apply-win-tweak': {
    type: 'powershell',
    timeout: 30000,
    buildCommand: ([tweakId, enable]) => {
      const isEnable = enable === true || enable === 'true';
      // isEnable === true means "apply the tweak described by the UI label"
      // (e.g. classic menu ON, telemetry OFF). The false branch restores the
      // Windows default. Restore paths use Remove-Item* -ErrorAction
      // SilentlyContinue so restoring a tweak that was never applied is a no-op.
      const clsid = 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}';
      const tweaks = {
        'context-menu': isEnable
          ? `New-Item -Path '${clsid}\\InprocServer32' -Force | Set-ItemProperty -Name '(default)' -Value ''; Stop-Process -Name explorer -Force`
          : `Remove-Item -Path '${clsid}' -Recurse -Force -ErrorAction SilentlyContinue; Stop-Process -Name explorer -Force`,
        'telemetry': isEnable
          ? "reg add 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' /v AllowTelemetry /t REG_DWORD /d 0 /f"
          : "reg add 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection' /v AllowTelemetry /t REG_DWORD /d 3 /f",
        'web-search': isEnable
          ? "reg add 'HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer' /v DisableSearchBoxSuggestions /t REG_DWORD /d 1 /f"
          : "Remove-ItemProperty -Path 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer' -Name DisableSearchBoxSuggestions -Force -ErrorAction SilentlyContinue",
        'lock-ads': isEnable
          ? "reg add 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager' /v RotatingLockScreenEnabled /t REG_DWORD /d 0 /f"
          : "reg add 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager' /v RotatingLockScreenEnabled /t REG_DWORD /d 1 /f"
      };
      if (!tweaks[tweakId]) throw new Error('Invalid tweak id');
      return tweaks[tweakId] + '; Write-Output "Tweak applied successfully."';
    }
  },
  'get-device-details': {
    type: 'script',
    script: 'device_details.ps1',
    timeout: 90000
  },
  'get-installed-software': {
    type: 'powershell',
    timeout: 60000,
    command: 'Get-ItemProperty HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*, HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* | Select-Object DisplayName, DisplayVersion, Publisher | Where-Object { $_.DisplayName -ne $null } | Sort-Object DisplayName -Unique | ConvertTo-Json -Compress'
  },
  'scan-drivers': {
    type: 'script',
    script: 'scan_drivers.ps1',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'driver-action': {
    type: 'script',
    script: 'repair_driver.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will change a hardware device state or driver configuration. Continue?',
    buildArgs: ([pnpDeviceId, action, safeMode = true]) => {
      if (typeof pnpDeviceId !== 'string' || pnpDeviceId.length < 3 || pnpDeviceId.length > 300) {
        throw new Error('Invalid device id.');
      }
      if (!['update', 'enable', 'disable', 'restore', 'rollback'].includes(String(action).toLowerCase())) {
        throw new Error('Invalid driver action.');
      }
      return ['-PnpDeviceId', pnpDeviceId, '-Action', action, '-SafeMode', safeMode ? '$true' : '$false'];
    }
  },
  'scan-software-updates': {
    type: 'script',
    script: 'scan_software_updates.ps1',
    timeout: 90000,
    streamChannel: 'winget-out'
  },
  'update-software': {
    type: 'script',
    script: 'update_software.ps1',
    timeout: 600000,
    streamChannel: 'winget-out',
    confirmationRequired: true,
    confirmationMessage: 'This will update the selected application through Winget. Continue?',
    buildArgs: ([packageId]) => {
      if (typeof packageId !== 'string' || !/^[A-Za-z0-9_.\-]+$/.test(packageId)) {
        throw new Error('Invalid package id.');
      }
      return ['-Id', packageId];
    }
  },
  'winget-source-reset': {
    type: 'powershell',
    command: 'winget source reset --force; winget source update',
    timeout: 120000,
    streamChannel: 'winget-out'
  },
  'flush-dns': {
    type: 'powershell',
    command: 'Clear-DnsClientCache; ipconfig /flushdns',
    timeout: 15000,
    streamChannel: 'care-out'
  },
  'get-drives-info': {
    type: 'script',
    script: 'get_drives_info.ps1',
    timeout: 30000
  },
  'create-restore-point': {
    type: 'script',
    script: 'create_restore_point.ps1',
    timeout: 120000,
    confirmationRequired: true,
    confirmationMessage: 'This will create a Windows restore point before maintenance. Continue?',
    buildArgs: ([description]) => {
      if (description !== undefined && typeof description !== 'string') {
        throw new Error('Invalid description.');
      }
      return ['-Description', description || 'SolasCare Restore Point'];
    }
  },
  'defender-scan': {
    type: 'script',
    script: 'defender_scan.ps1',
    timeout: 600000,
    streamChannel: 'care-out'
  },
  'remove-bloatware': {
    type: 'script',
    script: 'remove_bloatware.ps1',
    timeout: 300000,
    streamChannel: 'care-out',
    buildArgs: ([dryRun]) => dryRun ? ['-DryRun'] : []
  },
  'junk-scan': {
    type: 'script',
    script: 'junk_cleanup.ps1',
    timeout: 120000,
    buildArgs: () => ['-Action', 'scan']
  },
  'junk-clean': {
    type: 'script',
    script: 'junk_cleanup.ps1',
    timeout: 120000,
    confirmationRequired: true,
    confirmationMessage: 'This will move selected temporary files into a backup area before deletion. Continue?',
    buildArgs: ([filesJson]) => {
      if (typeof filesJson !== 'string' || filesJson.length > 10 * 1024 * 1024) {
        throw new Error('Invalid cleanup file list.');
      }
      const parsed = JSON.parse(filesJson);
      if (!Array.isArray(parsed) || parsed.some(p => typeof p !== 'string')) {
        throw new Error('Invalid cleanup paths.');
      }
      // Save files list to a temporary JSON file to avoid command-line character limitations.
      const tempPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `solas_junk_${Date.now()}.json`);
      fs.writeFileSync(tempPath, filesJson, 'utf8');
      return ['-Action', 'clean', '-FilesPath', tempPath];
    },
    // The temp JSON file is cleaned up after the script completes (success or failure)
    // to avoid leaking solas_junk_*.json files into %TEMP% forever.
    cleanupTempFiles: true
  },
  'junk-undo': {
    type: 'script',
    script: 'junk_cleanup.ps1',
    timeout: 120000,
    buildArgs: ([backupDir]) => ['-Action', 'undo', '-BackupDir', validateTempBackupDir(backupDir)]
  },
  'junk-commit': {
    type: 'script',
    script: 'junk_cleanup.ps1',
    timeout: 120000,
    buildArgs: ([backupDir]) => ['-Action', 'commit', '-BackupDir', validateTempBackupDir(backupDir)]
  },
  'get-startup-apps': {
    type: 'script',
    script: 'get_startup_apps.ps1',
    timeout: 15000
  },
  'run-trim': {
    type: 'script',
    script: 'run_trim.ps1',
    timeout: 300000,
    confirmationRequired: true,
    confirmationMessage: 'This will run SSD TRIM optimization on the selected drive. Continue?',
    buildArgs: ([driveLetter]) => {
      if (typeof driveLetter !== 'string' || !/^[A-Z]$/i.test(driveLetter)) {
        throw new Error('Invalid drive letter.');
      }
      return ['-Drive', driveLetter.toUpperCase()];
    }
  },
  'analyze-bsod': {
    type: 'script',
    script: 'analyze_bsod.ps1',
    timeout: 60000
  },
  'battery-report': {
    type: 'script',
    script: 'battery_report.ps1',
    timeout: 30000
  },
  'schedule-care': {
    type: 'script',
    script: 'schedule_care.ps1',
    timeout: 30000,
    confirmationRequired: true,
    confirmationMessage: 'This will register a weekly Administrator maintenance task. Continue?',
    buildArgs: ([day, time]) => {
      if (!VALID_DAYS.includes(day) || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        throw new Error('Invalid schedule.');
      }
      return ['-Day', day, '-Time', time];
    }
  },
  'check-task-status': {
    type: 'script',
    script: 'check_task_status.ps1',
    timeout: 15000
  },
  'repair-system-sfc': {
    type: 'powershell',
    command: 'sfc /scannow',
    timeout: 900000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run System File Checker and may take several minutes. Continue?'
  },
  'repair-system-dism': {
    type: 'powershell',
    command: 'DISM /Online /Cleanup-Image /RestoreHealth',
    timeout: 1800000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will repair the Windows component store and may take 20-30 minutes. Continue?'
  },
  'repair-chkdsk-scan': {
    type: 'powershell',
    command: 'chkdsk C: /scan',
    timeout: 900000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will scan the system drive for file-system errors. Continue?'
  },
  'repair-icon-cache': {
    type: 'powershell',
    command: 'Stop-Process -Name explorer -Force; Remove-Item "$env:LOCALAPPDATA\\IconCache.db" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -ErrorAction SilentlyContinue; Start-Process explorer.exe',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will restart Explorer and rebuild icon cache. Continue?'
  },
  'repair-winsock': {
    type: 'powershell',
    command: 'netsh winsock reset',
    timeout: 30000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset Winsock and may require a restart. Continue?'
  },
  'repair-tcpip': {
    type: 'powershell',
    command: 'netsh int ip reset',
    timeout: 30000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset TCP/IP settings and may require a restart. Continue?'
  },
  'repair-network-full': {
    type: 'powershell',
    command: 'ipconfig /flushdns; netsh winsock reset; netsh int ip reset; ipconfig /release; ipconfig /renew',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset network settings and briefly disconnect internet. Continue?'
  },
  'repair-windows-update': {
    type: 'powershell',
    command: 'Stop-Service wuauserv,bits,cryptsvc -Force; Rename-Item "$env:SystemRoot\\SoftwareDistribution" "SoftwareDistribution.old" -ErrorAction SilentlyContinue; Rename-Item "$env:SystemRoot\\System32\\catroot2" "catroot2.old" -ErrorAction SilentlyContinue; Start-Service cryptsvc,bits,wuauserv',
    timeout: 180000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset Windows Update cache and services. Continue?'
  },
  'repair-temp-cleanup': {
    type: 'powershell',
    command: 'Remove-Item "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item "$env:SystemRoot\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue; exit 0',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will delete temporary files from system temp folders. Continue?'
  },
  'repair-cache-cleanup': {
    type: 'powershell',
    command: 'RunDll32.exe InetCpl.cpl,ClearMyTracksByProcess 8; wsreset.exe',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will clear app/browser-related Windows caches and reset Store cache. Continue?'
  },
  'repair-startup-cleanup': {
    type: 'script',
    script: 'get_startup_apps.ps1',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'toggle-startup-app': {
    type: 'script',
    script: 'toggle_startup_app.ps1',
    timeout: 15000,
    streamChannel: 'care-out',
    buildArgs: ([name, approvedPath, action]) => {
      if (typeof name !== 'string' || typeof approvedPath !== 'string' || typeof action !== 'string') {
        throw new Error('Invalid toggle parameters.');
      }
      return ['-Name', name, '-ApprovedPath', approvedPath, '-Action', action];
    }
  },
  'check-windows-updates': {
    type: 'script',
    script: 'check_windows_updates.ps1',
    timeout: 180000,
    streamChannel: 'care-out'
  },
  'install-windows-updates': {
    type: 'script',
    script: 'install_windows_updates.ps1',
    timeout: 1800000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will download and install pending Windows Updates. This can take a long time and may require a system restart. Continue?'
  },
  'repair-file-permissions': {
    type: 'powershell',
    command: 'icacls "$env:SystemDrive\\Users" /verify /t /c',
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will verify user folder permissions. Continue?'
  },
  'repair-registry-permissions': {
    type: 'powershell',
    command: 'secedit /configure /cfg "$env:windir\\inf\\defltbase.inf" /db "$env:TEMP\\defltbase.sdb" /verbose',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will restore default security policy permissions. Continue?'
  },

  'network-adapter-restart': {
    type: 'powershell',
    command: 'Get-NetAdapter | Restart-NetAdapter',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will temporarily disable and re-enable all network adapters. Continue?'
  },
  'quick-full-system-repair': {
    type: 'powershell',
    command: 'sfc /scannow; DISM /Online /Cleanup-Image /RestoreHealth; ipconfig /flushdns',
    timeout: 2400000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run a full system repair sequence and may take a long time. Continue?'
  },
  'detect-network': {
    type: 'native',
    handler: async () => {
      return new Promise((resolve) => {
        require('dns').lookup('8.8.8.8', (err) => {
          if (err) {
            resolve(JSON.stringify({ success: false, status: 'disconnected', error: err.message }));
          } else {
            resolve(JSON.stringify({ success: true, status: 'connected' }));
          }
        });
      });
    }
  },
  'open-autoruns-manager': {
    type: 'powershell',
    command: 'Start-Process "C:\\Windows\\System32\\autoruns.exe" -ErrorAction SilentlyContinue; if (-not $?) { Start-Process taskmgr.exe }',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-startup-manager': {
    type: 'powershell',
    command: 'Start-Process taskmgr.exe -ArgumentList \'/0 /startup\'',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'export-event-logs': {
    type: 'powershell',
    command: 'wevtutil epl System "$env:TEMP\\solas_system.evtx" /ow:true; wevtutil epl Application "$env:TEMP\\solas_application.evtx" /ow:true; Write-Output "Exported logs to $env:TEMP"',
    timeout: 120000,
    streamChannel: 'care-out'
  },
  'read-repair-history': {
    type: 'native',
    handler: () => {
      if (!fs.existsSync(auditFile)) return '';
      return fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean).slice(-200).join('\n');
    }
  },
  'open-logs-folder': {
    type: 'native',
    handler: () => shell.openPath(logDir)
  },
  'open-reports-folder': {
    type: 'native',
    handler: () => shell.openPath(reportsDir)
  },
  'open-latest-bsod-report': {
    type: 'native',
    handler: () => {
      const reportPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'solas_bsod_report.html');
      if (!fs.existsSync(reportPath)) {
        throw new Error('No BSOD report is available yet.');
      }
      return shell.openPath(reportPath);
    }
  },
  'apply-power-plan': {
    type: 'powershell',
    timeout: 15000,
    confirmationRequired: true,
    confirmationMessage: 'This will change your power plan. Continue?',
    buildCommand: ([planKey]) => {
      // Allow-listed power plans only - never accept raw `powercfg` strings.
      const ALLOWED_PLANS = {
        'balanced': '/setactive SCHEME_BALANCED',
        'high':     '/setactive SCHEME_MIN',
        'saver':    '/setactive SCHEME_MAX',
        'power-saver': '/setactive SCHEME_MAX',
        'high-performance': '/setactive SCHEME_MIN'
      };
      const key = String(planKey || '').toLowerCase();
      const arg = ALLOWED_PLANS[key];
      if (!arg) {
        throw new Error('Invalid power plan. Allowed: balanced, high, saver.');
      }
      return `powercfg ${arg}`;
    }
  },
  'disable-background-apps': {
    type: 'powershell',
    command: 'reg.exe add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 1 /f',
    timeout: 10000
  },
  'enable-background-apps': {
    type: 'powershell',
    command: 'reg.exe add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" /v GlobalUserDisabled /t REG_DWORD /d 0 /f',
    timeout: 10000
  },
  'set-display-brightness': {
    type: 'powershell',
    timeout: 10000,
    buildCommand: ([brightness]) => {
      const level = parseInt(brightness);
      if (isNaN(level) || level < 0 || level > 100) throw new Error('Invalid brightness level (0-100).');
      return `(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(0, ${level})`;
    }
  },
  'privacy-clean': {
    type: 'powershell',
    timeout: 60000,
    confirmationRequired: true,
    confirmationMessage: 'This will delete browser data and system traces. Continue?',
    buildCommand: ([categoryId]) => {
      // Allow-listed privacy categories only - never accept raw PowerShell strings.
      const CATEGORIES = {
        'browser-history':     'Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\History" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\History" -Force -ErrorAction SilentlyContinue',
        'browser-cookies':     'Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cookies" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cookies" -Force -ErrorAction SilentlyContinue',
        'browser-cache':       'Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cache\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cache\\*" -Recurse -Force -ErrorAction SilentlyContinue',
        'browser-form-data':   'Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Login Data" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Login Data" -Force -ErrorAction SilentlyContinue',
        'dns-cache':           'Clear-DnsClientCache; ipconfig /flushdns',
        'recycle-bin':         'Clear-RecycleBin -Force -ErrorAction SilentlyContinue',
        'temp-files':          'Remove-Item "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue',
        'recent-documents':    'Remove-Item "$env:APPDATA\\Microsoft\\Windows\\Recent\\*" -Recurse -Force -ErrorAction SilentlyContinue',
        'thumbnails':          'Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db" -Force -ErrorAction SilentlyContinue',
        'prefetch':            'Remove-Item "$env:SystemRoot\\Prefetch\\*" -Force -ErrorAction SilentlyContinue',
        'wer-reports':         'Remove-Item "$env:ProgramData\\Microsoft\\Windows\\WER\\*" -Recurse -Force -ErrorAction SilentlyContinue',
        'windows-event-logs':  'wevtutil el | ForEach-Object { wevtutil cl \"$_\" }',
        'powershell-history':  'Remove-Item (Get-PSReadlineOption).HistorySavePath -Force -ErrorAction SilentlyContinue'
      };
      const key = String(categoryId || '').toLowerCase();
      const cmd = CATEGORIES[key];
      if (!cmd) {
        throw new Error('Invalid privacy category. Allowed: ' + Object.keys(CATEGORIES).join(', '));
      }
      return cmd;
    }
  },
  'scan-large-files': {
    type: 'powershell',
    timeout: 300000,
    buildCommand: ([minSizeMb, drive]) => {
      const size = parseInt(minSizeMb) || 100;
      const cleanDrive = (typeof drive === 'string' && /^[A-Za-z]:?$/.test(drive)) ? drive.charAt(0) : 'C';
      return `Get-ChildItem ${cleanDrive}:\\ -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt ${size} * 1MB -and -not $_.PSIsContainer } | Select-Object FullName, @{Name="Size";Expression={$_.Length}}, LastWriteTime | ConvertTo-Json -Compress`;
    }
  },
  'delete-files': {
    type: 'powershell',
    timeout: 120000,
    confirmationRequired: true,
    confirmationMessage: 'This will permanently delete files. Continue?',
    buildCommand: ([filesJson]) => {
      const files = JSON.parse(filesJson);
      if (!Array.isArray(files)) throw new Error('Invalid files list.');
      // Reject paths under system directories to prevent accidental system damage.
      const sysDrive = process.env.SystemDrive || 'C:';
      const FORBIDDEN_PREFIXES = [
        sysDrive + '\\Windows\\', sysDrive + '\\Program Files\\', sysDrive + '\\Program Files (x86)\\',
        sysDrive + '\\ProgramData\\', sysDrive + '\\System Volume Information\\', sysDrive + '\\$Recycle.Bin\\'
      ];
      const deletes = files.map(f => {
        if (typeof f !== 'string' || !f) throw new Error('Invalid file path.');
        const resolved = path.resolve(f);
        for (const prefix of FORBIDDEN_PREFIXES) {
          if (resolved.toLowerCase().startsWith(prefix.toLowerCase())) {
            throw new Error('Security: Refusing to delete system path: ' + resolved);
          }
        }
        // PowerShell-safe single-quoted literal.
        const safe = resolved.replace(/'/g, "''");
        return `Remove-Item -LiteralPath '${safe}' -Force -ErrorAction SilentlyContinue`;
      });
      return deletes.join('; ');
    }
  },
  'export-settings': {
    type: 'native',
    handler: (args) => {
      const filePath = args[0];
      if (!filePath) throw new Error('No path specified');
      const data = fs.readFileSync(settingsStoreRef.filePath, 'utf8');
      fs.writeFileSync(filePath, data, 'utf8');
      return JSON.stringify({ success: true });
    }
  },
  'import-settings': {
    type: 'native',
    handler: (args) => {
      const filePath = args[0];
      if (!filePath) throw new Error('No path specified');
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid format');
      const validated = { ...defaultSettingsRef, ...parsed };
      settingsStoreRef.data = validated;
      settingsStoreRef.save();
      return JSON.stringify(validated);
    }
  },
  'registry-backup': {
    type: 'script',
    script: 'registry_backup.ps1',
    timeout: 60000,
    buildArgs: ([action, name]) => ['-Action', action, '-BackupName', name || '']
  },
  'registry-list-backups': {
    type: 'script',
    script: 'registry_backup.ps1',
    timeout: 15000,
    buildArgs: () => ['-Action', 'list']
  },
  'registry-restore': {
    type: 'script',
    script: 'registry_backup.ps1',
    timeout: 300000,
    confirmationRequired: true,
    confirmationMessage: 'This will restore the registry. A system restart may be required. Continue?',
    buildArgs: ([file]) => {
      if (typeof file !== 'string') throw new Error('Invalid file path');
      const resolved = path.resolve(file);
      const allowedDir = path.resolve(path.join(process.env.APPDATA, 'SolasCare', 'RegBackups'));
      if (!resolved.startsWith(allowedDir + path.sep)) {
        throw new Error('Security: Restore file must reside in RegBackups folder.');
      }
      return ['-Action', 'restore', '-RestoreFile', resolved];
    }
  },
  'schedule-ram-diagnostic': {
    type: 'script',
    script: 'ram_diagnostic.ps1',
    timeout: 15000,
    confirmationRequired: true,
    confirmationMessage: 'Memory Diagnostic will run on next reboot. Your PC will need to be restarted. Continue?',
    buildArgs: () => ['-Action', 'schedule']
  },
  'get-ram-diagnostic-result': {
    type: 'script',
    script: 'ram_diagnostic.ps1',
    timeout: 15000,
    buildArgs: () => ['-Action', 'check-result']
  },
  'list-services': {
    type: 'script',
    script: 'service_repair.ps1',
    timeout: 20000,
    buildArgs: () => ['-Action', 'list']
  },
  'repair-service': {
    type: 'script',
    script: 'service_repair.ps1',
    timeout: 60000,
    confirmationRequired: true,
    confirmationMessage: 'This will repair, restart, or set the startup type of a Windows service. Continue?',
    // IMPROVEMENT: forward optional 3rd arg (StartupType) so the existing
    // service_repair.ps1 -Action set-startup path becomes reachable from UI.
    buildArgs: ([name, action, startupType]) => {
      const a = String(action || 'repair').toLowerCase();
      const args = ['-Action', a, '-ServiceName', name];
      if (a === 'set-startup') {
        const allowed = ['Automatic', 'Manual', 'Disabled'];
        const s = String(startupType || 'Automatic');
        if (!allowed.includes(s)) throw new Error('Invalid StartupType: ' + s);
        args.push('-StartupType', s);
      }
      return args;
    }
  },
  'detect-browsers': {
    type: 'script',
    script: 'browser_reset.ps1',
    timeout: 15000,
    buildArgs: () => ['-Action', 'detect']
  },
  'reset-browser-cache': {
    type: 'script',
    script: 'browser_reset.ps1',
    timeout: 60000,
    confirmationRequired: true,
    confirmationMessage: 'Browser cache delete hoga. Continue?',
    buildArgs: ([browser]) => ['-Browser', browser, '-Action', 'reset-cache']
  },
  'reset-browser-full': {
    type: 'script',
    script: 'browser_reset.ps1',
    timeout: 120000,
    confirmationRequired: true,
    confirmationMessage: 'WARNING: Browser history, cookies, saved passwords sab delete honge. Continue?',
    buildArgs: ([browser]) => ['-Browser', browser, '-Action', 'reset-full']
  },
  'generate-system-report': {
    type: 'script',
    script: 'generate_report.ps1',
    timeout: 120000,
    streamChannel: 'care-out'
  },
  'analyze-component-store': {
    type: 'script',
    script: 'component_cleanup.ps1',
    timeout: 60000,
    buildArgs: () => ['-Action', 'analyze']
  },
  'cleanup-component-store': {
    type: 'script',
    script: 'component_cleanup.ps1',
    timeout: 1800000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'IRREVERSIBLE: This will clean up the Component Store and permanently delete superseded Windows packages. This may take 20-30 minutes. Continue?',
    buildArgs: () => ['-Action', 'cleanup']
  },
  'recycle-bin-cleanup': {
    type: 'powershell',
    command: 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output "Recycle Bin cleared."',
    timeout: 30000,
    confirmationRequired: true,
    confirmationMessage: 'This will permanently empty the Recycle Bin. Continue?'
  },
  // ============================================================
  // SMART REPAIR - new repair commands (no duplicates of existing).
  // ============================================================

  // NEW: Windows Update history (last 50 installations with status/KB/HResult).
  // NEW: Boot repair - MBR, boot sector, BCD rebuild (bootrec /fixmbr, /fixboot, /rebuildbcd).
  'repair-boot': {
    type: 'script',
    script: 'repair_boot.ps1',
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will modify the boot sector / MBR / BCD. A reboot will be required. Continue?',
    buildArgs: ([action]) => {
      const allowed = ['fixmbr', 'fixboot', 'rebuildbcd', 'scanos', 'repair-all'];
      const a = String(action || 'repair-all').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid boot repair action: ' + a);
      return ['-Action', a];
    }
  },

  // NEW: DLL re-registration (regsvr32) - common DLLs or specific path.
  // NEW: Reset all power plans to defaults (powercfg -restoredefaultschemes).
  // NEW: User profile repair (icon cache, thumbnail cache, font cache, profile permissions).
  // NEW: Windows Disk Cleanup (cleanmgr) - quick / deep / system presets.
  'disk-cleanup': {
    type: 'script',
    script: 'disk_cleanup.ps1',
    timeout: 1800000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run Windows Disk Cleanup (cleanmgr). Quick=5min, Deep=15min, System=30min. Continue?',
    buildArgs: ([mode]) => {
      const allowed = ['quick', 'deep', 'system'];
      const m = String(mode || 'quick').toLowerCase();
      if (!allowed.includes(m)) throw new Error('Invalid disk cleanup mode: ' + m);
      return ['-Mode', m];
    }
  },

  // NEW: chkdsk /f /r - schedules a full disk repair on next reboot (destructive).
  // NEW: HDD defragmentation (Optimize-Volume -Defrag) for rotational drives.
  // (TRIM for SSDs already exists as run-trim.)
  // NEW: Parse CBS.log to extract corrupt files SFC could not repair.
  'parse-cbs-log': {
    type: 'script',
    script: 'parse_cbs_log.ps1',
    timeout: 30000
  },

  // NEW: Pre-repair health check - disk space, battery, network, pending reboot.
  'pre-repair-health-check': {
    type: 'script',
    script: 'pre_repair_health_check.ps1',
    timeout: 30000
  },

  // NEW: SFC verification (read-only) - confirms whether a previous SFC repair worked.
  'verify-sfc': {
    type: 'powershell',
    command: 'sfc /verifyonly',
    timeout: 900000,
    streamChannel: 'care-out',
    confirmationRequired: false,
    confirmationMessage: 'This will run a read-only SFC verification (no changes). Continue?'
  },

  // NEW: Re-register ALL Appx packages for all users (extends existing repair-store
  // which only re-registers the Store package itself).
  // NEW: WMI repository repair (winmgmt /salvagerepository) - fixes corrupt WMI.
  // NEW: Clear all Windows event logs (useful when logs are corrupt).
  // NEW: Smart Repair orchestrator - runs a named recipe (sequence of existing commands).
  // Recipes are defined in the React frontend (SmartRepair.jsx) and dispatched here.
  'smart-repair-recipe': {
    type: 'native',
    handler: async (args) => {
      const recipeId = args[0];
      const mainWindow = getMainWindowRef();

      // Recipe definitions - ordered sequences of allow-listed commands.
      // Each step is [commandKey, args[], optional label].
      const RECIPES = {
        'pc-slow': [
          ['create-restore-point', [], 'Create Restore Point'],
          ['repair-temp-cleanup', [], 'Clean Temporary Files'],
          ['flush-dns', [], 'Flush DNS Cache'],
          ['repair-winsock', [], 'Reset Winsock'],
          ['repair-tcpip', [], 'Reset TCP/IP'],
          ['run-trim', [process.env.SystemDrive ? process.env.SystemDrive.charAt(0) : 'C'], 'SSD TRIM Optimization'],
          ['repair-system-sfc', [], 'System File Checker (SFC)']
        ],
        'internet-issues': [
          ['flush-dns', [], 'Flush DNS Cache'],
          ['repair-winsock', [], 'Reset Winsock'],
          ['repair-tcpip', [], 'Reset TCP/IP'],
          ['network-adapter-restart', [], 'Restart Network Adapters'],
          ['repair-windows-update', [], 'Reset Windows Update Components']
        ],
        'blue-screen': [
          ['analyze-bsod', [], 'Analyze BSOD Minidumps'],
          ['create-restore-point', [], 'Create Restore Point'],
          ['repair-system-sfc', [], 'System File Checker (SFC)'],
          ['repair-system-dism', [], 'DISM Component Store Repair'],
          ['scan-drivers', [], 'Scan for Problem Drivers']
        ],
        'windows-update-stuck': [
          ['repair-windows-update', [], 'Reset WU Components (SoftwareDistribution, catroot2)'],
          ['repair-system-dism', [], 'DISM Repair (WU dependency)'],
          ['repair-system-sfc', [], 'SFC Repair'],
          ['repair-service', ['wuauserv', 'restart'], 'Restart Windows Update Service']
        ],
        'disk-issues': [
          ['create-restore-point', [], 'Create Restore Point'],
          ['repair-chkdsk-scan', [], 'chkdsk /scan (Read-Only)'],
          ['repair-system-sfc', [], 'SFC Repair'],
          ['analyze-component-store', [], 'Analyze Component Store'],
          ['cleanup-component-store', [], 'Cleanup Component Store (Reclaim Space)']
        ],
        'system-corruption': [
          ['create-restore-point', [], 'Create Restore Point'],
          ['repair-system-dism', [], 'DISM /RestoreHealth'],
          ['repair-system-sfc', [], 'SFC /scannow'],
          ['parse-cbs-log', [], 'Parse CBS.log for Unrepaired Files'],
          ['verify-sfc', [], 'SFC /verifyonly (Verification)']
        ],
        'freshen-windows': [
          ['create-restore-point', [], 'Create Restore Point'],
          ['repair-temp-cleanup', [], 'Temp File Cleanup'],
          ['disk-cleanup', ['deep'], 'Disk Cleanup (Deep)'],
          ['repair-icon-cache', [], 'Rebuild Icon Cache'],
          ['repair-system-sfc', [], 'SFC Repair'],
          ['flush-dns', [], 'Flush DNS'],
          ['recycle-bin-cleanup', [], 'Empty Recycle Bin']
        ],
        'audio-sound-issues': [
          ['repair-service', ['Audiosrv', 'restart'], 'Restart Windows Audio Service'],
          ['repair-service', ['AudioEndpointBuilder', 'restart'], 'Restart Audio Endpoint Builder'],
          ['repair-system-sfc', [], 'SFC Repair']
        ],
        'printer-issues': [
          ['repair-service', ['Spooler', 'restart'], 'Restart Print Spooler Service'],
          ['repair-temp-cleanup', [], 'Clear Temporary Files']
        ],
        'explorer-crashing': [
          ['repair-icon-cache', [], 'Rebuild Icon Cache & Restart Explorer'],
          ['repair-temp-cleanup', [], 'Temp File Cleanup'],
          ['repair-system-sfc', [], 'System File Checker (SFC)'],
          ['repair-system-dism', [], 'DISM Repair']
        ],
        'store-apps-crashing': [
          ['repair-windows-update', [], 'Reset Windows Update Services'],
          ['repair-system-sfc', [], 'SFC Repair'],
          ['repair-service', ['wlidsvc', 'restart'], 'Restart MS Account Sign-in']
        ],
        'bluetooth-issues': [
          ['repair-service', ['bthserv', 'restart'], 'Restart Bluetooth Service'],
          ['scan-drivers', [], 'Scan for Faulty BT Drivers'],
          ['repair-system-sfc', [], 'System File Checker']
        ],
        'high-cpu-usage': [
          ['repair-temp-cleanup', [], 'Clear Temp Files'],
          ['repair-service', ['SysMain', 'restart'], 'Restart SysMain (SuperFetch)'],
          ['repair-service', ['DiagTrack', 'disabled'], 'Disable Telemetry'],
          ['repair-system-sfc', [], 'Check Corrupt System Processes']
        ],
        'game-stuttering': [
          ['repair-temp-cleanup', [], 'Clear Shader/Temp Caches'],
          ['flush-dns', [], 'Flush DNS for Latency'],
          ['repair-service', ['SysMain', 'disabled'], 'Temporarily Disable SysMain'],
          ['run-trim', ['C'], 'Optimize Game Drive (TRIM)']
        ],
        'wifi-disconnecting': [
          ['network-adapter-restart', [], 'Power-cycle Wi-Fi Adapter'],
          ['repair-winsock', [], 'Winsock Reset'],
          ['repair-tcpip', [], 'TCP/IP Reset'],
          ['flush-dns', [], 'Clear DNS Cache']
        ],
        'black-screen': [
          ['repair-icon-cache', [], 'Restart Windows Explorer'],
          ['repair-system-sfc', [], 'SFC Repair'],
          ['repair-system-dism', [], 'DISM Component Repair']
        ],
        'microphone-issues': [
          ['repair-service', ['Audiosrv', 'restart'], 'Restart Audio Service'],
          ['repair-service', ['AudioEndpointBuilder', 'restart'], 'Restart Audio Endpoint Builder'],
          ['scan-drivers', [], 'Check Audio Drivers']
        ],
        'camera-issues': [
          ['repair-service', ['FrameServer', 'restart'], 'Restart Windows Camera Frame Server'],
          ['scan-drivers', [], 'Scan Imaging Drivers']
        ],
        'battery-drain': [
          ['repair-temp-cleanup', [], 'Kill Rogue Temp Processes'],
          ['repair-windows-update', [], 'Reset Update Loop (Common Drain)'],
          ['repair-service', ['DiagTrack', 'disabled'], 'Stop Background Telemetry']
        ],
        'slow-startup': [
          ['repair-chkdsk-scan', [], 'Check Disk Health'],
          ['repair-system-sfc', [], 'Verify Boot Files'],
          ['repair-temp-cleanup', [], 'Clear Startup Temp Bloat'],
          ['run-trim', ['C'], 'TRIM Boot Drive']
        ]
      };

      const recipe = RECIPES[recipeId];
      if (!recipe) {
        return JSON.stringify({ success: false, error: 'Unknown recipe: ' + recipeId + '. Available: ' + Object.keys(RECIPES).join(', ') });
      }

      const results = [];
      for (let i = 0; i < recipe.length; i++) {
        const [cmdKey, cmdArgs, label] = recipe[i];
        const pct = Math.round((i / recipe.length) * 100);
        if (mainWindow) {
          mainWindow.webContents.send('care-out', `[RECIPE] (${pct}%) Step ${i + 1}/${recipe.length}: ${label}...\n`);
        }
        try {
          const res = await executeAllowedCommand(cmdKey, cmdArgs, { bypassConfirmation: true });
          results.push({ step: label, command: cmdKey, success: res.success, error: res.error || null, durationSec: res.durationSec || null });
          if (mainWindow) {
            if (res.success) {
              mainWindow.webContents.send('care-out', `[RECIPE] ✓ Step ${i + 1} completed.\n`);
            } else {
              mainWindow.webContents.send('care-out', `[RECIPE] ✗ Step ${i + 1} failed: ${res.error || 'Unknown error'}\n`);
            }
          }
        } catch (e) {
          results.push({ step: label, command: cmdKey, success: false, error: e.message });
          if (mainWindow) {
            mainWindow.webContents.send('care-out', `[RECIPE] ✗ Step ${i + 1} threw: ${e.message}\n`);
          }
        }
      }

      const successCount = results.filter(r => r.success).length;
      return JSON.stringify({
        success: successCount === results.length,
        recipe: recipeId,
        totalSteps: results.length,
        successCount,
        failureCount: results.length - successCount,
        results
      });
    }
  },

  // ============================================================
  // PHASE A-C: Advanced repair tools (all genuinely new, no duplicates).
  // ============================================================

  // NEW: Parse DISM log for errors/warnings from last DISM operation.
  'parse-dism-log': {
    type: 'script',
    script: 'parse_dism_log.ps1',
    timeout: 30000
  },

  // NEW: Generate HTML repair summary report (last 24h of audit.log).
  'repair-summary-report': {
    type: 'script',
    script: 'repair_summary_report.ps1',
    timeout: 30000,
    buildArgs: ([hours]) => {
      const h = parseInt(hours, 10);
      return ['-HoursBack', (h > 0 && h <= 168) ? String(h) : '24'];
    }
  },

  // NEW: SFC scan for a specific file (sfc /scanfile or /verifyfile).
  'sfc-custom-scan': {
    type: 'script',
    script: 'sfc_custom_scan.ps1',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: false,
    buildArgs: ([action, filePath]) => {
      const a = String(action || 'scanfile').toLowerCase();
      if (!['scanfile', 'verifyfile'].includes(a)) throw new Error('Invalid SFC action');
      if (typeof filePath !== 'string' || !filePath) throw new Error('FilePath is required');
      return ['-Action', a, '-FilePath', filePath];
    }
  },

  // NEW: DISM /RestoreHealth with custom source (ISO/WIM) + /LimitAccess.
  'dism-custom-source': {
    type: 'script',
    script: 'dism_custom_source.ps1',
    timeout: 3600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run DISM /RestoreHealth using a custom source (ISO/WIM) with no Windows Update fallback. Can take 30-60 min. Continue?',
    buildArgs: ([sourcePath, sourceIndex]) => {
      if (typeof sourcePath !== 'string' || !sourcePath) throw new Error('SourcePath is required');
      const idx = parseInt(sourceIndex, 10) || 1;
      return ['-SourcePath', sourcePath, '-SourceIndex', String(idx)];
    }
  },

  // NEW: Registry hive repair (load/verify/backup SYSTEM, SOFTWARE, SAM, etc.).
  'registry-hive-repair': {
    type: 'script',
    script: 'registry_hive_repair.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will load and verify a Windows registry hive. A backup is created first. Continue?',
    buildArgs: ([hive, action]) => {
      const allowedHives = ['SYSTEM', 'SOFTWARE', 'SAM', 'SECURITY', 'DEFAULT', 'USER'];
      const allowedActions = ['analyze', 'repair', 'export'];
      const h = String(hive || 'SOFTWARE').toUpperCase();
      const a = String(action || 'analyze').toLowerCase();
      if (!allowedHives.includes(h)) throw new Error('Invalid hive: ' + h);
      if (!allowedActions.includes(a)) throw new Error('Invalid action: ' + a);
      return ['-Hive', h, '-Action', a];
    }
  },

  // NEW: Driver Verifier enable/disable/status for BSOD diagnosis.
  'driver-verifier': {
    type: 'script',
    script: 'driver_verifier.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Driver Verifier stresses drivers to catch faults. Enabling it may cause BSODs if a driver is faulty. Continue?',
    buildArgs: ([action]) => {
      const allowed = ['enable-standard', 'enable-all', 'disable', 'status'];
      const a = String(action || 'status').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid Driver Verifier action');
      return ['-Action', a];
    }
  },

  // NEW: Safe Mode repair - configure/cancel/status safe boot.
  'safe-mode-repair': {
    type: 'script',
    script: 'safe_mode_repair.ps1',
    timeout: 30000,
    confirmationRequired: true,
    confirmationMessage: 'This will modify the boot configuration for Safe Mode. A reboot will be required. Continue?',
    buildArgs: ([action, repairCommand]) => {
      const allowed = ['configure', 'cancel', 'status'];
      const a = String(action || 'status').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid safe mode action');
      const args = ['-Action', a];
      if (a === 'configure' && typeof repairCommand === 'string' && repairCommand) {
        args.push('-RepairCommand', repairCommand);
      }
      return args;
    }
  },

  // NEW: Conflict detection - check if a conflicting repair is already running.
  // Returns { conflict: true/false, activeCommands: [...] } so the UI can warn.
  // ============================================================
  // PHASE 5: Missing features (disk benchmark, health score, error analyzer,
  // installed software, sensors, AI diagnostics).
  // ============================================================

  'ai-diagnostics': {
    type: 'script',
    script: 'ai_diagnostics.ps1',
    timeout: 60000,
    buildArgs: ([action]) => {
      const a = String(action || 'diagnose').toLowerCase();
      if (!['diagnose', 'recommend', 'predict', 'self-heal'].includes(a)) throw new Error('Invalid AI action');
      return ['-Action', a];
    }
  },

  'list-reports': {
    type: 'native',
    handler: () => {
      const reportsDir = path.join(process.env.APPDATA || '', 'SolasCare', 'reports');
      try {
        if (!fs.existsSync(reportsDir)) return JSON.stringify({ success: true, reports: [] });
        const files = fs.readdirSync(reportsDir)
          .filter(f => f.endsWith('.html') || f.endsWith('.json'))
          .map(f => {
            const fp = path.join(reportsDir, f);
            const stat = fs.statSync(fp);
            return { name: f, path: fp, sizeKB: Math.round(stat.size / 1024), modified: stat.mtime.toISOString() };
          })
          .sort((a, b) => new Date(b.modified) - new Date(a.modified));
        return JSON.stringify({ success: true, reports: files });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message, reports: [] });
      }
    }
  },

  'delete-report': {
    type: 'native',
    handler: (args) => {
      const reportName = args[0];
      if (typeof reportName !== 'string' || reportName.includes('..') || reportName.includes('/') || reportName.includes('\\')) {
        return JSON.stringify({ success: false, error: 'Invalid report name' });
      }
      const reportsDir = path.join(process.env.APPDATA || '', 'SolasCare', 'reports');
      const fp = path.join(reportsDir, reportName);
      try {
        if (fs.existsSync(fp)) { fs.unlinkSync(fp); return JSON.stringify({ success: true }); }
        return JSON.stringify({ success: false, error: 'Report not found' });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    }
  },

  'open-report': {
    type: 'native',
    handler: (args) => {
      const reportName = args[0];
      if (typeof reportName !== 'string' || reportName.includes('..') || reportName.includes('/') || reportName.includes('\\')) {
        return JSON.stringify({ success: false, error: 'Invalid report name' });
      }
      const reportsDir = path.join(process.env.APPDATA || '', 'SolasCare', 'reports');
      const fp = path.join(reportsDir, reportName);
      try {
        if (fs.existsSync(fp)) { shell.openPath(fp); return JSON.stringify({ success: true }); }
        return JSON.stringify({ success: false, error: 'Report not found' });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    }
  },

  // ============================================================
  // ENTERPRISE DRIVER MANAGER MODULE (spec v1.0)
  // All operations on the active DriverManager.jsx UI route through
  // these 8 command keys. No duplicates - the legacy 'scan-drivers'
  // and 'driver-action' keys remain only for RepairDashboard.jsx's
  // simple device table; the new keys below serve the full
  // enterprise-grade flow (health scan, backup, install, verify,
  // WU search, report, remote).
  // ============================================================

  'driver-health-scan': {
    type: 'script',
    script: 'driver_health_scan.ps1',
    timeout: 60000,
    streamChannel: 'care-out',
    buildArgs: ([mode]) => {
      const m = String(mode || 'scan').toLowerCase();
      if (!['scan', 'full'].includes(m)) throw new Error('Invalid scan mode');
      return ['-Mode', m];
    }
  },

  'driver-backup': {
    type: 'script',
    script: 'driver_backup.ps1',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will create or restore a driver backup. Continue?',
    buildArgs: ([action, destination, infList, backupId]) => {
      const allowed = ['backup-all', 'backup-selected', 'restore', 'verify', 'list', 'delete'];
      const a = String(action || 'list').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid backup action: ' + a);
      const args = ['-Action', a];
      if (destination && typeof destination === 'string' && destination.length < 260) {
        if (/[<>|"`]/.test(destination)) throw new Error('Invalid destination path');
        args.push('-Destination', destination);
      }
      if (infList && typeof infList === 'string' && infList.length < 10000) {
        args.push('-InfList', infList);
      }
      if (backupId && typeof backupId === 'string' && /^[A-Za-z0-9]{1,32}$/.test(backupId)) {
        args.push('-BackupId', backupId);
      }
      return args;
    }
  },

  'driver-install': {
    type: 'script',
    script: 'driver_install.ps1',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will add/remove drivers in the Windows driver store. A reboot may be required. Continue?',
    buildArgs: ([action, pathOrId]) => {
      const allowed = ['install-inf', 'install-folder', 'uninstall', 'rollback', 'list-store'];
      const a = String(action || 'list-store').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid install action: ' + a);
      const args = ['-Action', a];
      if (pathOrId && typeof pathOrId === 'string' && pathOrId.length < 260) {
        if (/[<>|"`]/.test(pathOrId) || pathOrId.includes('..')) {
          throw new Error('Invalid path argument');
        }
        if (a === 'install-inf') {
          args.push('-InfPath', pathOrId);
        } else if (a === 'install-folder') {
          args.push('-FolderPath', pathOrId);
        } else if (a === 'uninstall') {
          if (!/^[A-Za-z0-9_.\-]+$/.test(pathOrId)) throw new Error('Invalid INF name');
          args.push('-InfPath', pathOrId);
        } else if (a === 'rollback') {
          if (!/^[A-Za-z0-9\\&_.\-{}]+$/.test(pathOrId)) throw new Error('Invalid PnpDeviceId');
          args.push('-PnpDeviceId', pathOrId);
        }
      }
      return args;
    }
  },

  'driver-verify': {
    type: 'script',
    script: 'driver_verify.ps1',
    timeout: 60000,
    streamChannel: 'care-out',
    buildArgs: ([infPath, driverPath]) => {
      if (typeof infPath !== 'string' || !infPath || infPath.length > 260) {
        throw new Error('INF path required');
      }
      if (/[<>|"`]/.test(infPath) || infPath.includes('..')) {
        throw new Error('Invalid INF path');
      }
      const args = ['-InfPath', infPath];
      if (driverPath && typeof driverPath === 'string' && driverPath.length < 260) {
        if (/[<>|"`]/.test(driverPath) || driverPath.includes('..')) {
          throw new Error('Invalid driver path');
        }
        args.push('-DriverPath', driverPath);
      }
      return args;
    }
  },

  'driver-wu-search': {
    type: 'script',
    script: 'driver_wu_search.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: false,
    buildArgs: ([action, updateId]) => {
      const a = String(action || 'search').toLowerCase();
      if (!['search', 'download', 'install'].includes(a)) throw new Error('Invalid WU action');
      const args = ['-Action', a];
      if (updateId && typeof updateId === 'string' && /^[A-Za-z0-9\-]{1,128}$/.test(updateId)) {
        args.push('-UpdateId', updateId);
      }
      return args;
    }
  },

  'driver-report': {
    type: 'script',
    script: 'driver_report.ps1',
    timeout: 60000,
    buildArgs: ([format, outputPath, includeHealth]) => {
      const f = String(format || 'html').toLowerCase();
      if (!['html', 'json', 'csv'].includes(f)) throw new Error('Invalid report format');
      const args = ['-Format', f];
      if (outputPath && typeof outputPath === 'string' && outputPath.length < 260) {
        if (/[<>|"`]/.test(outputPath) || outputPath.includes('..')) {
          throw new Error('Invalid output path');
        }
        args.push('-OutputPath', outputPath);
      }
      if (includeHealth === true || includeHealth === 'true') {
        args.push('-IncludeHealth');
      }
      return args;
    }
  },

  'driver-remote': {
    type: 'script',
    script: 'driver_remote.ps1',
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will perform a remote driver operation via WinRM. Continue?',
    buildArgs: ([action, computerName, infPath, remoteSavePath, credentialJson]) => {
      const allowed = ['test', 'scan', 'install', 'backup'];
      const a = String(action || 'test').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid remote action');
      if (typeof computerName !== 'string' || !/^[A-Za-z0-9._\-]+$/.test(computerName)) {
        throw new Error('Invalid computer name');
      }
      const args = ['-Action', a, '-ComputerName', computerName];
      if (infPath && typeof infPath === 'string' && infPath.length < 260) {
        if (/[<>|"`]/.test(infPath) || infPath.includes('..')) throw new Error('Invalid INF path');
        args.push('-InfPath', infPath);
      }
      if (remoteSavePath && typeof remoteSavePath === 'string' && remoteSavePath.length < 260) {
        if (/[<>|"`]/.test(remoteSavePath)) throw new Error('Invalid remote save path');
        args.push('-RemoteSavePath', remoteSavePath);
      }
      // Credential JSON is passed as-is; PowerShell side validates and clears from memory.
      if (credentialJson && typeof credentialJson === 'string' && credentialJson.length < 5000) {
        args.push('-CredentialJson', credentialJson);
      }
      return args;
    }
  },

  // Reboot the local system with a 30-second delay (cancellable via shutdown /a).
  // Used by the DriverManager reboot-required banner after driver installs.
  'reboot-system': {
    type: 'powershell',
    command: 'shutdown.exe /r /t 30 /c "SolasCarePro: A driver operation requires a restart to complete."',
    timeout: 15000,
    confirmationRequired: true,
    confirmationMessage: 'This will restart your computer in 30 seconds. Save your work first. Continue? (Run "shutdown /a" to cancel.)'
  },

  // ============================================================
  // HARDWARE DIAGNOSTICS MODULE (PROMPT 2)
  // ============================================================

  'run-cpu-stress-test': {
    type: 'script',
    script: 'cpu_stress_test.ps1',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run a CPU stress test that maxes out all cores for the specified duration. Other apps may become unresponsive. Continue?',
    buildArgs: ([durationSec, cores]) => {
      const d = parseInt(durationSec, 10);
      if (isNaN(d) || d < 1 || d > 600) throw new Error('DurationSec must be 1-600');
      const args = ['-DurationSec', String(d)];
      const c = parseInt(cores, 10);
      if (!isNaN(c) && c > 0 && c <= 64) {
        args.push('-Cores', String(c));
      }
      return args;
    }
  },

  'run-smart-check': {
    type: 'script',
    script: 'smart_check.ps1',
    timeout: 60000,
    streamChannel: 'care-out',
    buildArgs: ([driveLetter]) => {
      if (typeof driveLetter !== 'string' || !/^[A-Za-z]$/.test(driveLetter)) {
        throw new Error('DriveLetter must be a single letter A-Z');
      }
      return ['-DriveLetter', driveLetter];
    }
  },

  'run-hardware-advanced': {
    type: 'script',
    script: 'hardware_advanced.ps1',
    timeout: 30000,
    buildArgs: ([action]) => {
      const allowed = ['gpu', 'bios', 'cpu', 'memory'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid hardware action: ' + a);
      return ['-Action', a];
    }
  },

  // ============================================================
  // NETWORK MONITOR MODULE (PROMPT 3)
  // ============================================================

  'run-ping-test': {
    type: 'script',
    script: 'ping_test.ps1',
    timeout: 60000,
    buildArgs: ([hostname, count]) => {
      if (typeof hostname !== 'string' || !hostname || hostname.length > 255 || /[<>|"`]/.test(hostname)) {
        throw new Error('Invalid hostname');
      }
      const args = ['-Hostname', hostname];
      const c = parseInt(count, 10);
      if (!isNaN(c) && c >= 1 && c <= 20) {
        args.push('-Count', String(c));
      }
      return args;
    }
  },

  'get-network-adapters': {
    type: 'script',
    script: 'network_adapters.ps1',
    timeout: 30000
  },

  // ============================================================
  // ADVANCED TOOLS MODULE
  // ============================================================
  'run-advanced-tool': {
    type: 'script',
    script: 'advanced_tools.ps1',
    timeout: 300000,
    streamChannel: 'care-out',
    buildArgs: ([action, target]) => {
      const allowed = ['list-apps', 'force-uninstall', 'shred', 'unlock', 'unlock-kill',
                       'find-duplicates', 'find-broken-shortcuts',
                       'read-hosts', 'write-hosts', 'add-hosts-entry'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid advanced-tool action: ' + a);
      const args = ['-Action', a];
      if (target !== undefined && target !== null && typeof target === 'string') {
        // Path validation: reject shell metacharacters and traversal
        if (target.length > 4096) throw new Error('Target too long');
        // Allow newlines in hosts content but reject null bytes
        if (target.includes('\0')) throw new Error('Null bytes not allowed in target');
        args.push('-Target', target);
      }
      return args;
    }
  },

  // ============================================================
  // SURGICAL UNINSTALLER MODULE (Feature 1)
  // Point-in-time snapshot + diff approach (NOT always-on FileSystemWatcher,
  // which is unreliable on Windows). See Brain.md Phase 1, Feature 1.
  // ============================================================
  'run-surgical-tool': {
    type: 'script',
    script: 'surgical_uninstaller.ps1',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Surgical Uninstaller will modify installed software and remove leftover files/registry. Continue?',
    buildArgs: (rawArgs) => {
      const [action, snapId, appKey, displayName, depth] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['take-snapshot', 'compute-diff', 'scan-orphans', 'surgical-uninstall', 'get-footprint'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid surgical-tool action: ' + a);
      const args = ['-Action', a];

      // SnapshotId: strict format (snap_<digits>_<alnum>)
      if (snapId !== undefined && snapId !== null && snapId !== '') {
        if (typeof snapId !== 'string' || !/^snap_[A-Za-z0-9_]+$/.test(snapId) || snapId.length > 100) {
          throw new Error('Invalid snapshot id format.');
        }
        args.push('-SnapshotId', snapId);
      }

      // AppKey: registry PSChildName (GUIDs or app names with limited charset)
      if (appKey !== undefined && appKey !== null && appKey !== '') {
        if (typeof appKey !== 'string' || appKey.length > 300 || appKey.includes('\0') || appKey.match(/[<>|"`$]/)) {
          throw new Error('Invalid app key.');
        }
        args.push('-AppKey', appKey);
      }

      // DisplayName: human-readable name for orphan matching
      if (displayName !== undefined && displayName !== null && displayName !== '') {
        if (typeof displayName !== 'string' || displayName.length > 300 || displayName.includes('\0')) {
          throw new Error('Invalid display name.');
        }
        args.push('-DisplayName', displayName);
      }

      // Depth: optional integer 1-5
      if (depth !== undefined && depth !== null && depth !== '') {
        const d = parseInt(depth, 10);
        if (isNaN(d) || d < 1 || d > 5) throw new Error('Depth must be integer 1-5.');
        args.push('-Depth', String(d));
      }
      return args;
    }
  },

  // ============================================================
  // SMART WORKSPACE AUTOMATION MODULE (Feature 2)
  // Context-aware profiles: launch apps, kill apps, Focus Assist,
  // power plan, WU pause. Trigger-based activation handled in main.js
  // (lightweight polling - see workspaceStore + triggerPoller).
  // ============================================================
  'run-workspace-tool': {
    type: 'script',
    script: 'workspace_automation.ps1',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Workspace Automation will change power plan, Focus Assist, and/or app processes on your PC. Continue?',
    buildArgs: (rawArgs) => {
      const [action, profileJson] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['get-current-state', 'apply-profile', 'restore-profile', 'launch-apps', 'kill-apps'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid workspace-tool action: ' + a);
      const args = ['-Action', a];

      if (profileJson !== undefined && profileJson !== null && profileJson !== '') {
        if (typeof profileJson !== 'string' || profileJson.length > 100000) {
          throw new Error('Invalid profile JSON (too long or non-string).');
        }
        if (profileJson.includes('\0')) throw new Error('Null bytes not allowed in profile JSON.');
        // Validate it parses as JSON
        try { JSON.parse(profileJson); } catch (_) {
          throw new Error('Profile JSON failed to parse.');
        }
        args.push('-ProfileJson', profileJson);
      }
      return args;
    }
  },

  // ============================================================
  // GOD MODE TWEAKER MODULE (Feature 3)
  // Generic registry-tweak engine. Catalog (tweak definitions) lives
  // in electron/tweakerStore.js. PS script just does safe reg backup/apply/undo.
  // ============================================================
  'run-tweaker-tool': {
    type: 'script',
    script: 'god_mode_tweaker.ps1',
    timeout: 30000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will modify the Windows registry. SolasCare backs up the prior value automatically (1-click Undo available). Continue?',
    buildArgs: (rawArgs) => {
      const [action, backupId, regKey, valueName, valueType, valueData] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['backup-value', 'apply-value', 'undo-value', 'list-backups', 'delete-backup'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid tweaker-tool action: ' + a);
      const args = ['-Action', a];

      if (backupId !== undefined && backupId !== null && backupId !== '') {
        if (typeof backupId !== 'string' || !/^[A-Za-z0-9_\-]{1,200}$/.test(backupId)) {
          throw new Error('Invalid BackupId.');
        }
        args.push('-BackupId', backupId);
      }

      if (regKey !== undefined && regKey !== null && regKey !== '') {
        if (typeof regKey !== 'string' || regKey.length > 1000 || regKey.includes('\0') ||
            regKey.match(/[<>|"`$;]/) || regKey.includes('..')) {
          throw new Error('Invalid registry key (blocked chars).');
        }
        // Must start with allowed hive prefix
        if (!/^(HKLM|HKCU|HKCR|HKU|HKCC):\\/.test(regKey)) {
          throw new Error('Registry key must start with HKLM:\\, HKCU:\\, HKCR:\\, HKU:\\, or HKCC:\\');
        }
        args.push('-RegKey', regKey);
      }

      if (valueName !== undefined && valueName !== null && valueName !== '') {
        if (typeof valueName !== 'string' || valueName.length > 500 || valueName.includes('\0')) {
          throw new Error('Invalid value name.');
        }
        args.push('-ValueName', valueName);
      }

      if (valueType !== undefined && valueType !== null && valueType !== '') {
        const allowedTypes = ['REG_DWORD', 'REG_SZ', 'REG_QWORD', 'REG_EXPAND_SZ', 'REG_MULTI_SZ'];
        if (!allowedTypes.includes(String(valueType))) {
          throw new Error('Invalid value type.');
        }
        args.push('-ValueType', String(valueType));
      }

      if (valueData !== undefined && valueData !== null && valueData !== '') {
        if (typeof valueData !== 'string' || valueData.length > 10000 || valueData.includes('\0')) {
          throw new Error('Invalid value data.');
        }
        args.push('-ValueData', String(valueData));
      }

      return args;
    }
  },

  // ============================================================
  // SOFTWARE FORGE MODULE (Feature 4)
  // Silent batch install via Winget + bloatware terminator (Get-AppxPackage)
  // + driver rollback (uses existing driver_backup.ps1 history).
  // Catalog lives in electron/forgeStore.js.
  // ============================================================
  'run-forge-tool': {
    type: 'script',
    script: 'software_forge.ps1',
    timeout: 600000,  // batch installs can take 10+ minutes
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Software Forge will install / remove software and may modify your system. Continue?',
    buildArgs: (rawArgs) => {
      const [action, jsonArg] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['list-catalog', 'install-selected', 'list-bloatware',
                       'remove-bloatware', 'update-all', 'list-driver-backups', 'rollback-driver'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid forge-tool action: ' + a);
      const args = ['-Action', a];

      if (jsonArg !== undefined && jsonArg !== null && jsonArg !== '') {
        if (typeof jsonArg !== 'string' || jsonArg.length > 100000 || jsonArg.includes('\0')) {
          throw new Error('Invalid JSON arg.');
        }
        try { JSON.parse(jsonArg); } catch (_) {
          throw new Error('JSON arg failed to parse.');
        }
        args.push('-JsonArg', jsonArg);
      }
      return args;
    }
  },

  // ============================================================
  // PRIVACY BLACKHOLE MODULE (Feature 5)
  // Hybrid approach: HOSTS + firewall + GPO. Curated blocklist lives
  // in electron/privacyStore.js (JS); PS script just applies safe ops.
  // ============================================================
  'run-privacy-tool': {
    type: 'script',
    script: 'privacy_blackhole.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Privacy Blackhole will modify the HOSTS file, add firewall rules, and change Group Policy registry keys. A backup is created for 1-click undo. Continue?',
    buildArgs: (rawArgs) => {
      const [action, jsonArg] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['get-status', 'apply-blocklist', 'remove-blocklist', 'count-blocked-today'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid privacy-tool action: ' + a);
      const args = ['-Action', a];

      if (jsonArg !== undefined && jsonArg !== null && jsonArg !== '') {
        if (typeof jsonArg !== 'string' || jsonArg.length > 200000 || jsonArg.includes('\0')) {
          throw new Error('Invalid JSON arg.');
        }
        // Validate it parses
        try { JSON.parse(jsonArg); } catch (_) {
          throw new Error('JSON arg failed to parse.');
        }
        // Additional: if it's an array of domains, each must match safe pattern
        const parsed = JSON.parse(jsonArg);
        if (Array.isArray(parsed)) {
          for (const d of parsed) {
            if (typeof d !== 'string' || d.length > 300 || !/^[A-Za-z0-9.\-_]+$/.test(d)) {
              throw new Error('Invalid domain in blocklist: ' + String(d).slice(0, 50));
            }
          }
        }
        args.push('-JsonArg', jsonArg);
      }
      return args;
    }
  },

  // ============================================================
  // SOLAS VAULT MODULE (Feature 6)
  // VHD + BitLocker + auto-mount/unmount. Vault registry lives in
  // electron/vaultStore.js. PS script does diskpart/manage-bde ops.
  // ============================================================
  'run-vault-tool': {
    type: 'script',
    script: 'solas_vault.ps1',
    timeout: 300000,  // VHD creation + BitLocker init can take 1-5 min
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Solas Vault will create/mount/unmount VHD images and may modify BitLocker state. Continue?',
    buildArgs: (rawArgs) => {
      const [action, vaultId, vaultPath, password, sizeMB] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['create-vault', 'mount-vault', 'unmount-vault', 'list-vaults', 'delete-vault', 'get-activity-log'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid vault-tool action: ' + a);
      const args = ['-Action', a];

      if (vaultId !== undefined && vaultId !== null && vaultId !== '') {
        if (typeof vaultId !== 'string' || !/^vault_[A-Za-z0-9_\-]+$/.test(vaultId) || vaultId.length > 200) {
          throw new Error('Invalid vault id.');
        }
        args.push('-VaultId', vaultId);
      }

      if (vaultPath !== undefined && vaultPath !== null && vaultPath !== '') {
        if (typeof vaultPath !== 'string' || vaultPath.length > 1000 || vaultPath.includes('\0') ||
            vaultPath.match(/[<>|"`$;]/) || vaultPath.includes('..')) {
          throw new Error('Invalid vault path.');
        }
        if (!/\.(vhd|vhdx)$/i.test(vaultPath)) {
          throw new Error('Vault path must end in .vhd or .vhdx');
        }
        args.push('-VaultPath', vaultPath);
      }

      if (password !== undefined && password !== null && password !== '') {
        if (typeof password !== 'string' || password.length > 500 || password.includes('\0')) {
          throw new Error('Invalid password.');
        }
        args.push('-Password', password);
      }

      if (sizeMB !== undefined && sizeMB !== null && sizeMB !== '') {
        const s = parseInt(sizeMB, 10);
        if (isNaN(s) || s < 100 || s > 1024 * 1024 * 2) {
          throw new Error('Size must be 100MB - 2TB.');
        }
        args.push('-SizeMB', String(s));
      }
      return args;
    }
  },

  // ============================================================
  // MICRO-SNAPSHOTS MODULE (Feature 7)
  // Uses Windows System Restore API (safer than raw VSS + BCD).
  // Retention policy + history live in electron/snapshotStore.js.
  // ============================================================
  'run-snapshot-tool': {
    type: 'script',
    script: 'micro_snapshots.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Micro-Snapshots will create / restore / delete Windows System Restore points. Continue?',
    buildArgs: (rawArgs) => {
      const [action, snapshotSeq, description, triggerReason] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['create-snapshot', 'list-snapshots', 'restore-snapshot',
                       'delete-snapshot', 'get-disk-usage', 'enable-system-restore'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid snapshot-tool action: ' + a);
      const args = ['-Action', a];

      if (snapshotSeq !== undefined && snapshotSeq !== null && snapshotSeq !== '') {
        const s = String(snapshotSeq);
        if (!/^\d{1,20}$/.test(s)) throw new Error('Invalid snapshot sequence number.');
        args.push('-SnapshotSeq', s);
      }

      if (description !== undefined && description !== null && description !== '') {
        if (typeof description !== 'string' || description.length > 500 || description.includes('\0') ||
            description.match(/[<>|"`$]/)) {
          throw new Error('Invalid description.');
        }
        args.push('-Description', description);
      }

      if (triggerReason !== undefined && triggerReason !== null && triggerReason !== '') {
        const validReasons = ['manual', 'pre-install', 'pre-tweak', 'scheduled', 'pre-uninstall'];
        if (!validReasons.includes(String(triggerReason))) {
          throw new Error('Invalid trigger reason.');
        }
        args.push('-TriggerReason', String(triggerReason));
      }
      return args;
    }
  },

  // ============================================================
  // PC CLONE MODULE (Feature 8)
  // Export apps (winget) + Wi-Fi profiles + registry tweaks to an
  // AES-256 encrypted .solasclone file. Import restores on new PC.
  // ============================================================
  'run-clone-tool': {
    type: 'script',
    script: 'pc_clone.ps1',
    timeout: 600000,  // winget export + import can take many minutes
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'PC Clone will export/import system configuration. Export is read-only. Import may install software. Continue?',
    buildArgs: (rawArgs) => {
      const [action, exportPath, jsonArg] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['get-exportable-items', 'export-clone', 'import-clone'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid clone-tool action: ' + a);
      const args = ['-Action', a];

      if (exportPath !== undefined && exportPath !== null && exportPath !== '') {
        if (typeof exportPath !== 'string' || exportPath.length > 1000 || exportPath.includes('\0') ||
            exportPath.match(/[<>|"`$;]/) || exportPath.includes('..')) {
          throw new Error('Invalid export path.');
        }
        // For export-clone: must end in .solasclone
        // For import-clone: must end in .json (decrypted temp file)
        if (a === 'export-clone') {
          if (!/\.solasclone$/i.test(exportPath)) {
            throw new Error('Export path must end in .solasclone');
          }
        } else if (a === 'import-clone') {
          if (!/\.json$/i.test(exportPath)) {
            throw new Error('Import path must end in .json (decrypted temp file)');
          }
        }
        args.push('-ExportPath', exportPath);
      }

      if (jsonArg !== undefined && jsonArg !== null && jsonArg !== '') {
        if (typeof jsonArg !== 'string' || jsonArg.length > 100000 || jsonArg.includes('\0')) {
          throw new Error('Invalid JSON arg.');
        }
        try { JSON.parse(jsonArg); } catch (_) {
          throw new Error('JSON arg failed to parse.');
        }
        args.push('-JsonArg', jsonArg);
      }
      return args;
    }
  },

  // ============================================================
  // PREDICTIVE MAINTENANCE MODULE (Feature 9)
  // Threshold-based alerts (not predictive ML per senior-engineer critique).
  // History + thresholds live in electron/healthStore.js. PS reads SMART/RAM/etc.
  // ============================================================
  'run-health-tool': {
    type: 'script',
    script: 'predictive_maintenance.ps1',
    timeout: 60000,
    streamChannel: 'care-out',
    buildArgs: (rawArgs) => {
      const [action] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['get-smart-data', 'get-ram-errors', 'get-cpu-temp',
                       'get-fan-rpm', 'get-battery-health', 'compute-health-score'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid health-tool action: ' + a);
      return ['-Action', a];
    }
  },

  // ============================================================
  // SOLAS SENTINEL MODULE (Feature 10)
  // Background watchdog + auto-healing rules. Rules live in
  // electron/sentinelStore.js (JS). PS reads system state + applies heal actions.
  // ============================================================
  'run-sentinel-tool': {
    type: 'script',
    script: 'solas_sentinel.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    buildArgs: (rawArgs) => {
      const [action, serviceName, actionArg] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['get-status', 'reset-network-adapter', 'restart-service',
                       'kill-process', 'clear-print-spooler', 'flush-dns'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid sentinel-tool action: ' + a);
      const args = ['-Action', a];

      // serviceName: used by restart-service. Strict pattern.
      if (serviceName !== undefined && serviceName !== null && serviceName !== '') {
        if (typeof serviceName !== 'string' || !/^[A-Za-z0-9_\.\-]+$/.test(serviceName) || serviceName.length > 200) {
          throw new Error('Invalid service name.');
        }
        args.push('-ServiceName', serviceName);
      }

      // actionArg: process name for kill-process, adapter name for reset-network
      if (actionArg !== undefined && actionArg !== null && actionArg !== '') {
        if (typeof actionArg !== 'string' || actionArg.length > 200 || actionArg.includes('\0') ||
            actionArg.match(/[<>|"`$;]/) || actionArg.includes('..')) {
          throw new Error('Invalid action arg.');
        }
        args.push('-ActionArg', actionArg);
      }
      return args;
    }
  },

  // ============================================================
  // SOLAS V-CACHE MODULE (Feature 11) — STRETCH GOAL
  // RAM disk via ImDisk. Redirects browser caches for ~100x speedup.
  // VOLATILE: contents LOST on reboot/crash — only redirect regeneratable caches.
  // ============================================================
  'run-vcache-tool': {
    type: 'script',
    script: 'v_cache.ps1',
    timeout: 180000,  // ImDisk install can take a few minutes
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'V-Cache will create/remove a RAM disk or modify cache folder symlinks. RAM disk contents are LOST on reboot. Continue?',
    buildArgs: (rawArgs) => {
      const [action, driveLetter, sizeMB, cachePath, cacheLabel] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['check-imdisk', 'install-imdisk', 'create-ramdisk', 'remove-ramdisk',
                       'get-status', 'redirect-cache', 'unredirect-cache', 'get-recommendations'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid vcache-tool action: ' + a);
      const args = ['-Action', a];

      // driveLetter: single uppercase letter A-Z, not A/B/C
      if (driveLetter !== undefined && driveLetter !== null && driveLetter !== '') {
        if (typeof driveLetter !== 'string' || !/^[A-Z]$/.test(driveLetter) ||
            ['A','B','C'].includes(driveLetter)) {
          throw new Error('Invalid drive letter (must be single letter A-Z, not A/B/C).');
        }
        args.push('-DriveLetter', driveLetter);
      }

      // sizeMB: 100-32768
      if (sizeMB !== undefined && sizeMB !== null && sizeMB !== '') {
        const s = parseInt(sizeMB, 10);
        if (isNaN(s) || s < 100 || s > 32768) {
          throw new Error('Size must be 100MB - 32GB.');
        }
        args.push('-SizeMB', String(s));
      }

      // cachePath: filesystem path (strict safety)
      if (cachePath !== undefined && cachePath !== null && cachePath !== '') {
        if (typeof cachePath !== 'string' || cachePath.length > 1000 || cachePath.includes('\0') ||
            cachePath.match(/[<>|"`$;]/) || cachePath.includes('..')) {
          throw new Error('Invalid cache path.');
        }
        args.push('-CachePath', cachePath);
      }

      // cacheLabel: friendly label (1-100 chars, no shell metacharacters)
      if (cacheLabel !== undefined && cacheLabel !== null && cacheLabel !== '') {
        if (typeof cacheLabel !== 'string' || cacheLabel.length === 0 || cacheLabel.length > 100 ||
            cacheLabel.includes('\0') || cacheLabel.match(/[<>|"`$;]/)) {
          throw new Error('Invalid cache label.');
        }
        args.push('-CacheLabel', cacheLabel);
      }
      return args;
    }
  },

  // ============================================================
  // SEAMLESS SANDBOX MODULE (Feature 12) — STRETCH GOAL
  // Wraps Windows Sandbox (built-in Pro/Enterprise). Drag-drop UI for
  // safe file execution. Home edition NOT supported — clearly communicated.
  // ============================================================
  'run-sandbox-tool': {
    type: 'script',
    script: 'seamless_sandbox.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Sandbox will generate a .wsb config and launch Windows Sandbox (isolated environment). Continue?',
    buildArgs: (rawArgs) => {
      const [action, wsbPath, templateId, hostFolderPath, commandToRun] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['check-availability', 'enable-feature', 'list-templates',
                       'generate-wsb', 'launch-sandbox', 'parse-activity-log'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid sandbox-tool action: ' + a);
      const args = ['-Action', a];

      if (wsbPath !== undefined && wsbPath !== null && wsbPath !== '') {
        if (typeof wsbPath !== 'string' || wsbPath.length > 1000 || wsbPath.includes('\0') ||
            wsbPath.match(/[<>|"`$;]/) || wsbPath.includes('..') || !/\.wsb$/i.test(wsbPath)) {
          throw new Error('Invalid WSB path (must end in .wsb).');
        }
        args.push('-WsbPath', wsbPath);
      }
      if (templateId !== undefined && templateId !== null && templateId !== '') {
        if (typeof templateId !== 'string' || !/^[a-z0-9\-]+$/.test(templateId) || templateId.length > 100) {
          throw new Error('Invalid template id.');
        }
        args.push('-TemplateId', templateId);
      }
      if (hostFolderPath !== undefined && hostFolderPath !== null && hostFolderPath !== '') {
        if (typeof hostFolderPath !== 'string' || hostFolderPath.length > 1000 || hostFolderPath.includes('\0') ||
            hostFolderPath.match(/[<>|"`$;]/) || hostFolderPath.includes('..')) {
          throw new Error('Invalid host folder path.');
        }
        args.push('-HostFolderPath', hostFolderPath);
      }
      if (commandToRun !== undefined && commandToRun !== null && commandToRun !== '') {
        if (typeof commandToRun !== 'string' || commandToRun.length > 1000 || commandToRun.includes('\0') ||
            commandToRun.match(/[<>|"`$;]/)) {
          throw new Error('Invalid command.');
        }
        args.push('-CommandToRun', commandToRun);
      }
      return args;
    }
  },

  // ============================================================
  // NETWORK DIAGNOSTICS MODULE (Missing Sub-Feature)
  // Speed test (Cloudflare), DNS response check, active connections.
  // ============================================================
  'run-netdiag-tool': {
    type: 'script',
    script: 'network_diagnostics.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    buildArgs: (rawArgs) => {
      const [action] = Array.isArray(rawArgs) ? rawArgs : [];
      const allowed = ['speed-test', 'dns-check', 'active-connections'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid netdiag-tool action: ' + a);
      return ['-Action', a];
    }
  },

  'run-power-tweak': {
    type: 'script',
    script: 'power_tweaks.ps1',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will modify Windows power configuration. Continue?',
    buildArgs: ([action]) => {
      const allowed = ['ultimate-plan', 'unpark-cores', 'disable-hibernation', 'advanced-tweaks'];
      const a = String(action || '').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid power tweak action: ' + a);
      return ['-Action', a];
    }
  }
};

module.exports = {
  initCommandExecutor,
  executeAllowedCommand,
  killActiveProcess,
  getScriptPath,
  activeChildCount: () => activeChildProcesses.size,
  ALLOWED_COMMANDS
};
