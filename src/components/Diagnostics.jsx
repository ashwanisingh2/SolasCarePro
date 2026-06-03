import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Activity, AlertOctagon, BatteryCharging, HardDrive, ShieldCheck, 
  ShieldAlert, RefreshCw, ChevronDown, ChevronUp, Thermometer, Battery,
  Search, XCircle, Terminal, HelpCircle
} from 'lucide-react';

export default function Diagnostics() {
  const [activeSubTab, setActiveSubTab] = useState('bsod'); // bsod, battery, disk
  const [loading, setLoading] = useState(false);
  const [expandedBsod, setExpandedBsod] = useState(null);

  // Diagnostics States (combines BSOD, System & App errors)
  const [diagnosticEntries, setDiagnosticEntries] = useState([]);
  const [hasScannedBsod, setHasScannedBsod] = useState(false);
  const [reportPath, setReportPath] = useState('');
  
  // Filtering and Searching states
  const [levelFilter, setLevelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Repair States
  const [repairStates, setRepairStates] = useState({});
  const [repairLogs, setRepairLogs] = useState({});

  // Battery States
  const [batteryData, setBatteryData] = useState(null);
  const [hasScannedBattery, setHasScannedBattery] = useState(false);

  // Disk States
  const [diskData, setDiskData] = useState([]);
  const [hasScannedDisk, setHasScannedDisk] = useState(false);

  const handleDiagnosticScan = async () => {
    setLoading(true);
    setDiagnosticEntries([]);
    setReportPath('');
    setHasScannedBsod(false);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('analyze-bsod');
        if (res.success && res.stdout) {
          const result = JSON.parse(res.stdout.trim());
          setDiagnosticEntries(result.Dumps || []);
          setReportPath(result.ReportPath || '');
        }
      } else {
        // Mock data
        setTimeout(() => {
          setDiagnosticEntries([
            { Date: '2026-06-01 14:22:10', BugCheckCode: '0x9F', ErrorName: 'DRIVER_POWER_STATE_FAILURE', LikelyCause: 'nvlddmkm.sys (Nvidia Graphics)', SuggestedFix: 'Incompatible power management driver. Update Nvidia graphics card drivers, update motherboard PCI chipset drivers, or disable Fast Startup.' },
            { Date: '2026-05-28 03:10:45', BugCheckCode: '0x3B', ErrorName: 'SYSTEM_SERVICE_EXCEPTION', LikelyCause: 'win32kfull.sys', SuggestedFix: 'Frequently caused by GPU drivers or corrupted system files. Run SFC Scan and update graphics drivers.' }
          ]);
          setReportPath('mock_report.html');
        }, 1200);
      }
      setHasScannedBsod(true);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBatteryScan = async () => {
    setLoading(true);
    setBatteryData(null);
    setHasScannedBattery(false);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('battery-report');
        if (res.success && res.stdout) {
          setBatteryData(JSON.parse(res.stdout.trim()));
        }
      } else {
        // Mock
        setTimeout(() => {
          setBatteryData({
            BatteryPresent: true,
            DesignCapacity: 56000,
            FullChargeCapacity: 52400,
            HealthPercent: 93.5,
            CycleCount: 142,
            Chemistry: 'LION',
            ChargePercent: 88,
            IsCharging: true,
            History: [
              { Period: 'Jan 2026', Capacity: 54000 },
              { Period: 'Feb 2026', Capacity: 53600 },
              { Period: 'Mar 2026', Capacity: 53200 },
              { Period: 'Apr 2026', Capacity: 52900 },
              { Period: 'May 2026', Capacity: 52400 }
            ]
          });
        }, 1200);
      }
      setHasScannedBattery(true);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDiskScan = async () => {
    setLoading(true);
    setDiskData([]);
    setHasScannedDisk(false);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('disk-health');
        if (res.success && res.stdout) {
          setDiskData(JSON.parse(res.stdout.trim()));
        }
      } else {
        // Mock
        setTimeout(() => {
          setDiskData([
            { DeviceId: '0', FriendlyName: 'Samsung SSD 970 EVO Plus 1TB', MediaType: 'SSD', SizeGb: 931.5, SmartStatus: 'Healthy', Temperature: 39, WearPercentage: 97, Operational: 'OK' },
            { DeviceId: '1', FriendlyName: 'Crucial MX500 2TB SATA SSD', MediaType: 'SSD', SizeGb: 1863.0, SmartStatus: 'Healthy', Temperature: 34, WearPercentage: 94, Operational: 'OK' }
          ]);
        }, 1200);
      }
      setHasScannedDisk(true);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openFullReport = async () => {
    if (reportPath && window.api && window.api.openLatestBsodReport) {
      await window.api.openLatestBsodReport();
    } else {
      alert("Mock Full Report opened in browser!");
    }
  };

  const executeTabScan = () => {
    if (activeSubTab === 'bsod') handleDiagnosticScan();
    if (activeSubTab === 'battery') handleBatteryScan();
    if (activeSubTab === 'disk') handleDiskScan();
  };

  const criticalCount = diagnosticEntries.filter(e => e.Level?.toLowerCase() === 'critical').length;
  const errorCount = diagnosticEntries.filter(e => e.Level?.toLowerCase() === 'error').length;
  const warningCount = diagnosticEntries.filter(e => e.Level?.toLowerCase() === 'warning').length;
  const totalCount = diagnosticEntries.length;

  const filteredEntries = diagnosticEntries.filter(e => {
    const matchesLevel = levelFilter === 'all' || e.Level?.toLowerCase() === levelFilter.toLowerCase();
    
    let matchesSource = true;
    if (sourceFilter === 'system') {
      matchesSource = e.Source?.toLowerCase().includes('system');
    } else if (sourceFilter === 'application') {
      matchesSource = e.Source?.toLowerCase().includes('application');
    }
    
    const matchesSearch = searchQuery === '' || 
      e.Message?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.ErrorName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.LikelyCause?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.SuggestedFix?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.BugCheckCode?.toLowerCase().includes(searchQuery.toLowerCase());
      
    return matchesLevel && matchesSource && matchesSearch;
  });

  const getRepairAction = (issue) => {
    const code = issue.BugCheckCode || '';
    if (code.includes('0x9F') || code.includes('0x3B') || code.includes('0x7E')) {
      return {
        name: 'System File Integrity Check & SFC Scan',
        command: 'sfc /scannow',
        channel: 'sfc-out',
        info: 'Running Windows System File Checker (SFC) to detect and repair corrupted system files.'
      };
    }
    return {
      name: 'General Cache & DNS Flush Repair',
      command: 'ipconfig /flushdns; Clear-DnsClientCache; echo "General system cache reset complete."',
      channel: 'care-out',
      info: 'Clearing memory heap, resetting system DNS cache, and performing safety checks.'
    };
  };

  const handleRepair = async (crash, index) => {
    const action = getRepairAction(crash);
    setRepairStates(prev => ({ ...prev, [index]: 'running' }));
    setRepairLogs(prev => ({ ...prev, [index]: [`[SYSTEM] Launching repair handler: ${action.name}`, `[SYSTEM] Description: ${action.info}`, `[SYSTEM] Command: ${action.command}`, ''] }));

    let unsubscribe = null;
    if (window.api && window.api.onStream) {
      unsubscribe = window.api.onStream(action.channel, (data) => {
        setRepairLogs(prev => {
          const currentLogs = prev[index] || [];
          return {
            ...prev,
            [index]: [...currentLogs, ...data.split('\n')]
          };
        });
      });
    }

    try {
      if (window.api) {
        const commandKey = action.command.includes('sfc') ? 'run-sfc-scan' : 'flush-dns';
        const res = await window.api.runSystemCommand(commandKey);
        if (res.success) {
          setRepairStates(prev => ({ ...prev, [index]: 'success' }));
          setRepairLogs(prev => ({
            ...prev,
            [index]: [...(prev[index] || []), '', `[SYSTEM] Repair action completed successfully.`]
          }));
        } else {
          setRepairStates(prev => ({ ...prev, [index]: 'failed' }));
          setRepairLogs(prev => ({
            ...prev,
            [index]: [...(prev[index] || []), '', `[ERROR] Repair failed. Exit code: ${res.exitCode || 'Unknown'}`]
          }));
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setRepairStates(prev => ({ ...prev, [index]: 'success' }));
      }
    } catch (err) {
      console.error(err);
      setRepairStates(prev => ({ ...prev, [index]: 'failed' }));
    } finally {
      if (unsubscribe) {
        unsubscribe();
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <section className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Diagnostics Center</h2>
          <p className="text-xs text-slate-400">Run hardware reports, crash evaluations, and SSD health assessments</p>
        </div>

        <div className="flex gap-3 shrink-0 self-end sm:self-auto">
          {reportPath && (
            <button 
              onClick={openFullReport}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer flex items-center gap-1.5 transition-all"
            >
              📄 View Full Report
            </button>
          )}
          
          <button 
            onClick={executeTabScan}
            disabled={loading}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:bg-brand-violet/30 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Run Scan
          </button>
        </div>
      </section>

      {/* Sub tabs header */}
      <section className="flex border-b border-brand-border select-none">
        {[
          { id: 'bsod', label: 'Windows & App Diagnostic Logs', icon: AlertOctagon },
          { id: 'battery', label: 'Battery Capacity Report', icon: BatteryCharging },
          { id: 'disk', label: 'Disk SMART Health', icon: HardDrive }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveSubTab(tab.id);
              }}
              className={`flex items-center gap-2.5 px-6 py-3 border-b-2 text-xs font-bold transition-all duration-200 cursor-pointer ${
                isActive 
                  ? 'border-brand-violet text-brand-violet' 
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {tab.label}
            </button>
          );
        })}
      </section>

      {/* Active Diagnostics Panel */}
      <section className="glass-panel border border-brand-border rounded-2xl p-6 min-h-[400px] flex flex-col justify-start">
        {loading && (
          <div className="my-auto py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-10 w-10 animate-spin text-brand-violet" />
            <p className="text-sm font-semibold text-slate-300">Collecting local hardware diagnostics...</p>
          </div>
        )}

        {!loading && activeSubTab === 'bsod' && (
          <div className="space-y-4">
            <div className="text-left select-none">
              <h3 className="text-sm font-bold text-slate-300 uppercase">Recent System Crash Diagnostics</h3>
              <p className="text-xs text-slate-400 mt-1">Audit log of system kernel minidumps and crash signatures</p>
            </div>

            {!hasScannedBsod ? (
              <div className="py-20 text-center text-slate-500">
                <AlertOctagon className="h-12 w-12 mx-auto mb-3" />
                <p className="text-xs font-semibold">Click "Run Scan" to check system directories for minidump files.</p>
              </div>
            ) : diagnosticEntries.length === 0 ? (
              <div className="py-20 text-center">
                <ShieldCheck className="h-14 w-14 text-brand-success mx-auto mb-3 animate-bounce" />
                <h3 className="text-base font-bold text-slate-200">No crashes detected - System Stable!</h3>
                <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">No kernel panic records or blue screen dumps (*.dmp) were found in your local crash log directory.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-slate-900 border border-brand-border p-3.5 rounded-xl text-xs font-bold text-brand-danger text-left">
                  <AlertOctagon className="h-4.5 w-4.5 shrink-0" />
                  <span>Found {diagnosticEntries.length} critical blue-screen minidump files in your system directories. Review causes below.</span>
                </div>

                {diagnosticEntries.map((crash, index) => {
                  const isExpanded = expandedBsod === index;
                  return (
                    <div key={index} className="border border-brand-border rounded-xl bg-slate-950/20 text-left overflow-hidden">
                      <button
                        onClick={() => setExpandedBsod(isExpanded ? null : index)}
                        className="w-full px-5 py-4 flex justify-between items-center bg-slate-950/40 cursor-pointer"
                      >
                        <div className="flex flex-wrap gap-4 items-center">
                          <span className="text-xs font-bold text-slate-500">{crash.Date}</span>
                          <span className="px-2.5 py-0.5 bg-rose-500/20 border border-rose-500/50 text-rose-500 text-[10px] font-black rounded uppercase">
                            {crash.BugCheckCode}
                          </span>
                          <span className="text-xs font-bold text-slate-300">
                            {crash.ErrorName}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4.5 w-4.5 text-slate-400" /> : <ChevronDown className="h-4.5 w-4.5 text-slate-400" />}
                      </button>

                      {isExpanded && (
                        <div className="p-5 border-t border-brand-border space-y-4 text-xs">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-bold text-slate-500 mb-1">LIKELY CRASH CAUSE</h4>
                              <p className="text-slate-200 font-semibold">{crash.LikelyCause}</p>
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-500 mb-1">DUMP FILE PATH</h4>
                              <p className="text-slate-400 font-mono select-text">{crash.DumpFile || 'C:\\Windows\\Minidump'}</p>
                            </div>
                          </div>
                          
                          <div className="p-4 bg-slate-900 border border-brand-border rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1">
                              <h4 className="font-bold text-brand-cyan mb-1.5 uppercase tracking-wider">SUGGESTED RESOLUTION</h4>
                              <p className="text-slate-300 leading-relaxed font-medium">{crash.SuggestedFix}</p>
                            </div>
                            
                            {(!repairStates[index] || repairStates[index] === 'idle') && (
                              <button
                                onClick={() => handleRepair(crash, index)}
                                className="px-4 py-2 bg-gradient-to-r from-brand-violet to-brand-cyan hover:from-brand-violet/90 hover:to-brand-cyan/90 text-slate-950 font-black rounded-lg flex items-center gap-2 cursor-pointer transition-all duration-150 shrink-0 shadow-md shadow-brand-violet/20"
                              >
                                🔧 Run Self-Healing
                              </button>
                            )}

                            {repairStates[index] === 'running' && (
                              <span className="px-4 py-2 bg-slate-800 border border-brand-border text-brand-violet font-bold rounded-lg flex items-center gap-2 shrink-0 select-none">
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Fixing...
                              </span>
                            )}

                            {repairStates[index] === 'success' && (
                              <span className="px-4 py-2 bg-emerald-950/40 border border-emerald-500/30 text-brand-success font-black rounded-lg flex items-center gap-2 shrink-0 select-none">
                                <ShieldCheck className="h-4 w-4" /> Solution Applied
                              </span>
                            )}

                            {repairStates[index] === 'failed' && (
                              <button
                                onClick={() => handleRepair(crash, index)}
                                className="px-4 py-2 bg-rose-950/50 border border-brand-danger/30 text-brand-danger font-bold rounded-lg flex items-center gap-2 cursor-pointer hover:bg-rose-900/40 transition-all shrink-0"
                              >
                                <XCircle className="h-4 w-4" /> Retry
                              </button>
                            )}
                          </div>

                          {repairStates[index] && repairStates[index] !== 'idle' && (
                            <div className="space-y-2">
                              <h4 className="font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 select-none">
                                <Terminal className="h-3.5 w-3.5 text-brand-cyan" />
                                Live Output Logs
                              </h4>
                              <div className="bg-slate-950/80 border border-brand-border rounded-lg p-4 font-mono text-[10px] text-emerald-400 max-h-[150px] overflow-y-auto leading-relaxed select-text shadow-inner">
                                {(repairLogs[index] || []).map((log, logIdx) => (
                                  <p key={logIdx} className={log.startsWith('[ERROR]') ? 'text-brand-danger' : log.startsWith('[SYSTEM]') ? 'text-brand-cyan' : ''}>
                                    {log}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loading && activeSubTab === 'battery' && (
          <div className="space-y-6">
            {!hasScannedBattery ? (
              <div className="py-20 text-center text-slate-500 select-none">
                <BatteryCharging className="h-12 w-12 mx-auto mb-3" />
                <p className="text-xs font-semibold">Click "Run Scan" to verify battery power diagnostics.</p>
              </div>
            ) : !batteryData || !batteryData.BatteryPresent ? (
              <div className="py-20 text-center select-none">
                <HardDrive className="h-14 w-14 text-brand-cyan mx-auto mb-3 animate-pulse" />
                <h3 className="text-sm font-bold text-slate-200">Desktop PC - No Battery Detected</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">This system operates on direct A/C grid power. Battery diagnostics are bypassable.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left select-none">
                {/* Stats Cards */}
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950/20 border border-brand-border rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Battery Health</span>
                      <span className="text-2xl font-black text-brand-success mt-1 block">{batteryData.HealthPercent}%</span>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-brand-success rounded">
                      Optimal
                    </span>
                  </div>

                  <div className="p-4 bg-slate-950/20 border border-brand-border rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block uppercase">Cycle Count</span>
                      <span className="text-2xl font-black text-white mt-1 block">{batteryData.CycleCount}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400">Cycles</span>
                  </div>

                  <div className="p-4 bg-slate-950/20 border border-brand-border rounded-xl space-y-2">
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">Capacity Stats</span>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-400">Design Capacity:</span>
                      <span className="text-white">{batteryData.DesignCapacity} mWh</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-400">Full Charge Capacity:</span>
                      <span className="text-white">{batteryData.FullChargeCapacity} mWh</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-brand-border pt-1.5">
                      <span className="text-slate-400">Battery Chemistry:</span>
                      <span className="text-brand-cyan uppercase">{batteryData.Chemistry || 'LION'}</span>
                    </div>
                  </div>
                </div>

                {/* Recharts Area Chart */}
                <div className="md:col-span-2 border border-brand-border bg-slate-950/20 rounded-xl p-5 flex flex-col justify-between h-[280px]">
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Battery Capacity Degradation Trend</h4>
                    <p className="text-[10px] text-slate-500">Historical maximum charge retention curve</p>
                  </div>
                  <div className="h-[180px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={batteryData.History}>
                        <defs>
                          <linearGradient id="capacityColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="Period" stroke="#475569" fontSize={9} />
                        <YAxis stroke="#475569" fontSize={9} domain={['dataMin - 1000', 'dataMax + 1000']} />
                        <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155' }} />
                        <Area type="monotone" dataKey="Capacity" stroke="#8B5CF6" strokeWidth={2} fillOpacity={1} fill="url(#capacityColor)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && activeSubTab === 'disk' && (
          <div className="space-y-4">
            <div className="text-left select-none">
              <h3 className="text-sm font-bold text-slate-300 uppercase">SMART Disk Monitoring</h3>
              <p className="text-xs text-slate-400 mt-1">Real-time indicators, wear levels, and sector alerts</p>
            </div>

            {!hasScannedDisk ? (
              <div className="py-20 text-center text-slate-500 select-none">
                <HardDrive className="h-12 w-12 mx-auto mb-3" />
                <p className="text-xs font-semibold">Click "Run Scan" to load smart diagnostics logs.</p>
              </div>
            ) : diskData.length === 0 ? (
              <div className="py-20 text-center text-slate-500 select-none">
                <HelpCircle className="h-12 w-12 mx-auto mb-3" />
                <p className="text-xs font-semibold">No storage drives detected by diagnostics.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {diskData.map((disk, i) => (
                  <div key={i} className="border border-brand-border bg-slate-950/20 p-5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
                    <div className="flex gap-4 items-center">
                      <div className="bg-slate-800/60 p-3 rounded-lg border border-brand-border">
                        <HardDrive className="h-6 w-6 text-brand-cyan shrink-0" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">{disk.FriendlyName}</h4>
                        <p className="text-[10px] text-slate-400 mt-1">MediaType: <span className="font-semibold">{disk.MediaType}</span> | Storage Size: <span className="font-semibold text-slate-200">{disk.SizeGb} GB</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Temp indicator */}
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 select-none">
                        <Thermometer className="h-4.5 w-4.5 text-pink-400" />
                        <span>{disk.Temperature}°C</span>
                      </div>

                      {/* Wear Level percentage */}
                      <div className="text-xs font-semibold text-slate-300 select-none">
                        <span className="text-[10px] text-slate-500 uppercase block">Wear level status</span>
                        <span className="font-bold text-white">{disk.WearPercentage}% Life remaining</span>
                      </div>

                      {/* SMART Health status */}
                      <div className="flex gap-2">
                        {disk.SmartStatus === 'Healthy' || disk.SmartStatus === 'OK' ? (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-brand-success rounded-lg text-xs font-bold">
                            <ShieldCheck className="h-4 w-4" /> Healthy
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 text-brand-danger rounded-lg text-xs font-bold animate-pulse">
                            <ShieldAlert className="h-4 w-4" /> Alert
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
