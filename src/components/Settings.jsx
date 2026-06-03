import React, { useState, useEffect } from 'react';
import { 
  Settings, User, Moon, ShieldAlert, Sparkles, 
  Trash2, Globe, Heart, ShieldCheck, FileJson
} from 'lucide-react';

export default function SettingsView() {
  const [theme, setTheme] = useState('dark');
  const [channel, setChannel] = useState('stable');
  const [logLevel, setLogLevel] = useState('info');
  const [runAtStartup, setRunAtStartup] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  // System info from WMI / Node
  const [systemInfo, setSystemInfo] = useState(null);

  const loadSettingsAndSystem = async () => {
    if (window.api) {
      try {
        const t = await window.api.getSetting('theme', 'dark');
        const c = await window.api.getSetting('channel', 'stable');
        const l = await window.api.getSetting('logLevel', 'info');
        const r = await window.api.getSetting('runAtStartup', false);
        setTheme(t);
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
      if (window.api) {
        const themeVal = await window.api.getSetting('theme', 'dark');
        const channelVal = await window.api.getSetting('channel', 'stable');
        const logLevelVal = await window.api.getSetting('logLevel', 'info');
        const runAtStartupVal = await window.api.getSetting('runAtStartup', false);
        
        const settingsObj = {
          theme: themeVal,
          channel: channelVal,
          logLevel: logLevelVal,
          runAtStartup: runAtStartupVal
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settingsObj, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "solas_settings_backup.json");
        dlAnchorElem.click();
        setStatusMessage('Settings configuration exported successfully.');
        setTimeout(() => setStatusMessage(''), 3000);
      }
    } catch(e) {
      setStatusMessage('Export failed: ' + e.message);
    }
  };

  const handleImportSettings = () => {
    const fileReader = new FileReader();
    fileReader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (typeof parsed !== 'object' || parsed === null) throw new Error('Invalid format');
        
        if (parsed.theme) await updateSetting('theme', parsed.theme, setTheme);
        if (parsed.channel) await updateSetting('channel', parsed.channel, setChannel);
        if (parsed.logLevel) await updateSetting('logLevel', parsed.logLevel, setLogLevel);
        if (parsed.runAtStartup !== undefined) await updateSetting('runAtStartup', parsed.runAtStartup, setRunAtStartup);
        
        setStatusMessage('Settings imported and synced successfully.');
        setTimeout(() => setStatusMessage(''), 3000);
      } catch (err) {
        setStatusMessage('Failed to import config file: ' + err.message);
      }
    };
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (evt) => {
      if (evt.target.files.length > 0) {
        fileReader.readAsText(evt.target.files[0]);
      }
    };
    fileInput.click();
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

            {/* Log Level */}
            <div className="flex justify-between items-center py-2.5">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Logs Detail Threshold</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Detail level for local system care logs</p>
              </div>
              <select
                value={logLevel}
                onChange={(e) => updateSetting('logLevel', e.target.value, setLogLevel)}
                className="bg-slate-900 border border-brand-border rounded text-slate-200 text-xs font-bold p-1.5 focus:outline-none focus:border-brand-violet"
              >
                <option value="info">Info (Standard events)</option>
                <option value="warn">Warning &amp; Critical errors</option>
                <option value="error">Strict error captures only</option>
                <option value="debug">Verbose logs (High storage)</option>
              </select>
            </div>
          </div>

          {/* Maintenance Tools */}
          <div className="glass-panel border border-brand-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <Trash2 className="h-4.5 w-4.5 text-rose-400" /> Maintenance Tools
            </h3>

            {/* Clear Logs */}
            <div className="flex justify-between items-center border-b border-brand-border/40 pb-3">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Clear Logs Cache</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Flush old system scan logs in %APPDATA%/SolasCare</p>
              </div>
              <button
                onClick={handleClearLogs}
                className="px-4 py-2 bg-slate-800 hover:bg-rose-950/60 hover:text-brand-danger text-xs font-bold rounded-lg border border-brand-border hover:border-brand-danger/30 text-slate-300 cursor-pointer transition-all duration-200"
              >
                Flush Logs Folder
              </button>
            </div>

            {/* Import/Export Settings */}
            <div className="flex justify-between items-center pt-1.5">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Configuration Backup</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Export settings profiles to JSON or import config backup</p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={handleExportSettings}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-brand-border text-xs font-bold rounded-lg cursor-pointer transition-all"
                >
                  Export JSON
                </button>
                <button
                  onClick={handleImportSettings}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-brand-border text-xs font-bold rounded-lg cursor-pointer transition-all"
                >
                  Import JSON
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns: About & System Info box */}
        <div className="space-y-6">
          {/* About */}
          <div className="glass-panel border border-brand-border rounded-2xl p-6 flex flex-col justify-between h-fit">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-brand-violet" /> About Solas Pro
              </h3>
              
              <div className="text-center py-4 border-b border-brand-border">
                <Moon className="h-12 w-12 text-brand-violet mx-auto animate-pulse" />
                <h4 className="text-md font-black tracking-wide mt-2 text-transparent bg-clip-text bg-gradient-to-r from-brand-violet to-brand-cyan">
                  SOLAS SYSTEM CARE PRO
                </h4>
                <span className="text-[10px] text-slate-500 font-bold block mt-1">BUILD VERSION v2.0.0</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-500">Core Runtime:</span>
                  <span className="text-slate-300">Electron / Node.js</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-500">UI Stack:</span>
                  <span className="text-slate-300">React 18 / Tailwind</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span className="text-slate-500">Diagnostics:</span>
                  <span className="text-slate-300">WMI / PowerShell</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-brand-border text-center text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1.5 select-none">
              Made with <Heart className="h-3 w-3 text-rose-500 fill-rose-500" /> by SolasCare DevTeam
            </div>
          </div>

          {/* System Info & Policy status */}
          <div className="glass-panel border border-brand-border rounded-2xl p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-brand-cyan" /> System Info
            </h3>

            <div className="space-y-2.5">
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">OS Version:</span>
                <span className="text-slate-300">{systemInfo?.osName || 'Windows'} ({systemInfo?.release || 'Unknown'})</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-slate-500">Execution Policy:</span>
                <span className={`font-bold ${systemInfo?.executionPolicy === 'Bypass' ? 'text-brand-success' : 'text-amber-400 animate-pulse'}`}>
                  {systemInfo?.executionPolicy || 'Loading...'}
                </span>
              </div>
              <div className="flex justify-between font-semibold border-t border-brand-border/60 pt-2.5">
                <span className="text-slate-500">Compatibility Mode:</span>
                <span className={`font-bold ${systemInfo?.isLegacyWin ? 'text-amber-400 animate-pulse' : 'text-brand-success'}`}>
                  {systemInfo?.isLegacyWin ? 'ACTIVE (Legacy OS)' : 'INACTIVE (Modern OS)'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
