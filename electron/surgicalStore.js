// electron/surgicalStore.js
// Storage layer for the Surgical Uninstaller feature (Feature 1).
//
// Stores data on disk under %APPDATA%\SolasCare\surgical\ to match the
// existing codebase convention (settings.json, audit.jsonl). Avoids SQLite
// native module so we don't need electron-rebuild and can keep build simple.
//
// Layout:
//   %APPDATA%\SolasCare\surgical\
//     snapshots\<id>.json    - one file per baseline snapshot
//     footprints\<appKey>.json - cached footprint per app (refreshed on demand)
//     diffs.jsonl             - append-only log of computed diffs (one per line)
//     orphans.json            - last orphan scan result (overwritten each scan)
//
// All methods are synchronous (file I/O is tiny). Called from main.js IPC
// handlers; never blocks the renderer.

const fs = require('fs');
const path = require('path');

let surgicalRoot = null;
let snapshotsDir = null;
let footprintsDir = null;
let diffsFile = null;
let orphansFile = null;

function initSurgicalStore() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  surgicalRoot = path.join(appData, 'SolasCare', 'surgical');
  snapshotsDir = path.join(surgicalRoot, 'snapshots');
  footprintsDir = path.join(surgicalRoot, 'footprints');
  diffsFile = path.join(surgicalRoot, 'diffs.jsonl');
  orphansFile = path.join(surgicalRoot, 'orphans.json');
  for (const dir of [surgicalRoot, snapshotsDir, footprintsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function ensureInit() {
  if (!surgicalRoot) initSurgicalStore();
}

// --- Snapshot files ---

function listSnapshots() {
  ensureInit();
  try {
    const files = fs.readdirSync(snapshotsDir).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const id = f.replace(/\.json$/, '');
      try {
        const stat = fs.statSync(path.join(snapshotsDir, f));
        // Read just the metadata we need (id, createdIso, counts) without
        // loading the whole (potentially multi-MB) snapshot file.
        // The header is at the top of the file, so we read first 4KB.
        const fd = fs.openSync(path.join(snapshotsDir, f), 'r');
        const buf = Buffer.alloc(4096);
        const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
        fs.closeSync(fd);
        const head = buf.toString('utf8', 0, bytesRead);
        const idMatch = head.match(/"id"\s*:\s*"([^"]+)"/);
        const isoMatch = head.match(/"createdIso"\s*:\s*"([^"]+)"/);
        const depthMatch = head.match(/"depth"\s*:\s*(\d+)/);
        return {
          id: idMatch ? idMatch[1] : id,
          createdIso: isoMatch ? isoMatch[1] : stat.mtime.toISOString(),
          depth: depthMatch ? parseInt(depthMatch[1], 10) : 2,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString()
        };
      } catch (_) {
        return null;
      }
    }).filter(Boolean).sort((a, b) => (b.createdIso || '').localeCompare(a.createdIso || ''));
  } catch (_) {
    return [];
  }
}

function getSnapshot(id) {
  ensureInit();
  if (!/^snap_[A-Za-z0-9_]+$/.test(id)) {
    throw new Error('Invalid snapshot id');
  }
  const p = path.join(snapshotsDir, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function deleteSnapshot(id) {
  ensureInit();
  if (!/^snap_[A-Za-z0-9_]+$/.test(id)) {
    throw new Error('Invalid snapshot id');
  }
  const p = path.join(snapshotsDir, `${id}.json`);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

// --- Diffs JSONL ---

function appendDiff(diffRecord) {
  ensureInit();
  // Each line is a JSON object: { snapshotId, computedIso, appKey, displayName, summary, diff }
  const line = JSON.stringify(diffRecord) + '\n';
  fs.appendFileSync(diffsFile, line, 'utf8');
}

function getAllDiffs() {
  ensureInit();
  if (!fs.existsSync(diffsFile)) return [];
  const lines = fs.readFileSync(diffsFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch (_) { /* skip malformed */ }
  }
  return out;
}

function getDiffsForSnapshot(snapshotId) {
  return getAllDiffs().filter(d => d.snapshotId === snapshotId);
}

function clearDiffsForSnapshot(snapshotId) {
  const remaining = getAllDiffs().filter(d => d.snapshotId !== snapshotId);
  ensureInit();
  fs.writeFileSync(diffsFile, remaining.map(d => JSON.stringify(d)).join('\n') + (remaining.length ? '\n' : ''), 'utf8');
}

// --- Footprints ---

function saveFootprint(appKey, footprint) {
  ensureInit();
  if (!/^[A-Za-z0-9_\{\}\-\.]+$/.test(appKey)) {
    throw new Error('Invalid appKey');
  }
  const p = path.join(footprintsDir, `${appKey}.json`);
  fs.writeFileSync(p, JSON.stringify({ cachedAt: new Date().toISOString(), footprint }, null, 2), 'utf8');
}

function getFootprint(appKey) {
  ensureInit();
  if (!/^[A-Za-z0-9_\{\}\-\.]+$/.test(appKey)) {
    throw new Error('Invalid appKey');
  }
  const p = path.join(footprintsDir, `${appKey}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// --- Orphan scan cache ---

function saveOrphanScan(orphans) {
  ensureInit();
  fs.writeFileSync(orphansFile, JSON.stringify({ scannedAt: new Date().toISOString(), orphans }, null, 2), 'utf8');
}

function getLastOrphanScan() {
  ensureInit();
  if (!fs.existsSync(orphansFile)) return null;
  return JSON.parse(fs.readFileSync(orphansFile, 'utf8'));
}

module.exports = {
  initSurgicalStore,
  listSnapshots,
  getSnapshot,
  deleteSnapshot,
  appendDiff,
  getAllDiffs,
  getDiffsForSnapshot,
  clearDiffsForSnapshot,
  saveFootprint,
  getFootprint,
  saveOrphanScan,
  getLastOrphanScan
};
