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
  Activity,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { motion } from 'framer-motion';
import CommandOutput from './shared/CommandOutput';

const repairCards = [
  ['Internet Repair', 'DNS, Winsock, TCP/IP and adapter recovery', Globe2, 'network'],
  ['Windows Update Repair', 'Reset update cache, BITS and update services', ClipboardList, 'software'],
  ['Performance Fix', 'Temp cleanup, cache cleanup and startup review', Zap, 'maintenance'],
  ['Crash Repair', 'BSOD, random crash and dump diagnostics', Bug, 'diagnostics'],
  ['App Repair', 'Store, Edge, Office and OneDrive recovery', AppWindow, 'browser'],
  ['Advanced Boot Repair', 'BCD, boot scan and restore-point launcher', HardDrive, 'windows'],
];

export default function RepairDashboard({ setActiveTab }) {
  const careSteps = [
    ['Restore Point', 'create-restore-point'],
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
  const [careLogs, setCareLogs] = useState([]);
  const [careStatus, setCareStatus] = useState('Ready for system diagnostics.');
  const careEndRef = useRef(null);

  useEffect(() => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setCareLogs([`[${time}] [SYSTEM] One Click Care ready. Choose manual steps or trigger full scan.`]);
  }, []);

  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      const time = new Date().toLocaleTimeString(undefined, { hour12: false });
      setCareLogs((prev) => [...prev, ...data.split('\n').filter(Boolean).map(line => `[${time}] ${line}`)]);
    });
  }, []);

  useEffect(() => {
    careEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [careLogs]);

  const runCareStep = async (stepIndex = careIndex) => {
    const [label, commandKey] = careSteps[stepIndex];
    setCareMode('running');
    setCareStatus(`Running system repair: ${label}...`);
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setCareLogs((prev) => [...prev, `[${time}] [SYSTEM] Executing Stage ${stepIndex + 1}: ${label}`]);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand(commandKey)
        : { success: true, stdout: 'Preview mode completed.' };
      const doneTime = new Date().toLocaleTimeString(undefined, { hour12: false });
      if (result.success) {
        const nextIndex = Math.min(stepIndex + 1, careSteps.length - 1);
        setCareIndex(nextIndex);
        setCareProgress(Math.round(((stepIndex + 1) / careSteps.length) * 100));
        setCareStatus(`${label} executed successfully.`);
        setCareLogs((prev) => [
          ...prev,
          ...(result.stdout ? result.stdout.split('\n').filter(Boolean).map(l => `[${doneTime}] ${l}`) : []),
          `[${doneTime}] [SUCCESS] ${label} completed.`,
        ]);
      } else if (result.cancelled) {
        setCareStatus(`${label} execution aborted.`);
        setCareLogs((prev) => [...prev, `[${doneTime}] [CANCELLED] ${label} execution cancelled.`]);
      } else {
        setCareStatus(result.error || `${label} failed.`);
        setCareLogs((prev) => [...prev, `[${doneTime}] [ERROR] ${result.error || result.stderr || `${label} failed.`}`]);
      }
    } catch (error) {
      const errTime = new Date().toLocaleTimeString(undefined, { hour12: false });
      setCareStatus(error.message);
      setCareLogs((prev) => [...prev, `[${errTime}] [ERROR] ${error.message}`]);
    } finally {
      setCareMode('idle');
    }
  };

  const runFullCare = async () => {
    setCareMode('running');
    setCareIndex(0);
    setCareProgress(10);
    setCareStatus('Initializing automatic full PC optimization sequence...');
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setCareLogs((prev) => [...prev, `[${time}] [SYSTEM] Beginning full automatic care protocol...`]);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand('quick-full-system-repair')
        : { success: true, stdout: 'Preview mode completed.' };
      setCareProgress(100);
      const doneTime = new Date().toLocaleTimeString(undefined, { hour12: false });
      if (result.success) {
        setCareStatus('Full system care optimization completed.');
        setCareLogs((prev) => [
          ...prev,
          ...(result.stdout ? result.stdout.split('\n').filter(Boolean).map(l => `[${doneTime}] ${l}`) : []),
          `[${doneTime}] [SUCCESS] Full system optimization completed.`,
        ]);
      } else if (result.cancelled) {
        setCareStatus('Full scan aborted.');
        setCareLogs((prev) => [...prev, `[${doneTime}] [CANCELLED] System scan cancelled.`]);
      } else {
        setCareStatus(result.error || 'Full repair failed.');
        setCareLogs((prev) => [...prev, `[${doneTime}] [ERROR] ${result.error || result.stderr || 'Full repair failed.'}`]);
      }
    } catch (error) {
      const errTime = new Date().toLocaleTimeString(undefined, { hour12: false });
      setCareStatus(error.message);
      setCareLogs((prev) => [...prev, `[${errTime}] [ERROR] ${error.message}`]);
    } finally {
      setCareMode('idle');
    }
  };

  return (
    <div className="p-6 space-y-8 select-none max-w-7xl mx-auto">
      {/* Redesigned Premium Hero Panel */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Side: Status Widget */}
        <div className="lg:col-span-8 glass-panel border border-brand-border/60 p-6 rounded-[18px] text-left flex flex-col justify-between h-52 relative overflow-hidden bg-gradient-to-br from-brand-navy via-slate-900 to-brand-navy">
          <div className="absolute right-0 top-0 h-40 w-40 bg-brand-violet/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute left-1/3 bottom-0 h-24 w-24 bg-brand-cyan/5 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand-cyan animate-ping"></span>
              <span className="text-[10px] text-brand-cyan font-bold uppercase tracking-wider">System Protection Status</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-brand-cyan" />
              Your PC is Guarded
            </h2>
            <p className="text-xs text-slate-400 max-w-xl font-medium">
              Diagnostic scanners are initialized. Execute a full one-click repair sequence to optimize RAM sectors, clear caches, repair system hives, and sweep disk junk.
            </p>
          </div>

          <div className="border-t border-brand-border/40 pt-4 flex justify-between items-center text-xs">
            <div className="text-slate-400">
              Last Diagnostic: <span className="text-slate-200 font-semibold">Today</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('fix')}
                className="px-3.5 py-1.5 bg-slate-800 border border-brand-border/60 hover:border-brand-violet rounded-lg font-bold text-slate-200 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 hover:scale-[1.02]"
              >
                Diagnostics Hub <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: The Windows 11 Inspired Giant Circular Action Button */}
        <div className="lg:col-span-4 glass-panel border border-brand-border/60 p-6 rounded-[18px] h-52 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-tr from-brand-navy to-slate-900">
          <div className="absolute inset-0 bg-brand-violet/5 pointer-events-none"></div>
          
          {/* Circular Button Wrapper with Pulsing Rings */}
          <div className="relative">
            {/* Pulsing ring wrapper */}
            <div className={`absolute -inset-2.5 rounded-full bg-gradient-to-r from-brand-violet to-brand-cyan opacity-40 blur-sm pointer-events-none transition-all duration-300 ${careMode === 'running' ? 'animate-pulse-ring' : ''}`}></div>
            
            <button
              disabled={careMode === 'running'}
              onClick={runFullCare}
              className={`relative w-28 h-28 rounded-full bg-slate-950 border-2 border-brand-border/80 flex flex-col items-center justify-center transition-all duration-300 select-none group cursor-pointer hover:border-brand-violet ${
                careMode === 'running' ? 'scale-95' : 'hover:scale-105 active:scale-95'
              }`}
            >
              {/* Rotating inner dash border */}
              <div className={`absolute inset-1.5 rounded-full border border-dashed border-brand-cyan/20 pointer-events-none ${careMode === 'running' ? 'animate-rotate-slow border-brand-violet' : ''}`}></div>
              
              {careMode === 'running' ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-brand-violet" />
                  <span className="text-[10px] font-bold text-brand-violet tracking-wider uppercase mt-1">Fixing...</span>
                </>
              ) : (
                <>
                  <Zap className="h-7 w-7 text-brand-cyan group-hover:text-brand-violet transition-colors duration-300 group-hover:scale-110 transform" />
                  <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest mt-1.5 group-hover:text-white select-none">SCAN NOW</span>
                  <span className="text-[8px] text-slate-500 font-bold tracking-wider mt-0.5 select-none">One-Click</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Main Core Monitoring & Sequence Section */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* One Click Repair Steps Pipeline */}
        <div className="xl:col-span-7 glass-panel border border-brand-border/60 p-5 rounded-[18px] flex flex-col justify-between bg-slate-900/20">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-cyan" />
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">One-Click Care Stage Tracker</h3>
              </div>
              <span className="text-xs font-bold text-brand-violet">{careProgress}%</span>
            </div>

            {/* Glowing System Progress Bar */}
            <div className="w-full bg-slate-950 h-2.5 rounded-full border border-brand-border/40 overflow-hidden relative">
              <div 
                className="bg-gradient-to-r from-brand-violet to-brand-cyan h-full rounded-full transition-all duration-300"
                style={{ width: `${careProgress}%` }}
              ></div>
            </div>

            {/* Stage Steps Selector List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {careSteps.map(([label, commandKey], index) => {
                const done = index < careIndex && careProgress > 0;
                const active = index === careIndex;
                return (
                  <button
                    key={label}
                    disabled={careMode === 'running'}
                    onClick={() => runCareStep(index)}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between min-h-[82px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 select-none ${
                      active
                        ? 'border-brand-violet bg-brand-violet/10 neon-border-glow-violet shadow-lg'
                        : done
                          ? 'border-emerald-500/20 bg-emerald-950/20 text-emerald-400'
                          : 'border-brand-border/50 bg-slate-900/40 hover:bg-slate-800/40 hover:border-brand-cyan/30'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Stage {index + 1}</span>
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : active && careMode === 'running' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-violet shrink-0" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-200 mt-2 truncate max-w-full block" title={label}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="border-t border-brand-border/40 pt-3 mt-4 text-[10px] text-slate-500 italic flex justify-between select-none">
            <span>* Single-click stages to run them manually.</span>
            <span className="text-slate-400 font-semibold">{careStatus}</span>
          </div>
        </div>

        {/* Live Engine Stream Logger Console */}
        <div className="xl:col-span-5">
          <CommandOutput
            logs={careLogs}
            onClear={() => setCareLogs([])}
            title="System Engine Console"
            isRunning={careMode === 'running'}
            onCancel={window.api ? () => window.api.killActiveProcess() : null}
          />
        </div>
      </section>

      {/* Advanced Repair Utilities Cards Grid */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest text-left select-none">Advanced Troubleshooting Modules</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repairCards.map(([title, desc, Icon, tab]) => (
            <button
              key={title}
              onClick={() => setActiveTab(tab)}
              className="glass-panel border border-brand-border/60 rounded-[18px] p-5 text-left transition duration-300 hover:border-brand-violet hover:-translate-y-0.5 cursor-pointer shadow-lg group relative overflow-hidden bg-slate-900/10"
            >
              <div className="absolute right-0 top-0 h-20 w-20 bg-brand-violet/5 rounded-full blur-xl pointer-events-none group-hover:bg-brand-violet/10 transition-all"></div>
              
              <div className="mb-5 flex items-center justify-between">
                <div className="p-2.5 rounded-lg border border-brand-border bg-slate-800/40 group-hover:border-brand-violet/40 transition-colors">
                  <Icon className="h-6 w-6 text-brand-cyan group-hover:text-brand-violet transition-colors" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors transform group-hover:translate-x-1" />
              </div>
              <h3 className="text-sm font-black text-slate-100 group-hover:text-white transition-colors">{title}</h3>
              <p className="mt-2 text-xs font-medium text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors">{desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Philosophy and Flow Guide Section */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Guideline Info Widget */}
        <div className="rounded-[18px] border border-amber-500/20 bg-amber-950/5 p-5 text-left shadow-lg glass-panel relative overflow-hidden">
          <div className="absolute right-0 top-0 h-16 w-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
          <AlertTriangle className="mb-3 h-5 w-5 text-amber-400" />
          <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Security First Philosophy</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-400 font-medium">
            This utility operates under the strict principle of non-destruction. Diagnostic scans extract and inspect file headers, registry values, and socket properties. Prior to committing any repairs, system backups and registry hive snapshots are created automatically.
          </p>
        </div>

        {/* Dynamic Common Diagnoses Guide Card */}
        <div className="rounded-[18px] border border-brand-border/60 bg-slate-950/20 p-5 lg:col-span-2 text-left shadow-lg glass-panel relative overflow-hidden">
          <div className="absolute left-1/3 bottom-0 h-24 w-24 bg-brand-cyan/5 rounded-full blur-2xl pointer-events-none"></div>
          <h3 className="mb-3 text-sm font-black text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand-cyan" />
            Standard Diagnostics Playbook
          </h3>
          
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['Network Failure', 'Check Adapter Status -> Flush DNS Cache -> Reset TCP Sockets Catalog', Network],
              ['System Degradation', 'Query RAM Health -> Clear junk cache -> Tweak Autostart configurations', Sparkles],
              ['Service Hivestore Corruption', 'Detect logs -> Execute System File Checker (SFC) -> Clean DISM Image', Bug],
            ].map(([title, detail, Icon]) => (
              <div key={title} className="rounded-xl border border-brand-border/40 bg-slate-900/30 p-4 flex flex-col justify-between hover:border-slate-700/60 transition-colors">
                <div>
                  <Icon className="mb-3 h-4.5 w-4.5 text-brand-cyan" />
                  <p className="text-xs font-black text-slate-100 truncate">{title}</p>
                </div>
                <p className="mt-3 text-[10px] font-medium text-slate-500 leading-normal">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
