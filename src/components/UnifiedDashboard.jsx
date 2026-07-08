import React, { useState, useEffect } from 'react';
import { 
  Stethoscope, Activity, AlertTriangle, CheckCircle2, Loader2, XCircle,
  Lightbulb, Wrench, ShieldCheck, Zap, RefreshCw, Cpu, HardDrive, Shield,
  Network, ArrowRight, Play, Trash2, Bug, Globe2, ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

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

  useEffect(() => {
    if (window.api) {
      Promise.all([
        window.api.getSetting('autoPilotEnabled', false),
        window.api.getSetting('autoPilotDay', 'Sunday'),
        window.api.getSetting('autoPilotTime', '03:00')
      ]).then(([enabled, day, time]) => {
        setAutoPilotStatus({ enabled, day, time });
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
    <div className="p-6 space-y-6 text-left select-none max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Stethoscope className="h-7 w-7 text-brand-violet" />
            System Health Advisor
          </h2>
          <p className="text-sm text-slate-400">Unified diagnostic scanning, smart recommendations, and one-click fixes.</p>
        </div>
        
        {autoPilotStatus && (
          <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-brand-border">
            <RefreshCw className={`h-4 w-4 ${autoPilotStatus.enabled ? 'text-emerald-400 animate-spin-slow' : 'text-slate-500'}`} />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">AutoPilot Status</span>
              <span className={`text-xs font-bold ${autoPilotStatus.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                {autoPilotStatus.enabled ? `Active (${autoPilotStatus.day} @ ${autoPilotStatus.time})` : 'Disabled'}
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Phase Navigator */}
      <div className="flex justify-between items-center bg-slate-900/60 p-2 rounded-xl border border-brand-border">
        {['scan', 'recommend', 'fix'].map((step, idx) => {
          const active = phase === step;
          const passed = ['scan', 'recommend', 'fix'].indexOf(phase) > idx;
          return (
            <div key={step} className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-xs font-bold uppercase transition-all ${
              active ? 'bg-brand-violet text-white shadow-lg' : passed ? 'text-emerald-400' : 'text-slate-500'
            }`}>
              {passed ? <CheckCircle2 className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
              {step} Phase
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* Phase 1: SCAN */}
        {phase === 'scan' && (
          <motion.div key="scan" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="glass-panel border border-brand-border rounded-xl p-8 text-center bg-slate-900/40">
              <Activity className="h-16 w-16 text-brand-cyan mx-auto mb-4 opacity-80" />
              <h3 className="text-xl font-bold text-slate-200 mb-2">Gathering Intelligence</h3>
              <p className="text-sm text-slate-400 max-w-lg mx-auto mb-6">
                The System Health Advisor will analyze hardware sensors, event logs, temporary files, and system registries to build a complete health profile.
              </p>
              <button onClick={runPhaseScan} disabled={loading} className="px-8 py-3 bg-brand-violet hover:bg-brand-violet/90 text-white font-bold rounded-lg flex items-center justify-center gap-3 mx-auto disabled:opacity-50">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                {loading ? 'Scanning System...' : 'Start Full System Scan'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Phase 2: RECOMMEND */}
        {phase === 'recommend' && (
          <motion.div key="recommend" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Diagnostics Summary */}
              <div className="glass-panel border border-brand-border rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
                  <Stethoscope className="h-5 w-5 text-brand-violet" /> Diagnostics Results
                </h3>
                {diagnostics ? (
                  <div className="space-y-3">
                    <div className={`p-3 rounded border ${diagnostics.criticalCount > 0 ? 'border-rose-500/40 bg-rose-950/20 text-rose-400' : 'border-emerald-500/40 bg-emerald-950/20 text-emerald-400'}`}>
                      <p className="font-bold">{diagnostics.overallStatus}</p>
                    </div>
                    {diagnostics.findings?.map((f, i) => (
                      <div key={i} className="text-xs p-3 bg-slate-900/60 rounded border border-brand-border flex flex-col gap-1">
                        <span className="font-bold text-slate-200">{f.diagnosis}</span>
                        <span className="text-slate-400">{f.recommendation}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No diagnostics data available.</p>
                )}
              </div>

              {/* Recommendations Summary */}
              <div className="glass-panel border border-brand-border rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-4">
                  <Lightbulb className="h-5 w-5 text-amber-400" /> Smart Recommendations
                </h3>
                {recommendations?.recommendations?.length > 0 ? (
                  <div className="space-y-3">
                    {recommendations.recommendations.map((r, i) => (
                      <div key={i} className="text-xs p-3 bg-slate-900/60 rounded border border-brand-border flex flex-col gap-1">
                        <span className="font-bold text-slate-200">{r.title}</span>
                        <span className="text-slate-400">{r.action}</span>
                        {r.recipe && <span className="text-[10px] text-brand-violet font-mono mt-1">Recipe: {r.recipe}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">System looks healthy.</p>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <button onClick={() => setPhase('fix')} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-2">
                Proceed to One-Click Fixes <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Phase 3: FIX */}
        {phase === 'fix' && (
          <motion.div key="fix" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="glass-panel border border-brand-cyan/40 bg-brand-cyan/5 rounded-xl p-4 flex items-center justify-center gap-3">
              <ShieldCheck className="h-6 w-6 text-brand-cyan" />
              <span className="text-sm font-bold text-brand-cyan uppercase tracking-wider">Safety Net: Creating Restore Point before fixes</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            </div>
            
            {recommendations?.recommendations?.map((r, i) => r.recipe && (
              <div key={i} className="glass-panel border border-emerald-500/30 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-200">Recommended: {r.title}</h4>
                  <p className="text-xs text-slate-400">Executes the "{r.recipe}" recipe</p>
                </div>
                <button 
                  onClick={() => executeAction(`Recipe: ${r.recipe}`, 'smart-repair-recipe', [r.recipe])}
                  disabled={runningAction !== null}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded text-white"
                >
                  Run Recipe
                </button>
              </div>
            ))}

            <CommandOutput 
              channel="care-out"
              title="Execution Console"
              isRunning={runningAction !== null}
              logs={logs}
            />

            <div className="flex justify-center mt-6">
              <button onClick={() => { setPhase('scan'); setDiagnostics(null); setRecommendations(null); }} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg border border-brand-border hover:bg-slate-700">
                Start Over
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionCard({ title, desc, icon: Icon, color, running, onClick }) {
  const colors = {
    violet: 'border-brand-violet/40 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20',
    cyan: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20',
    rose: 'border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20',
  };
  const c = colors[color] || colors.violet;
  
  return (
    <button 
      onClick={onClick} 
      disabled={running}
      className={`glass-panel border rounded-xl p-5 text-left transition-colors flex flex-col justify-between min-h-[140px] cursor-pointer ${c} disabled:opacity-50`}
    >
      <div>
        <Icon className="h-6 w-6 mb-3" />
        <h4 className="text-sm font-bold text-slate-200 mb-1">{title}</h4>
        <p className="text-[10px] text-slate-400 leading-snug">{desc}</p>
      </div>
      {running && (
        <div className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
          <Loader2 className="h-3 w-3 animate-spin" /> Running...
        </div>
      )}
    </button>
  );
}

// Temporary icon definition for Search since it wasn't imported from lucide-react in the top but used below
function Search(props) {
  return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
}
