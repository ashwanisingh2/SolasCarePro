import React, { useState, useEffect } from 'react';
import { 
  Search, Cpu, ArrowUpCircle, RefreshCw, CheckCircle, 
  AlertTriangle, FileText, Ban, Power, Check, ShieldAlert, ShieldCheck
} from 'lucide-react';
import CommandOutput from './shared/CommandOutput';

export default function DriverManager() {
  const [drivers, setDrivers] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // { id, action }
  const [statusMessage, setStatusMessage] = useState('Run a scan to diagnose system drivers.');
  const [filter, setFilter] = useState('all'); // all, problem
  const [searchQuery, setSearchQuery] = useState('');
  
  // Safe Mode & Backups states
  const [safeMode, setSafeMode] = useState(true);
  const [backupsExist, setBackupsExist] = useState({});

  const checkBackups = async (list) => {
    if (!window.api || !window.api.checkDriverBackup) return;
    const results = {};
    for (const d of list) {
      if (d.PnpDeviceId) {
        results[d.PnpDeviceId] = await window.api.checkDriverBackup(d.PnpDeviceId);
      }
    }
    setBackupsExist(results);
  };

  useEffect(() => {
    if (drivers.length > 0) {
      checkBackups(drivers);
    }
  }, [drivers]);

  const handleScan = async () => {
    setScanning(true);
    setStatusMessage('Scanning system signed drivers & plug-and-play entities...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('scan-drivers');
        if (res.success && res.stdout) {
          const list = JSON.parse(res.stdout.trim());
          setDrivers(list);
          const issueCount = list.filter(d => d.Status !== 'OK').length;
          setStatusMessage(`Scan completed. Found ${list.length} devices (${issueCount} warnings/errors).`);
        } else {
          setStatusMessage('Failed to scan drivers. WMI service error.');
        }
      } else {
        // Mock data for web browser environment
        setTimeout(() => {
          const mock = [
            { DeviceName: 'Intel(R) UHD Graphics 630', Vendor: 'Intel', Provider: 'Intel', Version: '30.0.101.1191', Status: 'OK', HardwareId: 'PCI\\VEN_8086&DEV_3E9B', PnpDeviceId: 'PCI\\1', Date: '2023-11-12', IsSigned: true },
            { DeviceName: 'Realtek Audio Driver', Vendor: 'Realtek', Provider: 'Realtek', Version: '6.0.9285.1', Status: 'OK', HardwareId: 'HDAUDIO\\FUNC_01', PnpDeviceId: 'HDAUDIO\\1', Date: '2023-08-10', IsSigned: true },
            { DeviceName: 'Qualcomm Wireless Network Adapter', Vendor: 'Qualcomm', Provider: 'Qualcomm', Version: '12.0.0.1118', Status: 'Warning', HardwareId: 'PCI\\VEN_168C', PnpDeviceId: 'PCI\\2', Date: '2021-04-05', IsSigned: false },
            { DeviceName: 'USB Controller Hub', Vendor: 'Unknown', Provider: 'N/A', Version: 'N/A', Status: 'Missing', HardwareId: 'USB\\VID_0000', PnpDeviceId: 'USB\\1', Date: 'Unknown', IsSigned: false },
          ];
          setDrivers(mock);
          setScanning(false);
          setStatusMessage('Scan completed (Mock environment).');
        }, 1500);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage('Scanning failed: ' + err.message);
    } finally {
      if (window.api) setScanning(false);
    }
  };

  const executeAction = async (driver, actionType, skipScan = false) => {
    setActiveAction({ id: driver.PnpDeviceId, action: actionType });
    setStatusMessage(`Running ${actionType} on device: ${driver.DeviceName}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('driver-action', [
          driver.PnpDeviceId,
          actionType,
          safeMode
        ]);
        
        if (res.success) {
          setStatusMessage(`Successfully executed ${actionType} on ${driver.DeviceName}`);
          if (!skipScan) {
            await handleScan();
          }
        } else {
          setStatusMessage(`Action failed: ${res.stderr || 'Execution Error'}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setStatusMessage(`Mock action ${actionType} completed successfully on ${driver.DeviceName}`);
        if (!skipScan) {
          setDrivers(prev => prev.map(d => d.PnpDeviceId === driver.PnpDeviceId ? { ...d, Status: actionType === 'update' || actionType === 'enable' || actionType === 'restore' ? 'OK' : 'Disabled' } : d));
        }
      }
    } catch (err) {
      console.error(err);
      setStatusMessage(`Error executing ${actionType}: ` + err.message);
    } finally {
      if (window.api) setActiveAction(null);
    }
  };

  const handleUpdateAll = async () => {
    const problemDrivers = drivers.filter(d => d.Status !== 'OK');
    if (problemDrivers.length === 0) {
      setStatusMessage('All drivers are healthy. No updates required.');
      return;
    }

    setStatusMessage(`Updating ${problemDrivers.length} outdated/problem drivers...`);
    for (const d of problemDrivers) {
      await executeAction(d, 'update', true);
    }
    await handleScan();
  };

  const handleExport = async () => {
    try {
      const csvContent = "data:text/csv;charset=utf-8," 
        + ["DeviceName,Vendor,Version,Status,HardwareId"].join(",") + "\n"
        + drivers.map(d => `"${d.DeviceName}","${d.Vendor}","${d.Version}","${d.Status}","${d.HardwareId}"`).join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "solas_driver_inventory.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMessage("Successfully exported driver inventory list as CSV.");
    } catch (e) {
      setStatusMessage("Failed to export driver list.");
    }
  };

  const getStatusBadge = (status, isOperating, activeActionType) => {
    if (isOperating) {
      const label = activeActionType === 'update' ? 'Updating...' : activeActionType === 'enable' ? 'Enabling...' : activeActionType === 'disable' ? 'Disabling...' : 'Working...';
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-violet bg-brand-violet/10 border border-brand-violet/20 rounded animate-pulse">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {label}
        </span>
      );
    }
    
    // Status colors: Green (OK), Yellow (Disabled, Warning), Red (Missing, Corrupted, Error)
    switch (status) {
      case 'OK':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-success bg-emerald-500/10 border border-emerald-500/20 rounded">
            <Check className="h-3 w-3" /> Healthy
          </span>
        );
      case 'Warning':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-warning bg-amber-500/10 border border-amber-500/20 rounded">
            <AlertTriangle className="h-3 w-3" /> Warning
          </span>
        );
      case 'Disabled':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded">
            <Power className="h-3 w-3" /> Disabled
          </span>
        );
      case 'Missing':
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-danger bg-rose-500/10 border border-rose-500/20 rounded animate-pulse">
            <AlertTriangle className="h-3 w-3" /> Missing
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-bold text-brand-danger bg-rose-500/10 border border-rose-500/20 rounded">
            <AlertTriangle className="h-3 w-3" /> Error
          </span>
        );
    }
  };

  const totalCount = drivers.length;
  const healthyCount = drivers.filter(d => d.Status === 'OK').length;
  const warningCount = drivers.filter(d => d.Status === 'Warning' || d.Status === 'Disabled').length;
  const criticalCount = drivers.filter(d => d.Status !== 'OK' && d.Status !== 'Warning' && d.Status !== 'Disabled').length;

  const filteredDrivers = drivers.filter(d => {
    const matchesFilter = filter === 'all' || (filter === 'problem' && d.Status !== 'OK');
    const matchesSearch = searchQuery === '' || 
      d.DeviceName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      d.Vendor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.HardwareId && d.HardwareId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.PnpDeviceId && d.PnpDeviceId.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Module Title */}
      <section className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Device Driver Manager</h2>
          <p className="text-xs text-slate-400">Scan and repair system peripheral drivers and hardware status</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Safe Mode Toggle */}
          <div className="flex items-center gap-2 bg-slate-900 border border-brand-border px-3.5 py-1.5 rounded-lg select-none">
            {safeMode ? <ShieldCheck className="h-4 w-4 text-brand-success" /> : <ShieldAlert className="h-4 w-4 text-brand-warning animate-pulse" />}
            <span className="text-[10px] font-bold text-slate-300 uppercase">Registry Safe Mode</span>
            <button
              onClick={() => setSafeMode(!safeMode)}
              className={`w-10 h-5.5 rounded-full p-0.5 transition-all duration-300 cursor-pointer ${
                safeMode ? 'bg-brand-success' : 'bg-slate-700'
              }`}
            >
              <div className={`w-4.5 h-4.5 rounded-full bg-slate-950 shadow-md transform transition-all duration-300 ${
                safeMode ? 'translate-x-4.5' : 'translate-x-0'
              }`}></div>
            </button>
          </div>

          <button 
            onClick={handleScan}
            disabled={scanning || activeAction}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:bg-brand-violet/30 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150"
          >
            <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan Drivers'}
          </button>

          <button 
            onClick={handleUpdateAll}
            disabled={scanning || activeAction || drivers.length === 0}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/30 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Update All
          </button>

          <button 
            onClick={handleExport}
            disabled={drivers.length === 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/30 text-xs font-bold rounded-lg flex items-center gap-2 border border-brand-border text-slate-300 cursor-pointer transition-all duration-150"
          >
            <FileText className="h-4 w-4" />
            Export Inventory
          </button>
        </div>
      </section>

      {/* Dynamic Status Notification */}
      <section className="glass-panel border border-brand-border rounded-xl px-4 py-3 flex items-center gap-3 bg-slate-900/60 text-left">
        <Cpu className="h-5 w-5 text-brand-cyan shrink-0" />
        <p className="text-xs text-slate-300 font-semibold">{statusMessage}</p>
      </section>

      {/* Hardware Statistics Summary Dashboard */}
      {drivers.length > 0 && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-panel border border-brand-border/60 bg-slate-900/30 p-4 rounded-xl text-left">
            <span className="text-[10px] text-slate-500 font-bold uppercase block select-none">Total Controllers</span>
            <span className="text-xl font-black text-white mt-1 block">{totalCount} Devices</span>
          </div>
          <div className="glass-panel border border-emerald-500/20 bg-emerald-950/5 p-4 rounded-xl text-left">
            <span className="text-[10px] text-slate-500 font-bold uppercase block select-none">Healthy Drivers</span>
            <span className="text-xl font-black text-brand-success mt-1 block">{healthyCount} OK</span>
          </div>
          <div className="glass-panel border border-amber-500/20 bg-amber-950/5 p-4 rounded-xl text-left">
            <span className="text-[10px] text-slate-500 font-bold uppercase block select-none">Warnings / Disabled</span>
            <span className="text-xl font-black text-brand-warning mt-1 block">{warningCount} Warnings</span>
          </div>
          <div className="glass-panel border border-rose-500/20 bg-rose-950/5 p-4 rounded-xl text-left">
            <span className="text-[10px] text-slate-500 font-bold uppercase block select-none">Missing / Broken</span>
            <span className="text-xl font-black text-brand-danger mt-1 block">{criticalCount} Errors</span>
          </div>
        </section>
      )}

      {/* Main Grid Panel */}
      <section className="glass-panel border border-brand-border rounded-2xl overflow-hidden flex flex-col">
        {/* Table Filters Tab Header */}
        <div className="bg-slate-950/40 px-6 py-4 border-b border-brand-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none">
          <span className="text-xs font-bold text-slate-300 uppercase">Hardware Devices inventory</span>
          
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full sm:w-auto">
            {/* Filter Toggle */}
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-brand-border self-start">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-[11px] font-bold rounded ${filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                All ({totalCount})
              </button>
              <button
                onClick={() => setFilter('problem')}
                className={`px-3 py-1 text-[11px] font-bold rounded ${filter === 'problem' ? 'bg-slate-800 text-white border border-brand-violet/20' : 'text-slate-400 hover:text-white'}`}
              >
                Problems ({warningCount + criticalCount})
              </button>
            </div>

            {/* Search input */}
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search devices/vendors..."
                className="pl-9 pr-4 py-1.5 w-full sm:w-48 bg-slate-950/50 border border-brand-border/60 focus:border-brand-violet rounded-lg text-xs font-medium text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="overflow-x-auto">
          {scanning ? (
            <div className="py-24 flex flex-col items-center justify-center gap-4">
              <RefreshCw className="h-10 w-10 animate-spin text-brand-violet" />
              <p className="text-sm font-semibold text-slate-300">Searching Plug-and-Play (PnP) system hardware tables...</p>
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="py-24 text-center">
              <Cpu className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-medium">No devices found. Trigger a scan first.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/20 text-slate-400 font-bold border-b border-brand-border uppercase">
                  <th className="px-6 py-3.5">Device Name</th>
                  <th className="px-6 py-3.5">Manufacturer</th>
                  <th className="px-6 py-3.5">Version</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filteredDrivers.map((item, i) => {
                  const isOperating = activeAction && activeAction.id === item.PnpDeviceId;
                  const backupExists = backupsExist[item.PnpDeviceId] || false;
                  return (
                    <tr key={i} className="hover:bg-slate-800/20 transition-colors duration-150">
                      <td className="px-6 py-4 font-semibold text-slate-200">
                        <div className="max-w-[340px] truncate" title={item.DeviceName}>{item.DeviceName}</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[340px]">{item.PnpDeviceId}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-medium">{item.Vendor || 'Generic'}</td>
                      <td className="px-6 py-4 text-slate-300 font-semibold">{item.Version || 'N/A'}</td>
                      <td className="px-6 py-4">{getStatusBadge(item.Status, isOperating, activeAction?.action)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {item.Status !== 'OK' && (
                            <button
                              disabled={activeAction !== null}
                              onClick={() => executeAction(item, 'update')}
                              className="px-2.5 py-1 bg-brand-violet hover:bg-brand-violet/90 disabled:bg-brand-violet/30 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all duration-150"
                            >
                              <ArrowUpCircle className="h-3.5 w-3.5" /> 
                              {isOperating && activeAction.action === 'update' ? 'Installing...' : 'Update'}
                            </button>
                          )}
                          
                          <button
                            disabled={activeAction !== null}
                            onClick={() => executeAction(item, item.Status === 'Disabled' ? 'enable' : 'disable')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/30 text-[10px] font-bold rounded border border-brand-border text-slate-300 flex items-center gap-1 cursor-pointer transition-all duration-150"
                          >
                            {item.Status === 'Disabled' ? (
                              <>
                                <Power className="h-3.5 w-3.5 text-brand-success" /> Enable
                              </>
                            ) : (
                              <>
                                <Ban className="h-3.5 w-3.5 text-brand-danger" /> Disable
                              </>
                            )}
                          </button>

                          {backupExists && (
                            <button
                              disabled={activeAction !== null}
                              onClick={() => executeAction(item, 'restore')}
                              className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/30 text-brand-success text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer transition-all duration-150"
                              title="Restore device configuration from registry backup file"
                            >
                              Restore
                            </button>
                          )}
                          
                          <button
                            disabled={activeAction !== null}
                            onClick={() => executeAction(item, 'rollback')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/30 text-[10px] font-bold rounded border border-brand-border text-slate-300 flex items-center gap-1 cursor-pointer transition-all duration-150"
                          >
                            Rollback
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="mt-6">
        <CommandOutput
          channel="care-out"
          title="DriverManager System Console"
          isRunning={scanning || activeAction !== null}
          onCancel={window.api ? () => window.api.killActiveProcess() : null}
        />
      </div>
    </div>
  );
}
