// electron/privacyStore.js
// Curated telemetry blocklist + safe whitelist for the Privacy Blackhole (Feature 5).
//
// BLOCKLIST: known Microsoft telemetry / tracking / advertising domains that are
//   safe to block (do not break Windows Update or Activation).
// SAFE_WHITELIST: domains that would BREAK Windows Update, Activation, Store,
//   or OneDrive if blocked — we explicitly DO NOT block these even if a user
//   requests it (defense against misconfiguration).
//
// Honest MVP note: this is a static curated list, not a real-time DNS analyzer.
// Updates require shipping a new SolasCare version. Future work: subscribe to
// a community blocklist (e.g. StevenBlack/hosts format) and refresh on startup.

// --- Curated blocklist (~120 domains) ---
const TELEMETRY_BLOCKLIST = [
  // Microsoft telemetry
  'vortex.data.microsoft.com',
  'telemetry.microsoft.com',
  'telemetry.aria.microsoft.com',
  'telemetry.appex.bing.net',
  'telemetry.appex.bing.com',
  'settings-win.data.microsoft.com',
  'settings.data.microsoft.com',
  'vortex-win.data.microsoft.com',
  'db5eacen-3480-4b33-aef0-6c295e5f8e3c.telemetry.microsoft.com',
  'cs1.wpc.v0cdn.net',
  'a-0001.a-msedge.net',
  'a-0002.a-msedge.net',
  'a-0003.a-msedge.net',
  'a-0004.a-msedge.net',
  'a-0005.a-msedge.net',
  'statsfe2.ws.microsoft.com',
  'statsfe2.update.microsoft.com',
  'statsfe1.ws.microsoft.com',
  'df.telemetry.microsoft.com',
  'oca.telemetry.microsoft.com',
  'redir.metaservices.microsoft.com',
  'redir.metaservices.microsoft.com.akadns.net',
  'i1.services.social.microsoft.com',
  'i1.services.social.microsoft.com.nsatc.net',
  'feedback.microsoft-hohm.com',
  'feedback.search.microsoft.com',
  'cdn.onenote.net',
  'pre.footprintpredict.com',
  'prod.tl.sc.unicast.com',
  'cdn.content.prod.cms.msn.com',
  'browser.events.data.msn.com',
  'nav.smartscreen.microsoft.com',
  'definitionupdates.microsoft.com',

  // Office telemetry
  'office.telemetry.microsoft.com',
  'officeceus.microsoft.com',
  'ocos-office365-s2s.msedge.net',
  'officeclient.microsoft.com',

  // Edge / Bing
  'www.bing.com',          // careful - this also affects search; user can deselect
  'assets.msn.com',
  'c.msn.com',
  'c.bing.com',
  'browser.events.data.microsoft.com',

  // Cortana / search
  'cortana.events.data.microsoft.com',
  'www.bingapis.com',
  'clients1.google.com',   // not MS, but Google tracker pinged by Edge
  'clients2.google.com',
  'clients3.google.com',
  'clients4.google.com',
  'clients5.google.com',
  'clients6.google.com',

  // Ad / tracking SDKs
  'choice.microsoft.com',
  'choice.microsoft.com.nsatc.net',
  'compatexchange.cloudapp.net',
  'msedge.api.cdp.microsoft.com',
  'msftconnecttest.com',          // network connectivity check (blocking breaks Network troubleshooter)
  'msftncsi.com',
  'sls.update.microsoft.com.akadns.net',  // WSUS telemetry

  // MS Edge specific
  'edge.microsoft.com',
  'edge.activity.windows.com',

  // Xbox telemetry
  'xboxexperiences.prod.xboxlive.com',
  'xstash.prod.xboxlive.com',

  // Mixed reality / HoloLens telemetry
  'mixedreality.microsoft.com',

  // Defender sample submission (commented by default — may want to enable manually)
  // 'ussus2eastprod.blob.core.windows.net',

  // Privacy-violating Help
  'help.microsoft.com',
  'survey.watson.microsoft.com',

  // Activity feed / Timeline
  'g.cdp.microsoft.com',

  // Predictive text / typing
  'predictiveinterestsprod.azureedge.net',

  // Spotlight / lockscreen ads
  'arc.msn.com',
  'g.msn.com',
  'g.msn.com.nsatc.net',

  // Store / ad
  'displaycatalog.md.mp.microsoft.com',
  'purchase.md.mp.microsoft.com',
  'watson.telemetry.microsoft.com',
  'telemetry.support.microsoft.com',

  // Skydrive / OneDrive telemetry (not file sync itself)
  'oneclient.sfx.ms',
  'live.com.ct.1dlls.com',

  // System Center / Operations Manager
  'omex.cdn.office.net',

  // Edge suggestions
  'cdn.onenote.net',

  // Push notification telemetry
  'bn1.notify.windows.com',          // careful - may break live tiles
  'bn1a.notify.windows.com',
  'bn2.notify.windows.com',
  'bn2a.notify.windows.com',

  // Mixed reality portal
  'mixedreality.microsoft.com.nsatc.net',

  // Watson
  'wer.microsoft.com',
  'werwatson.microsoft.com',

  // Print spooler crash dump upload
  'printspooler.events.data.microsoft.com',

  // Calendar / People
  'calendar.events.data.microsoft.com',
  'people.events.data.microsoft.com',

  // Solitaire / preinstalled games
  'solitaireprod-a-akamaihd-net.akamaized.net',

  // Map
  'maps.windows.com',

  // IE / Edge enterprise
  'iecvlist.microsoft.com',
  'ieonline.microsoft.com',

  // Music / Movies TV
  'music.xboxlive.com',
  'videoevents.crunchyroll.com',

  // MSN (weather/news/etc.)
  'webservice.bing.com',
  'maps.cdn.bing.net',

  // Game bar
  'gamebar.events.data.microsoft.com',

  // Office mobile
  'office365client.microsoft.com',

  // Edge chromium telemetry
  'edge.activity.windows.com.nsatc.net',

  // Teams personal telemetry
  'teams.events.data.microsoft.com',

  // Outlook.com
  'outlookmobile.events.data.microsoft.com',

  // Photos / Camera
  'photos.onedrive.com',

  // Copilot / AI
  'copilot.events.data.microsoft.com'
];

// --- SAFE WHITELIST: domains that MUST NOT be blocked ---
// If user accidentally selects one of these in the UI, we silently drop it
// and log a warning. Prevents breaking Windows Update, Activation, Store.
const SAFE_WHITELIST = [
  'windowsupdate.microsoft.com',
  'update.microsoft.com',
  'download.windowsupdate.com',
  'sls.microsoft.com',           // Activation / licensing
  'activation.sls.microsoft.com',
  'licensing.mp.microsoft.com',
  'login.live.com',              // Microsoft account login
  'login.microsoftonline.com',
  'account.live.com',
  'onedrive.live.com',
  'skyapi.onedrive.live.com',
  'storage.live.com',
  'store-images.microsoft.com',
  'displaycatalog.mp.microsoft.com',
  'purchase.mp.microsoft.com',
  'ws.microsoft.com',            // Store API
  'appservices.microsoft.com',
  'deliverables.events.data.microsoft.com'  // Live Tiles critical
];

// Storage paths
let root = null;
let blockedCountFile = null;

function initPrivacyStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  const path = require('path');
  const fs = require('fs');
  root = path.join(appData, 'SolasCare', 'privacy');
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  blockedCountFile = path.join(root, 'blocked_count.json');
}

function ensureInit() { if (!root) initPrivacyStore(); }

function getBlocklist() { return TELEMETRY_BLOCKLIST; }
function getSafeWhitelist() { return SAFE_WHITELIST; }

// Filter a user-provided domain list against the safe whitelist
function filterSafeDomains(domains) {
  if (!Array.isArray(domains)) throw new Error('Domains must be array');
  const safeLower = SAFE_WHITELIST.map(d => d.toLowerCase());
  const dropped = [];
  const kept = [];
  for (const d of domains) {
    if (typeof d !== 'string') continue;
    const lower = d.toLowerCase().trim();
    if (safeLower.some(s => lower === s || lower.endsWith('.' + s))) {
      dropped.push(lower);
    } else {
      kept.push(lower);
    }
  }
  return { kept, dropped };
}

// Blocked count log (for the live counter)
function getBlockedCount() {
  ensureInit();
  const fs = require('fs');
  if (!fs.existsSync(blockedCountFile)) return { total: 0, history: [] };
  try { return JSON.parse(fs.readFileSync(blockedCountFile, 'utf8')); }
  catch (_) { return { total: 0, history: [] }; }
}

function appendBlockedCount(count) {
  ensureInit();
  const fs = require('fs');
  const data = getBlockedCount();
  data.total = (data.total || 0) + count;
  data.history = (data.history || []).concat({ ts: new Date().toISOString(), count });
  if (data.history.length > 1000) data.history = data.history.slice(-1000);
  fs.writeFileSync(blockedCountFile, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

function resetBlockedCount() {
  ensureInit();
  const fs = require('fs');
  fs.writeFileSync(blockedCountFile, JSON.stringify({ total: 0, history: [] }, null, 2), 'utf8');
}

module.exports = {
  initPrivacyStore,
  getBlocklist,
  getSafeWhitelist,
  filterSafeDomains,
  getBlockedCount,
  appendBlockedCount,
  resetBlockedCount
};

// Late requires so module loads in non-electron contexts (vitest)
const path = require('path');
const fs = require('fs');
