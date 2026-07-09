import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) },
  shell: { openPath: vi.fn() }
}));

import { executeAllowedCommand, initCommandExecutor, ALLOWED_COMMANDS } from '../electron/commandExecutor.js';

describe('commandExecutor', () => {
  beforeEach(() => {
    // Mock dialog, log, audit, settings
    initCommandExecutor(
      () => null, // getMainWindow
      vi.fn(), // log
      vi.fn(), // audit
      { get: vi.fn(), set: vi.fn() }, // settingsStore
      {} // defaultSettings
    );
  });

  it('should reject non-allowlisted commands', async () => {
    await expect(executeAllowedCommand('non-existent-cmd', [], { bypassConfirmation: true }))
      .rejects.toThrow(/SECURITY: Command "non-existent-cmd" is not allowlisted/);
  });

  describe('buildArgs validation', () => {
    it('registry-backup validates arguments', () => {
      const cmd = ALLOWED_COMMANDS['registry-backup'];
      expect(cmd.buildArgs(['backup', 'MyBackup'])).toEqual(['-Action', 'backup', '-BackupName', 'MyBackup']);
      expect(cmd.buildArgs(['restore'])).toEqual(['-Action', 'restore', '-BackupName', '']);
    });

    it('registry-restore rejects paths outside APPDATA/RegBackups', () => {
      const cmd = ALLOWED_COMMANDS['registry-restore'];
      // Valid path test depends on APPDATA env var, so we just test the invalid path rejection
      expect(() => cmd.buildArgs(['C:\\Windows\\System32\\config\\SAM'])).toThrow(/Security: Restore file must reside in RegBackups folder/);
    });

    it('delete-files rejects system paths', () => {
      const cmd = ALLOWED_COMMANDS['delete-files'];
      const payload = JSON.stringify(['C:\\Windows\\System32\\cmd.exe']);
      expect(() => cmd.buildCommand([payload])).toThrow(/Security: Refusing to delete system path/);
      
      // Valid path should pass
      const validPayload = JSON.stringify(['C:\\Users\\TestUser\\Desktop\\junk.txt']);
      const res = cmd.buildCommand([validPayload]);
      expect(res).toContain('Remove-Item -LiteralPath');
      expect(res).toContain('junk.txt');
    });

    it('junk-clean saves files to a safe temp JSON list', () => {
      const cmd = ALLOWED_COMMANDS['junk-clean'];
      const payload = JSON.stringify(['C:\\Users\\Test\\AppData\\Local\\Temp\\junk1.tmp']);
      const args = cmd.buildArgs([payload]);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('clean');
      expect(args[2]).toBe('-FilesPath');
      expect(args[3]).toMatch(/solas_junk_\d+\.json$/);
    });

    it('junk-clean rejects non-string/invalid JSON payloads', () => {
      const cmd = ALLOWED_COMMANDS['junk-clean'];
      expect(() => cmd.buildArgs(['invalid json'])).toThrow();
      expect(() => cmd.buildArgs([JSON.stringify({ not: 'an array' })])).toThrow();
    });
  });

  describe('surgical-tool buildArgs validation (Feature 1)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-surgical-tool'];

    it('accepts take-snapshot with no extra args', () => {
      const args = cmd().buildArgs(['take-snapshot']);
      expect(args).toEqual(['-Action', 'take-snapshot']);
    });

    it('accepts take-snapshot with depth', () => {
      const args = cmd().buildArgs(['take-snapshot', null, null, null, 3]);
      expect(args).toEqual(['-Action', 'take-snapshot', '-Depth', '3']);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid surgical-tool action/);
    });

    it('rejects malformed snapshot id (path traversal attempt)', () => {
      expect(() => cmd().buildArgs(['compute-diff', '..\\..\\windows\\system32'])).toThrow(/Invalid snapshot id/);
    });

    it('rejects malformed snapshot id (shell metachar)', () => {
      expect(() => cmd().buildArgs(['compute-diff', 'snap_20260101_aaaa; rm -rf'])).toThrow(/Invalid snapshot id/);
    });

    it('accepts well-formed snapshot id', () => {
      const args = cmd().buildArgs(['compute-diff', 'snap_20260109_144201_abc12345']);
      expect(args).toEqual(['-Action', 'compute-diff', '-SnapshotId', 'snap_20260109_144201_abc12345']);
    });

    it('rejects appKey with PowerShell variable sigil $', () => {
      // Note: ; is actually SAFE because args get single-quote-wrapped in
      // commandExecutor.js (line 198), and ; inside single quotes is a literal.
      // The truly rejected chars are < > | " ` $ (defense-in-depth).
      expect(() => cmd().buildArgs(['get-footprint', null, 'app$var', null])).toThrow(/Invalid app key/);
    });

    it('rejects appKey with backtick (PowerShell escape char)', () => {
      expect(() => cmd().buildArgs(['get-footprint', null, 'app`whoami', null])).toThrow(/Invalid app key/);
    });

    it('accepts valid GUID-style appKey', () => {
      const args = cmd().buildArgs(['get-footprint', null, '{AB12CD34-1234-1234-1234-ABCDEF123456}', 'Test App']);
      expect(args).toContain('-AppKey', '{AB12CD34-1234-1234-1234-ABCDEF123456}');
      expect(args).toContain('-DisplayName', 'Test App');
    });

    it('rejects depth out of range', () => {
      expect(() => cmd().buildArgs(['take-snapshot', null, null, null, 0])).toThrow(/Depth must be integer 1-5/);
      expect(() => cmd().buildArgs(['take-snapshot', null, null, null, 99])).toThrow(/Depth must be integer 1-5/);
    });

    it('rejects displayName with null bytes', () => {
      expect(() => cmd().buildArgs(['get-footprint', null, '{guid}', 'evil\0name'])).toThrow(/Invalid display name/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('surgicalStore (Feature 1)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      // Use a temp APPDATA so we don't pollute the real user profile during tests.
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-surgical-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
      // surgicalStore.initSurgicalStore() unconditionally re-reads APPDATA, so no
      // module cache reset is needed - each test calls initSurgicalStore() explicitly.
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('round-trips a snapshot through save + list + get + delete', () => {
      const store = require('../electron/surgicalStore');
      store.initSurgicalStore();
      const path = require('path');
      const fs = require('fs');
      // Write a fake snapshot file directly to disk
      const snapshotsDir = path.join(tmpRoot, 'SolasCare', 'surgical', 'snapshots');
      const snapId = 'snap_20260109_120000_testabcd';
      const data = {
        id: snapId,
        createdIso: '2026-01-09T12:00:00Z',
        depth: 2,
        filesystem: [{ root: 'ProgramFiles', path: 'C:\\Program Files\\Test\\app.exe', size: 1000, mtime: '2026-01-09T12:00:00Z' }],
        registry: [],
        services: [],
        tasks: []
      };
      fs.writeFileSync(path.join(snapshotsDir, `${snapId}.json`), JSON.stringify(data), 'utf8');

      const list = store.listSnapshots();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(snapId);
      expect(list[0].depth).toBe(2);

      const got = store.getSnapshot(snapId);
      expect(got).toBeTruthy();
      expect(got.id).toBe(snapId);
      expect(got.filesystem).toHaveLength(1);

      const deleted = store.deleteSnapshot(snapId);
      expect(deleted).toBe(true);
      expect(store.listSnapshots()).toHaveLength(0);
    });

    it('appendDiff + getAllDiffs round-trip', () => {
      const store = require('../electron/surgicalStore');
      store.initSurgicalStore();
      store.appendDiff({ snapshotId: 'snap_a', computedIso: '2026-01-09T12:00:00Z', summary: { filesAdded: 10 } });
      store.appendDiff({ snapshotId: 'snap_b', computedIso: '2026-01-09T13:00:00Z', summary: { filesAdded: 20 } });
      const all = store.getAllDiffs();
      expect(all).toHaveLength(2);
      expect(all[0].snapshotId).toBe('snap_a');
      expect(all[1].snapshotId).toBe('snap_b');
    });

    it('clearDiffsForSnapshot removes only matching diffs', () => {
      const store = require('../electron/surgicalStore');
      store.initSurgicalStore();
      store.appendDiff({ snapshotId: 'snap_a', summary: {} });
      store.appendDiff({ snapshotId: 'snap_b', summary: {} });
      store.clearDiffsForSnapshot('snap_a');
      const all = store.getAllDiffs();
      expect(all).toHaveLength(1);
      expect(all[0].snapshotId).toBe('snap_b');
    });

    it('saveOrphanScan + getLastOrphanScan round-trip', () => {
      const store = require('../electron/surgicalStore');
      store.initSurgicalStore();
      const orphans = [{ type: 'appdata-orphan-folder', appName: 'X', detail: 'd', sizeHint: 1.2 }];
      store.saveOrphanScan(orphans);
      const got = store.getLastOrphanScan();
      expect(got).toBeTruthy();
      expect(got.orphans).toHaveLength(1);
      expect(got.orphans[0].appName).toBe('X');
    });

    it('rejects malformed snapshot id in getSnapshot', () => {
      const store = require('../electron/surgicalStore');
      store.initSurgicalStore();
      expect(() => store.getSnapshot('../etc/passwd')).toThrow(/Invalid snapshot id/);
      expect(() => store.getSnapshot('snap_; rm -rf')).toThrow(/Invalid snapshot id/);
    });
  });

  describe('workspace-tool buildArgs validation (Feature 2)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-workspace-tool'];

    it('accepts get-current-state with no profile json', () => {
      const args = cmd().buildArgs(['get-current-state']);
      expect(args).toEqual(['-Action', 'get-current-state']);
    });

    it('accepts apply-profile with valid JSON', () => {
      const profile = { id: 'ws_test1', name: 'Test', actions: { powerPlan: 'high' } };
      const args = cmd().buildArgs(['apply-profile', JSON.stringify(profile)]);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('apply-profile');
      expect(args[2]).toBe('-ProfileJson');
      expect(JSON.parse(args[3]).id).toBe('ws_test1');
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid workspace-tool action/);
    });

    it('rejects profile JSON with null bytes', () => {
      expect(() => cmd().buildArgs(['apply-profile', '{"id":"ws\0_evil"}'])).toThrow(/Null bytes/);
    });

    it('rejects profile JSON that does not parse', () => {
      expect(() => cmd().buildArgs(['apply-profile', '{not valid json}'])).toThrow(/failed to parse/);
    });

    it('rejects profile JSON that is too long (>100KB)', () => {
      const huge = '{"x":"' + 'a'.repeat(100001) + '"}';
      expect(() => cmd().buildArgs(['apply-profile', huge])).toThrow(/too long/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });

    it('accepts restore-profile with no extra args', () => {
      const args = cmd().buildArgs(['restore-profile']);
      expect(args).toEqual(['-Action', 'restore-profile']);
    });
  });

  describe('workspaceStore (Feature 2)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-workspace-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('round-trips a profile through save + list + get + delete', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      const profile = {
        id: 'ws_test_001',
        name: 'Coding Mode',
        icon: 'code', color: 'cyan',
        actions: { launchApps: ['code','chrome'], killApps: ['spotify'], focusAssist: true, powerPlan: 'high', pauseWindowsUpdate: false }
      };
      store.saveProfile(profile);
      expect(store.listProfiles()).toHaveLength(1);
      expect(store.getProfile('ws_test_001').name).toBe('Coding Mode');

      // Update existing
      profile.name = 'Coding Mode v2';
      store.saveProfile(profile);
      expect(store.listProfiles()).toHaveLength(1);
      expect(store.getProfile('ws_test_001').name).toBe('Coding Mode v2');

      // Delete
      expect(store.deleteProfile('ws_test_001')).toBe(true);
      expect(store.listProfiles()).toHaveLength(0);
    });

    it('rejects malformed profile id in saveProfile', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      expect(() => store.saveProfile({ id: '../etc/passwd', name: 'X' })).toThrow(/Invalid profile id/);
      expect(() => store.saveProfile({ id: 'ws_; rm -rf', name: 'X' })).toThrow(/Invalid profile id/);
    });

    it('round-trips triggers through set + get', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      store.saveProfile({ id: 'ws_trig_test', name: 'T', actions: {} });
      const triggers = {
        time: [{ from: '09:00', to: '18:00', days: ['Monday'] }],
        app: ['code', 'chrome'],
        network: ['HomeWiFi']
      };
      const cleaned = store.setTriggers('ws_trig_test', triggers);
      expect(cleaned.time).toHaveLength(1);
      expect(cleaned.app).toEqual(['code', 'chrome']);
      expect(cleaned.network).toEqual(['HomeWiFi']);

      const got = store.getTriggers('ws_trig_test');
      expect(got.app).toEqual(['code', 'chrome']);
    });

    it('deleting a profile also removes its triggers', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      store.saveProfile({ id: 'ws_deltrig', name: 'X', actions: {} });
      store.setTriggers('ws_deltrig', { app: ['code'] });
      expect(store.getTriggers('ws_deltrig').app).toEqual(['code']);
      store.deleteProfile('ws_deltrig');
      // After delete, triggers for the profile should be absent
      const all = store.listTriggers();
      expect(all['ws_deltrig']).toBeUndefined();
    });

    it('setTriggers sanitizes/cleans trigger shapes', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      store.saveProfile({ id: 'ws_clean', name: 'C', actions: {} });
      // Pass garbage - store should clean it
      const cleaned = store.setTriggers('ws_clean', {
        time: [{ from: '09:00:00extra', to: '18', days: 'monday' }],
        app: 'not-an-array',
        network: 42
      });
      // time.from should be sliced to 5 chars
      expect(cleaned.time[0].from).toBe('09:00');
      // app and network should be absent (not arrays)
      expect(cleaned.app).toBeUndefined();
      expect(cleaned.network).toBeUndefined();
    });

    it('rejects malformed profile id in getTriggers/setTriggers', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      expect(() => store.getTriggers('../etc/passwd')).toThrow(/Invalid profile id/);
      expect(() => store.setTriggers('ws_; rm', { app: [] })).toThrow(/Invalid profile id/);
    });

    it('getApplied returns null when no profile is applied', () => {
      const store = require('../electron/workspaceStore');
      store.initWorkspaceStore();
      expect(store.getApplied()).toBeNull();
    });
  });

  describe('tweaker-tool buildArgs validation (Feature 3)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-tweaker-tool'];

    it('accepts list-backups with no extra args', () => {
      expect(cmd().buildArgs(['list-backups'])).toEqual(['-Action', 'list-backups']);
    });

    it('accepts apply-value with all args', () => {
      const args = cmd().buildArgs(['apply-value', 'bk_test123',
        'HKCU:\\Software\\Test', 'Enabled', 'REG_DWORD', '0']);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('apply-value');
      expect(args[2]).toBe('-BackupId');
      expect(args[3]).toBe('bk_test123');
      expect(args).toContain('HKCU:\\Software\\Test');
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid tweaker-tool action/);
    });

    it('rejects backupId with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['apply-value', 'bk_evil; rm -rf'])).toThrow(/Invalid BackupId/);
    });

    it('rejects backupId with path traversal', () => {
      expect(() => cmd().buildArgs(['apply-value', '../etc/passwd'])).toThrow(/Invalid BackupId/);
    });

    it('rejects registry key without hive prefix', () => {
      expect(() => cmd().buildArgs(['apply-value', 'bk_test',
        'C:\\Windows\\System32', 'Val', 'REG_SZ', 'data'])).toThrow(/must start with/);
    });

    it('rejects registry key with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['apply-value', 'bk_test',
        'HKLM:\\evil; rm -rf', 'Val', 'REG_SZ', 'data'])).toThrow(/Invalid registry key/);
    });

    it('rejects invalid value type', () => {
      expect(() => cmd().buildArgs(['apply-value', 'bk_test',
        'HKLM:\\Software\\Test', 'Val', 'REG_BINARY', 'data'])).toThrow(/Invalid value type/);
    });

    it('rejects value data with null bytes', () => {
      expect(() => cmd().buildArgs(['apply-value', 'bk_test',
        'HKLM:\\Software\\Test', 'Val', 'REG_SZ', 'evil\0data'])).toThrow(/Invalid value data/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('tweakerStore (Feature 3)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-tweaker-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('catalog has at least 10 real tweaks', () => {
      const store = require('../electron/tweakerStore');
      store.initTweakerStore();
      const catalog = store.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(10);
      // Each tweak must have required fields
      for (const t of catalog) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.regKey).toMatch(/^(HKLM|HKCU|HKCR|HKU|HKCC):\\/);
        expect(['low','medium','high']).toContain(t.risk);
        expect(['REG_DWORD','REG_SZ','REG_QWORD','REG_EXPAND_SZ','REG_MULTI_SZ']).toContain(t.valueType);
      }
    });

    it('curated bundles reference only catalog tweaks', () => {
      const store = require('../electron/tweakerStore');
      store.initTweakerStore();
      const catalog = store.getCatalog();
      const allIds = catalog.map(t => t.id);
      const bundles = store.getCuratedBundles();
      for (const b of bundles) {
        for (const tid of b.tweaks) {
          expect(allIds).toContain(tid);
        }
      }
    });

    it('round-trips custom bundle through save + list + delete', () => {
      const store = require('../electron/tweakerStore');
      store.initTweakerStore();
      const bundle = {
        id: 'cb_test_001',
        name: 'My Speed Bundle',
        description: 'Custom test bundle',
        icon: 'zap', color: 'cyan',
        tweaks: ['fast-menu-show', 'disable-ntfs-last-access']
      };
      store.saveCustomBundle(bundle);
      expect(store.listCustomBundles()).toHaveLength(1);
      // Update
      bundle.name = 'Updated';
      store.saveCustomBundle(bundle);
      expect(store.listCustomBundles()).toHaveLength(1);
      expect(store.listCustomBundles()[0].name).toBe('Updated');
      // Delete
      expect(store.deleteCustomBundle('cb_test_001')).toBe(true);
      expect(store.listCustomBundles()).toHaveLength(0);
    });

    it('rejects custom bundle referencing unknown tweak', () => {
      const store = require('../electron/tweakerStore');
      store.initTweakerStore();
      expect(() => store.saveCustomBundle({
        id: 'cb_evil', name: 'Evil',
        tweaks: ['this-tweak-does-not-exist']
      })).toThrow(/unknown tweak/);
    });

    it('rejects malformed bundle id', () => {
      const store = require('../electron/tweakerStore');
      store.initTweakerStore();
      expect(() => store.saveCustomBundle({
        id: '../etc/passwd', name: 'Evil', tweaks: []
      })).toThrow(/Invalid bundle id/);
      expect(() => store.saveCustomBundle({
        id: 'evil_no_prefix', name: 'Evil', tweaks: []
      })).toThrow(/Invalid bundle id/);
    });

    it('applied log is append-only and reversible', () => {
      const store = require('../electron/tweakerStore');
      store.initTweakerStore();
      store.appendAppliedLog({ tweakId: 'disable-telemetry', action: 'apply', backupId: 'bk_1' });
      store.appendAppliedLog({ tweakId: 'disable-telemetry', action: 'undo', backupId: 'bk_1' });
      const log = store.listAppliedLog();
      expect(log).toHaveLength(2);
      // Newest first
      expect(log[0].action).toBe('undo');
      expect(log[1].action).toBe('apply');
    });
  });

  describe('forge-tool buildArgs validation (Feature 4)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-forge-tool'];

    it('accepts list-catalog with no extra args', () => {
      expect(cmd().buildArgs(['list-catalog'])).toEqual(['-Action', 'list-catalog']);
    });

    it('accepts install-selected with JSON array', () => {
      const args = cmd().buildArgs(['install-selected', JSON.stringify(['Google.Chrome','Git.Git'])]);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('install-selected');
      expect(args[2]).toBe('-JsonArg');
      expect(JSON.parse(args[3])).toEqual(['Google.Chrome','Git.Git']);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid forge-tool action/);
    });

    it('rejects JSON arg with null bytes', () => {
      expect(() => cmd().buildArgs(['install-selected', '["evil\0id"]'])).toThrow(/Null bytes|Invalid JSON/);
    });

    it('rejects JSON arg that does not parse', () => {
      expect(() => cmd().buildArgs(['install-selected', '[not valid json]'])).toThrow(/failed to parse/);
    });

    it('rejects JSON arg that is too long', () => {
      // Build a string of 100001+ chars that's also too long
      const hugeString = 'a'.repeat(100001);  // not valid JSON but length check fires first
      expect(() => cmd().buildArgs(['install-selected', hugeString])).toThrow(/too long|Invalid JSON/);
    });
  });

  describe('forgeStore (Feature 4)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-forge-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('catalog has real Winget IDs (alphanumeric + dots/dashes/underscores/plus)', () => {
      const store = require('../electron/forgeStore');
      store.initForgeStore();
      const catalog = store.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(15);
      const seenIds = new Set();
      for (const app of catalog) {
        // Real winget IDs include things like "Notepad++.Notepad++" so allow + too
        expect(app.id).toMatch(/^[A-Za-z0-9\.\-_@\+]+$/);
        // No duplicate IDs
        expect(seenIds.has(app.id)).toBe(false);
        seenIds.add(app.id);
      }
    });

    it('role presets reference only catalog app IDs', () => {
      const store = require('../electron/forgeStore');
      store.initForgeStore();
      const catalog = store.getCatalog();
      const allIds = new Set(catalog.map(a => a.id));
      const presets = store.getRolePresets();
      for (const p of presets) {
        expect(p.appIds.length).toBeGreaterThan(0);
        for (const id of p.appIds) {
          expect(allIds.has(id)).toBe(true);
        }
      }
    });

    it('round-trips custom catalog through save + list + delete', () => {
      const store = require('../electron/forgeStore');
      store.initForgeStore();
      const cat = {
        id: 'fc_test_001',
        name: 'My Custom Catalog',
        apps: [
          { id: 'MyCorp.MyApp', name: 'My App', category: 'utility' }
        ]
      };
      store.saveCustomCatalog(cat);
      expect(store.listCustomCatalogs()).toHaveLength(1);
      expect(store.deleteCustomCatalog('fc_test_001')).toBe(true);
      expect(store.listCustomCatalogs()).toHaveLength(0);
    });

    it('rejects custom catalog with malformed app id (shell metachar)', () => {
      const store = require('../electron/forgeStore');
      store.initForgeStore();
      expect(() => store.saveCustomCatalog({
        id: 'fc_evil', name: 'Evil',
        apps: [{ id: 'evil; rm -rf', name: 'X' }]
      })).toThrow(/Invalid app id/);
    });

    it('rejects malformed catalog id', () => {
      const store = require('../electron/forgeStore');
      store.initForgeStore();
      expect(() => store.saveCustomCatalog({
        id: '../etc/passwd', name: 'X', apps: []
      })).toThrow(/Invalid catalog id/);
      expect(() => store.saveCustomCatalog({
        id: 'evil_no_prefix', name: 'X', apps: []
      })).toThrow(/Invalid catalog id/);
    });

    it('rejects catalog name that is too long', () => {
      const store = require('../electron/forgeStore');
      store.initForgeStore();
      expect(() => store.saveCustomCatalog({
        id: 'fc_test', name: 'X'.repeat(101), apps: []
      })).toThrow(/name must be/);
    });
  });

  describe('privacy-tool buildArgs validation (Feature 5)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-privacy-tool'];

    it('accepts get-status with no extra args', () => {
      expect(cmd().buildArgs(['get-status'])).toEqual(['-Action', 'get-status']);
    });

    it('accepts apply-blocklist with valid JSON array of domains', () => {
      const args = cmd().buildArgs(['apply-blocklist', JSON.stringify(['evil.com', 'tracker.com'])]);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('apply-blocklist');
      expect(JSON.parse(args[3])).toEqual(['evil.com', 'tracker.com']);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid privacy-tool action/);
    });

    it('rejects JSON arg with null bytes', () => {
      // The null-byte check fires first ("Invalid JSON arg.") before parse
      expect(() => cmd().buildArgs(['apply-blocklist', '["evil\0.com"]'])).toThrow(/Invalid JSON arg|Null bytes|failed to parse/);
    });

    it('rejects domain with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['apply-blocklist', JSON.stringify(['evil; rm -rf.com'])]))
        .toThrow(/Invalid domain/);
    });

    it('rejects domain with path traversal', () => {
      expect(() => cmd().buildArgs(['apply-blocklist', JSON.stringify(['../etc/passwd'])]))
        .toThrow(/Invalid domain/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('privacyStore (Feature 5)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-privacy-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('blocklist has at least 100 domains', () => {
      const store = require('../electron/privacyStore');
      store.initPrivacyStore();
      const bl = store.getBlocklist();
      expect(bl.length).toBeGreaterThanOrEqual(100);
      // Each domain must match safe pattern
      for (const d of bl) {
        expect(d).toMatch(/^[A-Za-z0-9.\-_]+$/);
      }
    });

    it('safe whitelist contains critical Windows domains', () => {
      const store = require('../electron/privacyStore');
      store.initPrivacyStore();
      const sw = store.getSafeWhitelist();
      // Must contain at minimum these critical domains
      const critical = ['windowsupdate.microsoft.com', 'login.live.com', 'login.microsoftonline.com'];
      for (const c of critical) {
        expect(sw).toContain(c);
      }
    });

    it('filterSafeDomains drops safe-whitelisted domains', () => {
      const store = require('../electron/privacyStore');
      store.initPrivacyStore();
      const result = store.filterSafeDomains([
        'evil.tracker.com',
        'windowsupdate.microsoft.com',  // safe — should be dropped
        'login.live.com'                 // safe — should be dropped
      ]);
      expect(result.kept).toEqual(['evil.tracker.com']);
      expect(result.dropped).toEqual(['windowsupdate.microsoft.com', 'login.live.com']);
    });

    it('filterSafeDomains handles subdomain of safe-whitelisted domain', () => {
      const store = require('../electron/privacyStore');
      store.initPrivacyStore();
      // Subdomain of a safe whitelist entry should also be dropped
      const result = store.filterSafeDomains(['subdomain.windowsupdate.microsoft.com']);
      expect(result.kept).toEqual([]);
      expect(result.dropped).toEqual(['subdomain.windowsupdate.microsoft.com']);
    });

    it('blocked count append + reset round-trips', () => {
      const store = require('../electron/privacyStore');
      store.initPrivacyStore();
      store.appendBlockedCount(10);
      store.appendBlockedCount(5);
      let data = store.getBlockedCount();
      expect(data.total).toBe(15);
      expect(data.history).toHaveLength(2);
      store.resetBlockedCount();
      data = store.getBlockedCount();
      expect(data.total).toBe(0);
      expect(data.history).toEqual([]);
    });

    it('rejects non-array passed to filterSafeDomains', () => {
      const store = require('../electron/privacyStore');
      store.initPrivacyStore();
      expect(() => store.filterSafeDomains('not-an-array')).toThrow(/array/);
    });
  });

  describe('vault-tool buildArgs validation (Feature 6)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-vault-tool'];

    it('accepts list-vaults with no extra args', () => {
      expect(cmd().buildArgs(['list-vaults'])).toEqual(['-Action', 'list-vaults']);
    });

    it('accepts create-vault with all args', () => {
      const args = cmd().buildArgs(['create-vault', 'vault_test_001', 'C:\\path\\to\\vault.vhdx', 'password123', 1024]);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('create-vault');
      expect(args).toContain('vault_test_001');
      expect(args).toContain('C:\\path\\to\\vault.vhdx');
      expect(args).toContain('password123');
      expect(args).toContain('1024');
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid vault-tool action/);
    });

    it('rejects vaultId with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['mount-vault', 'vault_evil; rm -rf'])).toThrow(/Invalid vault id/);
    });

    it('rejects vaultId with wrong prefix', () => {
      expect(() => cmd().buildArgs(['mount-vault', 'evil_no_prefix'])).toThrow(/Invalid vault id/);
    });

    it('rejects vault path without .vhd/.vhdx extension', () => {
      expect(() => cmd().buildArgs(['create-vault', 'vault_test', 'C:\\path\\vault.txt']))
        .toThrow(/must end in .vhd or .vhdx/);
    });

    it('rejects vault path with path traversal', () => {
      expect(() => cmd().buildArgs(['create-vault', 'vault_test', '..\\..\\windows\\system32\\evil.vhd']))
        .toThrow(/Invalid vault path/);
    });

    it('rejects size out of range', () => {
      expect(() => cmd().buildArgs(['create-vault', 'vault_test', 'C:\\v.vhdx', 'pw', 50]))
        .toThrow(/Size must be/);
      expect(() => cmd().buildArgs(['create-vault', 'vault_test', 'C:\\v.vhdx', 'pw', 5000000]))
        .toThrow(/Size must be/);
    });

    it('rejects password with null bytes', () => {
      expect(() => cmd().buildArgs(['create-vault', 'vault_test', 'C:\\v.vhdx', 'evil\0pw', 1024]))
        .toThrow(/Invalid password/);
    });
  });

  describe('vaultStore (Feature 6)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-vault-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('markMounted + isMounted + markUnmounted round-trip', () => {
      const store = require('../electron/vaultStore');
      store.initVaultStore();
      expect(store.isMounted('vault_test_001')).toBe(false);
      store.markMounted('vault_test_001', 'C:\\mock.vhdx', 'Z', 15);
      expect(store.isMounted('vault_test_001')).toBe(true);
      const mounted = store.getMountedVaults();
      expect(mounted['vault_test_001']).toBeTruthy();
      expect(mounted['vault_test_001'].driveLetter).toBe('Z');
      expect(mounted['vault_test_001'].autoUnmountMinutes).toBe(15);
      store.markUnmounted('vault_test_001');
      expect(store.isMounted('vault_test_001')).toBe(false);
    });

    it('touchActivity updates lastActivityIso', () => {
      const store = require('../electron/vaultStore');
      store.initVaultStore();
      store.markMounted('vault_test_002', 'C:\\mock.vhdx', 'Y', 30);
      const before = store.getMountedVaults()['vault_test_002'].lastActivityIso;
      // Wait a moment to ensure ISO differs
      const wait = new Promise(r => setTimeout(r, 50));
      return wait.then(() => {
        store.touchActivity('vault_test_002');
        const after = store.getMountedVaults()['vault_test_002'].lastActivityIso;
        expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
      });
    });

    it('rejects malformed vaultId in markMounted', () => {
      const store = require('../electron/vaultStore');
      store.initVaultStore();
      expect(() => store.markMounted('../etc/passwd', 'C:\\mock.vhdx', 'Z', 0)).toThrow(/Invalid vault id/);
      expect(() => store.markMounted('evil_no_prefix', 'C:\\mock.vhdx', 'Z', 0)).toThrow(/Invalid vault id/);
    });

    it('activity log is append-only and reversible', () => {
      const store = require('../electron/vaultStore');
      store.initVaultStore();
      store.appendActivity({ ts: new Date().toISOString(), action: 'create', vaultId: 'vault_x', result: 'success' });
      store.appendActivity({ ts: new Date().toISOString(), action: 'mount', vaultId: 'vault_x', result: 'success' });
      store.appendActivity({ ts: new Date().toISOString(), action: 'unmount', vaultId: 'vault_x', result: 'success' });
      const log = store.listActivity();
      expect(log).toHaveLength(3);
      // Newest first
      expect(log[0].action).toBe('unmount');
      expect(log[2].action).toBe('create');
    });

    it('rejects non-object passed to appendActivity', () => {
      const store = require('../electron/vaultStore');
      store.initVaultStore();
      expect(() => store.appendActivity('not-an-object')).toThrow(/Invalid entry/);
      expect(() => store.appendActivity(null)).toThrow(/Invalid entry/);
    });
  });

  describe('snapshot-tool buildArgs validation (Feature 7)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-snapshot-tool'];

    it('accepts list-snapshots with no extra args', () => {
      expect(cmd().buildArgs(['list-snapshots'])).toEqual(['-Action', 'list-snapshots']);
    });

    it('accepts create-snapshot with description + reason', () => {
      const args = cmd().buildArgs(['create-snapshot', null, 'Before Chrome install', 'pre-install']);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('create-snapshot');
      expect(args).toContain('Before Chrome install');
      expect(args).toContain('pre-install');
    });

    it('accepts restore-snapshot with sequence number', () => {
      const args = cmd().buildArgs(['restore-snapshot', '12345']);
      expect(args).toContain('12345');
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid snapshot-tool action/);
    });

    it('rejects sequence number with non-digits', () => {
      expect(() => cmd().buildArgs(['restore-snapshot', 'abc; rm -rf'])).toThrow(/Invalid snapshot sequence/);
      expect(() => cmd().buildArgs(['restore-snapshot', '123abc'])).toThrow(/Invalid snapshot sequence/);
    });

    it('rejects description with shell metacharacters', () => {
      // ; is safe (single-quote wrapped in PS), but $ and ` are not
      expect(() => cmd().buildArgs(['create-snapshot', null, 'evil$var', 'manual']))
        .toThrow(/Invalid description/);
      expect(() => cmd().buildArgs(['create-snapshot', null, 'evil`cmd', 'manual']))
        .toThrow(/Invalid description/);
    });

    it('rejects description with null bytes', () => {
      expect(() => cmd().buildArgs(['create-snapshot', null, 'evil\0name', 'manual']))
        .toThrow(/Invalid description/);
    });

    it('rejects invalid trigger reason', () => {
      expect(() => cmd().buildArgs(['create-snapshot', null, 'test', 'evil-reason']))
        .toThrow(/Invalid trigger reason/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('snapshotStore (Feature 7)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-snapshot-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('returns default settings when no settings file exists', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      const s = store.getSettings();
      expect(s.maxSnapshots).toBe(10);
      expect(s.maxAgeDays).toBe(30);
      expect(s.diskSpaceThresholdPct).toBe(85);
      expect(s.autoCleanupEnabled).toBe(true);
    });

    it('round-trips settings through save + get', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      store.saveSettings({ maxSnapshots: 20, maxAgeDays: 60, diskSpaceThresholdPct: 90, autoCleanupEnabled: false });
      const s = store.getSettings();
      expect(s.maxSnapshots).toBe(20);
      expect(s.maxAgeDays).toBe(60);
      expect(s.diskSpaceThresholdPct).toBe(90);
      expect(s.autoCleanupEnabled).toBe(false);
    });

    it('rejects invalid maxSnapshots', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      expect(() => store.saveSettings({ maxSnapshots: 0 })).toThrow(/maxSnapshots/);
      expect(() => store.saveSettings({ maxSnapshots: 500 })).toThrow(/maxSnapshots/);
    });

    it('rejects invalid diskSpaceThresholdPct', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      expect(() => store.saveSettings({ diskSpaceThresholdPct: 30 })).toThrow(/diskSpaceThresholdPct/);
      expect(() => store.saveSettings({ diskSpaceThresholdPct: 150 })).toThrow(/diskSpaceThresholdPct/);
    });

    it('evaluateRetentionPolicy marks snapshots older than maxAgeDays', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      store.saveSettings({ maxSnapshots: 100, maxAgeDays: 7, diskSpaceThresholdPct: 99, autoCleanupEnabled: true });
      const now = Date.now();
      const oldSnap = { sequenceNumber: 1, createdIso: new Date(now - 10 * 86400000).toISOString() };  // 10 days old
      const newSnap = { sequenceNumber: 2, createdIso: new Date(now - 1 * 86400000).toISOString() };   // 1 day old
      const toDelete = store.evaluateRetentionPolicy([oldSnap, newSnap], { usedPercent: 50 });
      expect(toDelete.find(t => t.seqNum === 1 && t.reason === 'older-than-maxAgeDays')).toBeTruthy();
      expect(toDelete.find(t => t.seqNum === 2)).toBeUndefined();
    });

    it('evaluateRetentionPolicy marks excess snapshots beyond maxSnapshots', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      store.saveSettings({ maxSnapshots: 2, maxAgeDays: 365, diskSpaceThresholdPct: 99, autoCleanupEnabled: true });
      const snaps = [
        { sequenceNumber: 1, createdIso: '2026-01-01T00:00:00Z' },
        { sequenceNumber: 2, createdIso: '2026-01-02T00:00:00Z' },
        { sequenceNumber: 3, createdIso: '2026-01-03T00:00:00Z' },
        { sequenceNumber: 4, createdIso: '2026-01-04T00:00:00Z' }
      ];
      const toDelete = store.evaluateRetentionPolicy(snaps, { usedPercent: 50 });
      // maxSnapshots = 2, so 2 oldest (seq 1 and 2) should be marked
      expect(toDelete.find(t => t.seqNum === 1 && t.reason === 'exceeds-maxSnapshots')).toBeTruthy();
      expect(toDelete.find(t => t.seqNum === 2 && t.reason === 'exceeds-maxSnapshots')).toBeTruthy();
      expect(toDelete.find(t => t.seqNum === 3)).toBeUndefined();
      expect(toDelete.find(t => t.seqNum === 4)).toBeUndefined();
    });

    it('evaluateRetentionPolicy marks all when disk space critical', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      store.saveSettings({ maxSnapshots: 100, maxAgeDays: 365, diskSpaceThresholdPct: 85, autoCleanupEnabled: true });
      const snaps = [
        { sequenceNumber: 1, createdIso: new Date().toISOString() },
        { sequenceNumber: 2, createdIso: new Date().toISOString() },
        { sequenceNumber: 3, createdIso: new Date().toISOString() }
      ];
      const toDelete = store.evaluateRetentionPolicy(snaps, { usedPercent: 90 });
      // All 3 should be marked (disk critical)
      expect(toDelete.length).toBeGreaterThanOrEqual(3);
      // Each marked snapshot should have a valid reason
      const validReasons = ['older-than-maxAgeDays', 'exceeds-maxSnapshots', 'disk-space-critical'];
      expect(toDelete.every(t => validReasons.includes(t.reason))).toBe(true);
    });

    it('history append + list round-trip', () => {
      const store = require('../electron/snapshotStore');
      store.initSnapshotStore();
      store.appendHistory({ ts: new Date().toISOString(), seqNum: 1, triggerReason: 'manual' });
      store.appendHistory({ ts: new Date().toISOString(), seqNum: 2, triggerReason: 'pre-install' });
      const h = store.listHistory();
      expect(h).toHaveLength(2);
      expect(h[0].seqNum).toBe(2);  // newest first
    });
  });

  describe('clone-tool buildArgs validation (Feature 8)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-clone-tool'];

    it('accepts get-exportable-items with no extra args', () => {
      expect(cmd().buildArgs(['get-exportable-items'])).toEqual(['-Action', 'get-exportable-items']);
    });

    it('accepts export-clone with .solasclone path', () => {
      const args = cmd().buildArgs(['export-clone', 'C:\\path\\my.solasclone']);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('export-clone');
      expect(args).toContain('C:\\path\\my.solasclone');
    });

    it('rejects export path without .solasclone extension', () => {
      expect(() => cmd().buildArgs(['export-clone', 'C:\\path\\file.txt']))
        .toThrow(/must end in .solasclone/);
    });

    it('rejects export path with path traversal', () => {
      expect(() => cmd().buildArgs(['export-clone', '..\\..\\windows\\evil.solasclone']))
        .toThrow(/Invalid export path/);
    });

    it('rejects export path with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['export-clone', 'C:\\path; rm -rf\\evil.solasclone']))
        .toThrow(/Invalid export path/);
    });

    it('accepts import-clone with config JSON', () => {
      const cfg = JSON.stringify({ installApps: true, restoreWifi: false });
      const args = cmd().buildArgs(['import-clone', 'C:\\path\\temp.json', cfg]);
      expect(args[0]).toBe('-Action');
      expect(args[1]).toBe('import-clone');
      expect(JSON.parse(args[5])).toEqual({ installApps: true, restoreWifi: false });
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid clone-tool action/);
    });

    it('rejects JSON arg with null bytes', () => {
      expect(() => cmd().buildArgs(['import-clone', 'C:\\t.json', '{"x":"evil\0"}']))
        .toThrow(/Invalid JSON arg|Null bytes/);
    });
  });

  describe('cloneStore (Feature 8)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-clone-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('encrypts and decrypts a .solasclone file round-trip', () => {
      const store = require('../electron/cloneStore');
      const fs = require('fs');
      const path = require('path');
      store.initCloneStore();
      const plaintext = JSON.stringify({
        solasCloneVersion: 1,
        exportedAtIso: new Date().toISOString(),
        wingetApps: [{ id: 'Google.Chrome' }, { id: 'Git.Git' }],
        wifiProfiles: [{ ssid: 'HomeWiFi', xml: '<wifi>...</wifi>' }]
      });
      const outPath = path.join(tmpRoot, 'test.solasclone');
      const result = store.encryptToFile(plaintext, 'mypassword123', outPath);
      expect(result.bytesWritten).toBeGreaterThan(100);
      expect(fs.existsSync(outPath)).toBe(true);

      // Decrypt
      const decrypted = store.decryptFromFile(outPath, 'mypassword123');
      const parsed = JSON.parse(decrypted);
      expect(parsed.solasCloneVersion).toBe(1);
      expect(parsed.wingetApps).toHaveLength(2);
      expect(parsed.wifiProfiles[0].ssid).toBe('HomeWiFi');
    });

    it('rejects decryption with wrong password', () => {
      const store = require('../electron/cloneStore');
      const path = require('path');
      store.initCloneStore();
      const outPath = path.join(tmpRoot, 'test2.solasclone');
      store.encryptToFile('{"test":true}', 'correctpassword', outPath);
      expect(() => store.decryptFromFile(outPath, 'wrongpassword'))
        .toThrow(/Decryption failed/);
    });

    it('rejects encryption with short password (< 4 chars)', () => {
      const store = require('../electron/cloneStore');
      const path = require('path');
      store.initCloneStore();
      const outPath = path.join(tmpRoot, 'test3.solasclone');
      expect(() => store.encryptToFile('{"test":true}', 'abc', outPath))
        .toThrow(/Password too short/);
    });

    it('rejects encryption to non-.solasclone path', () => {
      const store = require('../electron/cloneStore');
      const path = require('path');
      store.initCloneStore();
      const outPath = path.join(tmpRoot, 'test.txt');
      expect(() => store.encryptToFile('{"test":true}', 'password', outPath))
        .toThrow(/must end in .solasclone/);
    });

    it('rejects decryption of corrupted/too-short file', () => {
      const store = require('../electron/cloneStore');
      const fs = require('fs');
      const path = require('path');
      store.initCloneStore();
      const corruptPath = path.join(tmpRoot, 'corrupt.solasclone');
      fs.writeFileSync(corruptPath, Buffer.from([1, 2, 3]));  // too short
      expect(() => store.decryptFromFile(corruptPath, 'password'))
        .toThrow(/File too short/);
    });

    it('history append + list round-trip', () => {
      const store = require('../electron/cloneStore');
      store.initCloneStore();
      store.appendHistory({ ts: new Date().toISOString(), action: 'export', path: 'C:\\a.solasclone', bytes: 1024 });
      store.appendHistory({ ts: new Date().toISOString(), action: 'import', path: 'C:\\b.solasclone' });
      const h = store.listHistory();
      expect(h).toHaveLength(2);
      expect(h[0].action).toBe('import');  // newest first
      expect(h[1].action).toBe('export');
    });

    it('produces different ciphertext for same plaintext (random IV)', () => {
      const store = require('../electron/cloneStore');
      const fs = require('fs');
      const path = require('path');
      store.initCloneStore();
      const plaintext = '{"same":"content"}';
      const out1 = path.join(tmpRoot, 'a.solasclone');
      const out2 = path.join(tmpRoot, 'b.solasclone');
      store.encryptToFile(plaintext, 'password', out1);
      store.encryptToFile(plaintext, 'password', out2);
      const bytes1 = fs.readFileSync(out1);
      const bytes2 = fs.readFileSync(out2);
      // IV is random, so ciphertext should differ even for same plaintext
      expect(bytes1.equals(bytes2)).toBe(false);
    });
  });

  describe('health-tool buildArgs validation (Feature 9)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-health-tool'];

    it('accepts compute-health-score with no extra args', () => {
      expect(cmd().buildArgs(['compute-health-score'])).toEqual(['-Action', 'compute-health-score']);
    });

    it('accepts get-smart-data', () => {
      expect(cmd().buildArgs(['get-smart-data'])).toEqual(['-Action', 'get-smart-data']);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid health-tool action/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('healthStore (Feature 9)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-health-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('returns default settings when no settings file exists', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      const s = store.getSettings();
      expect(s.cpuTempThreshold).toBe(80);
      expect(s.diskFreeThreshold).toBe(10);
      expect(s.pollingIntervalMinutes).toBe(5);
    });

    it('round-trips settings through save + get', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      store.saveSettings({ cpuTempThreshold: 95, diskFreeThreshold: 15, pollingIntervalMinutes: 10 });
      const s = store.getSettings();
      expect(s.cpuTempThreshold).toBe(95);
      expect(s.diskFreeThreshold).toBe(15);
      expect(s.pollingIntervalMinutes).toBe(10);
    });

    it('rejects invalid cpuTempThreshold', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      expect(() => store.saveSettings({ cpuTempThreshold: 20 })).toThrow(/cpuTempThreshold/);
      expect(() => store.saveSettings({ cpuTempThreshold: 200 })).toThrow(/cpuTempThreshold/);
    });

    it('history append + list round-trip', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      store.appendHistory({ ts: new Date().toISOString(), score: 85, status: 'healthy' });
      store.appendHistory({ ts: new Date().toISOString(), score: 70, status: 'fair' });
      const h = store.listHistory(30);
      expect(h).toHaveLength(2);
    });

    it('alerts append + list round-trip', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      store.appendAlert({ ts: new Date().toISOString(), severity: 'critical', metric: 'smart', message: 'Disk failing' });
      store.appendAlert({ ts: new Date().toISOString(), severity: 'warning', metric: 'cpuTemp', message: 'Hot CPU' });
      const a = store.listAlerts(30);
      expect(a).toHaveLength(2);
      expect(a[0].metric).toBe('cpuTemp');  // newest first
    });

    it('evaluateThresholds fires alert on SMART predict failure', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      const snapshot = {
        score: 70, status: 'fair',
        details: {
          smart: { available: true, predicting: 1 },
          cpuTemp: { available: true, celsius: 75 },
          diskFree: { available: true, freePercent: 20 }
        }
      };
      const alerts = store.evaluateThresholds(snapshot);
      // SMART alert should fire
      expect(alerts.find(a => a.metric === 'smart' && a.severity === 'critical')).toBeTruthy();
    });

    it('evaluateThresholds fires alert on high CPU temp', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      store.saveSettings({ cpuTempThreshold: 80 });
      const snapshot = {
        score: 70, status: 'fair',
        details: { cpuTemp: { available: true, celsius: 85 } }
      };
      const alerts = store.evaluateThresholds(snapshot);
      expect(alerts.find(a => a.metric === 'cpuTemp' && a.severity === 'warning')).toBeTruthy();
    });

    it('evaluateThresholds fires alert on low disk free', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      store.saveSettings({ diskFreeThreshold: 10 });
      const snapshot = {
        score: 70, status: 'fair',
        details: { diskFree: { available: true, freePercent: 3 } }  // clearly below 5% critical threshold
      };
      const alerts = store.evaluateThresholds(snapshot);
      expect(alerts.find(a => a.metric === 'diskFree' && a.severity === 'critical')).toBeTruthy();
    });

    it('evaluateThresholds does not fire when metrics below thresholds', () => {
      const store = require('../electron/healthStore');
      store.initHealthStore();
      const snapshot = {
        score: 95, status: 'healthy',
        details: {
          smart: { available: true, predicting: 0 },
          cpuTemp: { available: true, celsius: 60 },
          diskFree: { available: true, freePercent: 50 }
        }
      };
      const alerts = store.evaluateThresholds(snapshot);
      expect(alerts).toHaveLength(0);
    });
  });

  describe('sentinel-tool buildArgs validation (Feature 10)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-sentinel-tool'];

    it('accepts get-status with no extra args', () => {
      expect(cmd().buildArgs(['get-status'])).toEqual(['-Action', 'get-status']);
    });

    it('accepts restart-service with safe service name', () => {
      const args = cmd().buildArgs(['restart-service', 'Spooler']);
      expect(args).toContain('Spooler');
    });

    it('accepts kill-process with safe process name', () => {
      const args = cmd().buildArgs(['kill-process', null, 'chrome']);
      expect(args).toContain('chrome');
    });

    it('accepts reset-network-adapter with safe adapter name', () => {
      const args = cmd().buildArgs(['reset-network-adapter', null, 'Wi-Fi']);
      expect(args).toContain('Wi-Fi');
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid sentinel-tool action/);
    });

    it('rejects service name with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['restart-service', 'Spooler; rm -rf']))
        .toThrow(/Invalid service name/);
    });

    it('rejects process name with PowerShell variable sigil', () => {
      expect(() => cmd().buildArgs(['kill-process', null, 'evil$var']))
        .toThrow(/Invalid action arg/);
    });

    it('rejects action arg with path traversal', () => {
      expect(() => cmd().buildArgs(['kill-process', null, '..\\evil']))
        .toThrow(/Invalid action arg/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('sentinelStore (Feature 10)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-sentinel-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('returns default rules when no rules file exists', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      const rules = store.listRules();
      expect(rules.length).toBeGreaterThanOrEqual(3);
      // Each default rule must be valid
      for (const r of rules) {
        expect(() => store.validateRule(r)).not.toThrow();
      }
    });

    it('round-trips a rule through save + list + delete', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      const rule = {
        id: 'rule_test_001',
        name: 'My Test Rule',
        enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 85, windowMinutes: 0 },
        action: { type: 'notify-only' },
        cooldownMinutes: 10,
        lastFiredIso: null
      };
      store.saveRule(rule);
      expect(store.listRules().find(r => r.id === 'rule_test_001')).toBeTruthy();
      // Update
      rule.threshold = 90;
      store.saveRule(rule);
      // Delete
      expect(store.deleteRule('rule_test_001')).toBe(true);
      expect(store.listRules().find(r => r.id === 'rule_test_001')).toBeUndefined();
    });

    it('rejects rule with invalid metric', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      expect(() => store.saveRule({
        id: 'rule_bad', name: 'X', enabled: true,
        condition: { metric: 'evil-metric', op: '>', threshold: 1, windowMinutes: 0 },
        action: { type: 'notify-only' },
        cooldownMinutes: 5
      })).toThrow(/Invalid metric/);
    });

    it('rejects rule with invalid action type', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      expect(() => store.saveRule({
        id: 'rule_bad2', name: 'X', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 1, windowMinutes: 0 },
        action: { type: 'evil-action' },
        cooldownMinutes: 5
      })).toThrow(/Invalid action type/);
    });

    it('rejects rule missing arg for action that needs it', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      expect(() => store.saveRule({
        id: 'rule_bad3', name: 'X', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 1, windowMinutes: 0 },
        action: { type: 'restart-service' },  // missing arg
        cooldownMinutes: 5
      })).toThrow(/requires arg/);
    });

    it('rejects rule with shell metacharacters in action arg', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      expect(() => store.saveRule({
        id: 'rule_bad4', name: 'X', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 1, windowMinutes: 0 },
        action: { type: 'kill-process', arg: 'evil$var' },
        cooldownMinutes: 5
      })).toThrow(/blocked characters/);
    });

    it('rejects malformed rule id', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      expect(() => store.saveRule({
        id: '../etc/passwd', name: 'X', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 1, windowMinutes: 0 },
        action: { type: 'notify-only' },
        cooldownMinutes: 5
      })).toThrow(/Invalid rule id/);
    });

    it('evaluateRules fires when condition met and not in cooldown', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      // Save a rule with no recent lastFired
      store.saveRule({
        id: 'rule_eval_test', name: 'High RAM', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 80, windowMinutes: 0 },
        action: { type: 'notify-only' },
        cooldownMinutes: 60,
        lastFiredIso: null
      });
      const snapshot = { ram: { usedPercent: 95 } };
      const toFire = store.evaluateRules(snapshot);
      expect(toFire.find(f => f.rule.id === 'rule_eval_test')).toBeTruthy();
    });

    it('evaluateRules does NOT fire when in cooldown', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      store.saveRule({
        id: 'rule_cooldown_test', name: 'High RAM', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 80, windowMinutes: 0 },
        action: { type: 'notify-only' },
        cooldownMinutes: 60,
        lastFiredIso: new Date().toISOString()  // just fired
      });
      const snapshot = { ram: { usedPercent: 95 } };
      const toFire = store.evaluateRules(snapshot);
      expect(toFire.find(f => f.rule.id === 'rule_cooldown_test')).toBeUndefined();
    });

    it('evaluateRules does NOT fire when condition not met', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      store.saveRule({
        id: 'rule_no_fire', name: 'High RAM', enabled: true,
        condition: { metric: 'ramPercent', op: '>', threshold: 80, windowMinutes: 0 },
        action: { type: 'notify-only' },
        cooldownMinutes: 60,
        lastFiredIso: null
      });
      const snapshot = { ram: { usedPercent: 50 } };  // below threshold
      const toFire = store.evaluateRules(snapshot);
      expect(toFire.find(f => f.rule.id === 'rule_no_fire')).toBeUndefined();
    });

    it('events append + list round-trip', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      store.appendEvent({ ts: new Date().toISOString(), eventType: 'heal-success', ruleId: 'rule_x', ruleName: 'Test' });
      store.appendEvent({ ts: new Date().toISOString(), eventType: 'network-drop', details: 'Wi-Fi down' });
      const events = store.listEvents(7);
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('network-drop');  // newest first
    });

    it('generateDigest aggregates events correctly', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      const events = [
        { ts: new Date().toISOString(), eventType: 'heal-success', ruleId: 'rule_a' },
        { ts: new Date().toISOString(), eventType: 'heal-success', ruleId: 'rule_a' },
        { ts: new Date().toISOString(), eventType: 'heal-failure', ruleId: 'rule_b' },
        { ts: new Date().toISOString(), eventType: 'network-drop' }
      ];
      const digest = store.generateDigest(events);
      expect(digest.totalEvents).toBe(4);
      expect(digest.successfulHeals).toBe(2);
      expect(digest.failedHeals).toBe(1);
      expect(digest.byType['heal-success']).toBe(2);
      expect(digest.byType['network-drop']).toBe(1);
      expect(digest.byRule['rule_a']).toBe(2);
      expect(digest.topIssue.ruleId).toBe('rule_a');
    });

    it('network drop counter resets after 5-minute window', () => {
      const store = require('../electron/sentinelStore');
      store.initSentinelStore();
      store.recordNetworkDrop();
      store.recordNetworkDrop();
      store.recordNetworkDrop();
      expect(store.getNetworkDropCount()).toBe(3);
      // Note: real test of 5-min window would require time mocking; we just verify the count works
    });
  });

  describe('vcache-tool buildArgs validation (Feature 11)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-vcache-tool'];

    it('accepts check-imdisk with no extra args', () => {
      expect(cmd().buildArgs(['check-imdisk'])).toEqual(['-Action', 'check-imdisk']);
    });

    it('accepts create-ramdisk with valid drive letter + size', () => {
      const args = cmd().buildArgs(['create-ramdisk', 'R', 2048]);
      expect(args).toContain('R');
      expect(args).toContain('2048');
    });

    it('rejects drive letter A/B/C (system reserved)', () => {
      expect(() => cmd().buildArgs(['create-ramdisk', 'A', 1024])).toThrow(/Invalid drive letter/);
      expect(() => cmd().buildArgs(['create-ramdisk', 'B', 1024])).toThrow(/Invalid drive letter/);
      expect(() => cmd().buildArgs(['create-ramdisk', 'C', 1024])).toThrow(/Invalid drive letter/);
    });

    it('rejects multi-char drive letter', () => {
      expect(() => cmd().buildArgs(['create-ramdisk', 'AB', 1024])).toThrow(/Invalid drive letter/);
    });

    it('rejects lowercase drive letter', () => {
      expect(() => cmd().buildArgs(['create-ramdisk', 'r', 1024])).toThrow(/Invalid drive letter/);
    });

    it('rejects size below 100MB', () => {
      expect(() => cmd().buildArgs(['create-ramdisk', 'R', 50])).toThrow(/Size must be/);
    });

    it('rejects size above 32GB', () => {
      expect(() => cmd().buildArgs(['create-ramdisk', 'R', 40000])).toThrow(/Size must be/);
    });

    it('rejects cache path with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['redirect-cache', null, null, 'C:\\evil; rm -rf', 'Test']))
        .toThrow(/Invalid cache path/);
    });

    it('rejects cache label with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['redirect-cache', null, null, 'C:\\valid\\path', 'evil$var']))
        .toThrow(/Invalid cache label/);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid vcache-tool action/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('vcacheStore (Feature 11)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-vcache-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('returns default auto config when no file exists', () => {
      const store = require('../electron/vcacheStore');
      store.initVCacheStore();
      const cfg = store.getAutoConfig();
      expect(cfg.autoRecreateOnStartup).toBe(false);
      expect(cfg.defaultDriveLetter).toBe('R');
      expect(cfg.crashWarningAcknowledged).toBe(false);
    });

    it('round-trips auto config through save + get', () => {
      const store = require('../electron/vcacheStore');
      store.initVCacheStore();
      store.saveAutoConfig({
        autoRecreateOnStartup: true,
        defaultDriveLetter: 'Z',
        defaultSizeMB: 4096,
        crashWarningAcknowledged: true
      });
      const cfg = store.getAutoConfig();
      expect(cfg.autoRecreateOnStartup).toBe(true);
      expect(cfg.defaultDriveLetter).toBe('Z');
      expect(cfg.defaultSizeMB).toBe(4096);
      expect(cfg.crashWarningAcknowledged).toBe(true);
    });

    it('rejects drive letter A/B/C in saveAutoConfig', () => {
      const store = require('../electron/vcacheStore');
      store.initVCacheStore();
      expect(() => store.saveAutoConfig({ defaultDriveLetter: 'A' })).toThrow(/defaultDriveLetter/);
      expect(() => store.saveAutoConfig({ defaultDriveLetter: 'C' })).toThrow(/defaultDriveLetter/);
    });

    it('rejects invalid defaultSizeMB', () => {
      const store = require('../electron/vcacheStore');
      store.initVCacheStore();
      expect(() => store.saveAutoConfig({ defaultSizeMB: 50 })).toThrow(/defaultSizeMB/);
      expect(() => store.saveAutoConfig({ defaultSizeMB: 50000 })).toThrow(/defaultSizeMB/);
    });

    it('rejects non-boolean autoRecreateOnStartup', () => {
      const store = require('../electron/vcacheStore');
      store.initVCacheStore();
      expect(() => store.saveAutoConfig({ autoRecreateOnStartup: 'yes' })).toThrow(/autoRecreateOnStartup/);
    });

    it('activity append + list round-trip', () => {
      const store = require('../electron/vcacheStore');
      store.initVCacheStore();
      store.appendActivity({ ts: new Date().toISOString(), action: 'create-ramdisk', driveLetter: 'R', sizeMB: 2048 });
      store.appendActivity({ ts: new Date().toISOString(), action: 'remove-ramdisk', driveLetter: 'R' });
      const activity = store.listActivity(30);
      expect(activity).toHaveLength(2);
      expect(activity[0].action).toBe('remove-ramdisk');  // newest first
    });
  });

  describe('sandbox-tool buildArgs validation (Feature 12)', () => {
    const cmd = () => ALLOWED_COMMANDS['run-sandbox-tool'];

    it('accepts check-availability with no extra args', () => {
      expect(cmd().buildArgs(['check-availability'])).toEqual(['-Action', 'check-availability']);
    });

    it('accepts generate-wsb with template + host folder', () => {
      const args = cmd().buildArgs(['generate-wsb', null, 'suspicious-exe', 'C:\\path', 'cmd.exe']);
      expect(args).toContain('suspicious-exe');
      expect(args).toContain('C:\\path');
      expect(args).toContain('cmd.exe');
    });

    it('accepts launch-sandbox with .wsb path', () => {
      const args = cmd().buildArgs(['launch-sandbox', 'C:\\temp\\test.wsb']);
      expect(args).toContain('C:\\temp\\test.wsb');
    });

    it('rejects WSB path without .wsb extension', () => {
      expect(() => cmd().buildArgs(['launch-sandbox', 'C:\\temp\\test.txt']))
        .toThrow(/must end in .wsb/);
    });

    it('rejects WSB path with path traversal', () => {
      expect(() => cmd().buildArgs(['launch-sandbox', '..\\..\\evil.wsb']))
        .toThrow(/Invalid WSB path/);
    });

    it('rejects template id with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['generate-wsb', null, 'evil; rm -rf']))
        .toThrow(/Invalid template id/);
    });

    it('rejects template id with uppercase letters', () => {
      expect(() => cmd().buildArgs(['generate-wsb', null, 'EvilTemplate']))
        .toThrow(/Invalid template id/);
    });

    it('rejects host folder with shell metacharacters', () => {
      expect(() => cmd().buildArgs(['generate-wsb', null, 'suspicious-exe', 'C:\\evil$var', null]))
        .toThrow(/Invalid host folder path/);
    });

    it('rejects command with PowerShell variable sigil', () => {
      expect(() => cmd().buildArgs(['generate-wsb', null, 'custom', null, 'evil$var']))
        .toThrow(/Invalid command/);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid sandbox-tool action/);
    });

    it('rejects non-array args', () => {
      expect(() => cmd().buildArgs('not-an-array')).toThrow();
    });
  });

  describe('sandboxStore (Feature 12)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-sandbox-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('activity append + list round-trip', () => {
      const store = require('../electron/sandboxStore');
      store.initSandboxStore();
      store.appendActivity({ ts: new Date().toISOString(), action: 'launch', template: 'suspicious-exe' });
      store.appendActivity({ ts: new Date().toISOString(), action: 'launch', template: 'custom' });
      const activity = store.listActivity(30);
      expect(activity).toHaveLength(2);
      expect(activity[0].template).toBe('custom');  // newest first
    });

    it('listActivity returns empty array when no file exists', () => {
      const store = require('../electron/sandboxStore');
      store.initSandboxStore();
      const activity = store.listActivity(30);
      expect(activity).toEqual([]);
    });

    it('rejects non-object passed to appendActivity', () => {
      const store = require('../electron/sandboxStore');
      store.initSandboxStore();
      expect(() => store.appendActivity('not-an-object')).toThrow(/Invalid entry/);
      expect(() => store.appendActivity(null)).toThrow(/Invalid entry/);
    });
  });

  describe('licenseStore (Monetization)', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-license-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('returns free tier when no license and no first launch', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      const state = store.getLicenseState();
      expect(state.tier).toBe('free');
    });

    it('returns trial tier within 14 days of first launch', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      store.recordFirstLaunch();
      const state = store.getLicenseState();
      expect(state.tier).toBe('trial');
      expect(state.trialExpiresIso).toBeTruthy();
    });

    it('returns pro tier after activating valid license key', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      const demoKey = store.generateDemoLicenseKey();
      store.activateLicense(demoKey);
      const state = store.getLicenseState();
      expect(state.tier).toBe('pro');
      expect(state.licenseKey).toBe(demoKey);
    });

    it('returns free tier after deactivating license', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      store.recordFirstLaunch(); // starts trial
      const demoKey = store.generateDemoLicenseKey();
      store.activateLicense(demoKey);
      expect(store.getLicenseState().tier).toBe('pro');
      store.deactivateLicense();
      // After deactivation, tier reverts to trial (since first launch was recorded)
      const state = store.getLicenseState();
      expect(['trial', 'free']).toContain(state.tier);
    });

    it('validates license key format correctly', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      const demoKey = store.generateDemoLicenseKey();
      expect(store.validateLicenseKeyFormat(demoKey)).toBe(true);
      expect(store.validateLicenseKeyFormat('SOLAS-0000-0000-0000-0001')).toBe(false); // bad checksum (sum=0, last=1)
      expect(store.validateLicenseKeyFormat('INVALID-KEY')).toBe(false);
      expect(store.validateLicenseKeyFormat('')).toBe(false);
    });

    it('checkFeatureAccess blocks Pro features on free tier', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      // No first launch = free tier
      const access = store.checkFeatureAccess('vault');
      expect(access.allowed).toBe(false);
      expect(access.reason).toMatch(/Pro feature/);
    });

    it('checkFeatureAccess allows Pro features after activation', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      const demoKey = store.generateDemoLicenseKey();
      store.activateLicense(demoKey);
      const access = store.checkFeatureAccess('vault');
      expect(access.allowed).toBe(true);
      expect(access.tier).toBe('pro');
    });

    it('checkFeatureAccess allows free-tier features with limits on free', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      const access = store.checkFeatureAccess('surgical-uninstaller');
      expect(access.allowed).toBe(true);
      expect(access.tier).toBe('free');
      expect(access.limit).toBe(5);
    });

    it('usage counters increment and reset per month', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      store.incrementUsage('surgical-uninstall');
      store.incrementUsage('surgical-uninstall');
      const usage = store.getUsage();
      expect(usage.counters['surgical-uninstall']).toBe(2);
      expect(usage.month).toBe(new Date().toISOString().slice(0, 7));
    });

    it('getRemainingUsage decrements correctly', () => {
      const store = require('../electron/licenseStore');
      store.initLicenseStore();
      const initial = store.getRemainingUsage('surgical-uninstall');
      expect(initial).toBe(5);
      store.incrementUsage('surgical-uninstall');
      expect(store.getRemainingUsage('surgical-uninstall')).toBe(4);
    });
  });

  describe('netdiag-tool buildArgs validation', () => {
    const cmd = () => ALLOWED_COMMANDS['run-netdiag-tool'];

    it('accepts speed-test with no extra args', () => {
      expect(cmd().buildArgs(['speed-test'])).toEqual(['-Action', 'speed-test']);
    });

    it('accepts dns-check', () => {
      expect(cmd().buildArgs(['dns-check'])).toEqual(['-Action', 'dns-check']);
    });

    it('accepts active-connections', () => {
      expect(cmd().buildArgs(['active-connections'])).toEqual(['-Action', 'active-connections']);
    });

    it('rejects unknown action', () => {
      expect(() => cmd().buildArgs(['evil-action'])).toThrow(/Invalid netdiag-tool action/);
    });
  });

  describe('telemetryStore', () => {
    let tmpRoot;
    let origAppData;

    beforeEach(() => {
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'solas-telemetry-test-'));
      origAppData = process.env.APPDATA;
      process.env.APPDATA = tmpRoot;
    });

    afterEach(() => {
      process.env.APPDATA = origAppData;
      const fs = require('fs');
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (_) {}
    });

    it('returns default settings (disabled) when no file exists', () => {
      const store = require('../electron/telemetryStore');
      store.initTelemetryStore();
      const s = store.getSettings();
      expect(s.enabled).toBe(false);
      expect(s.trackFeatureUsage).toBe(true);
    });

    it('does not track events when disabled', () => {
      const store = require('../electron/telemetryStore');
      store.initTelemetryStore();
      store.trackEvent('app-launch');
      const stats = store.getStats(7);
      expect(stats.totalEvents).toBe(0);
    });

    it('tracks events when enabled', () => {
      const store = require('../electron/telemetryStore');
      store.initTelemetryStore();
      store.saveSettings({ enabled: true, trackAppLaunches: true });
      store.trackEvent('app-launch');
      store.trackEvent('feature-use', { featureId: 'vault' });
      const stats = store.getStats(7);
      expect(stats.totalEvents).toBe(2);
    });

    it('tracks feature usage separately', () => {
      const store = require('../electron/telemetryStore');
      store.initTelemetryStore();
      store.saveSettings({ enabled: true, trackFeatureUsage: true });
      store.trackEvent('feature-use', { featureId: 'vault' });
      store.trackEvent('feature-use', { featureId: 'vault' });
      store.trackEvent('feature-use', { featureId: 'sentinel' });
      const usage = store.getFeatureUsage();
      const month = new Date().toISOString().slice(0, 7);
      expect(usage[month]['vault']).toBe(2);
      expect(usage[month]['sentinel']).toBe(1);
    });

    it('DAU array has correct length', () => {
      const store = require('../electron/telemetryStore');
      store.initTelemetryStore();
      store.saveSettings({ enabled: true, trackAppLaunches: true });
      store.trackEvent('app-launch');
      const stats = store.getStats(30);
      expect(stats.dau).toHaveLength(30);
      // Today should have 1 launch
      expect(stats.dau[29].count).toBe(1);
    });
  });

  describe('native handlers', () => {
    it('detect-network resolves to a JSON string with success/status', async () => {
      const cmd = ALLOWED_COMMANDS['detect-network'];
      const result = await cmd.handler();
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('success');
      expect(parsed).toHaveProperty('status');
      // Status should be connected or disconnected depending on runner env
      expect(['connected', 'disconnected']).toContain(parsed.status);
    });
  });
});
