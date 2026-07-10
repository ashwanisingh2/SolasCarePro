import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw, XCircle, 
  Settings2, Download, AppWindow, Laptop, CheckCircle2
} from 'lucide-react';
import CommandOutput from './shared/CommandOutput';

function safeJsonParse(str, fallback = []) {
  if (!str) return fallback;
  try {
    const startObj = str.indexOf('{');
    const startArr = str.indexOf('[');
    let startIndex = -1;
    let endIndex = -1;
    
    if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
      startIndex = startObj;
      endIndex = str.lastIndexOf('}');
    } else if (startArr !== -1) {
      startIndex = startArr;
      endIndex = str.lastIndexOf(']');
    }
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const jsonStr = str.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonStr);
    }
    
    return JSON.parse(str.trim());
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error('Failed to parse JSON:', e, 'Raw string:', str);
    }
    return fallback;
  }
}

export default function SoftwareUpdater() {
  const [subMode, setSubMode] = useState('apps'); // 'apps' or 'windows'
  const [updates, setUpdates] = useState([]);
  const [winUpdates, setWinUpdates] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedWinIds, setSelectedWinIds] = useState([]);
  const [statusMessage, setStatusMessage] = useState('Verify software upgrades through Winget package manager.');
  
  // DNS Status Pill State
  const [dnsStatus, setDnsStatus] = useState('Original');
  
  // Package Update status map
  const [packageStatuses, setPackageStatuses] = useState({});
  const [winUpdateStatuses, setWinUpdateStatuses] = useState({});
  const [hasNetworkError, setHasNetworkError] = useState(false);
  
  // Terminal log properties
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalEndRef = useRef(null);
  
  // Auto-update switch
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);

  const addLogs = (message) => {
    const time = new Date().toLocaleTimeString(undefined, { hour12: false });
    setTerminalLogs(prev => [...prev, `[${time}] ${message}`]);
  };

  useEffect(() => {
    const checkDns = async () => {
      if (window.api && window.api.getDnsStatus) {
        const res = await window.api.getDnsStatus();
        setDnsStatus(typeof res === 'string' ? res : (res?.status || 'Original'));
      }
    };
    checkDns();
    const interval = setInterval(checkDns, 10000); // Check DNS every 10 seconds (reduced from 2s)
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Scroll terminal to bottom
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  useEffect(() => {
    let unsubWinget = null;
    let unsubCare = null;

    // Listen to real-time stdout logs from main process
    if (window.api && window.api.onStream) {
      unsubWinget = window.api.onStream('winget-out', (data) => {
        try {
          if (typeof data === 'string') {
            const time = new Date().toLocaleTimeString(undefined, { hour12: false });
            const lines = data.split('\n').filter(Boolean).map(line => `[${time}] ${line}`);
            setTerminalLogs(prev => [...prev, ...lines]);
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error('Error handling winget-out stream:', e);
          }
        }
      });

      unsubCare = window.api.onStream('care-out', (data) => {
        try {
          if (typeof data === 'string') {
            const time = new Date().toLocaleTimeString(undefined, { hour12: false });
            const lines = data.split('\n').filter(Boolean).map(line => `[${time}] ${line}`);
            setTerminalLogs(prev => [...prev, ...lines]);
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error('Error handling care-out stream:', e);
          }
        }
      });
    }

    return () => {
      if (unsubWinget) unsubWinget();
      if (unsubCare) unsubCare();
    };
  }, []);

  const handleScan = async () => {
    setScanning(true);
    if (subMode === 'apps') {
      setUpdates([]);
      setSelectedIds([]);
      setStatusMessage('Checking Microsoft Winget repository for available package upgrades...');
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('scan-software-updates');
          if (res.success && res.stdout) {
            const list = safeJsonParse(res.stdout);
            setUpdates(list);
            setStatusMessage(`Scan completed. Found ${list.length} packages with pending updates.`);
          } else {
            setStatusMessage('No upgrades available or winget configuration error.');
          }
        } else {
          // Mock data
          await new Promise(r => setTimeout(r, 1500));
          const mock = [
            { Name: 'Google Chrome', Id: 'Google.Chrome', CurrentVersion: '114.0.5735.110', AvailableVersion: '114.0.5735.134', Source: 'winget' },
            { Name: 'Visual Studio Code', Id: 'Microsoft.VisualStudioCode', CurrentVersion: '1.78.2', AvailableVersion: '1.79.0', Source: 'winget' },
            { Name: 'Git for Windows', Id: 'Git.Git', CurrentVersion: '2.40.1', AvailableVersion: '2.41.0', Source: 'winget' },
            { Name: 'VLC Media Player', Id: 'VideoLAN.VLC', CurrentVersion: '3.0.18', AvailableVersion: '3.0.20', Source: 'winget' },
          ];
          setUpdates(mock);
          setStatusMessage('Scan completed (Mock environment).');
        }
      } catch (e) {
        console.error(e);
        setStatusMessage('Error scanning updates: ' + e.message);
      } finally {
        setScanning(false);
      }
    } else {
      setWinUpdates([]);
      setSelectedWinIds([]);
      setStatusMessage('Scanning Windows Update Service (WUA) for pending patches...');
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('check-windows-updates');
          if (res.success && res.stdout) {
            const list = safeJsonParse(res.stdout);
            setWinUpdates(list);
            setStatusMessage(`Scan completed. Found ${list.length} pending Windows Updates.`);
          } else {
            setStatusMessage('No pending Windows updates found.');
          }
        } else {
          // Mock data
          await new Promise(r => setTimeout(r, 1500));
          const mock = [
            { Title: 'Security Intelligence Update for Microsoft Defender Antivirus - KB2267602', Description: 'Essential anti-malware definition updates', KBArticleIDs: 'KB2267602', Severity: 'Critical', Categories: 'Definition Updates' },
            { Title: '2026-06 Cumulative Update for Windows 11 Version 23H2 for x64-based Systems - KB5039212', Description: 'Security and reliability fixes for Windows shell and kernel', KBArticleIDs: 'KB5039212', Severity: 'Important', Categories: 'Security Updates' },
          ];
          setWinUpdates(mock);
          setStatusMessage('Scan completed (Mock environment).');
        }
      } catch (e) {
        console.error(e);
        setStatusMessage('Error checking Windows updates: ' + e.message);
      } finally {
        setScanning(false);
      }
    }
  };

  const handleCheckboxChange = (id) => {
    if (subMode === 'apps') {
      setSelectedIds(prev => 
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    } else {
      setSelectedWinIds(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    }
  };

  const handleSelectAll = () => {
    if (subMode === 'apps') {
      if (selectedIds.length === updates.length) {
        setSelectedIds([]);
      } else {
        setSelectedIds(updates.map(u => u.Id));
      }
    } else {
      if (selectedWinIds.length === winUpdates.length) {
        setSelectedWinIds([]);
      } else {
        setSelectedWinIds(winUpdates.map((u, index) => u.KBArticleIDs || `idx-${index}`));
      }
    }
  };

  const handleUpdateSelected = async () => {
    if (subMode === 'apps') {
      if (selectedIds.length === 0) return;
      setUpdating(true);
      setTerminalLogs([]);
      addLogs('[SYSTEM] Starting automated silent software installations...');
      
      try {
        for (const id of selectedIds) {
          addLogs(`[SYSTEM] Upgrading package: ${id}...`);
          setPackageStatuses(prev => ({ ...prev, [id]: 'updating' }));
          
          if (window.api) {
            const res = await window.api.runSystemCommand('update-software', [id]);
            if (res.success) {
              addLogs(`[SYSTEM] Successfully upgraded package: ${id}`);
              setPackageStatuses(prev => ({ ...prev, [id]: 'success' }));
            } else {
              addLogs(`[ERROR] Package upgrade failed: ${id}`);
              setPackageStatuses(prev => ({ ...prev, [id]: 'failed' }));
              if (res.stdout && res.stdout.includes('-2147012851')) {
                setHasNetworkError(true);
              }
            }
          } else {
            await new Promise(r => setTimeout(r, 1500));
            addLogs(`[SYSTEM] (Mock) Successfully upgraded: ${id}`);
            setPackageStatuses(prev => ({ ...prev, [id]: 'success' }));
          }
        }
        setSelectedIds([]);
        setStatusMessage('Upgrades execution finished.');
      } catch (err) {
        addLogs(`[ERROR] Error: ${err.message}`);
      } finally {
        setUpdating(false);
      }
    } else {
      if (selectedWinIds.length === 0) return;
      setUpdating(true);
      setTerminalLogs([]);
      addLogs('[SYSTEM] Initializing Windows Update session...');

      try {
        addLogs('[SYSTEM] Downloading and installing pending Windows updates...');
        winUpdates.forEach(u => {
          const id = u.KBArticleIDs;
          if (selectedWinIds.includes(id)) {
            setWinUpdateStatuses(prev => ({ ...prev, [id]: 'updating' }));
          }
        });

        if (window.api) {
          const res = await window.api.runSystemCommand('install-windows-updates');
          if (res.success) {
            addLogs('[SYSTEM] Windows Update cycle executed successfully. Please review status logs.');
            winUpdates.forEach(u => {
              const id = u.KBArticleIDs;
              if (selectedWinIds.includes(id)) {
                setWinUpdateStatuses(prev => ({ ...prev, [id]: 'success' }));
              }
            });
          } else {
            addLogs(`[ERROR] Windows Update installation failed: ${res.error || res.stderr}`);
            winUpdates.forEach(u => {
              const id = u.KBArticleIDs;
              if (selectedWinIds.includes(id)) {
                setWinUpdateStatuses(prev => ({ ...prev, [id]: 'failed' }));
              }
            });
          }
        } else {
          await new Promise(r => setTimeout(r, 3000));
          addLogs('[SYSTEM] (Mock) Windows Updates successfully installed.');
          winUpdates.forEach(u => {
            const id = u.KBArticleIDs;
            if (selectedWinIds.includes(id)) {
              setWinUpdateStatuses(prev => ({ ...prev, [id]: 'success' }));
            }
          });
        }
        setSelectedWinIds([]);
        setStatusMessage('Windows Updates installation cycle finished.');
      } catch (err) {
        addLogs(`[ERROR] Error installing Windows updates: ${err.message}`);
      } finally {
        setUpdating(false);
      }
    }
  };

  const handleRepairWingetNetwork = async () => {
    setUpdating(true);
    addLogs('[SYSTEM] Starting network and Winget source repair...');
    try {
      if (window.api) {
        addLogs('[SYSTEM] Resetting Winget sources to default...');
        await window.api.runSystemCommand('winget-source-reset');
        
        addLogs('[SYSTEM] Flushing Windows DNS Cache...');
        await window.api.runSystemCommand('flush-dns');
        
        addLogs('[SYSTEM] Network and Winget sources successfully repaired!');
        setHasNetworkError(false);
      } else {
        await new Promise(r => setTimeout(r, 1500));
        addLogs('[SYSTEM] (Mock) Successfully completed repair.');
        setHasNetworkError(false);
      }
    } catch (e) {
      addLogs(`[ERROR] Repair failed: ${e.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    if (window.api) {
      await window.api.killActiveProcess();
      addLogs('[SYSTEM] Execution aborted by user.');
      setUpdating(false);
    }
  };

  const getPackageStatusBadge = (id) => {
    const status = subMode === 'apps' ? packageStatuses[id] : winUpdateStatuses[id];
    switch (status) {
      case 'updating':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-violet bg-brand-violet/10 border border-brand-violet/20 rounded animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" /> Working...
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

  const currentSelectionCount = subMode === 'apps' ? selectedIds.length : selectedWinIds.length;
  const currentUpdatesList = subMode === 'apps' ? updates : winUpdates;

  return (
    <div className="p-6 space-y-6">
      {/* Title section */}
      <section className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left">
        <div className="flex flex-wrap items-center gap-3.5">
          <div>
            <h2 className="text-xl font-bold text-slate-200">System & Software Updater</h2>
            <p className="text-xs text-slate-400">Keep application packages and Windows system patches up-to-date</p>
          </div>
          {/* DNS Status Badge */}
          <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border flex items-center gap-1.5 select-none ${
            (typeof dnsStatus === 'object' ? dnsStatus?.status : dnsStatus) === 'Original' ? 'bg-emerald-950/40 border-emerald-500/20 text-brand-success' :
            (typeof dnsStatus === 'object' ? dnsStatus?.status : dnsStatus) === 'Temporary (Google)' ? 'bg-amber-950/40 border-amber-500/20 text-amber-400 animate-pulse' :
            'bg-blue-950/40 border-blue-500/20 text-blue-400'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              (typeof dnsStatus === 'object' ? dnsStatus?.status : dnsStatus) === 'Original' ? 'bg-brand-success' :
              (typeof dnsStatus === 'object' ? dnsStatus?.status : dnsStatus) === 'Temporary (Google)' ? 'bg-amber-400' :
              'bg-brand-cyan animate-ping'
            }`}></span>
            DNS: {typeof dnsStatus === 'object' ? (dnsStatus?.status || 'Original') : dnsStatus}
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
            disabled={updating || scanning || currentSelectionCount === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150"
          >
            <Download className="h-4 w-4" />
            Update Selected ({currentSelectionCount})
          </button>
        </div>
      </section>

      {/* Segmented Mode Selector */}
      <div className="flex bg-slate-950/40 border border-brand-border rounded-xl p-1 select-none w-max">
        <button
          onClick={() => { if (!scanning && !updating) { setSubMode('apps'); setUpdates([]); setSelectedIds([]); setStatusMessage('Verify software upgrades through Winget package manager.'); } }}
          disabled={scanning || updating}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            subMode === 'apps' ? 'bg-brand-violet/20 border border-brand-violet/30 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <AppWindow className="h-4 w-4" />
          Application Upgrades (Winget)
        </button>
        <button
          onClick={() => { if (!scanning && !updating) { setSubMode('windows'); setWinUpdates([]); setSelectedWinIds([]); setStatusMessage('Scan Windows Update Service (WUA) for pending patches.'); } }}
          disabled={scanning || updating}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            subMode === 'windows' ? 'bg-brand-violet/20 border border-brand-violet/30 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Laptop className="h-4 w-4" />
          Windows System Updates (KB)
        </button>
      </div>

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
              <span className="font-bold text-slate-300 uppercase">
                {subMode === 'apps' ? 'Available App Upgrades' : 'Available System Patches'}
              </span>
              {currentUpdatesList.length > 0 && (
                <button
                  onClick={handleSelectAll}
                  className="px-2 py-0.5 border border-brand-border hover:border-brand-violet text-slate-400 hover:text-white rounded text-[10px] font-bold cursor-pointer"
                >
                  {currentSelectionCount === currentUpdatesList.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {scanning ? (
                <div className="py-24 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="h-9 w-9 animate-spin text-brand-violet" />
                  <p className="text-xs text-slate-400 font-semibold">
                    {subMode === 'apps' ? 'Running winget upgrades search...' : 'Querying Windows Update API...'}
                  </p>
                </div>
              ) : currentUpdatesList.length === 0 ? (
                <div className="py-20 text-center select-none">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                  <p className="text-xs text-slate-400 font-medium">All items are currently up-to-date.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/20 text-slate-400 font-bold border-b border-brand-border uppercase select-none">
                      <th className="px-6 py-3.5 w-[50px]">Select</th>
                      <th className="px-6 py-3.5">
                        {subMode === 'apps' ? 'App Name' : 'Patch Title'}
                      </th>
                      <th className="px-6 py-3.5">
                        {subMode === 'apps' ? 'Package ID' : 'KB ID'}
                      </th>
                      <th className="px-6 py-3.5">
                        {subMode === 'apps' ? 'Installed' : 'Category'}
                      </th>
                      <th className="px-6 py-3.5">
                        {subMode === 'apps' ? 'Available' : 'Severity'}
                      </th>
                      <th className="px-6 py-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {subMode === 'apps' ? (
                      updates.map((item, i) => {
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
                                className="h-4 w-4 rounded border-brand-border bg-slate-900 accent-brand-violet cursor-pointer"
                              />
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-200">{item.Name}</td>
                            <td className="px-6 py-4 text-slate-400 font-mono">{item.Id}</td>
                            <td className="px-6 py-4 text-rose-400 font-semibold">{item.CurrentVersion}</td>
                            <td className="px-6 py-4 text-emerald-400 font-semibold">{item.AvailableVersion}</td>
                            <td className="px-6 py-4">{getPackageStatusBadge(item.Id)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      winUpdates.map((item, i) => {
                        const id = item.KBArticleIDs || `idx-${i}`;
                        const isChecked = selectedWinIds.includes(id);
                        return (
                          <tr 
                            key={i} 
                            onClick={() => handleCheckboxChange(id)}
                            className="hover:bg-slate-800/20 cursor-pointer transition-colors duration-150"
                          >
                            <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleCheckboxChange(id)}
                                className="h-4 w-4 rounded border-brand-border bg-slate-900 accent-brand-violet cursor-pointer"
                              />
                            </td>
                            <td className="px-6 py-4 font-semibold text-slate-200 leading-normal max-w-xs">{item.Title}</td>
                            <td className="px-6 py-4 text-slate-400 font-mono">{item.KBArticleIDs || 'N/A'}</td>
                            <td className="px-6 py-4 text-slate-300 font-medium">{item.Categories || 'Update'}</td>
                            <td className="px-6 py-4 font-semibold text-amber-400">{item.Severity || 'Normal'}</td>
                            <td className="px-6 py-4">{getPackageStatusBadge(id)}</td>
                          </tr>
                        );
                      })
                    )}
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
              <div className="text-left select-none">
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
        <CommandOutput
          logs={terminalLogs}
          onClear={() => setTerminalLogs([])}
          title="Terminal Output"
          isRunning={updating}
          onCancel={handleCancel}
        />
      </section>
    </div>
  );
}
