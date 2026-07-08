import { describe, it, expect, vi, beforeEach } from 'vitest';

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
