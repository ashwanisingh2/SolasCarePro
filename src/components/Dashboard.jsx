import React, { useState, useEffect } from 'react';
import { 
  AreaChart, Area, ResponsiveContainer 
} from 'recharts';
import { 
  ShieldAlert, ShieldCheck, Cpu, HardDrive, Wifi, Layers, 
  Trash2, Search, ArrowUpCircle, Zap, RefreshCw, AlertTriangle
} from 'lucide-react';

export default function Dashboard({ setActiveTab }) {
  const [metrics, setMetrics] = useState({ cpu: null, ram: null, disk: null, netSpeed: null, lastUpdated: 'N/A' });
  const [cpuHistory, setCpuHistory] = useState(Array(15).fill({ val: 0 }));
  const [healthScore, setHealthScore] = useState(100);
  const [recentLogs, setRecentLogs] = useState([
    { id: 1, action: 'System Diagnostics Completed', time: '10 mins ago', status: 'success' },
    { id: 2, action: 'Junk Files Cleaned', time: '1 hour ago', status: 'success' },
    { id: 3, action: 'Windows Update Check Fail', time: '3 hours ago', status: 'warning' },
    { id: 4, action: 'System Restore Point Created', time: 'Yesterday', status: 'success' },
  ]);

  // Format bytes per second nicely
  const formatBytesPerSec = (bytes) => {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return "Data Unavailable";
    if (bytes < 1024) return `${bytes} B/s`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB/s`;
    return `${(bytes / 1048576).toFixed(1)} MB/s`;
  };

  // Fetch metrics periodically (every 2 seconds)
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        if (window.api) {
          const res = await window.api.getSystemMetrics();
          setMetrics(res);
          
          // Update CPU graph history
          if (res.cpu !== null && res.cpu !== undefined) {
            setCpuHistory(prev => {
              const next = [...prev.slice(1), { val: res.cpu }];
              return next;
            });
          }

          // Calculate a realistic health score based on system load, netSpeed, and warnings
          let score = 100;
          if (res.cpu !== null) {
            if (res.cpu > 80) score -= 15;
            else if (res.cpu > 50) score -= 5;
          } else {
            score -= 5; // Penalty for unavailable CPU WMI
          }
          
          if (res.ram !== null) {
            if (res.ram > 90) score -= 20;
            else if (res.ram > 70) score -= 8;
          } else {
            score -= 5;
          }
          
          if (res.disk !== null) {
            if (res.disk > 95) score -= 25;
            else if (res.disk > 85) score -= 10;
          } else {
            score -= 5;
          }
          
          setHealthScore(Math.max(45, score));
        }
      } catch (err) {
        console.error('Failed to query dashboard metrics:', err);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000); // 2-second update interval
    return () => clearInterval(interval);
  }, []);

  const getScoreColor = () => {
    if (healthScore >= 85) return 'text-emerald-400';
    if (healthScore >= 60) return 'text-amber-400';
    return 'text-rose-500';
  };

  const getScoreBg = () => {
    if (healthScore >= 85) return 'from-emerald-500/20 to-cyan-500/10 border-emerald-500/30';
    if (healthScore >= 60) return 'from-amber-500/20 to-orange-500/10 border-amber-500/30';
    return 'from-rose-500/20 to-pink-500/10 border-rose-500/30';
  };

  const quickActions = [
    { label: 'Junk Clean', desc: 'Scan and clear temp file cache', tab: 'care', icon: Trash2, color: 'text-cyan-400 hover:bg-cyan-500/10' },
    { label: 'Scan Drivers', desc: 'Check missing/faulty hardware', tab: 'drivers', icon: Search, color: 'text-violet-400 hover:bg-violet-500/10' },
    { label: 'Update Apps', desc: 'Upgrade out-of-date Winget packages', tab: 'software', icon: ArrowUpCircle, color: 'text-emerald-400 hover:bg-emerald-500/10' },
    { label: 'Network Boost', desc: 'Booster internet socket profiles', tab: 'care', icon: Wifi, color: 'text-pink-400 hover:bg-pink-500/10' },
    { label: 'Speed Volume', desc: 'Execute C: SSD TRIM cleanup', tab: 'care', icon: Zap, color: 'text-amber-400 hover:bg-amber-500/10' },
    { label: 'Crash Diagnostics', desc: 'Read BSOD logs and errors', tab: 'diagnostics', icon: AlertTriangle, color: 'text-rose-400 hover:bg-rose-500/10' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Top Health Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Health Score Circular Gauge */}
        <div className={`col-span-1 border rounded-2xl bg-gradient-to-br ${getScoreBg()} p-6 flex flex-col items-center justify-center relative overflow-hidden h-[240px]`}>
          <div className="text-center z-10 select-none">
            <h3 className="text-xs uppercase tracking-widest text-slate-400 font-bold">SYSTEM HEALTH INDEX</h3>
            <span className={`text-7xl font-black ${getScoreColor()} block my-2`}>{healthScore}</span>
            <p className="text-xs text-slate-300 font-semibold uppercase">
              {healthScore >= 85 ? 'System Optimal' : healthScore >= 60 ? 'Warning: Low Memory/CPU' : 'Critical Maintenance Required'}
            </p>
          </div>
          {/* Subtle abstract background element */}
          <div className="absolute w-48 h-48 rounded-full bg-brand-violet/10 -bottom-24 -right-24 blur-xl"></div>
        </div>

        {/* Real-time Hardware Metrics Sparkline Area */}
        <div className="col-span-2 glass-panel rounded-2xl border border-brand-border p-6 flex flex-col justify-between h-[240px]">
          <div>
            <div className="flex justify-between items-center mb-4 text-left">
              <div>
                <h3 className="text-sm font-bold text-slate-200">CPU Usage Real-Time</h3>
                <p className="text-xs text-slate-400">Processor core calculation load | <span className="text-[9px] text-slate-500 font-bold uppercase">Last Updated: {metrics.lastUpdated}</span></p>
              </div>
              <span className="text-2xl font-black text-brand-cyan">
                {metrics.cpu !== null && metrics.cpu !== undefined ? `${metrics.cpu}%` : 'Data Unavailable'}
              </span>
            </div>
            {/* Sparkline chart */}
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cpuHistory}>
                  <defs>
                    <linearGradient id="cpuColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#06B6D4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="val" stroke="#06B6D4" strokeWidth={2} fillOpacity={1} fill="url(#cpuColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Grid of Monitors */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* RAM monitor */}
        <div className="glass-panel border border-brand-border rounded-xl p-5 flex items-center justify-between text-left">
          <div className="flex items-center gap-4">
            <div className="bg-brand-violet/20 p-3 rounded-lg text-brand-violet border border-brand-violet/20">
              <Cpu className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs text-slate-400 font-bold uppercase">RAM UTILIZATION</h4>
              <p className="text-xl font-black text-white mt-1">
                {metrics.ram !== null && metrics.ram !== undefined ? `${metrics.ram}%` : 'Data Unavailable'}
              </p>
            </div>
          </div>
          {/* Progress Circle simulation */}
          {metrics.ram !== null && (
            <div className="relative h-12 w-12 flex items-center justify-center select-none">
              <svg className="absolute w-full h-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="transparent" />
                <circle cx="24" cy="24" r="20" stroke="#8B5CF6" strokeWidth="4" fill="transparent"
                        strokeDasharray="125.6"
                        strokeDashoffset={125.6 - (125.6 * metrics.ram) / 100} />
              </svg>
            </div>
          )}
        </div>

        {/* Disk health monitor */}
        <div className="glass-panel border border-brand-border rounded-xl p-5 flex items-center justify-between text-left">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-500/20 p-3 rounded-lg text-brand-success border border-emerald-500/20">
              <HardDrive className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs text-slate-400 font-bold uppercase">DISK FILL STATUS</h4>
              <p className="text-xl font-black text-white mt-1">
                {metrics.disk !== null && metrics.disk !== undefined ? `${metrics.disk}%` : 'Data Unavailable'}
              </p>
            </div>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase border ${
            metrics.disk !== null && metrics.disk < 90
              ? 'bg-emerald-500/10 border-emerald-500/20 text-brand-success' 
              : 'bg-rose-500/10 border-rose-500/20 text-brand-danger animate-pulse'
          }`}>
            {metrics.disk !== null ? (metrics.disk < 90 ? 'HEALTHY' : 'FULL') : 'ERROR'}
          </span>
        </div>

        {/* Network speed monitor */}
        <div className="glass-panel border border-brand-border rounded-xl p-5 flex items-center justify-between text-left">
          <div className="flex items-center gap-4">
            <div className="bg-pink-500/20 p-3 rounded-lg text-pink-400 border border-pink-500/20">
              <Wifi className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-xs text-slate-400 font-bold uppercase">REAL-TIME TRAFFIC</h4>
              <p className="text-lg font-black text-white mt-1">
                {formatBytesPerSec(metrics.netSpeed)}
              </p>
            </div>
          </div>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase border ${
            metrics.netSpeed !== null
              ? 'bg-emerald-500/10 border-emerald-500/20 text-brand-success' 
              : 'bg-rose-500/10 border-rose-500/20 text-brand-danger'
          }`}>
            {metrics.netSpeed !== null ? 'LIVE' : 'DOWN'}
          </span>
        </div>
      </section>

      {/* Main Grid Panels */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Actions (Module 1) */}
        <div className="md:col-span-2 glass-panel border border-brand-border rounded-2xl p-6 flex flex-col justify-between">
          <div className="mb-4">
            <h3 className="text-md font-bold text-slate-200">Quick Operations</h3>
            <p className="text-xs text-slate-400">One-click launchers for system maintenance modules</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={i}
                  onClick={() => setActiveTab(action.tab)}
                  className={`flex items-start gap-4 p-4 rounded-xl border border-brand-border bg-slate-950/20 transition-all duration-300 text-left cursor-pointer group ${action.color}`}
                >
                  <Icon className="h-6 w-6 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors duration-200">
                      {action.label}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 font-medium line-clamp-1">
                      {action.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Activity Log Card */}
        <div className="glass-panel border border-brand-border rounded-2xl p-6 flex flex-col h-full justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-md font-bold text-slate-200">Recent Activities</h3>
                <p className="text-xs text-slate-400">Audit logs of maintenance events</p>
              </div>
              <Layers className="h-5 w-5 text-brand-violet" />
            </div>
            
            <div className="space-y-3.5">
              {recentLogs.map((log) => (
                <div key={log.id} className="flex justify-between items-start gap-3 text-left">
                  <div className="flex items-start gap-2.5">
                    {log.status === 'success' ? (
                      <ShieldCheck className="h-4.5 w-4.5 text-brand-success shrink-0 mt-0.5 animate-pulse" />
                    ) : (
                      <ShieldAlert className="h-4.5 w-4.5 text-brand-warning shrink-0 mt-0.5" />
                    )}
                    <span className="text-xs font-semibold text-slate-200 line-clamp-1">{log.action}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-bold shrink-0">{log.time}</span>
                </div>
              ))}
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('settings')}
            className="w-full mt-6 py-2 px-4 bg-slate-800/40 hover:bg-slate-800 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:text-white transition-all duration-200"
          >
            View Diagnostics Log Folder
          </button>
        </div>
      </section>
    </div>
  );
}
