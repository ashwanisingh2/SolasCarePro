import React, { useState, useEffect } from 'react';
import { 
  Stethoscope, Activity, CheckCircle2, Loader2,
  Lightbulb, Wrench, ShieldCheck, RefreshCw, Shield, ArrowRight, Trash2, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
// Removed CommandOutput import as per user request to show progress bar instead

export default function UnifiedDashboard() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [phase, setPhase] = useState('scan'); // scan, recommend, fix

  // Data states
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [junkFiles, setJunkFiles] = useState([]);
  
  // Execution states
  const [runningAction, setRunningAction] = useState(null);
  const [logs, setLogs] = useState([]);

  // AutoPilot State
  const [autoPilotStatus, setAutoPilotStatus] = useState(null);
  const [manualControl, setManualControl] = useState(false);

  useEffect(() => {
    if (window.api) {
      Promise.all([
        window.api.getSetting('autoPilotEnabled', false),
        window.api.getSetting('autoPilotDay', 'Sunday'),
        window.api.getSetting('autoPilotTime', '03:00'),
        window.api.getSetting('manualControl', false)
      ]).then(([enabled, day, time, manualMode]) => {
        setAutoPilotStatus({ enabled, day, time });
        setManualControl(manualMode);
      });
    }

    if (!window.api?.onStream) return undefined;
    const unsub = window.api.onStream('care-out', (data) => {
      setLogs((prev) => [...prev.slice(-100), data]);
    });
    return () => unsub();
  }, []);

  const runPhaseScan = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const diagRes = await window.api.runSystemCommand('ai-diagnostics', ['diagnose']);
        if (diagRes.success && diagRes.stdout) {
          const m = diagRes.stdout.match(/\{[\s\S]*\}/);
          if (m) setDiagnostics(JSON.parse(m[0]));
        }
        
        const junkRes = await window.api.runSystemCommand('junk-scan');
        if (junkRes.success && junkRes.stdout) {
          setJunkFiles(JSON.parse(junkRes.stdout.trim()));
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setDiagnostics({ overallStatus: 'Issues detected', criticalCount: 0, warningCount: 1, findings: [{ severity: 'warning', category: 'Performance', diagnosis: 'High RAM usage.', recommendation: 'Optimize memory.' }] });
        setJunkFiles([{ Path: 'C:\\Temp\\junk.tmp', Size: 25000000, Category: 'Temp' }]);
      }
      setPhase('recommend');
      addNotification('Scan Complete', 'System Health Advisor finished scanning.', 'success');
      runPhaseRecommend();
    } catch (e) {
      addNotification('Scan Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const runPhaseRecommend = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const recRes = await window.api.runSystemCommand('ai-diagnostics', ['recommend']);
        if (recRes.success && recRes.stdout) {
          const m = recRes.stdout.match(/\{[\s\S]*\}/);
          if (m) setRecommendations(JSON.parse(m[0]));
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setRecommendations({ recommendations: [{ priority: 'warning', title: 'Free up RAM', action: 'Close background apps', recipe: 'pc-slow' }] });
      }
    } catch (e) {
      addNotification('Recommend Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (actionId, command, args = []) => {
    let confirmMsg = `Are you sure you want to run this fix?`;
    
    // DRY-RUN PREVIEW LOGIC
    if (command === 'remove-bloatware') {
      setRunningAction('Dry-Run Preview');
      setLogs([`Generating preview for ${actionId}...`]);
      try {
        if (window.api) {
          const dryRes = await window.api.runSystemCommand(command, [true]);
          if (dryRes.success && dryRes.stdout) {
            const m = dryRes.stdout.match(/\{[\s\S]*\}/);
            const obj = m ? JSON.parse(m[0]) : null;
            if (obj && obj.count !== undefined) {
              confirmMsg = `Preview: This will remove ${obj.count} bloatware packages:\n${(obj.removed || []).join(', ')}\n\nProceed with deletion?`;
            }
          }
        }
      } catch (e) {
        console.error("Dry run failed:", e);
      } finally {
        setRunningAction(null);
        setLogs([]);
      }
    }

    const ok = await confirm({
      title: 'Execute Action',
      message: confirmMsg,
      confirmLabel: 'Run'
    });
    if (!ok) return;

    setRunningAction(actionId);
    setLogs([`Starting: ${actionId}...`]);
    try {
      if (window.api) {
        const finalArgs = command === 'remove-bloatware' ? [false] : args;
        const res = await window.api.runSystemCommand(command, finalArgs);
        if (res.success) {
          addNotification('Action Complete', `${actionId} finished successfully.`, 'success');
        } else {
          addNotification('Action Failed', res.error || res.stderr, 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 2000));
        addNotification('Action Complete', `Mock: ${actionId} finished.`, 'success');
      }
    } catch (e) {
      addNotification('Action Error', e.message, 'error');
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="relative min-h-screen text-left select-none overflow-hidden rounded-2xl">
      {/* Ambient Glow Background */}
      <div className="absolute inset-0 pointer-events-none ambient-glow-bg z-0" />
      
      <div className="relative z-10 p-6 space-y-8 max-w-7xl mx-auto">
        <motion.header 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        >
          <div>
            <h2 className="text-3xl font-black text-white flex items-center gap-3">
              <div className="p-2 bg-brand-violet/20 rounded-xl neon-border-glow-violet">
                <Stethoscope className="h-8 w-8 text-brand-violet animate-pulse-glow" />
              </div>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">System Health Advisor</span>
            </h2>
            <p className="text-sm text-slate-400 mt-2 ml-14">Unified diagnostic scanning, smart recommendations, and one-click fixes.</p>
          </div>
          
          {manualControl ? (
            <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-3 bg-brand-violet/10 px-4 py-2 rounded-xl border border-brand-violet/30 shadow-[0_0_15px_rgba(139,92,246,0.15)] backdrop-blur-md">
              <ShieldCheck className="h-6 w-6 text-brand-violet" />
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-brand-violet uppercase font-bold tracking-wider">Control Mode</span>
                <span className="text-xs font-bold text-white">Full Manual</span>
              </div>
            </motion.div>
          ) : autoPilotStatus && (
            <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-3 glass-panel px-4 py-2 rounded-xl">
              <RefreshCw className={`h-5 w-5 ${autoPilotStatus.enabled ? 'text-emerald-400 animate-spin-slow' : 'text-slate-500'}`} />
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">AutoPilot Status</span>
                <span className={`text-xs font-bold ${autoPilotStatus.enabled ? 'text-emerald-400 neon-text-glow-emerald' : 'text-slate-500'}`}>
                  {autoPilotStatus.enabled ? `Active (${autoPilotStatus.day} @ ${autoPilotStatus.time})` : 'Disabled'}
                </span>
              </div>
            </motion.div>
          )}
        </motion.header>

        {/* Phase Navigator */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-between items-center glass-panel p-2 rounded-xl">
          {['scan', 'recommend', 'fix'].map((step, idx) => {
            const active = phase === step;
            const passed = ['scan', 'recommend', 'fix'].indexOf(phase) > idx;
            return (
              <div key={step} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-xs font-bold uppercase transition-all duration-500 ${
                active ? 'bg-gradient-to-r from-brand-violet to-brand-cyan text-white shadow-[0_0_20px_rgba(139,92,246,0.4)] scale-[1.02]' : passed ? 'text-emerald-400' : 'text-slate-500'
              }`}>
                {passed ? <CheckCircle2 className="h-4 w-4 drop-shadow-md" /> : <Activity className="h-4 w-4" />}
                {step} Phase
              </div>
            );
          })}
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Phase 1: SCAN */}
          {phase === 'scan' && (
            <motion.div key="scan" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.4 }} className="space-y-6 mt-8">
              <div className="glass-panel border-brand-cyan/20 rounded-2xl p-12 text-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-brand-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 flex flex-col items-center">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 rounded-full animate-pulse-ring" />
                    <Activity className="h-20 w-20 text-brand-cyan relative z-10 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-3 tracking-wide">Gathering System Intelligence</h3>
                  <p className="text-sm text-slate-400 max-w-lg mx-auto mb-8 leading-relaxed">
                    The AI Health Advisor will perform a deep dive into hardware sensors, Windows event logs, temporary cache footprint, and registry integrity.
                  </p>
                  <motion.button 
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={runPhaseScan} disabled={loading} 
                    className="px-10 py-4 bg-gradient-to-r from-brand-violet to-brand-cyan text-white font-black uppercase tracking-widest text-sm rounded-xl flex items-center justify-center gap-3 mx-auto disabled:opacity-50 shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)] transition-all duration-300 border border-white/20"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                    {loading ? 'Analyzing Architecture...' : 'Initiate Deep Scan'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Phase 2: RECOMMEND */}
          {phase === 'recommend' && (
            <motion.div key="recommend" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8 mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Diagnostics Summary */}
                <motion.div initial={{ x: -20 }} animate={{ x: 0 }} className="glass-panel border-brand-violet/20 rounded-2xl p-6 group hover:neon-border-glow-violet transition-all duration-500">
                  <h3 className="text-lg font-black text-white flex items-center gap-3 mb-6 tracking-wide">
                    <Stethoscope className="h-6 w-6 text-brand-violet group-hover:animate-pulse-glow" /> 
                    Diagnostic Telemetry
                  </h3>
                  {diagnostics ? (
                    <div className="space-y-4">
                      <div className={`p-4 rounded-xl border backdrop-blur-md ${diagnostics.criticalCount > 0 ? 'border-rose-500/40 bg-rose-950/30 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)]' : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'}`}>
                        <p className="font-black text-lg tracking-wide uppercase">{diagnostics.overallStatus}</p>
                      </div>
                      <div className="grid gap-3">
                        {diagnostics.findings?.map((f, i) => (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={i} className="text-sm p-4 bg-slate-900/50 rounded-xl border border-white/5 hover:border-brand-violet/30 transition-colors flex flex-col gap-1">
                            <span className="font-bold text-white">{f.diagnosis}</span>
                            <span className="text-slate-400">{f.recommendation}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 opacity-50">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-500 mb-2" />
                      <p className="text-xs text-slate-500 uppercase tracking-widest">Processing Data...</p>
                    </div>
                  )}
                </motion.div>

                {/* Recommendations Summary */}
                <motion.div initial={{ x: 20 }} animate={{ x: 0 }} className="glass-panel border-brand-cyan/20 rounded-2xl p-6 group hover:neon-border-glow-cyan transition-all duration-500">
                  <h3 className="text-lg font-black text-white flex items-center gap-3 mb-6 tracking-wide">
                    <Lightbulb className="h-6 w-6 text-amber-400 group-hover:animate-pulse-glow" /> 
                    Smart Recommendations
                  </h3>
                  {recommendations?.recommendations?.length > 0 ? (
                    <div className="space-y-3">
                      {recommendations.recommendations.map((r, i) => (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} key={i} className="text-sm p-4 bg-slate-900/50 rounded-xl border border-white/5 hover:border-brand-cyan/30 transition-colors flex flex-col gap-1 relative overflow-hidden">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-brand-violet to-brand-cyan" />
                          <span className="font-bold text-white">{r.title}</span>
                          <span className="text-slate-400">{r.action}</span>
                          {r.recipe && <span className="text-[10px] text-brand-cyan uppercase tracking-widest font-bold mt-2">Recipe Target: {r.recipe}</span>}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-32 opacity-50">
                      <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                      <p className="text-xs text-emerald-500 uppercase tracking-widest font-bold">System Optimized</p>
                    </div>
                  )}
                </motion.div>
              </div>

              <div className="flex justify-center pt-4">
                <motion.button 
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => setPhase('fix')} 
                  className="px-10 py-4 bg-emerald-600/90 hover:bg-emerald-500 text-white font-black uppercase tracking-widest text-sm rounded-xl flex items-center gap-3 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] border border-emerald-400/50 transition-all duration-300"
                >
                  Proceed to Fixes <ArrowRight className="h-5 w-5" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Phase 3: FIX */}
          {phase === 'fix' && (
            <motion.div key="fix" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8 mt-4">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="glass-panel border-brand-cyan/50 bg-brand-cyan/10 rounded-2xl p-5 flex items-center justify-center gap-4 shadow-[0_0_20px_rgba(6,182,212,0.15)] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-cyan/10 to-transparent animate-[shimmer_2s_infinite]" />
                <ShieldCheck className="h-7 w-7 text-brand-cyan animate-pulse-glow relative z-10" />
                <span className="text-sm font-black text-brand-cyan uppercase tracking-widest relative z-10">Safety Net Active: Automatic Restore Point enabled</span>
              </motion.div>

              <motion.div 
                initial="hidden" animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
              >
                <ActionCard 
                  title="Full System Repair" 
                  desc="Runs SFC & DISM to scan for and fix corrupted Windows core files." 
                  icon={Wrench} 
                  color="violet"
                  running={runningAction === 'Full System Repair'}
                  onClick={() => executeAction('Full System Repair', 'quick-full-system-repair')}
                />
                <ActionCard 
                  title="Clean Junk Files" 
                  desc={`Cleans Temp folders, caches, and logs. Will free up ${junkFiles.length} files.`} 
                  icon={Trash2} 
                  color="amber"
                  running={runningAction === 'Clean Junk'}
                  onClick={() => executeAction('Clean Junk', 'junk-clean', [JSON.stringify(junkFiles.map(f => f.Path))])}
                />
                <ActionCard 
                  title="Defender Scan" 
                  desc="Runs a built-in Windows Defender Quick Scan to check for active malware." 
                  icon={Shield} 
                  color="cyan"
                  running={runningAction === 'Defender Scan'}
                  onClick={() => executeAction('Defender Scan', 'defender-scan')}
                />
                <ActionCard 
                  title="Remove Bloatware" 
                  desc="Scans for and uninstalls useless pre-installed apps (Candy Crush, McAfee, etc)." 
                  icon={Trash2} 
                  color="rose"
                  running={runningAction === 'Remove Bloatware'}
                  onClick={() => executeAction('Remove Bloatware', 'remove-bloatware')}
                />
              </motion.div>
              
              {recommendations?.recommendations?.map((r, i) => r.recipe && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i*0.1 }} key={i} className="glass-panel border-emerald-500/40 p-5 rounded-2xl flex items-center justify-between group hover:neon-border-glow-emerald transition-all duration-300">
                  <div>
                    <h4 className="text-base font-black text-white tracking-wide">Recommended: {r.title}</h4>
                    <p className="text-xs text-emerald-400/80 font-mono mt-1">Executing specific recipe: {r.recipe}</p>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => executeAction(`Recipe: ${r.recipe}`, 'smart-repair-recipe', [r.recipe])}
                    disabled={runningAction !== null}
                    className="px-6 py-2.5 bg-emerald-600/80 hover:bg-emerald-500 text-xs font-bold uppercase tracking-widest rounded-lg text-white border border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  >
                    Run Recipe
                  </motion.button>
                </motion.div>
              ))}

              <ActionProgress 
                isRunning={runningAction !== null} 
                logs={logs} 
                actionName={runningAction} 
              />

              <div className="flex justify-center mt-10">
                <button onClick={() => { setPhase('scan'); setDiagnostics(null); setRecommendations(null); }} className="px-8 py-3 bg-slate-900/80 text-slate-300 font-bold uppercase tracking-widest text-xs rounded-xl border border-white/10 hover:border-white/30 hover:text-white transition-all">
                  Start New Session
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ActionCard({ title, desc, icon: Icon, color, running, onClick }) {
  const colors = {
    violet: 'border-brand-violet/40 bg-brand-violet/5 hover:bg-brand-violet/20 text-brand-violet shadow-brand-violet',
    cyan: 'border-brand-cyan/40 bg-brand-cyan/5 hover:bg-brand-cyan/20 text-brand-cyan shadow-brand-cyan',
    amber: 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/20 text-amber-400 shadow-amber-500',
    rose: 'border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/20 text-rose-400 shadow-rose-500',
  };
  const c = colors[color] || colors.violet;
  
  return (
    <motion.button 
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick} 
      disabled={running}
      className={`glass-panel border-t-2 rounded-2xl p-6 text-left transition-all duration-300 flex flex-col justify-between min-h-40 cursor-pointer ${c} disabled:opacity-50 group hover:shadow-[0_10px_30px_rgba(0,0,0,0.3)] relative overflow-hidden`}
    >
      <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-150 transition-transform duration-700">
        <Icon className="h-24 w-24" />
      </div>
      
      <div className="relative z-10">
        <Icon className="h-8 w-8 mb-4 opacity-90 group-hover:animate-pulse-glow rounded-full" />
        <h4 className="text-base font-black text-white mb-2 tracking-wide drop-shadow-md">{title}</h4>
        <p className="text-xs text-slate-300 leading-relaxed font-medium">{desc}</p>
      </div>
      {running && (
        <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest bg-black/30 w-max px-3 py-1.5 rounded-full backdrop-blur-md relative z-10 border border-white/10">
          <Loader2 className="h-3 w-3 animate-spin text-white" /> <span className="text-white">Executing</span>
        </div>
      )}
    </motion.button>
  );
}

function ActionProgress({ isRunning, logs, actionName }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setProgress(100);
      const t = setTimeout(() => setProgress(0), 2000);
      return () => clearTimeout(t);
    }
    
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev < 50) return prev + Math.random() * 5;
        if (prev < 80) return prev + Math.random() * 2;
        if (prev < 95) return prev + Math.random() * 0.5;
        return prev;
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isRunning, actionName]);

  if (!isRunning && progress === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel border-brand-violet/50 rounded-2xl p-8 mt-8 shadow-[0_0_30px_rgba(139,92,246,0.15)] neon-border-glow-violet relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay" />
      <div className="relative z-10 flex justify-between items-end mb-4">
        <div className="flex flex-col">
          <span className="text-[10px] text-brand-violet uppercase font-black tracking-widest mb-1">Live Telemetry</span>
          <span className="text-lg font-black text-white">
            {isRunning ? `Executing: ${actionName || 'Task'}...` : 'Execution Complete!'}
          </span>
        </div>
        <span className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-br from-white to-brand-violet drop-shadow-md">
          {Math.min(100, Math.floor(progress))}%
        </span>
      </div>
      <div className="w-full bg-slate-900/80 rounded-full h-4 overflow-hidden border border-brand-violet/20 shadow-inner">
        <motion.div 
          className="bg-gradient-to-r from-brand-violet via-brand-cyan to-white h-full rounded-full relative" 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, progress)}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1s_infinite]" />
        </motion.div>
      </div>
      {isRunning && logs.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mt-5 p-3 bg-black/40 border border-white/5 rounded-lg"
        >
          <p className="text-xs text-brand-cyan truncate font-mono tracking-wide">
            > {logs[logs.length - 1]}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
