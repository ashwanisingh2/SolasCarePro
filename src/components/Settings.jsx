import React, { useState, useEffect } from 'react';
import { User, Sparkles, Globe, Heart, ShieldCheck, FileJson, Download, Upload,
  RefreshCw, ArrowUpCircle, AlertTriangle, CheckCircle2, WifiOff
} from 'lucide-react';


export default function SettingsView({ theme, setTheme }) {
  const [channel, setChannel] = useState('stable');
  const [logLevel, setLogLevel] = useState('info');
  const [runAtStartup, setRunAtStartup] = useState(false);
  const [optInAnalytics, setOptInAnalytics] = useState(false);
  const [optInCrashReports, setOptInCrashReports] = useState(false);
  const [manualControl, setManualControl] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [systemInfo, setSystemInfo] = useState(null);
  // Update checker state
  const [updateState, setUpdateState] = useState(null); // null | { available, current, latest, url, notes, error }
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  // AV exclusion banner state
  const [avBannerDismissed, setAvBannerDismissed] = useState(true); // true = hidden until loaded

  const loadSettingsAndSystem = async () => {
    if (window.api) {
      try {
        const c = await window.api.getSetting('channel', 'stable');
        const l = await window.api.getSetting('logLevel', 'info');
        const r = await window.api.getSetting('runAtStartup', false);
        const oa = await window.api.getSetting('optInAnalytics', false);
        const oc = await window.api.getSetting('optInCrashReports', false);
        const mc = await window.api.getSetting('manualControl', false);
        const avDismissed = await window.api.getSetting('avBannerDismissed', false);
        setChannel(c);
        setLogLevel(l);
        setRunAtStartup(r);
        setOptInAnalytics(oa);
        setOptInCrashReports(oc);
        setManualControl(mc);
        setAvBannerDismissed(avDismissed);

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

  const handleClearLogs = async () => {
    if (window.api) {
      try {
        // Open the logs folder so the user can manually clear old log files.
        // We don't auto-delete because logs are useful for forensic analysis.
        await window.api.openLogsFolder();
        setStatusMessage('Logs folder opened. Delete old log files manually if needed.');
      } catch (e) {
        setStatusMessage('Failed to open logs folder: ' + e.message);
      }
    } else {
      setStatusMessage('Log folder only available in desktop mode.');
    }
    setTimeout(() => setStatusMessage(''), 4000);
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
      if (window.api && window.api.openFileDialog) {        setStatusMessage('Opening import file dialog...');
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
          if (settings.manualControl !== undefined) setManualControl(settings.manualControl);
          
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

  const handleCheckUpdate = async () => {
    if (!window.api?.checkAppUpdate) {
      setUpdateState({ available: false, current: '—', error: 'desktop_only' });
      return;
    }
    setCheckingUpdate(true);
    setUpdateState(null);
    try {
      const result = await window.api.checkAppUpdate();
      setUpdateState(result);
    } catch (e) {
      setUpdateState({ available: false, current: '—', error: 'network' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDismissAvBanner = async () => {
    setAvBannerDismissed(true);
    if (window.api) await window.api.setSetting('avBannerDismissed', true);
  };

  const handleOpenAvGuide = () => {
    if (window.api?.openExternalUrl) {
      window.api.openExternalUrl(
        'https://github.com/SPTL-Solas/SolasCarePro/blob/main/ANTIVIRUS-GUIDE.md'
      );
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

      {/* AV Exclusion First-Run Banner */}
      {!avBannerDismissed && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-300">First-Time Setup — Add Antivirus Exclusion</p>
            <p className="text-[10px] text-amber-200/70 mt-1 leading-relaxed">
              SolasCare Pro uses PowerShell, registry edits, and VHD mounting — legitimate system admin
              operations that some antivirus programs flag as suspicious. Add an exclusion to prevent
              false positives and app slowdowns.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleOpenAvGuide}
                className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
              >
                View Step-by-Step Guide
              </button>
              <button
                onClick={handleDismissAvBanner}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-brand-border text-slate-400 text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Settings Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 select-none">
        {/* Left Columns: Config panel */}
        <div className="md:col-span-2 space-y-6">

          {/* Automation & Control */}
          <div className="glass-panel border border-brand-violet/50 bg-brand-violet/5 rounded-2xl p-6 space-y-4 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <ShieldCheck className="h-4.5 w-4.5 text-brand-violet" /> Automation & Control
            </h3>

            <div className="flex justify-between items-center py-2.5">
              <div>
                <h4 className="text-sm font-bold text-white">Full Manual Mode (Opt-out of Automation)</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-md">Disable all background tasks, AutoPilot scans, and Sentinel auto-healing. The app will never execute any task without your explicit permission.</p>
              </div>
              <button
                onClick={() => updateSetting('manualControl', !manualControl, setManualControl)}
                className={`w-16 h-8 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                  manualControl ? 'bg-brand-violet shadow-[0_0_15px_rgba(139,92,246,0.5)]' : 'bg-slate-800'
                }`}
              >
                <div className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-all duration-300 ${
                  manualControl ? 'translate-x-8' : 'translate-x-0'
                }`}></div>
              </button>
            </div>
          </div>

          {/* General App configurations */}
          <div className="glass-panel border border-brand-border rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <Globe className="h-4.5 w-4.5 text-brand-cyan" /> General Configuration
            </h3>

            {/* Opt-In Analytics */}
            <div className="flex justify-between items-center py-2.5 border-b border-brand-border/40">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Usage Analytics</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Allow local, anonymous usage tracking to help improve features</p>
              </div>
              <button
                onClick={() => updateSetting('optInAnalytics', !optInAnalytics, setOptInAnalytics)}
                className={`w-14 h-7 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                  optInAnalytics ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all duration-300 ${
                  optInAnalytics ? 'translate-x-7' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {/* Opt-In Crash Reports */}
            <div className="flex justify-between items-center py-2.5 border-b border-brand-border/40">
              <div>
                <h4 className="text-xs font-bold text-slate-200">Crash Telemetry</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Send privacy-respecting trace logs if the app crashes</p>
              </div>
              <button
                onClick={() => updateSetting('optInCrashReports', !optInCrashReports, setOptInCrashReports)}
                className={`w-14 h-7 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                  optInCrashReports ? 'bg-emerald-600' : 'bg-slate-800'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all duration-300 ${
                  optInCrashReports ? 'translate-x-7' : 'translate-x-0'
                }`}></div>
              </button>
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

          {/* Software Updates Panel */}
          <div className="glass-panel border border-brand-border rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 uppercase flex items-center gap-2">
              <ArrowUpCircle className="h-4.5 w-4.5 text-brand-cyan" /> Software Updates
            </h3>

            {/* Current version badge */}
            <div className="flex items-center justify-between py-1">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Current Version</span>
              <span className="text-xs font-black text-brand-violet bg-brand-violet/10 px-2 py-0.5 rounded-full border border-brand-violet/30">
                v{systemInfo?.appVersion || '5.0.1'}
              </span>
            </div>

            {/* Update result display */}
            {updateState && !checkingUpdate && (
              <div className={`p-3 rounded-xl border text-[10px] font-medium leading-relaxed ${
                updateState.error === 'desktop_only'
                  ? 'bg-slate-800/50 border-brand-border text-slate-400'
                  : updateState.error
                  ? 'bg-rose-500/5 border-rose-500/20 text-rose-300'
                  : updateState.available
                  ? 'bg-brand-violet/10 border-brand-violet/30 text-slate-200'
                  : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              }`}>
                {updateState.error === 'desktop_only' && (
                  <span>Update check is only available in the desktop app.</span>
                )}
                {updateState.error === 'network' && (
                  <span className="flex items-center gap-1.5">
                    <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
                    No internet connection. Check your network and try again.
                  </span>
                )}
                {updateState.error === 'timeout' && (
                  <span>Request timed out. GitHub API may be unreachable.</span>
                )}
                {updateState.error === 'no_releases' && (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
                    No releases published yet — you have the latest build.
                  </span>
                )}
                {!updateState.error && !updateState.available && (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                    You&apos;re up to date! (v{updateState.current})
                  </span>
                )}
                {!updateState.error && updateState.available && (
                  <div className="space-y-2">
                    <p className="font-bold text-brand-violet">
                      🔔 v{updateState.latest} is available!
                    </p>
                    {updateState.notes && (
                      <p className="text-slate-400 line-clamp-3">{updateState.notes}</p>
                    )}
                    <button
                      onClick={() => window.api?.openExternalUrl(updateState.url)}
                      className="mt-1 px-3 py-1.5 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 text-brand-violet text-[10px] font-bold rounded-lg cursor-pointer transition-colors w-full"
                    >
                      Download v{updateState.latest} →
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleCheckUpdate}
              disabled={checkingUpdate}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-brand-border rounded-xl text-xs font-bold text-slate-200 cursor-pointer flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className={`h-4 w-4 text-brand-cyan ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? 'Checking...' : 'Check for Updates'}
            </button>
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
