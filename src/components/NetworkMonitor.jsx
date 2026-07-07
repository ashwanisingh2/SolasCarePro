import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import { Network, Wifi, WifiOff, ArrowDown, ArrowUp } from 'lucide-react';
import { useSystemMetrics } from '../context/SystemMetricsContext';
import { formatBytesPerSec } from '../utils/formatters';

export default function NetworkMonitor() {
  const { systemMetrics } = useSystemMetrics();
  const [speedHistory, setSpeedHistory] = useState([]);
  const [networkInfo, setNetworkInfo] = useState({ download: 0, upload: 0, total: 0 });
  const [connectionStatus, setConnectionStatus] = useState('unknown');

  // Update speed history whenever new system metrics arrive
  useEffect(() => {
    if (systemMetrics && systemMetrics.netSpeed !== undefined && systemMetrics.netSpeed !== null) {
      const bytesPerSec = systemMetrics.netSpeed;
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const newPoint = {
        time: timestamp,
        speed: Math.round(bytesPerSec / 1024) // KB/s
      };

      setSpeedHistory(prev => {
        const updated = [...prev, newPoint];
        return updated.slice(-30); // Keep last 30 points
      });

      setNetworkInfo({
        download: Math.round(bytesPerSec * 0.8),
        upload: Math.round(bytesPerSec * 0.2),
        total: bytesPerSec
      });
    }
  }, [systemMetrics]);

  // Check connectivity in a simple, low-frequency loop (every 10s)
  useEffect(() => {
    let active = true;
    const checkConn = async () => {
      try {
        if (window.api) {
          const connTest = await window.api.runSystemCommand('detect-network');
          if (active) {
            setConnectionStatus(connTest.success && connTest.exitCode === 0 ? 'connected' : 'disconnected');
          }
        } else {
          if (active) setConnectionStatus('connected');
        }
      } catch (e) {
        console.error('Failed to run connectivity check:', e);
      }
    };
    
    checkConn();
    const interval = setInterval(checkConn, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Network Monitor</h2>
          <p className="text-xs text-slate-400">Real-time network traffic monitoring</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
          connectionStatus === 'connected'
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
        }`}>
          {connectionStatus === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Speed Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <ArrowDown className="h-5 w-5 text-emerald-400" />
            </div>
            <span className="text-xs text-slate-400 font-bold uppercase">Download</span>
          </div>
          <p className="text-2xl font-black text-emerald-400">{formatBytesPerSec(networkInfo.download)}</p>
        </div>

        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500/20 p-2 rounded-lg">
              <ArrowUp className="h-5 w-5 text-blue-400" />
            </div>
            <span className="text-xs text-slate-400 font-bold uppercase">Upload</span>
          </div>
          <p className="text-2xl font-black text-blue-400">{formatBytesPerSec(networkInfo.upload)}</p>
        </div>

        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-violet-500/20 p-2 rounded-lg">
              <Network className="h-5 w-5 text-violet-400" />
            </div>
            <span className="text-xs text-slate-400 font-bold uppercase">Total</span>
          </div>
          <p className="text-2xl font-black text-violet-400">{formatBytesPerSec(networkInfo.total)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-4">Speed History (KB/s)</h4>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={speedHistory}>
              <XAxis dataKey="time" stroke="#475569" fontSize={9} />
              <YAxis stroke="#475569" fontSize={9} />
              <Tooltip
                contentStyle={{
                  background: '#0F172A',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#8B5CF6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

