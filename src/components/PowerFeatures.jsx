import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Bug,
  CheckCircle2,
  ChevronRight,
  DatabaseBackup,
  FileArchive,
  FileCog,
  FileText,
  FolderX,
  Gauge,
  Globe2,
  HardDrive,
  Layers3,
  Loader2,
  LockKeyhole,
  Network,
  Power,
  Printer,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Siren,
  Sparkles,
  Terminal,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';

const categories = [
  {
    id: 'system',
    title: 'System Repair',
    icon: Wrench,
    color: 'text-sky-300',
    repairs: [
      ['SFC Scan', 'Repair protected Windows system files', 'repair-system-sfc'],
      ['DISM RestoreHealth', 'Repair Windows component store', 'repair-system-dism'],
      ['CHKDSK Scan', 'Scan C: for file-system issues', 'repair-chkdsk-scan'],
      ['Search Index Rebuild', 'Restart indexing and search repair flow', 'repair-search-index'],
      ['Icon Cache Rebuild', 'Rebuild broken icons and thumbnails', 'repair-icon-cache'],
    ],
  },
  {
    id: 'network',
    title: 'Network Repair',
    icon: Network,
    color: 'text-cyan-300',
    repairs: [
      ['Winsock Reset', 'Reset socket catalog', 'repair-winsock'],
      ['TCP/IP Reset', 'Reset IP stack', 'repair-tcpip'],
      ['DNS Flush', 'Clear resolver cache', 'flush-dns'],
      ['Network Reset', 'Full network repair sequence', 'repair-network-full'],
    ],
  },
  {
    id: 'updates',
    title: 'Windows Update Repair',
    icon: RefreshCw,
    color: 'text-blue-300',
    repairs: [['Reset Update Cache', 'Restart update services and cache folders', 'repair-windows-update']],
  },
  {
    id: 'performance',
    title: 'Performance Fix',
    icon: Gauge,
    color: 'text-emerald-300',
    repairs: [
      ['Temp Cleanup', 'Clear user and system temp folders', 'repair-temp-cleanup'],
      ['Cache Cleanup', 'Clear Windows app and Store cache', 'repair-cache-cleanup'],
      ['Startup Cleanup', 'Collect startup entries for review', 'repair-startup-cleanup'],
    ],
  },
  {
    id: 'permissions',
    title: 'Permission & Registry Repair',
    icon: LockKeyhole,
    color: 'text-amber-300',
    repairs: [
      ['WMI Repair', 'Verify and salvage WMI repository', 'repair-wmi'],
      ['Registry Permission Reset', 'Restore default security policy permissions', 'repair-registry-permissions'],
      ['File Permission Reset', 'Verify user file permissions', 'repair-file-permissions'],
    ],
  },
  {
    id: 'crash',
    title: 'BSOD & Crash Repair',
    icon: Bug,
    color: 'text-rose-300',
    repairs: [['Core BSOD Repair', 'Run SFC and DISM crash repair sequence', 'repair-bsod']],
  },
  {
    id: 'apps',
    title: 'App Repair',
    icon: AppWindow,
    color: 'text-violet-300',
    repairs: [
      ['Microsoft Store Repair', 'Reset Windows Store cache and app package', 'repair-store'],
      ['Edge Safe Launch', 'Launch Edge without extensions', 'repair-edge'],
      ['Office Repair Panel', 'Open app repair control panel', 'repair-office'],
      ['OneDrive Reset', 'Reset OneDrive sync client', 'repair-onedrive'],
    ],
  },
  {
    id: 'services',
    title: 'Service Repair',
    icon: Layers3,
    color: 'text-teal-300',
    repairs: [
      ['Print Spooler', 'Clear stuck print jobs and restart spooler', 'repair-print-spooler'],
      ['Firewall', 'Enable and start Windows Firewall', 'repair-firewall-service'],
      ['Defender', 'Start Windows Defender service', 'repair-defender-service'],
    ],
  },
  {
    id: 'malware',
    title: 'Malware Cleanup',
    icon: Siren,
    color: 'text-red-300',
    repairs: [['Defender Quick Scan', 'Run Microsoft Defender quick scan', 'repair-malware-cleanup']],
  },
  {
    id: 'advanced',
    title: 'Advanced Repair',
    icon: DatabaseBackup,
    color: 'text-orange-300',
    repairs: [
      ['BCD Rebuild', 'Rebuild boot configuration data', 'repair-bcd-rebuild'],
      ['Boot Repair', 'Scan Windows boot entries', 'repair-boot-files'],
      ['System Restore Launcher', 'Create a restore checkpoint', 'repair-system-restore'],
      ['Full System Repair', 'Run SFC, DISM and DNS cleanup sequence', 'quick-full-system-repair'],
    ],
  },
  {
    id: 'collection',
    title: 'Diagnostic Collection',
    icon: FileArchive,
    color: 'text-slate-200',
    repairs: [
      ['Event Log Export', 'Export System and Application EVTX logs', 'export-event-logs'],
      ['Minidump Analyzer', 'Analyze BSOD dump files', 'analyze-bsod'],
      ['Generate Reports', 'Create dxdiag and battery reports', 'collect-reports'],
    ],
  },
];

const quickFixes = [
  ['Internet Fix', Globe2, 'quick-internet-fix'],
  ['Windows Update Fix', RefreshCw, 'repair-windows-update'],
  ['Audio Fix', Activity, 'quick-audio-fix'],
  ['Print Fix', Printer, 'repair-print-spooler'],
  ['Store Fix', AppWindow, 'repair-store'],
  ['Explorer Fix', FolderX, 'quick-explorer-fix'],
  ['Defender Fix', Shield, 'repair-defender-service'],
  ['BSOD Repair', Bug, 'repair-bsod'],
  ['Permission Repair', LockKeyhole, 'repair-permissions'],
  ['Full System Repair', Sparkles, 'quick-full-system-repair'],
];

export default function PowerFeatures() {
  const [selectedCategory, setSelectedCategory] = useState(categories[0].id);
  const [activeCommand, setActiveCommand] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [logs, setLogs] = useState(['[SYSTEM] Power Features console ready.']);
  const [progress, setProgress] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const endRef = useRef(null);

  const selected = useMemo(
    () => categories.find((category) => category.id === selectedCategory) || categories[0],
    [selectedCategory]
  );
  const SelectedIcon = selected.icon;

  useEffect(() => {
    const loadAdmin = async () => {
      if (window.api?.isAdmin) {
        setIsAdmin(await window.api.isAdmin());
      } else {
        setIsAdmin(true);
      }
    };
    loadAdmin();
  }, []);

  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      setLogs((prev) => [...prev, ...data.split('\n').filter(Boolean)]);
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!activeCommand) {
      setProgress((prev) => (prev === 100 ? 100 : 0));
      return undefined;
    }
    setProgress(12);
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 8, 92));
    }, 900);
    return () => clearInterval(interval);
  }, [activeCommand]);

  const runRepair = async (label, commandKey) => {
    setActiveCommand(commandKey);
    setLastResult(null);
    setLogs((prev) => [...prev, '', `[SYSTEM] Starting ${label}...`]);
    try {
      if (!window.api?.runSystemCommand) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setLastResult({ success: true, label, message: 'Completed in browser preview mode.' });
        setLogs((prev) => [...prev, `[SUCCESS] ${label} completed in preview mode.`]);
        return;
      }

      const result = await window.api.runSystemCommand(commandKey);
      if (result.success) {
        setLastResult({ success: true, label, message: 'Repair completed successfully.' });
        const output = result.stdout || result.rawOutput || '';
        setLogs((prev) => [
          ...prev,
          ...(output ? output.split('\n').filter(Boolean) : []),
          `[SUCCESS] ${label} completed.`,
        ]);
      } else if (result.cancelled) {
        setLastResult({ success: false, label, message: 'Operation cancelled.' });
        setLogs((prev) => [...prev, `[CANCELLED] ${label} was cancelled.`]);
      } else {
        setLastResult({ success: false, label, message: result.error || result.stderr || 'Repair failed.' });
        setLogs((prev) => [...prev, `[ERROR] ${label}: ${result.error || result.stderr || 'Repair failed.'}`]);
      }
    } catch (error) {
      setLastResult({ success: false, label, message: error.message });
      setLogs((prev) => [...prev, `[ERROR] ${label}: ${error.message}`]);
    } finally {
      setProgress(100);
      setActiveCommand(null);
    }
  };

  return (
    <div className="p-6 space-y-6 text-left">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2">
              <Zap className="h-6 w-6 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-100">Power Features</h2>
              <p className="text-xs font-semibold text-slate-400">
                Repair-only Windows troubleshooting tools with secured PowerShell/CMD execution
              </p>
            </div>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold ${
            isAdmin
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-300'
          }`}
        >
          {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {isAdmin ? 'Administrator repair mode active' : 'Administrator rights required for most repairs'}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-3 rounded-2xl border border-brand-border bg-slate-950/30 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-200">Quick Fix</h3>
              <p className="text-xs text-slate-500">One-click repair recipes for common Windows issues</p>
            </div>
            <Power className="h-5 w-5 text-cyan-300" />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {quickFixes.map(([label, Icon, commandKey]) => (
              <button
                key={commandKey}
                disabled={activeCommand !== null}
                onClick={() => runRepair(label, commandKey)}
                className="min-h-[92px] rounded-xl border border-slate-700/80 bg-slate-900/80 p-3 text-left transition hover:border-cyan-400/40 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon className="mb-3 h-5 w-5 text-cyan-300" />
                <span className="block text-xs font-black text-slate-100">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 rounded-2xl border border-brand-border bg-slate-950/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-200">Repair Progress</h3>
              <p className="text-xs text-slate-500">Current operation status and result</p>
            </div>
            {activeCommand ? (
              <Loader2 className="h-5 w-5 animate-spin text-brand-violet" />
            ) : lastResult?.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
            ) : lastResult ? (
              <XCircle className="h-5 w-5 text-rose-300" />
            ) : (
              <Terminal className="h-5 w-5 text-slate-400" />
            )}
          </div>

          <div className="space-y-4">
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  lastResult?.success ? 'bg-emerald-400' : lastResult ? 'bg-rose-400' : 'bg-cyan-400'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-xs font-bold text-slate-300">
                {activeCommand
                  ? 'Repair running...'
                  : lastResult
                    ? lastResult.label
                    : 'No repair running'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {activeCommand
                  ? 'Keep this app open while Windows completes the operation.'
                  : lastResult?.message || 'Choose a quick fix or category repair to begin.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-4 rounded-2xl border border-brand-border bg-slate-950/30 p-4">
          <div className="mb-3 px-1 text-xs font-bold uppercase text-slate-500">Repair Categories</div>
          <div className="space-y-2">
            {categories.map((category) => {
              const Icon = category.icon;
              const isActive = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition ${
                    isActive
                      ? 'border-cyan-400/40 bg-cyan-400/10'
                      : 'border-slate-800 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/80'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${category.color}`} />
                    <span>
                      <span className="block text-xs font-black text-slate-100">{category.title}</span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        {category.repairs.length} repair tools
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-5 rounded-2xl border border-brand-border bg-slate-950/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <SelectedIcon className={`h-6 w-6 ${selected.color}`} />
            <div>
              <h3 className="text-sm font-black text-slate-100">{selected.title}</h3>
              <p className="text-xs text-slate-500">Targeted fix actions, not monitoring</p>
            </div>
          </div>

          <div className="space-y-3">
            {selected.repairs.map(([label, description, commandKey]) => (
              <button
                key={commandKey}
                disabled={activeCommand !== null}
                onClick={() => runRepair(label, commandKey)}
                className="group flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-cyan-400/40 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-3">
                  <FileCog className="h-5 w-5 text-slate-400 group-hover:text-cyan-300" />
                  <span>
                    <span className="block text-xs font-black text-slate-100">{label}</span>
                    <span className="text-[11px] font-medium text-slate-500">{description}</span>
                  </span>
                </span>
                <span className="rounded-lg border border-slate-700 px-3 py-1 text-[10px] font-black uppercase text-slate-300">
                  Run
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="xl:col-span-3 rounded-2xl border border-brand-border bg-slate-950/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase text-slate-200">Execution Log</h3>
              <p className="text-xs text-slate-500">PowerShell/CMD output</p>
            </div>
            <FileText className="h-5 w-5 text-slate-400" />
          </div>

          <div className="h-[430px] overflow-y-auto rounded-xl border border-slate-800 bg-black/40 p-4 font-mono text-[10px] leading-relaxed text-emerald-300">
            {logs.map((line, index) => (
              <p
                key={`${line}-${index}`}
                className={
                  line.startsWith('[ERROR]')
                    ? 'text-rose-300'
                    : line.startsWith('[SUCCESS]')
                      ? 'text-emerald-300'
                      : line.startsWith('[CANCELLED]')
                        ? 'text-amber-300'
                        : 'text-slate-300'
                }
              >
                {line}
              </p>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </section>
    </div>
  );
}
