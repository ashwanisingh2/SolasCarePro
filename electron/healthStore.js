// electron/healthStore.js
// Health score history + threshold config for Predictive Maintenance (Feature 9).
//
// History: append-only JSONL of { ts, score, status, details } records.
//   - Polled every 5 minutes by main.js watcher
//   - UI reads last 30/90 days for trend graph
//   - Auto-trim: keep last 10,000 entries (~35 days at 5-min intervals)
//
// Thresholds: user-configurable alert thresholds per metric.
//   - smartPredictFailure: always alert
//   - cpuTemp: alert above N °C (default 80)
//   - diskFree: alert below N % (default 10)
//   - batteryHealth: alert below N % (default 50)
//   - ramErrors: always alert

const fs = require('fs');
const path = require('path');

let root = null;
let historyFile = null;
let settingsFile = null;
let alertsFile = null;

const DEFAULT_SETTINGS = {
  cpuTempThreshold: 80,        // alert above
  diskFreeThreshold: 10,       // alert below
  batteryHealthThreshold: 50,  // alert below
  smartPredictAlert: true,     // always alert on SMART predict failure
  ramErrorAlert: true,         // always alert on RAM errors
  autoBackupOnCritical: true,  // auto-trigger backup when SSD health drops
  pollingIntervalMinutes: 5    // main.js watcher interval
};

function initHealthStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'health');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  historyFile = path.join(root, 'history.jsonl');
  settingsFile = path.join(root, 'settings.json');
  alertsFile = path.join(root, 'alerts.jsonl');
}

function ensureInit() { if (!root) initHealthStore(); }

// --- Settings ---

function getSettings() {
  ensureInit();
  if (!fs.existsSync(settingsFile)) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || {}) };
  } catch (_) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s) {
  ensureInit();
  const merged = { ...DEFAULT_SETTINGS, ...(s || {}) };
  if (typeof merged.cpuTempThreshold !== 'number' || merged.cpuTempThreshold < 40 || merged.cpuTempThreshold > 110) {
    throw new Error('cpuTempThreshold must be 40-110');
  }
  if (typeof merged.diskFreeThreshold !== 'number' || merged.diskFreeThreshold < 1 || merged.diskFreeThreshold > 50) {
    throw new Error('diskFreeThreshold must be 1-50');
  }
  if (typeof merged.batteryHealthThreshold !== 'number' || merged.batteryHealthThreshold < 10 || merged.batteryHealthThreshold > 100) {
    throw new Error('batteryHealthThreshold must be 10-100');
  }
  if (typeof merged.pollingIntervalMinutes !== 'number' || merged.pollingIntervalMinutes < 1 || merged.pollingIntervalMinutes > 60) {
    throw new Error('pollingIntervalMinutes must be 1-60');
  }
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// --- History ---

function appendHistory(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  if (typeof entry.score !== 'number') throw new Error('Entry must have score (number)');
  fs.appendFileSync(historyFile, JSON.stringify(entry) + '\n', 'utf8');
  // Auto-trim: keep last 10,000 lines
  trimHistory();
}

function trimHistory() {
  try {
    const stats = fs.statSync(historyFile);
    if (stats.size > 5 * 1024 * 1024) {  // 5 MB
      const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean);
      const trimmed = lines.slice(-10000);
      fs.writeFileSync(historyFile, trimmed.join('\n') + '\n', 'utf8');
    }
  } catch (_) {}
}

function listHistory(daysBack = 30) {
  ensureInit();
  if (!fs.existsSync(historyFile)) return [];
  const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (new Date(e.ts).getTime() >= cutoff) out.push(e);
    } catch (_) {}
  }
  return out;
}

// --- Alerts ---

function appendAlert(alert) {
  ensureInit();
  if (!alert || typeof alert !== 'object') throw new Error('Invalid alert');
  fs.appendFileSync(alertsFile, JSON.stringify(alert) + '\n', 'utf8');
}

function listAlerts(daysBack = 30) {
  ensureInit();
  if (!fs.existsSync(alertsFile)) return [];
  const lines = fs.readFileSync(alertsFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (new Date(e.ts).getTime() >= cutoff) out.push(e);
    } catch (_) {}
  }
  return out.reverse();  // newest first
}

function clearAlerts() {
  ensureInit();
  fs.writeFileSync(alertsFile, '', 'utf8');
}

// --- Threshold evaluation ---
// Given a health snapshot, return list of triggered alerts.

function evaluateThresholds(snapshot, settings) {
  const s = settings || getSettings();
  const alerts = [];
  if (!snapshot) return alerts;

  // SMART predict failure
  if (s.smartPredictAlert && snapshot.details?.smart?.available && snapshot.details.smart.predicting > 0) {
    alerts.push({
      ts: new Date().toISOString(),
      severity: 'critical',
      metric: 'smart',
      message: `${snapshot.details.smart.predicting} disk(s) predicting failure. Back up immediately!`,
      value: snapshot.details.smart.predicting
    });
  }

  // CPU temp — fires when above threshold (cpuTempThreshold always defined in defaults)
  if (snapshot.details?.cpuTemp?.available && snapshot.details.cpuTemp.celsius > s.cpuTempThreshold) {
    alerts.push({
      ts: new Date().toISOString(),
      severity: snapshot.details.cpuTemp.celsius > 90 ? 'critical' : 'warning',
      metric: 'cpuTemp',
      message: `CPU temperature high: ${snapshot.details.cpuTemp.celsius}°C (threshold: ${s.cpuTempThreshold}°C)`,
      value: snapshot.details.cpuTemp.celsius
    });
  }

  // Disk free — fires when below threshold
  if (snapshot.details?.diskFree?.available && snapshot.details.diskFree.freePercent < s.diskFreeThreshold) {
    alerts.push({
      ts: new Date().toISOString(),
      severity: snapshot.details.diskFree.freePercent < 5 ? 'critical' : 'warning',
      metric: 'diskFree',
      message: `System drive free space low: ${snapshot.details.diskFree.freePercent}% (threshold: ${s.diskFreeThreshold}%)`,
      value: snapshot.details.diskFree.freePercent
    });
  }

  // Battery health
  if (snapshot.details?.battery?.available && snapshot.details.battery.healthPercent < s.batteryHealthThreshold) {
    alerts.push({
      ts: new Date().toISOString(),
      severity: 'warning',
      metric: 'battery',
      message: `Battery health low: ${snapshot.details.battery.healthPercent}%`,
      value: snapshot.details.battery.healthPercent
    });
  }

  // RAM errors
  if (s.ramErrorAlert && snapshot.details?.ram?.available && snapshot.details.ram.errors > 0) {
    alerts.push({
      ts: new Date().toISOString(),
      severity: 'critical',
      metric: 'ram',
      message: `RAM errors detected: ${snapshot.details.ram.errors}. Run Windows Memory Diagnostic.`,
      value: snapshot.details.ram.errors
    });
  }

  return alerts;
}

module.exports = {
  initHealthStore,
  getSettings,
  saveSettings,
  appendHistory,
  listHistory,
  appendAlert,
  listAlerts,
  clearAlerts,
  evaluateThresholds,
  DEFAULT_SETTINGS
};
