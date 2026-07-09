// electron/licenseStore.js
// Free/Pro licensing + feature gating + usage counters (Monetization).
//
// Per Brain.md:
//   FREE TIER:
//     - Surgical Uninstaller: 5 uninstalls/month
//     - Software Forge: browse + install (no Update All)
//     - God Mode Tweaker: 10 tweaks max
//     - Privacy Blackhole: HOSTS file only (no firewall/GPO)
//     - Dashboard: read-only health score
//   PRO TIER (₹499/year or $6/year):
//     - Unlimited everything
//     - Solas Vault, Micro-Snapshots, PC Clone
//     - Solas Sentinel, Predictive Maintenance
//     - Smart Workspace Triggers
//     - Priority support
//
// License key format: SOLAS-XXXX-XXXX-XXXX-XXXX (16 hex chars in 4 groups)
// Key validation: checksum + online activation (online part deferred to v2 —
// for MVP we use offline validation with a simple checksum algorithm).
//
// Trial: 14-day Pro trial starting from first app launch.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let root = null;
let licenseFile = null;
let usageFile = null;
let firstLaunchFile = null;

// --- Feature flags ---
const FREE_TIER_LIMITS = {
  surgicalUninstallsPerMonth: 5,
  tweakerMaxTweaks: 10,
  softwareForgeUpdateAll: false,
  privacyBlackholeFull: false,  // HOSTS only in free
  sentinelEnabled: false,
  vaultEnabled: false,
  snapshotsEnabled: false,
  pcCloneEnabled: false,
  predictiveMaintenanceEnabled: false,
  workspaceTriggersEnabled: false
};

const PRO_FEATURES = [
  'surgical-uninstaller-unlimited',
  'software-forge-update-all',
  'tweaker-unlimited',
  'privacy-blackhole-full',
  'sentinel-enabled',
  'vault-enabled',
  'snapshots-enabled',
  'pc-clone-enabled',
  'predictive-maintenance-enabled',
  'workspace-triggers-enabled'
];

const TRIAL_DAYS = 14;

function initLicenseStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  root = path.join(appData, 'SolasCare', 'license');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  licenseFile = path.join(root, 'license.json');
  usageFile = path.join(root, 'usage.json');
  firstLaunchFile = path.join(root, 'first_launch.json');
}

function ensureInit() { if (!root) initLicenseStore(); }

// --- License key validation ---
// Format: SOLAS-XXXX-XXXX-XXXX-XXXX
// Checksum: sum of all hex digits mod 16 must equal last digit
function validateLicenseKeyFormat(key) {
  if (typeof key !== 'string') return false;
  const normalized = key.trim().toUpperCase().replace(/-/g, '');
  if (!/^SOLAS[0-9A-F]{16}$/.test(normalized)) return false;
  // Extract the 16 hex chars after SOLAS
  const hex = normalized.slice(5);
  let sum = 0;
  for (let i = 0; i < hex.length - 1; i++) {
    sum += parseInt(hex[i], 16);
  }
  const checksum = sum % 16;
  const lastDigit = parseInt(hex[hex.length - 1], 16);
  return checksum === lastDigit;
}

// Generate a valid license key (for testing/demo — real keys would be generated server-side)
function generateDemoLicenseKey() {
  const hex = crypto.randomBytes(8).toString('hex').toUpperCase(); // 16 hex chars
  // Fix checksum: last digit = sum of first 15 mod 16
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += parseInt(hex[i], 16);
  const checksum = sum % 16;
  const fixedHex = hex.slice(0, 15) + checksum.toString(16).toUpperCase();
  return 'SOLAS-' + fixedHex.slice(0, 4) + '-' + fixedHex.slice(4, 8) + '-' + fixedHex.slice(8, 12) + '-' + fixedHex.slice(12, 16);
}

// --- License state ---

function getLicenseState() {
  ensureInit();
  const state = {
    tier: 'free',         // 'free' | 'trial' | 'pro'
    licenseKey: null,
    activatedAtIso: null,
    trialStartedIso: null,
    trialExpiresIso: null,
    firstLaunchIso: null
  };

  // First launch
  if (fs.existsSync(firstLaunchFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(firstLaunchFile, 'utf8'));
      state.firstLaunchIso = data.firstLaunchIso;
    } catch (_) {}
  }

  // License file
  if (fs.existsSync(licenseFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(licenseFile, 'utf8'));
      if (data.licenseKey && validateLicenseKeyFormat(data.licenseKey)) {
        state.tier = 'pro';
        state.licenseKey = data.licenseKey;
        state.activatedAtIso = data.activatedAtIso;
      }
    } catch (_) {}
  }

  // Trial logic: if not Pro and first launch exists, check trial window
  if (state.tier !== 'pro' && state.firstLaunchIso) {
    const firstLaunch = new Date(state.firstLaunchIso).getTime();
    const now = Date.now();
    const trialElapsedDays = (now - firstLaunch) / (24 * 60 * 60 * 1000);
    if (trialElapsedDays < TRIAL_DAYS) {
      state.tier = 'trial';
      state.trialStartedIso = state.firstLaunchIso;
      state.trialExpiresIso = new Date(firstLaunch + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return state;
}

function recordFirstLaunch() {
  ensureInit();
  if (!fs.existsSync(firstLaunchFile)) {
    const data = { firstLaunchIso: new Date().toISOString() };
    fs.writeFileSync(firstLaunchFile, JSON.stringify(data, null, 2), 'utf8');
  }
}

function activateLicense(key) {
  if (!validateLicenseKeyFormat(key)) {
    throw new Error('Invalid license key format. Expected: SOLAS-XXXX-XXXX-XXXX-XXXX');
  }
  ensureInit();
  const data = {
    licenseKey: key.trim().toUpperCase(),
    activatedAtIso: new Date().toISOString()
  };
  fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2), 'utf8');
  return getLicenseState();
}

function deactivateLicense() {
  ensureInit();
  if (fs.existsSync(licenseFile)) {
    fs.unlinkSync(licenseFile);
  }
  return getLicenseState();
}

// --- Feature access ---

function isPro() {
  const state = getLicenseState();
  return state.tier === 'pro' || state.tier === 'trial';
}

function isTrial() {
  return getLicenseState().tier === 'trial';
}

function isFree() {
  return getLicenseState().tier === 'free';
}

function getTrialDaysRemaining() {
  const state = getLicenseState();
  if (state.tier !== 'trial' || !state.trialExpiresIso) return 0;
  const remaining = (new Date(state.trialExpiresIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(remaining));
}

function checkFeatureAccess(featureId) {
  const state = getLicenseState();
  if (state.tier === 'pro' || state.tier === 'trial') {
    return { allowed: true, tier: state.tier };
  }
  // Free tier: check if feature is in the free limits
  switch (featureId) {
    case 'surgical-uninstaller':
      return { allowed: true, tier: 'free', limit: FREE_TIER_LIMITS.surgicalUninstallsPerMonth, remaining: getRemainingUsage('surgical-uninstall') };
    case 'tweaker':
      return { allowed: true, tier: 'free', limit: FREE_TIER_LIMITS.tweakerMaxTweaks, remaining: getRemainingUsage('tweaker-apply') };
    case 'software-forge-install':
      return { allowed: true, tier: 'free' };
    case 'software-forge-update-all':
      return { allowed: false, tier: 'free', reason: 'Update All is a Pro feature' };
    case 'privacy-blackhole-hosts':
      return { allowed: true, tier: 'free' };
    case 'privacy-blackhole-full':
      return { allowed: false, tier: 'free', reason: 'Firewall + GPO blocking is a Pro feature' };
    case 'sentinel':
      return { allowed: false, tier: 'free', reason: 'Solas Sentinel is a Pro feature' };
    case 'vault':
      return { allowed: false, tier: 'free', reason: 'Solas Vault is a Pro feature' };
    case 'snapshots':
      return { allowed: false, tier: 'free', reason: 'Micro-Snapshots is a Pro feature' };
    case 'pc-clone':
      return { allowed: false, tier: 'free', reason: 'PC Clone is a Pro feature' };
    case 'predictive-maintenance':
      return { allowed: false, tier: 'free', reason: 'Predictive Maintenance is a Pro feature' };
    case 'workspace-triggers':
      return { allowed: false, tier: 'free', reason: 'Workspace Triggers is a Pro feature' };
    default:
      return { allowed: true, tier: state.tier };
  }
}

// --- Usage counters (for free-tier monthly limits) ---

function getUsage() {
  ensureInit();
  if (!fs.existsSync(usageFile)) return { month: getCurrentMonth(), counters: {} };
  try {
    const data = JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    // Reset if month changed
    if (data.month !== getCurrentMonth()) {
      return { month: getCurrentMonth(), counters: {} };
    }
    return data;
  } catch (_) {
    return { month: getCurrentMonth(), counters: {} };
  }
}

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function incrementUsage(counterId) {
  ensureInit();
  const usage = getUsage();
  usage.counters[counterId] = (usage.counters[counterId] || 0) + 1;
  fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2), 'utf8');
  return usage.counters[counterId];
}

function getRemainingUsage(counterId) {
  const usage = getUsage();
  const used = usage.counters[counterId] || 0;
  const limit = counterId === 'surgical-uninstall' ? FREE_TIER_LIMITS.surgicalUninstallsPerMonth
              : counterId === 'tweaker-apply' ? FREE_TIER_LIMITS.tweakerMaxTweaks
              : 0;
  return Math.max(0, limit - used);
}

module.exports = {
  initLicenseStore,
  recordFirstLaunch,
  getLicenseState,
  activateLicense,
  deactivateLicense,
  isPro,
  isTrial,
  isFree,
  getTrialDaysRemaining,
  checkFeatureAccess,
  getUsage,
  incrementUsage,
  getRemainingUsage,
  validateLicenseKeyFormat,
  generateDemoLicenseKey,
  FREE_TIER_LIMITS,
  PRO_FEATURES,
  TRIAL_DAYS
};
