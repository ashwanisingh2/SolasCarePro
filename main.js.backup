// squirrel startup hook check
if (require('electron-squirrel-startup')) return;

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

let mainWindow;
let activeChildProcess = null;
let tray = null;
const logDir = path.join(process.env.APPDATA, 'SolasCare', 'logs');
const reportsDir = path.join(process.env.APPDATA, 'SolasCare', 'reports');

// Create log directory
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const logFile = path.join(logDir, `solas_care_${new Date().toISOString().split('T')[0]}.log`);
const auditFile = path.join(logDir, 'audit.log');

function writeLog(level, message) {
  const logMsg = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  console.log(logMsg.trim());
  try {
    fs.appendFileSync(logFile, logMsg, 'utf8');
  } catch(e) {}
}

function writeAudit(action, details, result) {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    details,
    result: result?.success ? 'SUCCESS' : 'FAILURE',
    error: result?.error || result?.stderr || null,
    user: process.env.USERNAME || process.env.USER || 'unknown'
  };
  try {
    fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    writeLog('ERROR', 'Failed to write audit log: ' + e.message);
  }
}

// 1. Settings persistence store
const DEFAULT_SETTINGS = {
  theme: 'dark',
  autoPilotDay: 'Sunday',
  autoPilotTime: '03:00',
  autoPilotEnabled: false,
  repairOptions: {
    junk: true,
    network: true,
    drivers: true,
    sfc: false,
    trim: true
  },
  dnsPreference: 'Original',
  runAtStartup: false,
  lastRestorePointId: null
};

class SettingsStore {
  constructor() {
    this.dir = path.join(process.env.APPDATA, 'SolasCare');
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    this.filePath = path.join(this.dir, 'settings.json');
    this.data = this.load();
  }
  
  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (typeof parsed === 'object' && parsed !== null) {
          // Merge with defaults
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
      }
    } catch (e) {
      writeLog('ERROR', 'Settings file corrupted. Resetting to defaults: ' + e.message);
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.webContents.send('settings-corrupted');
        }
      }, 2000);
    }
    const defaults = { ...DEFAULT_SETTINGS };
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(defaults, null, 2), 'utf8');
    } catch(e) {}
    return defaults;
  }
  
  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      writeLog('ERROR', 'Failed to save settings: ' + e.message);
    }
  }
  
  get(key, defaultValue) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }
  
  set(key, value) {
    this.data[key] = value;
    this.save();
    
    if (key === 'runAtStartup') {
      syncStartupBehavior(value);
    }
  }
}

const settingsStore = new SettingsStore();

function syncStartupBehavior(runAtStartup) {
  const appPath = app.getPath('exe');
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const valName = 'SolasSystemCarePro';
  
  if (runAtStartup) {
    const cmd = `reg.exe add "${regKey}" /v "${valName}" /t REG_SZ /d "\\"${appPath}\\"" /f`;
    exec(cmd, (err) => {
      if (err) writeLog('ERROR', 'Failed to add registry run key: ' + err.message);
      else writeLog('INFO', 'Registry run key added successfully.');
    });
  } else {
    const cmd = `reg.exe delete "${regKey}" /v "${valName}" /f`;
    exec(cmd, (err) => {
      if (err) writeLog('INFO', 'Failed to remove or non-existent registry run key: ' + err.message);
      else writeLog('INFO', 'Registry run key removed successfully.');
    });
  }
}

// Check for admin rights
function checkIsAdmin() {
  return new Promise((resolve) => {
    exec('net session', (err) => {
      resolve(!err);
    });
  });
}

function relaunchAsAdmin() {
  writeLog('INFO', 'Relaunching application as Administrator...');
  const exePath = process.argv[0];
  const args = process.argv.slice(1);
  
  const argsString = args.map(a => `"${a}"`).join(',');
  const command = `Start-Process -FilePath "${exePath}" -ArgumentList ${argsString || '""'} -Verb RunAs`;
  
  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  
  app.quit();
}

// 2. PowerShell block check & bypass
let isPowerShellBlocked = false;
let systemExecutionPolicy = 'Bypass';

function checkPowerShellAccess() {
  return new Promise((resolve) => {
    exec('powershell.exe -NoProfile -Command "Get-ExecutionPolicy"', (err, stdout) => {
      if (err) {
        writeLog('WARN', 'PowerShell is blocked. Error: ' + err.message);
        isPowerShellBlocked = true;
        systemExecutionPolicy = 'Blocked';
        resolve(false);
      } else {
        const policy = stdout.trim();
        systemExecutionPolicy = policy;
        if (policy === 'Restricted') {
          writeLog('INFO', 'PowerShell execution policy is Restricted. Bypassing for this process...');
          // Silently set process scope bypass
          exec('powershell.exe -NoProfile -Command "Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force"', (setErr) => {
            if (setErr) {
              writeLog('WARN', 'Failed to set Scope Process Bypass. PowerShell might fail.');
            }
          });
        }
        isPowerShellBlocked = false;
        resolve(true);
      }
    });
  });
}

// 3. System Tray Creation for "Minimize to Tray"
function createTray() {
  if (tray) return;
  
  // 1x1 Transparent pixel PNG base64 fallback
  const iconBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  const trayIcon = nativeImage.createFromBuffer(iconBuffer);
  
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Restore Solas Care Pro', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Exit Application', click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Solas System Care Pro (Running Scan)');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.show();
  });
}

async function createWindow() {
  const isAdmin = await checkIsAdmin();
  const tempFlagPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'solas_relaunch.flag');

  // Relaunch dialog with loop-protection
  if (!isAdmin) {
    let isLoop = false;
    if (fs.existsSync(tempFlagPath)) {
      try {
        const timeStr = fs.readFileSync(tempFlagPath, 'utf8');
        const timestamp = parseInt(timeStr);
        if (Date.now() - timestamp < 30000) {
          isLoop = true;
        }
      } catch (e) {}
    }

    if (isLoop) {
      dialog.showErrorBox(
        "Privilege Elevation Failed",
        "Solas Care Pro requires Administrator privileges to perform repairs. Please right-click the application executable and choose 'Run as administrator' manually."
      );
      app.quit();
      return;
    }

    try {
      fs.writeFileSync(tempFlagPath, Date.now().toString(), 'utf8');
    } catch(e) {}

    const response = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Relaunch as Admin', 'Exit'],
      defaultId: 0,
      title: 'Administrator Privileges Required',
      message: 'Solas Care Pro requires administrator privileges to execute diagnostic scans and system fixes.',
      detail: 'Click "Relaunch as Admin" to authorize the UAC elevation prompt.'
    });

    if (response === 0) {
      relaunchAsAdmin();
    } else {
      app.quit();
    }
    return;
  } else {
    // Delete temp flag if elevated
    if (fs.existsSync(tempFlagPath)) {
      try { fs.unlinkSync(tempFlagPath); } catch(e) {}
    }
  }

  // Pre-initialize PowerShell checks
  await checkPowerShellAccess();

  writeLog('INFO', `Starting Solas System Care Pro (Admin: ${isAdmin})`);

  mainWindow = new BrowserWindow({
    width: 1250,
    height: 800,
    backgroundColor: '#0F172A',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  });

  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      if (input.key === 'F12' || (input.control && input.shift && key === 'i')) {
        event.preventDefault();
      }
    });
  }

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handler - Minimize Window / Hide to Tray during scans
ipcMain.on('minimize-window', () => {
  createTray();
  if (mainWindow) {
    mainWindow.hide();
  }
});

// IPC Handler - Admin Check
ipcMain.handle('is-admin', async () => {
  return await checkIsAdmin();
});

// IPC Handler - Check Driver Backup Reg File Exists
ipcMain.handle('check-driver-backup', (event, pnpDeviceId) => {
  const safeId = pnpDeviceId.replace(/[^a-zA-Z0-9]/g, '_');
  const backupFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `solas_driver_backup_${safeId}.reg`);
  return fs.existsSync(backupFile);
});

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
      if (typeof filesJson !== 'string' || filesJson.length > 1024 * 1024) {
        throw new Error('Invalid cleanup file list.');
      }
      const parsed = JSON.parse(filesJson);
      if (!Array.isArray(parsed) || parsed.some(p => typeof p !== 'string')) {
        throw new Error('Invalid cleanup paths.');
      }
      return ['-Action', 'clean', '-FilesJson', filesJson];
    }
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
  'run-sfc-scan': {
    type: 'powershell',
    command: 'sfc /scannow',
    timeout: 900000,
    streamChannel: 'sfc-out',
    confirmationRequired: true,
    confirmationMessage: 'SFC can take 10-15 minutes. Do not interrupt the scan. Continue?'
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
    type: 'powershell',
    command: 'Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location | ConvertTo-Json -Compress',
    timeout: 30000,
    streamChannel: 'care-out'
  },
  'repair-permissions': {
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
  'repair-file-permissions': {
    type: 'powershell',
    command: 'icacls "$env:SystemDrive\\Users" /verify /t /c',
    timeout: 300000,
    streamChannel: 'care-out',
    confirmationRequired: true,
    confirmationMessage: 'This will verify user file permissions recursively. Continue?'
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
    type: 'powershell',
    command: 'Test-NetConnection 8.8.8.8; ipconfig /all',
    timeout: 30000,
    streamChannel: 'care-out'
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
    command: 'Start-Process taskmgr.exe',
    timeout: 10000,
    streamChannel: 'care-out'
  },
  'open-startup-manager': {
    type: 'powershell',
    command: 'Start-Process taskmgr.exe',
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
  }
};

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

function getScriptPath(scriptName) {
  const candidates = [
    path.join(__dirname, 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'app', 'scripts', scriptName)
  ];
  const fullPath = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!fullPath) {
    throw new Error(`Script not found: ${scriptName}`);
  }
  return fullPath;
}

async function confirmCommand(cmd) {
  if (!cmd.confirmationRequired) return true;
  const result = await dialog.showMessageBox(mainWindow, {
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
    activeChildProcess = child;

    const timeout = options.timeout
      ? setTimeout(() => {
          try {
            child.kill('SIGTERM');
            exec(`taskkill /F /T /PID ${child.pid}`);
          } catch (e) {
            writeLog('ERROR', 'Failed to timeout child process: ' + e.message);
          }
        }, options.timeout)
      : null;

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutData += text;
      if (options.streamChannel && mainWindow) {
        mainWindow.webContents.send(options.streamChannel, text);
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;
      if (options.streamChannel && mainWindow) {
        mainWindow.webContents.send(options.streamChannel, `[ERROR] ${text}`);
      }
    });

    child.on('error', (error) => {
      if (timeout) clearTimeout(timeout);
      activeChildProcess = null;
      resolve({ success: false, error: error.message, stdout: stdoutData, stderr: stderrData });
    });

    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout);
      activeChildProcess = null;
      resolve({
        success: code === 0,
        stdout: stdoutData,
        stderr: stderrData,
        exitCode: code
      });
    });
  });
}

async function executeAllowedCommand(commandKey, rawArgs) {
  const cmd = ALLOWED_COMMANDS[commandKey];
  if (!cmd) {
    throw new Error(`SECURITY: Command "${commandKey}" is not allowlisted.`);
  }

  const args = Array.isArray(rawArgs) ? rawArgs : [];
  if (!(await confirmCommand(cmd))) {
    return { success: false, cancelled: true, error: 'User cancelled operation.' };
  }

  if (cmd.type === 'native') {
    const nativeResult = await cmd.handler(args);
    return { success: true, stdout: nativeResult || '' };
  }

  if (cmd.type === 'powershell') {
    const command = cmd.buildCommand ? cmd.buildCommand(args) : cmd.command;
    return await runChildProcess('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command
    ], { timeout: cmd.timeout, streamChannel: cmd.streamChannel });
  }

  const scriptArgs = cmd.buildArgs ? cmd.buildArgs(args) : [];
  const scriptPath = getScriptPath(cmd.script);
  return await runChildProcess('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    ...scriptArgs.map(String)
  ], { timeout: cmd.timeout, streamChannel: cmd.streamChannel });
}

ipcMain.handle('run-system-command', async (event, commandKey, args = []) => {
  try {
    writeLog('INFO', `Requested allowlisted command: ${commandKey}`);
    const result = await executeAllowedCommand(commandKey, args);
    writeAudit(commandKey, { args }, result);
    return result;
  } catch (error) {
    const result = { success: false, error: error.message, securityBlocked: true };
    writeAudit(commandKey, { args }, result);
    writeLog('ERROR', `Command blocked/failed (${commandKey}): ${error.message}`);
    return result;
  }
});

// IPC Handler - Kill Active Child Process
ipcMain.handle('kill-active-process', () => {
  if (activeChildProcess) {
    writeLog('WARN', 'User requested process cancellation. Killing child process PID: ' + activeChildProcess.pid);
    try {
      activeChildProcess.kill('SIGTERM');
      exec(`taskkill /F /T /PID ${activeChildProcess.pid}`);
    } catch (e) {
      writeLog('ERROR', 'Error killing process: ' + e.message);
    }
    activeChildProcess = null;
    return true;
  }
  return false;
});

// 4. Live DNS and WMI System Info Handlers
let globalDnsStatus = 'Original';

ipcMain.handle('get-dns-status', () => {
  const tempPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'solas_dns_backup.json');
  if (globalDnsStatus === 'Restoring') {
    return 'Restoring...';
  }
  if (fs.existsSync(tempPath)) {
    return 'Temporary (Google)';
  }
  return 'Original';
});

ipcMain.handle('get-system-info', async () => {
  const release = os.release();
  const platform = os.platform();
  const majorVersion = parseInt(release.split('.')[0]);
  const isLegacyWin = majorVersion < 10;
  
  let osName = 'Windows (Legacy)';
  const parts = release.split('.').map(Number);
  if (parts[0] === 10) {
    // Windows 10/11
    if (parts[2] >= 22000) osName = 'Windows 11';
    else osName = 'Windows 10';
  } else if (parts[0] === 6 && parts[1] === 3) osName = 'Windows 8.1';
  else if (parts[0] === 6 && parts[1] === 2) osName = 'Windows 8';
  else if (parts[0] === 6 && parts[1] === 1) osName = 'Windows 7';

  return {
    release,
    platform,
    executionPolicy: systemExecutionPolicy,
    isLegacyWin,
    osName
  };
});

// IPC Handler - Settings persistence get/set
ipcMain.handle('get-setting', (event, { key, defaultValue }) => {
  return settingsStore.get(key, defaultValue);
});

ipcMain.handle('set-setting', (event, { key, value }) => {
  settingsStore.set(key, value);
  return true;
});

ipcMain.handle('export-settings', async (event, filePath) => {
  try {
    const data = fs.readFileSync(settingsStore.filePath, 'utf8');
    fs.writeFileSync(filePath, data, 'utf8');
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('import-settings', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid format');
    
    const validated = { ...DEFAULT_SETTINGS, ...parsed };
    settingsStore.data = validated;
    settingsStore.save();
    return { success: true, settings: validated };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// 5. System metrics calculation with real WMI query
let prevNetBytes = 0;
let prevNetTimestamp = Date.now();

ipcMain.handle('get-system-metrics', async () => {
  return new Promise((resolve) => {
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $cpu = $null
      try {
        $cpu = (Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        if ($null -eq $cpu) {
          $cpu = (Get-Counter "\\Processor(_Total)\\% Processor Time").CounterSamples[0].CookedValue
        }
      } catch {}
      
      $ramTotal = 0; $ramFree = 0
      try {
        $os = Get-WmiObject -Class Win32_OperatingSystem
        $ramTotal = $os.TotalVisibleMemorySize
        $ramFree = $os.FreePhysicalMemory
      } catch {}
      
      $diskTotal = 0; $diskFree = 0
      try {
        $disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
        $diskTotal = $disk.Size
        $diskFree = $disk.FreeSpace
      } catch {}
      
      $netBytes = 0
      try {
        $netStats = Get-NetAdapterStatistics
        if ($netStats) {
          $netBytes = ($netStats | Measure-Object -Property ReceivedBytes, SentBytes -Sum | Measure-Object -Property Sum -Sum).Sum
        }
      } catch {}
      
      @{
        cpu = if ($null -ne $cpu) { [Math]::Round($cpu, 1) } else { $null }
        ram = if ($ramTotal -gt 0) { [Math]::Round((($ramTotal - $ramFree)/$ramTotal)*100, 1) } else { $null }
        disk = if ($diskTotal -gt 0) { [Math]::Round((($diskTotal - $diskFree)/$diskTotal)*100, 1) } else { $null }
        netBytes = $netBytes
      } | ConvertTo-Json -Compress
    `;

    exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/\n/g, ' ')}"`, (err, stdout) => {
      if (err) {
        resolve({ cpu: null, ram: null, disk: null, netSpeed: null, lastUpdated: new Date().toLocaleTimeString() });
      } else {
        try {
          const metrics = JSON.parse(stdout.trim());
          
          const currentTimestamp = Date.now();
          const timeDiffSeconds = (currentTimestamp - prevNetTimestamp) / 1000;
          let netSpeed = 0;
          
          if (prevNetBytes > 0 && timeDiffSeconds > 0 && metrics.netBytes !== undefined) {
            const bytesDiff = metrics.netBytes - prevNetBytes;
            if (bytesDiff >= 0) {
              netSpeed = Math.round(bytesDiff / timeDiffSeconds);
            }
          }
          
          prevNetBytes = metrics.netBytes || 0;
          prevNetTimestamp = currentTimestamp;
          
          resolve({
            cpu: metrics.cpu,
            ram: metrics.ram,
            disk: metrics.disk,
            netSpeed: netSpeed,
            lastUpdated: new Date().toLocaleTimeString()
          });
        } catch {
          resolve({ cpu: null, ram: null, disk: null, netSpeed: null, lastUpdated: new Date().toLocaleTimeString() });
        }
      }
    });
  });
});
