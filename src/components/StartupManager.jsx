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
        const res = await window.api.runSystemCommand('repair-startup-cleanup');
        if (res.success && res.stdout) {
          const apps = JSON.parse(res.stdout.trim());
          setStartupApps(apps.map((app, i) => ({
            ...app,
            id: i,
            enabled: true,
            impact: getImpactLevel(app.Name)
          })));
        }
      } else {
        // Mock data
        await new Promise(r => setTimeout(r, 1000));
        setStartupApps([
          { id: 0, name: 'Microsoft Teams', location: 'HKCU\\...\\Run', command: 'C:\\Program Files\\...', impact: 'High', enabled: true },
          { id: 1, name: 'OneDrive', location: 'HKLM\\...\\Run', command: 'C:\\Users\\...', impact: 'Medium', enabled: true },
          { id: 2, name: 'Spotify', location: 'HKCU\\...\\Run', command: 'C:\\Users\\AppData\\...', impact: 'Low', enabled: true },
          { id: 3, name: 'Discord', location: 'HKCU\\...\\Run', command: 'C:\\Users\\AppData\\...', impact: 'Medium', enabled: true },
          { id: 4, name: 'Windows Defender', location: 'HKLM\\...\\Run', command: 'C:\\Program Files\\...', impact: 'High', enabled: true },
          { id: 5, name: 'Google Update', location: 'HKLM\\...\\Run', command: 'C:\\Program Files\\...', impact: 'Low', enabled: true }
        ]);
      }
    } catch (e) {
      console.error('Failed to load startup apps:', e);
    } finally {
      setLoading(false);
    }
  };

  const getImpactLevel = (name) => {
    const nameLower = name?.toLowerCase() || '';
    if (nameLower.includes('defender') || nameLower.includes('antivirus') || nameLower.includes('security')) return 'High';
    if (nameLower.includes('teams') || nameLower.includes('discord') || nameLower.includes('zoom')) return 'Medium';
    return 'Low';
  };

  const toggleApp = (id) => {
    setStartupApps(prev =>
      prev.map(app => app.id === id ? { ...app, enabled: !app.enabled } : app)
    );
  };

  const disableAllNonEssential = () => {
    setStartupApps(prev =>
      prev.map(app => {
        if (app.name.includes('Defender') || app.name.includes('Security')) return app;
        return { ...app, enabled: false };
      })
    );
  };

  const enabledCount = startupApps.filter(a => a.enabled).length;
  const disabledCount = startupApps.filter(a => !a.enabled).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Startup Manager</h2>
          <p className="text-xs text-slate-400">Control which apps run at system startup</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      <div className="flex gap-3">
        <button
          onClick={disableAllNonEssential}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-xs font-bold rounded-lg text-white cursor-pointer"
        >
          Disable Non-Essential
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
                    <h4 className="text-sm font-bold text-slate-200">{app.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate max-w-xs">
                      {app.command}
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
                    onClick={(e) => { e.stopPropagation(); toggleApp(app.id); }}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      app.enabled ? 'bg-brand-violet' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        app.enabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {expandedApp === app.id && (
                <div className="border-t border-brand-border p-4 bg-slate-950/40 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-500 block mb-1">Location</span>
                      <span className="text-slate-300 font-mono">{app.location}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">Command</span>
                      <span className="text-slate-300 font-mono truncate block">{app.command}</span>
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
