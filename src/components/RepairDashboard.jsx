import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  Bug,
  CheckCircle2,
  ClipboardList,
  FileText,
  Globe2,
  HardDrive,
  LifeBuoy,
  Network,
  Loader2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  Zap,
} from 'lucide-react';

const repairCards = [
  ['Internet Repair', 'DNS, Winsock, TCP/IP and adapter recovery', Globe2, 'fix'],
  ['Windows Update Repair', 'Reset update cache, BITS and update services', ClipboardList, 'power'],
  ['Performance Fix', 'Temp cleanup, cache cleanup and startup review', Zap, 'fix'],
  ['Crash Repair', 'BSOD, random crash and dump diagnostics', Bug, 'fix'],
  ['App Repair', 'Store, Edge, Office and OneDrive recovery', AppWindow, 'fix'],
  ['Advanced Boot Repair', 'BCD, boot scan and restore-point launcher', HardDrive, 'power'],
];

export default function RepairDashboard({ setActiveTab }) {
  const careSteps = [
    ['Restore Point', 'repair-system-restore'],
    ['Temp Cleanup', 'repair-temp-cleanup'],
    ['DNS Flush', 'flush-dns'],
    ['Network Reset', 'repair-network-full'],
    ['SFC Repair', 'repair-system-sfc'],
    ['DISM Repair', 'repair-system-dism'],
    ['CHKDSK Scan', 'repair-chkdsk-scan'],
  ];
  const [careMode, setCareMode] = useState('idle');
  const [careIndex, setCareIndex] = useState(0);
  const [careProgress, setCareProgress] = useState(0);
  const [careLogs, setCareLogs] = useState(['[SYSTEM] One Click Care ready. Choose manual or automatic mode.']);
  const [careStatus, setCareStatus] = useState('Ready for repair.');
  const careEndRef = useRef(null);

  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      setCareLogs((prev) => [...prev, ...data.split('\n').filter(Boolean)]);
    });
  }, []);

  useEffect(() => {
    careEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [careLogs]);

  const runCareStep = async (stepIndex = careIndex) => {
    const [label, commandKey] = careSteps[stepIndex];
    setCareMode('running');
    setCareStatus(`Running ${label}...`);
    setCareLogs((prev) => [...prev, '', `[SYSTEM] One by One: ${label}`]);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand(commandKey)
        : { success: true, stdout: 'Preview mode completed.' };
      if (result.success) {
        const nextIndex = Math.min(stepIndex + 1, careSteps.length - 1);
        setCareIndex(nextIndex);
        setCareProgress(Math.round(((stepIndex + 1) / careSteps.length) * 100));
        setCareStatus(`${label} completed.`);
        setCareLogs((prev) => [
          ...prev,
          ...(result.stdout ? result.stdout.split('\n').filter(Boolean) : []),
          `[SUCCESS] ${label} completed.`,
        ]);
      } else if (result.cancelled) {
        setCareStatus(`${label} cancelled.`);
        setCareLogs((prev) => [...prev, `[CANCELLED] ${label} cancelled.`]);
      } else {
        setCareStatus(result.error || `${label} failed.`);
        setCareLogs((prev) => [...prev, `[ERROR] ${result.error || result.stderr || `${label} failed.`}`]);
      }
    } catch (error) {
      setCareStatus(error.message);
      setCareLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
    } finally {
      setCareMode('idle');
    }
  };

  const runFullCare = async () => {
    setCareMode('running');
    setCareIndex(0);
    setCareProgress(10);
    setCareStatus('Running full one-click repair...');
    setCareLogs((prev) => [...prev, '', '[SYSTEM] One Click: Full System Repair']);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand('quick-full-system-repair')
        : { success: true, stdout: 'Preview mode completed.' };
      setCareProgress(100);
      if (result.success) {
        setCareStatus('Full one-click repair completed.');
        setCareLogs((prev) => [
          ...prev,
          ...(result.stdout ? result.stdout.split('\n').filter(Boolean) : []),
          '[SUCCESS] Full one-click repair completed.',
        ]);
      } else if (result.cancelled) {
        setCareStatus('Full repair cancelled.');
        setCareLogs((prev) => [...prev, '[CANCELLED] Full repair cancelled.']);
      } else {
        setCareStatus(result.error || 'Full repair failed.');
        setCareLogs((prev) => [...prev, `[ERROR] ${result.error || result.stderr || 'Full repair failed.'}`]);
      }
    } catch (error) {
      setCareStatus(error.message);
      setCareLogs((prev) => [...prev, `[ERROR] ${error.message}`]);
    } finally {
      setCareMode('idle');
    }
  };

  return (
    <div className="p-6 space-y-6 text-left">
      <section className="rounded-2xl border border-brand-border bg-slate-950/30 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2">
                <LifeBuoy className="h-7 w-7 text-cyan-300" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-100">Windows Repair Center</h2>
                <p className="text-xs font-semibold text-slate-400">
                  Guided troubleshooting and secured one-click repairs for normal users and support engineers
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['Safe commands', ShieldCheck],
                ['Restore-point aware', CheckCircle2],
                ['Detailed repair logs', FileText],
              ].map(([label, Icon]) => (
                <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <Icon className="mb-2 h-4 w-4 text-emerald-300" />
                  <span className="text-xs font-bold text-slate-200">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <button
              onClick={() => setActiveTab('fix')}
              className="rounded-xl bg-cyan-400 px-5 py-3 text-xs font-black text-slate-950 transition hover:bg-cyan-300"
            >
              Fix My Problem
            </button>
            <button
              onClick={() => setActiveTab('power')}
              className="rounded-xl border border-brand-border bg-slate-900 px-5 py-3 text-xs font-black text-slate-100 transition hover:bg-slate-800"
            >
              Open Power Features
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-cyan-300" />
                <h3 className="text-lg font-black text-slate-100">One Click Care</h3>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Run repairs step-by-step for control, or use one-click mode for an automatic repair sequence.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                disabled={careMode === 'running'}
                onClick={() => runCareStep(careIndex)}
                className="rounded-xl border border-brand-border bg-slate-900 px-4 py-2 text-xs font-black text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {careMode === 'running' ? 'Running...' : 'Run Next Step'}
              </button>
              <button
                disabled={careMode === 'running'}
                onClick={runFullCare}
                className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                One Click Full Repair
              </button>
            </div>
          </div>

          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${careProgress}%` }} />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
            {careSteps.map(([label], index) => {
              const done = index < careIndex && careProgress > 0;
              const active = index === careIndex;
              return (
                <button
                  key={label}
                  disabled={careMode === 'running'}
                  onClick={() => runCareStep(index)}
                  className={`min-h-[82px] rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? 'border-cyan-400/50 bg-cyan-400/10'
                      : done
                        ? 'border-emerald-400/30 bg-emerald-400/10'
                        : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800'
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-300" />
                  ) : active && careMode === 'running' ? (
                    <Loader2 className="mb-2 h-4 w-4 animate-spin text-cyan-300" />
                  ) : (
                    <Wrench className="mb-2 h-4 w-4 text-cyan-300" />
                  )}
                  <span className="text-[11px] font-black text-slate-100">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="xl:col-span-4 rounded-2xl border border-brand-border bg-slate-950/40 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-100">Care Log</h3>
              <p className="text-xs font-semibold text-slate-500">{careStatus}</p>
            </div>
            <Terminal className="h-5 w-5 text-slate-400" />
          </div>
          <div className="h-[220px] overflow-y-auto rounded-xl border border-slate-800 bg-black/40 p-4 font-mono text-[10px] leading-relaxed">
            {careLogs.map((line, index) => (
              <p key={`${line}-${index}`} className={line.startsWith('[ERROR]') ? 'text-rose-300' : line.startsWith('[SUCCESS]') ? 'text-emerald-300' : 'text-slate-300'}>
                {line}
              </p>
            ))}
            <div ref={careEndRef} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {repairCards.map(([title, desc, Icon, tab]) => (
          <button
            key={title}
            onClick={() => setActiveTab(tab)}
            className="group min-h-[150px] rounded-2xl border border-brand-border bg-slate-950/30 p-5 text-left transition hover:border-cyan-400/40 hover:bg-slate-900"
          >
            <div className="mb-5 flex items-center justify-between">
              <Icon className="h-7 w-7 text-cyan-300" />
              <Wrench className="h-4 w-4 text-slate-600 group-hover:text-cyan-300" />
            </div>
            <h3 className="text-sm font-black text-slate-100">{title}</h3>
            <p className="mt-2 text-xs font-medium text-slate-500">{desc}</p>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
          <AlertTriangle className="mb-3 h-5 w-5 text-amber-300" />
          <h3 className="text-sm font-black text-slate-100">Repair Philosophy</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            The app is organized around fixing issues first: choose a symptom, run detection, apply a safe fix, then review logs.
          </p>
        </div>
        <div className="rounded-2xl border border-brand-border bg-slate-950/30 p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-black text-slate-100">Common Repair Paths</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['Network', 'Detect -> Flush DNS -> Winsock/TCP reset', Network],
              ['Slow PC', 'Detect -> Temp cleanup -> Startup review', Sparkles],
              ['BSOD', 'Detect dumps -> SFC -> DISM repair', Bug],
            ].map(([title, detail, Icon]) => (
              <div key={title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <Icon className="mb-3 h-5 w-5 text-cyan-300" />
                <p className="text-xs font-black text-slate-100">{title}</p>
                <p className="mt-1 text-[11px] font-medium text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
