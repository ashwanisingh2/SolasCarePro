import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Play, Loader2, XCircle, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';

// `danger: true` scripts change system state (wipe logs, drop network, stop
// services, delete files) and prompt for confirmation before running.
const SCRIPTS = [
  // ── Network ─────────────────────────────────────────────────────────────────
  { id: 'flush-dns',              name: 'Flush DNS Cache',              desc: 'Resolves website loading issues by clearing the local DNS resolver cache.',          type: 'network' },
  { id: 'winsock-reset',          name: 'Winsock Reset',                desc: 'Resets network adapters and the TCP/IP stack. Reboot required after.',               type: 'network', danger: true },
  { id: 'netstat',                name: 'Network Connections (Netstat)',  desc: 'Lists all active TCP connections and currently listening ports.',                    type: 'network' },
  { id: 'reset-network-adapters', name: 'Restart Network Adapters',     desc: 'Disables and re-enables all physical and virtual network adapters.',                  type: 'network', danger: true },
  { id: 'wifi-password-list',     name: 'Show Saved Wi-Fi Passwords',   desc: 'Lists all saved Wi-Fi profiles with their stored passwords.',                        type: 'network' },
  { id: 'open-ports',             name: 'Open Ports Scanner',           desc: 'Shows all TCP/UDP ports currently in LISTENING state on this machine.',               type: 'network' },
  { id: 'ping-gateway',           name: 'Ping Default Gateway',         desc: 'Detects the default router IP and pings it 4 times to check local connectivity.',    type: 'network' },
  { id: 'reset-winsock-ip',       name: 'Full Network Stack Reset',     desc: 'Resets Winsock, IPv4, IPv6, and flushes DNS — the nuclear option for network issues. Reboot required.', type: 'network', danger: true },

  // ── System Info ─────────────────────────────────────────────────────────────
  { id: 'system-info',            name: 'System Info Report',           desc: 'Generates a detailed system hardware and OS report via systeminfo.',                  type: 'system' },
  { id: 'task-list',              name: 'Active Processes',             desc: 'Lists all currently running processes and services.',                                  type: 'system' },
  { id: 'system-uptime',          name: 'System Uptime Check',          desc: 'Shows the exact time elapsed since the last Windows boot.',                           type: 'system' },
  { id: 'battery-report',         name: 'Generate Battery Report',      desc: 'Creates an HTML battery health report saved to your Desktop.',                        type: 'system' },
  { id: 'gpupdate',               name: 'Force Group Policy Update',    desc: 'Forces an immediate update of all group policies (gpupdate /force).',                 type: 'system' },
  { id: 'disk-usage',             name: 'Disk Space Usage',             desc: 'Shows used, free, and total space for every drive on this machine.',                  type: 'system' },
  { id: 'top-cpu-processes',      name: 'Top CPU Processes',            desc: 'Lists top 15 processes by CPU and RAM usage in real time.',                          type: 'system' },
  { id: 'environment-vars',       name: 'Environment Variables',        desc: 'Prints all system and user environment variables (PATH, TEMP, etc.).',                type: 'system' },
  { id: 'scheduled-tasks',        name: 'Active Scheduled Tasks',       desc: 'Lists all non-disabled Windows Scheduled Tasks with their last run time.',            type: 'system' },
  { id: 'windows-license',        name: 'Windows License Status',       desc: 'Shows Windows activation status, product key channel, and expiry.',                   type: 'system' },
  { id: 'clean-temp',             name: 'Clean Temporary Files',        desc: 'Force deletes all files in %TEMP% and Windows\\Temp directories.',                    type: 'system', danger: true },
  { id: 'clear-event-logs',       name: 'Clear All Event Logs',         desc: 'Wipes every Windows Event Viewer log including crash and BSOD history.',             type: 'system', danger: true },

  // ── Repair & Maintenance ────────────────────────────────────────────────────
  { id: 'chkdsk',                 name: 'Quick Check Disk',             desc: 'Scans the file system for logical errors (chkdsk /scan, non-destructive).',          type: 'repair' },
  { id: 'sfc-scan',               name: 'System File Checker (SFC)',    desc: 'Scans and repairs corrupted Windows system files (sfc /scannow). Takes 5-10 min.',   type: 'repair' },
  { id: 'dism-health',            name: 'DISM Health Check',            desc: 'Runs DISM CheckHealth + ScanHealth to detect Windows image corruption.',              type: 'repair' },
  { id: 'print-spooler-reset',    name: 'Reset Print Spooler',          desc: 'Stops spooler, clears stuck print jobs, and restarts the service.',                  type: 'repair', danger: true },
  { id: 'wmi-rebuild',            name: 'Rebuild WMI Repository',       desc: 'Fixes Windows Management Instrumentation corruption — resolves many PS script failures.', type: 'repair', danger: true },
  { id: 'wu-cache-clear',         name: 'Clear Windows Update Cache',   desc: 'Clears SoftwareDistribution folder to fix stuck or failed Windows Updates.',         type: 'repair', danger: true },
  { id: 're-register-apps',       name: 'Re-register Store Apps',       desc: 'Repairs broken or missing Windows 10/11 built-in apps via AppX re-registration.',    type: 'repair', danger: true },
  { id: 'rebuild-icon-cache',     name: 'Rebuild Icon Cache',           desc: 'Kills Explorer, clears IconCache.db, and restarts Explorer — fixes blank/corrupt icons.', type: 'repair', danger: true },
  { id: 'disk-cleanup-silent',    name: 'Run Disk Cleanup (Silent)',    desc: 'Launches Windows built-in Disk Cleanup in background (cleanmgr /sagerun:1).',        type: 'repair' },
  { id: 'clear-dns-cache-browser', name: 'Flush DNS + Browser Hint',   desc: 'Flushes Windows DNS cache and prints the Chrome/Edge URL to clear browser DNS too.', type: 'repair' },

  // ── Security ─────────────────────────────────────────────────────────────────
  { id: 'firewall-status',        name: 'Firewall Rules Summary',       desc: 'Shows inbound/outbound default actions for all Windows Firewall profiles.',           type: 'security' },
  { id: 'defender-quick-scan',    name: 'Defender Quick Scan',          desc: 'Triggers a Windows Defender quick scan. Results appear in Windows Security.',         type: 'security' },
  { id: 'list-startup-items',     name: 'Startup Programs (Registry)',  desc: 'Lists all programs set to auto-start via HKCU and HKLM Run registry keys.',          type: 'security' },
  { id: 'check-pending-reboot',   name: 'Check Pending Reboot',         desc: 'Checks registry flags to determine if a reboot is required to complete updates.',     type: 'security' },
];

export default function CommandHub() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [running, setRunning] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState([
    '[SYSTEM] SolasCare Command Hub Initialized...',
    '[SYSTEM] Ready to execute advanced maintenance scripts.',
    ' '
  ]);
  const [activeFilter, setActiveFilter] = useState('all');
  const terminalRef = useRef(null);

  // Auto scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Listen to streaming output
  useEffect(() => {
    let unsubCare = null;
    if (window.api && window.api.onStream) {
      unsubCare = window.api.onStream('care-out', (data) => {
        try {
          if (typeof data === 'string') {
            const lines = data.split('\n').filter(Boolean);
            setTerminalOutput(prev => [...prev, ...lines]);
          }
        } catch (e) {
          console.error(e);
        }
      });
    }
    return () => {
      if (unsubCare) unsubCare();
    };
  }, []);

  const executeScript = async (scriptId, scriptName) => {
    if (running) return;

    // Destructive scripts require explicit confirmation before running.
    const script = SCRIPTS.find(s => s.id === scriptId);
    if (script?.danger) {
      const ok = await confirm({
        title: scriptName,
        message: `${script.desc} This changes system state and cannot be undone.`,
        confirmLabel: 'Run Anyway',
        danger: true
      });
      if (!ok) return;
    }

    setRunning(scriptId);
    setTerminalOutput(prev => [...prev, `\n> Executing script: ${scriptName}...`]);
    
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-quick-cmd', [scriptId]);
        if (res.success) {
          addNotification('Command Hub', `${scriptName} executed successfully.`, 'success');
          if (res.stdout) {
            setTerminalOutput(prev => [...prev, res.stdout]);
          }
          setTerminalOutput(prev => [...prev, `[SUCCESS] Execution completed (Exit Code 0).`]);
        } else {
          throw new Error(res.error || 'Unknown execution error');
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 2000));
        setTerminalOutput(prev => [...prev, 'Simulated output line 1...', 'Simulated output line 2...', '[SUCCESS] Execution completed.']);
        addNotification('Command Hub', `${scriptName} executed successfully (Mock).`, 'success');
      }
    } catch (e) {
      setTerminalOutput(prev => [...prev, `[ERROR] ${e.message}`]);
      addNotification('Execution Error', e.message, 'error');
    } finally {
      setRunning(null);
    }
  };

  const cancelExecution = async () => {
    if (!running) return;
    if (window.api) {
      await window.api.killActiveProcess();
      setTerminalOutput(prev => [...prev, '[SYSTEM] Sent termination signal to active process.']);
    }
  };

  const clearTerminal = () => {
    setTerminalOutput(['[SYSTEM] Terminal cleared.']);
  };

  const filteredScripts = activeFilter === 'all' ? SCRIPTS : SCRIPTS.filter(s => s.type === activeFilter);

  return (
    <div className="p-6 h-full flex flex-col space-y-6 text-left select-none overflow-hidden">
      <div>
        <h2 className="text-xl font-bold text-slate-200">Command & Script Hub</h2>
        <p className="text-xs text-slate-400 mt-1">Execute advanced CMD and PowerShell diagnostics scripts securely.</p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-160px)]">
        {/* Left Side: Script List */}
        <div className="w-1/2 flex flex-col space-y-4">
          <div className="flex gap-2 bg-slate-900/60 border border-brand-border rounded-xl p-1 shrink-0 flex-wrap">
            {['all', 'network', 'system', 'repair', 'security'].map(type => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-all cursor-pointer ${
                  activeFilter === type ? 'bg-brand-violet text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {filteredScripts.map(script => (
              <div key={script.id} className="glass-panel border border-brand-border rounded-xl p-4 flex flex-col gap-3 group hover:border-brand-violet/50 transition-colors">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">{script.name}</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{script.desc}</p>
                </div>
                <div className="flex justify-between items-center mt-auto pt-2 border-t border-slate-800/50">
                  <span className="text-[10px] uppercase font-black tracking-wider text-slate-500 bg-slate-900 px-2 py-1 rounded">
                    {script.type}
                  </span>
                  <button
                    onClick={() => executeScript(script.id, script.name)}
                    disabled={running !== null}
                    className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/85 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    {running === script.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {running === script.id ? 'Running' : 'Execute'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Terminal Output */}
        <div className="w-1/2 flex flex-col rounded-xl overflow-hidden border border-brand-border bg-[#0C0C0C]">
          <div className="flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-brand-border shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-brand-cyan" />
              <span className="text-xs font-bold text-slate-300">Terminal Output</span>
            </div>
            <div className="flex items-center gap-2">
              {running && (
                <button 
                  onClick={cancelExecution}
                  className="px-2 py-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="h-3 w-3" /> Stop
                </button>
              )}
              <button 
                onClick={clearTerminal}
                className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer transition-colors"
                title="Clear Terminal"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div 
            ref={terminalRef}
            className="flex-1 p-4 overflow-y-auto font-mono text-xs text-slate-300 custom-scrollbar"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
          >
            {terminalOutput.map((line, idx) => (
              <div key={idx} className={line.startsWith('[ERROR]') ? 'text-rose-400' : line.startsWith('[SUCCESS]') ? 'text-emerald-400' : line.startsWith('>') ? 'text-brand-cyan font-bold mt-2' : ''}>
                {line}
              </div>
            ))}
            {running && (
              <div className="mt-2 text-brand-violet animate-pulse flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Executing command...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
