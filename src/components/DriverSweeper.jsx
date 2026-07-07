import React, { useState, useEffect } from 'react';
import { Loader2, Trash2, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';

// DriverSweeper: lists third-party drivers from the driver store (pnputil /enum-drivers)
// and allows force-removing selected ones. Real Windows operations only.
export default function DriverSweeper() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [search, setSearch] = useState('');

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-install', ['list-store']);
        const m = res.stdout?.match(/===RESULT===\s*(\{[\s\S]*\})/);
        if (m) {
          const obj = JSON.parse(m[1]);
          // Filter out Microsoft drivers (drivers we should NOT sweep)
          const thirdParty = (obj.drivers || []).filter(d =>
            !(d.Signer || '').match(/Microsoft/i) &&
            !(d.Provider || '').match(/Microsoft/i)
          );
          setDrivers(thirdParty);
          addNotification('Driver Sweeper', `Loaded ${thirdParty.length} third-party driver(s) (excluded ${obj.drivers.length - thirdParty.length} Microsoft).`, 'info');
        } else {
          setDrivers([]);
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        setDrivers([
          { PublishedName: 'oem5.inf', OriginalName: 'realtek.inf', Provider: 'Realtek', ClassName: 'Media', Version: '6.0.9285.1', Signer: 'Realtek Semiconductor Corp' },
          { PublishedName: 'oem12.inf', OriginalName: 'nvidia.inf', Provider: 'NVIDIA', ClassName: 'Display', Version: '551.86', Signer: 'NVIDIA Corporation' },
        ]);
      }
    } catch (e) {
      addNotification('Driver Sweeper', 'Failed to load drivers: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDrivers(); }, []);

  const handleRemove = async (driver) => {
    const ok = await confirm({
      title: 'Force-Remove Driver',
      message: `Permanently remove "${driver.PublishedName}" (${driver.Provider} ${driver.ClassName}) from the driver store? Hardware using this driver may stop working.`,
      confirmLabel: 'Force Remove',
      danger: true,
    });
    if (!ok) return;
    setRemoving(driver.PublishedName);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-install', ['uninstall', driver.PublishedName]);
        const m = res.stdout?.match(/===RESULT===\s*(\{[\s\S]*\})/);
        const obj = m ? JSON.parse(m[1]) : null;
        if (obj?.success) {
          addNotification('Driver Sweeper', `Removed ${driver.PublishedName}.`, 'success');
          await fetchDrivers();
        } else {
          addNotification('Driver Sweeper', `Failed to remove: exit ${obj?.exitCode}`, 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        addNotification('Driver Sweeper', `Mock removed ${driver.PublishedName}.`, 'success');
        setDrivers(prev => prev.filter(d => d.PublishedName !== driver.PublishedName));
      }
    } catch (e) {
      addNotification('Driver Sweeper', e.message, 'error');
    } finally {
      setRemoving(null);
    }
  };

  const filtered = drivers.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.PublishedName || '').toLowerCase().includes(q) ||
           (d.Provider || '').toLowerCase().includes(q) ||
           (d.ClassName || '').toLowerCase().includes(q) ||
           (d.OriginalName || '').toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-amber-400" /> Driver Sweeper
          </h2>
          <p className="text-xs text-slate-400 mt-1">List third-party drivers in the Windows driver store and force-remove leftover/unused ones.</p>
        </div>
        <button
          onClick={fetchDrivers}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="glass-panel border border-amber-500/30 bg-amber-950/5 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-300/80">Microsoft-signed drivers are hidden to prevent breaking Windows. Removing third-party drivers may cause hardware to stop working until you reinstall.</p>
      </div>

      <div className="relative flex items-center max-w-md">
        <Search className="absolute left-3 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search driver, provider, class..."
          className="pl-9 pr-4 py-2 w-full bg-slate-900 border border-brand-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
        />
      </div>

      <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
            <p className="text-xs text-slate-400">Enumerating driver store...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-slate-500">{drivers.length === 0 ? 'No third-party drivers found.' : 'No drivers match your search.'}</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto divide-y divide-brand-border">
            {filtered.map((d, i) => (
              <div key={i} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/30">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-200 truncate">{d.PublishedName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {d.Provider || 'Unknown'} · {d.ClassName || '?'} · v{d.Version || '?'}
                    {d.Signer ? ` · ${d.Signer}` : ''}
                  </div>
                  {d.OriginalName && <div className="text-[10px] text-slate-600 font-mono mt-0.5">{d.OriginalName}</div>}
                </div>
                <button
                  onClick={() => handleRemove(d)}
                  disabled={removing !== null}
                  className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
                >
                  {removing === d.PublishedName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {removing === d.PublishedName ? 'Removing...' : 'Force Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
