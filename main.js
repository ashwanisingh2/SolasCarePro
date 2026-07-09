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
const surgicalStore = require('./electron/surgicalStore');
const workspaceStore = require('./electron/workspaceStore');
const tweakerStore = require('./electron/tweakerStore');
const forgeStore = require('./electron/forgeStore');
const privacyStore = require('./electron/privacyStore');
const vaultStore = require('./electron/vaultStore');
const snapshotStore = require('./electron/snapshotStore');
const cloneStore = require('./electron/cloneStore');
const healthStore = require('./electron/healthStore');
const sentinelStore = require('./electron/sentinelStore');
const vcacheStore = require('./electron/vcacheStore');
const sandboxStore = require('./electron/sandboxStore');
const licenseStore = require('./electron/licenseStore');
const telemetryStore = require('./electron/telemetryStore');

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
  // Note: top-level `return` is invalid in CommonJS modules. Use process.exit.
  process.exit(0);
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// FIX: Consolidated the two conflicting `before-quit` handlers into ONE.
// Previous bug: first handler called `app.exit(0)` after 500ms (which prevented
// the second handler's user prompt from ever running). Order-dependent behavior
// was fragile.
//
// Consolidated precedence (top to bottom):
//   1. Mark app.isQuitting so the close handler in createWindow stops intercepting.
//   2. Destroy tray (prevents dangling tray icon after quit).
//   3. If active child processes (sfc/dism/winget): prompt user — Cancel or Force Quit.
//      - Cancel: preventDefault, abort quit.
//      - Force Quit: kill tree, wait 500ms, then app.exit(0).
//   4. Otherwise: proceed normally (Electron cleans up).
app.on('before-quit', (event) => {
  app.isQuitting = true;
  if (tray) {
    try { tray.destroy(); } catch (_) {}
    tray = null;
  }
  const active = typeof activeChildCount === 'function' ? activeChildCount() : 0;
  if (active > 0) {
    const choice = dialog.showMessageBoxSync(mainWindow || null, {
      type: 'warning',
      buttons: ['Cancel', 'Force Quit'],
      defaultId: 0,
      cancelId: 0,
      title: 'Active Operations',
      message: `There are ${active} system operations (like SFC/DISM or Registry Backup) still running in the background. Quitting now will kill them and may leave your system in an inconsistent state.\n\nAre you sure you want to force quit?`
    });
    if (choice === 0) {
      // User chose Cancel — abort quit and reset isQuitting so tray-minimize still works.
      event.preventDefault();
      app.isQuitting = false;
      return;
    }
    // User chose Force Quit — kill tree, wait, exit.
    event.preventDefault();
    writeLog('WARN', `Force quitting with ${active} active child process(es); killing tree...`);
    killActiveProcess();
    setTimeout(() => { app.exit(0); }, 500);
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
  // Record first launch for trial logic (Monetization).
  licenseStore.recordFirstLaunch();
  // Track daily active user (Telemetry — only if opted in).
  try {
    const telSettings = telemetryStore.getSettings();
    if (telSettings.enabled) {
      telemetryStore.trackEvent('app-launch');
    }
  } catch (_) {}
  // Start the workspace trigger poller (Feature 2).
  setTimeout(() => { startTriggerPoller(); }, 10000);
  // Start the vault auto-unmount watcher (Feature 6).
  setTimeout(() => { startVaultWatcher(); }, 15000);
  // Start the snapshot retention cleanup watcher (Feature 7).
  setTimeout(() => { startSnapshotCleanupWatcher(); }, 20000);
  // Start the health polling watcher (Feature 9).
  setTimeout(() => { startHealthWatcher(); }, 25000);
  // Start the sentinel watcher (Feature 10).
  setTimeout(() => { startSentinelWatcher(); }, 30000);
  // V-Cache auto-recreate on startup (Feature 11) — only if user enabled it.
  setTimeout(() => { autoRecreateVCache().catch(() => {}); }, 35000);
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

// 6b. Surgical Uninstaller Store Handlers (Feature 1)
// File-only operations - no PowerShell needed. These provide fast access
// to the snapshot list / diffs cache / orphan scan cache from the renderer.
ipcMain.handle('surgical-list-snapshots', async () => {
  try {
    rateLimit('surgical-list-snapshots');
    return { success: true, snapshots: surgicalStore.listSnapshots() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-get-snapshot', async (event, id) => {
  try {
    if (typeof id !== 'string' || !/^snap_[A-Za-z0-9_]+$/.test(id)) {
      throw new Error('Invalid snapshot id.');
    }
    const snap = surgicalStore.getSnapshot(id);
    return { success: true, snapshot: snap };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-delete-snapshot', async (event, id) => {
  try {
    if (typeof id !== 'string' || !/^snap_[A-Za-z0-9_]+$/.test(id)) {
      throw new Error('Invalid snapshot id.');
    }
    const deleted = surgicalStore.deleteSnapshot(id);
    if (deleted) surgicalStore.clearDiffsForSnapshot(id);
    writeAudit('surgical-delete-snapshot', { id }, { success: deleted });
    return { success: true, deleted };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-save-diff', async (event, diffRecord) => {
  try {
    if (!diffRecord || typeof diffRecord !== 'object' || !diffRecord.snapshotId) {
      throw new Error('Invalid diff record.');
    }
    surgicalStore.appendDiff(diffRecord);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-list-diffs', async () => {
  try {
    return { success: true, diffs: surgicalStore.getAllDiffs() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-save-footprint', async (event, appKey, footprint) => {
  try {
    if (typeof appKey !== 'string' || !/^[A-Za-z0-9_\{\}\-\.]+$/.test(appKey)) {
      throw new Error('Invalid app key.');
    }
    surgicalStore.saveFootprint(appKey, footprint);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-get-footprint', async (event, appKey) => {
  try {
    if (typeof appKey !== 'string' || !/^[A-Za-z0-9_\{\}\-\.]+$/.test(appKey)) {
      throw new Error('Invalid app key.');
    }
    return { success: true, cached: surgicalStore.getFootprint(appKey) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-save-orphan-scan', async (event, orphans) => {
  try {
    surgicalStore.saveOrphanScan(orphans);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('surgical-get-orphan-scan', async () => {
  try {
    return { success: true, scan: surgicalStore.getLastOrphanScan() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6c. Smart Workspace Automation Handlers (Feature 2)
// Profile CRUD + applied state + trigger config. Trigger polling loop
// (time / app / network) runs in main.js below — see startTriggerPoller().
ipcMain.handle('workspace-list-profiles', async () => {
  try {
    return { success: true, profiles: workspaceStore.listProfiles() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('workspace-save-profile', async (event, profile) => {
  try {
    if (!profile || typeof profile !== 'object') throw new Error('Invalid profile.');
    if (typeof profile.id !== 'string' || !/^ws_[A-Za-z0-9_]+$/.test(profile.id)) {
      throw new Error('Invalid profile id.');
    }
    if (typeof profile.name !== 'string' || profile.name.length === 0 || profile.name.length > 100) {
      throw new Error('Profile name must be 1-100 chars.');
    }
    // Validate actions if present
    if (profile.actions) {
      if (typeof profile.actions !== 'object') throw new Error('Invalid actions.');
      if (profile.actions.launchApps && !Array.isArray(profile.actions.launchApps)) throw new Error('launchApps must be array.');
      if (profile.actions.killApps && !Array.isArray(profile.actions.killApps)) throw new Error('killApps must be array.');
      if (profile.actions.powerPlan && !['high','balanced','saver','ultimate'].includes(profile.actions.powerPlan)) {
        throw new Error('Invalid powerPlan.');
      }
      // Cap array lengths
      if (profile.actions.launchApps) profile.actions.launchApps = profile.actions.launchApps.slice(0, 50).map(s => String(s).slice(0, 500));
      if (profile.actions.killApps) profile.actions.killApps = profile.actions.killApps.slice(0, 50).map(s => String(s).slice(0, 200));
    }
    workspaceStore.saveProfile(profile);
    writeAudit('workspace-save-profile', { id: profile.id }, { success: true });
    return { success: true, profile };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('workspace-delete-profile', async (event, profileId) => {
  try {
    if (typeof profileId !== 'string' || !/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
      throw new Error('Invalid profile id.');
    }
    const deleted = workspaceStore.deleteProfile(profileId);
    writeAudit('workspace-delete-profile', { id: profileId }, { success: deleted });
    return { success: true, deleted };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('workspace-get-triggers', async (event, profileId) => {
  try {
    if (typeof profileId !== 'string' || !/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
      throw new Error('Invalid profile id.');
    }
    return { success: true, triggers: workspaceStore.getTriggers(profileId) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('workspace-set-triggers', async (event, profileId, triggers) => {
  try {
    if (typeof profileId !== 'string' || !/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
      throw new Error('Invalid profile id.');
    }
    if (!triggers || typeof triggers !== 'object') throw new Error('Invalid triggers.');
    const cleaned = workspaceStore.setTriggers(profileId, triggers);
    writeAudit('workspace-set-triggers', { id: profileId }, { success: true });
    return { success: true, triggers: cleaned };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('workspace-get-applied', async () => {
  try {
    return { success: true, applied: workspaceStore.getApplied() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- Trigger Polling Loop (Feature 2) ---
// Lightweight polling in main.js. NOT WMI permanent subscriptions (too complex).
// Honesty: only works when SolasCare is running. Documented limitation.
//
// Poll intervals:
//   - time triggers:     every 60s
//   - app triggers:      every 5s  (process list diff is cheap)
//   - network triggers:  every 30s (Get-NetConnectionProfile)
//
// Auto-applies a profile when a trigger fires. Does NOT auto-restore.
// User must explicitly click "Restore" in the UI (safer default).

let triggerPollerStarted = false;
let lastTriggerFired = {};  // { profileId: { time: iso, app: iso, network: iso } }
let lastRunningApps = new Set();
let lastSsid = null;

async function pollTimeTriggers() {
  try {
    const triggers = workspaceStore.listTriggers();
    const now = new Date();
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
    const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    for (const [profileId, cfg] of Object.entries(triggers)) {
      if (!Array.isArray(cfg.time)) continue;
      for (const t of cfg.time) {
        if (!t.from || !t.to) continue;
        if (Array.isArray(t.days) && t.days.length > 0 && !t.days.includes(dayName)) continue;
        // Trigger fires when current time enters the [from, to) window.
        if (hhmm >= t.from && hhmm < t.to) {
          const last = lastTriggerFired[profileId]?.time;
          // Re-fire only if not already fired in this window today.
          if (!last || new Date(last).toDateString() !== now.toDateString() || hhmiDiff(last, now) > 60) {
            await fireTrigger(profileId, 'time');
            lastTriggerFired[profileId] = { ...(lastTriggerFired[profileId] || {}), time: now.toISOString() };
          }
        }
      }
    }
  } catch (e) {
    writeLog('WARN', `Time trigger poll failed: ${e.message}`);
  }
}

function hhmiDiff(iso, now) {
  try { return Math.abs(new Date(iso).getMinutes() - now.getMinutes()); } catch (_) { return 999; }
}

async function pollAppTriggers() {
  try {
    const triggers = workspaceStore.listTriggers();
    // Get current running process names
    if (!windowApiAvailable()) return;
    const res = await executeAllowedCommand('run-quick-cmd', ['task-list'], { bypassConfirmation: true });
    if (!res.success) return;
    // Parse tasklist output: lines of "name pid session mem"
    const lines = (res.stdout || '').split(/\r?\n/).slice(3);  // skip header
    const currentApps = new Set();
    for (const line of lines) {
      const m = line.match(/^\s*(\S+)/);
      if (m) {
        const name = m[1].replace(/\.exe$/i, '').toLowerCase();
        currentApps.add(name);
      }
    }
    // Detect newly-launched apps (in currentApps but not in lastRunningApps)
    const newlyLaunched = [...currentApps].filter(a => !lastRunningApps.has(a));
    for (const [profileId, cfg] of Object.entries(triggers)) {
      if (!Array.isArray(cfg.app)) continue;
      for (const appPattern of cfg.app) {
        const lower = appPattern.toLowerCase();
        if (newlyLaunched.some(a => a === lower || a.includes(lower))) {
          const last = lastTriggerFired[profileId]?.app;
          // Cooldown: don't re-fire within 5 minutes
          if (!last || (Date.now() - new Date(last).getTime()) > 5 * 60 * 1000) {
            await fireTrigger(profileId, 'app', appPattern);
            lastTriggerFired[profileId] = { ...(lastTriggerFired[profileId] || {}), app: new Date().toISOString() };
          }
        }
      }
    }
    lastRunningApps = currentApps;
  } catch (e) {
    // Silent fail - polling errors shouldn't bother the user
  }
}

async function pollNetworkTriggers() {
  try {
    const triggers = workspaceStore.listTriggers();
    if (Object.keys(triggers).length === 0) return;
    if (!windowApiAvailable()) return;
    // Get current SSID via netsh
    const res = await executeAllowedCommand('run-quick-cmd', ['system-info'], { bypassConfirmation: true });
    // netsh wlan show interfaces output is in system-info? No - need separate call.
    // Use powershell inline call (matches existing 'run-quick-cmd' pattern).
    // Actually we'll do a direct spawn since there's no allowlisted command for this.
    const { exec } = require('child_process');
    const out = await new Promise((resolve) => {
      exec('netsh wlan show interfaces', { windowsHide: true }, (err, stdout) => {
        resolve(err ? '' : stdout);
      });
    });
    const ssidMatch = out.match(/^\s*SSID\s*:\s*(.+)$/m);
    const currentSsid = ssidMatch ? ssidMatch[1].trim() : null;
    if (currentSsid === lastSsid) return;  // no change
    lastSsid = currentSsid;
    if (!currentSsid) return;
    for (const [profileId, cfg] of Object.entries(triggers)) {
      if (!Array.isArray(cfg.network)) continue;
      for (const netPattern of cfg.network) {
        if (currentSsid.toLowerCase().includes(netPattern.toLowerCase())) {
          const last = lastTriggerFired[profileId]?.network;
          if (!last || (Date.now() - new Date(last).getTime()) > 5 * 60 * 1000) {
            await fireTrigger(profileId, 'network', currentSsid);
            lastTriggerFired[profileId] = { ...(lastTriggerFired[profileId] || {}), network: new Date().toISOString() };
          }
        }
      }
    }
  } catch (e) {
    // Silent
  }
}

async function fireTrigger(profileId, triggerType, detail = '') {
  try {
    const profile = workspaceStore.getProfile(profileId);
    if (!profile) {
      writeLog('WARN', `Trigger fired for missing profile: ${profileId}`);
      return;
    }
    // Don't auto-apply if a profile is already applied (avoid overwriting before-state)
    const applied = workspaceStore.getApplied();
    if (applied) {
      writeLog('INFO', `Trigger ${triggerType} for ${profile.name} skipped (another profile already applied).`);
      return;
    }
    writeLog('INFO', `Trigger ${triggerType} fired for profile: ${profile.name}${detail ? ' (' + detail + ')' : ''}`);
    // Apply the profile (bypass confirmation since this is automated)
    const profileJson = JSON.stringify(profile);
    const res = await executeAllowedCommand('run-workspace-tool', ['apply-profile', profileJson], { bypassConfirmation: true });
    if (res.success) {
      // Send a notification to the renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('workspace-trigger-fired', { profileId, profileName: profile.name, triggerType, detail });
        new Notification({ title: 'Workspace Auto-Activated', body: `"${profile.name}" profile activated (${triggerType} trigger).` }).show();
      }
      writeAudit('workspace-trigger-fire', { profileId, triggerType, detail }, { success: true });
    } else {
      writeLog('WARN', `Auto-apply failed for ${profile.name}: ${res.error || 'unknown'}`);
    }
  } catch (e) {
    writeLog('WARN', `fireTrigger error: ${e.message}`);
  }
}

function windowApiAvailable() {
  return !!mainWindow;
}

function startTriggerPoller() {
  if (triggerPollerStarted) return;
  triggerPollerStarted = true;
  // Time triggers: every 60s
  setInterval(() => { pollTimeTriggers().catch(() => {}); }, 60 * 1000);
  // App triggers: every 5s (process list is cheap)
  setInterval(() => { pollAppTriggers().catch(() => {}); }, 5 * 1000);
  // Network triggers: every 30s
  setInterval(() => { pollNetworkTriggers().catch(() => {}); }, 30 * 1000);
  // Fire one initial poll so triggers evaluate immediately on app start
  setTimeout(() => {
    pollTimeTriggers().catch(() => {});
    pollNetworkTriggers().catch(() => {});
  }, 5000);
  writeLog('INFO', 'Workspace trigger poller started.');
}

// 6d. God Mode Tweaker Handlers (Feature 3)
// Catalog/bundles live in tweakerStore (JS). PS script only does generic reg ops.
ipcMain.handle('tweaker-get-catalog', async () => {
  try {
    return { success: true, catalog: tweakerStore.getCatalog() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tweaker-get-bundles', async () => {
  try {
    return { success: true, curated: tweakerStore.getCuratedBundles(), custom: tweakerStore.listCustomBundles() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tweaker-save-custom-bundle', async (event, bundle) => {
  try {
    const saved = tweakerStore.saveCustomBundle(bundle);
    writeAudit('tweaker-save-bundle', { id: saved.id }, { success: true });
    return { success: true, bundle: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tweaker-delete-custom-bundle', async (event, id) => {
  try {
    const deleted = tweakerStore.deleteCustomBundle(id);
    writeAudit('tweaker-delete-bundle', { id }, { success: deleted });
    return { success: true, deleted };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tweaker-log-applied', async (event, entry) => {
  try {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
    if (typeof entry.tweakId !== 'string' || !/^[a-z0-9\-]+$/.test(entry.tweakId)) {
      throw new Error('Invalid tweakId');
    }
    if (!['apply', 'undo'].includes(entry.action)) throw new Error('Invalid action');
    entry.loggedIso = new Date().toISOString();
    tweakerStore.appendAppliedLog(entry);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tweaker-list-history', async () => {
  try {
    return { success: true, history: tweakerStore.listAppliedLog() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('tweaker-clear-history', async () => {
  try {
    tweakerStore.clearAppliedLog();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6e. Software Forge Handlers (Feature 4)
// Catalog + role presets live in forgeStore (JS). PS script does the winget/appx work.
ipcMain.handle('forge-get-catalog', async () => {
  try {
    return { success: true, catalog: forgeStore.getCatalog() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('forge-get-presets', async () => {
  try {
    return { success: true, presets: forgeStore.getRolePresets() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('forge-list-custom-catalogs', async () => {
  try {
    return { success: true, catalogs: forgeStore.listCustomCatalogs() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('forge-save-custom-catalog', async (event, catalog) => {
  try {
    const saved = forgeStore.saveCustomCatalog(catalog);
    writeAudit('forge-save-catalog', { id: saved.id }, { success: true });
    return { success: true, catalog: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('forge-delete-custom-catalog', async (event, id) => {
  try {
    const deleted = forgeStore.deleteCustomCatalog(id);
    return { success: true, deleted };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6f. Privacy Blackhole Handlers (Feature 5)
// Blocklist + safe whitelist live in privacyStore (JS). PS just applies ops.
ipcMain.handle('privacy-get-blocklist', async () => {
  try {
    return {
      success: true,
      blocklist: privacyStore.getBlocklist(),
      safeWhitelist: privacyStore.getSafeWhitelist()
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('privacy-filter-safe', async (event, domains) => {
  try {
    if (!Array.isArray(domains)) throw new Error('Domains must be array');
    const result = privacyStore.filterSafeDomains(domains);
    return { success: true, ...result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('privacy-get-blocked-count', async () => {
  try {
    return { success: true, count: privacyStore.getBlockedCount() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('privacy-append-blocked-count', async (event, count) => {
  try {
    if (typeof count !== 'number' || count < 0) throw new Error('Invalid count');
    const data = privacyStore.appendBlockedCount(count);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('privacy-reset-blocked-count', async () => {
  try {
    privacyStore.resetBlockedCount();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6g. Solas Vault Handlers (Feature 6)
// Vault registry + activity log live in vaultStore (JS). PS does diskpart/manage-bde.
ipcMain.handle('vault-list-mounted', async () => {
  try {
    return { success: true, mounted: vaultStore.getMountedVaults() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vault-touch-activity', async (event, vaultId) => {
  try {
    if (typeof vaultId !== 'string' || !/^vault_[A-Za-z0-9_\-]+$/.test(vaultId)) {
      throw new Error('Invalid vault id');
    }
    vaultStore.touchActivity(vaultId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vault-get-activity-log', async () => {
  try {
    return { success: true, log: vaultStore.listActivity() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- Vault auto-unmount watcher (Feature 6) ---
// Polls every 30s; unmounts vaults whose autoUnmountMinutes > 0 and elapsed
// since lastActivityIso > autoUnmountMinutes. Safety: never force-unmount
// if a foreground app might be using the drive (we check via handle count).
let vaultWatcherStarted = false;

function startVaultWatcher() {
  if (vaultWatcherStarted) return;
  vaultWatcherStarted = true;
  setInterval(() => { pollVaultAutoUnmount().catch(() => {}); }, 30 * 1000);
  writeLog('INFO', 'Vault auto-unmount watcher started (30s poll).');
}

async function pollVaultAutoUnmount() {
  const mounted = vaultStore.getMountedVaults();
  const now = Date.now();
  for (const [vaultId, info] of Object.entries(mounted)) {
    if (!info.autoUnmountMinutes || info.autoUnmountMinutes <= 0) continue;
    const lastActivity = new Date(info.lastActivityIso || info.mountedIso).getTime();
    const elapsedMin = (now - lastActivity) / 60000;
    if (elapsedMin >= info.autoUnmountMinutes) {
      writeLog('INFO', `Vault ${vaultId} auto-unmounting after ${Math.round(elapsedMin)} min idle.`);
      try {
        await executeAllowedCommand('run-vault-tool',
          ['unmount-vault', vaultId, info.vaultPath],
          { bypassConfirmation: true });
        vaultStore.markUnmounted(vaultId);
        vaultStore.appendActivity({
          ts: new Date().toISOString(),
          action: 'auto-unmount',
          vaultId,
          result: 'success',
          details: `Idle ${Math.round(elapsedMin)} min`
        });
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('vault-auto-unmounted', { vaultId, reason: 'idle' });
          try {
            new Notification({
              title: 'Vault Auto-Unmounted',
              body: `"${vaultId}" was unmounted after ${Math.round(elapsedMin)} min of inactivity.`
            }).show();
          } catch (_) {}
        }
      } catch (e) {
        writeLog('WARN', `Auto-unmount failed for ${vaultId}: ${e.message}`);
      }
    }
  }
}

// 6h. Micro-Snapshots Handlers (Feature 7)
// Snapshot retention + history live in snapshotStore (JS). PS does System Restore ops.
ipcMain.handle('snapshot-get-settings', async () => {
  try {
    return { success: true, settings: snapshotStore.getSettings() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('snapshot-save-settings', async (event, settings) => {
  try {
    if (!settings || typeof settings !== 'object') throw new Error('Invalid settings');
    const saved = snapshotStore.saveSettings(settings);
    writeAudit('snapshot-save-settings', {}, { success: true });
    return { success: true, settings: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('snapshot-list-history', async () => {
  try {
    return { success: true, history: snapshotStore.listHistory() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('snapshot-append-history', async (event, entry) => {
  try {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
    if (typeof entry.ts !== 'string' || typeof entry.triggerReason !== 'string') {
      throw new Error('Entry missing required fields');
    }
    snapshotStore.appendHistory(entry);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('snapshot-evaluate-retention', async (event, snapshots, diskUsage) => {
  try {
    if (!Array.isArray(snapshots)) throw new Error('snapshots must be array');
    const toDelete = snapshotStore.evaluateRetentionPolicy(snapshots, diskUsage);
    return { success: true, toDelete };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6h.2 Snapshot auto-cleanup watcher (Feature 7)
// Every 10 minutes: list snapshots, get disk usage, evaluate retention, delete marked.
let snapshotCleanupStarted = false;

function startSnapshotCleanupWatcher() {
  if (snapshotCleanupStarted) return;
  snapshotCleanupStarted = true;
  // Run every 10 minutes
  setInterval(() => { pollSnapshotCleanup().catch(() => {}); }, 10 * 60 * 1000);
  // Initial run after 30s
  setTimeout(() => { pollSnapshotCleanup().catch(() => {}); }, 30000);
  writeLog('INFO', 'Snapshot retention cleanup watcher started (10 min poll).');
}

async function pollSnapshotCleanup() {
  const settings = snapshotStore.getSettings();
  if (!settings.autoCleanupEnabled) return;

  try {
    // Get current snapshots + disk usage
    const listRes = await executeAllowedCommand('run-snapshot-tool', ['list-snapshots'],
      { bypassConfirmation: true });
    const listObj = safeJsonParsePS(listRes?.stdout);
    if (!listObj?.success) return;
    const snapshots = listObj.snapshots || [];

    const diskRes = await executeAllowedCommand('run-snapshot-tool', ['get-disk-usage'],
      { bypassConfirmation: true });
    const diskObj = safeJsonParsePS(diskRes?.stdout);
    const diskUsage = diskObj?.disk || null;

    const toDelete = snapshotStore.evaluateRetentionPolicy(snapshots, diskUsage, settings);
    if (toDelete.length === 0) return;

    writeLog('INFO', `Snapshot retention: deleting ${toDelete.length} snapshot(s).`);
    for (const item of toDelete) {
      try {
        await executeAllowedCommand('run-snapshot-tool',
          ['delete-snapshot', String(item.seqNum)],
          { bypassConfirmation: true });
        writeAudit('snapshot-auto-delete', { seq: item.seqNum, reason: item.reason }, { success: true });
      } catch (e) {
        writeLog('WARN', `Auto-delete failed for seq ${item.seqNum}: ${e.message}`);
      }
    }
  } catch (e) {
    writeLog('WARN', `Snapshot cleanup poll failed: ${e.message}`);
  }
}

function safeJsonParsePS(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch (_) { return null; }
}

// 6i. PC Clone Handlers (Feature 8)
// AES-256 encryption + history live in cloneStore (JS). PS does winget/netsh/reg ops.
ipcMain.handle('clone-list-history', async () => {
  try {
    return { success: true, history: cloneStore.listHistory() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clone-append-history', async (event, entry) => {
  try {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
    if (typeof entry.action !== 'string' || !['export', 'import'].includes(entry.action)) {
      throw new Error('Invalid action');
    }
    cloneStore.appendHistory(entry);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Native handler for encrypting a temp JSON file to a .solasclone file
// (used after PS export-clone writes the raw JSON to a temp file)
ipcMain.handle('clone-encrypt-file', async (event, sourceJsonPath, outPath, password) => {
  try {
    if (typeof sourceJsonPath !== 'string' || typeof outPath !== 'string' || typeof password !== 'string') {
      throw new Error('Invalid args');
    }
    if (!sourceJsonPath.endsWith('.json')) throw new Error('Source must end in .json');
    if (!outPath.endsWith('.solasclone')) throw new Error('Output must end in .solasclone');
    if (password.length < 4) throw new Error('Password too short (min 4 chars)');
    // Read raw JSON
    const rawJson = fs.readFileSync(sourceJsonPath, 'utf8');
    // Encrypt
    const result = cloneStore.encryptToFile(rawJson, password, outPath);
    // Clean up temp file
    try { fs.unlinkSync(sourceJsonPath); } catch (_) {}
    writeAudit('clone-encrypt', { outPath }, { success: true });
    return { success: true, bytesWritten: result.bytesWritten };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Native handler for decrypting a .solasclone file to a temp JSON file
// (used before PS import-clone reads the decrypted JSON)
ipcMain.handle('clone-decrypt-file', async (event, inPath, password) => {
  try {
    if (typeof inPath !== 'string' || typeof password !== 'string') {
      throw new Error('Invalid args');
    }
    if (!inPath.endsWith('.solasclone')) throw new Error('Input must end in .solasclone');
    const plaintext = cloneStore.decryptFromFile(inPath, password);
    // Write to temp file
    const tmpPath = path.join(require('os').tmpdir(), `solas_clone_${Date.now()}.json`);
    fs.writeFileSync(tmpPath, plaintext, 'utf8');
    return { success: true, tempJsonPath: tmpPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clone-cleanup-temp', async (event, tempPath) => {
  try {
    if (typeof tempPath !== 'string' || !tempPath.includes('solas_clone_')) {
      throw new Error('Invalid temp path');
    }
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6j. Predictive Maintenance Handlers (Feature 9)
// Health score history + thresholds live in healthStore (JS). PS reads SMART/RAM/etc.
ipcMain.handle('health-get-settings', async () => {
  try {
    return { success: true, settings: healthStore.getSettings() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('health-save-settings', async (event, settings) => {
  try {
    if (!settings || typeof settings !== 'object') throw new Error('Invalid settings');
    const saved = healthStore.saveSettings(settings);
    writeAudit('health-save-settings', {}, { success: true });
    return { success: true, settings: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('health-list-history', async (event, daysBack) => {
  try {
    const days = typeof daysBack === 'number' ? daysBack : 30;
    return { success: true, history: healthStore.listHistory(days) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('health-list-alerts', async (event, daysBack) => {
  try {
    const days = typeof daysBack === 'number' ? daysBack : 30;
    return { success: true, alerts: healthStore.listAlerts(days) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('health-clear-alerts', async () => {
  try {
    healthStore.clearAlerts();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- Health polling watcher (Feature 9) ---
// Polls every N minutes (default 5). Computes health score, appends to history,
// evaluates thresholds, appends alerts, fires Windows toast for critical alerts.
let healthWatcherStarted = false;

function startHealthWatcher() {
  if (healthWatcherStarted) return;
  healthWatcherStarted = true;
  const settings = healthStore.getSettings();
  const intervalMs = (settings.pollingIntervalMinutes || 5) * 60 * 1000;
  setInterval(() => { pollHealth().catch(() => {}); }, intervalMs);
  // Initial poll after 60s
  setTimeout(() => { pollHealth().catch(() => {}); }, 60000);
  writeLog('INFO', `Health watcher started (${settings.pollingIntervalMinutes} min poll).`);
}

async function pollHealth() {
  try {
    const res = await executeAllowedCommand('run-health-tool', ['compute-health-score'],
      { bypassConfirmation: true });
    const obj = safeJsonParsePS(res?.stdout);
    if (!obj?.success) return;

    // Append to history
    healthStore.appendHistory({
      ts: new Date().toISOString(),
      score: obj.score,
      status: obj.status,
      details: obj.details
    });

    // Evaluate thresholds and append alerts
    const settings = healthStore.getSettings();
    const alerts = healthStore.evaluateThresholds(obj, settings);
    for (const alert of alerts) {
      healthStore.appendAlert(alert);
      // Toast for critical alerts
      if (alert.severity === 'critical' && mainWindow && !mainWindow.isDestroyed()) {
        try {
          new Notification({
            title: 'SolasCare Health Alert',
            body: alert.message
          }).show();
        } catch (_) {}
        mainWindow.webContents.send('health-alert', alert);
      }
      writeAudit('health-alert', { metric: alert.metric, severity: alert.severity }, { success: true });
    }
  } catch (e) {
    writeLog('WARN', `Health poll failed: ${e.message}`);
  }
}

// 6k. Solas Sentinel Handlers (Feature 10)
// Rules + event log + digest live in sentinelStore (JS). PS reads state + heals.
ipcMain.handle('sentinel-list-rules', async () => {
  try {
    return { success: true, rules: sentinelStore.listRules() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sentinel-save-rule', async (event, rule) => {
  try {
    if (!rule || typeof rule !== 'object') throw new Error('Invalid rule');
    const saved = sentinelStore.saveRule(rule);
    writeAudit('sentinel-save-rule', { id: saved.id }, { success: true });
    return { success: true, rule: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sentinel-delete-rule', async (event, id) => {
  try {
    if (typeof id !== 'string' || !/^rule_[A-Za-z0-9_\-]+$/.test(id)) {
      throw new Error('Invalid rule id');
    }
    const deleted = sentinelStore.deleteRule(id);
    return { success: true, deleted };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sentinel-list-events', async (event, daysBack) => {
  try {
    const days = typeof daysBack === 'number' ? daysBack : 7;
    return { success: true, events: sentinelStore.listEvents(days) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sentinel-get-digest', async () => {
  try {
    return { success: true, digest: sentinelStore.getLastDigest() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sentinel-generate-digest', async () => {
  try {
    const events = sentinelStore.listEvents(7);
    const digest = sentinelStore.generateDigest(events);
    return { success: true, digest };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- Sentinel watcher (Feature 10) ---
// Every 2 minutes: poll system status, evaluate rules, fire heal actions.
let sentinelWatcherStarted = false;
let lastNetworkAdapters = [];

function startSentinelWatcher() {
  if (sentinelWatcherStarted) return;
  sentinelWatcherStarted = true;
  setInterval(() => { pollSentinel().catch(() => {}); }, 2 * 60 * 1000);
  // Initial poll after 45s
  setTimeout(() => { pollSentinel().catch(() => {}); }, 45000);
  writeLog('INFO', 'Sentinel watcher started (2 min poll).');
}

async function pollSentinel() {
  try {
    const res = await executeAllowedCommand('run-sentinel-tool', ['get-status'],
      { bypassConfirmation: true });
    const obj = safeJsonParsePS(res?.stdout);
    if (!obj?.success) return;
    const status = obj.status;

    // Network drop detection: compare current adapter up count vs last
    const currentUp = status.networkAdapters?.filter(a => a.status === 'Up').length || 0;
    const lastUp = lastNetworkAdapters.filter(a => a.status === 'Up').length;
    if (lastUp > currentUp && lastNetworkAdapters.length > 0) {
      // Network dropped!
      const dropCount = sentinelStore.recordNetworkDrop();
      writeLog('INFO', `Network drop detected (${dropCount} in window).`);
      sentinelStore.appendEvent({
        ts: new Date().toISOString(),
        eventType: 'network-drop',
        details: `Up adapters: ${lastUp} -> ${currentUp}`
      });
    }
    lastNetworkAdapters = status.networkAdapters || [];

    // Evaluate rules
    const toFire = sentinelStore.evaluateRules(status);
    for (const item of toFire) {
      const { rule, actualValue, threshold, metric } = item;
      writeLog('INFO', `Sentinel rule fired: ${rule.name} (${metric}=${actualValue}, threshold=${threshold})`);

      // Apply heal action
      let healResult = null;
      let healSuccess = false;
      try {
        if (rule.action.type === 'notify-only') {
          healSuccess = true;
          healResult = { message: 'Notification only' };
        } else {
          // Build IPC args based on action type
          const psArgs = [rule.action.type];
          if (rule.action.type === 'restart-service') {
            psArgs.push(rule.action.arg);  // serviceName
          } else if (rule.action.type === 'reset-network-adapter' || rule.action.type === 'kill-process') {
            psArgs.push(null);
            psArgs.push(rule.action.arg);  // actionArg
          }
          const healRes = await executeAllowedCommand('run-sentinel-tool', psArgs,
            { bypassConfirmation: true });
          const healObj = safeJsonParsePS(healRes?.stdout);
          healSuccess = healObj?.success || false;
          healResult = healObj;
        }
      } catch (e) {
        healResult = { error: e.message };
      }

      // Update lastFired
      sentinelStore.updateLastFired(rule.id, new Date().toISOString());

      // Append event
      sentinelStore.appendEvent({
        ts: new Date().toISOString(),
        eventType: healSuccess ? 'heal-success' : 'heal-failure',
        ruleId: rule.id,
        ruleName: rule.name,
        metric,
        actualValue,
        threshold,
        action: rule.action.type,
        actionArg: rule.action.arg,
        result: healResult
      });

      // Notify user
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sentinel-rule-fired', {
          rule, metric, actualValue, threshold, healSuccess, healResult
        });
        try {
          new Notification({
            title: healSuccess ? 'Sentinel Auto-Heal' : 'Sentinel Heal Failed',
            body: `"${rule.name}" fired. Action: ${rule.action.type}. ${healSuccess ? 'Success.' : 'Failed.'}`
          }).show();
        } catch (_) {}
      }
      writeAudit('sentinel-rule-fire', { ruleId: rule.id, action: rule.action.type }, { success: healSuccess });
    }
  } catch (e) {
    writeLog('WARN', `Sentinel poll failed: ${e.message}`);
  }
}

// 6l. V-Cache Handlers (Feature 11) — Stretch Goal
ipcMain.handle('vcache-get-auto-config', async () => {
  try {
    return { success: true, config: vcacheStore.getAutoConfig() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vcache-save-auto-config', async (event, config) => {
  try {
    if (!config || typeof config !== 'object') throw new Error('Invalid config');
    const saved = vcacheStore.saveAutoConfig(config);
    writeAudit('vcache-save-config', {}, { success: true });
    return { success: true, config: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vcache-list-activity', async (event, daysBack) => {
  try {
    const days = typeof daysBack === 'number' ? daysBack : 30;
    return { success: true, activity: vcacheStore.listActivity(days) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('vcache-append-activity', async (event, entry) => {
  try {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
    vcacheStore.appendActivity(entry);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// --- V-Cache auto-recreate watcher (Feature 11) ---
// On SolasCare startup: if autoRecreateOnStartup is enabled AND crashWarningAcknowledged,
// re-create the RAM disk + re-apply cache redirects from last session.
async function autoRecreateVCache() {
  try {
    const cfg = vcacheStore.getAutoConfig();
    if (!cfg.autoRecreateOnStartup || !cfg.crashWarningAcknowledged) return;
    if (!cfg.lastDriveLetter || !cfg.lastSizeMB) return;

    writeLog('INFO', `V-Cache auto-recreate: ${cfg.lastDriveLetter}: (${cfg.lastSizeMB}MB)`);
    const res = await executeAllowedCommand('run-vcache-tool',
      ['create-ramdisk', cfg.lastDriveLetter, cfg.lastSizeMB],
      { bypassConfirmation: true });
    const obj = safeJsonParsePS(res?.stdout);
    if (obj?.success) {
      vcacheStore.appendActivity({
        ts: new Date().toISOString(),
        action: 'auto-recreate',
        driveLetter: cfg.lastDriveLetter,
        sizeMB: cfg.lastSizeMB,
        result: 'success'
      });
      writeLog('INFO', `V-Cache auto-recreated at ${cfg.lastDriveLetter}:`);
    } else {
      writeLog('WARN', `V-Cache auto-recreate failed: ${obj?.error || 'unknown'}`);
    }
  } catch (e) {
    writeLog('WARN', `V-Cache auto-recreate error: ${e.message}`);
  }
}

// 6m. Sandbox Handlers (Feature 12) — Stretch Goal
ipcMain.handle('sandbox-list-activity', async (event, daysBack) => {
  try {
    const days = typeof daysBack === 'number' ? daysBack : 30;
    return { success: true, activity: sandboxStore.listActivity(days) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('sandbox-append-activity', async (event, entry) => {
  try {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
    sandboxStore.appendActivity(entry);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6n. License / Monetization Handlers
// Free/Pro tier + trial logic + feature gating + usage counters.
ipcMain.handle('license-get-state', async () => {
  try {
    return { success: true, state: licenseStore.getLicenseState() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('license-activate', async (event, key) => {
  try {
    if (typeof key !== 'string' || key.length > 100) throw new Error('Invalid key');
    const state = licenseStore.activateLicense(key);
    writeAudit('license-activate', {}, { success: true });
    return { success: true, state };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('license-deactivate', async () => {
  try {
    const state = licenseStore.deactivateLicense();
    writeAudit('license-deactivate', {}, { success: true });
    return { success: true, state };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('license-check-feature', async (event, featureId) => {
  try {
    if (typeof featureId !== 'string' || featureId.length > 100) throw new Error('Invalid feature id');
    const access = licenseStore.checkFeatureAccess(featureId);
    return { success: true, access };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('license-increment-usage', async (event, counterId) => {
  try {
    if (typeof counterId !== 'string' || counterId.length > 100) throw new Error('Invalid counter id');
    const count = licenseStore.incrementUsage(counterId);
    return { success: true, count };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('license-get-usage', async () => {
  try {
    return { success: true, usage: licenseStore.getUsage() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('license-generate-demo-key', async () => {
  try {
    // For testing only — generates a valid-format demo key
    const key = licenseStore.generateDemoLicenseKey();
    return { success: true, key };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 6o. Telemetry / Success Metrics Handlers
// Opt-in anonymous analytics for DAU, retention, feature usage tracking.
ipcMain.handle('telemetry-get-settings', async () => {
  try {
    return { success: true, settings: telemetryStore.getSettings() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('telemetry-save-settings', async (event, settings) => {
  try {
    if (!settings || typeof settings !== 'object') throw new Error('Invalid settings');
    const saved = telemetryStore.saveSettings(settings);
    return { success: true, settings: saved };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('telemetry-track-event', async (event, eventName, eventData) => {
  try {
    if (typeof eventName !== 'string' || eventName.length > 200) throw new Error('Invalid event name');
    telemetryStore.trackEvent(eventName, eventData);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('telemetry-get-stats', async (event, daysBack) => {
  try {
    const days = typeof daysBack === 'number' ? daysBack : 30;
    return { success: true, stats: telemetryStore.getStats(days) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('telemetry-get-feature-usage', async () => {
  try {
    return { success: true, usage: telemetryStore.getFeatureUsage() };
  } catch (e) {
    return { success: false, error: e.message };
  }
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
