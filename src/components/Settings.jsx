import React, { useState, useEffect } from 'react';
import { 
  Settings, User, Moon, ShieldAlert, Sparkles, 
  Trash2, Globe, Heart, ShieldCheck, FileJson, Download, Upload
} from 'lucide-react';


export default function SettingsView({ theme, setTheme }) {
  const [channel, setChannel] = useState('stable');
  const [logLevel, setLogLevel] = useState('info');
  const [runAtStartup, setRunAtStartup] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [systemInfo, setSystemInfo] = useState(null);

  const loadSettingsAndSystem = async () => {
    if (window.api) {
      try {
        const c = await window.api.getSetting('channel', 'stable');
        const l = await window.api.getSetting('logLevel', 'info');
        const r = await window.api.getSetting('runAtStartup', false);
        setChannel(c);
        setLogLevel(l);
        setRunAtStartup(r);

        const info = await window.api.getSystemInfo();
        setSystemInfo(info);
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    }
  };

  useEffect(() => {
    loadSettingsAndSystem();
    
    // Listen for settings corruption events
    if (window.api && window.api.onSettingsCorrupted) {
      const unsub = window.api.onSettingsCorrupted(() => {
        setStatusMessage('Warning: Settings corruption detected! Restored defaults.');
        loadSettingsAndSystem();
      });
      return () => unsub();
    }
  }, []);

  const updateSetting = async (key, val, setter) => {
    setter(val);
    if (window.api) {
      await window.api.setSetting(key, val);
    }
  };

  const handleClearLogs = () => {
    setStatusMessage('Log cache directory cleared successfully.');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleExportSettings = async () => {
    try {
      if (window.api && window.api.openSaveDialog) {
        setStatusMessage('Opening save file dialog...');
        const result = await window.api.openSaveDialog({
          title: 'Export Settings',
          defaultPath: 'solas_settings_backup.json',
          filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (!result || result.canceled || !result.filePath) {
          setStatusMessage('Settings export cancelled.');
          return;
        }
        const filePath = result.filePath;
        const cmdRes = await window.api.runSystemCommand('export-settings', [filePath]);
        if (cmdRes.success) {
          setStatusMessage('Settings configuration exported successfully.');
        } else {
          throw new Error(cmdRes.error || 'Export failed');
        }
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setStatusMessage('Export only supported in desktop mode.');
      }
    } catch(e) {
      setStatusMessage('Export failed: ' + e.message);
    }
  };

  const handleImportSettings = async () => {
    try {
      if (window.api && window.api.openFileDialog) {
        setStatusMessage('Opening import file dialog...');
        const result = await window.api.openFileDialog({
          title: 'Import Settings',
          filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        if (!result || result.canceled || !result.filePaths || result.filePaths.length === 0) {
          setStatusMessage('Settings import cancelled.');
          return;
        }
        const filePath = result.filePaths[0];
        const cmdRes = await window.api.runSystemCommand('import-settings', [filePath]);
        if (cmdRes.success && cmdRes.stdout) {
          const settings = JSON.parse(cmdRes.stdout);
          if (settings.theme) setTheme(settings.theme);
          if (settings.channel) setChannel(settings.channel);
          if (settings.logLevel) setLogLevel(settings.logLevel);
          if (settings.runAtStartup !== undefined) setRunAtStartup(settings.runAtStartup);
          
          setStatusMessage('Settings imported and synced successfully.');
        } else {
          throw new Error(cmdRes.error || 'Import failed');
        }
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setStatusMessage('Import only supported in desktop mode.');
      }
    } catch (e) {
      setStatusMessage('Import failed: ' + e.message);
    }
  };

  return (
    <div className="p-6 space-y-6 text-left">
      {/* Title */}
      <section className="border-b border-brand-border pb-4 select-none">
        <h2 className="text-xl font-bold text-slate-200">Application Settings</h2>
        <p className="text-xs text-slate-400">Configure Solas application paths, update cycles, and debugging options</p>
      </section>

      {statusMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-brand-success text-xs font-bold rounded-lg animate-pulse">
          {statusMessage}
        </div>
      )}

      {/* Main Settings Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 select-none">
        {/* Left Columns: Config panel */}
        <div className="md:col-span-2 space-y-6">
          {/* General App configurations */}
          <div className="glass-panel border border-brand-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <Globe className="h-4.5 w-4.5 text-brand-cyan" /> General Configuration
            </h3>

            {/* Theme Toggle */}
            <div className="flex justify-between items-center py-2.5 border-b border-brand-border/40">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Application Theme</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Toggle interface design palettes</p>
              </div>
              <div className="flex gap-2">
                {['dark', 'cyan', 'light'].map(t => (
                  <button
                    key={t}
                    onClick={() => updateSetting('theme', t, setTheme)}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer capitalize border transition-all ${
                      theme === t 
                        ? 'bg-brand-violet/20 border-brand-violet text-white font-black' 
                        : 'bg-slate-900 border-brand-border text-slate-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Run on Startup */}
            <div className="flex justify-between items-center py-2.5 border-b border-brand-border/40">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Run at Windows Startup</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Automatically launch Solas on Windows log-on</p>
              </div>
              <button
                onClick={() => updateSetting('runAtStartup', !runAtStartup, setRunAtStartup)}
                className={`w-14 h-7 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                  runAtStartup ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all duration-300 ${
                  runAtStartup ? 'translate-x-7' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {/* Update Channel */}
            <div className="flex justify-between items-center py-2.5 border-b border-brand-border/40">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Update Distribution Channel</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Select package distribution stream</p>
              </div>
              <select
                value={channel}
                onChange={(e) => updateSetting('channel', e.target.value, setChannel)}
                className="bg-slate-900 border border-brand-border rounded text-slate-200 text-xs font-bold p-1.5 focus:outline-none focus:border-brand-violet"
              >
                <option value="stable">Stable Releases (Recommended)</option>
                <option value="beta">Beta (Early Access)</option>
                <option value="developer">Developer Builds</option>
              </select>
            </div>
          </div>

          {/* Backup and Cache Administration */}
          <div className="glass-panel border border-brand-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <FileJson className="h-4.5 w-4.5 text-brand-cyan" /> Backup & Data Maintenance
            </h3>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleExportSettings}
                className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-brand-border rounded-xl text-xs font-bold text-slate-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4 text-brand-cyan" /> Export Settings Backup
              </button>
              <button
                onClick={handleImportSettings}
                className="flex-1 py-3 px-4 bg-slate-900 hover:bg-slate-800 border border-brand-border rounded-xl text-xs font-bold text-slate-200 cursor-pointer flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4 text-brand-violet" /> Import Settings Backup
              </button>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-brand-border/40">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Clear Logs and Diagnostics Cache</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Delete app log archives to free space</p>
              </div>
              <button
                onClick={handleClearLogs}
                className="px-4 py-2 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-bold text-brand-danger rounded-xl cursor-pointer"
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: System Specs and Version Badge */}
        <div className="space-y-6">
          {/* Diagnostic status */}
          <div className="glass-panel border border-brand-border rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <User className="h-4.5 w-4.5 text-brand-violet" /> System Properties
            </h3>

            {systemInfo ? (
              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="text-slate-500 block uppercase text-[9px] font-bold">Operating System</span>
                  <span className="text-slate-300 font-medium">{systemInfo.osName} ({systemInfo.platform})</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[9px] font-bold">Release / Version</span>
                  <span className="text-slate-300 font-medium">{systemInfo.release}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[9px] font-bold">PowerShell ExecutionPolicy</span>
                  <span className="text-slate-300 font-mono text-[10px]">{systemInfo.executionPolicy}</span>
                </div>
                <div>
                  <span className="text-slate-500 block uppercase text-[9px] font-bold">Diagnostic Status</span>
                  <div className="flex items-center gap-1.5 text-brand-success font-black mt-0.5">
                    <ShieldCheck className="h-4 w-4" /> Healthy WMI Bindings
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                Retrieving Windows registry specs...
              </div>
            )}
          </div>

          {/* Credits Card */}
          <div className="glass-panel border border-brand-border rounded-2xl p-5 text-center space-y-3 bg-slate-950/20 select-none">
            <Sparkles className="h-7 w-7 text-brand-cyan mx-auto animate-pulse" />
            <h4 className="text-xs font-bold text-slate-300">Solas Care Pro Suite</h4>
            <p className="text-[10px] text-slate-500 leading-normal">
              Designed for professional Windows repair, driver management and updates checkups.
            </p>
            <div className="text-[9px] text-slate-400 flex items-center justify-center gap-1">
              Made with <Heart className="h-3 w-3 text-rose-500 fill-rose-500" /> in 2026
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
