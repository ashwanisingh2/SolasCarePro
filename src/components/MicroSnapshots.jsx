import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, History, Plus, Trash2, RotateCcw, Loader2, RefreshCw, HardDrive,
  AlertTriangle, Info, CheckCircle2, Settings2, X, Database, Zap, Power
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

// --- Helpers ---

function safeJsonParse(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch (_) { return null; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch (_) { return iso; }
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const REASON_LABELS = {
  manual: 'Manual',
  'pre-install': 'Pre-Install',
  'pre-tweak': 'Pre-Tweak',
  'pre-uninstall': 'Pre-Uninstall',
  scheduled: 'Scheduled'
};

// --- Main ---

export default function MicroSnapshots() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [snapshots, setSnapshots] = useState([]);
  const [diskUsage, setDiskUsage] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('timeline'); // 'timeline' | 'retention'
  const [showCreate, setShowCreate] = useState(false);
  const [srEnabled, setSrEnabled] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [listRes, diskRes, settingsRes] = await Promise.all([
          window.api.runSystemCommand('run-snapshot-tool', ['list-snapshots'], { bypassConfirmation: true }),
          window.api.runSystemCommand('run-snapshot-tool', ['get-disk-usage'], { bypassConfirmation: true }),
          window.api.snapshotGetSettings()
        ]);
        const listObj = safeJsonParse(listRes?.stdout);
        if (listObj?.success) {
          setSnapshots(listObj.snapshots || []);
          setSrEnabled(listObj.systemRestoreEnabled);
        }
        const diskObj = safeJsonParse(diskRes?.stdout);
        if (diskObj?.success) setDiskUsage(diskObj.disk);
        if (settingsRes.success) setSettings(settingsRes.settings);
      } else {
        setSnapshots([
          { sequenceNumber: 123, createdIso: '2026-01-08T14:30:00Z', description: 'Before Chrome install', triggerReason: 'pre-install' },
          { sequenceNumber: 122, createdIso: '2026-01-08T09:15:00Z', description: 'Morning backup', triggerReason: 'manual' }
        ]);
        setDiskUsage({ systemDrive: 'C:', totalBytes: 512e9, freeBytes: 256e9, usedBytes: 256e9, usedPercent: 50, srAllocatedBytes: 5e9, srUsedBytes: 2e9 });
        setSettings({ maxSnapshots: 10, maxAgeDays: 30, diskSpaceThresholdPct: 85, autoCleanupEnabled: true });
      }
    } catch (e) {
      addNotification('Snapshots', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async (description, reason) => {
    setCreating(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-snapshot-tool',
          ['create-snapshot', null, description || '', reason || 'manual']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Snapshots',
            `Snapshot created (seq: ${obj.sequenceNumber}). Note: restore requires reboot.`,
            'success');
          // Append to history
          await window.api.snapshotAppendHistory({
            ts: new Date().toISOString(),
            seqNum: obj.sequenceNumber,
            description,
            triggerReason: reason
          });
          await fetchAll();
          setShowCreate(false);
        } else {
          addNotification('Snapshots', obj?.error || 'Create failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Snapshots', e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = async (snap) => {
    const ok = await confirm({
      title: 'Restore Snapshot',
      message: `Restore to "${snap.description || formatDateTime(snap.createdIso)}"?`,
      detail: `⚠️ This will REBOOT your PC. System state (registry, drivers, services) will revert to ${formatDateTime(snap.createdIso)}. User files (Documents/Desktop/Downloads) are NOT affected.`,
      confirmLabel: 'Restore + Reboot',
      danger: true
    });
    if (!ok) return;
    setRestoring(snap.sequenceNumber);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-snapshot-tool',
          ['restore-snapshot', String(snap.sequenceNumber)]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Snapshots',
            'Restore initiated. Reboot your PC now to complete.',
            'warning');
          // Prompt user to reboot
          const rebootOk = await confirm({
            title: 'Reboot Now?',
            message: 'System Restore is scheduled. Reboot now to apply?',
            confirmLabel: 'Reboot Now',
            cancelLabel: 'Later',
            danger: true
          });
          if (rebootOk && window.api) {
            // We don't have a direct reboot IPC; user can reboot manually
            addNotification('Snapshots',
              'Please reboot your PC manually to complete the restore.',
              'info');
          }
        } else {
          addNotification('Snapshots', obj?.error || 'Restore failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Snapshots', e.message, 'error');
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (snap) => {
    const ok = await confirm({
      title: 'Delete Snapshot',
      message: `Delete snapshot "${snap.description || formatDateTime(snap.createdIso)}"? This frees up disk space but you can't restore to this point.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    setDeleting(snap.sequenceNumber);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-snapshot-tool',
          ['delete-snapshot', String(snap.sequenceNumber)]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Snapshots', 'Snapshot deleted.', 'success');
          await fetchAll();
        } else {
          addNotification('Snapshots', obj?.error || 'Delete failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Snapshots', e.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleEnableSR = async () => {
    const ok = await confirm({
      title: 'Enable System Restore',
      message: 'System Restore is disabled. Enable it on the system drive? Required for snapshots.',
      confirmLabel: 'Enable',
      danger: false
    });
    if (!ok) return;
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-snapshot-tool', ['enable-system-restore']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Snapshots', 'System Restore enabled.', 'success');
          await fetchAll();
        }
      }
    } catch (e) {
      addNotification('Snapshots', e.message, 'error');
    }
  };

  const handleSaveSettings = async (newSettings) => {
    try {
      if (window.api) {
        const res = await window.api.snapshotSaveSettings(newSettings);
        if (res.success) {
          setSettings(res.settings);
          addNotification('Snapshots', 'Retention settings saved.', 'success');
        } else {
          addNotification('Snapshots', res.error || 'Save failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Snapshots', e.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <History className="h-5 w-5 text-brand-violet" />
            Micro-Snapshots
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Time-travel for your PC. SolasCare auto-creates System Restore points before risky operations
            (installs, tweaks). Restore any snapshot — your files stay safe, only system state reverts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> New Snapshot
          </button>
          <button onClick={() => setShowOutput(s => !s)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
            <RefreshCw className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
          </button>
        </div>
      </header>

      {/* SR disabled banner */}
      {!srEnabled && (
        <div className="glass-panel border border-rose-500/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap bg-rose-500/5">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <div>
              <div className="text-sm font-bold text-slate-200">
                System Restore is <span className="text-rose-400">DISABLED</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Snapshots cannot be created until System Restore is enabled on the system drive.</div>
            </div>
          </div>
          <button onClick={handleEnableSR}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <Power className="h-3.5 w-3.5" /> Enable System Restore
          </button>
        </div>
      )}

      {/* Disk usage summary */}
      {diskUsage && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <DiskCard label="System Drive" drive={diskUsage.systemDrive}
            used={diskUsage.usedBytes} total={diskUsage.totalBytes}
            percent={diskUsage.usedPercent} icon={HardDrive} />
          <DiskCard label="SR Allocated" drive="System Restore"
            used={diskUsage.srUsedBytes} total={diskUsage.srAllocatedBytes}
            percent={diskUsage.srAllocatedBytes ? (diskUsage.srUsedBytes / diskUsage.srAllocatedBytes * 100) : 0}
            icon={Database} />
          <DiskCard label="Snapshots Stored" drive="Count"
            used={snapshots.length} total={settings?.maxSnapshots || 10}
            percent={(snapshots.length / (settings?.maxSnapshots || 10)) * 100}
            icon={Clock} isCount={true} />
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="160px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'timeline', label: 'Timeline', icon: Clock },
          { id: 'retention', label: 'Retention Policy', icon: Settings2 }
        ].map(t => {
          const Icon = t.icon;
          const isA = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 -mb-px cursor-pointer transition-colors ${
                isA ? 'border-brand-violet text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-xs text-slate-400">Loading snapshots...</p>
        </div>
      ) : (
        <>
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              {snapshots.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 mb-1">No snapshots yet.</p>
                  <p className="text-xs text-slate-500">Create a snapshot manually, or trigger one by installing software / applying tweaks.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-4 top-2 bottom-2 w-px bg-brand-border"></div>
                  <div className="space-y-3">
                    {snapshots.map(snap => (
                      <SnapshotRow key={snap.sequenceNumber} snap={snap}
                        isBusy={restoring === snap.sequenceNumber || deleting === snap.sequenceNumber}
                        isRestoring={restoring === snap.sequenceNumber}
                        isDeleting={deleting === snap.sequenceNumber}
                        onRestore={() => handleRestore(snap)}
                        onDelete={() => handleDelete(snap)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'retention' && settings && (
            <RetentionPanel settings={settings} onSave={handleSaveSettings} />
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateSnapshotModal onCreate={handleCreate} onCancel={() => setShowCreate(false)} isCreating={creating} />
      )}
    </div>
  );
}

// --- Disk Card ---

function DiskCard({ label, drive, used, total, percent, icon: Icon, isCount = false }) {
  const pct = Math.min(100, Math.max(0, percent || 0));
  const color = pct >= 90 ? 'text-rose-400' : pct >= 75 ? 'text-amber-400' : 'text-emerald-400';
  const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="glass-panel border border-brand-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-slate-500 uppercase font-bold">{label}</span>
        <Icon className="h-3.5 w-3.5 text-slate-500" />
      </div>
      <div className={`text-lg font-black ${color}`}>
        {isCount ? `${used}/${total}` : `${formatBytes(used)} / ${formatBytes(total)}`}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 mb-2">{drive} · {pct.toFixed(1)}% used</div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }}></div>
      </div>
    </div>
  );
}

// --- Snapshot Row (Timeline) ---

function SnapshotRow({ snap, isBusy, isRestoring, isDeleting, onRestore, onDelete }) {
  const reasonLabel = REASON_LABELS[snap.triggerReason] || snap.triggerReason || 'Manual';
  return (
    <div className="relative pl-10 pb-3">
      {/* Timeline dot */}
      <div className="absolute left-3 top-3 w-3 h-3 rounded-full bg-brand-violet ring-4 ring-brand-navy"></div>

      <div className={`glass-panel border rounded-xl p-3 transition-all ${
        isRestoring ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-brand-border'
      }`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-200">
                {snap.description || 'No description'}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-violet/10 border border-brand-violet/30 text-brand-violet">
                {reasonLabel}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">#{snap.sequenceNumber}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{formatDateTime(snap.createdIso)}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onRestore} disabled={isBusy}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
              {isRestoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Restore
            </button>
            <button onClick={onDelete} disabled={isBusy}
              className="px-2 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded cursor-pointer disabled:opacity-50"
              title="Delete snapshot">
              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Create Modal ---

function CreateSnapshotModal({ onCreate, onCancel, isCreating }) {
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('manual');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass-panel border border-brand-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand-violet" /> Create Snapshot
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Description (optional)</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} maxLength={500}
              placeholder="e.g. Before installing Adobe Acrobat"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
            <p className="text-[10px] text-slate-500 mt-1">Helps you identify the snapshot later in the timeline.</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Trigger Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200">
              <option value="manual">Manual</option>
              <option value="pre-install">Pre-Install (before software install)</option>
              <option value="pre-tweak">Pre-Tweak (before registry change)</option>
              <option value="pre-uninstall">Pre-Uninstall</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>

          <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-2 text-[10px] text-slate-300 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-brand-cyan shrink-0 mt-0.5" />
            <span>Snapshot uses Windows System Restore API. Restore requires a reboot. User files are not affected.</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-brand-border">
          <button onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:bg-slate-800/60 cursor-pointer">
            Cancel
          </button>
          <button onClick={() => onCreate(description, reason)} disabled={isCreating}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {isCreating ? 'Creating...' : 'Create Snapshot'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Retention Panel ---

function RetentionPanel({ settings, onSave }) {
  const [maxSnapshots, setMaxSnapshots] = useState(settings.maxSnapshots);
  const [maxAgeDays, setMaxAgeDays] = useState(settings.maxAgeDays);
  const [diskSpaceThresholdPct, setDiskSpaceThresholdPct] = useState(settings.diskSpaceThresholdPct);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = useState(settings.autoCleanupEnabled);

  const handleSave = () => {
    onSave({ maxSnapshots, maxAgeDays, diskSpaceThresholdPct, autoCleanupEnabled });
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand-violet" /> Retention Policy
        </h3>

        <div className="space-y-3">
          <SliderRow label="Max Snapshots"
            description="Maximum number of snapshots to keep (oldest deleted beyond this)"
            value={maxSnapshots} min={1} max={100} onChange={setMaxSnapshots} unit="snapshots" />

          <SliderRow label="Max Age (days)"
            description="Snapshots older than this are auto-deleted"
            value={maxAgeDays} min={1} max={365} onChange={setMaxAgeDays} unit="days" />

          <SliderRow label="Disk Space Threshold"
            description="When system drive usage exceeds this %, oldest snapshots are deleted to free space"
            value={diskSpaceThresholdPct} min={50} max={99} onChange={setDiskSpaceThresholdPct} unit="%" />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-brand-border/50">
          <div>
            <div className="text-xs font-bold text-slate-200">Auto-Cleanup Enabled</div>
            <div className="text-[10px] text-slate-500 mt-0.5">When ON, SolasCare checks retention every 10 minutes and auto-deletes expired snapshots.</div>
          </div>
          <button onClick={() => setAutoCleanupEnabled(s => !s)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
              autoCleanupEnabled ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-brand-border text-slate-500'
            }`}>
            {autoCleanupEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="flex justify-end pt-3 border-t border-brand-border">
          <button onClick={handleSave}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <CheckCircle2 className="h-3.5 w-3.5" /> Save Settings
          </button>
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">Disk Space Guard:</strong> If your system drive is over {diskSpaceThresholdPct}% full,
          SolasCare will auto-delete the oldest snapshots until usage drops below the threshold. This prevents
          snapshots from filling up the disk and crashing Windows.
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, description, value, min, max, onChange, unit }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-slate-300">{label}</label>
        <span className="text-sm font-black text-brand-violet">{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-brand-violet cursor-pointer" />
      <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>
    </div>
  );
}
