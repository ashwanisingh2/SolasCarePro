// electron/snapshotStore.js
// Snapshot retention policy + auto-cleanup for Micro-Snapshots (Feature 7).
//
// Stores a local record of snapshot metadata (so we can show timeline even when
// System Restore is temporarily unavailable), plus retention rules.
//
// Retention policy:
//   - maxSnapshots: keep last N (default 10)
//   - maxAgeDays: delete older than N days (default 30)
//   - diskSpaceThresholdPct: when system drive usage > N%, auto-delete oldest (default 85)
//
// Auto-cleanup runs in main.js (poll every 10 min) and calls delete-snapshot PS action.

const fs = require('fs');
const path = require('path');

let root = null;
let settingsFile = null;
let historyFile = null;

function initSnapshotStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'snapshots');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  settingsFile = path.join(root, 'settings.json');
  historyFile = path.join(root, 'history.jsonl');
}

function ensureInit() { if (!root) initSnapshotStore(); }

// --- Retention settings ---

const DEFAULT_SETTINGS = {
  maxSnapshots: 10,
  maxAgeDays: 30,
  diskSpaceThresholdPct: 85,
  autoCleanupEnabled: true
};

function getSettings() {
  ensureInit();
  if (!fs.existsSync(settingsFile)) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    return { ...DEFAULT_SETTINGS, ...(data || {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  ensureInit();
  const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  // Validate
  if (typeof merged.maxSnapshots !== 'number' || merged.maxSnapshots < 1 || merged.maxSnapshots > 100) {
    throw new Error('maxSnapshots must be 1-100');
  }
  if (typeof merged.maxAgeDays !== 'number' || merged.maxAgeDays < 1 || merged.maxAgeDays > 365) {
    throw new Error('maxAgeDays must be 1-365');
  }
  if (typeof merged.diskSpaceThresholdPct !== 'number' ||
      merged.diskSpaceThresholdPct < 50 || merged.diskSpaceThresholdPct > 99) {
    throw new Error('diskSpaceThresholdPct must be 50-99');
  }
  if (typeof merged.autoCleanupEnabled !== 'boolean') {
    throw new Error('autoCleanupEnabled must be boolean');
  }
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// --- Local history (append-only JSONL) ---
// We mirror the PS-side metadata.jsonl here so the UI can show a timeline
// immediately on load (no PS call needed).

function appendHistory(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  if (typeof entry.seqNum !== 'number' && entry.seqNum !== null) {
    // OK — sometimes seqNum is unknown right after create
  }
  fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n', 'utf8');
}

function listHistory() {
  ensureInit();
  if (!fs.existsSync(historyFile)) return [];
  const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) {}
  }
  return out.reverse();  // newest first
}

function clearHistory() {
  ensureInit();
  fs.writeFileSync(historyFile, '', 'utf8');
}

// --- Retention evaluation ---
// Given a list of snapshots (from list-snapshots PS action) + current disk usage,
// return the list of snapshot seqNums that should be deleted per policy.

function evaluateRetentionPolicy(snapshots, diskUsage, settings) {
  const s = settings || getSettings();
  const toDelete = [];
  if (!Array.isArray(snapshots)) return toDelete;

  // Sort by createdIso ascending (oldest first)
  const sorted = [...snapshots].sort((a, b) => {
    const aT = new Date(a.createdIso || 0).getTime();
    const bT = new Date(b.createdIso || 0).getTime();
    return aT - bT;
  });

  const now = Date.now();

  // Rule 1: maxAgeDays
  for (const snap of sorted) {
    if (!s.maxAgeDays) continue;
    const age = (now - new Date(snap.createdIso || 0).getTime()) / (24 * 60 * 60 * 1000);
    if (age > s.maxAgeDays) {
      toDelete.push({ seqNum: snap.sequenceNumber, reason: 'older-than-maxAgeDays' });
    }
  }

  // Rule 2: maxSnapshots — delete oldest beyond limit
  if (s.maxSnapshots && sorted.length > s.maxSnapshots) {
    const excess = sorted.length - s.maxSnapshots;
    for (let i = 0; i < excess; i++) {
      const snap = sorted[i];
      if (!toDelete.find(t => t.seqNum === snap.sequenceNumber)) {
        toDelete.push({ seqNum: snap.sequenceNumber, reason: 'exceeds-maxSnapshots' });
      }
    }
  }

  // Rule 3: diskSpaceThresholdPct — delete oldest until below threshold
  if (s.diskSpaceThresholdPct && diskUsage && diskUsage.usedPercent >= s.diskSpaceThresholdPct) {
    // Delete all snapshots if disk is critical
    for (const snap of sorted) {
      if (toDelete.length >= sorted.length) break;
      if (!toDelete.find(t => t.seqNum === snap.sequenceNumber)) {
        toDelete.push({ seqNum: snap.sequenceNumber, reason: 'disk-space-critical' });
      }
    }
  }

  return toDelete;
}

module.exports = {
  initSnapshotStore,
  getSettings,
  saveSettings,
  appendHistory,
  listHistory,
  clearHistory,
  evaluateRetentionPolicy,
  DEFAULT_SETTINGS
};
