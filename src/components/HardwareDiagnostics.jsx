import React, { useState, useEffect } from 'react';
import {
  Activity, ClipboardList, Loader2, Play, AlertOctagon,
  Cpu, HardDrive, Battery, Monitor, Zap, AlertTriangle, Settings, MonitorPlay
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { formatDate } from '../utils/formatters';

const TABS = [
  { id: 'ram',     label: 'RAM',     icon: Activity },
  { id: 'cpu',     label: 'CPU',     icon: Cpu },
  { id: 'gpu',     label: 'GPU',     icon: MonitorPlay },
  { id: 'disk',    label: 'Disk',    icon: HardDrive },
  { id: 'battery', label: 'Battery', icon: Battery },
  { id: 'bios',    label: 'Motherboard', icon: Settings },
];

export default function HardwareDiagnostics() {
  const [activeTab, setActiveTab] = useState('ram');

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div>
        <h2 className="text-xl font-bold text-slate-200">Hardware Diagnostics</h2>
        <p className="text-xs text-slate-400 mt-1">RAM, CPU, disk SMART health, and battery diagnostics for enterprise hardware assessment.</p>
      </div>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-brand-border rounded-xl p-1">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                active ? 'bg-brand-violet text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'ram'     && <RamTab />}
          {activeTab === 'cpu'     && <CpuTab />}
          {activeTab === 'gpu'     && <GpuTab />}
          {activeTab === 'disk'    && <DiskTab />}
          {activeTab === 'battery' && <BatteryTab />}
          {activeTab === 'bios'    && <BiosTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// =====================================================================
// Tab 1: RAM (preserves existing logic)
// =====================================================================
function RamTab() {
  const { addNotification } = useNotification();
  const [ramResult, setRamResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const checkResult = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-ram-diagnostic-result');
        if (res.success && res.stdout) {
          const match = res.stdout.match(/\{[\s\S]*\}/); if (match) setRamResult(JSON.parse(match[0]));
        } else {
          setRamResult({ hasResult: false, result: 'No results found', testDate: 'N/A' });
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setRamResult({ hasResult: true, result: 'No errors found', testDate: '2026-06-21 08:30:15' });
      }
    } catch (e) {
      addNotification('Diagnostics', 'Error reading test results: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const scheduleTest = async () => {
    setScheduling(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('schedule-ram-diagnostic');
        if (res.success) {
          addNotification('RAM Diagnostic', 'Windows Memory Diagnostic scheduled successfully.', 'success');
        } else if (res.cancelled) {
          addNotification('RAM Diagnostic', 'Operation cancelled by user.', 'info');
        } else {
          addNotification('RAM Diagnostic Error', res.error || 'Failed to schedule diagnostic.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        addNotification('RAM Diagnostic', 'Test scheduled successfully (MOCK).', 'success');
      }
    } catch (e) {
      addNotification('RAM Diagnostic Error', e.message, 'error');
    } finally {
      setScheduling(false);
    }
  };

  useEffect(() => { checkResult(); }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
          <ClipboardList className="h-5 w-5 text-brand-cyan" />
          Last Memory Test Status
        </h3>
        {loading ? (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
            <p className="text-xs text-slate-500 font-semibold">Reading memory event records...</p>
          </div>
        ) : ramResult ? (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/30 border border-slate-900 space-y-3">
              <div>
                <span className="text-slate-500 block">Health Verdict</span>
                <span className={`text-lg font-black uppercase ${
                  ramResult.result === 'No errors found' ? 'text-brand-success' : 'text-rose-400 animate-pulse'
                }`}>{ramResult.result}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Last Run Date</span>
                <span className="text-slate-200 font-bold text-sm">
                  {ramResult.testDate !== 'N/A' ? formatDate(ramResult.testDate) : 'Never Run'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 font-bold text-xs">No previous diagnostics results loaded.</div>
        )}
      </div>

      <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
          <Activity className="h-5 w-5 text-brand-violet" />
          Schedule Diagnostics Test
        </h3>
        <div className="space-y-4 text-xs">
          <p className="text-slate-400 leading-relaxed">
            Schedule a Windows Memory Diagnostic test. This registers a boot task that scans physical RAM sectors for hardware anomalies on the next system startup.
          </p>
          <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-950/5 text-amber-400 flex gap-2">
            <AlertOctagon className="h-5 w-5 shrink-0" />
            <span>Requires system restart. The PC will reboot into diagnostic mode and may take up to 30 minutes.</span>
          </div>
          <button
            disabled={scheduling}
            onClick={scheduleTest}
            className="w-full py-3 bg-brand-violet hover:bg-brand-violet/85 text-xs font-black text-white rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Schedule RAM Diagnostic Test
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Tab 2: CPU
// =====================================================================
function CpuTab() {
  const [cpuInfo, setCpuInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressLog, setStressLog] = useState('');
  const [stressDuration, setStressDuration] = useState(30);

  useEffect(() => {
    const fetchCpu = async () => {
      try {
        if (window.api) {
          const info = await window.api.getSystemInfo();
          setCpuInfo(info);
        } else {
          await new Promise(r => setTimeout(r, 500));
          setCpuInfo({ cpuModel: 'Intel Core i7-10700', cpuCores: 8, cpuLoad: 34 });
        }
      } catch (e) {
        console.warn('CPU info fetch failed:', e);
        setCpuInfo({ cpuModel: 'Unknown', cpuCores: 0, cpuLoad: 0 });
      } finally {
        setLoading(false);
      }
    };
    fetchCpu();
  }, []);

  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      if (stressRunning) {
        setStressLog(prev => (prev + data).split('\n').slice(-8).join('\n'));
      }
    });
  }, [stressRunning]);

  const runStressTest = async () => {
    setStressRunning(true);
    setStressLog('[STRESS] Initiating CPU stress test...\n');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-cpu-stress-test', [String(stressDuration)]);
        setStressLog(prev => prev + (res.stdout || '').split('\n').slice(-8).join('\n'));
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setStressLog(prev => prev + '[STRESS] Completed. Total iterations across 8 cores: 1284\n[STRESS] Mock mode.');
      }
    } catch (e) {
      setStressLog(prev => prev + `[ERROR] ${e.message}\n`);
    } finally {
      setStressRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
        <p className="text-xs text-slate-400">Querying CPU info...</p>
      </div>
    );
  }

  if (!cpuInfo) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto mb-2" />
        <p className="text-xs text-slate-400">Failed to read CPU information.</p>
      </div>
    );
  }

  const load = cpuInfo.cpuLoad || 0;
  const loadColor = load < 60 ? 'text-emerald-400' : load < 80 ? 'text-amber-400' : 'text-rose-400';
  const loadBarColor = load < 60 ? 'bg-emerald-500' : load < 80 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="space-y-5">
      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-4">
          <Cpu className="h-5 w-5 text-brand-violet" />
          CPU Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Model</span>
            <span className="text-slate-200 font-bold">{cpuInfo.cpuModel || 'Unknown'}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-bold mb-1">Logical Cores</span>
            <span className="text-slate-200 font-bold">{cpuInfo.cpuCores || 0}</span>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500 text-[10px] uppercase font-bold">Current Load</span>
            <span className={`text-sm font-black ${loadColor}`}>{load}%</span>
          </div>
          <div className="h-3 bg-slate-950/60 rounded-full overflow-hidden border border-brand-border">
            <div
              className={`h-full ${loadBarColor} transition-all duration-500`}
              style={{ width: `${Math.min(100, load)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-amber-400" />
          CPU Stress Test
        </h3>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Duration (seconds)</label>
            <input
              type="number"
              min="5"
              max="600"
              value={stressDuration}
              onChange={(e) => setStressDuration(Math.max(5, Math.min(600, parseInt(e.target.value) || 30)))}
              disabled={stressRunning}
              className="w-24 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 focus:outline-none focus:border-brand-violet"
            />
          </div>
          <button
            onClick={runStressTest}
            disabled={stressRunning}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            {stressRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {stressRunning ? 'Running...' : 'Start Stress Test'}
          </button>
        </div>
        <div className="p-3 bg-slate-950/60 border border-brand-border rounded-lg font-mono text-[10px] text-slate-300 h-32 overflow-y-auto whitespace-pre-wrap">
          {stressLog || 'Stress test output will appear here...'}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Tab 3: Disk
// =====================================================================
function DiskTab() {
  const [drives, setDrives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingDrive, setCheckingDrive] = useState(null);
  const [smartResults, setSmartResults] = useState({});

  useEffect(() => {
    const fetchDrives = async () => {
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('get-drives-info');
          if (res.success && res.stdout) {
            const list = JSON.parse(res.stdout.trim());
            setDrives(list);
          } else {
            setDrives([]);
          }
        } else {
          await new Promise(r => setTimeout(r, 500));
          setDrives([
            { letter: 'C', label: 'Windows', totalGB: 476, freeGB: 120, mediaType: 'SSD' },
            { letter: 'D', label: 'Data', totalGB: 931, freeGB: 450, mediaType: 'HDD' },
          ]);
        }
      } catch (e) {
        setDrives([]);
      } finally {
        setLoading(false);
      }
    };
    fetchDrives();
  }, []);

  const runSmartCheck = async (driveLetter) => {
    setCheckingDrive(driveLetter);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-smart-check', [driveLetter]);
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\{[\s\S]*\}/);
          if (m) {
            const obj = JSON.parse(m[0]);
            setSmartResults(prev => ({ ...prev, [driveLetter]: obj }));
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        setSmartResults(prev => ({
          ...prev,
          [driveLetter]: {
            success: true, driveLetter, friendlyName: `Mock Disk ${driveLetter}`,
            mediaType: 'SSD', healthStatus: 'Healthy', temperatureC: 35, wear: 12, isHealthy: true,
          }
        }));
      }
    } catch (e) {
      console.warn('SMART check failed:', e);
    } finally {
      setCheckingDrive(null);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
        <p className="text-xs text-slate-400">Enumerating drives...</p>
      </div>
    );
  }

  if (drives.length === 0) {
    return (
      <div className="py-12 text-center">
        <HardDrive className="h-10 w-10 text-slate-600 mx-auto mb-2" />
        <p className="text-xs text-slate-400">No drives detected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {drives.map((d, i) => {
        const usedGB = (d.totalGB || 0) - (d.freeGB || 0);
        const usedPct = d.totalGB ? Math.round((usedGB / d.totalGB) * 100) : 0;
        const mediaColor = d.mediaType === 'SSD' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                         : d.mediaType === 'HDD' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                         : 'bg-slate-700 text-slate-400 border-slate-600';
        const smart = smartResults[d.letter];
        const isChecking = checkingDrive === d.letter;

        return (
          <div key={i} className="glass-panel border border-brand-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-brand-violet/20 border border-brand-violet/40 flex items-center justify-center">
                  <span className="text-lg font-black text-brand-violet">{d.letter}</span>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-200">{d.label || 'Drive'} ({d.letter}:)</div>
                  <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded border ${mediaColor}`}>
                    {d.mediaType || 'Unknown'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => runSmartCheck(d.letter)}
                disabled={isChecking}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[11px] font-bold rounded border border-brand-border text-slate-300 flex items-center gap-1 cursor-pointer"
              >
                {isChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <HardDrive className="h-3 w-3" />}
                Run SMART Check
              </button>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span className="uppercase font-bold">Used Space</span>
                <span>{usedGB.toFixed(1)} GB / {(d.totalGB || 0).toFixed(1)} GB ({usedPct}%)</span>
              </div>
              <div className="h-2 bg-slate-950/60 rounded-full overflow-hidden border border-brand-border">
                <div
                  className={`h-full ${usedPct > 90 ? 'bg-rose-500' : usedPct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
            </div>

            {smart && (
              <div className="mt-3 p-3 bg-slate-950/40 border border-brand-border rounded-lg text-xs grid grid-cols-2 md:grid-cols-4 gap-3">
                <SmartField label="Health" value={smart.healthStatus || 'N/A'} good={smart.isHealthy} />
                <SmartField label="Temp" value={smart.temperatureC ? `${smart.temperatureC}°C` : 'N/A'} good={(smart.temperatureC || 0) < 50} />
                <SmartField label="Wear" value={smart.wear != null ? `${smart.wear}%` : 'N/A'} good={(smart.wear || 0) < 50} />
                <SmartField label="Power-On Hrs" value={smart.powerOnHours || 'N/A'} good={true} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SmartField({ label, value, good }) {
  return (
    <div>
      <div className="text-[10px] text-slate-500 uppercase font-bold">{label}</div>
      <div className={`text-xs font-bold mt-0.5 ${good ? 'text-emerald-400' : 'text-rose-400'}`}>{value}</div>
    </div>
  );
}

// =====================================================================
// Tab 4: Battery
// =====================================================================
function BatteryTab() {
  const [battery, setBattery] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBattery = async () => {
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('battery-report');
          if (res.success && res.stdout) {
            const m = res.stdout.match(/\{[\s\S]*\}/);
            if (m) {
              setBattery(JSON.parse(m[0]));
            } else {
              setBattery({ isDesktop: true });
            }
          } else {
            setBattery({ isDesktop: true });
          }
        } else {
          await new Promise(r => setTimeout(r, 500));
          setBattery({ isDesktop: false, chargePercent: 78, status: 'Charging', health: 'Good', cycleCount: 142, chemistry: 'Li-Ion' });
        }
      } catch (e) {
        setBattery({ isDesktop: true });
      } finally {
        setLoading(false);
      }
    };
    fetchBattery();
  }, []);

  if (loading) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
        <p className="text-xs text-slate-400">Querying battery info...</p>
      </div>
    );
  }

  if (!battery || battery.isDesktop) {
    return (
      <div className="py-16 text-center">
        <Monitor className="h-12 w-12 text-slate-600 mx-auto mb-3" />
        <p className="text-sm font-bold text-slate-300">Desktop PC — No Battery Detected</p>
        <p className="text-xs text-slate-500 mt-1">Battery diagnostics are only available on laptops and tablets.</p>
      </div>
    );
  }

  const charge = battery.chargePercent || 0;
  const chargeColor = charge >= 60 ? '#10B981' : charge >= 20 ? '#F59E0B' : '#EF4444';
  const isCharging = battery.status === 'Charging' || battery.status === 'AC Power';

  return (
    <div className="space-y-5">
      <div className="glass-panel border border-brand-border rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
        {/* Charge ring */}
        <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(charge / 100) * 264} 264`}
              stroke={chargeColor}
            />
          </svg>
          <div className="text-center">
            <div className="text-3xl font-black" style={{ color: chargeColor }}>{charge}%</div>
            {isCharging && <Zap className="h-4 w-4 text-amber-400 mx-auto mt-1 animate-pulse" />}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex-1 grid grid-cols-2 gap-3 text-xs w-full">
          <BatteryField label="Status" value={battery.status || 'Unknown'} />
          <BatteryField label="Health" value={battery.health || 'Unknown'} good={(battery.health || '').match(/Good|Excellent/i)} />
          <BatteryField label="Cycle Count" value={battery.cycleCount || 'N/A'} />
          <BatteryField label="Chemistry" value={battery.chemistry || 'N/A'} />
        </div>
      </div>
    </div>
  );
}

function BatteryField({ label, value, good }) {
  return (
    <div className="bg-slate-950/40 border border-brand-border rounded-lg p-3">
      <div className="text-[10px] text-slate-500 uppercase font-bold">{label}</div>
      <div className={`text-xs font-bold mt-0.5 ${good === undefined ? 'text-slate-200' : good ? 'text-emerald-400' : 'text-amber-400'}`}>{value}</div>
    </div>
  );
}

// =====================================================================
// Tab 5: GPU
// =====================================================================
function GpuTab() {
  const [gpus, setGpus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGpu = async () => {
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('run-hardware-advanced', ['gpu']);
          if (res.success && res.stdout) {
            const m = res.stdout.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
            if (m) {
              let parsed = JSON.parse(m[0]);
              setGpus(Array.isArray(parsed) ? parsed : [parsed]);
            }
          }
        } else {
          setGpus([{ Name: 'NVIDIA GeForce RTX 3060', DriverVersion: '31.0.15.3623', AdapterRAM: 12884901888, Status: 'OK' }]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchGpu();
  }, []);

  if (loading) return <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-violet" /></div>;

  return (
    <div className="space-y-6">
      <div className="glass-panel border border-brand-border rounded-xl p-6">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2 mb-4">
          <MonitorPlay className="h-5 w-5 text-brand-violet" />
          Graphics Processing Units (GPU)
        </h3>
        {gpus && gpus.length > 0 ? (
          <div className="space-y-4">
            {gpus.map((g, i) => (
              <div key={i} className="p-4 bg-slate-950/30 rounded-lg border border-slate-900 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-slate-500 block">Model</span>
                  <span className="text-sm font-bold text-slate-200">{g.Name || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Driver Version</span>
                  <span className="text-sm font-bold text-slate-200">{g.DriverVersion || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">VRAM (Dedicated)</span>
                  <span className="text-sm font-bold text-slate-200">
                    {g.AdapterRAM ? `${Math.round(g.AdapterRAM / 1024 / 1024 / 1024)} GB` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Status</span>
                  <span className="text-sm font-bold text-emerald-400">{g.Status || 'OK'}</span>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-500">No GPUs detected.</p>}
      </div>
    </div>
  );
}

// =====================================================================
// Tab 6: BIOS / Motherboard
// =====================================================================
function BiosTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBios = async () => {
      try {
        if (window.api) {
          const res = await window.api.runSystemCommand('run-hardware-advanced', ['bios']);
          if (res.success && res.stdout) {
            const m = res.stdout.match(/\{[\s\S]*\}/);
            if (m) setData(JSON.parse(m[0]));
          }
        } else {
          setData({
            bios: { Manufacturer: 'American Megatrends Inc.', Version: 'F12', ReleaseDate: '2023-11-20' },
            board: { Manufacturer: 'Gigabyte Technology Co., Ltd.', Product: 'B550 AORUS PRO' }
          });
        }
      } catch (e) {} finally { setLoading(false); }
    };
    fetchBios();
  }, []);

  if (loading) return <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-violet" /></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="glass-panel border border-brand-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
          <Settings className="h-5 w-5 text-brand-violet" />
          Motherboard Info
        </h3>
        <div className="space-y-3">
          <div><span className="text-xs text-slate-500 block">Manufacturer</span><span className="text-sm font-bold text-slate-200">{data?.board?.Manufacturer || 'N/A'}</span></div>
          <div><span className="text-xs text-slate-500 block">Product Model</span><span className="text-sm font-bold text-slate-200">{data?.board?.Product || 'N/A'}</span></div>
        </div>
      </div>
      <div className="glass-panel border border-brand-border rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
          <Cpu className="h-5 w-5 text-brand-violet" />
          BIOS / UEFI Firmware
        </h3>
        <div className="space-y-3">
          <div><span className="text-xs text-slate-500 block">BIOS Vendor</span><span className="text-sm font-bold text-slate-200">{data?.bios?.Manufacturer || 'N/A'}</span></div>
          <div><span className="text-xs text-slate-500 block">Firmware Version</span><span className="text-sm font-bold text-slate-200">{data?.bios?.Version || 'N/A'}</span></div>
        </div>
      </div>
    </div>
  );
}
