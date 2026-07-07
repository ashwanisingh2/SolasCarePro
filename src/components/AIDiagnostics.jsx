import React, { useState, useEffect } from 'react';
import {
  Stethoscope, Activity, AlertTriangle, CheckCircle2, XCircle, Loader2,
  TrendingDown, Wrench, Zap, Shield, RefreshCw, Lightbulb, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import { Skeleton } from './shared/Skeleton';

export default function AIDiagnostics() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState('diagnose'); // diagnose | recommend | predict | self-heal
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [selfHeal, setSelfHeal] = useState(null);

  const runAnalysis = async (action) => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('ai-diagnostics', [action]);
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout.trim());
          if (action === 'diagnose') setDiagnosis(parsed);
          if (action === 'recommend') setRecommendations(parsed);
          if (action === 'predict') setPredictions(parsed);
          if (action === 'self-heal') setSelfHeal(parsed);
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        if (action === 'diagnose') setDiagnosis({ success: true, findings: [{ id: 'moderate-ram', diagnosis: 'Moderate RAM usage (72%).', recommendation: 'Close unused apps.', severity: 'info', category: 'Performance' }], criticalCount: 0, warningCount: 0, overallStatus: 'Warnings detected', message: 'Mock: 1 finding.' });
        if (action === 'recommend') setRecommendations({ success: true, recommendations: [{ priority: 'info', title: 'Optimize RAM', action: 'Close unused apps.', recipe: 'pc-slow' }], count: 1 });
        if (action === 'predict') setPredictions({ success: true, predictions: [{ component: 'C: Drive', failureType: 'Disk Full', probability: 'Medium', timeframe: '2-4 weeks', detail: '12% free.', severity: 'warning' }], count: 1 });
        if (action === 'self-heal') setSelfHeal({ success: true, healingNeeded: true, topIssue: { diagnosis: 'Moderate RAM usage.', severity: 'info' }, recommendedRecipe: 'pc-slow', message: 'Mock: recommend pc-slow recipe.' });
      }
    } catch (e) {
      addNotification('Smart Diagnostics', 'Analysis failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runAnalysis('diagnose'); }, []);

  const runSelfHealRecipe = async () => {
    if (!selfHeal || !selfHeal.recommendedRecipe) return;
    const ok = await confirm({ title: 'Smart Self-Heal', message: `Run recommended repair recipe: "${selfHeal.recommendedRecipe}"?`, confirmLabel: 'Run Recipe', danger: selfHeal.topIssue.severity === 'critical' });
    if (!ok) return;
    if (window.api) {
      addNotification('Smart Self-Heal', `Starting recipe: ${selfHeal.recommendedRecipe}...`, 'info');
      const res = await window.api.runSystemCommand('smart-repair-recipe', [selfHeal.recommendedRecipe]);
      addNotification(res.success ? 'Self-Heal Complete' : 'Self-Heal Issue', res.success ? 'Recipe completed.' : (res.error || 'Check Smart Repair tab.'), res.success ? 'success' : 'warning');
    }
  };

  const severityColor = (sev) => {
    switch (sev) {
      case 'critical': return 'border-rose-500/40 bg-rose-950/20 text-rose-400';
      case 'warning': return 'border-amber-500/40 bg-amber-950/20 text-amber-400';
      default: return 'border-brand-violet/40 bg-brand-violet/10 text-brand-violet';
    }
  };

  const severityIcon = (sev) => {
    switch (sev) {
      case 'critical': return <XCircle className="h-4 w-4 text-rose-400" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      default: return <Lightbulb className="h-4 w-4 text-brand-violet" />;
    }
  };

  const tabs = [
    { id: 'diagnose', label: 'Smart Diagnostics', icon: Stethoscope },
    { id: 'recommend', label: 'Recommendations', icon: Lightbulb },
    { id: 'predict', label: 'Predictive Failure', icon: TrendingDown },
    { id: 'self-heal', label: 'Self-Healing', icon: Wrench }
  ];

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-brand-violet" />
            Smart Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1">Intelligent system analysis with rule-based expert system, predictive failure detection, and self-healing</p>
          <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-slate-800 text-slate-600 text-[10px] font-semibold">Powered by rule-based Windows diagnostics engine</span>
        </div>
        <button onClick={() => runAnalysis(activeTab)} disabled={loading} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-analyze
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => {
          const TabIcon = t.icon;
          return (
            <button key={t.id} onClick={() => { setActiveTab(t.id); if ((t.id==='diagnose'&&!diagnosis)||(t.id==='recommend'&&!recommendations)||(t.id==='predict'&&!predictions)||(t.id==='self-heal'&&!selfHeal)) runAnalysis(t.id); }} className={`px-4 py-2 text-xs font-bold rounded-lg cursor-pointer border flex items-center gap-2 ${activeTab===t.id?'bg-brand-violet/20 border-brand-violet text-brand-violet':'bg-slate-800/40 border-brand-border text-slate-400 hover:text-white'}`}>
              <TabIcon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="glass-panel border border-brand-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-brand-violet" />
            <p className="text-sm text-slate-300">Smart engine analyzing system metrics...</p>
          </div>
          <Skeleton rows={4} />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

            {/* DIAGNOSE TAB */}
            {activeTab === 'diagnose' && diagnosis && (
              <div className="space-y-4">
                <div className={`glass-panel border rounded-xl p-4 ${diagnosis.criticalCount > 0 ? 'border-rose-500/40' : diagnosis.warningCount > 0 ? 'border-amber-500/40' : 'border-emerald-500/40'}`}>
                  <div className="flex items-center gap-3">
                    {diagnosis.criticalCount > 0 ? <XCircle className="h-6 w-6 text-rose-400" /> : diagnosis.warningCount > 0 ? <AlertTriangle className="h-6 w-6 text-amber-400" /> : <CheckCircle2 className="h-6 w-6 text-emerald-400" />}
                    <div>
                      <p className="text-sm font-bold text-slate-200">{diagnosis.overallStatus}</p>
                      <p className="text-xs text-slate-400">{diagnosis.message}</p>
                    </div>
                  </div>
                </div>
                {diagnosis.findings && diagnosis.findings.length > 0 ? (
                  diagnosis.findings.map((f, i) => (
                    <div key={i} className={`glass-panel border rounded-xl p-4 ${severityColor(f.severity)}`}>
                      <div className="flex items-start gap-3">
                        {severityIcon(f.severity)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">{f.category}</span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ color: f.severity==='critical'?'#F87171':f.severity==='warning'?'#FBBF24':'#8B5CF6' }}>{f.severity}</span>
                          </div>
                          <p className="text-xs text-slate-200 font-semibold mb-1">{f.diagnosis}</p>
                          <p className="text-[11px] text-slate-400">{f.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="glass-panel border border-emerald-500/30 rounded-xl p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-200">All Clear!</p>
                    <p className="text-xs text-slate-400">No issues detected by the diagnostic engine.</p>
                  </div>
                )}
              </div>
            )}

            {/* RECOMMEND TAB */}
            {activeTab === 'recommend' && recommendations && (
              <div className="space-y-4">
                {recommendations.recommendations && recommendations.recommendations.length > 0 ? (
                  recommendations.recommendations.map((r, i) => (
                    <div key={i} className={`glass-panel border rounded-xl p-4 ${severityColor(r.priority)}`}>
                      <div className="flex items-start gap-3">
                        <Lightbulb className="h-4 w-4 text-brand-violet shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">{r.category}</span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{ color: r.priority==='critical'?'#F87171':r.priority==='warning'?'#FBBF24':'#8B5CF6' }}>{r.priority}</span>
                          </div>
                          <p className="text-xs text-slate-200 font-semibold mb-1">{r.title}</p>
                          <p className="text-[11px] text-slate-400 mb-2">{r.action}</p>
                          {r.recipe && (
                            <button onClick={() => { if(window.api) window.api.runSystemCommand('smart-repair-recipe',[r.recipe]); }} className="px-3 py-1 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 rounded text-[10px] font-bold text-brand-violet cursor-pointer flex items-center gap-1">
                              Run Recipe <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="glass-panel border border-emerald-500/30 rounded-xl p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-200">No Recommendations</p>
                    <p className="text-xs text-slate-400">System is running optimally.</p>
                  </div>
                )}
              </div>
            )}

            {/* PREDICT TAB */}
            {activeTab === 'predict' && predictions && (
              <div className="space-y-4">
                {predictions.predictions && predictions.predictions.length > 0 ? (
                  <>
                  {predictions.predictions.map((p, i) => (
                    <div key={i} className={`glass-panel border rounded-xl p-4 ${severityColor(p.severity)}`}>
                      <div className="flex items-start gap-3">
                        <TrendingDown className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold text-slate-200">{p.component}</span>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400">{p.failureType}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mb-1">{p.detail}</p>
                          <div className="flex gap-3 text-[10px]">
                            <span className="text-slate-500">Probability: <span className="font-bold" style={{color:p.probability==='High'?'#F87171':'#FBBF24'}}>{p.probability}</span></span>
                            <span className="text-slate-500">Timeframe: <span className="text-slate-300 font-bold">{p.timeframe}</span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="italic text-slate-500 text-[10px] mt-2">Predictions are estimates based on current system metrics, not machine learning.</p>
                  </>
                ) : (
                  <div className="glass-panel border border-emerald-500/30 rounded-xl p-8 text-center">
                    <Shield className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-200">No Failures Predicted</p>
                    <p className="text-xs text-slate-400">System health is stable. No imminent hardware failures detected.</p>
                    <p className="italic text-slate-500 text-[10px] mt-3">Predictions are estimates based on current system metrics, not machine learning.</p>
                  </div>
                )}
              </div>
            )}

            {/* SELF-HEAL TAB */}
            {activeTab === 'self-heal' && selfHeal && (
              <div className="space-y-4">
                {selfHeal.healingNeeded ? (
                  <>
                    <div className="glass-panel border border-brand-violet/40 rounded-xl p-5">
                      <div className="flex items-start gap-3 mb-3">
                        <Wrench className="h-6 w-6 text-brand-violet shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-slate-200">Self-Heal Analysis Complete</p>
                          <p className="text-xs text-slate-400 mt-1">{selfHeal.message}</p>
                        </div>
                      </div>
                      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-3 mt-3">
                        <p className="text-[10px] text-slate-500 uppercase mb-1">Top Issue Detected</p>
                        <p className="text-xs text-slate-200 font-semibold">{selfHeal.topIssue.diagnosis}</p>
                        <p className="text-[11px] text-slate-400 mt-1">{selfHeal.recommendation}</p>
                      </div>
                      {selfHeal.recommendedRecipe && (
                        <button onClick={runSelfHealRecipe} className="w-full mt-4 px-4 py-2.5 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 rounded-lg text-sm font-bold text-brand-violet cursor-pointer flex items-center justify-center gap-2">
                          <Zap className="h-4 w-4" />
                          Auto-Heal: Run "{selfHeal.recommendedRecipe}" Recipe
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="glass-panel border border-emerald-500/30 rounded-xl p-8 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-200">No Healing Needed</p>
                    <p className="text-xs text-slate-400">{selfHeal.message}</p>
                  </div>
                )}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
