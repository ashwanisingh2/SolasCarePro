import React, { useState, useEffect, useRef } from 'react';
import {
  Zap, Loader2, CheckCircle2, XCircle, RefreshCw,
  Wifi, WifiOff, Volume2, VolumeX, Monitor, MonitorOff,
  Printer, Globe, ShieldCheck, ShieldAlert, Trash2,
  FolderOpen, HardDrive, Battery, BatteryCharging,
  Search, Settings, Terminal, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const QUICK_FIXES = [
  {
    id: 'no-audio',
    title: 'No Audio / Sound Not Working',
    description: 'Restart audio services and reset drivers',
    icon: VolumeX,
    category: 'Hardware',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
    borderColor: 'border-pink-500/20',
    commands: [
      { name: 'Restart Audio Services', cmd: 'Restart-Service Audiosrv -Force; Restart-Service AudioEndpointBuilder -Force', key: 'quick-audio-fix' },
      { name: 'Re-register Audio Drivers', cmd: 'Get-PnpDevice -Class System | Where-Object { $_.FriendlyName -match "Audio" } | Disable-PnpDevice -Confirm:$false; Get-PnpDevice -Class System | Where-Object { $_.FriendlyName -match "Audio" } | Enable-PnpDevice -Confirm:$false', key: null }
    ]
  },
  {
    id: 'no-internet',
    title: 'No Internet Connection',
    description: 'Reset network adapters, DNS, and Winsock',
    icon: WifiOff,
    category: 'Network',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    borderColor: 'border-cyan-500/20',
    commands: [
      { name: 'Flush DNS & Reset Winsock', cmd: 'ipconfig /flushdns; netsh winsock reset; netsh int ip reset', key: 'quick-internet-fix' },
      { name: 'Release & Renew IP', cmd: 'ipconfig /release; ipconfig /renew', key: null },
      { name: 'Reset Network Adapter', cmd: 'Get-NetAdapter | Restart-NetAdapter', key: null }
    ]
  },
  {
    id: 'frozen-explorer',
    title: 'Frozen / Not Responding Explorer',
    description: 'Restart Windows Explorer process',
    icon: MonitorOff,
    category: 'System',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/20',
    borderColor: 'border-violet-500/20',
    commands: [
      { name: 'Restart Explorer', cmd: 'Stop-Process -Name explorer -Force; Start-Process explorer.exe', key: 'quick-explorer-fix' }
    ]
  },
  {
    id: 'printer-stuck',
    title: 'Printer Stuck / Not Printing',
    description: 'Clear print queue and restart spooler service',
    icon: Printer,
    category: 'Hardware',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/20',
    borderColor: 'border-amber-500/20',
    commands: [
      { name: 'Clear Print Queue & Restart Spooler', cmd: 'Stop-Service Spooler -Force; Remove-Item "$env:SystemRoot\\System32\\spool\\PRINTERS\\*" -Force -ErrorAction SilentlyContinue; Start-Service Spooler', key: 'repair-print-spooler' }
    ]
  },
  {
    id: 'slow-pc',
    title: 'Slow PC Performance',
    description: 'Quick cleanup and system optimization',
    icon: HardDrive,
    category: 'Performance',
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/20',
    borderColor: 'border-rose-500/20',
    commands: [
      { name: 'Clear Temp Files', cmd: 'Remove-Item "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue', key: 'repair-temp-cleanup' },
      { name: 'Clear Store Cache', cmd: 'wsreset.exe', key: 'repair-cache-cleanup' },
      { name: 'Flush DNS', cmd: 'ipconfig /flushdns; Clear-DnsClientCache', key: 'flush-dns' }
    ]
  },
  {
    id: 'windows-update',
    title: 'Windows Update Not Working',
    description: 'Reset Windows Update services and cache',
    icon: RefreshCw,
    category: 'System',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/20',
    borderColor: 'border-emerald-500/20',
    commands: [
      { name: 'Reset Windows Update Cache', cmd: 'Stop-Service wuauserv,bits,cryptsvc -Force; Rename-Item "$env:SystemRoot\\SoftwareDistribution" "SoftwareDistribution.old" -ErrorAction SilentlyContinue; Rename-Item "$env:SystemRoot\\System32\\catroot2" "catroot2.old" -ErrorAction SilentlyContinue; Start-Service cryptsvc,bits,wuauserv', key: 'repair-windows-update' }
    ]
  },
  {
    id: 'microsoft-store',
    title: 'Microsoft Store Not Opening',
    description: 'Reset and re-register Microsoft Store',
    icon: Globe,
    category: 'App',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    borderColor: 'border-blue-500/20',
    commands: [
      { name: 'Reset Store & Re-register', cmd: 'wsreset.exe; Get-AppxPackage Microsoft.WindowsStore | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register "$($_.InstallLocation)\\AppXManifest.xml" }', key: 'repair-store' }
    ]
  },
  {
    id: 'edge-browser',
    title: 'Microsoft Edge Not Working',
    description: 'Reset Edge browser settings',
    icon: Search,
    category: 'App',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
    borderColor: 'border-sky-500/20',
    commands: [
      { name: 'Reset Edge (No Extensions)', cmd: 'Start-Process "msedge.exe" "--disable-extensions --no-first-run"', key: 'repair-edge' }
    ]
  },
  {
    id: 'onedrive-sync',
    title: 'OneDrive Not Syncing',
    description: 'Reset OneDrive sync client',
    icon: FolderOpen,
    category: 'App',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
    borderColor: 'border-indigo-500/20',
    commands: [
      { name: 'Reset OneDrive', cmd: 'Start-Process "$env:LOCALAPPDATA\\Microsoft\\OneDrive\\OneDrive.exe" "/reset"', key: 'repair-onedrive' }
    ]
  },
  {
    id: 'firewall-defender',
    title: 'Firewall / Defender Disabled',
    description: 'Re-enable Windows Firewall and Defender',
    icon: ShieldAlert,
    category: 'Security',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    borderColor: 'border-orange-500/20',
    commands: [
      { name: 'Enable Firewall', cmd: 'Set-Service MpsSvc -StartupType Automatic; Start-Service MpsSvc; netsh advfirewall set allprofiles state on', key: 'repair-firewall-service' },
      { name: 'Start Windows Defender', cmd: 'Set-Service WinDefend -StartupType Automatic; Start-Service WinDefend', key: 'repair-defender-service' }
    ]
  }
];

export default function QuickFix() {
  const [activeFix, setActiveFix] = useState(null);
  const [runningCommand, setRunningCommand] = useState(null);
  const [commandLogs, setCommandLogs] = useState([]);
  const [commandStatus, setCommandStatus] = useState({});
  const [filter, setFilter] = useState('All');
  const consoleEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [commandLogs]);

  const categories = ['All', ...new Set(QUICK_FIXES.map(f => f.category))];

  const filteredFixes = filter === 'All'
    ? QUICK_FIXES
    : QUICK_FIXES.filter(f => f.category === filter);

  const runCommand = async (fix, cmd) => {
    setRunningCommand(cmd.name);
    setCommandLogs([`[SYSTEM] Starting: ${cmd.name}`]);
    setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'running' }));

    let unsubscribe = null;
    if (window.api && window.api.onStream) {
      unsubscribe = window.api.onStream('care-out', (data) => {
        setCommandLogs(prev => [...prev, ...data.split('\n')]);
      });
    }

    try {
      if (window.api && cmd.key) {
        const res = await window.api.runSystemCommand(cmd.key);
        if (res.success) {
          setCommandLogs(prev => [...prev, '', `[SUCCESS] ${cmd.name} completed successfully.`]);
          setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'success' }));
        } else {
          setCommandLogs(prev => [...prev, '', `[ERROR] ${cmd.name} failed: ${res.error || res.stderr}`]);
          setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'failed' }));
        }
      } else if (window.api) {
        const res = await window.api.runSystemCommand('run-system-command', [cmd.cmd]);
        if (res.success) {
          setCommandLogs(prev => [...prev, '', `[SUCCESS] ${cmd.name} completed successfully.`]);
          setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'success' }));
        } else {
          setCommandLogs(prev => [...prev, '', `[ERROR] ${cmd.name} failed: ${res.error}`]);
          setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'failed' }));
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1500));
        setCommandLogs(prev => [...prev, `[MOCK] ${cmd.name} executed successfully.`, '']);
        setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'success' }));
      }
    } catch (error) {
      setCommandLogs(prev => [...prev, `[ERROR] ${error.message}`, '']);
      setCommandStatus(prev => ({ ...prev, [`${fix.id}-${cmd.name}`]: 'failed' }));
    } finally {
      if (unsubscribe) unsubscribe();
      setRunningCommand(null);
    }
  };

  const runAllCommands = async (fix) => {
    setActiveFix(fix);
    for (const cmd of fix.commands) {
      await runCommand(fix, cmd);
    }
  };

  const getStatusIcon = (fixId, cmdName) => {
    const status = commandStatus[`${fixId}-${cmdName}`];
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-rose-400" />;
    if (status === 'running') return <Loader2 className="h-4 w-4 text-brand-violet animate-spin" />;
    return <Play className="h-4 w-4 text-slate-500" />;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Quick Fixes</h2>
          <p className="text-xs text-slate-400">One-click solutions for common Windows problems</p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              filter === cat
                ? 'bg-brand-violet text-white shadow-lg shadow-brand-violet/20'
                : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 border border-brand-border'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Fixes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredFixes.map(fix => {
          const Icon = fix.icon;
          const isActive = activeFix?.id === fix.id;
          return (
            <motion.div
              key={fix.id}
              layout
              className={`glass-panel border rounded-2xl overflow-hidden transition-all ${
                isActive ? 'border-brand-violet/50 shadow-lg shadow-brand-violet/10' : 'border-brand-border'
              }`}
            >
              {/* Card Header */}
              <div className="p-4 flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${fix.bgColor} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${fix.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-slate-200">{fix.title}</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">{fix.description}</p>
                </div>
              </div>

              {/* Commands */}
              <div className="border-t border-brand-border p-4 space-y-2">
                {fix.commands.map((cmd, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getStatusIcon(fix.id, cmd.name)}
                      <span className="text-[11px] text-slate-300 truncate">{cmd.name}</span>
                    </div>
                    <button
                      onClick={() => runCommand(fix, cmd)}
                      disabled={runningCommand !== null}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[10px] font-bold rounded border border-brand-border text-slate-300 cursor-pointer transition-all shrink-0"
                    >
                      {commandStatus[`${fix.id}-${cmd.name}`] === 'running' ? 'Running...' : 'Run'}
                    </button>
                  </div>
                ))}

                {fix.commands.length > 1 && (
                  <button
                    onClick={() => runAllCommands(fix)}
                    disabled={runningCommand !== null}
                    className="w-full mt-2 px-4 py-2 bg-gradient-to-r from-brand-violet to-brand-cyan hover:from-brand-violet/90 hover:to-brand-cyan/90 disabled:opacity-50 text-[11px] font-bold rounded-lg cursor-pointer transition-all"
                  >
                    Run All ({fix.commands.length} steps)
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Console Output */}
      {activeFix && commandLogs.length > 0 && (
        <div className="glass-panel border border-brand-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-brand-violet" />
              <span className="text-xs font-bold text-slate-300">Console Output</span>
            </div>
            <button
              onClick={() => { setCommandLogs([]); setActiveFix(null); setCommandStatus({}); }}
              className="text-[10px] text-slate-500 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          </div>
          <div className="p-4 font-mono text-[11px] text-emerald-400 max-h-[200px] overflow-y-auto leading-relaxed bg-slate-950/50">
            {commandLogs.map((log, idx) => (
              <p key={idx} className={
                log.startsWith('[ERROR]') ? 'text-brand-danger' :
                log.startsWith('[SUCCESS]') ? 'text-brand-success' :
                log.startsWith('[SYSTEM]') ? 'text-brand-cyan' :
                log.startsWith('[MOCK]') ? 'text-amber-400' :
                ''
              }>
                {log}
              </p>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
