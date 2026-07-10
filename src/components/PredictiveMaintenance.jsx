import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity, HardDrive, MemoryStick, Battery, Thermometer, AlertTriangle,
  Loader2, RefreshCw, Settings2, X, TrendingDown, TrendingUp, CheckCircle2,
  Info, Wrench, ChevronDown, ChevronRight, Bot
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

// --- Helpers ---

function safeJsonParse(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch (_) { return null; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return iso; }
}

function formatBytes(b) {
  if (b == null) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const STATUS_META = {
  healthy:  { label: 'Healthy',  color: 'emerald', bgClass: 'bg-emerald-500/10 border-emerald-500/30', textClass: 'text-emerald-400' },
  fair:     { label: 'Fair',     color: 'amber',   bgClass: 'bg-amber-500/10 border-amber-500/30',   textClass: 'text-amber-400' },
  poor:     { label: 'Poor',     color: 'orange',  bgClass: 'bg-orange-500/10 border-orange-500/30', textClass: 'text-orange-400' },
  critical: { label: 'Critical', color: 'rose',    bgClass: 'bg-rose-500/10 border-rose-500/30',    textClass: 'text-rose-400' }
};

// --- Main ---

export default function PredictiveMaintenance() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [score, setScore] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [smartData, setSmartData] = useState(null);
  const [ramData, setRamData] = useState(null);
  const [cpuTemp, setCpuTemp] = useState(null);
  const [batteryData, setBatteryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [liveAlert, setLiveAlert] = useState(null);
  // Diagnostics tab state
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  // SMART expand
  const [smartExpanded, setSmartExpanded] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [scoreRes, histRes, alertRes, settingsRes] = await Promise.all([
          window.api.runSystemCommand('run-health-tool', ['compute-health-score'], { bypassConfirmation: true }),
          window.api.healthListHistory(90),
          window.api.healthListAlerts(30),
          window.api.healthGetSettings()
        ]);
        const scoreObj = safeJsonParse(scoreRes?.stdout);
        if (scoreObj?.success) setScore(scoreObj);
        if (histRes.success) setHistory(histRes.history || []);
        if (alertRes.success) setAlerts(alertRes.alerts || []);
        if (settingsRes.success) setSettings(settingsRes.settings);
      } else {
        // Mock data
        setScore({
          score: 78, status: 'fair',
          details: {
            smart: { available: true, predicting: 0, weight: 35, penalty: 0 },
            ram: { available: true, errors: 0, weight: 15, penalty: 0 },
            cpuTemp: { available: true, celsius: 72, weight: 15, penalty: 5 },
            battery: { available: true, healthPercent: 65, weight: 15, penalty: 0 },
            diskFree: { available: true, freePercent: 18, weight: 20, penalty: 5 }
          }
        });
        setHistory([
          { ts: new Date(Date.now() - 86400000 * 7).toISOString(), score: 94, status: 'healthy' },
          { ts: new Date(Date.now() - 86400000 * 5).toISOString(), score: 88, status: 'healthy' },
          { ts: new Date(Date.now() - 86400000 * 3).toISOString(), score: 82, status: 'fair' },
          { ts: new Date(Date.now() - 86400000).toISOString(), score: 78, status: 'fair' }
        ]);
        setSettings({ cpuTempThreshold: 80, diskFreeThreshold: 10, batteryHealthThreshold: 50, pollingIntervalMinutes: 5 });
      }
    } catch (e) {
      addNotification('Predictive Maintenance', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Subscribe to live alerts
  useEffect(() => {
    if (!window.api?.onHealthAlert) return;
    const unsub = window.api.onHealthAlert((alert) => {
      setLiveAlert(alert);
      addNotification('Health Alert', alert.message, alert.severity === 'critical' ? 'error' : 'warning');
      setTimeout(() => setLiveAlert(null), 8000);
      fetchAll();
    });
    return () => { unsub && unsub(); };
  }, [addNotification, fetchAll]);

  const fetchDetailedMetrics = async () => {
    setRefreshing(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const [smartRes, ramRes, cpuRes, battRes] = await Promise.all([
          window.api.runSystemCommand('run-health-tool', ['get-smart-data'], { bypassConfirmation: true }),
          window.api.runSystemCommand('run-health-tool', ['get-ram-errors'], { bypassConfirmation: true }),
          window.api.runSystemCommand('run-health-tool', ['get-cpu-temp'], { bypassConfirmation: true }),
          window.api.runSystemCommand('run-health-tool', ['get-battery-health'], { bypassConfirmation: true })
        ]);
        const sObj = safeJsonParse(smartRes?.stdout); if (sObj?.success) setSmartData(sObj);
        const rObj = safeJsonParse(ramRes?.stdout); if (rObj?.success) setRamData(rObj.ram);
        const cObj = safeJsonParse(cpuRes?.stdout); if (cObj?.success) setCpuTemp(cObj.temp);
        const bObj = safeJsonParse(battRes?.stdout); if (bObj?.success) setBatteryData(bObj.battery);
        addNotification('Predictive Maintenance', 'Detailed metrics refreshed.', 'success');
      }
    } catch (e) {
      addNotification('Predictive Maintenance', e.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    try {
      if (window.api) {
        const res = await window.api.healthSaveSettings(newSettings);
        if (res.success) {
          setSettings(res.settings);
          addNotification('Predictive Maintenance', 'Thresholds saved.', 'success');
        } else {
          addNotification('Predictive Maintenance', res.error || 'Save failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Predictive Maintenance', e.message, 'error');
    }
  };

  const handleClearAlerts = async () => {
    const ok = await confirm({
      title: 'Clear Alerts',
      message: 'Clear all stored health alerts?',
      confirmLabel: 'Clear', danger: false
    });
    if (!ok) return;
    if (window.api) {
      await window.api.healthClearAlerts();
      setAlerts([]);
      addNotification('Predictive Maintenance', 'Alerts cleared.', 'success');
    }
  };

  const runInlineDiagnostics = async () => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('ai-diagnostics', ['diagnose']);
        const match = res?.stdout?.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No output from diagnostics script');
        const parsed = JSON.parse(match[match.length - 1]);
        if (!parsed.success) throw new Error(parsed.error || 'Diagnostics failed');
        setDiagResult(parsed);
        addNotification('Predictive Maintenance', `Diagnostics: ${parsed.message || 'Complete'}`, 'info');
      }
    } catch (e) {
      addNotification('Predictive Maintenance', 'Diagnostics failed: ' + e.message, 'error');
    } finally {
      setDiagLoading(false);
    }
  };

  const statusMeta = score ? STATUS_META[score.status] : null;

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Activity className="h-5 w-5 text-brand-violet" />
            Predictive Maintenance
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Hardware health monitoring with threshold-based alerts (not predictive ML — vendor-inconsistent SMART
            makes prediction unreliable). Health Score 0-100, trend graph for last 90 days, auto-alerts on critical issues.
          </p>
        </div>
        <button onClick={fetchDetailedMetrics} disabled={refreshing}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh Metrics
        </button>
      </header>

      {/* Live alert toast */}
      {liveAlert && (
        <div className={`glass-panel border rounded-xl p-3 flex items-center justify-between gap-3 ${
          liveAlert.severity === 'critical' ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'
        }`}>
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-4 w-4 ${liveAlert.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'} shrink-0`} />
            <div className="text-xs text-slate-300">{liveAlert.message}</div>
          </div>
          <button onClick={() => setLiveAlert(null)} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="100px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border flex-wrap">
        {[
          { id: 'overview',     label: 'Overview',       icon: Activity },
          { id: 'trend',        label: 'Trend (90 days)', icon: TrendingDown },
          { id: 'alerts',       label: 'Alerts',          icon: AlertTriangle },
          { id: 'diagnostics',  label: 'Diagnostics',     icon: Bot },
          { id: 'settings',     label: 'Thresholds',      icon: Settings2 }
        ].map(t => {
          const Icon = t.icon;
          const isA = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-bold flex items-center gap-2 border-b-2 -mb-px cursor-pointer transition-colors ${
                isA ? 'border-brand-violet text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-xs text-slate-400">Computing health score...</p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && score && statusMeta && (
            <div className="space-y-4">
              {/* Health Score gauge */}
              <div className={`glass-panel border rounded-xl p-6 ${statusMeta.bgClass}`}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">PC Health Score</div>
                    <div className={`text-6xl font-black mt-2 ${statusMeta.textClass}`}>{score.score}</div>
                    <div className="text-sm font-bold text-slate-300 mt-1">
                      <span className={statusMeta.textClass}>{statusMeta.label}</span>
                      <span className="text-slate-500"> · out of 100</span>
                    </div>
                  </div>
                  <div className="w-full md:w-1/2">
                    <HealthGauge score={score.score} status={score.status} />
                  </div>
                </div>
              </div>

              {/* Component breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <ComponentCard icon={HardDrive} title="Storage (SMART)" color="cyan"
                  available={score.details.smart.available}
                  value={score.details.smart.available ? `${score.details.smart.predicting} disk(s) predicting failure` : 'Not available'}
                  penalty={score.details.smart.penalty}
                  weight={score.details.smart.weight}
                  detail={smartData ? `${smartData.count} disk(s) monitored` : 'Click Refresh Metrics'}
                  fixLabel={score.details.smart.penalty > 0 ? 'Run chkdsk' : null}
                  onFix={() => addNotification('Fix', 'Go to Command Hub → Quick Check Disk', 'info')} />
                <ComponentCard icon={MemoryStick} title="RAM" color="violet"
                  available={score.details.ram.available}
                  value={score.details.ram.available ? `${score.details.ram.errors} error(s)` : 'Not available'}
                  penalty={score.details.ram.penalty}
                  weight={score.details.ram.weight}
                  detail={ramData ? `${ramData.sticks?.length || 0} sticks · ${formatBytes(ramData.totalCapacityBytes)}` : 'Click Refresh Metrics'}
                  fixLabel={score.details.ram.penalty > 0 ? 'Check RAM' : null}
                  onFix={() => addNotification('Fix', 'Run Windows Memory Diagnostic: Start → mdsched.exe', 'warning')} />
                <ComponentCard icon={Thermometer} title="CPU Temperature" color="amber"
                  available={score.details.cpuTemp.available}
                  value={score.details.cpuTemp.available ? `${score.details.cpuTemp.celsius}°C` : 'Not available (vendor-specific)'}
                  penalty={score.details.cpuTemp.penalty}
                  weight={score.details.cpuTemp.weight}
                  detail={cpuTemp?.available ? `Zone: ${cpuTemp.zoneName?.slice(0, 30)}` : 'ACPI thermal zone only'}
                  fixLabel={score.details.cpuTemp.penalty > 0 ? 'Reduce Heat' : null}
                  onFix={() => addNotification('Fix', 'Check CPU cooler contact, clean dust, reapply thermal paste. Ensure case airflow is adequate.', 'warning')} />
                <ComponentCard icon={Battery} title="Battery" color="emerald"
                  available={score.details.battery.available}
                  value={score.details.battery.available ? `${score.details.battery.healthPercent}%` : 'No battery (desktop)'}
                  penalty={score.details.battery.penalty}
                  weight={score.details.battery.weight}
                  detail={batteryData?.present ? `Status: ${batteryData.batteryStatus}` : 'Not present'}
                  fixLabel={score.details.battery.penalty > 0 ? 'Battery Report' : null}
                  onFix={async () => {
                    if (window.api) await window.api.runSystemCommand('run-quick-cmd', ['battery-report']);
                    addNotification('Fix', 'Battery report generated on Desktop.', 'success');
                  }} />
                <ComponentCard icon={HardDrive} title="Disk Free Space" color="rose"
                  available={score.details.diskFree.available}
                  value={score.details.diskFree.available ? `${score.details.diskFree.freePercent}% free` : 'Not available'}
                  penalty={score.details.diskFree.penalty}
                  weight={score.details.diskFree.weight}
                  detail="System drive (C:)"
                  fixLabel={score.details.diskFree.penalty > 0 ? 'Run Disk Cleanup' : null}
                  onFix={async () => {
                    if (window.api) await window.api.runSystemCommand('run-quick-cmd', ['disk-cleanup-silent']);
                    addNotification('Fix', 'Disk Cleanup running in background.', 'success');
                  }} />
                <ComponentCard icon={Info} title="Health Methodology" color="slate"
                  available={true}
                  value="Threshold-based"
                  penalty={0}
                  weight={0}
                  detail="Honest: no failure date prediction. Vendor-inconsistent SMART makes that unreliable." />
              </div>

              {/* SMART Detail Table (shown after Refresh Metrics) */}
              {smartData?.disks?.length > 0 && (
                <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
                  <button onClick={() => setSmartExpanded(p => !p)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer hover:bg-white/5 transition-colors">
                    <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-brand-cyan" /> SMART Disk Details
                      <span className="text-[10px] text-slate-500">({smartData.disks.length} disk{smartData.disks.length > 1 ? 's' : ''})</span>
                    </span>
                    {smartExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                  </button>
                  {smartExpanded && (
                    <div className="overflow-x-auto border-t border-brand-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-900/60">
                            {['Disk', 'Type', 'Size', 'Health', 'Status', 'Reason'].map(h => (
                              <th key={h} className="px-3 py-2 text-left text-[10px] text-slate-500 uppercase font-bold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/30">
                          {smartData.disks.map((d, i) => (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="px-3 py-2 text-slate-200 font-medium">{d.FriendlyName || `Disk ${i}`}</td>
                              <td className="px-3 py-2 text-slate-400">{d.MediaType || '—'}</td>
                              <td className="px-3 py-2 text-slate-400">{d.Size ? `${Math.round(d.Size / 1e9)} GB` : '—'}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  d.HealthStatus === 'Healthy'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : d.HealthStatus === 'Warning'
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                    : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                }`}>{d.HealthStatus || '—'}</span>
                              </td>
                              <td className="px-3 py-2 text-slate-400">{d.OperationalStatus || '—'}</td>
                              <td className="px-3 py-2 text-slate-400">{d.ReasonForState || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* About */}
              <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                <Info className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
                <div>
                  <strong className="text-brand-cyan">How scoring works:</strong> 5 metrics with weighted penalties.
                  SMART failure prediction (35% weight) is the heaviest — a single predicting disk drops 30 points.
                  CPU temp penalty kicks in above 70°C. RAM errors and battery critical status also deduct.
                  Score is computed every {settings?.pollingIntervalMinutes || 5} minutes by the background watcher.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'trend' && (
            <TrendGraph history={history} />
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 mb-1">No alerts.</p>
                  <p className="text-xs text-slate-500">System is healthy. Alerts appear here when thresholds are crossed.</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-end">
                    <button onClick={handleClearAlerts}
                      className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer">
                      <X className="h-3 w-3" /> Clear All
                    </button>
                  </div>
                  <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
                    <div className="divide-y divide-brand-border/50 max-h-[500px] overflow-y-auto">
                      {alerts.map((a, i) => (
                        <div key={i} className="p-3 flex items-center gap-3">
                          <AlertTriangle className={`h-4 w-4 shrink-0 ${
                            a.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-slate-200">{a.message}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {formatDateTime(a.ts)} · metric: {a.metric} · value: {a.value}
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            a.severity === 'critical'
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                          }`}>
                            {a.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'settings' && settings && (
            <ThresholdPanel settings={settings} onSave={handleSaveSettings} />
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Runs the same expert system as Smart Diagnostics — 8 rules across RAM, disk, drivers, events, and stability.
                </p>
                <button onClick={runInlineDiagnostics} disabled={diagLoading}
                  className="px-3 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer shrink-0">
                  {diagLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                  {diagLoading ? 'Analyzing...' : 'Run Diagnostics'}
                </button>
              </div>

              {!diagResult && !diagLoading && (
                <div className="py-10 text-center">
                  <Bot className="h-10 w-10 text-slate-700 mx-auto mb-3" />
                  <p className="text-xs text-slate-500">Click "Run Diagnostics" to analyse system metrics and event logs.</p>
                </div>
              )}

              {diagLoading && (
                <div className="py-10 flex flex-col items-center gap-3">
                  <Loader2 className="h-7 w-7 animate-spin text-brand-violet" />
                  <p className="text-xs text-slate-400">Running expert system analysis...</p>
                </div>
              )}

              {diagResult && !diagLoading && (
                <div className="space-y-3">
                  {/* Summary */}
                  <div className="flex gap-3 flex-wrap">
                    {[
                      { label: 'Critical', count: diagResult.criticalCount, color: 'bg-rose-500/10 border-rose-500/30 text-rose-400' },
                      { label: 'Warnings', count: diagResult.warningCount,  color: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
                      { label: 'Total',    count: diagResult.findings?.length || 0, color: 'bg-slate-800 border-brand-border text-slate-300' },
                    ].map(b => (
                      <div key={b.label} className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${b.color}`}>
                        <span className="text-lg font-black">{b.count}</span> {b.label}
                      </div>
                    ))}
                  </div>

                  {/* Findings */}
                  {diagResult.findings?.length === 0 && (
                    <div className="py-8 text-center">
                      <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-bold text-emerald-400">All Clear</p>
                      <p className="text-xs text-slate-500 mt-1">No issues detected across all diagnostic rules.</p>
                    </div>
                  )}

                  {diagResult.findings?.map((f, i) => {
                    const sev = f.severity;
                    const border = sev === 'critical' ? 'border-rose-500/30 bg-rose-500/5'
                      : sev === 'warning' ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-brand-border bg-slate-900/30';
                    const textColor = sev === 'critical' ? 'text-rose-400'
                      : sev === 'warning' ? 'text-amber-400' : 'text-brand-cyan';
                    return (
                      <div key={f.id || i} className={`glass-panel border rounded-xl p-4 space-y-2 ${border}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${border} ${textColor}`}>{sev}</span>
                          <span className="text-sm font-bold text-slate-200">{f.diagnosis.split('.')[0]}</span>
                          <span className="text-[10px] text-slate-500">{f.category}</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{f.diagnosis}</p>
                        <div className="p-3 bg-slate-950/60 rounded border border-slate-800 space-y-1">
                          <p className="text-[10px] text-brand-violet font-bold uppercase">Recommended Fix</p>
                          <p className="text-xs text-slate-300 leading-relaxed">{f.recommendation}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Health Gauge (visual semicircle) ---

function HealthGauge({ score, status }) {
  const meta = STATUS_META[status] || STATUS_META.healthy;
  // Semicircle: 180 degrees, score 0-100
  return (
    <div className="relative w-full h-32 flex items-end justify-center">
      <svg viewBox="0 0 200 110" className="w-full max-w-xs">
        {/* Background arc */}
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="rgb(30 41 59)" strokeWidth="12" strokeLinecap="round" />
        {/* Score arc (using stroke-dasharray for partial fill) */}
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none"
              stroke="currentColor" strokeWidth="12" strokeLinecap="round"
              className={meta.textClass}
              strokeDasharray={`${(score / 100) * 283} 283`} />
        {/* Ticks */}
        {[0, 25, 50, 75, 100].map(t => {
          const a = (t / 100) * Math.PI;
          const x1 = 100 + 80 * Math.cos(Math.PI - a);
          const y1 = 100 - 80 * Math.sin(a);
          const x2 = 100 + 90 * Math.cos(Math.PI - a);
          const y2 = 100 - 90 * Math.sin(a);
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(71 85 105)" strokeWidth="1.5" />;
        })}
      </svg>
      <div className="absolute top-0 left-0 text-[10px] text-slate-500 font-bold">0</div>
      <div className="absolute top-0 right-0 text-[10px] text-slate-500 font-bold">100</div>
    </div>
  );
}

// --- Component Card ---

function ComponentCard({ icon: Icon, title, color, available, value, penalty, weight, detail, fixLabel, onFix }) {
  const colorClass = {
    cyan: 'text-brand-cyan border-brand-cyan/30 bg-brand-cyan/5',
    violet: 'text-brand-violet border-brand-violet/30 bg-brand-violet/5',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5',
    slate: 'text-slate-400 border-brand-border bg-slate-900/40'
  }[color];
  return (
    <div className={`glass-panel rounded-xl p-4 border ${available ? colorClass : 'border-brand-border opacity-60'}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4" />
        {penalty > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400">
            -{penalty} pts
          </span>
        )}
      </div>
      <div className="text-xs font-bold text-slate-300 mb-1">{title}</div>
      <div className={`text-sm font-black ${available ? '' : 'text-slate-600'}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1">{detail}</div>
      {weight > 0 && (
        <div className="text-[9px] text-slate-600 mt-1">weight: {weight}%</div>
      )}
      {fixLabel && onFix && (
        <button onClick={onFix}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-bold rounded-lg cursor-pointer transition-colors">
          <Wrench className="h-3 w-3" /> {fixLabel}
        </button>
      )}
    </div>
  );
}

// --- Trend Graph ---

function TrendGraph({ history }) {
  const [daysBack, setDaysBack] = useState(30);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    return history.filter(h => new Date(h.ts).getTime() >= cutoff);
  }, [history, daysBack]);

  // Compute min/max for scaling
  const { minScore, maxScore, avgScore } = useMemo(() => {
    if (filtered.length === 0) return { minScore: 0, maxScore: 100, avgScore: 0 };
    const scores = filtered.map(h => h.score);
    return {
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      avgScore: scores.reduce((a, b) => a + b, 0) / scores.length
    };
  }, [filtered]);

  // Build SVG path
  const w = 800, h = 240, padding = 40;
  const pathD = useMemo(() => {
    if (filtered.length < 2) return '';
    return filtered.map((p, i) => {
      const x = padding + (i / (filtered.length - 1)) * (w - 2 * padding);
      const y = h - padding - ((p.score - 40) / 60) * (h - 2 * padding);  // 40-100 range
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  }, [filtered]);

  const trendDirection = filtered.length >= 2 && filtered[0].score > filtered[filtered.length - 1].score ? 'down' : 'up';

  return (
    <div className="space-y-4">
      {/* Time range selector */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-slate-400">Range:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDaysBack(d)}
            className={`px-3 py-1 text-xs font-bold rounded-full border cursor-pointer ${
              daysBack === d ? 'border-brand-violet text-white bg-brand-violet/10' : 'border-brand-border text-slate-500 bg-slate-900/40'
            }`}>
            {d} days
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="glass-panel border border-brand-border rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase">Min</div>
          <div className="text-xl font-black text-rose-400">{minScore.toFixed(1)}</div>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase">Average</div>
          <div className="text-xl font-black text-amber-400">{avgScore.toFixed(1)}</div>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-3">
          <div className="text-[10px] text-slate-500 uppercase">Max</div>
          <div className="text-xl font-black text-emerald-400">{maxScore.toFixed(1)}</div>
        </div>
      </div>

      {/* SVG line chart */}
      {filtered.length < 2 ? (
        <div className="py-12 text-center">
          <TrendingUp className="h-10 w-10 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Not enough history for a trend graph yet.</p>
          <p className="text-[10px] text-slate-600 mt-1">Need at least 2 data points. Currently have {filtered.length}.</p>
        </div>
      ) : (
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-200">Health Score Trend</h3>
            <span className={`text-xs font-bold flex items-center gap-1 ${
              trendDirection === 'down' ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {trendDirection === 'down' ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
              {trendDirection === 'down' ? 'Declining' : 'Improving'}
            </span>
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
            {/* Grid lines */}
            {[100, 80, 60, 40].map(y => {
              const py = h - padding - ((y - 40) / 60) * (h - 2 * padding);
              return (
                <g key={y}>
                  <line x1={padding} y1={py} x2={w - padding} y2={py} stroke="rgb(30 41 59)" strokeWidth="1" />
                  <text x={padding - 8} y={py + 3} fill="rgb(100 116 139)" fontSize="10" textAnchor="end">{y}</text>
                </g>
              );
            })}
            {/* Trend line */}
            <path d={pathD} fill="none" stroke="rgb(139 92 246)" strokeWidth="2" />
            {/* Data points */}
            {filtered.map((p, i) => {
              const x = padding + (i / Math.max(1, filtered.length - 1)) * (w - 2 * padding);
              const y = h - padding - ((p.score - 40) / 60) * (h - 2 * padding);
              return <circle key={i} cx={x} cy={y} r="3" fill="rgb(139 92 246)" />;
            })}
          </svg>
          <div className="text-[10px] text-slate-500 text-center mt-2">
            {filtered.length} data points · {new Date(filtered[0].ts).toLocaleDateString()} → {new Date(filtered[filtered.length - 1].ts).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Threshold Panel ---

function ThresholdPanel({ settings, onSave }) {
  const [cpuTempThreshold, setCpuTempThreshold] = useState(settings.cpuTempThreshold);
  const [diskFreeThreshold, setDiskFreeThreshold] = useState(settings.diskFreeThreshold);
  const [batteryHealthThreshold, setBatteryHealthThreshold] = useState(settings.batteryHealthThreshold);
  const [pollingIntervalMinutes, setPollingIntervalMinutes] = useState(settings.pollingIntervalMinutes);

  const handleSave = () => {
    onSave({ ...settings, cpuTempThreshold, diskFreeThreshold, batteryHealthThreshold, pollingIntervalMinutes });
  };

  return (
    <div className="space-y-4">
      <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-brand-violet" /> Alert Thresholds
        </h3>
        <SliderRow label="CPU Temperature Alert" description="Alert when CPU temp exceeds this value"
          value={cpuTempThreshold} min={40} max={110} onChange={setCpuTempThreshold} unit="°C" />
        <SliderRow label="Disk Free Space Alert" description="Alert when system drive free space drops below this value"
          value={diskFreeThreshold} min={1} max={50} onChange={setDiskFreeThreshold} unit="%" />
        <SliderRow label="Battery Health Alert" description="Alert when battery health drops below this value"
          value={batteryHealthThreshold} min={10} max={100} onChange={setBatteryHealthThreshold} unit="%" />
        <SliderRow label="Polling Interval" description="How often the background watcher checks health metrics"
          value={pollingIntervalMinutes} min={1} max={60} onChange={setPollingIntervalMinutes} unit="min" />
        <div className="flex justify-end pt-3 border-t border-brand-border">
          <button onClick={handleSave}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <CheckCircle2 className="h-3.5 w-3.5" /> Save Thresholds
          </button>
        </div>
      </div>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-amber-300">Honest note about prediction:</strong> SolasCare does NOT predict
          failure dates. Vendor-inconsistent SMART data (Samsung vs WD vs Seagate) makes that unreliable — false
          predictions are worse than no predictions. We alert on threshold crossings (reallocated sectors {'>'} 0,
          predict-failure flag set) like CrystalDiskInfo, with trend graphs so you can spot degradation yourself.
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, description, value, min, max, onChange, unit }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-bold text-slate-300">{label}</label>
        <span className="text-sm font-black text-brand-violet">{value} {unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-brand-violet cursor-pointer" />
      <p className="text-[10px] text-slate-500 mt-0.5">{description}</p>
    </div>
  );
}
