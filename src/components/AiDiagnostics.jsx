import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, RefreshCw, Loader2, AlertCircle, Sparkles, ChevronDown, ChevronRight,
  Cpu, HardDrive, Wifi, Zap, Shield, Activity, ArrowRight, TrendingUp,
  CheckCircle2, AlertTriangle, XCircle, Info, Wrench
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { formatDate } from '../utils/formatters';

// ── helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch { return null; }
}

const SEVERITY_META = {
  critical: { label: 'Critical', icon: XCircle,       text: 'text-rose-400',   bg: 'bg-rose-500/10 border-rose-500/30' },
  warning:  { label: 'Warning',  icon: AlertTriangle,  text: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30' },
  info:     { label: 'Info',     icon: Info,            text: 'text-brand-cyan', bg: 'bg-brand-cyan/10 border-brand-cyan/30' },
};

const CATEGORY_ICON = {
  Performance: Zap,
  Storage:     HardDrive,
  Security:    Shield,
  Drivers:     Cpu,
  Stability:   Activity,
  System:      Bot,
};

// Tab id → where to navigate in the app  (parent App passes setActiveTab via prop)
const FIX_ROUTE = {
  'high-ram-usage':  { tab: 'performance',            label: 'Open Performance Boost' },
  'low-disk-space':  { tab: 'command-hub',             label: 'Open Command Hub' },
  'pending-updates': { tab: 'software',                label: 'Open Software Updater' },
  'bad-drivers':     { tab: 'driver',                  label: 'Open Driver Manager' },
  'error-events':    { tab: 'bsod-analyzer',           label: 'Open BSOD Analyzer' },
  'failing-disks':   { tab: 'predictive-maintenance',  label: 'Open Predictive Maintenance' },
  'moderate-ram':    { tab: 'performance',             label: 'Open Performance Boost' },
  'pending-reboot':  { tab: 'command-hub',             label: 'Open Command Hub' },
};

// ── main component ────────────────────────────────────────────────────────────

export default function AiDiagnostics({ setActiveTab }) {
  const { addNotification } = useNotification();

  // event logs
  const [logs, setLogs]       = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // diagnostics
  const [diagLoading, setDiagLoading]       = useState(false);
  const [diagResult, setDiagResult]         = useState(null);   // full PS JSON
  const [predictResult, setPredictResult]   = useState(null);
  const [recoResult, setRecoResult]         = useState(null);
  const [activeAction, setActiveAction]     = useState(null);   // 'diagnose'|'predict'|'recommend'|'self-heal'
  const [expandedCard, setExpandedCard]     = useState(null);
  const [activeTab, setTab]                 = useState('diagnose'); // local tab

  // ── fetch event logs ──────────────────────────────────────────────────────
  const scanLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-critical-logs');
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          setLogs(Array.isArray(parsed) ? parsed : [parsed]);
        }
      }
    } catch {
      addNotification('Smart Diagnostics', 'Failed to read critical event logs.', 'error');
    } finally {
      setLogsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { scanLogs(); }, [scanLogs]);

  // ── run PS ai-diagnostics ─────────────────────────────────────────────────
  const runPsAction = async (action) => {
    setActiveAction(action);
    setDiagLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('ai-diagnostics', [action]);
        const obj = safeJsonParse(res?.stdout);
        if (!obj?.success) throw new Error(obj?.error || res?.error || 'PS script failed');
        if (action === 'diagnose')   setDiagResult(obj);
        if (action === 'predict')    setPredictResult(obj);
        if (action === 'recommend')  setRecoResult(obj);
        if (action === 'self-heal') {
          const msg = obj.healingNeeded
            ? `Self-heal: ${obj.topIssue?.category} issue detected. Recommended: ${obj.recommendedRecipe || 'manual fix'}`
            : 'No healing needed — system is healthy.';
          addNotification('Smart Diagnostics', msg, obj.healingNeeded ? 'warning' : 'success');
          if (obj.healingNeeded) setDiagResult(prev => prev); // keep existing
        }
        addNotification('Smart Diagnostics', obj.message, 'info');
      } else {
        // mock for browser preview
        setDiagResult({
          success: true, action: 'diagnose',
          criticalCount: 1, warningCount: 1,
          metrics: { ramUsedPercent: 72, diskFreePercent: 14, errorEvents: 12, badDrivers: 2, pendingUpdates: 4, pendingReboot: false },
          findings: [
            { id: 'bad-drivers', diagnosis: '2 device driver(s) are reporting errors.', recommendation: 'Open the Drivers tab and scan for problem devices.', severity: 'warning', category: 'Drivers' },
            { id: 'low-disk-space', diagnosis: 'Low disk space on C: (14% free). May cause instability.', recommendation: 'Run Disk Cleanup immediately. Target: 15%+ free.', severity: 'critical', category: 'Storage' }
          ]
        });
      }
    } catch (e) {
      addNotification('Smart Diagnostics', 'Analysis failed: ' + e.message, 'error');
    } finally {
      setDiagLoading(false);
      setActiveAction(null);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-5 text-left select-none">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Bot className="h-5 w-5 text-brand-violet" /> Solas Smart Diagnostics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Rule-based expert system — analyzes live system metrics + Windows Event Logs.
            Provides actionable findings with direct fix routing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left panel ── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Action buttons */}
          <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
            <div className="w-14 h-14 bg-brand-violet/20 rounded-full flex items-center justify-center mx-auto border border-brand-violet/40 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
              <Bot className="h-7 w-7 text-brand-violet" />
            </div>

            <ActionBtn
              icon={Sparkles} label="Run Full Diagnostics"
              sublabel="Scan metrics + event rules"
              loading={diagLoading && activeAction === 'diagnose'}
              disabled={diagLoading}
              onClick={() => { setTab('diagnose'); runPsAction('diagnose'); }}
              color="violet"
            />
            <ActionBtn
              icon={TrendingUp} label="Predict Failures"
              sublabel="Disk wear, BSOD trends, disk full"
              loading={diagLoading && activeAction === 'predict'}
              disabled={diagLoading}
              onClick={() => { setTab('predict'); runPsAction('predict'); }}
              color="amber"
            />
            <ActionBtn
              icon={Wrench} label="Get Recommendations"
              sublabel="Prioritised fix list"
              loading={diagLoading && activeAction === 'recommend'}
              disabled={diagLoading}
              onClick={() => { setTab('recommend'); runPsAction('recommend'); }}
              color="cyan"
            />
            <ActionBtn
              icon={Zap} label="Self-Heal Analysis"
              sublabel="Find top issue + best recipe"
              loading={diagLoading && activeAction === 'self-heal'}
              disabled={diagLoading}
              onClick={() => runPsAction('self-heal')}
              color="emerald"
            />
          </div>

          {/* Metrics mini-bar (from last diagnose run) */}
          {diagResult?.metrics && (
            <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-2">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Live Metrics</p>
              <MetricBar label="RAM Usage"       value={diagResult.metrics.ramUsedPercent}    unit="%" warnAt={70} critAt={85} />
              <MetricBar label="Disk Free (C:)"  value={diagResult.metrics.diskFreePercent}   unit="%" warnAt={15} critAt={8} invert />
              <MetricRow label="Error Events 24h" value={diagResult.metrics.errorEvents} warn={diagResult.metrics.errorEvents > 20} />
              <MetricRow label="Bad Drivers"      value={diagResult.metrics.badDrivers}   warn={diagResult.metrics.badDrivers > 0} />
              <MetricRow label="Pending Updates"  value={diagResult.metrics.pendingUpdates} warn={diagResult.metrics.pendingUpdates > 10} />
              <MetricRow label="Pending Reboot"   value={diagResult.metrics.pendingReboot ? 'Yes ⚠️' : 'No'} warn={diagResult.metrics.pendingReboot} />
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Inner tabs */}
          <div className="flex gap-1 border-b border-brand-border">
            {[
              { id: 'diagnose', label: 'Findings' },
              { id: 'predict',  label: 'Predictions' },
              { id: 'recommend',label: 'Recommendations' },
              { id: 'logs',     label: 'Event Logs' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-xs font-bold border-b-2 -mb-px cursor-pointer transition-colors ${
                  activeTab === t.id
                    ? 'border-brand-violet text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Findings tab ── */}
          {activeTab === 'diagnose' && (
            <div className="space-y-3">
              {diagLoading && activeAction === 'diagnose' ? (
                <LoadingState label="Running expert system analysis..." />
              ) : diagResult ? (
                <>
                  {/* Summary row */}
                  <div className="flex gap-3 flex-wrap">
                    <SummaryBadge label="Critical" count={diagResult.criticalCount} color="rose" />
                    <SummaryBadge label="Warnings" count={diagResult.warningCount}  color="amber" />
                    <SummaryBadge label="Total"    count={diagResult.findings?.length || 0} color="slate" />
                  </div>

                  {diagResult.findings?.length === 0 && (
                    <div className="py-10 text-center">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                      <p className="text-sm font-bold text-emerald-400">System Healthy</p>
                      <p className="text-xs text-slate-500 mt-1">No issues found across all diagnostic rules.</p>
                    </div>
                  )}

                  {diagResult.findings?.map((f, i) => (
                    <FindingCard
                      key={f.id || i}
                      finding={f}
                      expanded={expandedCard === (f.id || i)}
                      onToggle={() => setExpandedCard(prev => prev === (f.id || i) ? null : (f.id || i))}
                      onFix={() => {
                        const route = FIX_ROUTE[f.id];
                        if (route && setActiveTab) {
                          setActiveTab(route.tab);
                          addNotification('Smart Diagnostics', `Navigating to ${route.label}`, 'info');
                        }
                      }}
                    />
                  ))}
                </>
              ) : (
                <EmptyState label="Run Full Diagnostics to see findings." />
              )}
            </div>
          )}

          {/* ── Predictions tab ── */}
          {activeTab === 'predict' && (
            <div className="space-y-3">
              {diagLoading && activeAction === 'predict' ? (
                <LoadingState label="Analyzing failure indicators..." />
              ) : predictResult ? (
                predictResult.predictions?.length === 0 ? (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                    <p className="text-sm font-bold text-emerald-400">No Imminent Failures Predicted</p>
                    <p className="text-xs text-slate-500 mt-1">Disk wear, BSOD trends, and disk space are within safe ranges.</p>
                  </div>
                ) : (
                  predictResult.predictions.map((p, i) => (
                    <div key={i} className={`glass-panel border rounded-xl p-4 space-y-2 ${
                      p.severity === 'critical' ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'
                    }`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <HardDrive className={`h-4 w-4 ${p.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'}`} />
                          <span className="text-sm font-bold text-slate-200">{p.component}</span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase">{p.failureType}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            p.probability === 'High'
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          }`}>{p.probability} Risk</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-brand-border text-slate-300">
                            {p.timeframe}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{p.detail}</p>
                    </div>
                  ))
                )
              ) : (
                <EmptyState label="Click 'Predict Failures' to analyze failure trends." />
              )}
            </div>
          )}

          {/* ── Recommendations tab ── */}
          {activeTab === 'recommend' && (
            <div className="space-y-3">
              {diagLoading && activeAction === 'recommend' ? (
                <LoadingState label="Generating prioritised fix list..." />
              ) : recoResult ? (
                recoResult.recommendations?.length === 0 ? (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                    <p className="text-sm font-bold text-emerald-400">No Recommendations</p>
                    <p className="text-xs text-slate-500 mt-1">All metrics within healthy ranges.</p>
                  </div>
                ) : (
                  recoResult.recommendations.map((r, i) => {
                    const SevIcon = SEVERITY_META[r.priority]?.icon || Info;
                    const sevMeta = SEVERITY_META[r.priority] || SEVERITY_META.info;
                    return (
                      <div key={i} className={`glass-panel border rounded-xl p-4 space-y-2 ${sevMeta.bg}`}>
                        <div className="flex items-center gap-2">
                          <SevIcon className={`h-4 w-4 shrink-0 ${sevMeta.text}`} />
                          <span className="text-sm font-bold text-slate-200">{r.title}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sevMeta.bg} ${sevMeta.text}`}>
                            {r.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{r.action}</p>
                      </div>
                    );
                  })
                )
              ) : (
                <EmptyState label="Click 'Get Recommendations' to generate a fix list." />
              )}
            </div>
          )}

          {/* ── Event Logs tab ── */}
          {activeTab === 'logs' && (
            <div className="glass-panel border border-brand-border rounded-xl flex flex-col" style={{ minHeight: 420 }}>
              <div className="flex justify-between items-center px-4 py-3 border-b border-brand-border">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-400" /> Recent Critical Events (last 15)
                </h3>
                <button onClick={scanLogs} disabled={logsLoading}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer transition-colors">
                  <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {logsLoading ? (
                  <LoadingState label="Fetching Windows Event Logs..." />
                ) : logs.length > 0 && logs[0] ? (
                  logs.map((log, idx) => (
                    <div key={idx} className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded uppercase font-bold">
                          {log.ProviderName || 'System'}
                        </span>
                        <span className="text-[10px] text-slate-500">{formatDate(log.TimeCreated)}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">{log.Message}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No recent critical events found.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function ActionBtn({ icon: Icon, label, sublabel, loading, disabled, onClick, color }) {
  const colors = {
    violet:  'bg-brand-violet/10 hover:bg-brand-violet/20 border-brand-violet/30 text-brand-violet',
    amber:   'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-400',
    cyan:    'bg-brand-cyan/10 hover:bg-brand-cyan/20 border-brand-cyan/30 text-brand-cyan',
    emerald: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${colors[color]}`}>
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        : <Icon className="h-4 w-4 shrink-0" />}
      <div className="min-w-0">
        <div className="text-xs font-bold">{label}</div>
        <div className="text-[10px] opacity-70">{sublabel}</div>
      </div>
    </button>
  );
}

function FindingCard({ finding, expanded, onToggle, onFix }) {
  const meta    = SEVERITY_META[finding.severity] || SEVERITY_META.info;
  const CatIcon = CATEGORY_ICON[finding.category] || Activity;
  const SevIcon = meta.icon;
  const route   = FIX_ROUTE[finding.id];
  return (
    <div className={`glass-panel border rounded-xl overflow-hidden ${meta.bg}`}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/5 transition-colors">
        <SevIcon className={`h-4 w-4 shrink-0 ${meta.text}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-slate-200 truncate">
              {finding.diagnosis.split('.')[0]}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.text}`}>
              {meta.label}
            </span>
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <CatIcon className="h-3 w-3" /> {finding.category}
            </span>
          </div>
        </div>
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5">
          <div className="pt-3">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Diagnosis</p>
            <p className="text-xs text-slate-300 leading-relaxed">{finding.diagnosis}</p>
          </div>
          <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800">
            <p className="text-[10px] text-brand-violet font-bold uppercase tracking-wider mb-1">Recommendation</p>
            <p className="text-xs text-slate-300 leading-relaxed">{finding.recommendation}</p>
          </div>
          {route && (
            <button onClick={onFix}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors border ${meta.bg} ${meta.text} hover:opacity-80`}>
              <ArrowRight className="h-3.5 w-3.5" /> {route.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryBadge({ label, count, color }) {
  const colors = {
    rose:  'bg-rose-500/10 border-rose-500/30 text-rose-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    slate: 'bg-slate-800 border-brand-border text-slate-300',
  };
  return (
    <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${colors[color]}`}>
      <span className="text-lg font-black">{count}</span> {label}
    </div>
  );
}

function MetricBar({ label, value, unit, warnAt, critAt, invert }) {
  const pct   = Math.min(Math.max(value || 0, 0), 100);
  const isCrit = invert ? pct <= critAt : pct >= critAt;
  const isWarn = invert ? pct <= warnAt : pct >= warnAt;
  const color  = isCrit ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-slate-500">{label}</span>
        <span className={isCrit ? 'text-rose-400' : isWarn ? 'text-amber-400' : 'text-emerald-400'}>
          {value}{unit}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MetricRow({ label, value, warn }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span className="text-slate-500">{label}</span>
      <span className={warn ? 'text-amber-400 font-bold' : 'text-slate-300'}>{value}</span>
    </div>
  );
}

function LoadingState({ label }) {
  return (
    <div className="py-10 flex flex-col items-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-brand-violet" />
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="py-10 text-center">
      <Bot className="h-10 w-10 text-slate-700 mx-auto mb-3" />
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
