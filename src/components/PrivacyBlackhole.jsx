import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield, ShieldOff, ShieldCheck, Loader2, Info, Activity, Eye, Database, Server, Zap,
  Check, RotateCcw, Search
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

// --- Main ---

export default function PrivacyBlackhole() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [blocklist, setBlocklist] = useState([]);
  const [safeWhitelist, setSafeWhitelist] = useState([]);
  const [selected, setSelected] = useState({});  // domain -> true
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [status, setStatus] = useState(null);
  const [blockedCount, setBlockedCount] = useState({ total: 0, history: [] });
  const [showOutput, setShowOutput] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('transparency'); // 'transparency' | 'configure' | 'counter'

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [blRes, statusRes, countRes] = await Promise.all([
          window.api.privacyGetBlocklist(),
          window.api.runSystemCommand('run-privacy-tool', ['get-status'], { bypassConfirmation: true }),
          window.api.privacyGetBlockedCount()
        ]);
        if (blRes.success) {
          setBlocklist(blRes.blocklist || []);
          setSafeWhitelist(blRes.safeWhitelist || []);
        }
        const sObj = safeJsonParse(statusRes?.stdout);
        if (sObj?.success) setStatus(sObj.status);
        if (countRes.success) setBlockedCount(countRes.count || { total: 0, history: [] });
      } else {
        setBlocklist(['vortex.data.microsoft.com', 'telemetry.microsoft.com', 'cortana.events.data.microsoft.com']);
        setSafeWhitelist(['windowsupdate.microsoft.com', 'login.live.com']);
        setStatus({ hostsBlockCount: 0, firewallRules: [], gpoKeys: [], hostsMarkerPresent: false });
        setBlockedCount({ total: 847, history: [] });
      }
    } catch (e) {
      addNotification('Privacy Blackhole', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Live counter polling (every 30s while on counter tab)
  useEffect(() => {
    if (activeTab !== 'counter') return;
    const id = setInterval(async () => {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-privacy-tool', ['count-blocked-today'], { bypassConfirmation: true });
        const obj = safeJsonParse(res?.stdout);
        if (obj?.success && obj.blockedToday > 0) {
          await window.api.privacyAppendBlockedCount(obj.blockedToday);
          const countRes = await window.api.privacyGetBlockedCount();
          if (countRes.success) setBlockedCount(countRes.count);
        }
      }
    }, 30000);
    return () => clearInterval(id);
  }, [activeTab]);

  const isActive = status?.hostsMarkerPresent || (status?.firewallRules?.length > 0);

  const filteredBlocklist = useMemo(() => {
    if (!search) return blocklist;
    const q = search.toLowerCase();
    return blocklist.filter(d => d.toLowerCase().includes(q));
  }, [blocklist, search]);

  const selectedDomains = Object.keys(selected).filter(k => selected[k]);
  const selectedCount = selectedDomains.length;

  const handleApplyAll = async () => {
    // Use entire curated blocklist (filtered against safe whitelist first)
    const domains = blocklist;
    const ok = await confirm({
      title: 'Activate Privacy Blackhole',
      message: `Block all ${domains.length} telemetry domains + add firewall rules + set GPO keys?`,
      detail: `Layers: HOSTS file (DNS-level) + Windows Firewall (per-binary) + Group Policy (reg keys).\nSafe whitelist enforced: ${safeWhitelist.length} critical domains will NOT be blocked.`,
      confirmLabel: 'Activate',
      danger: false
    });
    if (!ok) return;
    setApplying(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const filterRes = await window.api.privacyFilterSafe(domains);
        const safeDomains = filterRes.success ? filterRes.kept : domains;
        if (filterRes.success && filterRes.dropped.length > 0) {
          addNotification('Privacy Blackhole',
            `Dropped ${filterRes.dropped.length} domains from safe whitelist (would break Windows Update/Activation).`,
            'warning');
        }
        const res = await window.api.runSystemCommand('run-privacy-tool',
          ['apply-blocklist', JSON.stringify(safeDomains)]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          const s = obj.summary || {};
          addNotification('Privacy Blackhole',
            `Active: ${s.hostsBlocks} HOSTS blocks, ${s.firewallRulesAdded} firewall rules, ${s.gpoKeysSet} GPO keys.`,
            'success');
          await fetchAll();
        } else {
          addNotification('Privacy Blackhole', obj?.error || 'Apply failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Privacy Blackhole', e.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleApplySelected = async () => {
    if (selectedCount === 0) {
      addNotification('Privacy Blackhole', 'Select at least one domain.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Block Selected Domains',
      message: `Block ${selectedCount} domain(s) in HOSTS file + set firewall rules + GPO keys?`,
      confirmLabel: `Block ${selectedCount} Domains`,
      danger: false
    });
    if (!ok) return;
    setApplying(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const filterRes = await window.api.privacyFilterSafe(selectedDomains);
        const safeDomains = filterRes.success ? filterRes.kept : selectedDomains;
        const res = await window.api.runSystemCommand('run-privacy-tool',
          ['apply-blocklist', JSON.stringify(safeDomains)]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Privacy Blackhole', `Blocked ${safeDomains.length} domains.`, 'success');
          setSelected({});
          await fetchAll();
        }
      }
    } catch (e) {
      addNotification('Privacy Blackhole', e.message, 'error');
    } finally {
      setApplying(false);
    }
  };

  const handleRemove = async () => {
    const ok = await confirm({
      title: 'Deactivate Privacy Blackhole',
      message: 'Remove all SolasCare blocks? HOSTS file restored, firewall rules removed, GPO keys reverted.',
      confirmLabel: 'Deactivate',
      danger: true
    });
    if (!ok) return;
    setRemoving(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-privacy-tool', ['remove-blocklist']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          const r = obj.results || {};
          addNotification('Privacy Blackhole',
            `Deactivated: HOSTS=${r.hostsRestored}, FW=${r.firewallRemoved}, GPO=${r.gpoRestored}.`,
            'success');
          await fetchAll();
        }
      }
    } catch (e) {
      addNotification('Privacy Blackhole', e.message, 'error');
    } finally {
      setRemoving(false);
    }
  };

  const handleResetCounter = async () => {
    const ok = await confirm({
      title: 'Reset Counter',
      message: 'Reset the blocked-requests counter to 0?',
      confirmLabel: 'Reset',
      danger: false
    });
    if (!ok) return;
    if (window.api) {
      await window.api.privacyResetBlockedCount();
      setBlockedCount({ total: 0, history: [] });
      addNotification('Privacy Blackhole', 'Counter reset.', 'success');
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-brand-violet" />
            Absolute Privacy Blackhole
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Hybrid anti-telemetry shield: HOSTS file + Windows Firewall + Group Policy. Blocks 120+ Microsoft
            tracking domains at 3 layers. Safe whitelist prevents breaking Windows Update / Activation.
          </p>
        </div>
        <button onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </header>

      {/* Active banner */}
      {isActive ? (
        <div className="glass-panel border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-bold text-slate-200">
                Privacy Blackhole <span className="text-emerald-400">ACTIVE</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {status?.hostsBlockCount || 0} HOSTS blocks · {status?.firewallRules?.length || 0} firewall rules · {status?.gpoKeys?.length || 0} GPO keys
              </div>
            </div>
          </div>
          <button onClick={handleRemove} disabled={removing}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Deactivate
          </button>
        </div>
      ) : (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
          <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-300">Not active.</strong> Activate the blackhole to block Windows
            telemetry at 3 layers: DNS (HOSTS), network (Firewall), and policy (GPO).
          </div>
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="160px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'transparency', label: 'Transparency', icon: Eye },
          { id: 'configure', label: 'Configure', icon: Shield },
          { id: 'counter', label: 'Live Counter', icon: Activity }
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
          <p className="text-xs text-slate-400">Loading blocklist...</p>
        </div>
      ) : (
        <>
          {activeTab === 'transparency' && (
            <TransparencyView status={status} blocklist={blocklist} safeWhitelist={safeWhitelist} />
          )}

          {activeTab === 'configure' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex items-center max-w-md flex-1 min-w-[240px]">
                  <Search className="absolute left-3 h-4 w-4 text-slate-500" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search domains..."
                    className="pl-9 pr-4 py-2 w-full bg-slate-900 border border-brand-border rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-violet" />
                </div>
                <button onClick={handleApplyAll} disabled={applying}
                  className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
                  {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                  Activate All ({blocklist.length})
                </button>
                <button onClick={handleApplySelected} disabled={applying || selectedCount === 0}
                  className="px-4 py-2 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50">
                  <Shield className="h-3.5 w-3.5" />
                  Apply Selected ({selectedCount})
                </button>
              </div>

              {/* Safe whitelist notice */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300">Safe whitelist active ({safeWhitelist.length} domains):</strong>{' '}
                  Windows Update, Activation, Store, and OneDrive domains will NEVER be blocked even if selected.
                  Critical for system stability.
                </div>
              </div>

              <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-brand-border flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">{filteredBlocklist.length} domains</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSelected(Object.fromEntries(blocklist.map(d => [d, true])))}
                      className="text-[10px] text-brand-cyan hover:underline cursor-pointer">Select All</button>
                    <button onClick={() => setSelected({})}
                      className="text-[10px] text-slate-500 hover:underline cursor-pointer">Clear</button>
                  </div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {filteredBlocklist.map(d => {
                    const isSel = !!selected[d];
                    const safeLower = safeWhitelist.map(s => s.toLowerCase());
                    const isSafe = safeLower.some(s => d.toLowerCase() === s || d.toLowerCase().endsWith('.' + s));
                    return (
                      <div key={d} onClick={() => setSelected(prev => { const n = { ...prev }; if (n[d]) delete n[d]; else n[d] = true; return n; })}
                        className={`p-2 flex items-center gap-3 cursor-pointer transition-colors ${isSel ? 'bg-brand-violet/5' : 'hover:bg-slate-800/30'}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSel ? 'bg-brand-violet border-brand-violet' : 'border-brand-border'}`}>
                          {isSel && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="text-[11px] font-mono text-slate-300 flex-1 truncate">{d}</div>
                        {isSafe && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            SAFE
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'counter' && (
            <div className="space-y-4">
              <div className="glass-panel border border-brand-border rounded-xl p-6 text-center">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total Blocked Requests</div>
                <div className="text-5xl font-black text-brand-violet mt-2 mb-1">{(blockedCount.total || 0).toLocaleString()}</div>
                <div className="text-[10px] text-slate-500">since counter last reset</div>
                <button onClick={handleResetCounter}
                  className="mt-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded border border-brand-border flex items-center gap-1 mx-auto cursor-pointer">
                  <RotateCcw className="h-3 w-3" /> Reset Counter
                </button>
              </div>
              <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                <Info className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
                <div>
                  <strong className="text-brand-cyan">How counting works:</strong> SolasCare parses the Windows
                  Firewall log every 30 seconds for blocked outbound connections matching SolasCarePrivacy rules.
                  Counter requires firewall logging to be enabled (admin). If the log isn't enabled, the count
                  stays at 0 — this is a Windows limitation, not a SolasCare bug.
                </div>
              </div>
              {blockedCount.history && blockedCount.history.length > 0 && (
                <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2 border-b border-brand-border">
                    <h3 className="text-xs font-bold text-slate-300">Recent Activity</h3>
                  </div>
                  <div className="divide-y divide-brand-border/50 max-h-[200px] overflow-y-auto">
                    {blockedCount.history.slice(-20).reverse().map((h, i) => (
                      <div key={i} className="p-2 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">{new Date(h.ts).toLocaleString()}</span>
                        <span className="text-brand-violet font-bold">+{h.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Transparency View ---

function TransparencyView({ status, blocklist, safeWhitelist }) {
  const layers = [
    {
      name: 'HOSTS File (DNS-level)',
      icon: Database,
      active: status?.hostsMarkerPresent,
      count: status?.hostsBlockCount || 0,
      detail: 'Routes blocked domains to 0.0.0.0 at DNS resolver level',
      color: status?.hostsMarkerPresent ? 'emerald' : 'slate'
    },
    {
      name: 'Windows Firewall (per-binary)',
      icon: Server,
      active: (status?.firewallRules?.length || 0) > 0,
      count: status?.firewallRules?.length || 0,
      detail: 'Blocks outbound traffic from telemetry service executables',
      color: (status?.firewallRules?.length || 0) > 0 ? 'emerald' : 'slate'
    },
    {
      name: 'Group Policy (reg keys)',
      icon: Zap,
      active: (status?.gpoKeys?.length || 0) > 0,
      count: status?.gpoKeys?.length || 0,
      detail: 'Disables telemetry services via HKLM/HKCU registry policy keys',
      color: (status?.gpoKeys?.length || 0) > 0 ? 'emerald' : 'slate'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {layers.map(l => {
          const Icon = l.icon;
          const colorClass = l.color === 'emerald'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
            : 'border-brand-border bg-slate-900/40 text-slate-500';
          return (
            <div key={l.name} className={`glass-panel rounded-xl p-4 border ${colorClass}`}>
              <div className="flex items-start justify-between mb-2">
                <Icon className="h-5 w-5" />
                {l.active ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-brand-border text-slate-500">
                    INACTIVE
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-slate-200">{l.name}</div>
              <div className="text-2xl font-black mt-2">{l.count}</div>
              <div className="text-[10px] text-slate-500 mt-1">{l.detail}</div>
            </div>
          );
        })}
      </div>

      <div className="glass-panel border border-brand-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3">
          <Eye className="h-4 w-4 text-brand-cyan" /> What SolasCare Blocks
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-slate-400 font-bold mb-1">Blocked ({blocklist.length} domains):</div>
            <div className="font-mono text-slate-500 space-y-0.5 max-h-[200px] overflow-y-auto">
              {blocklist.slice(0, 30).map((d, i) => (<div key={i} className="truncate">• {d}</div>))}
              {blocklist.length > 30 && <div className="text-slate-600">... +{blocklist.length - 30} more</div>}
            </div>
          </div>
          <div>
            <div className="text-emerald-400 font-bold mb-1">Safe whitelist ({safeWhitelist.length} domains — never blocked):</div>
            <div className="font-mono text-slate-500 space-y-0.5 max-h-[200px] overflow-y-auto">
              {safeWhitelist.map((d, i) => (<div key={i} className="truncate text-emerald-500/70">✓ {d}</div>))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
