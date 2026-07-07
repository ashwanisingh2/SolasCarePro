import React, { useState, useEffect } from 'react';
import { Play, Loader2, RefreshCw, Trash2, Search } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

export default function ForceUninstaller() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uninstalling, setUninstalling] = useState(null);
  const [search, setSearch] = useState('');

  const fetchApps = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['list-apps']);
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\[[\s\S]*\]/) || res.stdout.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            setApps(Array.isArray(parsed) ? parsed : [parsed]);
            addNotification('Force Uninstaller', `Loaded ${Array.isArray(parsed) ? parsed.length : 1} installed apps.`, 'info');
          } else {
            setApps([]);
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        setApps([
          { DisplayName: 'Mock App 1', DisplayVersion: '1.0', Publisher: 'TestCo', UninstallString: 'MsiExec.exe /X{mock-1}', PSChildName: '{mock-1}' },
          { DisplayName: 'Mock App 2', DisplayVersion: '2.5', Publisher: 'AnotherCo', UninstallString: 'MsiExec.exe /X{mock-2}', PSChildName: '{mock-2}' },
        ]);
      }
    } catch (e) {
      addNotification('Force Uninstaller', 'Failed to load apps: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApps(); }, []);

  const handleUninstall = async (app) => {
    const ok = await confirm({
      title: 'Force Uninstall',
      message: `Force uninstall "${app.DisplayName}"? This will run silently without prompts.`,
      confirmLabel: 'Uninstall',
      danger: true,
    });
    if (!ok) return;
    setUninstalling(app.DisplayName);
    try {
      if (window.api) {
        const target = app.PSChildName || app.UninstallString;
        const res = await window.api.runSystemCommand('run-advanced-tool', ['force-uninstall', target]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          addNotification('Force Uninstaller', `"${app.DisplayName}" uninstalled successfully.`, 'success');
          await fetchApps();
        } else {
          addNotification('Force Uninstaller', obj?.message || 'Uninstall failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        addNotification('Force Uninstaller', `Mock uninstall of "${app.DisplayName}".`, 'success');
        setApps(prev => prev.filter(a => a.PSChildName !== app.PSChildName));
      }
    } catch (e) {
      addNotification('Force Uninstaller', e.message, 'error');
    } finally {
      setUninstalling(null);
    }
  };

  const filtered = apps.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.DisplayName || '').toLowerCase().includes(q) ||
           (a.Publisher || '').toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Force Uninstaller</h2>
          <p className="text-xs text-slate-400 mt-1">List installed programs and silently uninstall any of them.</p>
        </div>
        <button
          onClick={fetchApps}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="relative flex items-center max-w-md">
        <Search className="absolute left-3 h-4 w-4 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search apps or publisher..."
          className="pl-9 pr-4 py-2 w-full bg-slate-900 border border-brand-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
        />
      </div>

      <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
            <p className="text-xs text-slate-400">Enumerating installed apps...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-slate-500">{apps.length === 0 ? 'No apps found. Click Refresh.' : 'No apps match your search.'}</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto divide-y divide-brand-border">
            {filtered.map((a, i) => (
              <div key={i} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-800/30">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-200 truncate">{a.DisplayName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {a.Publisher || 'Unknown'} · v{a.DisplayVersion || '?'}
                  </div>
                </div>
                <button
                  onClick={() => handleUninstall(a)}
                  disabled={uninstalling !== null}
                  className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
                >
                  {uninstalling === a.DisplayName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {uninstalling === a.DisplayName ? 'Uninstalling...' : 'Force Uninstall'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
