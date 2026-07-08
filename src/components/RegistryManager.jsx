import React, { useState, useEffect } from 'react';
import { Database, Download, Upload, Trash2, RefreshCw, Loader2, Calendar } from 'lucide-react';
import { formatBytes, formatDate } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';

export default function RegistryManager() {
  const { addNotification } = useNotification();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [backupName, setBackupName] = useState('');

  const loadBackups = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('registry-list-backups');
        if (res.success && res.stdout) {
          let backups = null;
          try { backups = JSON.parse(res.stdout.trim()); }
          catch {
            const m = res.stdout.match(/\[[\s\S]*\]/) || res.stdout.match(/\{[\s\S]*\}/);
            if (m) { try { backups = JSON.parse(m[0]); } catch {} }
          }
          setBackups(Array.isArray(backups) ? backups : (backups ? [backups] : []));
        } else {
          setBackups([]);
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        setBackups([
          { backupName: 'Pre-Maintenance Restore', timestamp: '2026-06-20T14:24:00.000Z', hklmFile: 'C:\\Users\\User\\AppData\\Roaming\\SolasCare\\RegBackups\\HKLM_20260620_142400.reg', hklmSize: 120530112, hkcuFile: 'C:\\Users\\User\\AppData\\Roaming\\SolasCare\\RegBackups\\HKCU_20260620_142400.reg', hkcuSize: 45012430 },
          { backupName: 'Initial Setup Backup', timestamp: '2026-06-15T09:12:12.000Z', hklmFile: 'C:\\Users\\User\\AppData\\Roaming\\SolasCare\\RegBackups\\HKLM_20260615_091212.reg', hklmSize: 118439121, hkcuFile: 'C:\\Users\\User\\AppData\\Roaming\\SolasCare\\RegBackups\\HKCU_20260615_091212.reg', hkcuSize: 43231409 }
        ]);
      }
    } catch (e) {
      console.error(e);
      addNotification('Registry Manager', 'Error loading backup listing: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async (e) => {
    e.preventDefault();
    if (backingUp) return;
    setBackingUp(true);
    const label = backupName.trim() || 'Manual Registry Backup';
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('registry-backup', ['backup', label]);
        if (res.success) {
          addNotification('Registry Backup', 'Registry keys exported successfully.', 'success');
          setBackupName('');
          loadBackups();
        } else {
          addNotification('Registry Backup', res.error || 'Failed to create backup.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        addNotification('Registry Backup', 'Backup created successfully (MOCK).', 'success');
        setBackupName('');
        loadBackups();
      }
    } catch (e) {
      console.error(e);
      addNotification('Registry Backup Error', e.message, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const restoreFile = async (filePath, backupName) => {
    setRestoring(filePath);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('registry-restore', [filePath]);
        if (res.success) {
          addNotification('Restore Complete', `Imported ${backupName} settings successfully. A system reboot is recommended.`, 'success');
        } else if (res.cancelled) {
          addNotification('Restore Cancelled', 'Operation cancelled by user.', 'info');
        } else {
          addNotification('Restore Failed', res.error || 'Import failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 2000));
        addNotification('Restore Complete', 'Settings imported successfully (MOCK).', 'success');
      }
    } catch (e) {
      console.error(e);
      addNotification('Restore Error', e.message, 'error');
    } finally {
      setRestoring(null);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Registry Backup Manager</h2>
          <p className="text-xs text-slate-400">Export critical Software configuration registry trees before making modification choices.</p>
        </div>
        <button
          disabled={loading}
          onClick={loadBackups}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Backup Form Card */}
        <div className="glass-panel border border-brand-border rounded-xl p-5 h-fit space-y-4">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
            <Download className="h-5 w-5 text-brand-cyan" />
            Create Registry Backup
          </h3>
          <form onSubmit={createBackup} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 block">Backup Description</label>
              <input
                type="text"
                placeholder="e.g. Before changing display driver"
                value={backupName}
                onChange={e => setBackupName(e.target.value)}
                className="w-full rounded-lg bg-slate-950/50 border border-brand-border p-3 text-xs text-slate-200 placeholder-slate-600 focus:border-brand-violet/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={backingUp}
              className="w-full py-3 bg-brand-violet hover:bg-brand-violet/85 text-xs font-black text-white rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {backingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {backingUp ? 'Exporting HKLM & HKCU...' : 'Backup Registry Now'}
            </button>
          </form>
        </div>

        {/* Backups List */}
        <div className="lg:col-span-2 glass-panel border border-brand-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
            <Upload className="h-5 w-5 text-brand-violet" />
            Registry Snapshots List
          </h3>

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-brand-violet mx-auto" />
              <p className="text-xs text-slate-500">Querying backup storage directories...</p>
            </div>
          ) : backups.length > 0 ? (
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
              {backups.map((bak, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-800 bg-slate-950/20 space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{bak.backupName}</h4>
                      <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1.5 mt-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(bak.timestamp)}
                      </p>
                    </div>
                  </div>

                  {/* Backup Files Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                    {/* HKLM */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-900">
                      <div className="min-w-0 pr-4">
                        <p className="font-bold text-slate-300">HKLM Settings</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{bak.hklmFile}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] font-bold text-slate-400">{formatBytes(bak.hklmSize)}</span>
                        <button
                          disabled={restoring !== null}
                          onClick={() => restoreFile(bak.hklmFile, bak.backupName + ' (HKLM)')}
                          className="px-2 py-1 bg-brand-cyan/20 hover:bg-brand-cyan/35 border border-brand-cyan/30 text-[10px] font-bold rounded text-brand-cyan cursor-pointer disabled:opacity-50"
                        >
                          {restoring === bak.hklmFile ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Restore'}
                        </button>
                      </div>
                    </div>

                    {/* HKCU */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-900">
                      <div className="min-w-0 pr-4">
                        <p className="font-bold text-slate-300">HKCU Settings</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{bak.hkcuFile}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] font-bold text-slate-400">{formatBytes(bak.hkcuSize)}</span>
                        <button
                          disabled={restoring !== null}
                          onClick={() => restoreFile(bak.hkcuFile, bak.backupName + ' (HKCU)')}
                          className="px-2 py-1 bg-brand-violet/20 hover:bg-brand-violet/35 border border-brand-violet/30 text-[10px] font-bold rounded text-brand-violet cursor-pointer disabled:opacity-50"
                        >
                          {restoring === bak.hkcuFile ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Restore'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-xl">
              <Database className="h-8 w-8 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 font-bold">No registry backups found in RegBackups folder.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
