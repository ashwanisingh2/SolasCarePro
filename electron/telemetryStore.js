// electron/telemetryStore.js
// Opt-in anonymous analytics for success metrics tracking.
//
// Per Brain.md Success Metrics:
//   - Daily Active Users (DAU)
//   - D7 Retention
//   - Free → Pro Conversion
//   - Feature usage (which features are used most)
//   - Session count
//
// PRIVACY: 100% local. No data ever leaves the machine. User can view their own
// stats in Settings. "Telemetry" here means LOCAL usage tracking — the user
// owns their data. If they want to share stats with SolasCare team for product
// improvement, they can export manually (future v2 feature).

const fs = require('fs');
const path = require('path');

let root = null;
let settingsFile = null;
let eventsFile = null;
let featureUsageFile = null;

const DEFAULT_SETTINGS = {
  enabled: false,           // opt-in (default OFF per privacy promise)
  trackFeatureUsage: true,  // track which features are used
  trackAppLaunches: true,   // track DAU
  trackSessionDuration: false // track how long app is open
};

function initTelemetryStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'telemetry');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  settingsFile = path.join(root, 'settings.json');
  eventsFile = path.join(root, 'events.jsonl');
  featureUsageFile = path.join(root, 'feature_usage.json');
}

function ensureInit() { if (!root) initTelemetryStore(); }

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
  if (!s || typeof s !== 'object') throw new Error('Invalid settings');
  if (typeof s.enabled !== 'boolean') throw new Error('enabled must be boolean');
  const merged = { ...DEFAULT_SETTINGS, ...s };
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

// --- Event tracking ---

function trackEvent(eventName, eventData) {
  ensureInit();
  const settings = getSettings();
  if (!settings.enabled) return;  // no tracking if not opted in

  // Filter based on settings
  if (eventName === 'app-launch' && !settings.trackAppLaunches) return;
  if (eventName === 'feature-use' && !settings.trackFeatureUsage) return;

  const entry = {
    ts: new Date().toISOString(),
    event: eventName,
    data: eventData || null
  };
  fs.appendFileSync(eventsFile, JSON.stringify(entry) + '\n', 'utf8');

  // Auto-trim: keep last 10,000 events
  try {
    const stats = fs.statSync(eventsFile);
    if (stats.size > 2 * 1024 * 1024) {
      const lines = fs.readFileSync(eventsFile, 'utf8').split(/\r?\n/).filter(Boolean);
      const trimmed = lines.slice(-10000);
      fs.writeFileSync(eventsFile, trimmed.join('\n') + '\n', 'utf8');
    }
  } catch (_) {}

  // Track feature usage separately for quick aggregation
  if (eventName === 'feature-use' && eventData?.featureId) {
    trackFeatureUsage(eventData.featureId);
  }
}

function trackFeatureUsage(featureId) {
  ensureInit();
  let usage = {};
  if (fs.existsSync(featureUsageFile)) {
    try { usage = JSON.parse(fs.readFileSync(featureUsageFile, 'utf8')) || {}; } catch (_) {}
  }
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (!usage[month]) usage[month] = {};
  usage[month][featureId] = (usage[month][featureId] || 0) + 1;
  fs.writeFileSync(featureUsageFile, JSON.stringify(usage, null, 2), 'utf8');
}

function getFeatureUsage() {
  ensureInit();
  if (!fs.existsSync(featureUsageFile)) return {};
  try { return JSON.parse(fs.readFileSync(featureUsageFile, 'utf8')) || {}; }
  catch (_) { return {}; }
}

// --- Stats aggregation ---

function getStats(daysBack = 30) {
  ensureInit();
  if (!fs.existsSync(eventsFile)) {
    return { dau: [], totalEvents: 0, featureUsage: getFeatureUsage() };
  }

  const lines = fs.readFileSync(eventsFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);

  const events = [];
  const dauMap = {};  // date -> set of launch events

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      const ts = new Date(e.ts).getTime();
      if (ts >= cutoff) {
        events.push(e);
        if (e.event === 'app-launch') {
          const date = e.ts.slice(0, 10); // YYYY-MM-DD
          dauMap[date] = (dauMap[date] || 0) + 1;
        }
      }
    } catch (_) {}
  }

  // Build DAU array (last N days)
  const dau = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    dau.push({ date, count: dauMap[date] || 0 });
  }

  // Retention: D7 = users who launched 7+ days ago AND launched in last 7 days
  // (simplified: we track per-machine, so retention = did they launch this week?)
  const uniqueLaunchDays = Object.keys(dauMap).sort();
  const d7Retention = uniqueLaunchDays.length >= 2 ?
    (dau.filter(d => d.count > 0).length / daysBack * 100).toFixed(1) : 0;

  return {
    dau,
    totalEvents: events.length,
    uniqueLaunchDays: uniqueLaunchDays.length,
    d7Retention: parseFloat(d7Retention),
    featureUsage: getFeatureUsage()
  };
}

module.exports = {
  initTelemetryStore,
  getSettings,
  saveSettings,
  trackEvent,
  trackFeatureUsage,
  getFeatureUsage,
  getStats,
  DEFAULT_SETTINGS
};
