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
const auditFile = path.join(logDir, 'audit.log');

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
  if (!resolved.startsWith(tempRoot + path.sep) || !path.basename(resolved).startsWith('SolasCareBackup_')) {
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
        exitCode: code
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
  
  // Wrap script run in a command block that configures output encoding to UTF8
  const scriptCall = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${scriptPath}' ${scriptArgs.map(arg => `'${String(arg).replace(/'/g, "''")}'`).join(' ')}`;
  
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
      const tempDir = process.env.TEMP || 'C:\\Windows\\Temp';
      const entries = fs.readdirSync(tempDir);
      for (const entry of entries) {
        if (/^solas_junk_.*\.json$/.test(entry)) {
          try { fs.unlinkSync(path.join(tempDir, entry)); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  return result;
}

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ALLOWED_COMMANDS = {
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
      return ['-PnpDeviceId', pnpDeviceId, '-Action', action, '-SafeMode', safeMode ? 'True' : 'False'];
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
  'install-software-source': {
    type: 'powershell',
    timeout: 600000,
    streamChannel: 'winget-out',
    confirmationRequired: true,
    confirmationMessage: 'This will install an application from the selected Winget source/package id. Continue?',
    buildCommand: ([packageId, source = 'winget']) => {
      if (typeof packageId !== 'string' || !/^[A-Za-z0-9_.\-]+$/.test(packageId)) {
        throw new Error('Invalid package id.');
      }
      if (typeof source !== 'string' || !/^[A-Za-z0-9_.\-]+$/.test(source)) {
        throw new Error('Invalid package source.');
      }
      return `winget install --id ${packageId} --source ${source} --accept-package-agreements --accept-source-agreements`;
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
    confirmationMessage: 'This will create a Windows restore point before maintenance. Continue?'
  },
  'enable-restore': {
    type: 'script',
    script: 'enable_restore.ps1',
    timeout: 120000,
    confirmationRequired: true,
    confirmationMessage: 'This will enable Windows System Protection on the system drive. Continue?'
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
  'network-check': {
    type: 'script',
    script: 'network_optimize.ps1',
    timeout: 30000,
    buildArgs: () => ['-Action', 'check']
  },
  'network-reset': {
    type: 'script',
    script: 'network_optimize.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will temporarily disconnect network adapters and reset socket settings. Continue?',
    buildArgs: ([ssid = '']) => ['-Action', 'reset', '-SSID', String(ssid).slice(0, 64)]
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
  'check-defender': {
    type: 'powershell',
    command: '(Get-Service -Name "WinDefend").Status',
    timeout: 10000
  },
  'check-firewall': {
    type: 'powershell',
    command: 'netsh advfirewall show allprofiles state',
    timeout: 10000
  },
  'enable-firewall': {
    type: 'powershell',
    command: 'netsh advfirewall set allprofiles state on',
    timeout: 20000,
    confirmationRequired: true,
    confirmationMessage: 'This will enable Windows Firewall for all profiles. Continue?'
  },
  'start-defender': {
    type: 'powershell',
    command: 'Start-Service -Name "WinDefend"',
    timeout: 20000,
    confirmationRequired: true,
    confirmationMessage: 'This will start Windows Defender service. Continue?'
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
  'disk-health': {
    type: 'script',
    script: 'disk_health.ps1',
    timeout: 60000
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
  'unschedule-care': {
    type: 'script',
    script: 'unschedule_care.ps1',
    timeout: 30000
  },
  'check-task-status': {
    type: 'script',
    script: 'check_task_status.ps1',
    timeout: 15000
  },
  'start-scheduled-care': {
    type: 'powershell',
    command: 'Start-ScheduledTask -TaskName "SolasSystemCarePro_WeeklyCare"',
    timeout: 15000,
    confirmationRequired: true,
    confirmationMessage: 'This will start the scheduled care task immediately. Continue?'
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
  'repair-search-index': {
    type: 'powershell',
    command: 'Stop-Service WSearch -Force; Start-Sleep -Seconds 2; Start-Service WSearch; control.exe srchadmin.dll',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will restart Windows Search and open indexing options. Continue?'
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
    command: 'Remove-Item "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item "$env:SystemRoot\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue',
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
  'repair-registry': {
    type: 'powershell',
    command: 'DISM /Online /Cleanup-Image /ScanHealth',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will scan Windows image health before registry-related repair decisions. Continue?'
  },
  'repair-bsod': {
    type: 'powershell',
    command: 'sfc /scannow; DISM /Online /Cleanup-Image /RestoreHealth',
    timeout: 2400000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run core BSOD repair steps and may take a long time. Continue?'
  },
  'repair-store': {
    type: 'powershell',
    command: 'wsreset.exe; Get-AppxPackage Microsoft.WindowsStore | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml" }',
    timeout: 180000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset and re-register Microsoft Store. Continue?'
  },
  'repair-edge': {
    type: 'powershell',
    command: 'Start-Process "msedge.exe" "--disable-extensions --no-first-run"',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'repair-office': {
    type: 'powershell',
    command: 'Start-Process "appwiz.cpl"',
    timeout: 15000,
    streamChannel: 'care-out'
  },
  'repair-onedrive': {
    type: 'powershell',
    command: 'Start-Process "$env:LOCALAPPDATA\\Microsoft\\OneDrive\\OneDrive.exe" "/reset"',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset OneDrive sync client. Continue?'
  },
  'repair-print-spooler': {
    type: 'powershell',
    command: 'Stop-Service Spooler -Force; Remove-Item "$env:SystemRoot\\System32\\spool\\PRINTERS\\*" -Force -ErrorAction SilentlyContinue; Start-Service Spooler',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will clear stuck print jobs and restart Print Spooler. Continue?'
  },
  'repair-firewall-service': {
    type: 'powershell',
    command: 'Set-Service MpsSvc -StartupType Automatic; Start-Service MpsSvc; netsh advfirewall set allprofiles state on',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will enable and start Windows Firewall. Continue?'
  },
  'repair-defender-service': {
    type: 'powershell',
    command: 'Set-Service WinDefend -StartupType Automatic; Start-Service WinDefend',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will start Windows Defender service. Continue?'
  },
  'repair-malware-cleanup': {
    type: 'powershell',
    command: 'Start-MpScan -ScanType QuickScan',
    timeout: 1800000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will run Microsoft Defender Quick Scan. Continue?'
  },
  'repair-bcd-scan': {
    type: 'powershell',
    command: 'bcdedit /enum all',
    timeout: 30000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will inspect boot configuration data. Continue?'
  },
  'repair-bcd-rebuild': {
    type: 'powershell',
    command: 'bootrec /rebuildbcd',
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This is an advanced boot repair operation. Use only when Windows boot entries are damaged. Continue?'
  },
  'repair-boot-files': {
    type: 'powershell',
    command: 'bootrec /scanos',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will scan Windows boot entries. Use only when boot repair is needed. Continue?'
  },
  'repair-wmi': {
    type: 'powershell',
    command: 'winmgmt /verifyrepository; winmgmt /salvagerepository',
    timeout: 180000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will verify and salvage the WMI repository. Continue?'
  },
  'repair-registry-permissions': {
    type: 'powershell',
    command: 'secedit /configure /cfg "$env:windir\\inf\\defltbase.inf" /db defltbase.sdb /verbose',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will restore default security policy permissions. Continue?'
  },

  'repair-system-restore': {
    type: 'script',
    script: 'create_restore_point.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will create a System Restore checkpoint. Continue?'
  },
  'collect-diagnostic-logs': {
    type: 'powershell',
    command: 'Get-WinEvent -LogName System -MaxEvents 100 | Select-Object TimeCreated,LevelDisplayName,ProviderName,Message | ConvertTo-Json -Compress',
    timeout: 60000,
    streamChannel: 'care-out'
  },
  'collect-reports': {
    type: 'powershell',
    command: 'dxdiag /whql:off /t "$env:TEMP\\solas_dxdiag.txt"; powercfg /batteryreport /output "$env:TEMP\\solas_battery_report.html"',
    timeout: 120000,
    streamChannel: 'care-out'
  },
  'collect-dumps': {
    type: 'powershell',
    command: 'Get-ChildItem "$env:SystemRoot\\Minidump" -Filter *.dmp -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime | ConvertTo-Json -Compress',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'quick-internet-fix': {
    type: 'powershell',
    command: 'ipconfig /flushdns; netsh winsock reset; netsh int ip reset',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will reset DNS, Winsock, and TCP/IP. Continue?'
  },
  'quick-audio-fix': {
    type: 'powershell',
    command: 'Restart-Service Audiosrv -Force; Restart-Service AudioEndpointBuilder -Force',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will restart Windows audio services. Continue?'
  },
  'repair-audio-drivers': {
    type: 'powershell',
    command: 'Get-PnpDevice -Class System | Where-Object { $_.FriendlyName -match "Audio" } | Disable-PnpDevice -Confirm:$false; Get-PnpDevice -Class System | Where-Object { $_.FriendlyName -match "Audio" } | Enable-PnpDevice -Confirm:$false',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will disable and re-enable audio devices to reset their driver state. Continue?'
  },
  'network-ip-renew': {
    type: 'powershell',
    command: 'ipconfig /release; ipconfig /renew',
    timeout: 60000,
    streamChannel: 'care-out'
  },
  'network-adapter-restart': {
    type: 'powershell',
    command: 'Get-NetAdapter | Restart-NetAdapter',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will temporarily disable and re-enable all network adapters. Continue?'
  },
  'quick-explorer-fix': {
    type: 'powershell',
    command: 'Stop-Process -Name explorer -Force; Start-Process explorer.exe',
    timeout: 30000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will restart Windows Explorer. Continue?'
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
  'detect-performance': {
    type: 'powershell',
    command: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 ProcessName,CPU,WorkingSet | ConvertTo-Json -Compress',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'detect-services': {
    type: 'powershell',
    command: 'Get-Service wuauserv,bits,WSearch,Spooler,MpsSvc,WinDefend,Audiosrv | Select-Object Name,Status,StartType | ConvertTo-Json -Compress',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'detect-crashes': {
    type: 'powershell',
    command: 'Get-WinEvent -FilterHashtable @{LogName=\"System\"; Level=1,2; StartTime=(Get-Date).AddDays(-7)} -MaxEvents 30 | Select-Object TimeCreated,ProviderName,Id,Message | ConvertTo-Json -Compress',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'open-autoruns-manager': {
    type: 'powershell',
    command: 'Start-Process "C:\\Windows\\System32\\autoruns.exe" -ErrorAction SilentlyContinue; if (-not $?) { Start-Process taskmgr.exe }',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-startup-manager': {
    type: 'powershell',
    command: 'Start-Process taskmgr.exe /n ,4',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-installed-programs': {
    type: 'powershell',
    command: 'Start-Process appwiz.cpl',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-driver-information': {
    type: 'powershell',
    command: 'Start-Process devmgmt.msc',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'install-driver-source': {
    type: 'powershell',
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will install drivers from a local INF folder using pnputil. Continue?',
    buildCommand: ([driverFolder]) => {
      if (typeof driverFolder !== 'string') {
        throw new Error('Invalid driver folder.');
      }
      const resolved = path.resolve(driverFolder);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error('Driver folder does not exist.');
      }
      const escaped = resolved.replace(/"/g, '\\"');
      return `pnputil /add-driver "${escaped}\\*.inf" /subdirs /install`;
    }
  },
  'open-service-manager': {
    type: 'powershell',
    command: 'Start-Process services.msc',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-scheduled-tasks': {
    type: 'powershell',
    command: 'Start-Process taskschd.msc',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-event-viewer': {
    type: 'powershell',
    command: 'Start-Process eventvwr.msc',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-reliability-monitor': {
    type: 'powershell',
    command: 'Start-Process perfmon.exe "/rel"',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'export-event-logs': {
    type: 'powershell',
    command: 'wevtutil epl System "$env:TEMP\\solas_system.evtx"; wevtutil epl Application "$env:TEMP\\solas_application.evtx"; Write-Output "Exported logs to $env:TEMP"',
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
      const FORBIDDEN_PREFIXES = [
        'C:\\Windows\\', 'C:\\Program Files\\', 'C:\\Program Files (x86)\\',
        'C:\\ProgramData\\', 'C:\\System Volume Information\\', 'C:\\$Recycle.Bin\\'
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
  'get-hardware-info': {
    type: 'script',
    script: 'hardware_info.ps1',
    timeout: 30000
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
    timeout: 60000,
    confirmationRequired: true,
    confirmationMessage: 'Registry restore karega — system restart required ho sakta hai. Continue?',
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
  'get-windows-info': {
    type: 'script',
    script: 'windows_info.ps1',
    timeout: 30000
  },
  'check-activation': {
    type: 'script',
    script: 'activation_check.ps1',
    timeout: 20000
  },
  'schedule-ram-diagnostic': {
    type: 'script',
    script: 'ram_diagnostic.ps1',
    timeout: 15000,
    confirmationRequired: true,
    confirmationMessage: 'Memory Diagnostic next reboot pe chalega. PC restart karna padega. Continue?',
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
    confirmationMessage: 'Service ko repair/restart/set-startup karega. Continue?',
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
    confirmationMessage: 'IRREVERSIBLE: Component Store cleanup karega aur superseded Windows packages permanently delete karega. 20-30 min lag sakte hain. Continue?',
    buildArgs: () => ['-Action', 'cleanup']
  },
  'export-driver-backup': {
    type: 'powershell',
    timeout: 300000,
    confirmationRequired: true,
    confirmationMessage: 'Sare OEM drivers backup folder mein export karega. Continue?',
    buildCommand: ([folder]) => {
      if (typeof folder !== 'string') throw new Error('Invalid folder path');
      const resolved = path.resolve(folder);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error('Folder does not exist.');
      }
      const escaped = resolved.replace(/"/g, '\\"');
      return `pnputil /export-driver * "${escaped}"`;
    }
  },
  'recycle-bin-cleanup': {
    type: 'powershell',
    command: 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; Write-Output "Recycle Bin cleared."',
    timeout: 30000,
    confirmationRequired: true,
    confirmationMessage: 'Recycle Bin permanently empty karega. Continue?'
  },
  'windows-activation-repair': {
    type: 'powershell',
    command: 'cscript //nologo C:\\Windows\\System32\\slmgr.vbs /ato',
    timeout: 60000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'Windows online activation attempt karega. Continue?'
  },
  'component-store-scan': {
    type: 'powershell',
    command: 'DISM /Online /Cleanup-Image /ScanHealth',
    timeout: 600000,
    streamChannel: 'care-out'
  },
  'quick-repair-sequence': {
    type: 'native',
    handler: async (args) => {
      const steps = ['flush-dns', 'repair-temp-cleanup', 'repair-icon-cache', 'repair-search-index'];
      const results = {};
      const mainWindow = getMainWindowRef();
      for (const step of steps) {
        if (mainWindow) {
          mainWindow.webContents.send('care-out', `[SEQUENCE] Starting step: ${step}...\n`);
        }
        const res = await executeAllowedCommand(step, [], { bypassConfirmation: true });
        results[step] = res;
        if (mainWindow) {
          if (res.success) {
            mainWindow.webContents.send('care-out', `[SEQUENCE] Step ${step} completed successfully.\n`);
          } else {
            mainWindow.webContents.send('care-out', `[SEQUENCE] Step ${step} failed: ${res.error || 'Unknown error'}\n`);
          }
        }
      }
      return JSON.stringify({ success: true, results });
    }
  },
  'deep-repair-sequence': {
    type: 'native',
    handler: async (args) => {
      const steps = ['create-restore-point', 'repair-temp-cleanup', 'repair-system-sfc', 'repair-system-dism', 'flush-dns', 'repair-windows-update'];
      const results = {};
      const mainWindow = getMainWindowRef();
      for (const step of steps) {
        if (mainWindow) {
          mainWindow.webContents.send('care-out', `[SEQUENCE] Starting deep step: ${step}...\n`);
        }
        const res = await executeAllowedCommand(step, [], { bypassConfirmation: true });
        results[step] = res;
        if (mainWindow) {
          if (res.success) {
            mainWindow.webContents.send('care-out', `[SEQUENCE] Deep step ${step} completed.\n`);
          } else {
            mainWindow.webContents.send('care-out', `[SEQUENCE] Deep step ${step} failed: ${res.error || 'Unknown error'}\n`);
          }
        }
      }
      return JSON.stringify({ success: true, results });
    }
  },
  'update-all-sequence': {
    type: 'native',
    handler: async (args) => {
      const mainWindow = getMainWindowRef();
      if (mainWindow) {
        mainWindow.webContents.send('care-out', `[SEQUENCE] Starting software updates scan...\n`);
      }
      const scanRes = await executeAllowedCommand('scan-software-updates', [], { bypassConfirmation: true });
      let updateCount = 0;
      if (scanRes.success && scanRes.stdout) {
        try {
          const updates = JSON.parse(scanRes.stdout);
          if (Array.isArray(updates)) {
            for (const app of updates) {
              if (mainWindow) {
                mainWindow.webContents.send('care-out', `[SEQUENCE] Installing software update: ${app.Name || app.Id}...\n`);
              }
              await executeAllowedCommand('update-software', [app.Id], { bypassConfirmation: true });
              updateCount++;
            }
          }
        } catch (e) {
          if (mainWindow) {
            mainWindow.webContents.send('care-out', `[SEQUENCE] Custom winget update scan parse failed, trying default updater...\n`);
          }
        }
      }
      
      if (mainWindow) {
        mainWindow.webContents.send('care-out', `[SEQUENCE] Checking maintenance task status...\n`);
      }
      await executeAllowedCommand('check-task-status', [], { bypassConfirmation: true });
      
      if (mainWindow) {
        mainWindow.webContents.send('care-out', `[SEQUENCE] Running SSD drive trim optimization...\n`);
      }
      await executeAllowedCommand('run-trim', ['C'], { bypassConfirmation: true });
      
      return JSON.stringify({ success: true, updatesInstalled: updateCount });
    }
  },
  'driver-update-all': {
    type: 'native',
    handler: async (args) => {
      const mainWindow = getMainWindowRef();
      if (mainWindow) {
        mainWindow.webContents.send('care-out', `[SEQUENCE] Scanning hardware drivers for problems...\n`);
      }
      const scanRes = await executeAllowedCommand('scan-drivers', [], { bypassConfirmation: true });
      let driverUpdatesCount = 0;
      if (scanRes.success && scanRes.stdout) {
        try {
          const drivers = JSON.parse(scanRes.stdout);
          if (Array.isArray(drivers)) {
            const badDrivers = drivers.filter(d => d.Status !== 'OK' && d.PnpDeviceId);
            for (const d of badDrivers) {
              if (mainWindow) {
                mainWindow.webContents.send('care-out', `[SEQUENCE] Updating faulty driver: ${d.FriendlyName || d.Name}...\n`);
              }
              await executeAllowedCommand('driver-action', [d.PnpDeviceId, 'update', true], { bypassConfirmation: true });
              driverUpdatesCount++;
            }
          }
        } catch (e) {
          if (mainWindow) {
            mainWindow.webContents.send('care-out', `[SEQUENCE] Failed to parse driver list: ${e.message}\n`);
          }
        }
      }
      return JSON.stringify({ success: true, updatedCount: driverUpdatesCount });
    }
  },
  'full-health-check': {
    type: 'native',
    handler: async (args) => {
      const cmdKeys = [
        'get-hardware-info', 'get-windows-info', 'get-drives-info',
        'battery-report', 'disk-health', 'detect-network',
        'detect-services', 'scan-drivers', 'get-ram-diagnostic-result'
      ];
      const reportData = {};
      const mainWindow = getMainWindowRef();
      for (const cmdKey of cmdKeys) {
        if (mainWindow) {
          mainWindow.webContents.send('care-out', `[HEALTH-CHECK] Running check: ${cmdKey}...\n`);
        }
        const res = await executeAllowedCommand(cmdKey, [], { bypassConfirmation: true });
        if (res.success && res.stdout) {
          try {
            reportData[cmdKey] = JSON.parse(res.stdout);
          } catch (e) {
            reportData[cmdKey] = res.stdout;
          }
        } else {
          reportData[cmdKey] = { error: res.error || 'Failed to query' };
        }
      }
      
      if (mainWindow) {
        mainWindow.webContents.send('care-out', `[HEALTH-CHECK] Generating full HTML Diagnostic Report...\n`);
      }
      await executeAllowedCommand('generate-system-report', [], { bypassConfirmation: true });

      return JSON.stringify({ success: true, compiledReport: reportData });
    }
  },

  // ============================================================
  // SMART REPAIR - new repair commands (no duplicates of existing).
  // ============================================================

  // NEW: Windows Update history (last 50 installations with status/KB/HResult).
  'windows-update-history': {
    type: 'script',
    script: 'windows_update_history.ps1',
    timeout: 30000
  },

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
  'reregister-dll': {
    type: 'script',
    script: 'reregister_dll.ps1',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will re-register Windows DLLs via regsvr32. Continue?',
    buildArgs: ([action, dllPath]) => {
      const a = String(action || 'common').toLowerCase();
      if (!['reregister', 'common'].includes(a)) throw new Error('Invalid DLL reregister action: ' + a);
      const args = ['-Action', a];
      if (a === 'reregister') {
        if (typeof dllPath !== 'string' || !dllPath) throw new Error('DllPath is required for reregister action');
        args.push('-DllPath', dllPath);
      }
      return args;
    }
  },

  // NEW: Reset all power plans to defaults (powercfg -restoredefaultschemes).
  'reset-power-plans': {
    type: 'powershell',
    command: 'powercfg -restoredefaultschemes',
    timeout: 15000,
    confirmationRequired: true,
    confirmationMessage: 'This will reset ALL custom power plans to Windows defaults. Your custom plans will be lost. Continue?'
  },

  // NEW: User profile repair (icon cache, thumbnail cache, font cache, profile permissions).
  'repair-user-profile': {
    type: 'script',
    script: 'repair_user_profile.ps1',
    timeout: 600000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will clear caches and reset profile permissions. Windows Explorer will restart. Continue?',
    buildArgs: ([action]) => {
      const allowed = ['all', 'icon-cache', 'thumbnail-cache', 'font-cache', 'perms'];
      const a = String(action || 'all').toLowerCase();
      if (!allowed.includes(a)) throw new Error('Invalid profile repair action: ' + a);
      return ['-Action', a];
    }
  },

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
  'repair-chkdsk-full': {
    type: 'powershell',
    timeout: 30000,
    confirmationRequired: true,
    confirmationMessage: 'This will schedule chkdsk /f /r on the system drive for next reboot. The scan can take 1-4 hours. Continue?',
    buildCommand: ([drive]) => {
      const d = (typeof drive === 'string' && /^[A-Z]$/i.test(drive)) ? drive.toUpperCase() : 'C';
      // Schedule chkdsk on next boot via fsutil dirty set + chkntfs - actually use the
      // "echo Y | chkdsk /f" pattern which prompts for reboot-schedule and auto-confirms.
      return `echo Y | chkdsk ${d}: /f /r /x`;
    }
  },

  // NEW: HDD defragmentation (Optimize-Volume -Defrag) for rotational drives.
  // (TRIM for SSDs already exists as run-trim.)
  'defrag-drive': {
    type: 'powershell',
    timeout: 1800000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will defragment the selected HDD. Do NOT run on SSDs. Can take 1-2 hours. Continue?',
    buildCommand: ([drive]) => {
      const d = (typeof drive === 'string' && /^[A-Z]$/i.test(drive)) ? drive.toUpperCase() : 'C';
      return `Optimize-Volume -DriveLetter ${d} -Defrag -Verbose -ErrorAction Stop`;
    }
  },

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
  'repair-store-all-apps': {
    type: 'powershell',
    command: "Get-AppxPackage -AllUsers | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register \"$($_.InstallLocation)\\AppXManifest.xml\" -ErrorAction SilentlyContinue }",
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will re-register ALL Windows Store apps for all users. May take 5-10 minutes. Continue?'
  },

  // NEW: WMI repository repair (winmgmt /salvagerepository) - fixes corrupt WMI.
  'repair-wmi-repository': {
    type: 'powershell',
    command: 'winmgmt /salvagerepository',
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will salvage the WMI repository. WMI-dependent services may briefly stop. Continue?'
  },

  // NEW: Clear all Windows event logs (useful when logs are corrupt).
  'clear-event-logs': {
    type: 'powershell',
    command: "wevtutil el | ForEach-Object { try { wevtutil cl \"$_\" } catch {} }",
    timeout: 120000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'WARNING: This will clear ALL Windows event logs. Diagnostic history will be lost. Continue?'
  },

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
          ['junk-scan', [], 'Scan Junk Files'],
          ['run-trim', [process.env.SystemDrive ? process.env.SystemDrive.charAt(0) : 'C'], 'SSD TRIM Optimization'],
          ['repair-system-sfc', [], 'System File Checker (SFC)'],
          ['flush-dns', [], 'Flush DNS Cache']
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
  'check-repair-conflicts': {
    type: 'native',
    handler: async (args) => {
      const requestedCmd = args[0];
      // Commands that conflict with each other (cannot run simultaneously).
      // SFC and DISM both touch system files; chkdsk locks the drive.
      const CONFLICT_GROUPS = {
        'sfc-family': ['repair-system-sfc', 'verify-sfc', 'sfc-custom-scan', 'quick-full-system-repair'],
        'dism-family': ['repair-system-dism', 'component-store-scan', 'cleanup-component-store', 'dism-custom-source', 'quick-full-system-repair'],
        'disk-family': ['repair-chkdsk-scan', 'repair-chkdsk-full', 'defrag-drive', 'run-trim'],
        'boot-family': ['repair-boot', 'safe-mode-repair', 'repair-bcd-rebuild']
      };
      const activeCommands = [];
      // We can't directly enumerate in-flight commands, but activeChildCount tells us
      // if ANY command is running. The UI should also track this client-side.
      const childCount = activeChildProcesses.size;
      let conflict = false;
      let conflictReason = null;

      if (childCount > 0) {
        // Check if requested command belongs to a conflict group.
        for (const [group, members] of Object.entries(CONFLICT_GROUPS)) {
          if (members.includes(requestedCmd)) {
            conflict = true;
            conflictReason = `Another repair in the "${group}" group may already be running. Wait for it to finish or cancel it first.`;
            break;
          }
        }
      }

      return JSON.stringify({
        success: true,
        conflict,
        conflictReason,
        activeChildCount: childCount,
        requestedCommand: requestedCmd
      });
    }
  }
};

module.exports = {
  initCommandExecutor,
  executeAllowedCommand,
  killActiveProcess,
  getScriptPath,
  activeChildCount: () => activeChildProcesses.size
};
