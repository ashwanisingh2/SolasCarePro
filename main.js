// squirrel startup hook check
if (require('electron-squirrel-startup')) return;

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const { initCommandExecutor, executeAllowedCommand, killActiveProcess } = require('./electron/commandExecutor');

let mainWindow;
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
initCommandExecutor(() => mainWindow, writeLog, writeAudit, settingsStore, DEFAULT_SETTINGS);

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
  
  const iconPaths = [
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../icon.png'),
    path.join(app.getAppPath(), 'icon.png')
  ];
  
  let trayIcon = null;
  for (const p of iconPaths) {
    if (fs.existsSync(p)) {
      trayIcon = nativeImage.createFromPath(p);
      break;
    }
  }
  
  if (!trayIcon) {
    // 1x1 Transparent pixel PNG base64 fallback
    const iconBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    trayIcon = nativeImage.createFromBuffer(iconBuffer);
  }
  
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

app.whenReady().then(() => {
  createWindow();
});

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

// All command run logic has been moved to commandExecutor.js

ipcMain.handle('run-system-command', async (event, commandKey, args = [], options = {}) => {
  try {
    writeLog('INFO', `Requested allowlisted command: ${commandKey}`);
    const result = await executeAllowedCommand(commandKey, args, options);
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
  return killActiveProcess();
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

ipcMain.handle('open-save-dialog', async (event, { title, defaultPath, filters }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, { title, defaultPath, filters });
    return result;
  } catch (e) {
    console.error('Error opening save dialog:', e);
    return { canceled: true };
  }
});

ipcMain.handle('open-file-dialog', async (event, { title, filters }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, { title, filters, properties: ['openFile'] });
    return result;
  } catch (e) {
    console.error('Error opening open dialog:', e);
    return { canceled: true, filePaths: [] };
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

// 6. Background Scheduled Task Monitor and System Notifications
function showSystemNotification(title, body) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, 'dist', 'icon.png')
    });
    notification.show();
  }
}

ipcMain.on('show-notification', (event, { title, body }) => {
  showSystemNotification(title, body);
});
