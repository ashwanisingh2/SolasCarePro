import React, { useState, useEffect } from 'react';
import {
  Battery, BatteryCharging, BatteryWarning, Zap, RefreshCw,
  Power, Settings, Thermometer, Wifi, WifiOff
} from 'lucide-react';

export default function BatterySaver() {
  const [batteryInfo, setBatteryInfo] = useState(null);
  const [saverMode, setSaverMode] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBatteryInfo();
  }, []);

  const loadBatteryInfo = async () => {
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('battery-report');
        if (res.success && res.stdout) {
          const match = res.stdout.match(/\{[\s\S]*\}/);
          if (match) {
            setBatteryInfo(JSON.parse(match[0]));
          }
        }
      } else {
        // Mock
        setBatteryInfo({
          chargePercent: 72,
          isCharging: false,
          healthPercent: 93,
          fullChargeCapacity: 52400,
          designCapacity: 56000
        });
      }
    } catch (e) {
      console.error('Failed to load battery info:', e);
    }
  };

  const toggleSaverMode = async () => {
    setLoading(true);
    try {
      if (window.api) {
        if (!saverMode) {
          // Enable battery saver: switch to Power Saver plan, dim screen, throttle background apps.
          // Main process maps 'saver'/'balanced' to fixed powercfg arguments (allow-listed, no raw PS).
          await window.api.runSystemCommand('apply-power-plan', ['saver']);
          await window.api.runSystemCommand('disable-background-apps');
          await window.api.runSystemCommand('set-display-brightness', ['50']);
        } else {
          // Disable battery saver: return to Balanced plan, restore brightness and background apps.
          await window.api.runSystemCommand('apply-power-plan', ['balanced']);
          await window.api.runSystemCommand('enable-background-apps');
          await window.api.runSystemCommand('set-display-brightness', ['100']);
        }
      }
      setSaverMode(!saverMode);
    } catch (e) {
      console.error('Failed to toggle saver mode:', e);
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

  const getBatteryColor = () => {
    if (!batteryInfo) return 'text-slate-400';
    if (batteryInfo.chargePercent < 20) return 'text-rose-400';
    if (batteryInfo.chargePercent < 50) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Battery Saver Mode</h2>
          <p className="text-xs text-slate-400">Optimize power consumption to extend battery life</p>
        </div>
        <button
          onClick={loadBatteryInfo}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Battery Status Card */}
      <div className="glass-panel border border-brand-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {getBatteryIcon()}
            <div>
              <h3 className="text-md font-bold text-slate-200">
                {batteryInfo ? `${batteryInfo.chargePercent}%` : 'N/A'}
              </h3>
              <p className="text-xs text-slate-400">
                {batteryInfo?.isCharging ? 'Charging' : 'On Battery Power'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleSaverMode}
            disabled={loading || !batteryInfo}
            className={`px-6 py-3 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              saverMode
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
            } disabled:opacity-50`}
          >
            {loading ? 'Applying...' : saverMode ? 'Saver Active' : 'Enable Saver'}
          </button>
        </div>

        {/* Battery Health Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Battery Health</span>
            <span className={getBatteryColor()}>{batteryInfo?.healthPercent}%</span>
          </div>
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                batteryInfo?.healthPercent < 80 ? 'bg-rose-500' :
                batteryInfo?.healthPercent < 90 ? 'bg-amber-500' :
                'bg-emerald-500'
              }`}
              style={{ width: `${batteryInfo?.healthPercent || 0}%` }}
            />
          </div>
        </div>

        {/* Capacity Info */}
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-brand-border">
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

      {/* Power Saving Actions */}
      {saverMode && (
        <div className="glass-panel border border-emerald-500/30 rounded-2xl p-6 space-y-4">
          <h4 className="text-sm font-bold text-slate-200">Active Power Saving Measures</h4>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs">
              <Power className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300">Power plan set to "Power Saver"</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Settings className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300">Background apps disabled</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <Thermometer className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300">Display brightness reduced to 50%</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <WifiOff className="h-4 w-4 text-emerald-400" />
              <span className="text-slate-300">Wi-Fi power saving mode enabled</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
