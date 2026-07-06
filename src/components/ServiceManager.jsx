import React, { useState, useEffect, useMemo } from 'react';
import { Settings2, RefreshCw, Loader2, Play, Power, AlertTriangle, ShieldCheck, Search, AlertCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useDebounced } from '../utils/hooks';
import { SkeletonTable } from './shared/Skeleton';

export default function ServiceManager() {
  const { addNotification } = useNotification();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingOnServices, setActingOnServices] = useState(new Set()); // IMPROVEMENT: per-row disable (was global)
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All'); // All | Running | Stopped | NotFound
  const [selected, setSelected] = useState(new Set());      // IMPROVEMENT: batch select

  const debouncedSearch = useDebounced(search, 200);

  const loadServices = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('list-services');
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout.trim());
          // The new service_repair.ps1 wraps results under `data` - handle both shapes.
          const list = Array.isArray(parsed) ? parsed : (parsed.data || []);
          setServices(list);
        } else {
          setServices([]);
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setServices([
          { Name: 'wuauserv', DisplayName: 'Windows Update', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false, DependsOn: ['rpcss','bits'], DependedBy: [], BlockedBy: [] },
          { Name: 'bits', DisplayName: 'Background Intelligent Transfer Service', Status: 'Stopped', StartType: 'Manual', CanStop: false, IsRequired: false, DependsOn: ['rpcss'], DependedBy: ['wuauserv'], BlockedBy: [] },
          { Name: 'WSearch', DisplayName: 'Windows Search', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false, DependsOn: [], DependedBy: [], BlockedBy: [] },
          { Name: 'Spooler', DisplayName: 'Print Spooler', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false, DependsOn: ['rpcss'], DependedBy: [], BlockedBy: [] },
          { Name: 'MpsSvc', DisplayName: 'Windows Defender Firewall', Status: 'Running', StartType: 'Automatic', CanStop: false, IsRequired: true, DependsOn: [], DependedBy: [], BlockedBy: [] },
          { Name: 'WinDefend', DisplayName: 'Microsoft Defender Antivirus Service', Status: 'Running', StartType: 'Automatic', CanStop: false, IsRequired: true, DependsOn: [], DependedBy: [], BlockedBy: [] },
          { Name: 'Audiosrv', DisplayName: 'Windows Audio', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false, DependsOn: ['AudioEndpointBuilder'], DependedBy: [], BlockedBy: [] }
        ]);
      }
    } catch (e) {
      console.error(e);
      addNotification('Services Manager', 'Failed to query services status: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // IMPROVEMENT: debounced + memoized filtering. Previously every keystroke
  // filtered the entire list synchronously with no useMemo.
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return services.filter(s => {
      if (statusFilter !== 'All' && s.Status !== statusFilter) return false;
      if (!q) return true;
      return (
        (s.DisplayName || '').toLowerCase().includes(q) ||
        (s.Name || '').toLowerCase().includes(q) ||
        (s.StartType || '').toLowerCase().includes(q)
      );
    });
  }, [services, debouncedSearch, statusFilter]);

  // IMPROVEMENT: per-row acting state so users can queue multiple actions.
  const actOn = async (name, action) => {
    setActingOnServices(prev => new Set([...prev, name]));
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('repair-service', [name, action]);
        if (res.success) {
          addNotification('Service ' + action, `Successfully ${action}ed service: ${name}`, 'success');
          loadServices();
        } else if (res.cancelled) {
          addNotification('Service ' + action, 'Operation cancelled by user.', 'info');
        } else {
          addNotification('Service ' + action + ' Error', res.error || 'Failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1200));
        addNotification('Service ' + action, `${action}ed ${name} successfully (MOCK).`, 'success');
      }
    } catch (e) {
      addNotification('Service ' + action + ' Error', e.message, 'error');
    } finally {
      setActingOnServices(prev => { const n = new Set(prev); n.delete(name); return n; });
    }
  };

  // IMPROVEMENT: batch action runs sequentially to avoid race conditions.
  const batchAct = async (action) => {
    if (selected.size === 0) return;
    addNotification('Batch ' + action, `Processing ${selected.size} service(s)...`, 'info');
    for (const name of [...selected]) {
      await actOn(name, action);
    }
    setSelected(new Set());
  };

  const toggleSelect = (name) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.Name)));
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const statusCounts = useMemo(() => {
    const c = { All: services.length, Running: 0, Stopped: 0, NotFound: 0 };
    for (const s of services) {
      if (c[s.Status] !== undefined) c[s.Status]++;
    }
    return c;
  }, [services]);

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Critical Services Manager</h2>
          <p className="text-xs text-slate-400">Inspect state of core Windows services with dependency-aware repair.</p>
        </div>
        <button
          disabled={loading}
          onClick={loadServices}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* IMPROVEMENT: search + status filter chips */}
      {!loading && services.length > 0 && (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or display name..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950/40 border border-brand-border rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-violet"
            />
          </div>
          <div className="flex gap-1">
            {['All', 'Running', 'Stopped', 'NotFound'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer border transition-colors ${
                  statusFilter === s
                    ? 'bg-brand-violet/20 border-brand-violet text-brand-violet'
                    : 'bg-slate-800/40 border-brand-border text-slate-400 hover:text-white'
                }`}
              >
                {s} {statusCounts[s] !== undefined && <span className="ml-1 opacity-60">({statusCounts[s]})</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* IMPROVEMENT: sticky batch action bar */}
      {!loading && selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between glass-panel border border-brand-violet/40 rounded-xl px-4 py-2 bg-slate-900/80 backdrop-blur">
          <span className="text-xs font-bold text-brand-violet">{selected.size} service(s) selected</span>
          <div className="flex gap-2">
            <button onClick={() => batchAct('restart')} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded text-[11px] font-bold text-slate-300 cursor-pointer">Restart Selected</button>
            <button onClick={() => batchAct('repair')} className="px-3 py-1 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 rounded text-[11px] font-bold text-brand-violet cursor-pointer">Repair Selected</button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1 text-slate-400 hover:text-white text-[11px] cursor-pointer">Clear</button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable cols={6} rows={8} />
      ) : filtered.length > 0 ? (
        <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/40 text-slate-400 border-b border-brand-border">
                  <th className="px-3 py-4 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="cursor-pointer accent-brand-violet"
                    />
                  </th>
                  <th className="px-4 py-4 font-bold">Service Display Name</th>
                  <th className="px-4 py-4 font-bold">System Name</th>
                  <th className="px-4 py-4 font-bold">Status</th>
                  <th className="px-4 py-4 font-bold">Startup Type</th>
                  <th className="px-4 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filtered.map(svc => {
                  const isActing = actingOnServices.has(svc.Name);
                  const isSelected = selected.has(svc.Name);
                  const hasBlockers = svc.BlockedBy && svc.BlockedBy.length > 0;
                  return (
                    <tr key={svc.Name} className={`hover:bg-slate-900/40 transition-colors ${isSelected ? 'bg-brand-violet/5' : ''}`}>
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(svc.Name)}
                          className="cursor-pointer accent-brand-violet"
                        />
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-200">
                        <div className="flex items-center gap-2">
                          {svc.IsRequired && <ShieldCheck className="h-4 w-4 text-brand-success shrink-0" />}
                          <span>{svc.DisplayName}</span>
                        </div>
                        {hasBlockers && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400">
                            <AlertCircle className="h-3 w-3" />
                            Blocked by: {svc.BlockedBy.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 font-mono text-[11px] text-slate-400">{svc.Name}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2.5 py-0.5 rounded font-black text-[10px] uppercase ${
                          svc.Status === 'Running' ? 'bg-emerald-500/10 text-brand-success' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {svc.Status}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-300">{svc.StartType}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            disabled={isActing}
                            onClick={() => actOn(svc.Name, 'restart')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded text-[11px] font-bold text-slate-300 cursor-pointer disabled:opacity-50"
                          >
                            {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Restart'}
                          </button>
                          <button
                            disabled={isActing}
                            onClick={() => actOn(svc.Name, 'repair')}
                            className="px-2.5 py-1 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 rounded text-[11px] font-bold text-brand-violet cursor-pointer disabled:opacity-50"
                          >
                            {isActing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Repair & Enable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl">
          <Settings2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-bold">
            {services.length === 0 ? 'Failed to load core services listing.' : 'No services match the current filter.'}
          </p>
          {services.length > 0 && (
            <button onClick={() => { setSearch(''); setStatusFilter('All'); }} className="mt-3 text-xs text-brand-violet cursor-pointer">Clear filters</button>
          )}
        </div>
      )}
    </div>
  );
}
