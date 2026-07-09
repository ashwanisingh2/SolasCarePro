// electron/workspaceStore.js
// Storage + trigger polling for the Smart Workspace Automation feature (Feature 2).
//
// Layout (under %APPDATA%\SolasCare\workspace\):
//   profiles.json   - all profile definitions (array)
//   triggers.json   - trigger config (per-profile: time / app / network triggers)
//   applied.json    - currently-applied profile + before-state (managed by PS script)
//
// The trigger polling loop runs in main.js (NOT here) so it can call IPC + PS.
// This module only handles persistence.

const fs = require('fs');
const path = require('path');

let root = null;
let profilesFile = null;
let triggersFile = null;
let appliedFile = null;

function initWorkspaceStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'workspace');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  profilesFile = path.join(root, 'profiles.json');
  triggersFile = path.join(root, 'triggers.json');
  appliedFile = path.join(root, 'applied.json');
}

function ensureInit() {
  if (!root) initWorkspaceStore();
}

// --- Profiles ---

function listProfiles() {
  ensureInit();
  if (!fs.existsSync(profilesFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function saveProfiles(profiles) {
  ensureInit();
  fs.writeFileSync(profilesFile, JSON.stringify(profiles, null, 2), 'utf8');
}

function saveProfile(profile) {
  if (!profile || typeof profile !== 'object' || !profile.id) {
    throw new Error('Invalid profile (missing id)');
  }
  if (!/^ws_[A-Za-z0-9_]+$/.test(profile.id)) {
    throw new Error('Invalid profile id format');
  }
  const profiles = listProfiles();
  const idx = profiles.findIndex(p => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.push(profile);
  }
  saveProfiles(profiles);
  return profile;
}

function deleteProfile(profileId) {
  if (!/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
    throw new Error('Invalid profile id format');
  }
  const profiles = listProfiles();
  const filtered = profiles.filter(p => p.id !== profileId);
  saveProfiles(filtered);
  // Also remove its trigger config
  const triggers = listTriggers();
  if (triggers[profileId]) {
    delete triggers[profileId];
    saveTriggers(triggers);
  }
  return profiles.length !== filtered.length;
}

function getProfile(profileId) {
  if (!/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
    throw new Error('Invalid profile id format');
  }
  return listProfiles().find(p => p.id === profileId) || null;
}

// --- Triggers ---
// Shape: { profileId: { time: [{ from: '09:00', to: '18:00', days: ['Mon','Tue'] }], app: ['code','chrome'], network: ['HomeWiFi'] } }

function listTriggers() {
  ensureInit();
  if (!fs.existsSync(triggersFile)) return {};
  try {
    return JSON.parse(fs.readFileSync(triggersFile, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function saveTriggers(triggers) {
  ensureInit();
  fs.writeFileSync(triggersFile, JSON.stringify(triggers, null, 2), 'utf8');
}

function setTriggers(profileId, triggerConfig) {
  if (!/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
    throw new Error('Invalid profile id format');
  }
  if (!triggerConfig || typeof triggerConfig !== 'object') {
    throw new Error('Invalid trigger config');
  }
  const triggers = listTriggers();
  // Validate trigger shape
  const cleaned = {};
  if (Array.isArray(triggerConfig.time)) {
    cleaned.time = triggerConfig.time.map(t => ({
      from: String(t.from || '').slice(0, 5),
      to: String(t.to || '').slice(0, 5),
      days: Array.isArray(t.days) ? t.days.slice(0, 7) : []
    }));
  }
  if (Array.isArray(triggerConfig.app)) {
    cleaned.app = triggerConfig.app.map(a => String(a).slice(0, 100)).filter(Boolean);
  }
  if (Array.isArray(triggerConfig.network)) {
    cleaned.network = triggerConfig.network.map(n => String(n).slice(0, 100)).filter(Boolean);
  }
  triggers[profileId] = cleaned;
  saveTriggers(triggers);
  return cleaned;
}

function getTriggers(profileId) {
  if (!/^ws_[A-Za-z0-9_]+$/.test(profileId)) {
    throw new Error('Invalid profile id format');
  }
  return listTriggers()[profileId] || { time: [], app: [], network: [] };
}

// --- Applied state ---
// Read-only from JS side (PS script writes it). Useful for UI status badge.

function getApplied() {
  ensureInit();
  if (!fs.existsSync(appliedFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(appliedFile, 'utf8'));
  } catch (_) {
    return null;
  }
}

function clearApplied() {
  ensureInit();
  if (fs.existsSync(appliedFile)) {
    try { fs.unlinkSync(appliedFile); } catch (_) {}
  }
}

module.exports = {
  initWorkspaceStore,
  listProfiles,
  saveProfile,
  deleteProfile,
  getProfile,
  listTriggers,
  setTriggers,
  getTriggers,
  getApplied,
  clearApplied
};
