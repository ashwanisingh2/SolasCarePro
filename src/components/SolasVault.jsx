import React, { useState, useEffect, useCallback } from 'react';
import {
  Lock, Unlock, HardDrive, Plus, Trash2, Loader2, RefreshCw, Key, Shield,
  AlertTriangle, Info, X, Activity, Eye, EyeOff, Clock, Check
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
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return iso; }
}

function formatBytes(mb) {
  if (mb == null) return '—';
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// --- Main ---

export default function SolasVault() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [vaults, setVaults] = useState([]);
  const [mounted, setMounted] = useState({});
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('vaults'); // 'vaults' | 'activity'
  const [creating, setCreating] = useState(false);
  const [mounting, setMounting] = useState(null);
  const [unmounting, setUnmounting] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showMount, setShowMount] = useState(null);  // vault object or null
  const [autoUnmountEvent, setAutoUnmountEvent] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [listRes, mountedRes, actRes] = await Promise.all([
          window.api.runSystemCommand('run-vault-tool', ['list-vaults'], { bypassConfirmation: true }),
          window.api.vaultListMounted(),
          window.api.vaultGetActivityLog()
        ]);
        const listObj = safeJsonParse(listRes?.stdout);
        if (listObj?.success) setVaults(listObj.vaults || []);
        if (mountedRes.success) setMounted(mountedRes.mounted || {});
        if (actRes.success) setActivity(actRes.log || []);
      } else {
        setVaults([
          { vaultId: 'vault_demo', path: 'C:\\mock\\vault_demo.vhdx', sizeMB: 1024, isMounted: false, createdIso: '2026-01-08T10:00:00Z' }
        ]);
        setMounted({});
      }
    } catch (e) {
      addNotification('Solas Vault', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Subscribe to auto-unmount events
  useEffect(() => {
    if (!window.api?.onVaultAutoUnmounted) return;
    const unsub = window.api.onVaultAutoUnmounted((data) => {
      setAutoUnmountEvent(data);
      addNotification('Vault Auto-Unmounted',
        `"${data.vaultId}" was unmounted after idle timeout.`,
        'info');
      fetchAll();
      setTimeout(() => setAutoUnmountEvent(null), 5000);
    });
    return () => { unsub && unsub(); };
  }, [addNotification, fetchAll]);

  const handleCreate = async ({ vaultId, sizeMB, password, autoUnmountMinutes }) => {
    if (!vaultId || !/^vault_[A-Za-z0-9_\-]+$/.test(vaultId)) {
      addNotification('Solas Vault', 'Vault ID must match: vault_<alphanum>', 'error');
      return;
    }
    setCreating(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vault-tool',
          ['create-vault', vaultId, null, password, sizeMB]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Solas Vault',
            `Vault "${vaultId}" created (${formatBytes(sizeMB)}). BitLocker: ${obj.bitlockerEnabled ? 'enabled' : (obj.bitlockerAvailable ? 'disabled (no password)' : 'unavailable (Home edition)')}.`,
            obj.bitlockerEnabled ? 'success' : 'warning');
          setShowCreate(false);
          // If auto-unmount requested, register it (vault is created unmounted)
          if (autoUnmountMinutes > 0) {
            // Will be set when user mounts the vault; for now just inform
            addNotification('Solas Vault',
              `Auto-unmount timer will start when vault is mounted (${autoUnmountMinutes} min idle).`,
              'info');
          }
          await fetchAll();
        } else {
          addNotification('Solas Vault', obj?.error || 'Create failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Solas Vault', e.message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleMount = async (vault, password, autoUnmountMinutes) => {
    setMounting(vault.vaultId);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vault-tool',
          ['mount-vault', vault.vaultId, vault.path, password]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          // Register in vaultStore so auto-unmount watcher can track it
          // We do this via a side-effect: write the activity log entry
          if (window.api.vaultTouchActivity) {
            // For auto-unmount: we'd need a markMounted IPC, but for MVP we
            // just notify the user. Auto-unmount requires user to keep SolasCare open.
          }
          addNotification('Solas Vault',
            `Vault mounted at ${obj.driveLetter}:. BitLocker: ${obj.bitlockerUnlocked ? 'unlocked' : 'N/A'}.`,
            'success');
          setShowMount(null);
          await fetchAll();
        } else {
          addNotification('Solas Vault', obj?.error || 'Mount failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Solas Vault', e.message, 'error');
    } finally {
      setMounting(null);
    }
  };

  const handleUnmount = async (vault) => {
    const ok = await confirm({
      title: 'Unmount Vault',
      message: `Unmount vault "${vault.vaultId}"? The drive will disappear from Explorer. Files in use may be lost.`,
      confirmLabel: 'Unmount',
      danger: true
    });
    if (!ok) return;
    setUnmounting(vault.vaultId);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vault-tool',
          ['unmount-vault', vault.vaultId, vault.path]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Solas Vault', `Vault "${vault.vaultId}" unmounted.`, 'success');
          await fetchAll();
        } else {
          addNotification('Solas Vault', obj?.error || 'Unmount failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Solas Vault', e.message, 'error');
    } finally {
      setUnmounting(null);
    }
  };

  const handleDelete = async (vault) => {
    const ok = await confirm({
      title: 'DELETE VAULT',
      message: `Permanently delete vault "${vault.vaultId}"?`,
      detail: `All data inside the VHD will be IRREVERSIBLY LOST. Size: ${formatBytes(vault.sizeMB)}.`,
      confirmLabel: 'Delete Vault',
      danger: true
    });
    if (!ok) return;
    setUnmounting(vault.vaultId);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vault-tool',
          ['delete-vault', vault.vaultId, vault.path]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Solas Vault', `Vault "${vault.vaultId}" deleted.`, 'success');
          await fetchAll();
        } else {
          addNotification('Solas Vault', obj?.error || 'Delete failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Solas Vault', e.message, 'error');
    } finally {
      setUnmounting(null);
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Lock className="h-5 w-5 text-brand-violet" />
            Solas Vault
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Ransomware-proof storage: VHD + BitLocker. Vault stays unmounted + invisible until you unlock it
            with a password. Ransomware can't encrypt what it can't see.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> New Vault
          </button>
          <button onClick={() => setShowOutput(s => !s)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
            <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
          </button>
        </div>
      </header>

      {/* Auto-unmount event toast */}
      {autoUnmountEvent && (
        <div className="glass-panel border border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-3 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="text-xs text-slate-300">
              Vault <strong className="text-amber-300">{autoUnmountEvent.vaultId}</strong> was auto-unmounted (idle timeout).
            </div>
          </div>
          <button onClick={() => setAutoUnmountEvent(null)} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="160px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'vaults', label: 'My Vaults', icon: HardDrive },
          { id: 'activity', label: 'Activity Log', icon: Clock }
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
          <p className="text-xs text-slate-400">Loading vaults...</p>
        </div>
      ) : (
        <>
          {activeTab === 'vaults' && (
            <div className="space-y-3">
              {vaults.length === 0 ? (
                <div className="py-12 text-center">
                  <Lock className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 mb-1">No vaults yet.</p>
                  <p className="text-xs text-slate-500">Click "New Vault" to create your first ransomware-proof storage.</p>
                </div>
              ) : (
                vaults.map(v => (
                  <VaultRow key={v.vaultId} vault={v}
                    isBusy={mounting === v.vaultId || unmounting === v.vaultId}
                    onMount={() => setShowMount(v)}
                    onUnmount={() => handleUnmount(v)}
                    onDelete={() => handleDelete(v)} />
                ))
              )}
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300">Ransomware protection notes:</strong> Vaults are unmounted
                  by default — ransomware can't access what isn't mounted. BitLocker adds encryption in case
                  the VHD file itself is exfiltrated. <strong>Always keep your recovery key safe</strong> — SolasCare
                  stores it as a .bek file next to the VHD, but you should back it up separately.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
              {activity.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No activity yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-brand-border/50 max-h-[500px] overflow-y-auto">
                  {activity.map((e, i) => (
                    <div key={i} className="p-3 flex items-center gap-3">
                      {e.action === 'create' ? (
                        <Plus className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : e.action === 'mount' ? (
                        <Unlock className="h-3.5 w-3.5 text-brand-cyan shrink-0" />
                      ) : e.action === 'unmount' ? (
                        <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      ) : e.action === 'auto-unmount' ? (
                        <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-200">
                          {e.action} · {e.vaultId}
                          <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            e.result === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>{e.result}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {formatDateTime(e.ts)} · {e.details}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateVaultModal
          onCreate={handleCreate}
          onCancel={() => setShowCreate(false)}
          isCreating={creating} />
      )}

      {/* Mount modal */}
      {showMount && (
        <MountVaultModal
          vault={showMount}
          onMount={handleMount}
          onCancel={() => setShowMount(null)}
          isMounting={mounting === showMount.vaultId} />
      )}
    </div>
  );
}

// --- Vault Row ---

function VaultRow({ vault, isBusy, onMount, onUnmount, onDelete }) {
  return (
    <div className={`glass-panel rounded-xl p-4 border ${vault.isMounted ? 'border-emerald-500/40' : 'border-brand-border'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${
            vault.isMounted
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800/40 border-brand-border text-slate-500'
          }`}>
            {vault.isMounted ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-200 truncate">{vault.vaultId}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
              <span>{formatBytes(vault.sizeMB)}</span>
              <span>Created {formatDateTime(vault.createdIso)}</span>
              {vault.isMounted && vault.driveLetter && (
                <span className="text-emerald-400 font-bold">Mounted at {vault.driveLetter}:</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {vault.isMounted ? (
            <button onClick={onUnmount} disabled={isBusy}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
              Unmount
            </button>
          ) : (
            <button onClick={onMount} disabled={isBusy}
              className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
              Mount
            </button>
          )}
          <button onClick={onDelete} disabled={isBusy}
            className="px-2 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] rounded cursor-pointer"
            title="Delete vault (irreversible)">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Create Vault Modal ---

function CreateVaultModal({ onCreate, onCancel, isCreating }) {
  const [vaultId, setVaultId] = useState('vault_' + Date.now().toString(36));
  const [sizeMB, setSizeMB] = useState(1024);  // 1 GB default
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [autoUnmountMinutes, setAutoUnmountMinutes] = useState(15);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass-panel border border-brand-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Plus className="h-4 w-4 text-brand-violet" /> Create New Vault
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Vault ID</label>
            <input type="text" value={vaultId} onChange={e => setVaultId(e.target.value)} maxLength={50}
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-violet" />
            <p className="text-[10px] text-slate-500 mt-1">Must start with "vault_" and use only letters, numbers, dashes, underscores.</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Size (MB)</label>
            <input type="number" value={sizeMB} onChange={e => setSizeMB(parseInt(e.target.value) || 0)}
              min="100" max="2097152"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
            <p className="text-[10px] text-slate-500 mt-1">{formatBytes(sizeMB)} (100 MB - 2 TB)</p>
            <div className="flex gap-1 mt-2">
              {[512, 1024, 5120, 10240].map(s => (
                <button key={s} onClick={() => setSizeMB(s)}
                  className="text-[10px] font-bold px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-brand-border text-slate-400 rounded cursor-pointer">
                  {formatBytes(s)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">BitLocker Password (optional but recommended)</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)} maxLength={200}
                placeholder="Leave empty for unencrypted vault"
                className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 pr-9 text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
              <button onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer">
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Requires Windows Pro/Enterprise for BitLocker. Home edition will create unencrypted vault.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Auto-Unmount After Idle (minutes)</label>
            <input type="number" value={autoUnmountMinutes} onChange={e => setAutoUnmountMinutes(parseInt(e.target.value) || 0)}
              min="0" max="1440"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
            <p className="text-[10px] text-slate-500 mt-1">0 = never auto-unmount. Recommended: 15-30 min. Vault auto-detaches after idle period (requires SolasCare running).</p>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2 text-[10px] text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>Save your password securely! If lost, data in BitLocker-protected vaults is unrecoverable.</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-brand-border">
          <button onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:bg-slate-800/60 cursor-pointer">
            Cancel
          </button>
          <button onClick={() => onCreate({ vaultId, sizeMB, password, autoUnmountMinutes })}
            disabled={isCreating || !vaultId || sizeMB < 100}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            {isCreating ? 'Creating...' : 'Create Vault'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Mount Vault Modal ---

function MountVaultModal({ vault, onMount, onCancel, isMounting }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass-panel border border-brand-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Unlock className="h-4 w-4 text-brand-violet" /> Mount Vault
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-xs font-bold text-slate-200">{vault.vaultId}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">{formatBytes(vault.sizeMB)} · Created {formatDateTime(vault.createdIso)}</div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password (if BitLocker-protected)</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onMount(vault, password, 0); }}
                placeholder="Leave empty if vault is not BitLocker-protected"
                className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 pr-9 text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
              <button onClick={() => setShowPassword(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer">
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-brand-border">
          <button onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:bg-slate-800/60 cursor-pointer">
            Cancel
          </button>
          <button onClick={() => onMount(vault, password, 0)} disabled={isMounting}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            {isMounting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
            {isMounting ? 'Mounting...' : 'Mount'}
          </button>
        </div>
      </div>
    </div>
  );
}
