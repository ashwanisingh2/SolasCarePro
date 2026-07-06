import React, { useState, useEffect } from 'react';
import {
  BarChart3, Play, Pause, X,
  Cpu, MemoryStick, MonitorSpeaker,
  ShieldCheck, RefreshCw, ArrowRight, ArrowDown
} from 'lucide-react';

export default function StartupManager() {
  const [startupApps, setStartupApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedApp, setExpandedApp] = useState(null);

  useEffect(() => {
    loadStartupApps();
  }, []);

  const loadStartupApps = async () => {
    setLoading(true);
    try {
      if (window.api) {
        // Use the correct 'get-startup-apps' channel (read-only listing).
        // Previously this called 'repair-startup-cleanup' which is a destructive
        // cleanup command - it would actually modify startup entries just by
        // opening the Startup Manager tab.
        const res = await window.api.runSystemCommand('get-startup-apps');
        if (res.success && res.stdout) {
          const apps = JSON.parse(res.stdout.trim());
          const list = Array.isArray(apps) ? apps : [apps];
          setStartupApps(list.map((app, i) => ({
            ...app,
            id: i,
            impact: getImpactLevel(app.Name)
          })));
        } else {
          setMockApps();
        }
      } else {
        setMockApps();
      }
    } catch (e) {
      console.error('Failed to load startup apps:', e);
      setMockApps();
    } finally {
      setLoading(false);
    }
  };

  const setMockApps = () => {
    setStartupApps([
      { id: 0, Name: 'Microsoft Teams', Location: 'HKCU\\...\\Run', ApprovedPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', Command: 'C:\\Program Files\\...', impact: 'High', Enabled: true },
      { id: 1, Name: 'OneDrive', Location: 'HKLM\\...\\Run', ApprovedPath: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', Command: 'C:\\Users\\...', impact: 'Medium', Enabled: true },
      { id: 2, Name: 'Spotify', Location: 'HKCU\\...\\Run', ApprovedPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', Command: 'C:\\Users\\AppData\\...', impact: 'Low', Enabled: true },
      { id: 3, Name: 'Discord', Location: 'HKCU\\...\\Run', ApprovedPath: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', Command: 'C:\\Users\\AppData\\...', impact: 'Medium', Enabled: false },
      { id: 4, Name: 'Windows Defender', Location: 'HKLM\\...\\Run', ApprovedPath: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', Command: 'C:\\Program Files\\...', impact: 'High', Enabled: true },
      { id: 5, Name: 'Google Update', Location: 'HKLM\\...\\Run', ApprovedPath: 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', Command: 'C:\\Program Files\\...', impact: 'Low', Enabled: true }
    ]);
  };

  const getImpactLevel = (name) => {
    const nameLower = String(name || '').toLowerCase();
    if (nameLower.includes('defender') || nameLower.includes('antivirus') || nameLower.includes('security')) return 'High';
    if (nameLower.includes('teams') || nameLower.includes('discord') || nameLower.includes('zoom') || nameLower.includes('spotify')) return 'Medium';
    return 'Low';
  };

  const toggleApp = async (id, name, approvedPath, currentEnabled) => {
    const action = currentEnabled ? 'disable' : 'enable';
    
    // Optimistic UI update
    setStartupApps(prev =>
      prev.map(app => app.id === id ? { ...app, Enabled: !currentEnabled } : app)
    );

    if (window.api) {
      try {
        const res = await window.api.runSystemCommand('toggle-startup-app', [name, approvedPath, action]);
        if (!res.success) {
          // Revert UI on failure
          setStartupApps(prev =>
            prev.map(app => app.id === id ? { ...app, Enabled: currentEnabled } : app)
          );
          alert(`Failed to update startup setting: ${res.error || 'Access Denied'}`);
        }
      } catch (err) {
        console.error('Toggle startup failed:', err);
        setStartupApps(prev =>
          prev.map(app => app.id === id ? { ...app, Enabled: currentEnabled } : app)
        );
      }
    }
  };

  const disableAllNonEssential = async () => {
    const nonEssential = startupApps.filter(app => {
      const isEssential = app.Name.toLowerCase().includes('defender') || app.Name.toLowerCase().includes('security');
      return !isEssential && app.Enabled;
    });

    if (nonEssential.length === 0) return;

    // Optimistic UI update
    setStartupApps(prev =>
      prev.map(app => {
        const isEssential = app.Name.toLowerCase().includes('defender') || app.Name.toLowerCase().includes('security');
        if (isEssential) return app;
        return { ...app, Enabled: false };
      })
    );

    if (window.api) {
      try {
        for (const app of nonEssential) {
          await window.api.runSystemCommand('toggle-startup-app', [app.Name, app.ApprovedPath, 'disable']);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const enabledCount = startupApps.filter(a => a.Enabled).length;
  const disabledCount = startupApps.filter(a => !a.Enabled).length;

  return (
    <div className="p-6 space-y-6 text-left">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Startup Manager</h2>
          <p className="text-xs text-slate-400">Control which applications run automatically at Windows logon</p>
        </div>
        <button
          onClick={loadStartupApps}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 select-none">
        <div className="glass-panel border border-brand-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <h4 className="text-xs text-slate-400 font-bold uppercase">Total Apps</h4>
            <p className="text-2xl font-black text-white">{startupApps.length}</p>
          </div>
          <BarChart3 className="h-6 w-6 text-brand-violet" />
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <h4 className="text-xs text-slate-400 font-bold uppercase">Enabled</h4>
            <p className="text-2xl font-black text-brand-success">{enabledCount}</p>
          </div>
          <Play className="h-6 w-6 text-brand-success" />
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4 flex items-center justify-between">
          <div>
            <h4 className="text-xs text-slate-400 font-bold uppercase">Disabled</h4>
            <p className="text-2xl font-black text-slate-500">{disabledCount}</p>
          </div>
          <Pause className="h-6 w-6 text-slate-500" />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 select-none">
        <button
          onClick={disableAllNonEssential}
          className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 text-xs font-bold rounded-lg text-white cursor-pointer"
        >
          Disable All Non-Essential
        </button>
        <button
          onClick={async () => {
            if (window.api) await window.api.runSystemCommand('open-startup-manager');
          }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
        >
          Open Task Manager Startup
        </button>
        <button
          onClick={async () => {
            if (window.api) await window.api.runSystemCommand('open-autoruns-manager');
          }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
        >
          Launch Autoruns falling back to Task Manager
        </button>
      </div>

      {/* App List */}
      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-brand-violet" />
          <span className="text-xs text-slate-400">Loading startup applications...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {startupApps.map(app => (
            <div
              key={app.id}
              className={`glass-panel border rounded-xl overflow-hidden transition-all ${
                expandedApp === app.id ? 'border-brand-violet/30' : 'border-brand-border'
              }`}
            >
              <div
                className="flex items-center justify-between p-4 cursor-pointer"
                onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    app.impact === 'High' ? 'bg-rose-500/20' :
                    app.impact === 'Medium' ? 'bg-amber-500/20' :
                    'bg-emerald-500/20'
                  }`}>
                    <Cpu className={`h-5 w-5 ${
                      app.impact === 'High' ? 'text-rose-400' :
                      app.impact === 'Medium' ? 'text-amber-400' :
                      'text-emerald-400'
                    }`} />
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-slate-200">{app.Name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate max-w-xs md:max-w-md">
                      {app.Command}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    app.impact === 'High' ? 'bg-rose-500/20 text-rose-400' :
                    app.impact === 'Medium' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {app.impact} Impact
                  </span>

                  <button
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      toggleApp(app.id, app.Name, app.ApprovedPath, app.Enabled); 
                    }}
                    className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                      app.Enabled ? 'bg-brand-violet' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        app.Enabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {expandedApp === app.id && (
                <div className="border-t border-brand-border p-4 bg-slate-950/40 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block mb-1">Target Key / Folder location</span>
                      <span className="text-slate-300 font-mono break-all">{app.Location}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Full Executable Command</span>
                      <span className="text-slate-300 font-mono break-all">{app.Command}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
