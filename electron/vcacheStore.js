// electron/vcacheStore.js
// Activity log + auto-restore config for Solas V-Cache (Feature 11).
//
// RAM disk is volatile — contents lost on reboot/crash. To make this practical,
// we persist "auto-recreate on SolasCare startup" config so the RAM disk +
// cache redirects come back automatically after every reboot.

const fs = require('fs');
const path = require('path');

let root = null;
let activityFile = null;
let autoConfigFile = null;

const DEFAULT_AUTO_CONFIG = {
  autoRecreateOnStartup: false,    // recreate RAM disk + redirects when SolasCare starts
  defaultDriveLetter: 'R',
  defaultSizeMB: 2048,
  lastDriveLetter: null,
  lastSizeMB: null,
  crashWarningAcknowledged: false  // user must acknowledge before enabling
};

function initVCacheStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'vcache');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  activityFile = path.join(root, 'activity.jsonl');
  autoConfigFile = path.join(root, 'auto_config.json');
}

function ensureInit() { if (!root) initVCacheStore(); }

function getAutoConfig() {
  ensureInit();
  if (!fs.existsSync(autoConfigFile)) return { ...DEFAULT_AUTO_CONFIG };
  try {
    return { ...DEFAULT_AUTO_CONFIG, ...(JSON.parse(fs.readFileSync(autoConfigFile, 'utf8')) || {}) };
  } catch (_) {
    return { ...DEFAULT_AUTO_CONFIG };
  }
}

function saveAutoConfig(cfg) {
  ensureInit();
  if (!cfg || typeof cfg !== 'object') throw new Error('Invalid config');
  // Merge with defaults FIRST so partial configs still validate cleanly
  const merged = { ...DEFAULT_AUTO_CONFIG, ...cfg };
  if (typeof merged.defaultDriveLetter !== 'string' || !/^[A-Z]$/.test(merged.defaultDriveLetter)) {
    throw new Error('defaultDriveLetter must be a single letter A-Z');
  }
  if (merged.defaultDriveLetter === 'A' || merged.defaultDriveLetter === 'B' || merged.defaultDriveLetter === 'C') {
    throw new Error('defaultDriveLetter cannot be A, B, or C');
  }
  if (typeof merged.defaultSizeMB !== 'number' || merged.defaultSizeMB < 100 || merged.defaultSizeMB > 32768) {
    throw new Error('defaultSizeMB must be 100-32768');
  }
  if (typeof merged.autoRecreateOnStartup !== 'boolean') throw new Error('autoRecreateOnStartup must be boolean');
  if (typeof merged.crashWarningAcknowledged !== 'boolean') throw new Error('crashWarningAcknowledged must be boolean');
  fs.writeFileSync(autoConfigFile, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function appendActivity(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  fs.appendFileSync(activityFile, JSON.stringify(entry) + '\n', 'utf8');
  // Auto-trim
  try {
    const stats = fs.statSync(activityFile);
    if (stats.size > 1024 * 1024) {
      const lines = fs.readFileSync(activityFile, 'utf8').split(/\r?\n/).filter(Boolean);
      const trimmed = lines.slice(-2000);
      fs.writeFileSync(activityFile, trimmed.join('\n') + '\n', 'utf8');
    }
  } catch (_) {}
}

function listActivity(daysBack = 30) {
  ensureInit();
  if (!fs.existsSync(activityFile)) return [];
  const lines = fs.readFileSync(activityFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (new Date(e.ts).getTime() >= cutoff) out.push(e);
    } catch (_) {}
  }
  return out.reverse();
}

module.exports = {
  initVCacheStore,
  getAutoConfig,
  saveAutoConfig,
  appendActivity,
  listActivity,
  DEFAULT_AUTO_CONFIG
};
