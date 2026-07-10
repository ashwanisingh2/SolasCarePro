import React, { useState, useEffect } from 'react';
import { Globe, Trash2, RefreshCw, Loader2, AlertOctagon } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import CommandOutput from './shared/CommandOutput';

export default function BrowserRepair() {
  const { addNotification } = useNotification();
  const [browsers, setBrowsers] = useState({});
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(null);
  const [logs, setLogs] = useState([]);

  const addLogs = (...msgs) => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    const formatted = msgs.filter(Boolean).map(msg => `[${time}] ${msg}`);
    setLogs(prev => [...prev, ...formatted]);
  };

  const loadBrowsers = async () => {
    setLoading(true);
    addLogs('[SYSTEM] Scanning common Windows registry paths for browser signatures...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('detect-browsers');
        if (res.success && res.stdout) {
          let found = null;
          try { found = JSON.parse(res.stdout.trim()); }
          catch {
            const m = res.stdout.match(/\{[\s\S]*\}/);
            if (m) { try { found = JSON.parse(m[0]); } catch {} }
          }
          if (found) {
            setBrowsers(found);
            addLogs(`[OK] Detection complete: Chrome: ${found.chrome ? 'installed' : 'not found'}, Edge: ${found.edge ? 'installed' : 'not found'}, Firefox: ${found.firefox ? 'installed' : 'not found'}, Brave: ${found.brave ? 'installed' : 'not found'}, Opera: ${found.opera ? 'installed' : 'not found'}`);
          } else {
            addLogs('[ERROR] Could not parse browser detection output.');
          }
        } else {
          addLogs('[ERROR] Failed to scan browser installations.');
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        const found = { chrome: true, edge: true, firefox: false, brave: true, opera: true };
        setBrowsers(found);
        addLogs(`[OK] (Mock) Detection complete: Chrome: installed, Edge: installed, Firefox: not found, Brave: installed, Opera: installed`);
      }
    } catch (e) {
      console.error(e);
      addNotification('Browser Repair', 'Error checking installations: ' + e.message, 'error');
      addLogs(`[ERROR] Detection failed with error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async (browserName) => {
    setCleaning(`${browserName}-cache`);
    addLogs(`[SYSTEM] Starting cache clear for ${browserName}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('reset-browser-cache', [browserName]);
        if (res.success && res.stdout) {
          let detail = null;
          try { detail = JSON.parse(res.stdout.trim()); }
          catch {
            const m = res.stdout.match(/\{[\s\S]*\}/);
            if (m) { try { detail = JSON.parse(m[0]); } catch {} }
          }
          if (detail) {
            addNotification('Cache Cleared', `Successfully cleared cache for ${browserName}. Freed ${detail.freedSpaceMB || 0} MB.`, 'success');
            addLogs(`[OK] Successfully cleared cache for ${browserName}. Freed ${detail.freedSpaceMB || 0} MB.`);
          } else {
            addNotification('Cache Cleared', `Cleared cache for ${browserName}.`, 'success');
            addLogs(`[OK] Cleared cache for ${browserName}.`);
          }
        } else if (res.cancelled) {
          addNotification('Cache Clear', 'Operation cancelled by user.', 'info');
          addLogs(`[WARN] Cache clear for ${browserName} was cancelled by user.`);
        } else {
          addNotification('Cache Clear Error', res.error || 'Failed to clear browser cache.', 'error');
          addLogs(`[ERROR] Failed to clear browser cache: ${res.error || 'Execution error'}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 1200));
        addNotification('Cache Cleared', `Cleared cache for ${browserName} (MOCK).`, 'success');
        addLogs(`[OK] (Mock) Successfully cleared cache for ${browserName}. Freed 24 MB.`);
      }
    } catch (e) {
      console.error(e);
      addNotification('Cache Clear Error', e.message, 'error');
      addLogs(`[ERROR] Failed to clear cache: ${e.message}`);
    } finally {
      setCleaning(null);
    }
  };

  const clearFull = async (browserName) => {
    setCleaning(`${browserName}-full`);
    addLogs(`[WARN] Initializing full profile reset for ${browserName}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('reset-browser-full', [browserName]);
        if (res.success && res.stdout) {
          let detail = null;
          try { detail = JSON.parse(res.stdout.trim()); }
          catch {
            const m = res.stdout.match(/\{[\s\S]*\}/);
            if (m) { try { detail = JSON.parse(m[0]); } catch {} }
          }
          if (detail) {
            addNotification('Browser Reset Complete', `Successfully completed full reset of ${browserName}. Freed ${detail.freedSpaceMB || 0} MB.`, 'success');
            addLogs(`[OK] Successfully completed full reset of ${browserName}. Freed ${detail.freedSpaceMB || 0} MB.`);
          } else {
            addNotification('Browser Reset Complete', `Completed full reset of ${browserName}.`, 'success');
            addLogs(`[OK] Completed full reset of ${browserName}.`);
          }
        } else if (res.cancelled) {
          addNotification('Browser Reset', 'Operation cancelled by user.', 'info');
          addLogs(`[WARN] Profile reset for ${browserName} was cancelled by user.`);
        } else {
          addNotification('Browser Reset Error', res.error || 'Failed to reset browser.', 'error');
          addLogs(`[ERROR] Failed to reset browser: ${res.error || 'Execution error'}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        addNotification('Browser Reset Complete', `Completed full reset for ${browserName} (MOCK).`, 'success');
        addLogs(`[OK] (Mock) Completed full reset for ${browserName}. Freed 102 MB.`);
      }
    } catch (e) {
      console.error(e);
      addNotification('Browser Reset Error', e.message, 'error');
      addLogs(`[ERROR] Failed to reset profile: ${e.message}`);
    } finally {
      setCleaning(null);
    }
  };

  useEffect(() => {
    loadBrowsers();
  }, []);

  const browserList = [
    { key: 'chrome', name: 'Google Chrome', desc: 'Google chromium desktop browser' },
    { key: 'edge', name: 'Microsoft Edge', desc: 'Default built-in Windows browser' },
    { key: 'firefox', name: 'Mozilla Firefox', desc: 'Gecko engine open source browser' },
    { key: 'brave', name: 'Brave Browser', desc: 'Privacy-first chromium web browser' },
    { key: 'opera', name: 'Opera Browser', desc: 'Opera desktop web browser' }
  ];

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Browser Repair Center</h2>
          <p className="text-xs text-slate-400">Clear cached data pools, cookies, local storage heaps, and reset profile database settings.</p>
        </div>
        <button
          disabled={loading}
          onClick={loadBrowsers}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-Detect
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-violet mx-auto" />
          <p className="text-xs text-slate-400">Scanning common Windows registry paths for browser signatures...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {browserList.map(item => {
              const isInstalled = browsers[item.key];
              return (
                <div 
                  key={item.key} 
                  className={`glass-panel border rounded-xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 ${
                    isInstalled ? 'border-brand-border' : 'border-slate-900 opacity-40 hover:opacity-50'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Globe className={`h-5 w-5 ${
                          item.key === 'chrome' ? 'text-red-400' :
                          item.key === 'edge' ? 'text-cyan-400' :
                          item.key === 'firefox' ? 'text-orange-400' :
                          item.key === 'opera' ? 'text-red-600' :
                          'text-amber-400'
                        }`} />
                        {item.name}
                      </h3>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        isInstalled ? 'bg-emerald-500/20 text-brand-success' : 'bg-slate-900 text-slate-500'
                      }`}>
                        {isInstalled ? 'Installed' : 'Not Found'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>

                  {isInstalled && (
                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        disabled={cleaning !== null}
                        onClick={() => clearCache(item.key)}
                        className="flex-1 min-w-[120px] py-2 bg-slate-800 border border-brand-border hover:bg-slate-700 text-[11px] font-bold rounded-lg text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {cleaning === `${item.key}-cache` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Clear Cache
                      </button>
                      <button
                        disabled={cleaning !== null}
                        onClick={() => clearFull(item.key)}
                        className="flex-1 min-w-[120px] py-2 bg-rose-950/40 border border-rose-500/20 hover:bg-rose-900/30 text-[11px] font-bold rounded-lg text-rose-300 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {cleaning === `${item.key}-full` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <AlertOctagon className="h-3 w-3" />
                        )}
                        Full Reset Profile
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {logs.length > 0 && (
            <CommandOutput
              logs={logs}
              onClear={() => setLogs([])}
              title="Browser Repair Console"
            />
          )}
        </div>
      )}
    </div>
  );
}
