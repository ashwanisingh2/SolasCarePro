// electron/sentinelStore.js
// Sentinel rules engine + event log + weekly digest (Feature 10).
//
// Rules: user-defined if-then logic. Stored as JSON, editable via UI.
// Rule shape:
//   {
//     id: 'rule_<alphanum>',
//     name: 'Auto-reset network on drop',
//     enabled: true,
//     condition: { metric: 'networkDrops', op: '>', threshold: 3, windowMinutes: 5 },
//     action: { type: 'reset-network-adapter', arg: 'Ethernet' },
//     cooldownMinutes: 10,  // don't re-fire within N minutes
//     lastFiredIso: null
//   }
//
// Supported condition metrics:
//   - 'ramPercent'      (op: >, threshold: 0-100)
//   - 'cpuPercent'      (op: >, threshold: 0-100)
//   - 'cpuTempCelsius'  (op: >, threshold: 0-110)
//   - 'diskPercent'     (op: >, threshold: 0-100)
//   - 'networkDrops'    (op: >, threshold: integer)
//   - 'stoppedServices' (op: >, threshold: integer)
//
// Supported action types:
//   - 'reset-network-adapter' (arg: adapter name)
//   - 'restart-service'       (arg: service name)
//   - 'kill-process'          (arg: process name)
//   - 'clear-print-spooler'   (no arg)
//   - 'flush-dns'             (no arg)
//   - 'notify-only'           (just show a toast notification)
//
// Event log: append-only JSONL of rule fires + heal outcomes.

const fs = require('fs');
const path = require('path');

let root = null;
let rulesFile = null;
let eventLogFile = null;
let digestFile = null;
let networkDropCounter = { count: 0, windowStartIso: null };

function initSentinelStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'sentinel');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  rulesFile = path.join(root, 'rules.json');
  eventLogFile = path.join(root, 'events.jsonl');
  digestFile = path.join(root, 'last_digest.json');
}

function ensureInit() { if (!root) initSentinelStore(); }

// --- Default rules (curated starter set) ---

const DEFAULT_RULES = [
  {
    id: 'rule_auto_reset_network',
    name: 'Auto-reset network on frequent drops',
    enabled: true,
    condition: { metric: 'networkDrops', op: '>', threshold: 3, windowMinutes: 5 },
    action: { type: 'reset-network-adapter', arg: 'Wi-Fi' },
    cooldownMinutes: 15,
    lastFiredIso: null
  },
  {
    id: 'rule_alert_high_ram',
    name: 'Alert on high RAM usage',
    enabled: true,
    condition: { metric: 'ramPercent', op: '>', threshold: 90, windowMinutes: 0 },
    action: { type: 'notify-only' },
    cooldownMinutes: 30,
    lastFiredIso: null
  },
  {
    id: 'rule_alert_high_cpu_temp',
    name: 'Alert on high CPU temperature',
    enabled: true,
    condition: { metric: 'cpuTempCelsius', op: '>', threshold: 90, windowMinutes: 0 },
    action: { type: 'notify-only' },
    cooldownMinutes: 30,
    lastFiredIso: null
  },
  {
    id: 'rule_flush_dns_on_drop',
    name: 'Flush DNS on network drop',
    enabled: false,
    condition: { metric: 'networkDrops', op: '>', threshold: 1, windowMinutes: 5 },
    action: { type: 'flush-dns' },
    cooldownMinutes: 10,
    lastFiredIso: null
  }
];

// --- Rules CRUD ---

function listRules() {
  ensureInit();
  if (!fs.existsSync(rulesFile)) return [...DEFAULT_RULES];
  try {
    const data = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
    return Array.isArray(data) ? data : [...DEFAULT_RULES];
  } catch (_) {
    return [...DEFAULT_RULES];
  }
}

function saveRules(rules) {
  ensureInit();
  if (!Array.isArray(rules)) throw new Error('Rules must be array');
  for (const r of rules) {
    validateRule(r);
  }
  fs.writeFileSync(rulesFile, JSON.stringify(rules, null, 2), 'utf8');
  return rules;
}

function saveRule(rule) {
  ensureInit();
  validateRule(rule);
  const all = listRules();
  const idx = all.findIndex(r => r.id === rule.id);
  if (idx >= 0) all[idx] = rule; else all.push(rule);
  fs.writeFileSync(rulesFile, JSON.stringify(all, null, 2), 'utf8');
  return rule;
}

function deleteRule(id) {
  if (!/^rule_[A-Za-z0-9_\-]+$/.test(id)) throw new Error('Invalid rule id');
  ensureInit();
  const all = listRules();
  const filtered = all.filter(r => r.id !== id);
  fs.writeFileSync(rulesFile, JSON.stringify(filtered, null, 2), 'utf8');
  return all.length !== filtered.length;
}

function updateLastFired(id, iso) {
  ensureInit();
  const all = listRules();
  const r = all.find(r => r.id === id);
  if (r) {
    r.lastFiredIso = iso;
    fs.writeFileSync(rulesFile, JSON.stringify(all, null, 2), 'utf8');
  }
}

const VALID_METRICS = ['ramPercent', 'cpuPercent', 'cpuTempCelsius', 'diskPercent', 'networkDrops', 'stoppedServices'];
const VALID_OPS = ['>', '<', '>=', '<=', '=='];
const VALID_ACTIONS = ['reset-network-adapter', 'restart-service', 'kill-process', 'clear-print-spooler', 'flush-dns', 'notify-only'];

function validateRule(r) {
  if (!r || typeof r !== 'object') throw new Error('Invalid rule');
  if (typeof r.id !== 'string' || !/^rule_[A-Za-z0-9_\-]+$/.test(r.id)) {
    throw new Error('Invalid rule id (must match rule_<alphanum>)');
  }
  if (typeof r.name !== 'string' || r.name.length === 0 || r.name.length > 100) {
    throw new Error('Rule name must be 1-100 chars');
  }
  if (typeof r.enabled !== 'boolean') throw new Error('enabled must be boolean');
  if (!r.condition || typeof r.condition !== 'object') throw new Error('Invalid condition');
  if (!VALID_METRICS.includes(r.condition.metric)) {
    throw new Error(`Invalid metric: ${r.condition.metric}`);
  }
  if (!VALID_OPS.includes(r.condition.op)) {
    throw new Error(`Invalid operator: ${r.condition.op}`);
  }
  if (typeof r.condition.threshold !== 'number') throw new Error('threshold must be number');
  if (typeof r.condition.windowMinutes !== 'number' || r.condition.windowMinutes < 0 || r.condition.windowMinutes > 1440) {
    throw new Error('windowMinutes must be 0-1440');
  }
  if (!r.action || typeof r.action !== 'object') throw new Error('Invalid action');
  if (!VALID_ACTIONS.includes(r.action.type)) {
    throw new Error(`Invalid action type: ${r.action.type}`);
  }
  // 'arg' required for actions that need it
  if (['reset-network-adapter', 'restart-service', 'kill-process'].includes(r.action.type)) {
    if (typeof r.action.arg !== 'string' || r.action.arg.length === 0 || r.action.arg.length > 200) {
      throw new Error(`Action ${r.action.type} requires arg (1-200 chars)`);
    }
    if (r.action.arg.match(/[<>|"`$;]/)) {
      throw new Error('Action arg contains blocked characters');
    }
  }
  if (typeof r.cooldownMinutes !== 'number' || r.cooldownMinutes < 0 || r.cooldownMinutes > 1440) {
    throw new Error('cooldownMinutes must be 0-1440');
  }
}

// --- Event log ---

function appendEvent(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid event');
  fs.appendFileSync(eventLogFile, JSON.stringify(entry) + '\n', 'utf8');
  // Auto-trim to 5000 lines
  try {
    const stats = fs.statSync(eventLogFile);
    if (stats.size > 2 * 1024 * 1024) {
      const lines = fs.readFileSync(eventLogFile, 'utf8').split(/\r?\n/).filter(Boolean);
      const trimmed = lines.slice(-5000);
      fs.writeFileSync(eventLogFile, trimmed.join('\n') + '\n', 'utf8');
    }
  } catch (_) {}
}

function listEvents(daysBack = 7) {
  ensureInit();
  if (!fs.existsSync(eventLogFile)) return [];
  const lines = fs.readFileSync(eventLogFile, 'utf8').split(/\r?\n/).filter(Boolean);
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

// --- Weekly digest ---

function generateDigest(events) {
  const digest = {
    generatedAtIso: new Date().toISOString(),
    periodStartIso: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    totalEvents: events.length,
    byType: {},
    byRule: {},
    successfulHeals: 0,
    failedHeals: 0,
    topIssue: null
  };
  for (const e of events) {
    digest.byType[e.eventType] = (digest.byType[e.eventType] || 0) + 1;
    if (e.ruleId) {
      digest.byRule[e.ruleId] = (digest.byRule[e.ruleId] || 0) + 1;
    }
    if (e.eventType === 'heal-success') digest.successfulHeals++;
    if (e.eventType === 'heal-failure') digest.failedHeals++;
  }
  // Top issue = most-fired rule
  const sortedRules = Object.entries(digest.byRule).sort((a, b) => b[1] - a[1]);
  if (sortedRules.length > 0) {
    digest.topIssue = { ruleId: sortedRules[0][0], count: sortedRules[0][1] };
  }
  ensureInit();
  fs.writeFileSync(digestFile, JSON.stringify(digest, null, 2), 'utf8');
  return digest;
}

function getLastDigest() {
  ensureInit();
  if (!fs.existsSync(digestFile)) return null;
  try { return JSON.parse(fs.readFileSync(digestFile, 'utf8')); }
  catch (_) { return null; }
}

// --- Network drop tracking (helper for the watcher) ---

function recordNetworkDrop() {
  ensureInit();
  const now = Date.now();
  if (!networkDropCounter.windowStartIso ||
      (now - new Date(networkDropCounter.windowStartIso).getTime()) > 5 * 60 * 1000) {
    // Reset window
    networkDropCounter = { count: 1, windowStartIso: new Date(now).toISOString() };
  } else {
    networkDropCounter.count++;
  }
  return networkDropCounter.count;
}

function getNetworkDropCount() {
  ensureInit();
  if (!networkDropCounter.windowStartIso) return 0;
  const ageMin = (Date.now() - new Date(networkDropCounter.windowStartIso).getTime()) / 60000;
  if (ageMin > 5) return 0;  // window expired
  return networkDropCounter.count;
}

// --- Rule evaluation ---

function evaluateRules(statusSnapshot) {
  ensureInit();
  if (!statusSnapshot) return [];
  const rules = listRules();
  const toFire = [];
  const now = Date.now();
  const dropCount = getNetworkDropCount();

  for (const r of rules) {
    if (!r.enabled) continue;
    // Cooldown check
    if (r.lastFiredIso) {
      const elapsedMin = (now - new Date(r.lastFiredIso).getTime()) / 60000;
      if (elapsedMin < r.cooldownMinutes) continue;
    }

    let conditionMet = false;
    const c = r.condition;
    let actualValue = null;

    switch (c.metric) {
      case 'ramPercent':
        actualValue = statusSnapshot.ram?.usedPercent;
        break;
      case 'cpuPercent':
        actualValue = statusSnapshot.cpu?.loadPercent;
        break;
      case 'cpuTempCelsius':
        actualValue = statusSnapshot.cpu?.tempCelsius;
        break;
      case 'diskPercent':
        actualValue = statusSnapshot.disk?.usedPercent;
        break;
      case 'networkDrops':
        actualValue = dropCount;
        break;
      case 'stoppedServices':
        actualValue = statusSnapshot.services?.length || 0;
        break;
    }

    if (actualValue == null) continue;

    switch (c.op) {
      case '>':  conditionMet = actualValue > c.threshold; break;
      case '<':  conditionMet = actualValue < c.threshold; break;
      case '>=': conditionMet = actualValue >= c.threshold; break;
      case '<=': conditionMet = actualValue <= c.threshold; break;
      case '==': conditionMet = actualValue === c.threshold; break;
    }

    if (conditionMet) {
      toFire.push({ rule: r, actualValue, threshold: c.threshold, metric: c.metric });
    }
  }
  return toFire;
}

module.exports = {
  initSentinelStore,
  listRules,
  saveRules,
  saveRule,
  deleteRule,
  updateLastFired,
  validateRule,
  appendEvent,
  listEvents,
  generateDigest,
  getLastDigest,
  recordNetworkDrop,
  getNetworkDropCount,
  evaluateRules,
  DEFAULT_RULES,
  VALID_METRICS,
  VALID_ACTIONS
};
