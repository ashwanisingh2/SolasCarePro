// electron/tweakerStore.js
// Storage + catalog for the God Mode Visual Tweaker (Feature 3).
//
// The TWEAK_CATALOG is the single source of truth for tweak definitions —
// both the UI (renderer) and the apply/undo engine (PS script) read from it.
// The PS script is generic: it just takes regKey/valueName/valueType/valueData
// and performs backup + apply. Catalog lives here because it's UI-facing metadata
// (name, description, risk, icon) that doesn't belong in PS.
//
// Layout (under %APPDATA%\SolasCare\tweaker\):
//   backups\*.json    - per-tweak backup files (managed by PS script)
//   applied.jsonl     - append-only log of apply/undo events
//   custom_bundles.json - user-imported bundles

const fs = require('fs');
const path = require('path');

// --- Catalog (curated, real Windows 10/11 tweaks) ---
// Each tweak:
//   id, name, description, risk ('low'|'medium'|'high'), category,
//   regKey (PSDrive path), valueName, valueType, valueData, bundles []

const TWEAK_CATALOG = [
  // === Privacy ===
  {
    id: 'disable-telemetry',
    name: 'Disable Windows Telemetry',
    description: 'Stops Windows from sending usage data to Microsoft. Sets AllowTelemetry to 0 (Enterprise level) via Group Policy.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection',
    valueName: 'AllowTelemetry', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['speed', 'privacy']
  },
  {
    id: 'disable-advertising-id',
    name: 'Disable Advertising ID',
    description: 'Prevents Windows from assigning a unique ID for ad targeting across apps.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo',
    valueName: 'Enabled', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },
  {
    id: 'disable-app-launch-tracking',
    name: 'Disable App Launch Tracking',
    description: 'Stops Windows from tracking which apps you launch for "frequent" lists in Start menu.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced',
    valueName: 'Start_TrackProgs', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },
  {
    id: 'disable-timeline',
    name: 'Disable Timeline (Activity Feed)',
    description: 'Disables Windows Timeline which syncs your activity history across devices.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\System',
    valueName: 'EnableActivityFeed', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },
  {
    id: 'disable-online-speech',
    name: 'Disable Online Speech Recognition',
    description: 'Stops voice data from being sent to Microsoft cloud for dictation. Local speech still works.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKCU:\\Software\\Microsoft\\Speech_OneCore\\Settings\\OnlineSpeechPrivacy',
    valueName: 'HasAccepted', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },
  {
    id: 'disable-typing-insights',
    name: 'Disable Typing Insights',
    description: 'Stops Windows from collecting typing stats for "insights" predictions.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKCU:\\Software\\Microsoft\\Input\\Settings',
    valueName: 'IsInputAnalyticsEnabled', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },
  {
    id: 'disable-web-search',
    name: 'Disable Web Search in Start Menu',
    description: 'Stops Start menu searches from being sent to Bing. Local results only — much faster.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKCU:\\Software\\Policies\\Microsoft\\Windows\\Explorer',
    valueName: 'DisableSearchBoxSuggestions', valueType: 'REG_DWORD', valueData: '1',
    bundles: ['privacy', 'speed']
  },
  {
    id: 'disable-cortana',
    name: 'Disable Cortana',
    description: 'Disables Cortana via Group Policy. Search box remains usable for local searches.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search',
    valueName: 'AllowCortana', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },
  {
    id: 'disable-lock-screen-ads',
    name: 'Disable Lock Screen Ads',
    description: 'Stops rotating "tips", "tricks", and "fun facts" ads on the lock screen.',
    risk: 'low', category: 'privacy', icon: 'shield',
    regKey: 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager',
    valueName: 'RotatingLockScreenEnabled', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['privacy']
  },

  // === Speed ===
  {
    id: 'fast-menu-show',
    name: 'Instant Menu Show Delay',
    description: 'Sets context menu show delay from default 400ms to 0ms. Menus appear instantly on hover.',
    risk: 'low', category: 'speed', icon: 'zap',
    regKey: 'HKCU:\\Control Panel\\Desktop',
    valueName: 'MenuShowDelay', valueType: 'REG_SZ', valueData: '0',
    bundles: ['speed']
  },
  {
    id: 'disable-ntfs-last-access',
    name: 'Disable NTFS Last-Access Updates',
    description: 'Stops NTFS from updating last-access timestamps on every file read. Reduces disk writes on HDDs/SSDs.',
    risk: 'low', category: 'speed', icon: 'zap',
    regKey: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    valueName: 'NtfsDisableLastAccessUpdate', valueType: 'REG_DWORD', valueData: '1',
    bundles: ['speed']
  },
  {
    id: 'disable-power-throttling',
    name: 'Disable Power Throttling',
    description: 'Prevents Windows from throttling background apps. Useful for always-on apps like downloaders.',
    risk: 'medium', category: 'speed', icon: 'zap',
    regKey: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling',
    valueName: 'PowerThrottlingOff', valueType: 'REG_DWORD', valueData: '1',
    bundles: ['speed']
  },

  // === UI ===
  {
    id: 'classic-context-menu',
    name: 'Classic Context Menu (Win 11)',
    description: 'Restores the Windows 10-style full context menu instead of the truncated Win 11 menu.',
    risk: 'medium', category: 'ui', icon: 'list',
    regKey: 'HKCU:\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32',
    valueName: '(default)', valueType: 'REG_SZ', valueData: '',
    bundles: ['ui']
  },

  // === Gaming ===
  {
    id: 'enable-game-mode',
    name: 'Enable Game Mode',
    description: 'Optimizes Windows resources for gaming. Stops background updates and prioritizes the game process.',
    risk: 'low', category: 'gaming', icon: 'gamepad',
    regKey: 'HKCU:\\Software\\Microsoft\\GameBar',
    valueName: 'AllowAutoGameMode', valueType: 'REG_DWORD', valueData: '1',
    bundles: ['gaming', 'speed']
  },
  {
    id: 'disable-game-dvr',
    name: 'Disable Game DVR (Background Recording)',
    description: 'Disables always-on background recording that consumes CPU/GPU. Fixes some game stutter.',
    risk: 'low', category: 'gaming', icon: 'gamepad',
    regKey: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR',
    valueName: 'AllowGameDVR', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['gaming']
  },
  {
    id: 'disable-fullscreen-opt',
    name: 'Disable Fullscreen Optimizations',
    description: 'Forces exclusive fullscreen in older games instead of borderless. Fixes input lag in some games.',
    risk: 'medium', category: 'gaming', icon: 'gamepad',
    regKey: 'HKCU:\\System\\GameConfigStore',
    valueName: 'EnableFullscreenOptimizationAuto', valueType: 'REG_DWORD', valueData: '0',
    bundles: ['gaming']
  }
];

// --- Curated bundles ---
const CURATED_BUNDLES = [
  {
    id: 'speed',
    name: 'Speed Bundle',
    description: '8 tweaks that make Windows faster',
    icon: 'zap', color: 'cyan',
    tweaks: TWEAK_CATALOG.filter(t => t.bundles.includes('speed')).map(t => t.id)
  },
  {
    id: 'privacy',
    name: 'Privacy Bundle',
    description: '9 tweaks that stop Windows tracking',
    icon: 'shield', color: 'violet',
    tweaks: TWEAK_CATALOG.filter(t => t.bundles.includes('privacy')).map(t => t.id)
  },
  {
    id: 'gaming',
    name: 'Gaming Bundle',
    description: '6 tweaks that reduce game latency',
    icon: 'gamepad', color: 'rose',
    tweaks: TWEAK_CATALOG.filter(t => t.bundles.includes('gaming')).map(t => t.id)
  },
  {
    id: 'ui',
    name: 'Classic UI Bundle',
    description: '1 tweak for Windows 10-style menus',
    icon: 'list', color: 'amber',
    tweaks: TWEAK_CATALOG.filter(t => t.bundles.includes('ui')).map(t => t.id)
  }
];

// --- Storage paths ---
let root = null;
let backupsDir = null;
let appliedFile = null;
let customBundlesFile = null;

function initTweakerStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'tweaker');
  backupsDir = path.join(root, 'backups');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
  appliedFile = path.join(root, 'applied.jsonl');
  customBundlesFile = path.join(root, 'custom_bundles.json');
}

function ensureInit() { if (!root) initTweakerStore(); }

// --- Catalog accessors ---

function getCatalog() { return TWEAK_CATALOG; }
function getTweak(id) { return TWEAK_CATALOG.find(t => t.id === id) || null; }
function getCuratedBundles() { return CURATED_BUNDLES; }

// --- Custom bundles (user-imported) ---

function listCustomBundles() {
  ensureInit();
  if (!fs.existsSync(customBundlesFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(customBundlesFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

function saveCustomBundle(bundle) {
  ensureInit();
  if (!bundle || typeof bundle !== 'object') throw new Error('Invalid bundle');
  if (typeof bundle.id !== 'string' || !/^cb_[A-Za-z0-9_\-]+$/.test(bundle.id)) {
    throw new Error('Invalid bundle id (must match cb_<alphanum>)');
  }
  if (typeof bundle.name !== 'string' || bundle.name.length === 0 || bundle.name.length > 100) {
    throw new Error('Bundle name must be 1-100 chars');
  }
  if (!Array.isArray(bundle.tweaks)) throw new Error('Bundle tweaks must be array');
  // Validate all referenced tweak IDs exist in catalog
  const allIds = TWEAK_CATALOG.map(t => t.id);
  for (const tid of bundle.tweaks) {
    if (typeof tid !== 'string' || !allIds.includes(tid)) {
      throw new Error(`Bundle references unknown tweak: ${tid}`);
    }
  }
  const all = listCustomBundles();
  const idx = all.findIndex(b => b.id === bundle.id);
  if (idx >= 0) all[idx] = bundle; else all.push(bundle);
  fs.writeFileSync(customBundlesFile, JSON.stringify(all, null, 2), 'utf8');
  return bundle;
}

function deleteCustomBundle(id) {
  if (!/^cb_[A-Za-z0-9_\-]+$/.test(id)) throw new Error('Invalid bundle id');
  const all = listCustomBundles();
  const filtered = all.filter(b => b.id !== id);
  ensureInit();
  fs.writeFileSync(customBundlesFile, JSON.stringify(filtered, null, 2), 'utf8');
  return all.length !== filtered.length;
}

// --- Applied log (append-only JSONL) ---

function appendAppliedLog(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  fs.appendFileSync(appliedFile, JSON.stringify(entry) + '\n', 'utf8');
}

function listAppliedLog() {
  ensureInit();
  if (!fs.existsSync(appliedFile)) return [];
  const lines = fs.readFileSync(appliedFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) {}
  }
  return out.reverse();  // newest first
}

function clearAppliedLog() {
  ensureInit();
  if (fs.existsSync(appliedFile)) fs.writeFileSync(appliedFile, '', 'utf8');
}

module.exports = {
  initTweakerStore,
  getCatalog,
  getTweak,
  getCuratedBundles,
  listCustomBundles,
  saveCustomBundle,
  deleteCustomBundle,
  appendAppliedLog,
  listAppliedLog,
  clearAppliedLog
};
