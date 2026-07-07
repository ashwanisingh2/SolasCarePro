import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Cpu, ArrowUpCircle, RefreshCw, CheckCircle, AlertTriangle, FileText,
  Ban, Power, Check, ShieldAlert, ShieldCheck, Activity, HardDrive, Download,
  Upload, FileSearch, Network, ChevronRight, Trash2, Loader2, Eye, X, Save,
  Globe2, Server, Wifi, WifiOff, Lock
} from 'lucide-react';
import CommandOutput from './shared/CommandOutput';

// =====================================================================
// SolasCarePro DriverManager — Enterprise driver management module
// Single multi-tab component (no duplicate sibling components).
// Tabs: Dashboard | Devices | Scan | Backup | Install | Verify | Reports | Remote
// Backend scripts: scan_drivers.ps1, driver_health_scan.ps1, driver_backup.ps1,
//   driver_install.ps1, driver_verify.ps1, driver_wu_search.ps1, driver_report.ps1,
//   driver_remote.ps1 (all routed through commandExecutor.js allow-list).
// =====================================================================

const TABS = [
  { id: 'dashboard', label: 'Dashboard',     icon: Activity },
  { id: 'devices',   label: 'Devices',       icon: Cpu },
  { id: 'scan',      label: 'Health Scan',   icon: ShieldCheck },
  { id: 'backup',    label: 'Backup',        icon: HardDrive },
  { id: 'install',   label: 'Install',       icon: Upload },
  { id: 'verify',    label: 'Verify',        icon: ShieldAlert },
  { id: 'wu',        label: 'Windows Update',icon: Globe2 },
  { id: 'reports',   label: 'Reports',       icon: FileText },
  { id: 'remote',    label: 'Remote',        icon: Server },
];

// ---------- Helpers ----------
const fmtBytes = (b) => {
  if (!b || b < 1) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
};
const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
const safe = (s) => (s == null ? '' : String(s));

const scoreColor = (s) =>
  s >= 90 ? 'text-emerald-400' :
  s >= 70 ? 'text-cyan-400' :
  s >= 50 ? 'text-amber-400' :
  'text-rose-400';
const scoreBg = (s) =>
  s >= 90 ? 'from-emerald-600 to-emerald-400' :
  s >= 70 ? 'from-cyan-600 to-cyan-400' :
  s >= 50 ? 'from-amber-600 to-amber-400' :
  'from-rose-600 to-rose-400';

// Helper: extract the LAST balanced JSON object from a stdout string that may
// contain leading log lines + a JSON payload. Used to parse '===RESULT==='
// markers from PowerShell scripts. The earlier non-greedy regex broke on
// nested objects (install-folder, list-store return arrays of objects).
function extractLastJson(stdout) {
  if (!stdout) return null;
  // Find the last '{' that opens a top-level object by scanning from end.
  // We try parsing from each '{' position; first valid JSON wins.
  // Strategy: find last occurrence of '===RESULT===' if present, else start from beginning.
  const markerIdx = stdout.lastIndexOf('===RESULT===');
  const start = markerIdx >= 0 ? markerIdx + '===RESULT==='.length : 0;
  // Find first '{' from start position.
  let openIdx = stdout.indexOf('{', start);
  if (openIdx < 0) return null;
  // Walk forward with brace-depth counter to find matching close.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < stdout.length; i++) {
    const c = stdout[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const candidate = stdout.slice(openIdx, i + 1);
        try { return JSON.parse(candidate); } catch { return null; }
      }
    }
  }
  return null;
}

// =====================================================================
// Main component
// =====================================================================
export default function DriverManager() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [devices, setDevices] = useState([]);
  const [healthResult, setHealthResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Run a scan to diagnose system drivers.');
  const [activeAction, setActiveAction] = useState(null);
  const [safeMode, setSafeMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [backups, setBackups] = useState([]);
  const [wuUpdates, setWuUpdates] = useState([]);
  const [consoleOutput, setConsoleOutput] = useState([]);
  const [installLog, setInstallLog] = useState('');
  const [rebootRequired, setRebootRequired] = useState(false);
  const consoleRef = useRef(null);

  // ---------- Stream listener for care-out ----------
  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      setConsoleOutput((prev) => [...prev, ...data.split('\n').filter(Boolean)].slice(-500));
      if (consoleRef.current) {
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
      }
    });
  }, []);

  // ---------- Initial scan on mount ----------
  useEffect(() => {
    handleScanDevices();
    handleListBackups();
  }, []);

  // ---------- Device scan (existing scan-drivers command) ----------
  const handleScanDevices = async () => {
    setScanning(true);
    setStatusMessage('Scanning PnP signed drivers + entities...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('scan-drivers');
        if (res.success && res.stdout) {
          let list = null;
          try { list = JSON.parse(res.stdout.trim()); }
          catch {
            const m = res.stdout.match(/\[[\s\S]*\]/) || res.stdout.match(/\{[\s\S]*\}/);
            if (m) { try { list = JSON.parse(m[0]); if (!Array.isArray(list)) list = [list]; } catch {} }
          }
          if (Array.isArray(list)) {
            setDevices(list);
            const issueCount = list.filter(d => d.Status !== 'OK').length;
            setStatusMessage(`Found ${list.length} devices (${issueCount} with issues).`);
          } else {
            setStatusMessage('Driver scan: could not parse output.');
          }
        } else {
          setStatusMessage('Driver scan failed: ' + (res.error || 'WMI service error'));
        }
      }
    } catch (err) {
      setStatusMessage('Scan error: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  // ---------- Health scan (new driver-health-scan command) ----------
  const handleHealthScan = async (mode = 'scan') => {
    setScanning(true);
    setStatusMessage(`Running ${mode === 'full' ? 'full' : 'quick'} health scan...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-health-scan', [mode]);
        if (res.success && res.stdout) {
          // Output may have leading log lines; find the JSON object
          const jsonMatch = res.stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            setHealthResult(result);
            setStatusMessage(`Health scan complete. Score: ${result.HealthScore}/100 (${result.ScoreLabel}). ${result.Issues.length} issues found.`);
          } else {
            setStatusMessage('Health scan: no JSON output found.');
          }
        } else {
          setStatusMessage('Health scan failed: ' + (res.error || 'unknown'));
        }
      }
    } catch (err) {
      setStatusMessage('Health scan error: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  // ---------- Driver action (existing driver-action command) ----------
  const executeDeviceAction = async (device, actionType) => {
    setActiveAction({ id: device.PnpDeviceId, action: actionType });
    setStatusMessage(`Running ${actionType} on ${device.DeviceName}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-action', [
          device.PnpDeviceId, actionType, safeMode
        ]);
        if (res.success) {
          setStatusMessage(`${actionType} completed on ${device.DeviceName}`);
          await handleScanDevices();
        } else {
          setStatusMessage(`Action failed: ${res.stderr || res.error || 'Unknown'}`);
        }
      }
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setActiveAction(null);
    }
  };

  // ---------- Update all problem drivers ----------
  const handleUpdateAll = async () => {
    const problems = devices.filter(d => d.Status !== 'OK' && d.Status !== 'Disabled');
    if (problems.length === 0) {
      setStatusMessage('No problem drivers to update.');
      return;
    }
    setStatusMessage(`Updating ${problems.length} problem drivers sequentially...`);
    for (const d of problems) {
      await executeDeviceAction(d, 'update');
    }
  };

  // ---------- Backup list refresh ----------
  const handleListBackups = async () => {
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-backup', ['list']);
        if (res.success && res.stdout) {
          const jsonMatch = res.stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const obj = JSON.parse(jsonMatch[0]);
            setBackups(obj.backups || []);
          }
        }
      }
    } catch (e) {
      console.warn('Backup list failed:', e);
    }
  };

  // ---------- CSV export (lightweight, no PowerShell needed) ----------
  const handleCsvExport = () => {
    try {
      const header = 'DeviceName,Manufacturer,DriverVersion,DriverDate,DriverProvider,IsSigned,Signer,InfName,PnpDeviceId,HardwareId,Status,ProblemCode,DeviceClass';
      const rows = devices.map(d =>
        [d.DeviceName, d.Manufacturer, d.DriverVersion, d.DriverDate, d.DriverProvider,
         d.IsSigned, d.DigitalSigner, d.DriverInfName, d.PnpDeviceId, d.HardwareId,
         d.Status, d.ProblemCode, d.Category]
          .map(v => {
            const s = safe(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(',')
      );
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `solas_drivers_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatusMessage(`Exported ${devices.length} devices to CSV.`);
    } catch (e) {
      setStatusMessage('Export failed: ' + e.message);
    }
  };

  // ---------- Derived stats ----------
  const stats = useMemo(() => {
    const total = devices.length;
    const ok = devices.filter(d => d.Status === 'OK').length;
    const missing = devices.filter(d => d.Status === 'Missing').length;
    const disabled = devices.filter(d => d.Status === 'Disabled').length;
    const warning = devices.filter(d => d.Status === 'Warning' || d.Status === 'Error').length;
    const unsigned = devices.filter(d => !d.IsDigitallySigned).length;
    return { total, ok, missing, disabled, warning, unsigned };
  }, [devices]);

  const filteredDevices = useMemo(() => {
    return devices.filter(d => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'problem' && d.Status !== 'OK') ||
        (filter === 'missing' && d.Status === 'Missing') ||
        (filter === 'unsigned' && !d.IsDigitallySigned);
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q ||
        safe(d.DeviceName).toLowerCase().includes(q) ||
        safe(d.Manufacturer).toLowerCase().includes(q) ||
        safe(d.HardwareId).toLowerCase().includes(q) ||
        safe(d.PnpDeviceId).toLowerCase().includes(q);
      return matchesFilter && matchesSearch;
    });
  }, [devices, filter, searchQuery]);

  // =====================================================================
  // RENDER
  // =====================================================================
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Cpu className="h-6 w-6 text-brand-violet" />
            Driver Manager
            <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded ml-2">Enterprise</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">Hardware enumeration, health scanning, backup, install, verification, WU integration, remote ops</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 bg-slate-900 border border-brand-border px-3.5 py-1.5 rounded-lg select-none">
            {safeMode ? <ShieldCheck className="h-4 w-4 text-brand-success" /> : <ShieldAlert className="h-4 w-4 text-brand-warning animate-pulse" />}
            <span className="text-[10px] font-bold text-slate-300 uppercase">Registry Safe Mode</span>
            <button
              onClick={() => setSafeMode(!safeMode)}
              className={`w-10 h-5 rounded-full p-0.5 transition-all cursor-pointer ${safeMode ? 'bg-brand-success' : 'bg-slate-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-slate-950 transition-transform ${safeMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
            </button>
          </div>
          <button
            onClick={handleScanDevices}
            disabled={scanning}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan Devices'}
          </button>
          <button
            onClick={handleUpdateAll}
            disabled={scanning || activeAction || devices.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <ArrowUpCircle className="h-4 w-4" /> Update All
          </button>
          <button
            onClick={handleCsvExport}
            disabled={devices.length === 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 border border-brand-border text-slate-300 cursor-pointer"
          >
            <FileText className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      {/* Reboot-required banner (spec TASK 4) */}
      {rebootRequired && (
        <section className="glass-panel border border-amber-500/40 bg-amber-950/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <div className="text-xs font-bold text-amber-200">Reboot Required</div>
              <div className="text-[11px] text-amber-400/80">A driver operation completed but needs a system restart to take effect.</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setRebootRequired(false)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-[11px] font-bold rounded border border-brand-border text-slate-300 cursor-pointer"
            >Later</button>
            <button
              onClick={async () => {
                if (!window.api) {
                  alert('Reboot is only available in the desktop app.');
                  return;
                }
                try {
                  // Triggers shutdown.exe /r /t 30 (cancellable via shutdown /a).
                  // commandExecutor.js shows a confirm dialog before running it.
                  await window.api.runSystemCommand('reboot-system');
                  setRebootRequired(false);
                } catch (e) {
                  console.warn('Reboot command failed:', e);
                }
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-[11px] font-bold rounded text-white cursor-pointer"
            >Reboot in 30s</button>
          </div>
        </section>
      )}

      {/* Status banner */}
      <section className="glass-panel border border-brand-border rounded-xl px-4 py-3 flex items-center gap-3 bg-slate-900/60 text-left">
        <Activity className="h-5 w-5 text-brand-cyan shrink-0" />
        <p className="text-xs text-slate-300 font-semibold">{statusMessage}</p>
      </section>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-1 bg-slate-900/60 border border-brand-border rounded-xl p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                active
                  ? 'bg-brand-violet text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <section className="glass-panel border border-brand-border rounded-2xl p-5 min-h-[400px]">
        {activeTab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            healthResult={healthResult}
            onScanClick={() => setActiveTab('scan')}
            onDevicesClick={() => setActiveTab('devices')}
          />
        )}

        {activeTab === 'devices' && (
          <DevicesTab
            devices={filteredDevices}
            allDevices={devices}
            scanning={scanning}
            activeAction={activeAction}
            filter={filter}
            setFilter={setFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onAction={executeDeviceAction}
            onRescan={handleScanDevices}
          />
        )}

        {activeTab === 'scan' && (
          <ScanTab
            healthResult={healthResult}
            scanning={scanning}
            onScan={handleHealthScan}
          />
        )}

        {activeTab === 'backup' && (
          <BackupTab
            backups={backups}
            onRefresh={handleListBackups}
            onStatus={setStatusMessage}
            onRebootRequired={setRebootRequired}
          />
        )}

        {activeTab === 'install' && (
          <InstallTab onStatus={setStatusMessage} onLog={setInstallLog} onRebootRequired={setRebootRequired} />
        )}

        {activeTab === 'verify' && (
          <VerifyTab onStatus={setStatusMessage} />
        )}

        {activeTab === 'wu' && (
          <WindowsUpdateTab
            updates={wuUpdates}
            setUpdates={setWuUpdates}
            onStatus={setStatusMessage}
            onRebootRequired={setRebootRequired}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsTab onStatus={setStatusMessage} />
        )}

        {activeTab === 'remote' && (
          <RemoteTab onStatus={setStatusMessage} onRebootRequired={setRebootRequired} />
        )}
      </section>

      {/* Live console */}
      <section>
        <CommandOutput
          channel="care-out"
          title="Driver Manager Console"
          isRunning={scanning || activeAction !== null}
          onCancel={window.api ? () => window.api.killActiveProcess() : null}
        />
      </section>
    </div>
  );
}

// =====================================================================
// Sub-tab: Dashboard
// =====================================================================
function DashboardTab({ stats, healthResult, onScanClick, onDevicesClick }) {
  const score = healthResult?.HealthScore ?? null;
  return (
    <div className="space-y-6 text-left">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Health score ring */}
        <div className="md:col-span-1 bg-slate-950/40 border border-brand-border rounded-xl p-5 flex flex-col items-center justify-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Driver Health Score</h3>
          {score === null ? (
            <div className="text-center py-6">
              <p className="text-xs text-slate-500 mb-3">No scan yet</p>
              <button
                onClick={onScanClick}
                className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 text-[11px] font-bold rounded-lg cursor-pointer"
              >
                Run Health Scan
              </button>
            </div>
          ) : (
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 264} 264`}
                  className={score >= 90 ? 'stroke-emerald-400' : score >= 70 ? 'stroke-cyan-400' : score >= 50 ? 'stroke-amber-400' : 'stroke-rose-400'}
                />
              </svg>
              <div className="text-center">
                <div className={`text-3xl font-black ${scoreColor(score)}`}>{score}</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">{healthResult.ScoreLabel}</div>
              </div>
            </div>
          )}
        </div>

        {/* Summary cards */}
        <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-3">
          <SummaryCard label="Total Devices" value={stats.total} color="cyan" />
          <SummaryCard label="Healthy" value={stats.ok} color="emerald" />
          <SummaryCard label="Missing" value={stats.missing} color="rose" />
          <SummaryCard label="Disabled" value={stats.disabled} color="amber" />
          <SummaryCard label="Warnings" value={stats.warning} color="amber" />
          <SummaryCard label="Unsigned" value={stats.unsigned} color="rose" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={onScanClick} className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
          <ShieldCheck className="h-4 w-4" /> Run Health Scan
        </button>
        <button onClick={onDevicesClick} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
          <Cpu className="h-4 w-4" /> View All Devices
        </button>
      </div>

      {/* Recent activity (from health result issues) */}
      {healthResult?.Issues?.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Recent Issues ({healthResult.Issues.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {healthResult.Issues.slice(0, 20).map((issue, i) => (
              <div key={i} className="bg-slate-950/40 border border-brand-border rounded-lg p-3 text-xs flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-200 truncate">{issue.DeviceName || 'Unknown'}</div>
                  <div className="text-slate-500 truncate">{issue.Details}</div>
                </div>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                  issue.Severity === 'Critical' ? 'bg-rose-500/20 text-rose-400' :
                  issue.Severity === 'High' ? 'bg-orange-500/20 text-orange-400' :
                  issue.Severity === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-700 text-slate-300'
                }`}>{issue.IssueType}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  const colorMap = {
    cyan: 'border-cyan-500/30 text-cyan-400',
    emerald: 'border-emerald-500/30 text-emerald-400',
    amber: 'border-amber-500/30 text-amber-400',
    rose: 'border-rose-500/30 text-rose-400',
  };
  return (
    <div className={`bg-slate-950/40 border ${colorMap[color]} rounded-xl p-4`}>
      <div className="text-[10px] text-slate-500 font-bold uppercase">{label}</div>
      <div className={`text-2xl font-black mt-1 ${colorMap[color].split(' ')[1]}`}>{value}</div>
    </div>
  );
}

// =====================================================================
// Sub-tab: Devices
// =====================================================================
function DevicesTab({ devices, allDevices, scanning, activeAction, filter, setFilter, searchQuery, setSearchQuery, onAction, onRescan }) {
  const filters = [
    { id: 'all',      label: `All (${allDevices.length})` },
    { id: 'problem',  label: `Problems (${allDevices.filter(d => d.Status !== 'OK').length})` },
    { id: 'missing',  label: `Missing (${allDevices.filter(d => d.Status === 'Missing').length})` },
    { id: 'unsigned', label: `Unsigned (${allDevices.filter(d => !d.IsDigitallySigned).length})` },
  ];
  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex bg-slate-900 p-0.5 rounded-lg border border-brand-border">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 text-[11px] font-bold rounded ${filter === f.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
            >{f.label}</button>
          ))}
        </div>
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search device, vendor, HW ID..."
            className="pl-9 pr-4 py-1.5 w-full sm:w-72 bg-slate-950/50 border border-brand-border/60 focus:border-brand-violet rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>

      {scanning ? (
        <div className="py-16 flex flex-col items-center gap-4">
          <RefreshCw className="h-10 w-10 animate-spin text-brand-violet" />
          <p className="text-sm text-slate-400">Enumerating PnP entities...</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="py-16 text-center">
          <Cpu className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No devices match the current filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/30 text-slate-400 font-bold border-b border-brand-border uppercase">
                <th className="px-3 py-2.5">Device</th>
                <th className="px-3 py-2.5">Category</th>
                <th className="px-3 py-2.5">Version</th>
                <th className="px-3 py-2.5">Provider</th>
                <th className="px-3 py-2.5">Signed</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {devices.map((d, i) => {
                const isOp = activeAction && activeAction.id === d.PnpDeviceId;
                return (
                  <tr key={i} className="hover:bg-slate-800/20">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-200 truncate max-w-[280px]" title={d.DeviceName}>{d.DeviceName || 'Unknown'}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[280px]">{d.PnpDeviceId}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-400">{d.Category || d.DriverClass || '—'}</td>
                    <td className="px-3 py-3 text-slate-300 font-mono text-[11px]">{d.DriverVersion || 'N/A'}</td>
                    <td className="px-3 py-3 text-slate-400">{d.DriverProvider || d.Manufacturer || '—'}</td>
                    <td className="px-3 py-3">
                      {d.IsDigitallySigned ? (
                        <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                          <Check className="h-3 w-3" /> {d.IsWhqlCertified ? 'WHQL' : 'Signed'}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-400 text-[11px] font-bold">
                          <ShieldAlert className="h-3 w-3" /> Unsigned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={d.Status} isOperating={isOp} action={activeAction?.action} /></td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {d.Status !== 'OK' && d.Status !== 'Disabled' && (
                          <button
                            disabled={activeAction !== null}
                            onClick={() => onAction(d, 'update')}
                            className="px-2 py-1 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-30 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowUpCircle className="h-3 w-3" /> Update
                          </button>
                        )}
                        <button
                          disabled={activeAction !== null}
                          onClick={() => onAction(d, d.Status === 'Disabled' ? 'enable' : 'disable')}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded border border-brand-border text-slate-300 flex items-center gap-1 cursor-pointer"
                        >
                          {d.Status === 'Disabled' ? <Power className="h-3 w-3 text-emerald-400" /> : <Ban className="h-3 w-3 text-rose-400" />}
                          {d.Status === 'Disabled' ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          disabled={activeAction !== null}
                          onClick={() => onAction(d, 'rollback')}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded border border-brand-border text-slate-300 cursor-pointer"
                        >Rollback</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, isOperating, action }) {
  if (isOperating) {
    const label = action === 'update' ? 'Updating...' : action === 'enable' ? 'Enabling...' : action === 'disable' ? 'Disabling...' : 'Working...';
    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-violet bg-brand-violet/10 border border-brand-violet/20 rounded animate-pulse">
        <RefreshCw className="h-3 w-3 animate-spin" /> {label}
      </span>
    );
  }
  const map = {
    OK:        { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Check },
    Warning:   { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: AlertTriangle },
    Disabled:  { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Power },
    Missing:   { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse', icon: AlertTriangle },
    Error:     { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: AlertTriangle },
  };
  const m = map[status] || map.Error;
  const Icon = m.icon;
  return (
    <span className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold border rounded ${m.cls}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

// =====================================================================
// Sub-tab: Scan (full health scan)
// =====================================================================
function ScanTab({ healthResult, scanning, onScan }) {
  return (
    <div className="space-y-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Driver Health Scanner</h3>
          <p className="text-xs text-slate-400 mt-0.5">Analyzes device problem codes, signature status, event log errors, and SetupAPI install failures.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onScan('scan')}
            disabled={scanning}
            className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} /> Quick Scan
          </button>
          <button
            onClick={() => onScan('full')}
            disabled={scanning}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Full Scan (incl. Event Log)
          </button>
        </div>
      </div>

      {scanning && !healthResult && (
        <div className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-sm text-slate-400">Scanning...</p>
        </div>
      )}

      {healthResult && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard label="Health Score" value={`${healthResult.HealthScore}/100`} color={healthResult.HealthScore >= 90 ? 'emerald' : healthResult.HealthScore >= 70 ? 'cyan' : healthResult.HealthScore >= 50 ? 'amber' : 'rose'} />
            <SummaryCard label="Total Issues" value={healthResult.Summary.TotalIssues} color="amber" />
            <SummaryCard label="Missing" value={healthResult.Summary.MissingDrivers} color="rose" />
            <SummaryCard label="Unsigned" value={healthResult.Summary.UnsignedDrivers} color="rose" />
            <SummaryCard label="Install Failures" value={healthResult.Summary.InstallFailures} color="amber" />
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">All Issues ({healthResult.Issues.length})</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {healthResult.Issues.map((issue, i) => (
                <div key={i} className="bg-slate-950/40 border border-brand-border rounded-lg p-3 text-xs">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="font-bold text-slate-200">{issue.DeviceName || 'Unknown'}</div>
                    <div className="flex gap-1.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        issue.Severity === 'Critical' ? 'bg-rose-500/20 text-rose-400' :
                        issue.Severity === 'High' ? 'bg-orange-500/20 text-orange-400' :
                        issue.Severity === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-slate-700 text-slate-300'
                      }`}>{issue.Severity}</span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-brand-violet/20 text-brand-violet">{issue.IssueType}</span>
                    </div>
                  </div>
                  <div className="text-slate-500 text-[11px]">{issue.Details}</div>
                  {issue.PnpDeviceId && <div className="text-slate-600 font-mono text-[10px] mt-1 truncate">{issue.PnpDeviceId}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// =====================================================================
// Sub-tab: Backup
// =====================================================================
function BackupTab({ backups, onRefresh, onStatus, onRebootRequired }) {
  const [destPath, setDestPath] = useState('');
  const [busy, setBusy] = useState(false);

  const handleBackup = async () => {
    if (!destPath) {
      onStatus('Please enter a destination folder path.');
      return;
    }
    setBusy(true);
    onStatus('Creating full driver backup via Export-WindowsDriver...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-backup', ['backup-all', destPath]);
        if (res.success) {
          onStatus('Backup created. See console for details.');
          await onRefresh();
        } else {
          onStatus('Backup failed: ' + (res.error || 'see console'));
        }
      }
    } catch (e) {
      onStatus('Backup error: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (backupId) => {
    setBusy(true);
    onStatus('Verifying backup integrity...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-backup', ['verify', '', '', backupId]);
        const jsonMatch = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        if (obj?.success) {
          onStatus(`Backup ${backupId} verified OK (missing=${obj.missingFiles}, hashMismatch=${obj.hashMismatches})`);
        } else {
          onStatus(`Verify failed: ${obj?.error || 'see console'}`);
        }
      }
    } finally { setBusy(false); }
  };

  const handleRestore = async (backupId) => {
    if (!confirm(`Restore all drivers from backup ${backupId}? This will install all INFs from this backup.`)) return;
    setBusy(true);
    onStatus(`Restoring backup ${backupId}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-backup', ['restore', '', '', backupId]);
        onStatus('Restore complete. See console for install results.');
      }
    } finally { setBusy(false); }
  };

  const handleDelete = async (backupId) => {
    if (!confirm(`Delete backup ${backupId}? This removes both metadata and the backup folder.`)) return;
    setBusy(true);
    try {
      if (window.api) {
        await window.api.runSystemCommand('driver-backup', ['delete', '', '', backupId]);
        onStatus(`Backup ${backupId} deleted.`);
        await onRefresh();
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 text-left">
      <div>
        <h3 className="text-sm font-bold text-slate-200">Driver Backup & Restore</h3>
        <p className="text-xs text-slate-400 mt-0.5">Backs up all 3rd-party drivers via DISM Export-WindowsDriver with manifest + SHA256 verification.</p>
      </div>

      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4">
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Destination Folder (e.g. D:\DriverBackups)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={destPath}
            onChange={(e) => setDestPath(e.target.value)}
            placeholder="D:\DriverBackups"
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
          <button
            onClick={handleBackup}
            disabled={busy || !destPath}
            className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" /> Backup All
          </button>
          <button
            onClick={onRefresh}
            disabled={busy}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded border border-brand-border text-slate-300 flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Existing Backups ({backups.length})</h4>
        {backups.length === 0 ? (
          <p className="text-xs text-slate-500 py-8 text-center">No backups yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b, i) => (
              <div key={i} className="bg-slate-950/40 border border-brand-border rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-slate-200 text-xs">{b.BackupId}</span>
                    <span className="text-[10px] text-slate-500">• {fmtDate(b.BackupDate)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-violet/20 text-brand-violet">{b.Type}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate" title={b.BackupPath}>{b.BackupPath}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{b.IncludedDrivers?.length || 0} drivers · {fmtBytes(b.SizeBytes)} · {b.ComputerName} · {b.WindowsBuild}</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => handleVerify(b.BackupId)} disabled={busy} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[10px] font-bold rounded border border-brand-border text-slate-300 cursor-pointer">Verify</button>
                  <button onClick={() => handleRestore(b.BackupId)} disabled={busy} className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 disabled:opacity-30 text-[10px] font-bold rounded border border-emerald-500/30 text-emerald-400 cursor-pointer">Restore</button>
                  <button onClick={() => handleDelete(b.BackupId)} disabled={busy} className="px-2 py-1 bg-rose-950 hover:bg-rose-900 disabled:opacity-30 text-[10px] font-bold rounded border border-rose-500/30 text-rose-400 cursor-pointer flex items-center gap-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Sub-tab: Install
// =====================================================================
function InstallTab({ onStatus, onLog, onRebootRequired }) {
  const [infPath, setInfPath] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [storeDrivers, setStoreDrivers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uninstallTarget, setUninstallTarget] = useState('');

  const loadStore = async () => {
    setBusy(true);
    onStatus('Enumerating driver store via pnputil /enum-drivers...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-install', ['list-store']);
        const obj = extractLastJson(res.stdout);
        if (obj) {
          setStoreDrivers(obj.drivers || []);
          onStatus(`Loaded ${obj.count} drivers from store.`);
        } else {
          onStatus('Failed to parse driver store output.');
        }
      }
    } finally { setBusy(false); }
  };

  const handleInstallInf = async () => {
    if (!infPath) { onStatus('Enter an INF path first.'); return; }
    setBusy(true);
    onStatus(`Installing ${infPath} via pnputil /add-driver /install...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-install', ['install-inf', infPath]);
        const obj = extractLastJson(res.stdout);
        if (obj?.success) {
          onStatus(`Install OK. Reboot required: ${obj.rebootRequired}`);
          if (obj.rebootRequired) onRebootRequired?.(true);
        } else {
          onStatus(`Install failed (exit ${obj?.exitCode})`);
        }
      }
    } finally { setBusy(false); }
  };

  const handleInstallFolder = async () => {
    if (!folderPath) { onStatus('Enter a folder path first.'); return; }
    setBusy(true);
    onStatus(`Bulk-installing all INFs from ${folderPath}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-install', ['install-folder', folderPath]);
        const obj = extractLastJson(res.stdout);
        if (obj) {
          const ok = (obj.results || []).filter(r => r.success).length;
          onStatus(`Bulk install: ${ok}/${obj.results?.length || 0} succeeded. Reboot required: ${obj.rebootRequired}`);
          if (obj.rebootRequired) onRebootRequired?.(true);
        }
      }
    } finally { setBusy(false); }
  };

  const handleUninstall = async () => {
    if (!uninstallTarget) { onStatus('Enter an OEM INF name (e.g. oem5.inf).'); return; }
    if (!confirm(`Force-remove ${uninstallTarget} from driver store?`)) return;
    setBusy(true);
    onStatus(`Removing ${uninstallTarget} via pnputil /delete-driver /force...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-install', ['uninstall', uninstallTarget]);
        const obj = extractLastJson(res.stdout);
        onStatus(`Uninstall ${obj?.success ? 'OK' : 'failed'}. Reboot required: ${obj?.rebootRequired}`);
        if (obj?.rebootRequired) onRebootRequired?.(true);
        await loadStore();
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 text-left">
      <div>
        <h3 className="text-sm font-bold text-slate-200">Driver Install / Uninstall</h3>
        <p className="text-xs text-slate-400 mt-0.5">PnPUtil-based driver store management. All operations are logged with exit codes + reboot detection.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Install single INF */}
        <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4 space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase">Install Single INF</label>
          <input
            type="text"
            value={infPath}
            onChange={(e) => setInfPath(e.target.value)}
            placeholder="C:\Drivers\audio\realtek.inf"
            className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
          <button
            onClick={handleInstallInf}
            disabled={busy || !infPath}
            className="w-full px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center justify-center gap-1 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" /> Add & Install
          </button>
        </div>

        {/* Install folder */}
        <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4 space-y-2">
          <label className="block text-[10px] font-bold text-slate-500 uppercase">Bulk Install from Folder</label>
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="D:\OEM\Chipset"
            className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
          <button
            onClick={handleInstallFolder}
            disabled={busy || !folderPath}
            className="w-full px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center justify-center gap-1 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" /> Scan & Install All INFs
          </button>
        </div>
      </div>

      {/* Driver store browser */}
      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase">Driver Store ({storeDrivers.length})</h4>
          <button onClick={loadStore} disabled={busy} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[10px] font-bold rounded border border-brand-border text-slate-300 cursor-pointer">
            <RefreshCw className={`h-3 w-3 inline ${busy ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        {storeDrivers.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">Click Refresh to load the driver store.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-1">
            {storeDrivers.map((d, i) => (
              <div key={i} className="text-[11px] border border-brand-border/40 rounded p-2 bg-slate-900/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-300">{d.PublishedName}</span>
                  <span className="text-[10px] text-slate-500">{d.ClassName}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {d.Provider} · v{d.Version} · {d.Signer || 'unsigned'}
                </div>
                <div className="text-[10px] text-slate-600 font-mono truncate">{d.OriginalName}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Uninstall */}
      <div className="bg-slate-950/40 border border-rose-500/30 rounded-lg p-4 space-y-2">
        <label className="block text-[10px] font-bold text-rose-400 uppercase">Force Uninstall from Driver Store</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={uninstallTarget}
            onChange={(e) => setUninstallTarget(e.target.value)}
            placeholder="oem5.inf"
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
          <button
            onClick={handleUninstall}
            disabled={busy || !uninstallTarget}
            className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 text-xs font-bold rounded border border-rose-500/30 text-rose-400 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5 inline" /> Force Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Sub-tab: Verify
// =====================================================================
function VerifyTab({ onStatus }) {
  const [infPath, setInfPath] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleVerify = async () => {
    if (!infPath) { onStatus('Enter an INF path.'); return; }
    setBusy(true);
    onStatus('Verifying driver signature + architecture + INF metadata...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-verify', [infPath]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        if (m) {
          const obj = JSON.parse(m[0]);
          setResult(obj);
          onStatus(`Verification: ${obj.overallStatus} (${obj.failureReasons.length} issues)`);
        } else {
          onStatus('Verify failed: no JSON output.');
        }
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 text-left">
      <div>
        <h3 className="text-sm font-bold text-slate-200">Driver Verification Service</h3>
        <p className="text-xs text-slate-400 mt-0.5">Authenticode signature, WHQL certification, PE architecture match, OS build compatibility, catalog file validation.</p>
      </div>

      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4">
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">INF File Path</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={infPath}
            onChange={(e) => setInfPath(e.target.value)}
            placeholder="C:\Drivers\oem5.inf"
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
          <button
            onClick={handleVerify}
            disabled={busy || !infPath}
            className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Verify
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-3">
          <div className={`rounded-lg p-4 border ${
            result.overallStatus === 'Verified' ? 'bg-emerald-950/30 border-emerald-500/30' :
            result.overallStatus === 'Warning' ? 'bg-amber-950/30 border-amber-500/30' :
            'bg-rose-950/30 border-rose-500/30'
          }`}>
            <div className="flex items-center gap-2">
              {result.overallStatus === 'Verified' ? <CheckCircle className="h-5 w-5 text-emerald-400" /> :
               result.overallStatus === 'Warning' ? <AlertTriangle className="h-5 w-5 text-amber-400" /> :
               <ShieldAlert className="h-5 w-5 text-rose-400" />}
              <span className="text-sm font-bold text-slate-200">Overall: {result.overallStatus}</span>
            </div>
            {result.failureReasons.length > 0 && (
              <ul className="mt-2 text-xs text-slate-400 list-disc list-inside space-y-0.5">
                {result.failureReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <VerifyField label="INF Signed" value={result.isInfSigned ? 'Yes' : 'No'} good={result.isInfSigned} />
            <VerifyField label="WHQL Certified" value={result.isWhqlCertified ? 'Yes' : 'No'} good={result.isWhqlCertified} />
            <VerifyField label="SYS Signed" value={result.isSysSigned ? 'Yes' : (result.sysPath ? 'No' : 'No SYS')} good={result.isSysSigned || !result.sysPath} />
            <VerifyField label="Arch Match" value={`${result.sysArch || '—'} (${result.archMatch ? 'OK' : 'MISMATCH'})`} good={result.archMatch} />
            <VerifyField label="Catalog Valid" value={result.catalogValid ? 'Yes' : (result.catalogFile ? 'No' : 'No CAT')} good={result.catalogValid || !result.catalogFile} />
            <VerifyField label="OS Build Compatible" value={result.osBuildCompatible ? 'Yes' : 'No'} good={result.osBuildCompatible} />
          </div>

          {result.signerName && (
            <div className="bg-slate-950/40 border border-brand-border rounded p-3 text-xs">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Signer Certificate</div>
              <div className="text-slate-300">{result.signerName}</div>
              <div className="text-slate-500 font-mono text-[10px] mt-0.5">Thumbprint: {result.certificateThumbprint}</div>
              <div className="text-slate-500 text-[10px]">Expires: {fmtDate(result.certificateExpiry)}</div>
            </div>
          )}
          {result.computedSha256 && (
            <div className="bg-slate-950/40 border border-brand-border rounded p-3 text-xs">
              <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">SYS SHA-256</div>
              <div className="text-slate-300 font-mono break-all">{result.computedSha256}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerifyField({ label, value, good }) {
  return (
    <div className={`rounded p-2 border ${good ? 'bg-emerald-950/20 border-emerald-500/20' : 'bg-rose-950/20 border-rose-500/20'}`}>
      <div className="text-[10px] text-slate-500 uppercase font-bold">{label}</div>
      <div className={`text-xs font-bold mt-0.5 ${good ? 'text-emerald-400' : 'text-rose-400'}`}>{value}</div>
    </div>
  );
}

// =====================================================================
// Sub-tab: Windows Update driver search
// =====================================================================
function WindowsUpdateTab({ updates, setUpdates, onStatus, onRebootRequired }) {
  const [busy, setBusy] = useState(false);

  const handleSearch = async () => {
    setBusy(true);
    onStatus('Searching Windows Update for pending driver updates...');
    setUpdates([]);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-wu-search', ['search']);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        if (m) {
          const obj = JSON.parse(m[0]);
          setUpdates(obj.updates || []);
          onStatus(`Found ${obj.count} pending driver updates.`);
        } else {
          onStatus('WU search failed: no JSON output.');
        }
      }
    } finally { setBusy(false); }
  };

  const handleInstall = async (updateId, title) => {
    if (!confirm(`Install "${title}" from Windows Update?`)) return;
    setBusy(true);
    onStatus(`Downloading + installing ${title}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-wu-search', ['install', updateId]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[0]) : null;
        onStatus(`Install ${obj?.success ? 'succeeded' : 'failed'}. Reboot required: ${obj?.rebootRequired}`);
        if (obj?.rebootRequired) onRebootRequired?.(true);
        await handleSearch();
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 text-left">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Windows Update Driver Search</h3>
          <p className="text-xs text-slate-400 mt-0.5">Queries the native Microsoft.Update.Session COM API. No third-party sources.</p>
        </div>
        <button
          onClick={handleSearch}
          disabled={busy}
          className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
        >
          <Globe2 className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Search WU
        </button>
      </div>

      {updates.length === 0 ? (
        <div className="py-12 text-center">
          <Globe2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-xs text-slate-500">No Windows Update driver results yet. Click Search WU.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {updates.map((u, i) => (
            <div key={i} className="bg-slate-950/40 border border-brand-border rounded-lg p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-200 text-xs">{u.Title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {u.DriverManufacturer} · {u.DriverClass || '—'} · {u.DriverVerVersion || '—'} · {fmtBytes(u.SizeBytes)}
                  </div>
                  {u.DriverHardwareID && (
                    <div className="text-[10px] text-slate-600 font-mono truncate mt-0.5">{u.DriverHardwareID}</div>
                  )}
                  {u.KBArticleIDs?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {u.KBArticleIDs.map(kb => (
                        <span key={kb} className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded font-mono">KB{kb}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleInstall(u.UpdateId, u.Title)}
                  disabled={busy}
                  className="px-2 py-1 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Download className="h-3 w-3" /> Install
                </button>
              </div>
              {u.Description && (
                <details className="text-[10px] text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-400">Description</summary>
                  <p className="mt-1 whitespace-pre-wrap">{u.Description}</p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Sub-tab: Reports
// =====================================================================
function ReportsTab({ onStatus }) {
  const [busy, setBusy] = useState(false);

  const handleGenerate = async (format) => {
    setBusy(true);
    onStatus(`Generating ${format.toUpperCase()} driver report...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-report', [format]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[0]) : null;
        if (obj?.success) {
          onStatus(`${format.toUpperCase()} report saved: ${obj.outputPath}`);
        } else {
          onStatus(`Report generation failed.`);
        }
      }
    } finally { setBusy(false); }
  };

  const formats = [
    { id: 'html', label: 'HTML Report', icon: FileText, desc: 'Self-contained HTML file with styling, summary cards, and full device table. Opens in any browser.' },
    { id: 'json', label: 'JSON Report', icon: FileText, desc: 'Structured JSON with all device properties, summary, and metadata. Suitable for programmatic processing.' },
    { id: 'csv', label: 'CSV Report', icon: FileText, desc: 'RFC 4180 compliant CSV. Opens directly in Excel/Sheets. Includes all device fields with proper escaping.' },
  ];

  return (
    <div className="space-y-5 text-left">
      <div>
        <h3 className="text-sm font-bold text-slate-200">Driver Report Generator</h3>
        <p className="text-xs text-slate-400 mt-0.5">Reports are saved to %APPDATA%\SolasCare\reports\ and can be opened from the Report Center tab in the sidebar.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {formats.map(f => (
          <div key={f.id} className="bg-slate-950/40 border border-brand-border rounded-lg p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <f.icon className="h-5 w-5 text-brand-violet" />
              <h4 className="text-xs font-bold text-slate-200">{f.label}</h4>
            </div>
            <p className="text-[11px] text-slate-500 flex-1 mb-3">{f.desc}</p>
            <button
              onClick={() => handleGenerate(f.id)}
              disabled={busy}
              className="w-full px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-[11px] font-bold rounded flex items-center justify-center gap-1 cursor-pointer"
            >
              <FileText className="h-3.5 w-3.5" /> Generate {f.id.toUpperCase()}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4 text-xs text-slate-400">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Report Contents</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>Computer name, Windows version/build, architecture</li>
          <li>Scan date, scan duration, health score</li>
          <li>Summary counts: total devices, healthy, missing, disabled, warnings, unsigned</li>
          <li>Full device inventory (device name, manufacturer, version, date, provider, signer, INF, PnP ID, HW ID, status, problem code)</li>
          <li>Report ID (GUID) for traceability</li>
        </ul>
      </div>
    </div>
  );
}

// =====================================================================
// Sub-tab: Remote (WinRM)
// =====================================================================
function RemoteTab({ onStatus, onRebootRequired }) {
  const [computerName, setComputerName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [action, setAction] = useState('test');
  const [remoteSavePath, setRemoteSavePath] = useState('C:\\Temp\\DriverBackup');
  const [remoteInfPath, setRemoteInfPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [remoteDevices, setRemoteDevices] = useState([]);

  const handleExecute = async () => {
    if (!computerName) { onStatus('Enter a remote computer name.'); return; }
    setBusy(true);
    onStatus(`Executing ${action} on ${computerName}...`);
    setResult(null);
    // Build cred JSON up-front; we will clear password from React state immediately
    // after IPC dispatch so it doesn't sit in memory for the whole remote op.
    const credJson = (username && password) ? JSON.stringify({ user: username, password }) : '';
    try {
      if (window.api) {
        let args;
        if (action === 'backup') {
          args = [action, computerName, '', remoteSavePath, credJson];
        } else if (action === 'install') {
          args = [action, computerName, remoteInfPath, '', credJson];
        } else {
          args = [action, computerName, '', '', credJson];
        }
        // Clear password immediately - IPC has its own copy, we don't need ours anymore.
        setPassword('');
        const res = await window.api.runSystemCommand('driver-remote', args);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        if (m) {
          const obj = JSON.parse(m[0]);
          setResult(obj);
          if (action === 'scan' && obj.success) {
            setRemoteDevices(obj.devices || []);
          }
          if (obj.rebootRequired) onRebootRequired?.(true);
          onStatus(`${action} ${obj.success ? 'succeeded' : 'failed'} on ${computerName}.`);
        } else {
          onStatus(`Remote ${action} failed: no JSON output.`);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 text-left">
      <div>
        <h3 className="text-sm font-bold text-slate-200">Remote Driver Operations</h3>
        <p className="text-xs text-slate-400 mt-0.5">WinRM-based remote administration. Target must have Enable-PSRemoting enabled and WinRM (TCP 5985/5986) allowed through firewall.</p>
      </div>

      {/* Connection form */}
      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Remote Computer Name</label>
          <input
            type="text"
            value={computerName}
            onChange={(e) => setComputerName(e.target.value)}
            placeholder="PC-007 or 192.168.1.50"
            className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 focus:outline-none focus:border-brand-violet"
          >
            <option value="test">Test WinRM Connection</option>
            <option value="scan">Scan Remote Drivers</option>
            <option value="install">Install INF on Remote</option>
            <option value="backup">Backup Drivers on Remote</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username (optional)</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="DOMAIN\admin or admin@domain.local"
            className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password (optional)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
        </div>

        {action === 'install' && (
          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Local INF Path (will be copied to remote)</label>
            <input
              type="text"
              value={remoteInfPath}
              onChange={(e) => setRemoteInfPath(e.target.value)}
              placeholder="C:\Drivers\oem5.inf"
              className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
            />
          </div>
        )}

        {action === 'backup' && (
          <div className="md:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Remote Save Path (on target machine)</label>
            <input
              type="text"
              value={remoteSavePath}
              onChange={(e) => setRemoteSavePath(e.target.value)}
              placeholder="C:\Temp\DriverBackup"
              className="w-full px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
            />
          </div>
        )}

        <div className="md:col-span-2 flex items-center gap-3">
          <button
            onClick={handleExecute}
            disabled={busy || !computerName}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Server className="h-4 w-4" /> {busy ? 'Working...' : 'Execute'}
          </button>
          <span className="text-[10px] text-slate-500 flex items-center gap-1">
            <Lock className="h-3 w-3" /> Credentials are passed via IPC, used once, and cleared from PowerShell memory after the operation.
          </span>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-lg p-3 border text-xs ${
          result.success ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-rose-950/30 border-rose-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {result.success ? <CheckCircle className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-rose-400" />}
            <span className="font-bold text-slate-200">{result.success ? 'Operation succeeded' : 'Operation failed'}</span>
          </div>
          {result.error && <div className="text-rose-400 mt-1">{result.error}</div>}
          {result.winrmReachable === false && (
            <div className="text-slate-400 mt-1">
              WinRM not reachable. On the target, run: <code className="bg-slate-900 px-1 rounded">Enable-PSRemoting -Force</code> and open TCP 5985 in Windows Firewall.
            </div>
          )}
          {result.deviceCount !== undefined && <div className="text-slate-400 mt-1">{result.deviceCount} devices found on {result.computerName}</div>}
          {result.exitCode !== undefined && <div className="text-slate-400 mt-1">pnputil exit code: {result.exitCode} (reboot required: {String(!!result.rebootRequired)})</div>}
          {result.fileCount !== undefined && <div className="text-slate-400 mt-1">Backup created: {result.fileCount} files, {fmtBytes(result.sizeBytes)} at {result.remoteSavePath}</div>}
        </div>
      )}

      {/* Remote device list */}
      {remoteDevices.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Remote Devices ({remoteDevices.length})</h4>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {remoteDevices.map((d, i) => (
              <div key={i} className="text-[11px] border border-brand-border/40 rounded p-2 bg-slate-950/40 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-200 truncate">{d.DeviceName}</div>
                  <div className="text-slate-500 text-[10px] truncate">{d.PnpDeviceId}</div>
                </div>
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                  d.Status === 'OK' ? 'bg-emerald-500/20 text-emerald-400' :
                  d.Status === 'Missing' ? 'bg-rose-500/20 text-rose-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>{d.Status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
