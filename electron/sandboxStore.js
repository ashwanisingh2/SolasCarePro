// electron/sandboxStore.js
// Activity log for Seamless Sandbox (Feature 12).
// Templates live in PowerShell script (built-in). JS just tracks launches.

const fs = require('fs');
const path = require('path');

let root = null;
let activityFile = null;

function initSandboxStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'sandbox');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  activityFile = path.join(root, 'activity.jsonl');
}

function ensureInit() { if (!root) initSandboxStore(); }

function appendActivity(entry) {
  ensureInit();
  if (!entry || typeof entry !== 'object') throw new Error('Invalid entry');
  fs.appendFileSync(activityFile, JSON.stringify(entry) + '\n', 'utf8');
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
  initSandboxStore,
  appendActivity,
  listActivity
};
