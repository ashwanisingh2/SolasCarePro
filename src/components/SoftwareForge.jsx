import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Package, Code, Book, Video, Zap, Globe, Shield, MessageSquare, Video as VideoIcon,
  Archive, Search, File, Image, Audio, Terminal, GitBranch, Check, Loader2,
  RefreshCw, Download, Trash2, HardDrive, RotateCcw, AlertTriangle, Info, X,
  Sparkles, Server, Play, ShoppingBag, AlertCircle
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

// --- Constants ---

const CATEGORY_META = {
  browser:  { label: 'Browsers',     icon: Globe },
  dev:      { label: 'Dev Tools',    icon: Code },
  comm:     { label: 'Communication',icon: MessageSquare },
  media:    { label: 'Media',        icon: Video },
  utility:  { label: 'Utilities',    icon: Zap },
  office:   { label: 'Office',       icon: File }
};

const TABS = [
  { id: 'catalog',    label: 'App Catalog',         icon: ShoppingBag },
  { id: 'bloatware',  label: 'Bloatware Terminator',icon: Trash2 },
  { id: 'driver',     label: 'Driver Rescue',       icon: HardDrive }
];

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

export default function SoftwareForge() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('catalog');
  const [showOutput, setShowOutput] = useState(false);

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Package className="h-5 w-5 text-brand-violet" />
            Software Forge
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Silent batch installer, bloatware terminator, and driver rollback. Fresh Windows install?
            Pick a role preset and have everything installed in 15 minutes — zero manual clicks.
          </p>
        </div>
        <button onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <RefreshCw className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </header>

      {showOutput && <CommandOutput channel="care-out" height="160px" />}

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-brand-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 -mb-px cursor-pointer whitespace-nowrap transition-colors ${
                isActive ? 'border-brand-violet text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'catalog' && <CatalogTab addNotification={addNotification} confirm={confirm} />}
      {activeTab === 'bloatware' && <BloatwareTab addNotification={addNotification} confirm={confirm} />}
      {activeTab === 'driver' && <DriverRescueTab addNotification={addNotification} confirm={confirm} />}
    </div>
  );
}

// --- Catalog Tab ---

function CatalogTab({ addNotification, confirm }) {
  const [catalog, setCatalog] = useState([]);
  const [presets, setPresets] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selected, setSelected] = useState({});  // appId -> true
  const [installing, setInstalling] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');

  const fetchCatalog = useCallback(async () => {
    try {
      if (window.api) {
        const [catRes, presetRes] = await Promise.all([
          window.api.forgeGetCatalog(),
          window.api.forgeGetPresets()
        ]);
        if (catRes.success) setCatalog(catRes.catalog || []);
        if (presetRes.success) setPresets(presetRes.presets || []);
      } else {
        setCatalog([
          { id: 'Google.Chrome', name: 'Google Chrome', category: 'browser', description: 'Browser', popular: true },
          { id: 'Microsoft.VisualStudioCode', name: 'VS Code', category: 'dev', description: 'Editor', popular: true }
        ]);
        setPresets([
          { id: 'developer', name: 'Developer', description: 'Code', icon: 'code', color: 'cyan', appIds: ['Microsoft.VisualStudioCode'] }
        ]);
      }
    } catch (e) {
      addNotification('Software Forge', 'Load failed: ' + e.message, 'error');
    }
  }, [addNotification]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const applyRolePreset = (preset) => {
    setSelectedRole(preset.id);
    const newSel = {};
    preset.appIds.forEach(id => { newSel[id] = true; });
    setSelected(newSel);
    addNotification('Software Forge', `Applied "${preset.name}" preset — ${preset.appIds.length} apps selected.`, 'info');
  };

  const toggleApp = (appId) => {
    setSelected(prev => { const n = { ...prev }; if (n[appId]) delete n[appId]; else n[appId] = true; return n; });
  };

  const filteredApps = useMemo(() => {
    let list = catalog;
    if (activeCategory !== 'all') list = list.filter(a => a.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [catalog, activeCategory, search]);

  const selectedIds = Object.keys(selected).filter(k => selected[k]);
  const selectedCount = selectedIds.length;

  const handleInstallSelected = async () => {
    if (selectedCount === 0) {
      addNotification('Software Forge', 'Select at least one app to install.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Install Selected Apps',
      message: `Install ${selectedCount} app(s) silently via Winget?`,
      detail: `Apps: ${selectedIds.slice(0, 5).join(', ')}${selectedCount > 5 ? ` ... +${selectedCount - 5} more` : ''}`,
      confirmLabel: `Install ${selectedCount} Apps`,
      danger: false
    });
    if (!ok) return;
    setInstalling(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-forge-tool',
          ['install-selected', JSON.stringify(selectedIds)]);
        const obj = safeJsonParse(res.stdout);
        if (obj) {
          const s = obj.summary || {};
          addNotification('Software Forge',
            `Installed: ${s.installed || 0}, Skipped (already): ${s.skipped || 0}, Failed: ${s.failed || 0}`,
            s.failed > 0 ? 'warning' : 'success');
        } else {
          addNotification('Software Forge', obj?.error || 'Install finished.', 'info');
        }
      }
    } catch (e) {
      addNotification('Software Forge', e.message, 'error');
    } finally {
      setInstalling(false);
    }
  };

  const handleUpdateAll = async () => {
    const ok = await confirm({
      title: 'Update All Apps',
      message: 'Silently update all Winget-managed apps to latest versions?',
      detail: 'This may take 5-15 minutes depending on how many apps are outdated.',
      confirmLabel: 'Update All',
      danger: false
    });
    if (!ok) return;
    setUpdatingAll(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-forge-tool', ['update-all']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Software Forge', obj.noUpdates ? 'All apps up to date.' : 'Update complete.', 'success');
        } else {
          addNotification('Software Forge', obj?.message || 'Update failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Software Forge', e.message, 'error');
    } finally {
      setUpdatingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Role preset wizard */}
      <div className="glass-panel border border-brand-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-violet" /> Fresh Windows Kit
          </h3>
          <span className="text-[10px] text-slate-500">Pick a role to auto-select apps</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {presets.map(p => {
            const isSelected = selectedRole === p.id;
            return (
              <button key={p.id} onClick={() => applyRolePreset(p)}
                className={`p-3 border rounded-lg text-left cursor-pointer transition-all ${
                  isSelected
                    ? `bg-${p.color}-500/15 border-${p.color}-500/40 ring-1 ring-${p.color}-500/20`
                    : 'bg-slate-900/40 border-brand-border hover:border-slate-600'
                }`}>
                <div className="text-xs font-bold text-slate-200">{p.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{p.description}</div>
                <div className="text-[10px] text-brand-cyan mt-1">{p.appIds.length} apps</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex items-center max-w-md flex-1 min-w-[240px]">
          <Search className="absolute left-3 h-4 w-4 text-slate-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search apps..."
            className="pl-9 pr-4 py-2 w-full bg-slate-900 border border-brand-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet" />
        </div>
        <button onClick={handleUpdateAll} disabled={updatingAll}
          className="px-3 py-2 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50">
          {updatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {updatingAll ? 'Updating...' : 'Update All'}
        </button>
        <button onClick={handleInstallSelected} disabled={installing || selectedCount === 0}
          className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
          {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {installing ? 'Installing...' : `Install Selected (${selectedCount})`}
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <CategoryChip label="All" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} count={catalog.length} />
        {Object.entries(CATEGORY_META).map(([key, meta]) => {
          const count = catalog.filter(a => a.category === key).length;
          if (count === 0) return null;
          return (
            <CategoryChip key={key} label={meta.label} icon={meta.icon}
              active={activeCategory === key} onClick={() => setActiveCategory(key)} count={count} />
          );
        })}
      </div>

      {/* App grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredApps.map(app => (
          <AppCard key={app.id} app={app}
            isSelected={!!selected[app.id]}
            onToggle={() => toggleApp(app.id)} />
        ))}
      </div>
      {filteredApps.length === 0 && (
        <div className="py-12 text-center">
          <Package className="h-8 w-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">No apps match your filter.</p>
        </div>
      )}
    </div>
  );
}

function AppCard({ app, isSelected, onToggle }) {
  return (
    <div onClick={onToggle}
      className={`glass-panel rounded-xl p-3 border cursor-pointer transition-all ${
        isSelected ? 'border-brand-violet ring-1 ring-brand-violet/30 bg-brand-violet/5' : 'border-brand-border hover:border-slate-600'
      }`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isSelected ? 'bg-brand-violet/20 border border-brand-violet/40' : 'bg-slate-800/40 border border-brand-border'
        }`}>
          {isSelected ? <Check className="h-4 w-4 text-brand-violet" /> : <Package className="h-4 w-4 text-slate-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-slate-200 truncate">{app.name}</div>
          <div className="text-[10px] text-slate-500 truncate font-mono">{app.id}</div>
          {app.description && <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">{app.description}</div>}
          {app.popular && (
            <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
              POPULAR
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Bloatware Tab ---

function BloatwareTab({ addNotification, confirm }) {
  const [scanning, setScanning] = useState(false);
  const [bloatware, setBloatware] = useState(null);
  const [selected, setSelected] = useState({});  // packageFullName -> true
  const [removing, setRemoving] = useState(false);
  const [filter, setFilter] = useState('all');

  const handleScan = async () => {
    setScanning(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-forge-tool', ['list-bloatware']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          setBloatware(obj.bloatware || []);
          setSelected({});
          addNotification('Software Forge', `Found ${obj.count} bloatware package(s).`, obj.count > 0 ? 'warning' : 'success');
        } else {
          addNotification('Software Forge', obj?.error || 'Scan failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 600));
        const mock = [
          { packageFullName: 'Microsoft.BingWeather_4.53.50511.0_x64__8wekyb3d8bbwe', name: 'Microsoft.BingWeather', displayName: 'MSN Weather', category: 'Bing', risk: 'low', version: '4.53.50511.0' },
          { packageFullName: 'king.com.CandyCrushSaga_1.230.1001.0_x86__kgqvnymyfvsf0', name: 'CandyCrushSaga', displayName: 'Candy Crush Saga', category: 'Bloatware', risk: 'low', version: '1.230.1001.0' }
        ];
        setBloatware(mock);
      }
    } catch (e) {
      addNotification('Software Forge', e.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const togglePkg = (pkg) => {
    setSelected(prev => { const n = { ...prev }; if (n[pkg]) delete n[pkg]; else n[pkg] = true; return n; });
  };

  const handleRemove = async () => {
    const pkgs = Object.keys(selected).filter(k => selected[k]);
    if (pkgs.length === 0) return;
    const hasHigh = bloatware.some(b => selected[b.packageFullName] && b.risk === 'high');
    const ok = await confirm({
      title: 'Remove Bloatware',
      message: `Remove ${pkgs.length} package(s)? This is irreversible.`,
      detail: hasHigh ? '⚠️ Some selected items are HIGH RISK (e.g. Xbox Identity Provider, Mail & Calendar) — removing them may break Windows features.' : 'Selected items will be removed for all users.',
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    setRemoving(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-forge-tool',
          ['remove-bloatware', JSON.stringify(pkgs)]);
        const obj = safeJsonParse(res.stdout);
        if (obj) {
          const s = obj.summary || {};
          addNotification('Software Forge',
            `Removed: ${s.removed || 0}, Failed: ${s.failed || 0}`,
            s.failed > 0 ? 'warning' : 'success');
          await handleScan();
        }
      }
    } catch (e) {
      addNotification('Software Forge', e.message, 'error');
    } finally {
      setRemoving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!bloatware) return [];
    if (filter === 'all') return bloatware;
    return bloatware.filter(b => b.category === filter);
  }, [bloatware, filter]);

  const categories = useMemo(() => {
    if (!bloatware) return [];
    const cats = {};
    bloatware.forEach(b => { cats[b.category] = (cats[b.category] || 0) + 1; });
    return cats;
  }, [bloatware]);

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="glass-panel border border-brand-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <button onClick={handleScan} disabled={scanning}
          className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {scanning ? 'Scanning...' : 'Scan for Bloatware'}
        </button>
        {bloatware && bloatware.length > 0 && (
          <button onClick={handleRemove} disabled={removing || selectedCount === 0}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {removing ? 'Removing...' : `Remove Selected (${selectedCount})`}
          </button>
        )}
        <div className="ml-auto text-[10px] text-slate-500">
          {bloatware ? `${bloatware.length} package(s) detected` : 'Not scanned yet'}
        </div>
      </div>

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">About Bloatware:</strong> Curated detection of pre-installed junk.
          <strong className="text-rose-400"> HIGH RISK</strong> items (Mail & Calendar, Xbox Identity Provider)
          may break Windows features if removed. Medium-risk items may break specific functionality.
          Review carefully before removing.
        </div>
      </div>

      {bloatware && Object.keys(categories).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <CategoryChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} count={bloatware.length} />
          {Object.entries(categories).map(([cat, count]) => (
            <CategoryChip key={cat} label={cat} active={filter === cat} onClick={() => setFilter(cat)} count={count} />
          ))}
        </div>
      )}

      <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
        {!bloatware ? (
          <div className="py-12 text-center">
            <Trash2 className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No scan yet. Click "Scan for Bloatware" to find junk.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Check className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              {bloatware.length === 0 ? 'No bloatware found. Clean Windows!' : 'No bloatware matches this filter.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border max-h-[500px] overflow-y-auto">
            {filtered.map((b, i) => {
              const isSel = !!selected[b.packageFullName];
              const riskColor = b.risk === 'high' ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                              : b.risk === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
              return (
                <div key={i} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors ${
                  isSel ? 'bg-rose-500/5' : 'hover:bg-slate-800/30'
                }`} onClick={() => togglePkg(b.packageFullName)}>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                    isSel ? 'bg-rose-600 border-rose-500' : 'border-brand-border'
                  }`}>
                    {isSel && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-200 truncate">{b.displayName}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{b.packageFullName}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500">{b.category}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${riskColor}`}>
                      {b.risk}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Driver Rescue Tab ---

function DriverRescueTab({ addNotification, confirm }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState(null);

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-forge-tool', ['list-driver-backups']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          setBackups(obj.backups || []);
        }
      } else {
        setBackups([
          { deviceDir: 'PCI_VEN_10DE_dev_1b82', timestamp: '20260108_120000', path: 'C:\\mock\\path', infCount: 3, createdIso: '2026-01-08T12:00:00Z' }
        ]);
      }
    } catch (e) {
      addNotification('Software Forge', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const handleRollback = async (backup) => {
    const ok = await confirm({
      title: 'Roll Back Driver',
      message: `Roll back to driver from "${backup.timestamp}"?`,
      detail: `Device: ${backup.deviceDir}\nBackup contains ${backup.infCount} INF file(s).\nThe current driver will be replaced.`,
      confirmLabel: 'Roll Back',
      danger: true
    });
    if (!ok) return;
    setRollingBack(backup.path);
    try {
      if (window.api) {
        // deviceDir contains the encoded PnP device ID; for rollback we pass the backup path
        const cfg = { pnpDeviceId: backup.deviceDir, backupDir: backup.path };
        const res = await window.api.runSystemCommand('run-forge-tool',
          ['rollback-driver', JSON.stringify(cfg)]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          const s = obj.summary || {};
          addNotification('Software Forge', `Rollback: ${s.installed} INF(s) installed, ${s.failed} failed.`,
            s.failed > 0 ? 'warning' : 'success');
        } else {
          addNotification('Software Forge', obj?.error || obj?.message || 'Rollback failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Software Forge', e.message, 'error');
    } finally {
      setRollingBack(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel border border-brand-border rounded-xl p-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-brand-violet" /> Driver Backups
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            Backups created by SolasCare's Driver Manager. Click "Roll Back" to restore a previous driver version.
          </p>
        </div>
        <button onClick={fetchBackups} disabled={loading}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-xs text-slate-400">Loading backups...</p>
        </div>
      ) : backups.length === 0 ? (
        <div className="py-12 text-center">
          <HardDrive className="h-8 w-8 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">No driver backups found.</p>
          <p className="text-[10px] text-slate-600 mt-1">
            Use the Drivers tab to back up a driver before updating — backups appear here for one-click rollback.
          </p>
        </div>
      ) : (
        <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
          <div className="divide-y divide-brand-border">
            {backups.map((b, i) => (
              <div key={i} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-200 truncate font-mono">{b.deviceDir}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatDateTime(b.createdIso)} · {b.infCount} INF file(s) · {b.timestamp}
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5 truncate font-mono">{b.path}</div>
                </div>
                <button onClick={() => handleRollback(b)}
                  disabled={rollingBack === b.path}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
                  {rollingBack === b.path ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Roll Back
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Category Chip ---

function CategoryChip({ label, icon: Icon, active, onClick, count }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-xs font-bold rounded-full border flex items-center gap-1.5 cursor-pointer transition-all ${
        active
          ? 'border-brand-violet text-white bg-brand-violet/10'
          : 'border-brand-border text-slate-500 hover:text-slate-300 bg-slate-900/40'
      }`}>
      {Icon && <Icon className="h-3 w-3" />}
      {label}
      <span className="text-[10px] opacity-60">{count}</span>
    </button>
  );
}
