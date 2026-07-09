import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Camera, GitCompareArrows, Trash2, Search, Loader2, RefreshCw, Plus,
  AlertTriangle, FolderX, FileX, Database, Activity, ChevronDown, ChevronRight,
  ShieldCheck, Clock, HardDrive, ListTree, Sparkles, Info
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

const TABS = [
  { id: 'monitored',  label: 'Monitored Installs', icon: Camera },
  { id: 'uninstall',  label: 'Surgical Uninstall', icon: Trash2 },
  { id: 'orphans',    label: 'Orphan Scanner',     icon: FolderX }
];

// --- Helpers ---------------------------------------------------------------

function safeJsonParse(stdout) {
  if (!stdout) return null;
  // PowerShell mixes log lines with the JSON payload. Find the last { ... } block.
  const m = stdout.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch (_) { return null; }
}

function formatBytes(mb) {
  if (mb == null) return '—';
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch (_) { return iso; }
}

// --- Main Component --------------------------------------------------------

export default function SurgicalUninstaller() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('monitored');

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-violet" />
            Surgical Uninstaller
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Track installs with point-in-time snapshots, then surgically remove every leftover file,
            registry key, and service. No more residue clogging your PC.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/40 border border-brand-border rounded-lg text-[10px] text-slate-400">
          <Info className="h-3 w-3 text-brand-cyan" />
          <span>Phase 1 · Feature 1</span>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-brand-border overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 -mb-px cursor-pointer whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-brand-violet text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'monitored' && (
        <MonitoredInstallsTab addNotification={addNotification} confirm={confirm} />
      )}
      {activeTab === 'uninstall' && (
        <SurgicalUninstallTab addNotification={addNotification} confirm={confirm} />
      )}
      {activeTab === 'orphans' && (
        <OrphanScannerTab addNotification={addNotification} confirm={confirm} />
      )}
    </div>
  );
}

// --- Tab 1: Monitored Installs --------------------------------------------

function MonitoredInstallsTab({ addNotification, confirm }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [taking, setTaking] = useState(false);
  const [diffing, setDiffing] = useState(null);
  const [selectedDiff, setSelectedDiff] = useState(null);
  const [showOutput, setShowOutput] = useState(false);
  const [depth, setDepth] = useState(2);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.surgicalListSnapshots();
        if (res.success) {
          setSnapshots(res.snapshots || []);
        } else {
          addNotification('Surgical Uninstaller', 'Failed to list snapshots: ' + res.error, 'error');
        }
      } else {
        setSnapshots([
          { id: 'snap_20260109_144201_abc12345', createdIso: '2026-01-09T14:42:01Z', depth: 2, sizeBytes: 2_400_000 },
          { id: 'snap_20260108_093015_def67890', createdIso: '2026-01-08T09:30:15Z', depth: 2, sizeBytes: 1_800_000 }
        ]);
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchSnapshots(); }, [fetchSnapshots]);

  const handleTakeSnapshot = async () => {
    const ok = await confirm({
      title: 'Take Baseline Snapshot',
      message: `Capture a snapshot of FS + registry + services + tasks (depth=${depth})? This takes 5-15 seconds. After this, install your software, then come back and click "Compute Diff".`,
      confirmLabel: 'Capture Snapshot',
      danger: false
    });
    if (!ok) return;
    setTaking(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-surgical-tool', ['take-snapshot', null, null, null, depth]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Surgical Uninstaller', `Snapshot captured: ${obj.snapshotId}`, 'success');
          await fetchSnapshots();
        } else {
          addNotification('Surgical Uninstaller', obj?.error || 'Snapshot failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        addNotification('Surgical Uninstaller', 'Mock snapshot captured.', 'success');
        setSnapshots(prev => [{
          id: 'snap_mock_' + Date.now(),
          createdIso: new Date().toISOString(),
          depth,
          sizeBytes: 1_500_000
        }, ...prev]);
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    } finally {
      setTaking(false);
    }
  };

  const handleComputeDiff = async (snapId) => {
    setDiffing(snapId);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-surgical-tool', ['compute-diff', snapId]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          setSelectedDiff({ snapshotId: snapId, ...obj });
          // Persist diff to store for later use (footprint/uninstall)
          await window.api.surgicalSaveDiff({
            snapshotId: snapId,
            computedIso: new Date().toISOString(),
            summary: obj.summary,
            diff: obj.diff
          });
          addNotification('Surgical Uninstaller',
            `Diff: +${obj.summary.filesAdded} -${obj.summary.filesRemoved} files, +${obj.summary.registryAdded} -${obj.summary.registryRemoved} reg keys`,
            'success');
        } else {
          addNotification('Surgical Uninstaller', obj?.error || 'Diff failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 600));
        setSelectedDiff({
          snapshotId: snapId,
          summary: { filesAdded: 234, filesRemoved: 1, registryAdded: 12, registryRemoved: 0, servicesAdded: 1, servicesRemoved: 0, tasksAdded: 0, tasksRemoved: 0 },
          diff: {
            filesAdded: [{ path: 'C:\\Program Files\\MockApp\\app.exe', size: 45000000, mtime: '2026-01-09T15:00:00Z', root: 'ProgramFiles' }],
            registryAdded: [{ path: 'HKLM:\\Software\\MockApp', name: 'MockApp', hive: 'Software' }],
            servicesAdded: [{ Name: 'MockSvc', DisplayName: 'Mock Service', State: 'Running', PathName: 'C:\\Program Files\\MockApp\\svc.exe' }],
            filesRemoved: [], registryRemoved: [], servicesRemoved: [], tasksAdded: [], tasksRemoved: []
          }
        });
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    } finally {
      setDiffing(null);
    }
  };

  const handleDelete = async (snapId) => {
    const ok = await confirm({
      title: 'Delete Snapshot',
      message: `Delete snapshot ${snapId}? This also removes its stored diff.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    try {
      if (window.api) {
        const res = await window.api.surgicalDeleteSnapshot(snapId);
        if (res.success) {
          addNotification('Surgical Uninstaller', 'Snapshot deleted.', 'success');
          await fetchSnapshots();
          if (selectedDiff?.snapshotId === snapId) setSelectedDiff(null);
        } else {
          addNotification('Surgical Uninstaller', res.error || 'Delete failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="glass-panel border border-brand-border rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Scan Depth</label>
          <select
            value={depth}
            onChange={e => setDepth(parseInt(e.target.value, 10))}
            className="bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-violet"
          >
            <option value={1}>1 (fastest, top-level only)</option>
            <option value={2}>2 (recommended)</option>
            <option value={3}>3 (slow, deeper)</option>
          </select>
        </div>
        <button
          onClick={handleTakeSnapshot}
          disabled={taking}
          className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
        >
          {taking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {taking ? 'Capturing...' : 'Take Baseline Snapshot'}
        </button>
        <button
          onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer"
        >
          <Activity className="h-3.5 w-3.5" />
          {showOutput ? 'Hide' : 'Show'} Output
        </button>
        <div className="ml-auto text-[10px] text-slate-500">
          {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} stored
        </div>
      </div>

      {showOutput && <CommandOutput channel="care-out" height="180px" />}

      {/* Workflow hint */}
      <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
        <Info className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
        <div>
          <strong className="text-brand-cyan">Workflow:</strong>
          <ol className="list-decimal list-inside mt-1 space-y-0.5 text-slate-400">
            <li>Click <em>Take Baseline Snapshot</em> before installing new software.</li>
            <li>Install your software normally (run its .exe / .msi).</li>
            <li>Come back here and click <em>Compute Diff</em> on the snapshot.</li>
            <li>Review what was added. Later, use Surgical Uninstall to remove every trace.</li>
          </ol>
        </div>
      </div>

      {/* Snapshots list */}
      <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand-violet" /> Snapshots
          </h3>
          <button onClick={fetchSnapshots} disabled={loading} className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {loading ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-brand-violet" />
            <p className="text-xs text-slate-400">Loading snapshots...</p>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="py-10 text-center">
            <Camera className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No snapshots yet. Take one to start tracking installs.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border">
            {snapshots.map(s => (
              <SnapshotRow
                key={s.id}
                snapshot={s}
                onComputeDiff={() => handleComputeDiff(s.id)}
                onDelete={() => handleDelete(s.id)}
                isDiffing={diffing === s.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Diff View */}
      {selectedDiff && <DiffView diff={selectedDiff} />}
    </div>
  );
}

function SnapshotRow({ snapshot, onComputeDiff, onDelete, isDiffing }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-slate-500 hover:text-white cursor-pointer shrink-0"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-mono text-slate-200 truncate">{snapshot.id}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDateTime(snapshot.createdIso)}</span>
              <span className="flex items-center gap-1"><ListTree className="h-3 w-3" />depth {snapshot.depth}</span>
              <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{(snapshot.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onComputeDiff}
            disabled={isDiffing}
            className="px-3 py-1.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            {isDiffing ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompareArrows className="h-3 w-3" />}
            {isDiffing ? 'Diffing...' : 'Compute Diff'}
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
            title="Delete snapshot"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffView({ diff }) {
  const [section, setSection] = useState('files');
  const d = diff.diff || {};
  const sections = [
    { id: 'files',    label: `Files (+${d.filesAdded?.length || 0} / -${d.filesRemoved?.length || 0})`,         icon: HardDrive },
    { id: 'registry', label: `Registry (+${d.registryAdded?.length || 0} / -${d.registryRemoved?.length || 0})`, icon: Database },
    { id: 'services', label: `Services (+${d.servicesAdded?.length || 0} / -${d.servicesRemoved?.length || 0})`, icon: Activity },
    { id: 'tasks',    label: `Tasks (+${d.tasksAdded?.length || 0} / -${d.tasksRemoved?.length || 0})`,           icon: ListTree }
  ];

  return (
    <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-brand-cyan" /> Diff View
          <span className="text-[10px] font-mono text-slate-500 ml-2">{diff.snapshotId}</span>
        </h3>
      </div>

      <div className="flex border-b border-brand-border overflow-x-auto">
        {sections.map(s => {
          const Icon = s.icon;
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`px-3 py-2 text-[11px] font-bold flex items-center gap-1.5 border-b-2 -mb-px cursor-pointer whitespace-nowrap ${
                isActive ? 'border-brand-cyan text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {section === 'files' && (
          <DiffList added={d.filesAdded} removed={d.filesRemoved} getKey={x => x.path} render={x => (
            <>
              <div className="text-[11px] text-slate-200 truncate">{x.path}</div>
              <div className="text-[10px] text-slate-500">{x.root} · {formatBytes((x.size || 0) / 1024 / 1024)}</div>
            </>
          )} />
        )}
        {section === 'registry' && (
          <DiffList added={d.registryAdded} removed={d.registryRemoved} getKey={x => x.path} render={x => (
            <>
              <div className="text-[11px] text-slate-200 truncate font-mono">{x.path}</div>
              <div className="text-[10px] text-slate-500">{x.hive} · {x.name}</div>
            </>
          )} />
        )}
        {section === 'services' && (
          <DiffList added={d.servicesAdded} removed={d.servicesRemoved} getKey={x => x.Name} render={x => (
            <>
              <div className="text-[11px] text-slate-200 truncate">{x.DisplayName || x.Name}</div>
              <div className="text-[10px] text-slate-500 truncate">{x.PathName} · {x.State}</div>
            </>
          )} />
        )}
        {section === 'tasks' && (
          <DiffList added={d.tasksAdded} removed={d.tasksRemoved} getKey={x => x.TaskPath + x.TaskName} render={x => (
            <>
              <div className="text-[11px] text-slate-200 truncate">{x.TaskName}</div>
              <div className="text-[10px] text-slate-500">{x.TaskPath} · {x.State}</div>
            </>
          )} />
        )}
      </div>
    </div>
  );
}

function DiffList({ added, removed, render, getKey }) {
  const addedArr = added || [];
  const removedArr = removed || [];
  if (addedArr.length === 0 && removedArr.length === 0) {
    return <div className="py-8 text-center text-xs text-slate-500">No changes in this section.</div>;
  }
  return (
    <div className="divide-y divide-brand-border/50">
      {addedArr.slice(0, 200).map((x, i) => (
        <div key={'a' + i + getKey(x)} className="p-2.5 flex items-center gap-2 hover:bg-emerald-950/10">
          <span className="text-emerald-400 text-xs font-bold shrink-0 w-6">+</span>
          <div className="min-w-0 flex-1">{render(x)}</div>
        </div>
      ))}
      {removedArr.slice(0, 100).map((x, i) => (
        <div key={'r' + i + getKey(x)} className="p-2.5 flex items-center gap-2 hover:bg-rose-950/10">
          <span className="text-rose-400 text-xs font-bold shrink-0 w-6">−</span>
          <div className="min-w-0 flex-1">{render(x)}</div>
        </div>
      ))}
      {(addedArr.length > 200 || removedArr.length > 100) && (
        <div className="p-2 text-center text-[10px] text-slate-500">
          Showing first 200 added / 100 removed. Full list in snapshot file.
        </div>
      )}
    </div>
  );
}

// --- Tab 2: Surgical Uninstall --------------------------------------------

function SurgicalUninstallTab({ addNotification, confirm }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [footprints, setFootprints] = useState({});
  const [fetchingFootprint, setFetchingFootprint] = useState(null);
  const [uninstalling, setUninstalling] = useState(null);
  const [showOutput, setShowOutput] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['list-apps']);
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\[[\s\S]*\]/) || res.stdout.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            setApps(Array.isArray(parsed) ? parsed : [parsed]);
          } else { setApps([]); }
        }
      } else {
        await new Promise(r => setTimeout(r, 400));
        setApps([
          { DisplayName: 'Mock App 1', DisplayVersion: '1.0', Publisher: 'TestCo', PSChildName: '{mock-1}', InstallLocation: 'C:\\Program Files\\MockApp1' },
          { DisplayName: 'Mock App 2', DisplayVersion: '2.5', Publisher: 'AnotherCo', PSChildName: '{mock-2}', InstallLocation: 'C:\\Program Files\\MockApp2' }
        ]);
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', 'Failed to load apps: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleGetFootprint = async (app) => {
    setFetchingFootprint(app.PSChildName);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-surgical-tool',
          ['get-footprint', null, app.PSChildName, app.DisplayName]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          setFootprints(prev => ({ ...prev, [app.PSChildName]: obj }));
          setSelectedApp({ app, footprint: obj });
          // Cache it
          await window.api.surgicalSaveFootprint(app.PSChildName, obj.footprint);
          addNotification('Surgical Uninstaller',
            `Footprint: ${formatBytes(obj.totalSizeMB)} total (${obj.footprint.appDataFolders.length} AppData folders, ${obj.footprint.services.length} services)`,
            'info');
        } else {
          addNotification('Surgical Uninstaller', obj?.error || 'Footprint failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    } finally {
      setFetchingFootprint(null);
    }
  };

  const handleSurgicalUninstall = async (app) => {
    const fp = footprints[app.PSChildName];
    const detailMsg = fp
      ? `Will delete: ${fp.footprint.installLocationSize} MB install dir + ${fp.footprint.appDataSize} MB AppData + ${fp.footprint.services.length} service(s) + ${fp.footprint.registryKeys.length} registry key(s). Total: ~${formatBytes(fp.totalSizeMB)}`
      : 'No footprint cached. Will run uninstaller and sweep InstallLocation + AppData folders matching app name.';
    const ok = await confirm({
      title: 'Surgical Uninstall',
      message: `Surgically uninstall "${app.DisplayName}"?`,
      detail: detailMsg,
      confirmLabel: 'Uninstall Surgically',
      danger: true
    });
    if (!ok) return;
    setUninstalling(app.PSChildName);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-surgical-tool',
          ['surgical-uninstall', null, app.PSChildName, app.DisplayName]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success || obj?.summary) {
          const s = obj.summary || {};
          addNotification('Surgical Uninstaller',
            `Done. Deleted: ${s.deletedFiles || 0} files, ${s.deletedRegistryKeys || 0} keys, ${s.deletedServices || 0} services. (${s.failedDeletes || 0} failed)`,
            obj.success ? 'success' : 'warning');
          await fetchApps();
          setSelectedApp(null);
          setFootprints(prev => { const n = { ...prev }; delete n[app.PSChildName]; return n; });
        } else {
          addNotification('Surgical Uninstaller', obj?.error || 'Uninstall failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    } finally {
      setUninstalling(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return apps;
    const q = search.toLowerCase();
    return apps.filter(a =>
      (a.DisplayName || '').toLowerCase().includes(q) ||
      (a.Publisher || '').toLowerCase().includes(q)
    );
  }, [apps, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex items-center max-w-md flex-1 min-w-[240px]">
          <Search className="absolute left-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps or publisher..."
            className="pl-9 pr-4 py-2 w-full bg-slate-900 border border-brand-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
        </div>
        <button
          onClick={fetchApps}
          disabled={loading}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <button
          onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer"
        >
          <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </div>

      {showOutput && <CommandOutput channel="care-out" height="180px" />}

      {/* Installation Diff View (preview before uninstall) */}
      {selectedApp && (
        <InstallationDiffView
          app={selectedApp.app}
          footprint={selectedApp.footprint}
          onClose={() => setSelectedApp(null)}
          onUninstall={() => handleSurgicalUninstall(selectedApp.app)}
          uninstalling={uninstalling === selectedApp.app.PSChildName}
        />
      )}

      <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
            <p className="text-xs text-slate-400">Enumerating installed apps...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-slate-500">{apps.length === 0 ? 'No apps found.' : 'No apps match your search.'}</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto divide-y divide-brand-border">
            {filtered.map((a, i) => {
              const fp = footprints[a.PSChildName];
              return (
                <div key={i} className="p-3 hover:bg-slate-800/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-200 truncate">{a.DisplayName}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {a.Publisher || 'Unknown'} · v{a.DisplayVersion || '?'}
                        {fp && (
                          <span className="ml-2 text-brand-cyan">· {formatBytes(fp.totalSizeMB)} total</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleGetFootprint(a)}
                        disabled={fetchingFootprint === a.PSChildName}
                        className="px-3 py-1.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {fetchingFootprint === a.PSChildName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Info className="h-3 w-3" />}
                        Footprint
                      </button>
                      <button
                        onClick={() => handleSurgicalUninstall(a)}
                        disabled={uninstalling !== null}
                        className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
                      >
                        {uninstalling === a.PSChildName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        {uninstalling === a.PSChildName ? 'Working...' : 'Surgical Uninstall'}
                      </button>
                    </div>
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

function InstallationDiffView({ app, footprint, onClose, onUninstall, uninstalling }) {
  const fp = footprint.footprint || footprint;
  return (
    <div className="glass-panel border border-amber-500/30 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
        <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Installation Diff View
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-xs text-slate-300">
          <strong className="text-slate-200">{app.DisplayName}</strong> · v{app.DisplayVersion} · {app.Publisher}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="bg-slate-900/40 border border-brand-border rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase">Install Location</div>
            <div className="text-sm font-bold text-slate-200 mt-1">{formatBytes(fp.installLocationSize)}</div>
            <div className="text-[10px] text-slate-500 mt-1 truncate">{fp.installLocation || '—'}</div>
          </div>
          <div className="bg-slate-900/40 border border-brand-border rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase">AppData Residue</div>
            <div className="text-sm font-bold text-slate-200 mt-1">{formatBytes(fp.appDataSize)}</div>
            <div className="text-[10px] text-slate-500 mt-1">{fp.appDataFolders?.length || 0} folder(s)</div>
          </div>
          <div className="bg-slate-900/40 border border-brand-border rounded-lg p-3">
            <div className="text-[10px] text-slate-500 uppercase">Services</div>
            <div className="text-sm font-bold text-slate-200 mt-1">{fp.services?.length || 0}</div>
            <div className="text-[10px] text-slate-500 mt-1">{fp.registryKeys?.length || 0} registry key(s)</div>
          </div>
        </div>

        {fp.appDataFolders?.length > 0 && (
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">AppData Folders (will be deleted):</div>
            <ul className="text-[11px] font-mono text-slate-400 space-y-0.5 max-h-24 overflow-y-auto">
              {fp.appDataFolders.map((f, i) => (
                <li key={i} className="truncate">{f.path} <span className="text-slate-600">({formatBytes(f.sizeMB)})</span></li>
              ))}
            </ul>
          </div>
        )}

        {fp.services?.length > 0 && (
          <div>
            <div className="text-[10px] text-slate-500 uppercase mb-1">Services (will be removed):</div>
            <ul className="text-[11px] font-mono text-slate-400 space-y-0.5">
              {fp.services.map((s, i) => (
                <li key={i} className="truncate">{s.name} — <span className="text-slate-600">{s.state}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-brand-border">
          <button
            onClick={onUninstall}
            disabled={uninstalling}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            {uninstalling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            {uninstalling ? 'Uninstalling...' : 'Confirm Surgical Uninstall'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Tab 3: Orphan Scanner -------------------------------------------------

function OrphanScannerTab({ addNotification, confirm }) {
  const [scanning, setScanning] = useState(false);
  const [orphans, setOrphans] = useState(null);
  const [scannedAt, setScannedAt] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showOutput, setShowOutput] = useState(false);

  const fetchCached = useCallback(async () => {
    try {
      if (window.api) {
        const res = await window.api.surgicalGetOrphanScan();
        if (res.success && res.scan) {
          setOrphans(res.scan.orphans || []);
          setScannedAt(res.scan.scannedAt);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => { fetchCached(); }, [fetchCached]);

  const handleScan = async () => {
    setScanning(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-surgical-tool', ['scan-orphans']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          setOrphans(obj.orphans || []);
          setScannedAt(new Date().toISOString());
          await window.api.surgicalSaveOrphanScan(obj.orphans || []);
          addNotification('Surgical Uninstaller',
            `Orphan scan complete. Found ${obj.count} potential leftover items.`,
            obj.count > 0 ? 'warning' : 'success');
        } else {
          addNotification('Surgical Uninstaller', obj?.error || 'Scan failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        const mock = [
          { type: 'appdata-orphan-folder', appName: 'OldGameStudio', detail: 'Orphaned folder: C:\\Users\\dev\\AppData\\Local\\OldGameStudio', path: 'C:\\Users\\dev\\AppData\\Local\\OldGameStudio', sizeHint: 245.6 },
          { type: 'registry-orphan-install-loc', appName: 'Broken Tool', detail: 'InstallLocation missing: D:\\OldPath', regPath: 'HKLM:\\Software\\...\\BrokenTool', regChild: 'BrokenTool', sizeHint: 0 },
          { type: 'service-orphan-binary', appName: 'StaleSvc', detail: 'Service binary missing: C:\\Program Files\\Removed\\svc.exe', serviceName: 'StaleSvc', sizeHint: 0 }
        ];
        setOrphans(mock);
        setScannedAt(new Date().toISOString());
        addNotification('Surgical Uninstaller', `Mock scan: ${mock.length} orphans found.`, 'info');
      }
    } catch (e) {
      addNotification('Surgical Uninstaller', e.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const filtered = useMemo(() => {
    if (!orphans) return [];
    if (filter === 'all') return orphans;
    return orphans.filter(o => o.type === filter);
  }, [orphans, filter]);

  const totalSize = useMemo(() => {
    if (!orphans) return 0;
    return orphans.reduce((s, o) => s + (o.sizeHint || 0), 0);
  }, [orphans]);

  const counts = useMemo(() => {
    if (!orphans) return {};
    return orphans.reduce((m, o) => { m[o.type] = (m[o.type] || 0) + 1; return m; }, {});
  }, [orphans]);

  return (
    <div className="space-y-4">
      <div className="glass-panel border border-brand-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
        >
          {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderX className="h-3.5 w-3.5" />}
          {scanning ? 'Scanning...' : 'Scan for Orphans'}
        </button>
        <button
          onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer"
        >
          <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
        <div className="ml-auto text-[10px] text-slate-500">
          {scannedAt ? (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Last scan: {formatDateTime(scannedAt)}</span>
          ) : (
            <span>Never scanned</span>
          )}
        </div>
      </div>

      {showOutput && <CommandOutput channel="care-out" height="180px" />}

      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">About this scan:</strong> Heuristic detection of leftover residue
          from previously-uninstalled apps. False positives are possible — review carefully before deleting.
          Total orphaned space detected: <strong className="text-amber-300">{formatBytes(totalSize)}</strong>
        </div>
      </div>

      {/* Filter chips */}
      {orphans && orphans.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${orphans.length})`} />
          <FilterChip active={filter === 'appdata-orphan-folder'} onClick={() => setFilter('appdata-orphan-folder')} label={`AppData Folders (${counts['appdata-orphan-folder'] || 0})`} />
          <FilterChip active={filter === 'registry-orphan-install-loc'} onClick={() => setFilter('registry-orphan-install-loc')} label={`Broken Reg Keys (${counts['registry-orphan-install-loc'] || 0})`} />
          <FilterChip active={filter === 'service-orphan-binary'} onClick={() => setFilter('service-orphan-binary')} label={`Dead Services (${counts['service-orphan-binary'] || 0})`} />
        </div>
      )}

      <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
        {!orphans ? (
          <div className="py-12 text-center">
            <FolderX className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No scan yet. Click "Scan for Orphans" to find leftover junk.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400">
              {orphans.length === 0 ? 'No orphans found. Your PC is clean!' : 'No orphans match this filter.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto divide-y divide-brand-border">
            {filtered.map((o, i) => (
              <OrphanRow key={i} orphan={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-bold rounded-full border cursor-pointer transition-colors ${
        active
          ? 'bg-brand-violet/20 border-brand-violet text-white'
          : 'bg-slate-900/40 border-brand-border text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function OrphanRow({ orphan }) {
  const iconMap = {
    'appdata-orphan-folder': { Icon: HardDrive, color: 'text-amber-400' },
    'registry-orphan-install-loc': { Icon: Database, color: 'text-rose-400' },
    'service-orphan-binary': { Icon: Activity, color: 'text-purple-400' }
  };
  const { Icon, color } = iconMap[orphan.type] || { Icon: FileX, color: 'text-slate-400' };
  return (
    <div className="p-3 hover:bg-slate-800/30">
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 ${color} shrink-0 mt-0.5`} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-slate-200 truncate">{orphan.appName}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 break-all">{orphan.detail}</div>
          {orphan.sizeHint > 0 && (
            <div className="text-[10px] text-amber-400 mt-1">{formatBytes(orphan.sizeHint)} recoverable</div>
          )}
        </div>
      </div>
    </div>
  );
}
