import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  Bug,
  CheckCircle2,
  Cpu,
  FileWarning,
  Globe2,
  HardDrive,
  Headphones,
  Keyboard,
  Loader2,
  LockKeyhole,
  Mic,
  MonitorUp,
  Network,
  Printer,
  Search,
  Shield,
  Store,
  Terminal,
  Usb,
  Video,
  Wifi,
  Wrench,
  XCircle,
} from 'lucide-react';

const issues = [
  ['Internet not working', Globe2, 'detect-network', 'quick-internet-fix', 'repair-network-full'],
  ['Wi-Fi connected but no internet', Wifi, 'detect-network', 'quick-internet-fix', 'repair-network-full'],
  ['Slow internet', Network, 'detect-network', 'flush-dns', 'repair-network-full'],
  ['Windows Update failed', MonitorUp, 'detect-services', 'repair-windows-update', 'repair-system-dism'],
  ['PC running slow', Cpu, 'detect-performance', 'repair-temp-cleanup', 'quick-full-system-repair'],
  ['High Disk Usage (100%)', HardDrive, 'detect-performance', 'repair-temp-cleanup', 'repair-chkdsk-scan'],
  ['High CPU Usage', Cpu, 'detect-performance', 'repair-startup-cleanup', 'repair-system-sfc'],
  ['Start Menu not opening', Keyboard, 'detect-services', 'quick-explorer-fix', 'repair-system-sfc'],
  ['Search not working', Search, 'detect-services', 'repair-search-index', 'repair-wmi'],
  ['Taskbar frozen', Keyboard, 'detect-services', 'quick-explorer-fix', 'repair-system-sfc'],
  ['File Explorer crashing', FileWarning, 'detect-crashes', 'quick-explorer-fix', 'repair-icon-cache'],
  ['Audio not working', Headphones, 'detect-services', 'quick-audio-fix', 'repair-system-sfc'],
  ['Microphone not working', Mic, 'detect-services', 'quick-audio-fix', 'repair-permissions'],
  ['Bluetooth not working', Bluetooth, 'detect-services', 'detect-services', 'repair-system-sfc'],
  ['Printer not printing', Printer, 'detect-services', 'repair-print-spooler', 'repair-system-sfc'],
  ['USB device not detected', Usb, 'scan-drivers', 'scan-drivers', 'repair-system-sfc'],
  ['Webcam not working', Video, 'scan-drivers', 'scan-drivers', 'repair-permissions'],
  ['Microsoft Store not opening', Store, 'detect-services', 'repair-store', 'repair-windows-update'],
  ['Microsoft Store download stuck', Store, 'detect-network', 'repair-store', 'repair-windows-update'],
  ['OneDrive sync issues', Globe2, 'detect-network', 'repair-onedrive', 'quick-internet-fix'],
  ['Office not opening', FileWarning, 'detect-crashes', 'repair-office', 'repair-system-sfc'],
  ['Application not opening', FileWarning, 'detect-crashes', 'repair-system-sfc', 'repair-system-dism'],
  ['Missing DLL errors', FileWarning, 'detect-crashes', 'repair-system-sfc', 'repair-system-dism'],
  ['Permission denied errors', LockKeyhole, 'detect-services', 'repair-permissions', 'repair-registry-permissions'],
  ['Administrator access issues', LockKeyhole, 'detect-services', 'repair-permissions', 'repair-registry-permissions'],
  ['Windows Defender not working', Shield, 'detect-services', 'repair-defender-service', 'repair-malware-cleanup'],
  ['Firewall issues', Shield, 'detect-services', 'repair-firewall-service', 'repair-network-full'],
  ['Blue Screen (BSOD)', Bug, 'detect-crashes', 'repair-bsod', 'analyze-bsod'],
  ['Random crashes', Bug, 'detect-crashes', 'repair-system-sfc', 'repair-bsod'],
  ['Login issues', LockKeyhole, 'detect-crashes', 'repair-system-sfc', 'repair-system-dism'],
  ['Startup issues', MonitorUp, 'detect-crashes', 'repair-startup-cleanup', 'repair-bcd-scan'],
  ['Boot issues', HardDrive, 'detect-crashes', 'repair-bcd-scan', 'repair-boot-files'],
  ['Network adapter issues', Network, 'detect-network', 'quick-internet-fix', 'scan-drivers'],
  ['VPN issues', Network, 'detect-network', 'repair-winsock', 'repair-network-full'],
];

export default function FixMyProblem() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(issues[0]);
  const [activeAction, setActiveAction] = useState(null);
  const [status, setStatus] = useState({ state: 'idle', text: 'Select an issue and run detection.' });
  const [logs, setLogs] = useState(['[SYSTEM] Guided repair console ready.']);
  const [progress, setProgress] = useState(0);
  const endRef = useRef(null);

  const filteredIssues = useMemo(
    () => issues.filter(([title]) => title.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      setLogs((prev) => [...prev, ...data.split('\n').filter(Boolean)]);
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const run = async (label, commandKey) => {
    setActiveAction(label);
    setStatus({ state: 'running', text: `${label} running for ${selected[0]}...` });
    setProgress(15);
    setLogs((prev) => [...prev, '', `[SYSTEM] ${label}: ${selected[0]}`]);
    const timer = setInterval(() => setProgress((prev) => Math.min(prev + 10, 90)), 700);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand(commandKey)
        : { success: true, stdout: 'Preview mode completed.' };
      if (result.success) {
        setStatus({ state: 'success', text: `${label} completed successfully.` });
        setLogs((prev) => [
          ...prev,
          ...(result.stdout ? result.stdout.split('\n').filter(Boolean) : []),
          `[SUCCESS] ${label} completed.`,
        ]);
      } else if (result.cancelled) {
        setStatus({ state: 'cancelled', text: `${label} was cancelled.` });
        setLogs((prev) => [...prev, `[CANCELLED] ${label} cancelled.`]);
      } else {
        setStatus({ state: 'error', text: result.error || 'Repair failed.' });
        setLogs((prev) => [...prev, `[ERROR] ${result.error || result.stderr || 'Repair failed.'}`]);
      }
    } catch (error) {
      setStatus({ state: 'error', text: error.message });
      setLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
    } finally {
      clearInterval(timer);
      setProgress(100);
      setActiveAction(null);
    }
  };

  const SelectedIcon = selected[1];

  return (
    <div className="grid min-h-full grid-cols-1 gap-6 p-6 text-left xl:grid-cols-12">
      <section className="xl:col-span-4 rounded-2xl border border-brand-border bg-slate-950/30 p-5">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-100">Fix My Problem</h2>
          <p className="text-xs font-semibold text-slate-500">Choose a symptom, detect root cause, then apply a safe repair path.</p>
        </div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Windows issue..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-xs font-semibold text-slate-100 outline-none focus:border-cyan-400"
          />
        </div>
        <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
          {filteredIssues.map((issue) => {
            const [title, Icon] = issue;
            const isActive = selected[0] === title;
            return (
              <button
                key={title}
                onClick={() => setSelected(issue)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  isActive ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-slate-800 bg-slate-900/50 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4 text-cyan-300" />
                <span className="text-xs font-bold text-slate-100">{title}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="xl:col-span-5 space-y-6">
        <div className="rounded-2xl border border-brand-border bg-slate-950/30 p-6">
          <div className="mb-5 flex items-center gap-4">
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3">
              <SelectedIcon className="h-7 w-7 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-100">{selected[0]}</h3>
              <p className="text-xs font-semibold text-slate-500">Guided repair workflow with detection, auto fix and advanced fix.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['Detect Problem', selected[2], Terminal],
              ['Auto Fix', selected[3], Wrench],
              ['Advanced Fix', selected[4], AlertTriangle],
              ['View Logs', 'read-repair-history', FileWarning],
            ].map(([label, commandKey, Icon]) => (
              <button
                key={label}
                disabled={activeAction !== null}
                onClick={() => run(label, commandKey)}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-cyan-400/40 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon className="mb-4 h-5 w-5 text-cyan-300" />
                <span className="block text-xs font-black text-slate-100">{label}</span>
                <span className="mt-1 block text-[11px] font-medium text-slate-500">
                  {label === 'Detect Problem' ? 'Inspect likely service, event or system causes.' : label === 'View Logs' ? 'Read repair history and audit entries.' : 'Run secured repair operation.'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-brand-border bg-slate-950/30 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-100">Repair Status</h3>
            {status.state === 'running' ? <Loader2 className="h-5 w-5 animate-spin text-cyan-300" /> : status.state === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-300" /> : status.state === 'error' ? <XCircle className="h-5 w-5 text-rose-300" /> : <Wrench className="h-5 w-5 text-slate-500" />}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-400">{status.text}</p>
        </div>
      </section>

      <section className="xl:col-span-3 rounded-2xl border border-brand-border bg-slate-950/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black text-slate-100">Detailed Logs</h3>
          <Terminal className="h-5 w-5 text-slate-400" />
        </div>
        <div className="h-[640px] overflow-y-auto rounded-xl border border-slate-800 bg-black/40 p-4 font-mono text-[10px] leading-relaxed">
          {logs.map((line, index) => (
            <p key={`${line}-${index}`} className={line.startsWith('[ERROR]') ? 'text-rose-300' : line.startsWith('[SUCCESS]') ? 'text-emerald-300' : 'text-slate-300'}>
              {line}
            </p>
          ))}
          <div ref={endRef} />
        </div>
      </section>
    </div>
  );
}
