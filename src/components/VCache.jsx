import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, HardDrive, Plus, Trash2, RefreshCw, Loader2, AlertTriangle, Info,
  CheckCircle2, X, Settings2, Activity, Download, Link2, Unlink, Cpu
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

function formatBytes(b) {
  if (b == null) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// --- Main ---

export default function VCache() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [status, setStatus] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [autoConfig, setAutoConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'redirects' | 'settings'

  // Form state
  const [driveLetter, setDriveLetter] = useState('R');
  const [sizeMB, setSizeMB] = useState(2048);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [statusRes, recRes, cfgRes] = await Promise.all([
          window.api.runSystemCommand('run-vcache-tool', ['get-status'], { bypassConfirmation: true }),
          window.api.runSystemCommand('run-vcache-tool', ['get-recommendations'], { bypassConfirmation: true }),
          window.api.vcacheGetAutoConfig()
        ]);
        const sObj = safeJsonParse(statusRes?.stdout);
        if (sObj?.success) setStatus(sObj.status);
        const rObj = safeJsonParse(recRes?.stdout);
        if (rObj?.success) {
          setRecommendations(rObj);
          // Auto-fill size + drive letter from recommendations + auto config
          if (rObj.recommendedSizeMB && !sizeMB) setSizeMB(rObj.recommendedSizeMB);
        }
        if (cfgRes.success) {
          setAutoConfig(cfgRes.config);
          if (cfgRes.config.defaultDriveLetter) setDriveLetter(cfgRes.config.defaultDriveLetter);
          if (cfgRes.config.lastSizeMB && !sizeMB) setSizeMB(cfgRes.config.lastSizeMB);
        }
      } else {
        // Mock
        setStatus({
          imdiskInstalled: true,
          ramdiskActive: false,
          driveLetter: null,
          redirects: []
        });
        setRecommendations({
          recommendedSizeMB: 2048,
          totalRamBytes: 16 * 1024 * 1024 * 1024,
          candidateCaches: [
            { label: 'Chrome Cache', path: 'C:\\Users\\dev\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache', exists: true }
          ]
        });
        setAutoConfig({ autoRecreateOnStartup: false, defaultDriveLetter: 'R', defaultSizeMB: 2048, crashWarningAcknowledged: false });
      }
    } catch (e) {
      addNotification('V-Cache', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleInstallImDisk = async () => {
    const ok = await confirm({
      title: 'Install ImDisk Driver',
      message: 'Download and install ImDisk (open-source, ~5MB) from the official SourceForge mirror?',
      detail: 'ImDisk is signed by Olof Lagerkvist (the author). Reboot may be required after install.',
      confirmLabel: 'Download & Install',
      danger: false
    });
    if (!ok) return;
    setBusy(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vcache-tool', ['install-imdisk']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('V-Cache', 'ImDisk installed. Reboot may be required.', 'success');
          await fetchAll();
        } else {
          addNotification('V-Cache', obj?.error || 'Install failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('V-Cache', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const ok = await confirm({
      title: 'Create RAM Disk',
      message: `Create ${sizeMB}MB RAM disk at ${driveLetter}:?`,
      detail: '⚠️ RAM disk contents are LOST on reboot/power loss/crash. Only redirect regeneratable caches (browser cache, temp files). Never store user files on it.',
      confirmLabel: 'Create RAM Disk',
      danger: false
    });
    if (!ok) return;
    setBusy(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vcache-tool',
          ['create-ramdisk', driveLetter, sizeMB]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('V-Cache', `RAM disk created at ${driveLetter}: (${sizeMB}MB).`, 'success');
          // Save last config so auto-recreate can use it
          if (window.api.vcacheSaveAutoConfig) {
            const newCfg = { ...(autoConfig || {}), lastDriveLetter: driveLetter, lastSizeMB: sizeMB };
            await window.api.vcacheSaveAutoConfig(newCfg);
          }
          await fetchAll();
        } else {
          addNotification('V-Cache', obj?.error || 'Create failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('V-Cache', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!status?.ramdiskActive) return;
    const ok = await confirm({
      title: 'Remove RAM Disk',
      message: `Remove RAM disk at ${status.driveLetter}:? All contents will be LOST.`,
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    setBusy(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vcache-tool',
          ['remove-ramdisk', status.driveLetter]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('V-Cache', 'RAM disk removed.', 'success');
          await fetchAll();
        } else {
          addNotification('V-Cache', obj?.error || 'Remove failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('V-Cache', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRedirect = async (cache) => {
    const ok = await confirm({
      title: 'Redirect Cache to RAM Disk',
      message: `Redirect "${cache.label}" to the RAM disk?`,
      detail: `Original folder backed up at "${cache.path}.solas-original". A symbolic link will replace it, pointing to the RAM disk. Contents will be LOST on reboot (they regenerate automatically).`,
      confirmLabel: 'Redirect',
      danger: false
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vcache-tool',
          ['redirect-cache', null, null, cache.path, cache.label]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('V-Cache', `"${cache.label}" redirected to RAM disk.`, 'success');
          await fetchAll();
        } else {
          addNotification('V-Cache', obj?.error || 'Redirect failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('V-Cache', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleUnredirect = async (redirect) => {
    const ok = await confirm({
      title: 'Remove Redirect',
      message: `Stop redirecting "${redirect.label}"? Original cache folder will be restored.`,
      confirmLabel: 'Unredirect',
      danger: false
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-vcache-tool',
          ['unredirect-cache', null, null, redirect.originalPath]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('V-Cache', `"${redirect.label}" unredirected.`, 'success');
          await fetchAll();
        } else {
          addNotification('V-Cache', obj?.error || 'Unredirect failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('V-Cache', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAutoConfig = async (newCfg) => {
    try {
      if (window.api) {
        const res = await window.api.vcacheSaveAutoConfig(newCfg);
        if (res.success) {
          setAutoConfig(res.config);
          addNotification('V-Cache', 'Settings saved.', 'success');
        } else {
          addNotification('V-Cache', res.error || 'Save failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('V-Cache', e.message, 'error');
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-violet" />
            Solas V-Cache
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Convert free RAM into an ultra-fast disk (~100x faster than SSD). Redirect browser caches and temp
            folders for instant load times. <strong className="text-amber-400">VOLATILE</strong>: contents lost on reboot — only redirect regeneratable caches.
          </p>
        </div>
        <button onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </header>

      {/* Crash warning */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">⚠️ Crash Data Loss Warning:</strong> RAM disk contents are stored
          in volatile RAM. If your PC crashes, loses power, or reboots, ALL data on the RAM disk is permanently
          lost. SolasCare only redirects <strong>regeneratable caches</strong> (browser cache, temp files, shader
          cache) — never user files. Browsers automatically rebuild their caches, so the impact is minimal.
        </div>
      </div>

      {showOutput && <CommandOutput channel="care-out" height="120px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'overview', label: 'Overview', icon: HardDrive },
          { id: 'redirects', label: 'Cache Redirects', icon: Link2 },
          { id: 'settings', label: 'Settings', icon: Settings2 }
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
          <p className="text-xs text-slate-400">Loading V-Cache status...</p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && status && (
            <div className="space-y-4">
              {/* ImDisk status */}
              {!status.imdiskInstalled ? (
                <div className="glass-panel border border-amber-500/30 rounded-xl p-4 bg-amber-500/5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-sm font-bold text-slate-200">ImDisk driver not installed</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Required to create RAM disks. ~5MB download from official SourceForge.</div>
                      </div>
                    </div>
                    <button onClick={handleInstallImDisk} disabled={busy}
                      className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Install ImDisk
                    </button>
                  </div>
                </div>
              ) : (
                <div className="glass-panel border border-emerald-500/30 rounded-xl p-3 bg-emerald-500/5 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs text-slate-300">ImDisk driver installed</span>
                </div>
              )}

              {/* RAM disk status */}
              {status.ramdiskActive ? (
                <div className="glass-panel border border-emerald-500/30 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">RAM Disk Active</div>
                      <div className="text-3xl font-black text-emerald-400 mt-1">{status.driveLetter}:</div>
                    </div>
                    <button onClick={handleRemove} disabled={busy}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Total" value={formatBytes(status.sizeBytes)} />
                    <StatCard label="Used" value={formatBytes(status.usedBytes)} />
                    <StatCard label="Free" value={formatBytes(status.freeBytes)} />
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
                    <div className="h-full bg-brand-violet transition-all"
                      style={{ width: `${status.sizeBytes ? (status.usedBytes / status.sizeBytes) * 100 : 0}%` }}></div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {status.redirects?.length || 0} cache redirect(s) active
                  </div>
                </div>
              ) : (
                <div className="glass-panel border border-brand-border rounded-xl p-5">
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-3">Create New RAM Disk</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Drive Letter</label>
                      <select value={driveLetter} onChange={e => setDriveLetter(e.target.value)}
                        className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200">
                        {['D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
                          .map(l => <option key={l} value={l}>{l}:</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Size (MB)</label>
                      <input type="number" value={sizeMB} onChange={e => setSizeMB(parseInt(e.target.value) || 0)}
                        min="100" max="32768"
                        className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200" />
                    </div>
                  </div>
                  {recommendations?.recommendedSizeMB && (
                    <div className="text-[10px] text-brand-cyan mb-3 flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Recommended: {recommendations.recommendedSizeMB}MB (25% of {formatBytes(recommendations.totalRamBytes)} system RAM)
                    </div>
                  )}
                  <div className="flex gap-1 mb-3">
                    {[512, 1024, 2048, 4096, 8192].map(s => (
                      <button key={s} onClick={() => setSizeMB(s)}
                        className={`text-[10px] font-bold px-2 py-1 rounded border cursor-pointer ${
                          sizeMB === s ? 'bg-brand-violet/20 border-brand-violet text-white' : 'bg-slate-800 border-brand-border text-slate-400'
                        }`}>
                        {s < 1024 ? `${s}MB` : `${s/1024}GB`}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleCreate} disabled={busy || !status.imdiskInstalled}
                    className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Create RAM Disk
                  </button>
                </div>
              )}

              {/* Speed comparison */}
              <div className="glass-panel border border-brand-border rounded-xl p-4">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-brand-cyan" /> Speed Comparison
                </h3>
                <div className="space-y-2">
                  <SpeedBar label="HDD" speed={120} unit="MB/s" color="slate" />
                  <SpeedBar label="SATA SSD" speed={550} unit="MB/s" color="cyan" />
                  <SpeedBar label="NVMe SSD" speed={3500} unit="MB/s" color="violet" />
                  <SpeedBar label="RAM Disk (V-Cache)" speed={50000} unit="MB/s" color="emerald" highlight />
                </div>
                <p className="text-[10px] text-slate-500 mt-3">
                  RAM disk is ~100x faster than SATA SSD. Browser cache hits become near-instant.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'redirects' && (
            <div className="space-y-3">
              {!status?.ramdiskActive && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>Create a RAM disk first (Overview tab) before redirecting caches.</span>
                </div>
              )}

              {/* Active redirects */}
              {status?.redirects && status.redirects.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-300 mb-2">Active Redirects</h3>
                  <div className="space-y-2">
                    {status.redirects.map((r, i) => (
                      <div key={i} className="glass-panel border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between gap-3 bg-emerald-500/5">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-200">{r.label}</div>
                          <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{r.originalPath}</div>
                          <div className="text-[10px] text-emerald-400 mt-0.5">→ {r.targetPath}</div>
                        </div>
                        <button onClick={() => handleUnredirect(r)} disabled={busy}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer shrink-0">
                          <Unlink className="h-3 w-3" /> Unredirect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Candidate caches */}
              {recommendations?.candidateCaches && recommendations.candidateCaches.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-300 mb-2 mt-4">Available Caches to Redirect</h3>
                  <div className="space-y-2">
                    {recommendations.candidateCaches.map((c, i) => {
                      const alreadyRedirected = status?.redirects?.some(r => r.originalPath === c.path);
                      return (
                        <div key={i} className="glass-panel border border-brand-border rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-200">{c.label}</div>
                            <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{c.path}</div>
                          </div>
                          {alreadyRedirected ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                              REDIRECTED
                            </span>
                          ) : (
                            <button onClick={() => handleRedirect(c)} disabled={busy || !status?.ramdiskActive}
                              className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer shrink-0">
                              <Link2 className="h-3 w-3" /> Redirect
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && autoConfig && (
            <SettingsPanel autoConfig={autoConfig} onSave={handleSaveAutoConfig}
              driveLetter={driveLetter} sizeMB={sizeMB}
              setDriveLetter={setDriveLetter} setSizeMB={setSizeMB} />
          )}
        </>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-900/40 border border-brand-border rounded-lg p-3 text-center">
      <div className="text-[10px] text-slate-500 uppercase">{label}</div>
      <div className="text-sm font-bold text-slate-200 mt-1">{value}</div>
    </div>
  );
}

function SpeedBar({ label, speed, unit, color, highlight }) {
  const maxSpeed = 50000;
  const widthPct = Math.min(100, (speed / maxSpeed) * 100);
  const colorClass = {
    slate: 'bg-slate-600',
    cyan: 'bg-brand-cyan',
    violet: 'bg-brand-violet',
    emerald: 'bg-emerald-500'
  }[color];
  return (
    <div className={`flex items-center gap-3 ${highlight ? 'font-bold' : ''}`}>
      <div className={`w-32 text-xs ${highlight ? 'text-emerald-400' : 'text-slate-400'}`}>{label}</div>
      <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass} ${highlight ? 'animate-pulse' : ''}`} style={{ width: `${widthPct}%` }}></div>
      </div>
      <div className={`w-24 text-xs text-right ${highlight ? 'text-emerald-400' : 'text-slate-400'}`}>{speed.toLocaleString()} {unit}</div>
    </div>
  );
}

function SettingsPanel({ autoConfig, onSave, driveLetter, sizeMB, setDriveLetter, setSizeMB }) {
  const [autoRecreate, setAutoRecreate] = useState(autoConfig.autoRecreateOnStartup);
  const [acknowledged, setAcknowledged] = useState(autoConfig.crashWarningAcknowledged);

  const handleSave = () => {
    onSave({
      ...autoConfig,
      autoRecreateOnStartup: autoRecreate,
      crashWarningAcknowledged: acknowledged,
      defaultDriveLetter: driveLetter,
      defaultSizeMB: sizeMB
    });
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand-violet" /> Auto-Recreate Settings
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default Drive Letter</label>
            <select value={driveLetter} onChange={e => setDriveLetter(e.target.value)}
              className="bg-slate-900 border border-brand-border rounded px-3 py-1.5 text-xs text-slate-200">
              {['D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
                .map(l => <option key={l} value={l}>{l}:</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Default Size (MB)</label>
            <input type="number" value={sizeMB} onChange={e => setSizeMB(parseInt(e.target.value) || 0)}
              min="100" max="32768"
              className="bg-slate-900 border border-brand-border rounded px-3 py-1.5 text-xs text-slate-200" />
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-brand-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-200">Auto-Recreate on Startup</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Recreate RAM disk automatically when SolasCare starts.</div>
            </div>
            <button onClick={() => setAutoRecreate(s => !s)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                autoRecreate ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-brand-border text-slate-500'
              }`}>
              {autoRecreate ? 'ON' : 'OFF'}
            </button>
          </div>

          {autoRecreate && (
            <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-amber-300">Acknowledge Crash Risk</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">I understand RAM disk contents are lost on reboot/crash.</div>
                </div>
              </div>
              <button onClick={() => setAcknowledged(s => !s)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                  acknowledged ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-slate-900 border-brand-border text-slate-500'
                }`}>
                {acknowledged ? '✓ ACKNOWLEDGED' : 'ACKNOWLEDGE'}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-brand-border">
          <button onClick={handleSave}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <CheckCircle2 className="h-3.5 w-3.5" /> Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
