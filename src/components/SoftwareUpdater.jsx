import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, RefreshCw, Terminal, CheckCircle2, 
  AlertTriangle, Square, Play, XCircle, Settings2
} from 'lucide-react';

export default function SoftwareUpdater() {
  const [updates, setUpdates] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [statusMessage, setStatusMessage] = useState('Verify software upgrades through Winget package manager.');
  
  // DNS Status Pill State
  const [dnsStatus, setDnsStatus] = useState('Original');
  
  // Package Update status map
  const [packageStatuses, setPackageStatuses] = useState({});
  const [hasNetworkError, setHasNetworkError] = useState(false);
  
  // Terminal log properties
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalEndRef = useRef(null);
  const streamUnsubscribeRef = useRef(null);

  // Auto-update switch
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

  useEffect(() => {
    const checkDns = async () => {
      if (window.api && window.api.getDnsStatus) {
        const res = await window.api.getDnsStatus();
        setDnsStatus(res);
      }
    };
    checkDns();
    const interval = setInterval(checkDns, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Scroll terminal to bottom
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  useEffect(() => {
    // Listen to real-time stdout logs from main process
    if (window.api && window.api.onStream) {
      streamUnsubscribeRef.current = window.api.onStream('winget-out', (data) => {
        setTerminalLogs(prev => [...prev, ...data.split('\n')]);
      });
    }

    return () => {
      if (streamUnsubscribeRef.current) {
        streamUnsubscribeRef.current();
      }
    };
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setUpdates([]);
    setSelectedIds([]);
    setStatusMessage('Checking Microsoft Winget repository for available package upgrades...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('scan-software-updates');
        if (res.success && res.stdout) {
          const list = JSON.parse(res.stdout.trim());
          setUpdates(list);
          setStatusMessage(`Scan completed. Found ${list.length} packages with pending updates.`);
        } else {
          setStatusMessage('No upgrades available or winget configuration error.');
        }
      } else {
        // Mock data
        setTimeout(() => {
          const mock = [
            { Name: 'Google Chrome', Id: 'Google.Chrome', CurrentVersion: '114.0.5735.110', AvailableVersion: '114.0.5735.134', Source: 'winget' },
            { Name: 'Visual Studio Code', Id: 'Microsoft.VisualStudioCode', CurrentVersion: '1.78.2', AvailableVersion: '1.79.0', Source: 'winget' },
            { Name: 'Git for Windows', Id: 'Git.Git', CurrentVersion: '2.40.1', AvailableVersion: '2.41.0', Source: 'winget' },
            { Name: 'VLC Media Player', Id: 'VideoLAN.VLC', CurrentVersion: '3.0.18', AvailableVersion: '3.0.20', Source: 'winget' },
          ];
          setUpdates(mock);
          setScanning(false);
          setStatusMessage('Scan completed (Mock environment).');
        }, 1500);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('Error scanning updates: ' + e.message);
    } finally {
      if (window.api) setScanning(false);
    }
  };

  const handleCheckboxChange = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === updates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(updates.map(u => u.Id));
    }
  };

  const handleUpdateSelected = async () => {
    if (selectedIds.length === 0) return;
    
    setUpdating(true);
    setTerminalLogs(['[SYSTEM] Starting automated silent software installations...', '']);
    
    try {
      for (const id of selectedIds) {
        setTerminalLogs(prev => [...prev, `[SYSTEM] Upgrading package: ${id}...`]);
        setPackageStatuses(prev => ({ ...prev, [id]: 'updating' }));
        
        if (window.api) {
          const res = await window.api.runSystemCommand('update-software', [id]);
          if (res.success) {
            setTerminalLogs(prev => [...prev, `[SYSTEM] Successfully upgraded package: ${id}`, '']);
            setPackageStatuses(prev => ({ ...prev, [id]: 'success' }));
          } else {
            setTerminalLogs(prev => [...prev, `[ERROR] Package upgrade failed: ${id}`, '']);
            setPackageStatuses(prev => ({ ...prev, [id]: 'failed' }));
            if (res.stdout && res.stdout.includes('-2147012851')) {
              setHasNetworkError(true);
            }
          }
        } else {
          // Mock update delay
          await new Promise(r => setTimeout(r, 1500));
          setTerminalLogs(prev => [...prev, `[SYSTEM] (Mock) Successfully upgraded: ${id}`, '']);
          setPackageStatuses(prev => ({ ...prev, [id]: 'success' }));
        }
      }
      setSelectedIds([]);
      setStatusMessage('Upgrades execution finished.');
    } catch (err) {
      setTerminalLogs(prev => [...prev, `[ERROR] Error: ${err.message}`]);
    } finally {
      setUpdating(false);
    }
  };

  const handleRepairWingetNetwork = async () => {
    setUpdating(true);
    setTerminalLogs(prev => [...prev, '[SYSTEM] Starting network and Winget source repair...', '']);
    try {
      if (window.api) {
        setTerminalLogs(prev => [...prev, '[SYSTEM] Resetting Winget sources to default...']);
        await window.api.runSystemCommand('winget-source-reset');
        
        setTerminalLogs(prev => [...prev, '[SYSTEM] Flushing Windows DNS Cache...']);
        await window.api.runSystemCommand('flush-dns');
        
        setTerminalLogs(prev => [...prev, '[SYSTEM] Network and Winget sources successfully repaired!', '']);
        setHasNetworkError(false);
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setTerminalLogs(prev => [...prev, '[SYSTEM] (Mock) Successfully completed repair.', '']);
        setHasNetworkError(false);
      }
    } catch (e) {
      setTerminalLogs(prev => [...prev, `[ERROR] Repair failed: ${e.message}`, '']);
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    if (window.api) {
      await window.api.killActiveProcess();
      setTerminalLogs(prev => [...prev, '', '[SYSTEM] Execution aborted by user.']);
      setUpdating(false);
    }
  };

  const getPackageStatusBadge = (id) => {
    const status = packageStatuses[id];
    switch (status) {
      case 'updating':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-violet bg-brand-violet/10 border border-brand-violet/20 rounded animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" /> Updating...
          </span>
        );
      case 'success':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-success bg-emerald-500/10 border border-emerald-500/20 rounded">
            <CheckCircle2 className="h-3 w-3" /> Completed
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-danger bg-rose-500/10 border border-rose-500/20 rounded">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-slate-400 bg-slate-500/10 border border-slate-500/20 rounded">
            Ready
          </span>
        );
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Title section */}
      <section className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left">
        <div className="flex flex-wrap items-center gap-3.5">
          <div>
            <h2 className="text-xl font-bold text-slate-200">Software Updater (Winget)</h2>
            <p className="text-xs text-slate-400">Silently keep your system applications and libraries up-to-date</p>
          </div>
          {/* DNS Status Badge */}
          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1.5 select-none ${
            dnsStatus === 'Original' ? 'bg-emerald-950/40 border-emerald-500/20 text-brand-success' :
            dnsStatus === 'Temporary (Google)' ? 'bg-amber-950/40 border-amber-500/20 text-amber-400 animate-pulse' :
            'bg-blue-950/40 border-blue-500/20 text-blue-400'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              dnsStatus === 'Original' ? 'bg-brand-success' :
              dnsStatus === 'Temporary (Google)' ? 'bg-amber-400' :
              'bg-brand-cyan animate-ping'
            }`}></span>
            DNS: {dnsStatus}
          </span>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={handleScan}
            disabled={scanning || updating}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:bg-brand-violet/30 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Check Upgrades'}
          </button>

          <button 
            onClick={handleUpdateSelected}
            disabled={updating || scanning || selectedIds.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150"
          >
            <Download className="h-4 w-4" />
            Update Selected ({selectedIds.length})
          </button>
        </div>
      </section>

      {hasNetworkError && (
        <section className="glass-panel border border-brand-danger/30 bg-rose-950/15 rounded-xl px-5 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-xs text-left">

          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-brand-danger shrink-0 animate-pulse" />
            <div>
              <p className="text-rose-400 font-bold">Winget Network Connection Error</p>
              <p className="text-slate-400 mt-0.5 font-medium">Your DNS server cannot resolve Microsoft Winget CDNs. Click below to reset your Winget sources database and flush the Windows DNS cache.</p>
            </div>
          </div>
          <button
            onClick={handleRepairWingetNetwork}
            disabled={updating}
            className="px-4 py-2 bg-rose-950/60 hover:bg-rose-900/40 text-brand-danger border border-brand-danger/30 font-bold rounded-lg cursor-pointer transition-all duration-150 shrink-0 self-start sm:self-auto"
          >
            {updating ? 'Repairing...' : '🔧 Repair Winget Network'}
          </button>
        </section>
      )}

      {/* Settings Grid Panel */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Table of updates */}
        <div className="md:col-span-2 space-y-4">
          <div className="glass-panel border border-brand-border rounded-xl px-4 py-3 flex items-center justify-between bg-slate-900/60 text-xs">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-brand-cyan shrink-0 animate-bounce" />
              <p className="text-slate-300 font-semibold">{statusMessage}</p>
            </div>
          </div>

          <div className="glass-panel border border-brand-border rounded-2xl overflow-hidden flex flex-col">
            <div className="bg-slate-950/40 px-6 py-3 border-b border-brand-border flex justify-between items-center select-none text-xs">
              <span className="font-bold text-slate-300 uppercase">Available Upgrades</span>
              {updates.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="px-2 py-0.5 border border-brand-border hover:border-brand-violet text-slate-400 hover:text-white rounded text-[10px] font-bold"
                >
                  {selectedIds.length === updates.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {scanning ? (
                <div className="py-24 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="h-9 w-9 animate-spin text-brand-violet" />
                  <p className="text-xs text-slate-400 font-semibold">Running winget upgrades search...</p>
                </div>
              ) : updates.length === 0 ? (
                <div className="py-20 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-xs text-slate-400 font-medium">All applications are currently up-to-date.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/20 text-slate-400 font-bold border-b border-brand-border uppercase">
                      <th className="px-6 py-3.5 w-[50px]">Select</th>
                      <th className="px-6 py-3.5">App Name</th>
                      <th className="px-6 py-3.5">Package ID</th>
                      <th className="px-6 py-3.5">Installed</th>
                      <th className="px-6 py-3.5">Available</th>
                      <th className="px-6 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {updates.map((item, i) => {
                      const isChecked = selectedIds.includes(item.Id);
                      return (
                        <tr 
                          key={i} 
                          onClick={() => handleCheckboxChange(item.Id)}
                          className="hover:bg-slate-800/20 cursor-pointer transition-colors duration-150"
                        >
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleCheckboxChange(item.Id)}
                              className="h-4 w-4 rounded border-brand-border bg-slate-900 accent-brand-violet"
                            />
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-200">{item.Name}</td>
                          <td className="px-6 py-4 text-slate-400 font-mono">{item.Id}</td>
                          <td className="px-6 py-4 text-rose-400 font-semibold">{item.CurrentVersion}</td>
                          <td className="px-6 py-4 text-emerald-400 font-semibold">{item.AvailableVersion}</td>
                          <td className="px-6 py-4">{getPackageStatusBadge(item.Id)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Auto-update Scheduler toggle */}
          <div className="glass-panel border border-brand-border rounded-xl p-5 flex items-center justify-between bg-slate-900/40">
            <div className="flex gap-4 items-center">
              <div className="bg-slate-800/50 p-3 rounded-lg border border-brand-border">
                <Settings2 className="h-5 w-5 text-brand-violet" />
              </div>
              <div className="text-left">
                <h4 className="text-xs font-bold text-slate-200 uppercase">Background Auto-Update Policy</h4>
                <p className="text-[11px] text-slate-400 mt-1">Let Solas run silent upgrades weekly without opening the interface</p>
              </div>
            </div>
            <button
              onClick={() => setAutoUpdateEnabled(!autoUpdateEnabled)}
              className={`w-14 h-7 rounded-full p-1 transition-all duration-300 cursor-pointer ${
                autoUpdateEnabled ? 'bg-emerald-600' : 'bg-slate-800'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all duration-300 ${
                autoUpdateEnabled ? 'translate-x-7' : 'translate-x-0'
              }`}></div>
            </button>
          </div>
        </div>

        {/* Right Side: Terminal log */}
        <div className="glass-panel border border-brand-border rounded-2xl p-5 flex flex-col h-[550px] justify-between">
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-brand-cyan shrink-0" />
                <h3 className="text-sm font-bold text-slate-200">Terminal Output</h3>
              </div>
              
              {updating && (
                <button
                  onClick={handleCancel}
                  className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 text-[10px] font-bold text-brand-danger rounded border border-brand-danger/30 flex items-center gap-1 cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" /> Stop Install
                </button>
              )}
            </div>

            {/* Simulated Black Box Console */}
            <div className="flex-1 bg-slate-950/80 border border-brand-border rounded-xl p-4 font-mono text-[10px] text-emerald-400 overflow-y-auto leading-relaxed select-text shadow-inner">
              {terminalLogs.length === 0 ? (
                <p className="text-slate-500 font-bold italic">Console idle. Trigger updates to stream installation logs...</p>
              ) : (
                terminalLogs.map((log, index) => (
                  <p key={index} className={log.startsWith('[ERROR]') ? 'text-brand-danger' : log.startsWith('[SYSTEM]') ? 'text-brand-cyan' : ''}>
                    {log}
                  </p>
                ))
              )}
              <div ref={terminalEndRef}></div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
