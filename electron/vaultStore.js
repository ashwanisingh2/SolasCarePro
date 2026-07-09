// electron/vaultStore.js
// Vault registry + auto-unmount watcher for Solas Vault (Feature 6).
//
// Vault registry: which vaults are mounted, when they were mounted, and the
//   auto-unmount timeout. The actual VHD files live on disk; this store just
//   tracks metadata for the UI + auto-unmount loop.
//
// Activity log: append-only JSONL of all vault operations.

const fs = require('fs');
const path = require('path');

let root = null;
let registryFile = null;
let activityFile = null;

function initVaultStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'vault');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  registryFile = path.join(root, 'registry.json');
  activityFile = path.join(root, 'activity.jsonl');
}

function ensureInit() { if (!root) initVaultStore(); }

// --- Vault registry ---
// Shape: { vaultId: { vaultPath, driveLetter, mountedIso, autoUnmountMinutes, lastActivityIso } }

function getRegistry() {
  ensureInit();
  if (!fs.existsSync(registryFile)) return {};
  try { return JSON.parse(fs.readFileSync(registryFile, 'utf8')) || {}; }
  catch (_) { return {}; }
}

function saveRegistry(reg) {
  ensureInit();
  fs.writeFileSync(registryFile, JSON.stringify(reg, null, 2), 'utf8');
}

function markMounted(vaultId, vaultPath, driveLetter, autoUnmountMinutes = 0) {
  if (!/^vault_[A-Za-z0-9_\-]+$/.test(vaultId)) throw new Error('Invalid vault id');
  const reg = getRegistry();
  reg[vaultId] = {
    vaultPath,
    driveLetter,
    mountedIso: new Date().toISOString(),
    autoUnmountMinutes: autoUnmountMinutes || 0,
    lastActivityIso: new Date().toISOString()
  };
  saveRegistry(reg);
  return reg[vaultId];
}

function markUnmounted(vaultId) {
  if (!/^vault_[A-Za-z0-9_\-]+$/.test(vaultId)) throw new Error('Invalid vault id');
  const reg = getRegistry();
  delete reg[vaultId];
  saveRegistry(reg);
}

function touchActivity(vaultId) {
  // Reset the auto-unmount timer (user interacted with the vault)
  if (!/^vault_[A-Za-z0-9_\-]+$/.test(vaultId)) return;
  const reg = getRegistry();
  if (reg[vaultId]) {
    reg[vaultId].lastActivityIso = new Date().toISOString();
    saveRegistry(reg);
  }
}

function getMountedVaults() {
  return getRegistry();
}

function isMounted(vaultId) {
  return !!getRegistry()[vaultId];
}

// --- Activity log ---

function appendActivity(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  fs.appendFileSync(activityFile, JSON.stringify(entry) + '\n', 'utf8');
}

function listActivity() {
  ensureInit();
  if (!fs.existsSync(activityFile)) return [];
  const lines = fs.readFileSync(activityFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) {}
  }
  return out.reverse();  // newest first
}

module.exports = {
  initVaultStore,
  markMounted,
  markUnmounted,
  touchActivity,
  getMountedVaults,
  isMounted,
  appendActivity,
  listActivity
};
