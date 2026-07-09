import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Zap, Shield, Gamepad2, List, Sparkles, ChevronRight, ChevronDown, Loader2,
  Check, Undo2, AlertTriangle, Package, Download, Upload, Trash2, Clock,
  ShieldCheck, Info, X, Plus
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

// --- Constants ---

const CATEGORY_META = {
  speed:   { label: 'Speed',   icon: Zap,      color: 'cyan' },
  privacy: { label: 'Privacy', icon: Shield,   color: 'violet' },
  gaming:  { label: 'Gaming',  icon: Gamepad2, color: 'rose' },
  ui:      { label: 'UI',      icon: List,     color: 'amber' }
};

const RISK_META = {
  low:    { label: 'Low',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  medium: { label: 'Medium', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  high:   { label: 'High',   color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' }
};

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

// --- Main Component ---

export default function GodModeTweaker() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [catalog, setCatalog] = useState([]);
  const [curatedBundles, setCuratedBundles] = useState([]);
  const [customBundles, setCustomBundles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [busy, setBusy] = useState({});  // tweakId -> 'applying' | 'undoing' | null
  const [bundleBusy, setBundleBusy] = useState({});  // bundleId -> 'applying' | 'undoing'
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('tweaks');  // 'tweaks' | 'bundles' | 'history'

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [catRes, bunRes, histRes] = await Promise.all([
          window.api.tweakerGetCatalog(),
          window.api.tweakerGetBundles(),
          window.api.tweakerListHistory()
        ]);
        if (catRes.success) setCatalog(catRes.catalog || []);
        if (bunRes.success) {
          setCuratedBundles(bunRes.curated || []);
          setCustomBundles(bunRes.custom || []);
        }
        if (histRes.success) setHistory(histRes.history || []);
      } else {
        setCatalog([
          { id: 'disable-telemetry', name: 'Disable Telemetry', description: 'Stops Windows telemetry', risk: 'low', category: 'privacy', regKey: 'HKLM:\\...', valueName: 'AllowTelemetry', valueType: 'REG_DWORD', valueData: '0', bundles: ['speed','privacy'] },
          { id: 'fast-menu-show', name: 'Instant Menu Show', description: '0ms menu delay', risk: 'low', category: 'speed', regKey: 'HKCU:\\...', valueName: 'MenuShowDelay', valueType: 'REG_SZ', valueData: '0', bundles: ['speed'] }
        ]);
        setCuratedBundles([
          { id: 'speed', name: 'Speed Bundle', description: 'Tweaks that make Windows faster', icon: 'zap', color: 'cyan', tweaks: ['disable-telemetry','fast-menu-show'] }
        ]);
      }
    } catch (e) {
      addNotification('God Mode', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // History-based: a tweak is "applied" if its most recent history entry is 'apply'
  const appliedTweaks = useMemo(() => {
    const map = {};  // tweakId -> 'applied' | 'undone'
    for (const h of [...history].reverse()) {
      if (!map[h.tweakId]) {
        map[h.tweakId] = h.action === 'apply' ? 'applied' : 'undone';
      }
    }
    return map;
  }, [history]);

  const handleApplyTweak = async (tweak) => {
    const riskMsg = tweak.risk === 'high'
      ? ' HIGH RISK tweak — proceed only if you know what you are doing.'
      : tweak.risk === 'medium'
      ? ' Medium risk — verify after applying.'
      : '';
    const ok = await confirm({
      title: 'Apply Tweak',
      message: `Apply "${tweak.name}"?${riskMsg}`,
      detail: `Registry: ${tweak.regKey}\\${tweak.valueName} = ${tweak.valueData} (${tweak.valueType})`,
      confirmLabel: 'Apply',
      danger: tweak.risk === 'high'
    });
    if (!ok) return;
    setBusy(prev => ({ ...prev, [tweak.id]: 'applying' }));
    setShowOutput(true);
    try {
      if (window.api) {
        const backupId = `bk_${tweak.id}_${Date.now()}`;
        const res = await window.api.runSystemCommand('run-tweaker-tool', [
          'apply-value', backupId, tweak.regKey, tweak.valueName, tweak.valueType, String(tweak.valueData)
        ]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          await window.api.tweakerLogApplied({
            tweakId: tweak.id, tweakName: tweak.name, action: 'apply', backupId
          });
          addNotification('God Mode', `"${tweak.name}" applied. Undo available.`, 'success');
          await fetchAll();
        } else {
          addNotification('God Mode', obj?.error || 'Apply failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('God Mode', e.message, 'error');
    } finally {
      setBusy(prev => { const n = { ...prev }; delete n[tweak.id]; return n; });
    }
  };

  const handleUndoTweak = async (tweak) => {
    // Find the most recent apply entry to get the backupId
    const lastApply = history.find(h => h.tweakId === tweak.id && h.action === 'apply');
    if (!lastApply?.backupId) {
      addNotification('God Mode', 'No backup found — cannot undo.', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Undo Tweak',
      message: `Undo "${tweak.name}"? The original registry value will be restored.`,
      confirmLabel: 'Undo',
      danger: false
    });
    if (!ok) return;
    setBusy(prev => ({ ...prev, [tweak.id]: 'undoing' }));
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-tweaker-tool', [
          'undo-value', lastApply.backupId
        ]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          await window.api.tweakerLogApplied({
            tweakId: tweak.id, tweakName: tweak.name, action: 'undo', backupId: lastApply.backupId
          });
          addNotification('God Mode', `"${tweak.name}" undone. Original value restored.`, 'success');
          await fetchAll();
        } else {
          addNotification('God Mode', obj?.error || 'Undo failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('God Mode', e.message, 'error');
    } finally {
      setBusy(prev => { const n = { ...prev }; delete n[tweak.id]; return n; });
    }
  };

  const handleApplyBundle = async (bundle) => {
    const ok = await confirm({
      title: 'Apply Bundle',
      message: `Apply "${bundle.name}"? This will apply ${bundle.tweaks.length} tweaks.`,
      detail: 'Each tweak is backed up individually — you can undo them one-by-one later.',
      confirmLabel: `Apply ${bundle.tweaks.length} Tweaks`,
      danger: bundle.tweaks.some(id => catalog.find(t => t.id === id)?.risk === 'high')
    });
    if (!ok) return;
    setBundleBusy(prev => ({ ...prev, [bundle.id]: 'applying' }));
    setShowOutput(true);
    let successCount = 0;
    let failCount = 0;
    for (const tweakId of bundle.tweaks) {
      const tweak = catalog.find(t => t.id === tweakId);
      if (!tweak) continue;
      try {
        if (window.api) {
          const backupId = `bk_${tweak.id}_${Date.now()}`;
          const res = await window.api.runSystemCommand('run-tweaker-tool', [
            'apply-value', backupId, tweak.regKey, tweak.valueName, tweak.valueType, String(tweak.valueData)
          ], { bypassConfirmation: true });
          const obj = safeJsonParse(res.stdout);
          if (obj?.success) {
            await window.api.tweakerLogApplied({
              tweakId: tweak.id, tweakName: tweak.name, action: 'apply', backupId
            });
            successCount++;
          } else { failCount++; }
        }
      } catch (_) { failCount++; }
    }
    setBundleBusy(prev => { const n = { ...prev }; delete n[bundle.id]; return n; });
    addNotification('God Mode', `Bundle applied: ${successCount}/${bundle.tweaks.length} tweaks succeeded${failCount ? `, ${failCount} failed` : ''}.`,
      failCount === 0 ? 'success' : 'warning');
    await fetchAll();
  };

  const handleUndoBundle = async (bundle) => {
    const ok = await confirm({
      title: 'Undo Bundle',
      message: `Undo all tweaks in "${bundle.name}"? Each will be restored to its prior value.`,
      confirmLabel: 'Undo All',
      danger: false
    });
    if (!ok) return;
    setBundleBusy(prev => ({ ...prev, [bundle.id]: 'undoing' }));
    setShowOutput(true);
    let successCount = 0;
    for (const tweakId of bundle.tweaks) {
      const lastApply = history.find(h => h.tweakId === tweakId && h.action === 'apply');
      if (!lastApply?.backupId) continue;
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('run-tweaker-tool', [
            'undo-value', lastApply.backupId
          ], { bypassConfirmation: true });
          const obj = safeJsonParse(res.stdout);
          if (obj?.success) {
            await window.api.tweakerLogApplied({
              tweakId: tweakId, tweakName: catalog.find(t => t.id === tweakId)?.name || tweakId,
              action: 'undo', backupId: lastApply.backupId
            });
            successCount++;
          }
        }
      } catch (_) {}
    }
    setBundleBusy(prev => { const n = { ...prev }; delete n[bundle.id]; return n; });
    addNotification('God Mode', `Bundle undone: ${successCount}/${bundle.tweaks.length} restored.`, 'success');
    await fetchAll();
  };

  const handleExportBundle = (bundle) => {
    const json = JSON.stringify({
      solasBundleVersion: 1,
      id: 'cb_imported_' + Date.now().toString(36),
      name: bundle.name + ' (exported)',
      description: bundle.description,
      tweaks: bundle.tweaks,
      exportedAt: new Date().toISOString()
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bundle.id}-bundle.json`;
    a.click();
    URL.revokeObjectURL(url);
    addNotification('God Mode', 'Bundle exported as JSON.', 'success');
  };

  const handleImportBundle = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed.name || !Array.isArray(parsed.tweaks)) {
          throw new Error('Invalid bundle JSON: missing name or tweaks array');
        }
        // Verify all referenced tweaks exist in catalog
        const allIds = catalog.map(t => t.id);
        const unknown = parsed.tweaks.filter(id => !allIds.includes(id));
        if (unknown.length > 0) {
          throw new Error(`Bundle references unknown tweaks: ${unknown.join(', ')}`);
        }
        if (!parsed.id || !/^cb_[A-Za-z0-9_\-]+$/.test(parsed.id)) {
          parsed.id = 'cb_imported_' + Date.now().toString(36);
        }
        if (window.api) {
          const res = await window.api.tweakerSaveCustomBundle({
            id: parsed.id,
            name: parsed.name,
            description: parsed.description || 'Imported bundle',
            icon: 'sparkles', color: 'violet',
            tweaks: parsed.tweaks
          });
          if (res.success) {
            addNotification('God Mode', `Imported bundle: ${parsed.name}`, 'success');
            await fetchAll();
          } else {
            throw new Error(res.error || 'Save failed');
          }
        }
      } catch (err) {
        addNotification('God Mode', 'Import failed: ' + err.message, 'error');
      }
    };
    input.click();
  };

  const handleDeleteCustomBundle = async (bundle) => {
    const ok = await confirm({
      title: 'Delete Bundle',
      message: `Delete custom bundle "${bundle.name}"?`,
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    if (window.api) {
      const res = await window.api.tweakerDeleteCustomBundle(bundle.id);
      if (res.success) {
        addNotification('God Mode', 'Bundle deleted.', 'success');
        await fetchAll();
      }
    }
  };

  const handleClearHistory = async () => {
    const ok = await confirm({
      title: 'Clear History',
      message: 'Clear all tweak history? Applied tweaks will still be applied — only the log is removed.',
      confirmLabel: 'Clear', danger: true
    });
    if (!ok) return;
    if (window.api) {
      await window.api.tweakerClearHistory();
      await fetchAll();
      addNotification('God Mode', 'History cleared.', 'success');
    }
  };

  const filteredTweaks = useMemo(() => {
    if (activeCategory === 'all') return catalog;
    return catalog.filter(t => t.category === activeCategory);
  }, [catalog, activeCategory]);

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Zap className="h-5 w-5 text-brand-violet" />
            God Mode Visual Tweaker
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Registry tweaks as visual cards with risk badges. Every change is backed up — 1-click Undo restores the exact prior value.
            Apply curated bundles (Speed/Privacy/Gaming) for instant optimization.
          </p>
        </div>
        <button
          onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer"
        >
          <Zap className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </header>

      {showOutput && <CommandOutput channel="care-out" height="160px" />}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'tweaks', label: 'All Tweaks', icon: Zap },
          { id: 'bundles', label: 'Bundles', icon: Package },
          { id: 'history', label: 'History', icon: Clock }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 -mb-px cursor-pointer transition-colors ${
                isActive ? 'border-brand-violet text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-xs text-slate-400">Loading catalog...</p>
        </div>
      ) : (
        <>
          {activeTab === 'tweaks' && (
            <>
              {/* Category filter */}
              <div className="flex gap-2 flex-wrap">
                <CategoryChip label="All" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')}
                  count={catalog.length} />
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const count = catalog.filter(t => t.category === key).length;
                  return (
                    <CategoryChip key={key} label={meta.label} icon={meta.icon} color={meta.color}
                      active={activeCategory === key} onClick={() => setActiveCategory(key)} count={count} />
                  );
                })}
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredTweaks.map(tweak => (
                  <TweakCard
                    key={tweak.id}
                    tweak={tweak}
                    isApplied={appliedTweaks[tweak.id] === 'applied'}
                    busy={busy[tweak.id]}
                    onApply={() => handleApplyTweak(tweak)}
                    onUndo={() => handleUndoTweak(tweak)}
                  />
                ))}
              </div>
            </>
          )}

          {activeTab === 'bundles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200">Curated Bundles</h3>
                <button onClick={handleImportBundle}
                  className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/80 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
                  <Upload className="h-3 w-3" /> Import Custom Bundle
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {curatedBundles.map(b => (
                  <BundleCard key={b.id} bundle={b} catalog={catalog} appliedTweaks={appliedTweaks}
                    busy={bundleBusy[b.id]}
                    onApply={() => handleApplyBundle(b)}
                    onUndo={() => handleUndoBundle(b)}
                    onExport={() => handleExportBundle(b)} />
                ))}
              </div>

              {customBundles.length > 0 && (
                <>
                  <h3 className="text-sm font-bold text-slate-200 pt-4 border-t border-brand-border">Custom Bundles</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {customBundles.map(b => (
                      <BundleCard key={b.id} bundle={b} catalog={catalog} appliedTweaks={appliedTweaks}
                        busy={bundleBusy[b.id]}
                        onApply={() => handleApplyBundle(b)}
                        onUndo={() => handleUndoBundle(b)}
                        onExport={() => handleExportBundle(b)}
                        onDelete={() => handleDeleteCustomBundle(b)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {history.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No history yet. Apply a tweak to get started.</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button onClick={handleClearHistory}
                      className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
                      <Trash2 className="h-3 w-3" /> Clear History
                    </button>
                  </div>
                  <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
                    <div className="divide-y divide-brand-border/50 max-h-[500px] overflow-y-auto">
                      {history.map((h, i) => (
                        <div key={i} className="p-3 flex items-center gap-3">
                          {h.action === 'apply' ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Undo2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-200 truncate">
                              {h.action === 'apply' ? 'Applied' : 'Undone'}: {h.tweakName || h.tweakId}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {formatDateTime(h.loggedIso)} · backup: {h.backupId}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Tweak Card ---

function TweakCard({ tweak, isApplied, busy, onApply, onUndo }) {
  const catMeta = CATEGORY_META[tweak.category] || CATEGORY_META.speed;
  const riskMeta = RISK_META[tweak.risk] || RISK_META.low;
  const CatIcon = catMeta.icon;
  const isBusy = busy === 'applying' || busy === 'undoing';

  return (
    <div className={`glass-panel rounded-xl p-4 border transition-all ${
      isApplied ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-brand-border hover:border-slate-600'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-${catMeta.color}-500/10 border border-${catMeta.color}-500/30`}>
          <CatIcon className={`h-4 w-4 text-${catMeta.color}-400`} />
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${riskMeta.color}`}>
          {riskMeta.label}
        </span>
      </div>
      <h3 className="text-sm font-bold text-slate-100">{tweak.name}</h3>
      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{tweak.description}</p>

      <div className="text-[10px] text-slate-500 mt-3 font-mono break-all bg-slate-900/40 border border-brand-border rounded p-2">
        {tweak.regKey}<br />
        <span className="text-slate-400">↳ {tweak.valueName}</span> = <span className="text-brand-cyan">{tweak.valueData}</span>
      </div>

      <div className="flex gap-2 mt-3 pt-3 border-t border-brand-border/50">
        {isApplied ? (
          <button onClick={onUndo} disabled={isBusy}
            className="flex-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center justify-center gap-1 cursor-pointer">
            {busy === 'undoing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
            Undo
          </button>
        ) : (
          <button onClick={onApply} disabled={isBusy}
            className="flex-1 px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center justify-center gap-1 cursor-pointer">
            {busy === 'applying' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Apply
          </button>
        )}
        {isApplied && (
          <span className="px-2 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold rounded flex items-center gap-1">
            <Check className="h-3 w-3" /> Applied
          </span>
        )}
      </div>
    </div>
  );
}

// --- Bundle Card ---

function BundleCard({ bundle, catalog, appliedTweaks, busy, onApply, onUndo, onExport, onDelete }) {
  const isBusy = busy === 'applying' || busy === 'undoing';
  const appliedCount = bundle.tweaks.filter(id => appliedTweaks[id] === 'applied').length;
  const allApplied = appliedCount === bundle.tweaks.length;

  return (
    <div className={`glass-panel rounded-xl p-4 border ${
      allApplied ? 'border-emerald-500/40' : 'border-brand-border'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-${bundle.color}-500/10 border border-${bundle.color}-500/30`}>
          <Package className={`h-4 w-4 text-${bundle.color}-400`} />
        </div>
        <span className="text-[10px] text-slate-500">{appliedCount}/{bundle.tweaks.length} applied</span>
      </div>
      <h3 className="text-sm font-bold text-slate-100">{bundle.name}</h3>
      <p className="text-[11px] text-slate-400 mt-1">{bundle.description}</p>

      <div className="flex flex-wrap gap-1 mt-3">
        {bundle.tweaks.map(id => {
          const t = catalog.find(c => c.id === id);
          if (!t) return null;
          const isAp = appliedTweaks[id] === 'applied';
          return (
            <span key={id} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              isAp ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800/40 border-slate-700 text-slate-400'
            }`}>
              {t.name.length > 25 ? t.name.slice(0, 25) + '…' : t.name}
            </span>
          );
        })}
      </div>

      <div className="flex gap-2 mt-4 pt-3 border-t border-brand-border/50">
        <button onClick={onApply} disabled={isBusy}
          className="flex-1 px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center justify-center gap-1 cursor-pointer">
          {busy === 'applying' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Apply All
        </button>
        <button onClick={onUndo} disabled={isBusy || appliedCount === 0}
          className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer disabled:opacity-30"
          title="Undo all applied tweaks in this bundle">
          {busy === 'undoing' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
        </button>
        <button onClick={onExport}
          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] rounded border border-brand-border cursor-pointer"
          title="Export as JSON">
          <Download className="h-3 w-3" />
        </button>
        {onDelete && (
          <button onClick={onDelete}
            className="px-2 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] rounded cursor-pointer"
            title="Delete custom bundle">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// --- Category Chip ---

function CategoryChip({ label, icon: Icon, color = 'slate', active, onClick, count }) {
  const colorClass = {
    cyan: 'border-brand-cyan text-brand-cyan bg-brand-cyan/10',
    violet: 'border-brand-violet text-brand-violet bg-brand-violet/10',
    rose: 'border-rose-500 text-rose-400 bg-rose-500/10',
    amber: 'border-amber-500 text-amber-400 bg-amber-500/10',
    slate: 'border-brand-border text-slate-400 bg-slate-800/40'
  }[color];
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-xs font-bold rounded-full border flex items-center gap-1.5 cursor-pointer transition-all ${
        active ? colorClass : 'border-brand-border text-slate-500 hover:text-slate-300 bg-slate-900/40'
      }`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label}
      <span className="text-[10px] opacity-60">{count}</span>
    </button>
  );
}
