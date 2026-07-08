// squirrel startup hook check
if (require('electron-squirrel-startup')) {
  process.exit(0);
}

const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, shell, nativeImage, Notification, session, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');
const { initCommandExecutor, executeAllowedCommand, killActiveProcess, getScriptPath, activeChildCount } = require('./electron/commandExecutor');

let mainWindow;
let tray = null;
const logDir = path.join(process.env.APPDATA || './', 'SolasCare', 'logs');
const reportsDir = path.join(process.env.APPDATA || './', 'SolasCare', 'reports');

// Create log directory
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Audit log uses a single JSONL file shared with PowerShell scripts.
// Schema (kept in sync with scripts/_common.ps1 Write-AuditLog):
//   {"ts":"ISO 8601","user":"PC\\user","action":"...","target":"...",
//    "result":"success|failure|started|cancelled","details":"...","script":"main.js"}
const auditFile = path.join(logDir, 'audit.jsonl');

// Tiny write queue to avoid blocking the main thread on synchronous file I/O.
// We coalesce writes into a single appendFile call per tick.
const writeQueue = new Map(); // file -> string[]
let writeFlushScheduled = false;
function flushWrites() {
  writeFlushScheduled = false;
  for (const [file, lines] of writeQueue.entries()) {
    if (lines.length === 0) continue;
    const payload = lines.join('');
    lines.length = 0;
    fs.promises.appendFile(file, payload, 'utf8').catch((e) => {
      console.error('Log write failed for', file, ':', e.message);
    });
  }
}
function queueWrite(file, payload) {
  if (!writeQueue.has(file)) writeQueue.set(file, []);
  writeQueue.get(file).push(payload);
  if (!writeFlushScheduled) {
    writeFlushScheduled = true;
    setImmediate(flushWrites);
  }
}

function writeLog(level, message) {
  const logMsg = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  console.log(logMsg.trim());
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `solas_care_${today}.log`);
  queueWrite(logFile, logMsg);
}

function rotateLogs() {
  try {
    if (!fs.existsSync(logDir)) return;
    const files = fs.readdirSync(logDir);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    if (fs.existsSync(auditFile)) {
      const stats = fs.statSync(auditFile);
      if (stats.size > 10 * 1024 * 1024) { // 10 MB
        fs.renameSync(auditFile, `${auditFile}.${Date.now()}.bak`);
      }
    }

    for (const file of files) {
      if (file.endsWith('.log') || file.includes('.bak')) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (e) {
    console.error('Log rotation failed:', e);
  }
}

// Perform log rotation once on startup
rotateLogs();


process.on('uncaughtException', (error) => {
  writeLog('ERROR', `Uncaught Exception: ${error.message}\n${error.stack}`);
  if (app.isReady()) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Fatal Error',
      message: 'A fatal error occurred. The application may need to restart.',
      detail: error.message
    });
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  writeLog('ERROR', `Unhandled Rejection: ${msg}`);
  if (app.isReady()) {
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Unhandled Error',
      message: 'An unexpected error occurred.',
      detail: reason instanceof Error ? reason.message : String(reason)
    });
  }
});

function writeAudit(action, details, result) {
  // Unified schema - matches scripts/_common.ps1 Write-AuditLog so that
  // repair_summary_report.ps1 (which reads audit.jsonl) can pick up events
  // emitted from BOTH the main process and PowerShell child scripts.
  const entry = {
    ts: new Date().toISOString(),
    user: `${process.env.COMPUTERNAME || 'PC'}\\${process.env.USERNAME || process.env.USER || 'unknown'}`,
    action,
    target: '',
    result: result?.success ? 'success' : 'failure',
    details: typeof details === 'string'
      ? details
      : (details && details.args ? `args=${JSON.stringify(details.args)}` : ''),
    script: 'main.js',
    // Extra fields kept for backwards compat with old audit.log readers
    error: result?.error || result?.stderr || null,
  };
  queueWrite(auditFile, JSON.stringify(entry) + '\n');
}

// 1. Settings persistence store
const DEFAULT_SETTINGS = {
  schemaVersion: 1,
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
  lastRestorePointId: null,
  optInAnalytics: false,
  optInCrashReports: false
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

  // Build a proper PowerShell array literal so any arg containing quotes, commas,
  // or $ survives -ArgumentList parsing intact. Single-quote-escape each arg.
  const psArgs = args
    .map((a) => "'" + String(a).replace(/'/g, "''") + "'")
    .join(',');
  const safeExe = String(exePath).replace(/'/g, "''");
  const command = `Start-Process -FilePath '${safeExe}' -ArgumentList @(${psArgs}) -Verb RunAs`;

  spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  app.quit();
}

// 2. PowerShell block check
// NOTE: Set-ExecutionPolicy -Scope Process has no effect on later spawned
// powershell.exe children (each spawn already passes -ExecutionPolicy Bypass).
// We only probe the policy here for diagnostics; the bypass is enforced per-spawn
// in commandExecutor.js.
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
          writeLog('INFO', 'System PowerShell policy is Restricted; per-spawn -ExecutionPolicy Bypass will be applied.');
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

  // In dev mode the app is launched via `electron .` from a (usually non-elevated)
  // terminal alongside the Vite server. Relaunching as admin here would quit this
  // process, causing `concurrently -k` to kill the Vite dev server, so the elevated
  // window never loads. Skip elevation in dev; the packaged build launches elevated
  // via the app manifest (requireAdministrator) anyway.
  const isDevRun = !app.isPackaged && !!process.env.VITE_DEV_SERVER_URL;

  // Relaunch dialog with loop-protection
  if (!isAdmin && !isDevRun) {
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
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J (console), and Ctrl+R (reload) in production.
      if (input.key === 'F12' ||
          (input.control && input.shift && (key === 'i' || key === 'j')) ||
          (input.control && key === 'r')) {
        event.preventDefault();
      }
    });
  }

  // Stricter will-navigate guard: only allow same-origin navigation, deny everything else.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();
    if (!currentUrl) {
      // During initial load, only allow the expected origin.
      const expected = app.isPackaged
        ? `file://${path.join(__dirname, 'dist', 'index.html').replace(/\\/g, '/')}`
        : process.env.VITE_DEV_SERVER_URL;
      if (expected && !url.startsWith(expected)) {
        event.preventDefault();
        writeLog('WARN', 'Blocked navigation to: ' + url);
      }
      return;
    }
    try {
      const a = new URL(url);
      const b = new URL(currentUrl);
      if (a.origin !== b.origin) {
        event.preventDefault();
        writeLog('WARN', 'Blocked cross-origin navigation to: ' + url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    writeLog('WARN', 'Blocked window.open to: ' + url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  mainWindow.webContents.on('console-message', (e, l, m) => require('fs').appendFileSync('renderer.log', m + '\n'));
  mainWindow.webContents.on('console-message', (e, l, m) => console.log('[RENDERER]', m));
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

  setTimeout(() => {
    checkBackgroundScheduledTask();
  }, 5000);
}

// Single-instance lock: prevents concurrent instances from racing on settings,
// audit log, scheduled task, and PowerShell script files.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  return;
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// `before-quit` ensures the close handler in createWindow stops intercepting
// OS shutdown / Alt+F4 / app.quit() once the user actually wants to exit.
// Without this, minimising to tray once is enough to permanently block logoff.
//
// IMPROVEMENT: also kill any in-flight child processes (sfc/dism/winget) so
// they don't keep running detached and potentially corrupt files mid-write.
app.on('before-quit', (event) => {
  app.isQuitting = true;
  if (tray) {
    try { tray.destroy(); } catch (e) {}
    tray = null;
  }
  if (activeChildCount() > 0) {
    event.preventDefault();
    writeLog('WARN', `Quitting with ${activeChildCount()} active child process(es); cleaning up...`);
    killActiveProcess();
    // Wait briefly for the tree-kill to complete before allowing quit.
    setTimeout(() => {
      app.exit(0);
    }, 500);
  }
});

// IMPROVEMENT: register a global hotkey (Ctrl+Alt+S) to bring the app to front.
// Useful when the user has minimized to tray during a long scan.
app.on('ready', () => {
  try {
    globalShortcut.register('CommandOrControl+Alt+S', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      } else {
        createWindow();
      }
    });
  } catch (e) {
    writeLog('WARN', 'Failed to register global shortcut: ' + e.message);
  }
});

app.on('before-quit', (event) => {
  if (activeChildCount && activeChildCount() > 0) {
    const choice = dialog.showMessageBoxSync(mainWindow || null, {
      type: 'warning',
      buttons: ['Cancel', 'Force Quit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Active Operations',
      message: 'There are system operations (like SFC/DISM or Registry Backup) still running in the background. Quitting now will kill them and may leave your system in an inconsistent state.\n\nAre you sure you want to force quit?'
    });
    if (choice === 0) {
      event.preventDefault();
      return;
    }
  }
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
});

// IMPROVEMENT: inject a strict Content-Security-Policy on all responses.
// The dev-server URL is allowed only in dev mode via the dynamic check below.
function installCsp() {
  const isDev = !app.isPackaged;
  const connectSrc = isDev ? "'self' http://localhost:* ws://localhost:*" : "'self'";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; ` +
          `script-src 'self'; ` +
          `style-src 'self' 'unsafe-inline'; ` +
          `img-src 'self' data:; ` +
          `font-src 'self' data:; ` +
          `connect-src ${connectSrc}; ` +
          `object-src 'none'; ` +
          `frame-src 'none'`
        ]
      }
    });
  });
}

// IMPROVEMENT: IPC rate-limiting + in-flight de-duplication.
// A user double-clicking "Run SFC" could otherwise launch two concurrent
// `sfc /scannow` processes both writing to the same file.
const buckets = new Map();      // channel -> { tokens, lastRefill }
const inflight = new Map();     // key -> Promise
const LIMITS = {
  'run-system-command': { rps: 4, burst: 8 },
  'get-system-metrics': { rps: 4, burst: 6 },
  'set-setting':        { rps: 12, burst: 24 },
  'get-setting':        { rps: 20, burst: 40 },
  'is-admin':           { rps: 5, burst: 10 },
  'get-system-info':    { rps: 5, burst: 10 },
  'get-dns-status':     { rps: 5, burst: 10 }
};
function rateLimit(channel) {
  const cfg = LIMITS[channel] || { rps: 5, burst: 10 };
  let b = buckets.get(channel) || { tokens: cfg.burst, last: Date.now() };
  const now = Date.now();
  b.tokens = Math.min(cfg.burst, b.tokens + (now - b.last) / 1000 * cfg.rps);
  b.last = now;
  buckets.set(channel, b);
  if (b.tokens < 1) {
    throw new Error('Rate limit exceeded for ' + channel + '. Please slow down.');
  }
  b.tokens -= 1;
}
function dedupe(key, fn) {
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

app.whenReady().then(() => {
  installCsp();
  createWindow();
}).catch((err) => {
  console.error('Failed to start Solas Care Pro:', err);
  try {
    dialog.showErrorBox('Startup Error', err && err.message ? err.message : String(err));
  } catch (_) {}
  app.quit();
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
  if (typeof pnpDeviceId !== 'string' || !pnpDeviceId) {
    return false;
  }
  const safeId = pnpDeviceId.replace(/[^a-zA-Z0-9]/g, '_');
  const backupFile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `solas_driver_backup_${safeId}.reg`);
  return fs.existsSync(backupFile);
});

// All command run logic has been moved to commandExecutor.js

ipcMain.handle('run-system-command', async (event, commandKey, args = [], options = {}) => {
  try {
    rateLimit('run-system-command');
    // De-duplicate in-flight commands so a double-click doesn't
    // launch two processes simultaneously. Commands that explicitly
    // bypass confirmation are NOT deduplicated to allow queued operations.
    const readOnly = !options.bypassConfirmation;
    const dedupeKey = readOnly ? `cmd:${commandKey}:${JSON.stringify(args)}` : null;
    const exec = () => executeAllowedCommand(commandKey, args, options);
    writeLog('INFO', `Requested allowlisted command: ${commandKey}`);
    const result = dedupeKey ? await dedupe(dedupeKey, exec) : await exec();
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
// Returns an object { primary, secondary, status } where status is
// 'Original' or 'Temporary (Google)'. The NetworkMonitor DNS tab reads
// .primary and .secondary to render monospace badges.
//
// We try to read the actual configured DNS servers via a quick
// PowerShell Get-DnsClientServerAddress call (cached 60s to avoid
// hammering it on every tab visit). If that fails, fall back to the
// solas_dns_backup.json presence check (which only tells us whether
// we set Google DNS during a recent network-reset).
let cachedDns = null;
let cachedDnsTs = 0;
const DNS_CACHE_TTL_MS = 60000;

ipcMain.handle('get-dns-status', async () => {
  const tempPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'solas_dns_backup.json');
  const isTemporary = fs.existsSync(tempPath);
  const status = isTemporary ? 'Temporary (Google)' : 'Original';

  // Return cached value if fresh
  if (cachedDns && Date.now() - cachedDnsTs < DNS_CACHE_TTL_MS) {
    return { ...cachedDns, status };
  }

  // Try to read actual DNS server IPs via PowerShell
  return new Promise((resolve) => {
    const cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "' +
      '$a = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | ' +
      'Where-Object { $_.ServerAddresses.Count -gt 0 } | Select-Object -First 1; ' +
      "if ($a) { $a.ServerAddresses -join '|' } else { '' }" +
      '"';
    exec(cmd, { windowsHide: true, timeout: 8000 }, (err, stdout) => {
      let primary = '';
      let secondary = '';
      if (!err && stdout) {
        const parts = stdout.trim().split('|').filter(Boolean);
        if (parts.length > 0) primary = parts[0];
        if (parts.length > 1) secondary = parts[1];
      }
      // Sensible defaults if PowerShell couldn't tell us
      if (!primary) {
        primary = isTemporary ? '8.8.8.8' : 'DHCP-assigned';
      }
      if (!secondary) {
        secondary = isTemporary ? '8.8.4.4' : 'DHCP-assigned';
      }
      cachedDns = { primary, secondary };
      cachedDnsTs = Date.now();
      resolve({ primary, secondary, status });
    });
  });
});

ipcMain.handle('get-system-info', async () => {
  const release = os.release();
  const platform = os.platform();
  const majorVersion = parseInt(release.split('.')[0], 10);
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

  // CPU info - HardwareDiagnostics.jsx's CPU tab expects these fields.
  // Reading from os.cpus() is fast and synchronous (no PowerShell spawn).
  const cpus = os.cpus() || [];
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
  const cpuCores = cpus.length;

  // cpuLoad: derive from the most recent metrics cache if available,
  // otherwise spawn a quick sample. We deliberately reuse lastMetrics
  // to avoid spawning a fresh netstat call on every CPU tab visit.
  const cpuLoad = (lastMetrics && typeof lastMetrics.cpu === 'number')
    ? lastMetrics.cpu
    : 0;

  // Total + free RAM (used by some components for memory context)
  const totalMemBytes = os.totalmem();
  const freeMemBytes = os.freemem();

  return {
    release,
    platform,
    executionPolicy: systemExecutionPolicy,
    isLegacyWin,
    osName,
    // CPU fields (used by HardwareDiagnostics CPU tab)
    cpuModel,
    cpuCores,
    cpuLoad,
    // Memory fields (used for context displays)
    totalMemBytes,
    freeMemBytes,
    totalMemGB: Math.round(totalMemBytes / 1024 / 1024 / 1024 * 10) / 10,
    freeMemGB: Math.round(freeMemBytes / 1024 / 1024 / 1024 * 10) / 10,
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

ipcMain.handle('open-save-dialog', async (event, { title, defaultPath, filters } = {}) => {
  try {
    // Prefer the window that sent the request so we don't pass a stale reference
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { canceled: true };
    const result = await dialog.showSaveDialog(win, { title, defaultPath, filters });
    return result;
  } catch (e) {
    writeLog('ERROR', 'Error opening save dialog: ' + e.message);
    return { canceled: true };
  }
});

ipcMain.handle('open-file-dialog', async (event, { title, filters } = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return { canceled: true, filePaths: [] };
    const result = await dialog.showOpenDialog(win, { title, filters, properties: ['openFile'] });
    return result;
  } catch (e) {
    writeLog('ERROR', 'Error opening open dialog: ' + e.message);
    return { canceled: true, filePaths: [] };
  }
});

// 5. System metrics calculation with native Node APIs and netstat (0% CPU)
let prevCpus = os.cpus();
let prevNetBytes = 0;
let prevNetTimestamp = Date.now();
let lastMetrics = null;          // cached last-computed metrics (for rate-limited calls)
let metricsCacheTs = 0;          // timestamp of last compute
const METRICS_CACHE_TTL_MS = 1500; // cache metrics for 1.5s to debounce rapid polls

function getCpuUsagePercent() {
  const currentCpus = os.cpus();
  let totalDiff = 0;
  let idleDiff = 0;
  
  for (let i = 0; i < currentCpus.length; i++) {
    const prev = prevCpus[i];
    const curr = currentCpus[i];
    if (!prev || !curr) continue;
    
    const prevTotal = prev.times.user + prev.times.nice + prev.times.sys + prev.times.idle + prev.times.irq;
    const currTotal = curr.times.user + curr.times.nice + curr.times.sys + curr.times.idle + curr.times.irq;
    
    totalDiff += (currTotal - prevTotal);
    idleDiff += (curr.times.idle - prev.times.idle);
  }
  
  prevCpus = currentCpus;
  if (totalDiff === 0) return 0;
  return Math.round((1 - (idleDiff / totalDiff)) * 1000) / 10;
}

// IMPROVEMENT: computeMetrics is a single async function that returns a
// cached result if called within the TTL window. This avoids spawning
// `netstat -e` on every 2s poll when the renderer bursts requests.
async function computeMetrics() {
  // Cache hit - return last known values without re-spawning netstat.
  if (Date.now() - metricsCacheTs < METRICS_CACHE_TTL_MS) {
    return lastMetrics;
  }

  const cpuPercent = getCpuUsagePercent();

  // RAM Usage
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramPercent = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10 : 0;

  // Disk Usage - use SystemDrive instead of hardcoded C:
  let diskPercent = null;
  try {
    const sysDrive = (process.env.SystemDrive || 'C:\\') + '\\';
    const stats = fs.statfsSync(sysDrive);
    if (stats.blocks > 0) {
      diskPercent = Math.round(((stats.blocks - stats.bfree) / stats.blocks) * 1000) / 10;
    }
  } catch (e) {
    writeLog('WARN', 'Failed to retrieve native disk metrics: ' + e.message);
  }

  // Network speed using fast netstat -e command (only when cache expires)
  return new Promise((resolve) => {
    exec('netstat -e', (err, stdout) => {
      let netSpeed = 0;
      const currentTimestamp = Date.now();
      const timeDiffSeconds = (currentTimestamp - prevNetTimestamp) / 1000;
      
      if (!err && stdout) {
        const lines = stdout.split('\n');
        const bytesLine = lines.find(line => line.toLowerCase().includes('bytes'));
        if (bytesLine) {
          const parts = bytesLine.trim().split(/\s+/);
          const received = parseInt(parts[1]) || 0;
          const sent = parseInt(parts[2]) || 0;
          const totalBytes = received + sent;
          
          if (prevNetBytes > 0 && timeDiffSeconds > 0) {
            const bytesDiff = totalBytes - prevNetBytes;
            if (bytesDiff >= 0) {
              netSpeed = Math.round(bytesDiff / timeDiffSeconds);
            }
          }
          prevNetBytes = totalBytes;
        }
      }
      prevNetTimestamp = currentTimestamp;
      
      const metrics = {
        cpu: cpuPercent,
        ram: ramPercent,
        disk: diskPercent,
        netSpeed: netSpeed,
        lastUpdated: new Date().toLocaleTimeString()
      };
      lastMetrics = metrics;
      metricsCacheTs = Date.now();
      resolve(metrics);
    });
  });
}

ipcMain.handle('get-system-metrics', async () => {
  try {
    rateLimit('get-system-metrics');
  } catch (e) {
    // Rate limited - return cached/last-known metrics without re-querying.
    return lastMetrics || { cpu: 0, ram: 0, disk: 0, netSpeed: 0, lastUpdated: 'rate-limited' };
  }
  return computeMetrics();
});

// 6. Background Scheduled Task Monitor and System Notifications
// Resolve the icon from multiple candidate locations so it works both in dev
// and in packaged builds (asar + asar.unpacked).
function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '..', 'icon.png'),
    path.join(app.getAppPath(), 'icon.png'),
    path.join(process.resourcesPath || '', 'icon.png')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

function showSystemNotification(title, body) {
  if (Notification.isSupported()) {
    const iconPath = resolveAppIcon();
    const opts = { title, body };
    if (iconPath) opts.icon = iconPath;
    const notification = new Notification(opts);
    notification.show();
  }
}

function checkBackgroundScheduledTask() {
  try {
    const scriptPath = getScriptPath('check_task_status.ps1');
    const cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
    exec(cmd, (err, stdout) => {
      if (err) {
        writeLog('WARN', 'Failed to check background scheduled task status: ' + err.message);
        return;
      }
      try {
        const status = JSON.parse(stdout.trim());
        writeLog('INFO', `Scheduled task status check: Registered=${status.Registered}, State=${status.State || 'N/A'}`);
        if (status.Registered && status.LastTaskResult !== 0 && status.LastTaskResult !== undefined && status.LastTaskResult !== 267009) {
          showSystemNotification(
            'Scheduled Care Alert',
            `Background scheduled maintenance task finished with status error: ${status.LastTaskResult}.`
          );
        }
      } catch(e) {
        writeLog('ERROR', 'Error parsing scheduled task status output: ' + e.message);
      }
    });
  } catch (e) {
    writeLog('ERROR', 'Failed to locate check_task_status script: ' + e.message);
  }
}

ipcMain.on('show-notification', (event, { title, body } = {}) => {
  if (typeof title !== 'string' || typeof body !== 'string') return;
  showSystemNotification(title, body);
});
