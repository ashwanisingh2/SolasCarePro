import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Play, FileText, Activity, Loader2, AlertTriangle, Info, CheckCircle2,
  XCircle, Server, Cpu, Globe, FolderOpen, RefreshCw
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

function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
  catch (_) { return iso; }
}

// --- Main ---

export default function SeamlessSandbox() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [availability, setAvailability] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [activeTab, setActiveTab] = useState('launch'); // 'launch' | 'activity'

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState('suspicious-exe');
  const [hostFolder, setHostFolder] = useState('');
  const [command, setCommand] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [availRes, tmplRes, actRes] = await Promise.all([
          window.api.runSystemCommand('run-sandbox-tool', ['check-availability'], { bypassConfirmation: true }),
          window.api.runSystemCommand('run-sandbox-tool', ['list-templates'], { bypassConfirmation: true }),
          window.api.sandboxListActivity(30)
        ]);
        const aObj = safeJsonParse(availRes?.stdout);
        if (aObj?.success) setAvailability(aObj);
        const tObj = safeJsonParse(tmplRes?.stdout);
        if (tObj?.success) {
          setTemplates(tObj.templates || []);
          // Set default command from selected template
          const tmpl = (tObj.templates || []).find(t => t.id === selectedTemplate);
          if (tmpl && !command) setCommand(tmpl.defaultCommand);
        }
        if (actRes.success) setActivity(actRes.activity || []);
      } else {
        // Mock
        setAvailability({
          edition: 'Windows 11 Pro',
          editionSupported: true,
          featureEnabled: true,
          available: true,
          message: 'Windows Sandbox is available and enabled.'
        });
        setTemplates([
          { id: 'suspicious-exe', name: 'Suspicious Executable', description: 'Run unknown .exe safely.', defaultCommand: 'cmd.exe', readOnly: true },
          { id: 'browser-test', name: 'Browser / Web Test', description: 'Open suspicious URL.', defaultCommand: 'cmd.exe /c start https://example.com', readOnly: false },
          { id: 'custom', name: 'Custom', description: 'Empty sandbox.', defaultCommand: 'cmd.exe', readOnly: false }
        ]);
      }
    } catch (e) {
      addNotification('Sandbox', 'Load failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification, selectedTemplate, command]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleEnableFeature = async () => {
    const ok = await confirm({
      title: 'Enable Windows Sandbox Feature',
      message: 'Enable the Containers-DisposableClientVM Windows feature?',
      detail: 'Requires a system REBOOT to complete installation. ~500MB download from Microsoft.',
      confirmLabel: 'Enable (Reboot Required)',
      danger: false
    });
    if (!ok) return;
    setBusy(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-sandbox-tool', ['enable-feature']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Sandbox', 'Feature enabled. REBOOT REQUIRED.', 'warning');
          await fetchAll();
        } else {
          addNotification('Sandbox', obj?.error || 'Enable failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Sandbox', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleBrowse = async () => {
    if (window.api?.openFileDialog) {
      const res = await window.api.openFileDialog({
        title: 'Select folder to mount in sandbox',
        properties: ['openDirectory']
      });
      if (res && !res.canceled && res.filePaths?.length) {
        setHostFolder(res.filePaths[0]);
      }
    }
  };

  const handleLaunch = async () => {
    if (!availability?.available) {
      addNotification('Sandbox', 'Sandbox not available. See status above.', 'error');
      return;
    }
    const tmpl = templates.find(t => t.id === selectedTemplate);
    if (!tmpl) return;
    const ok = await confirm({
      title: 'Launch Windows Sandbox',
      message: `Launch sandbox with template "${tmpl.name}"?`,
      detail: `Command: ${command || tmpl.defaultCommand}\nHost folder: ${hostFolder || '(none — clean sandbox)'}\nRead-only: ${tmpl.readOnly ? 'Yes' : 'No'}`,
      confirmLabel: 'Launch Sandbox',
      danger: false
    });
    if (!ok) return;
    setBusy(true);
    setShowOutput(true);
    try {
      if (window.api) {
        // Step 1: generate .wsb
        const genRes = await window.api.runSystemCommand('run-sandbox-tool',
          ['generate-wsb', null, selectedTemplate, hostFolder || null, command || null]);
        const genObj = safeJsonParse(genRes.stdout);
        if (!genObj?.success) {
          addNotification('Sandbox', genObj?.error || 'WSB generation failed.', 'error');
          return;
        }
        // Step 2: launch
        const launchRes = await window.api.runSystemCommand('run-sandbox-tool',
          ['launch-sandbox', genObj.wsbPath]);
        const launchObj = safeJsonParse(launchRes.stdout);
        if (launchObj?.success) {
          // Log to activity
          await window.api.sandboxAppendActivity({
            ts: new Date().toISOString(),
            action: 'launch',
            template: selectedTemplate,
            wsbPath: genObj.wsbPath,
            command: command || tmpl.defaultCommand,
            hostFolder: hostFolder || null
          });
          addNotification('Sandbox', 'Windows Sandbox launched.', 'success');
          await fetchAll();
        } else {
          addNotification('Sandbox', launchObj?.error || 'Launch failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Sandbox', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleParseActivityLog = async () => {
    setBusy(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-sandbox-tool', ['parse-activity-log'], { bypassConfirmation: true });
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Sandbox', `Found ${obj.count} sandbox events in last 24h.`, obj.count > 0 ? 'info' : 'success');
          // Could display in a modal — for now just notify
        }
      }
    } catch (e) {
      addNotification('Sandbox', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Box className="h-5 w-5 text-brand-violet" />
            Seamless Sandbox
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Run suspicious files in an isolated Windows Sandbox. Whatever happens inside the sandbox stays inside —
            your main Windows stays 100% safe. One click to launch, one click to delete.
          </p>
        </div>
        <button onClick={() => setShowOutput(s => !s)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer">
          <Activity className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
        </button>
      </header>

      {/* Availability banner */}
      {availability && (
        <div className={`glass-panel border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap ${
          availability.available
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-rose-500/30 bg-rose-500/5'
        }`}>
          <div className="flex items-center gap-3">
            {availability.available ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
            )}
            <div>
              <div className="text-sm font-bold text-slate-200">
                Windows Sandbox {availability.available ? 'Available' : 'Unavailable'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">{availability.message}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">Edition: {availability.edition}</div>
            </div>
          </div>
          {!availability.available && availability.editionSupported && !availability.featureEnabled && (
            <button onClick={handleEnableFeature} disabled={busy}
              className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
              Enable Feature
            </button>
          )}
        </div>
      )}

      {/* Edition warning for Home users */}
      {availability && !availability.editionSupported && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-amber-300">Home Edition Limitation:</strong> Windows Sandbox requires
            Hyper-V, which is only available on Windows 10/11 <strong>Pro, Enterprise, or Education</strong>.
            Your edition ({availability.edition}) does not support it. Consider upgrading to Pro, or use a
            third-party sandbox like Sandboxie (not integrated with SolasCare).
          </div>
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="120px" />}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-brand-border">
        {[
          { id: 'launch', label: 'Launch Sandbox', icon: Play },
          { id: 'activity', label: 'Activity Log', icon: FileText }
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
          <p className="text-xs text-slate-400">Checking sandbox availability...</p>
        </div>
      ) : (
        <>
          {activeTab === 'launch' && (
            <div className="space-y-4">
              {/* Template selection */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Sandbox Template</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                  {templates.map(t => {
                    const Icon = t.id === 'suspicious-exe' ? Cpu : t.id === 'browser-test' ? Globe : t.id === 'installer-test' ? Server : Box;
                    const isSel = selectedTemplate === t.id;
                    return (
                      <button key={t.id} onClick={() => {
                        setSelectedTemplate(t.id);
                        setCommand(t.defaultCommand);
                      }}
                        className={`p-3 border rounded-lg text-left cursor-pointer transition-all ${
                          isSel
                            ? 'bg-brand-violet/15 border-brand-violet/40 ring-1 ring-brand-violet/20'
                            : 'bg-slate-900/40 border-brand-border hover:border-slate-600'
                        }`}>
                        <Icon className={`h-5 w-5 mb-2 ${isSel ? 'text-brand-violet' : 'text-slate-500'}`} />
                        <div className="text-xs font-bold text-slate-200">{t.name}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{t.description}</div>
                        {t.readOnly && (
                          <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            READ-ONLY
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Host folder + command */}
              <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Host Folder to Mount (optional)
                  </label>
                  <div className="flex gap-2">
                    <input type="text" value={hostFolder} onChange={e => setHostFolder(e.target.value)}
                      placeholder="e.g. C:\Users\dev\Downloads\suspicious"
                      className="flex-1 bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-violet" />
                    <button onClick={handleBrowse}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-brand-border text-slate-300 text-xs font-bold rounded cursor-pointer flex items-center gap-1">
                      <FolderOpen className="h-3 w-3" /> Browse
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Folder will be mounted in the sandbox. Read-only templates prevent the sandbox from writing back to your host.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Command to Run</label>
                  <input type="text" value={command} onChange={e => setCommand(e.target.value)}
                    placeholder="e.g. cmd.exe"
                    className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-violet" />
                  <p className="text-[10px] text-slate-500 mt-1">Executed automatically when the sandbox starts. For suspicious .exe, use the full path inside the mounted folder.</p>
                </div>
              </div>

              {/* Launch button */}
              <button onClick={handleLaunch} disabled={busy || !availability?.available}
                className="w-full px-4 py-3 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {busy ? 'Launching...' : 'Launch Windows Sandbox'}
              </button>

              {/* About */}
              <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-3 text-xs text-slate-300 flex items-start gap-2">
                <Info className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
                <div>
                  <strong className="text-brand-cyan">How it works:</strong> SolasCare generates a .wsb
                  (Windows Sandbox configuration) file with your settings, then launches Windows Sandbox via
                  the .wsb file association. The sandbox is a fresh, isolated Windows environment — anything
                  that happens inside (malware execution, registry changes, file writes) is discarded when
                  the sandbox closes. Use the Activity Log tab to see what files/network calls were made.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={handleParseActivityLog} disabled={busy}
                  className="px-3 py-2 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Parse Sandbox Events (24h)
                </button>
              </div>

              {activity.length === 0 ? (
                <div className="py-12 text-center">
                  <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 mb-1">No sandbox launches yet.</p>
                  <p className="text-xs text-slate-500">Launch your first sandbox from the "Launch Sandbox" tab.</p>
                </div>
              ) : (
                <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
                  <div className="divide-y divide-brand-border/50 max-h-[500px] overflow-y-auto">
                    {activity.map((a, i) => (
                      <div key={i} className="p-3 flex items-start gap-3">
                        <Play className="h-3.5 w-3.5 text-brand-cyan shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-200">
                            Launched: {a.template}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 font-mono break-all">
                            {a.command}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {formatDateTime(a.ts)}{a.hostFolder ? ` · Host: ${a.hostFolder}` : ' · Clean sandbox'}
                          </div>
                        </div>
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
