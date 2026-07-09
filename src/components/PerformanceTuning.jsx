import React, { useState, useEffect } from 'react';
import { 
  Loader2, Zap, CheckCircle2, AlertTriangle, Cpu, Clock, Server, 
  Battery, BatteryCharging, BatteryWarning, RefreshCw, Power, Settings, Thermometer, WifiOff 
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

function PowerTweakCard({ title, description, action, icon: Icon = Zap, accentColor = 'violet' }) {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const applyTweak = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-power-tweak', [action]);
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\{[\s\S]*\}/g);
          const obj = m ? JSON.parse(m[m.length - 1]) : null;
          if (obj) {
            setResult(obj);
            addNotification(title, obj.message || 'Tweak applied.', obj.success ? 'success' : 'error');
          } else {
            setResult({ success: false, message: 'No JSON output from script.' });
            addNotification(title, 'No JSON output from script.', 'error');
          }
        } else {
          setResult({ success: false, message: res.error || 'Command failed.' });
          addNotification(title, res.error || 'Command failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        const mockResult = { success: true, message: `Mock: ${title} applied successfully.`, planGuid: 'mock-plan-guid', exitCode: 0 };
        setResult(mockResult);
        addNotification(title, mockResult.message, 'success');
      }
    } catch (e) {
      setResult({ success: false, message: e.message });
      addNotification(title, e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const colorClasses = {
    violet: { bg: 'bg-brand-violet/20', border: 'border-brand-violet/40', text: 'text-brand-violet', btn: 'bg-brand-violet hover:bg-brand-violet/80' },
    cyan:   { bg: 'bg-cyan-500/20',     border: 'border-cyan-500/40',     text: 'text-cyan-400',     btn: 'bg-cyan-500 hover:bg-cyan-400' },
    amber:  { bg: 'bg-amber-500/20',    border: 'border-amber-500/40',    text: 'text-amber-400',    btn: 'bg-amber-500 hover:bg-amber-400' },
    rose:   { bg: 'bg-rose-500/20',     border: 'border-rose-500/40',     text: 'text-rose-400',     btn: 'bg-rose-500 hover:bg-rose-400' },
  };
  const c = colorClasses[accentColor] || colorClasses.violet;

  return (
    <div className="p-6 space-y-5 text-left border border-brand-border rounded-xl glass-panel bg-slate-900/40 hover:border-brand-violet/40 transition-colors h-full flex flex-col justify-between">
      <div>
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Icon className={`h-5 w-5 ${c.text}`} />
              {title}
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">{description}</p>
          </div>
        </header>

        {!result && !loading && (
          <div className="glass-panel border border-brand-border rounded-xl p-4 text-center mt-2 bg-slate-950/40">
            <Icon className={`h-8 w-8 ${c.text} mx-auto mb-2 opacity-60`} />
            <p className="text-[11px] text-slate-400">Ready to apply.</p>
          </div>
        )}

        {loading && (
          <div className="glass-panel border border-brand-border rounded-xl p-4 text-center mt-2 bg-slate-950/40">
            <Loader2 className={`h-8 w-8 ${c.text} mx-auto mb-2 animate-spin`} />
            <p className="text-[11px] text-slate-400">Applying tweak...</p>
          </div>
        )}

        {result && (
          <div className={`mt-2 glass-panel border rounded-xl p-4 ${result.success ? 'border-emerald-500/40 bg-emerald-950/10' : 'border-rose-500/40 bg-rose-950/10'}`}>
            <div className="flex items-center gap-3 mb-2">
              {result.success ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
              )}
              <div>
                <div className={`text-xs font-bold ${result.success ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {result.success ? 'Tweak Applied' : 'Tweak Failed'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{result.message}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={applyTweak}
        disabled={loading}
        className={`mt-4 w-full px-6 py-2 ${c.btn} disabled:opacity-50 text-white rounded-lg text-sm font-bold flex justify-center items-center gap-2 cursor-pointer transition-colors`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        {loading ? 'Applying...' : 'Apply Tweak'}
      </button>
    </div>
  );
}

function BatterySaverSection() {
  const [batteryInfo, setBatteryInfo] = useState(null);
  const [saverMode, setSaverMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadBatteryInfo(); }, []);

  const loadBatteryInfo = async () => {
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('battery-report');
        if (res.success && res.stdout) {
          const match = res.stdout.match(/\{[\s\S]*\}/);
          if (match) {
            try { setBatteryInfo(JSON.parse(match[0])); }
            catch { console.warn('Battery report parse failed'); }
          }
        }
      } else {
        setBatteryInfo({ chargePercent: 72, isCharging: false, healthPercent: 93, fullChargeCapacity: 52400, designCapacity: 56000 });
      }
    } catch (e) { console.error(e); }
  };

  const toggleSaverMode = async () => {
    setLoading(true);
    try {
      if (window.api) {
        if (!saverMode) {
          await window.api.runSystemCommand('apply-power-plan', ['saver']);
          await window.api.runSystemCommand('disable-background-apps');
          await window.api.runSystemCommand('set-display-brightness', ['50']);
        } else {
          await window.api.runSystemCommand('apply-power-plan', ['balanced']);
          await window.api.runSystemCommand('enable-background-apps');
          await window.api.runSystemCommand('set-display-brightness', ['100']);
        }
      }
      setSaverMode(!saverMode);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getBatteryIcon = () => {
    if (!batteryInfo) return <Battery className="h-8 w-8 text-slate-400" />;
    if (batteryInfo.isCharging) return <BatteryCharging className="h-8 w-8 text-emerald-400" />;
    if (batteryInfo.chargePercent < 20) return <BatteryWarning className="h-8 w-8 text-rose-400" />;
    return <Battery className="h-8 w-8 text-brand-cyan" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-xl border border-brand-border">
        <div>
          <h3 className="text-sm font-bold text-slate-200">Battery Saver</h3>
          <p className="text-xs text-slate-400">Optimize power consumption for longevity</p>
        </div>
        <button onClick={loadBatteryInfo} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-panel border border-brand-border rounded-2xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              {getBatteryIcon()}
              <div>
                <h3 className="text-md font-bold text-slate-200">{batteryInfo ? `${batteryInfo.chargePercent}%` : 'N/A'}</h3>
                <p className="text-xs text-slate-400">{batteryInfo?.isCharging ? 'Charging' : 'On Battery Power'}</p>
              </div>
            </div>
            <button onClick={toggleSaverMode} disabled={loading || !batteryInfo} className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${saverMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'} disabled:opacity-50`}>
              {loading ? 'Applying...' : saverMode ? 'Saver Active' : 'Enable Saver'}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Battery Health</span>
              <span className={!batteryInfo ? 'text-slate-400' : batteryInfo.healthPercent < 80 ? 'text-rose-400' : batteryInfo.healthPercent < 90 ? 'text-amber-400' : 'text-emerald-400'}>{batteryInfo?.healthPercent}%</span>
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${!batteryInfo ? 'bg-slate-800' : batteryInfo.healthPercent < 80 ? 'bg-rose-500' : batteryInfo.healthPercent < 90 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${batteryInfo?.healthPercent || 0}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-brand-border">
            <div className="text-xs">
              <span className="text-slate-500 block">Design Capacity</span>
              <span className="text-slate-300 font-semibold">{batteryInfo?.designCapacity} mWh</span>
            </div>
            <div className="text-xs">
              <span className="text-slate-500 block">Full Charge</span>
              <span className="text-slate-300 font-semibold">{batteryInfo?.fullChargeCapacity} mWh</span>
            </div>
          </div>
        </div>

        {saverMode && (
          <div className="glass-panel border border-emerald-500/30 rounded-2xl p-6 bg-emerald-950/10">
            <h4 className="text-sm font-bold text-emerald-400 mb-4">Active Power Saving Measures</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs"><Power className="h-4 w-4 text-emerald-400" /><span className="text-slate-300">Power plan set to "Power Saver"</span></div>
              <div className="flex items-center gap-3 text-xs"><Settings className="h-4 w-4 text-emerald-400" /><span className="text-slate-300">Background apps disabled</span></div>
              <div className="flex items-center gap-3 text-xs"><Thermometer className="h-4 w-4 text-emerald-400" /><span className="text-slate-300">Display brightness reduced to 50%</span></div>
              <div className="flex items-center gap-3 text-xs"><WifiOff className="h-4 w-4 text-emerald-400" /><span className="text-slate-300">Wi-Fi power saving mode enabled</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PerformanceTuning() {
  const [activeTab, setActiveTab] = useState('tweaks');
  return (
    <div className="p-6 space-y-6 text-left select-none max-w-7xl mx-auto">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <Zap className="h-7 w-7 text-brand-violet" />
          Performance Tuning
        </h2>
        <p className="text-sm text-slate-400">Optimize power states, CPU parking, and battery longevity for maximum efficiency.</p>
      </header>

      <nav className="flex gap-2 border-b border-brand-border pb-3">
        <button onClick={() => setActiveTab('tweaks')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'tweaks' ? 'bg-brand-violet text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
          <Cpu className="h-4 w-4" /> Power Tweaks
        </button>
        <button onClick={() => setActiveTab('battery')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'battery' ? 'bg-brand-violet text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
          <Battery className="h-4 w-4" /> Battery Saver
        </button>
      </nav>

      {activeTab === 'tweaks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <PowerTweakCard 
            title="Ultimate Performance" 
            description="Unlock and apply the hidden Windows Ultimate Performance power plan for zero latency. Best for desktops/workstations on AC power." 
            action="ultimate-plan" 
            icon={Zap} 
            accentColor="violet" 
          />
          <PowerTweakCard 
            title="Disable Core Parking" 
            description="Disable CPU core parking so all cores remain active at all times. Reduces latency for bursty workloads." 
            action="unpark-cores" 
            icon={Cpu} 
            accentColor="cyan" 
          />
          <PowerTweakCard 
            title="Disable Fast Startup" 
            description="Disable Fast Startup & Hibernation. Frees disk space and ensures clean cold boots to fix driver issues." 
            action="disable-hibernation" 
            icon={Clock} 
            accentColor="amber" 
          />
          <PowerTweakCard 
            title="Advanced I/O Tweaks" 
            description="Disable PCIe Link State Power Management & USB Selective Suspend. Maximizes I/O performance." 
            action="advanced-tweaks" 
            icon={Server} 
            accentColor="violet" 
          />
        </div>
      )}

      {activeTab === 'battery' && <BatterySaverSection />}
    </div>
  );
}
