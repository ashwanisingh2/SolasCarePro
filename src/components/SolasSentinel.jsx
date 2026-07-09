import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Activity, Plus, Trash2, Pencil, Loader2, RefreshCw, Bell, Cpu,
  MemoryStick, HardDrive, Wifi, AlertTriangle, CheckCircle2, XCircle, Clock,
  Info, X, Zap, Server, Network
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

const METRIC_LABELS = {
  ramPercent: 'RAM Usage %',
  cpuPercent: 'CPU Usage %',
  cpuTempCelsius: 'CPU Temp (°C)',
  diskPercent: 'Disk Usage %',
  networkDrops: 'Network Drops (count)',
  stoppedServices: 'Stopped Services (count)'
};

const ACTION_LABELS = {
  'reset-network-adapter': 'Reset Network Adapter',
  'restart-service': 'Restart Service',
  'kill-process': 'Kill Process',
  'clear-print-spooler': 'Clear Print Spooler',
  'flush-dns': 'Flush DNS',
  'notify-only': 'Notify Only'
};

// --- Main ---

export default function SolasSentinel() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [rules, setRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('rules'); // 'rules' | 'events' | 'digest'
  const [showEdit, setShowEdit] = useState(null);  // null | 'new' | rule object
  const [liveEvent, setLiveEvent] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [rulesRes, eventsRes, digestRes] = await Promise.all([
          window.api.sentinelListRules(),
          window.api.sentinelListEvents(7),
          window.api.sentinelGetDigest()
        ]);
        if (rulesRes.success) setRules(rulesRes.rules || []);
        if (eventsRes.success) setEvents(eventsRes.events || []);
        if (digestRes.success) setDigest(digestRes.digest);
      } else {
        setRules([
          { id: 'rule_auto_reset_network', name: 'Auto-reset network on drops', enabled: true,
            condition: { metric: 'networkDrops', op: '>', threshold: 3, windowMinutes: 5 },
            action: { type: 'reset-network-adapter', arg: 'Wi-Fi' }, cooldownMinutes: 15, lastFiredIso: null }
        ]);
        setEvents([]);
      }
    } catch (e) {
      addNotification('Sentinel', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Subscribe to live rule fires
  useEffect(() => {
    if (!window.api?.onSentinelRuleFired) return;
    const unsub = window.api.onSentinelRuleFired((data) => {
      setLiveEvent(data);
      addNotification('Sentinel Rule Fired',
        `"${data.rule.name}" → ${data.healSuccess ? 'healed' : 'failed'}`,
        data.healSuccess ? 'success' : 'error');
      setTimeout(() => setLiveEvent(null), 8000);
      fetchAll();
    });
    return () => { unsub && unsub(); };
  }, [addNotification, fetchAll]);

  const handleSaveRule = async (rule) => {
    try {
      if (window.api) {
        const res = await window.api.sentinelSaveRule(rule);
        if (res.success) {
          addNotification('Sentinel', `Rule "${rule.name}" saved.`, 'success');
          await fetchAll();
          setShowEdit(null);
        } else {
          addNotification('Sentinel', res.error || 'Save failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Sentinel', e.message, 'error');
    }
  };

  const handleDelete = async (rule) => {
    const ok = await confirm({
      title: 'Delete Rule',
      message: `Delete rule "${rule.name}"?`,
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    if (window.api) {
      const res = await window.api.sentinelDeleteRule(rule.id);
      if (res.success) {
        addNotification('Sentinel', 'Rule deleted.', 'success');
        await fetchAll();
      }
    }
  };

  const handleToggle = async (rule) => {
    const updated = { ...rule, enabled: !rule.enabled };
    await handleSaveRule(updated);
  };

  const handleGenerateDigest = async () => {
    try {
      if (window.api) {
        const res = await window.api.sentinelGenerateDigest();
        if (res.success) {
          setDigest(res.digest);
          addNotification('Sentinel', 'Weekly digest generated.', 'success');
        }
      }
    } catch (e) {
      addNotification('Sentinel', e.message, 'error');
    }
  };

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Shield className="h-5 w-5 text-brand-violet" />
            Solas Sentinel
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Background watchdog with auto-healing rules. Detects network drops, RAM spikes, stuck services,
            and applies user-defined heal actions automatically. Weekly digest summarizes activity.
          </p>
        </div>
        <button onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </header>

      {/* Status banner */}
      <div className="glass-panel border border-brand-border rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${enabledCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></div>
          <div>
            <div className="text-sm font-bold text-slate-200">
              Sentinel {enabledCount > 0 ? 'ACTIVE' : 'IDLE'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {enabledCount} of {rules.length} rules enabled · polling every 2 minutes · {events.length} events in last 7 days
            </div>
          </div>
        </div>
        <button onClick={() => setShowEdit('new')}
          className="px-3 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
          <Plus className="h-3.5 w-3.5" /> New Rule
        </button>
      </div>

      {/* Live event toast */}
      {liveEvent && (
        <div className={`glass-panel border rounded-xl p-3 flex items-center justify-between gap-3 ${
          liveEvent.healSuccess ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/30 bg-rose-500/5'
        }`}>
          <div className="flex items-center gap-3">
            {liveEvent.healSuccess ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />}
            <div className="text-xs text-slate-300">
              <strong>{liveEvent.rule.name}</strong> fired · {ACTION_LABELS[liveEvent.rule.action.type] || liveEvent.rule.action.type}
              {' · '}{liveEvent.healSuccess ? 'Success' : 'Failed'}
            </div>
          </div>
          <button onClick={() => setLiveEvent(null)} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="100px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'rules', label: 'Rules', icon: Zap },
          { id: 'events', label: 'Event Log (7 days)', icon: Clock },
          { id: 'digest', label: 'Weekly Digest', icon: Bell }
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
          <p className="text-xs text-slate-400">Loading...</p>
        </div>
      ) : (
        <>
          {activeTab === 'rules' && (
            <div className="space-y-3">
              {rules.length === 0 ? (
                <div className="py-12 text-center">
                  <Zap className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 mb-1">No rules yet.</p>
                  <p className="text-xs text-slate-500">Click "New Rule" to create an auto-heal rule.</p>
                </div>
              ) : (
                rules.map(r => (
                  <RuleRow key={r.id} rule={r}
                    onToggle={() => handleToggle(r)}
                    onEdit={() => setShowEdit(r)}
                    onDelete={() => handleDelete(r)} />
                ))
              )}
              <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                <Info className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
                <div>
                  <strong className="text-brand-cyan">How rules work:</strong> Sentinel polls system state
                  every 2 minutes. When a rule's condition is met, its action fires (after cooldown). Heal
                  actions use the same allowlisted PowerShell commands as the rest of SolasCare — no security
                  shortcuts. Network drops are detected by comparing adapter up-count between polls.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
              {events.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No events in the last 7 days.</p>
                </div>
              ) : (
                <div className="divide-y divide-brand-border/50 max-h-[500px] overflow-y-auto">
                  {events.map((e, i) => (
                    <EventRow key={i} event={e} />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'digest' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={handleGenerateDigest}
                  className="px-3 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
                  <RefreshCw className="h-3.5 w-3.5" /> Generate Fresh Digest
                </button>
              </div>
              {digest ? (
                <DigestView digest={digest} rules={rules} />
              ) : (
                <div className="py-12 text-center">
                  <Bell className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No digest yet. Click "Generate Fresh Digest".</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showEdit && (
        <RuleEditor rule={showEdit === 'new' ? null : showEdit}
          onSave={handleSaveRule}
          onCancel={() => setShowEdit(null)} />
      )}
    </div>
  );
}

// --- Rule Row ---

function RuleRow({ rule, onToggle, onEdit, onDelete }) {
  const metricLabel = METRIC_LABELS[rule.condition.metric] || rule.condition.metric;
  const actionLabel = ACTION_LABELS[rule.action.type] || rule.action.type;
  return (
    <div className={`glass-panel border rounded-xl p-4 ${rule.enabled ? 'border-brand-violet/30' : 'border-brand-border opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-bold text-slate-200">{rule.name}</div>
            <button onClick={onToggle}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer ${
                rule.enabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-800 border-brand-border text-slate-500'
              }`}>
              {rule.enabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-mono">IF {metricLabel} {rule.condition.op} {rule.condition.threshold}</span>
            <span className="text-slate-600">→</span>
            <span className="font-mono text-brand-violet">{actionLabel}{rule.action.arg ? ` (${rule.action.arg})` : ''}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            Cooldown: {rule.cooldownMinutes} min · Last fired: {rule.lastFiredIso ? formatDateTime(rule.lastFiredIso) : 'never'}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit}
            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded border border-brand-border cursor-pointer"
            title="Edit rule">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={onDelete}
            className="px-2 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] rounded cursor-pointer"
            title="Delete rule">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Event Row ---

function EventRow({ event }) {
  const isHealSuccess = event.eventType === 'heal-success';
  const isHealFailure = event.eventType === 'heal-failure';
  const isNetworkDrop = event.eventType === 'network-drop';

  let Icon, color;
  if (isHealSuccess) { Icon = CheckCircle2; color = 'text-emerald-400'; }
  else if (isHealFailure) { Icon = XCircle; color = 'text-rose-400'; }
  else if (isNetworkDrop) { Icon = Network; color = 'text-amber-400'; }
  else { Icon = Activity; color = 'text-slate-400'; }

  return (
    <div className="p-3 flex items-start gap-3">
      <Icon className={`h-3.5 w-3.5 ${color} shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold text-slate-200">
          {event.ruleName || event.eventType}
          {event.action && ` · ${ACTION_LABELS[event.action] || event.action}`}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {formatDateTime(event.ts)}
          {event.metric && ` · ${event.metric}: ${event.actualValue} (threshold ${event.threshold})`}
          {event.details && ` · ${event.details}`}
        </div>
        {event.result?.error && (
          <div className="text-[10px] text-rose-400 mt-1">Error: {event.result.error}</div>
        )}
      </div>
    </div>
  );
}

// --- Digest View ---

function DigestView({ digest, rules }) {
  const ruleNameFor = (id) => rules.find(r => r.id === id)?.name || id;
  return (
    <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Bell className="h-4 w-4 text-brand-violet" /> Weekly Digest
        </h3>
        <span className="text-[10px] text-slate-500">
          {formatDateTime(digest.periodStartIso)} → {formatDateTime(digest.generatedAtIso)}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/40 border border-brand-border rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Total Events</div>
          <div className="text-2xl font-black text-slate-200">{digest.totalEvents}</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-[10px] text-emerald-500 uppercase">Heals OK</div>
          <div className="text-2xl font-black text-emerald-400">{digest.successfulHeals}</div>
        </div>
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
          <div className="text-[10px] text-rose-500 uppercase">Heals Failed</div>
          <div className="text-2xl font-black text-rose-400">{digest.failedHeals}</div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="text-[10px] text-amber-500 uppercase">Network Drops</div>
          <div className="text-2xl font-black text-amber-400">{digest.byType['network-drop'] || 0}</div>
        </div>
      </div>

      {digest.topIssue && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300">
          <AlertTriangle className="h-4 w-4 text-amber-400 inline mr-2" />
          <strong className="text-amber-300">Top issue this week:</strong>{' '}
          {ruleNameFor(digest.topIssue.ruleId)} ({digest.topIssue.count} fires)
        </div>
      )}

      {Object.keys(digest.byRule).length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-300 mb-2">Fires by Rule</h4>
          <div className="space-y-1">
            {Object.entries(digest.byRule).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
              <div key={id} className="flex items-center justify-between bg-slate-900/40 border border-brand-border rounded px-3 py-1.5">
                <span className="text-xs text-slate-300">{ruleNameFor(id)}</span>
                <span className="text-xs font-bold text-brand-violet">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {digest.totalEvents === 0 && (
        <div className="text-center py-6">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No issues this week. SolasCare kept things smooth.</p>
        </div>
      )}
    </div>
  );
}

// --- Rule Editor ---

function RuleEditor({ rule, onSave, onCancel }) {
  const [id, setId] = useState(rule?.id || 'rule_' + Date.now().toString(36));
  const [name, setName] = useState(rule?.name || '');
  const [enabled, setEnabled] = useState(rule?.enabled !== false);
  const [metric, setMetric] = useState(rule?.condition?.metric || 'ramPercent');
  const [op, setOp] = useState(rule?.condition?.op || '>');
  const [threshold, setThreshold] = useState(rule?.condition?.threshold || 90);
  const [windowMinutes, setWindowMinutes] = useState(rule?.condition?.windowMinutes || 0);
  const [actionType, setActionType] = useState(rule?.action?.type || 'notify-only');
  const [actionArg, setActionArg] = useState(rule?.action?.arg || '');
  const [cooldownMinutes, setCooldownMinutes] = useState(rule?.cooldownMinutes || 15);

  const handleSave = () => {
    if (!name.trim()) return;
    const newRule = {
      id, name: name.trim(), enabled,
      condition: { metric, op, threshold, windowMinutes },
      action: { type: actionType, arg: actionArg },
      cooldownMinutes,
      lastFiredIso: rule?.lastFiredIso || null
    };
    onSave(newRule);
  };

  const needsArg = ['reset-network-adapter', 'restart-service', 'kill-process'].includes(actionType);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="glass-panel border border-brand-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Zap className="h-4 w-4 text-brand-violet" /> {rule ? 'Edit Rule' : 'New Rule'}
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rule Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
              placeholder="e.g. Auto-reset network on drops"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
          </div>

          {/* Condition */}
          <div className="pt-3 border-t border-brand-border">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Condition (IF)</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Metric</label>
                <select value={metric} onChange={e => setMetric(e.target.value)}
                  className="w-full bg-slate-900 border border-brand-border rounded px-2 py-1.5 text-xs text-slate-200">
                  {Object.entries(METRIC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Op</label>
                <select value={op} onChange={e => setOp(e.target.value)}
                  className="w-full bg-slate-900 border border-brand-border rounded px-2 py-1.5 text-xs text-slate-200">
                  <option value=">">{'>'}</option>
                  <option value="<">{'<'}</option>
                  <option value=">=">{'≥'}</option>
                  <option value="<=">{'≤'}</option>
                  <option value="==">{'='}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Threshold</label>
                <input type="number" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-brand-border rounded px-2 py-1.5 text-xs text-slate-200" />
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="pt-3 border-t border-brand-border">
            <div className="text-[10px] font-bold text-slate-500 uppercase mb-2">Action (THEN)</div>
            <div className="space-y-2">
              <select value={actionType} onChange={e => setActionType(e.target.value)}
                className="w-full bg-slate-900 border border-brand-border rounded px-2 py-1.5 text-xs text-slate-200">
                {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {needsArg && (
                <input type="text" value={actionArg} onChange={e => setActionArg(e.target.value)} maxLength={200}
                  placeholder={actionType === 'restart-service' ? 'e.g. Spooler' : actionType === 'kill-process' ? 'e.g. chrome' : 'e.g. Wi-Fi'}
                  className="w-full bg-slate-900 border border-brand-border rounded px-2 py-1.5 text-xs text-slate-200 font-mono" />
              )}
            </div>
          </div>

          {/* Cooldown */}
          <div className="pt-3 border-t border-brand-border">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cooldown (minutes)</label>
            <input type="number" value={cooldownMinutes} onChange={e => setCooldownMinutes(parseInt(e.target.value) || 0)}
              min={0} max={1440}
              className="w-full bg-slate-900 border border-brand-border rounded px-2 py-1.5 text-xs text-slate-200" />
            <p className="text-[10px] text-slate-500 mt-1">Don't re-fire within N minutes (prevents flapping).</p>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between pt-3 border-t border-brand-border">
            <span className="text-xs text-slate-300">Enabled</span>
            <button onClick={() => setEnabled(s => !s)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer ${
                enabled ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-900 border-brand-border text-slate-500'
              }`}>
              {enabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-brand-border">
          <button onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:bg-slate-800/60 cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!name.trim() || (needsArg && !actionArg.trim())}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            <CheckCircle2 className="h-3.5 w-3.5" /> Save Rule
          </button>
        </div>
      </div>
    </div>
  );
}
