import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip
} from 'recharts';
import {
  Network, Wifi, WifiOff, ArrowDown, ArrowUp, RefreshCw, Loader2,
  Server, Shield, Activity, Play, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSystemMetrics } from '../context/SystemMetricsContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import { formatBytesPerSec } from '../utils/formatters';

const TABS = [
  { id: 'live',    label: 'Live Traffic', icon: Activity },
  { id: 'adapters',label: 'Adapters',     icon: Server },
  { id: 'dns',     label: 'DNS & Reset',  icon: Shield },
];

export default function NetworkMonitor() {
  const [activeTab, setActiveTab] = useState('live');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-200">Network Monitor</h2>
        <p className="text-xs text-slate-400 mt-1">Live traffic, adapter info, DNS status, and network reset tools.</p>
      </div>

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

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'live'     && <LiveTrafficTab />}
          {activeTab === 'adapters' && <AdaptersTab />}
          {activeTab === 'dns'      && <DnsResetTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// =====================================================================
// Tab 1: Live Traffic (preserves existing speed chart logic)
// =====================================================================
function LiveTrafficTab() {
  const { systemMetrics } = useSystemMetrics();
  const [speedHistory, setSpeedHistory] = useState([]);
  const [networkInfo, setNetworkInfo] = useState({ download: 0, upload: 0, total: 0 });
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [pingResult, setPingResult] = useState(null);
  const [pinging, setPinging] = useState(false);
  const [pingHost, setPingHost] = useState('8.8.8.8');

  useEffect(() => {
    if (systemMetrics && systemMetrics.netSpeed !== undefined && systemMetrics.netSpeed !== null) {
      const bytesPerSec = systemMetrics.netSpeed;
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSpeedHistory(prev => [...prev, { time: timestamp, speed: Math.round(bytesPerSec / 1024) }].slice(-30));
      setNetworkInfo({
        download: Math.round(bytesPerSec * 0.8),
        upload: Math.round(bytesPerSec * 0.2),
        total: bytesPerSec
      });
    }
  }, [systemMetrics]);

  useEffect(() => {
    let active = true;
    const checkConn = async () => {
      try {
        if (window.api) {
          const connTest = await window.api.runSystemCommand('detect-network');
          if (active) {
            let connected = false;
            try {
              const parsed = JSON.parse(connTest.stdout);
              connected = parsed.status === 'connected';
            } catch (e) {
              connected = connTest.success && connTest.exitCode === 0;
            }
            setConnectionStatus(connected ? 'connected' : 'disconnected');
          }
        } else {
          if (active) setConnectionStatus('connected');
        }
      } catch (e) { console.error('Connectivity check failed:', e); }
    };
    checkConn();
    const interval = setInterval(checkConn, 10000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const runPing = async () => {
    if (!pingHost) return;
    setPinging(true);
    setPingResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-ping-test', [pingHost]);
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\{[\s\S]*\}/);
          if (m) setPingResult(JSON.parse(m[0]));
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        setPingResult({ success: true, avgMs: 18, packetLossPct: 0, output: 'Reply from 8.8.8.8: bytes=32 time=18ms TTL=118' });
      }
    } catch (e) {
      setPingResult({ success: false, error: e.message });
    } finally {
      setPinging(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold self-start w-fit ${
        connectionStatus === 'connected'
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
      }`}>
        {connectionStatus === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
        {connectionStatus === 'connected' ? 'Connected' : 'Disconnected'}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-500/20 p-2 rounded-lg"><ArrowDown className="h-5 w-5 text-emerald-400" /></div>
            <span className="text-xs text-slate-400 font-bold uppercase">Download</span>
          </div>
          <p className="text-2xl font-black text-emerald-400">{formatBytesPerSec(networkInfo.download)}</p>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500/20 p-2 rounded-lg"><ArrowUp className="h-5 w-5 text-blue-400" /></div>
            <span className="text-xs text-slate-400 font-bold uppercase">Upload</span>
          </div>
          <p className="text-2xl font-black text-blue-400">{formatBytesPerSec(networkInfo.upload)}</p>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-violet-500/20 p-2 rounded-lg"><Network className="h-5 w-5 text-violet-400" /></div>
            <span className="text-xs text-slate-400 font-bold uppercase">Total</span>
          </div>
          <p className="text-2xl font-black text-violet-400">{formatBytesPerSec(networkInfo.total)}</p>
        </div>
      </div>

      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-4">Speed History (KB/s)</h4>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={speedHistory}>
              <XAxis dataKey="time" stroke="#475569" fontSize={9} />
              <YAxis stroke="#475569" fontSize={9} />
              <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }} />
              <Line type="monotone" dataKey="speed" stroke="#8B5CF6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ping test */}
      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-cyan" /> Ping Test
        </h4>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={pingHost}
            onChange={(e) => setPingHost(e.target.value)}
            placeholder="Hostname or IP (e.g. 8.8.8.8)"
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet"
          />
          <button
            onClick={runPing}
            disabled={pinging || !pingHost}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
          >
            {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Ping
          </button>
        </div>
        {pingResult && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950/40 border border-brand-border rounded p-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Avg Latency</div>
              <div className={`text-sm font-black mt-0.5 ${
                !pingResult.success ? 'text-rose-400' :
                pingResult.avgMs < 50 ? 'text-emerald-400' :
                pingResult.avgMs < 150 ? 'text-amber-400' : 'text-rose-400'
              }`}>
                {pingResult.success ? `${pingResult.avgMs} ms` : 'Failed'}
              </div>
            </div>
            <div className="bg-slate-950/40 border border-brand-border rounded p-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Packet Loss</div>
              <div className={`text-sm font-black mt-0.5 ${
                (pingResult.packetLossPct || 0) === 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>{pingResult.packetLossPct || 0}%</div>
            </div>
            <div className="bg-slate-950/40 border border-brand-border rounded p-2">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Range</div>
              <div className="text-sm font-black mt-0.5 text-slate-300">
                {pingResult.success ? `${pingResult.minMs}–${pingResult.maxMs} ms` : 'N/A'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Tab 2: Adapters
// =====================================================================
function AdaptersTab() {
  const [adapters, setAdapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetchAdapters = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-network-adapters');
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\[[\s\S]*\]/);
          if (m) {
            setAdapters(JSON.parse(m[0]));
          } else {
            // Single adapter (no array wrapper)
            const single = res.stdout.trim().match(/^\{[\s\S]*\}$/);
            if (single) setAdapters([JSON.parse(single[0])]);
            else setAdapters([]);
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 600));
        setAdapters([
          { name: 'Wi-Fi', macAddress: 'A4:C3:F0:XX:XX:XX', ipAddress: '192.168.1.105', status: 'Up', type: 'Wireless', linkSpeed: '866.7 Mbps' },
          { name: 'Ethernet', macAddress: '00:1A:2B:XX:XX:XX', ipAddress: 'Not connected', status: 'Down', type: 'Ethernet', linkSpeed: '0 bps' },
        ]);
      }
    } catch (e) {
      setAdapters([]);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  };

  useEffect(() => { fetchAdapters(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase">Network Adapters ({adapters.length})</h4>
        <button
          onClick={fetchAdapters}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-[11px] font-bold rounded border border-brand-border text-slate-300 flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {loading && !fetched ? (
        <div className="py-12 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-xs text-slate-400">Enumerating adapters...</p>
        </div>
      ) : adapters.length === 0 ? (
        <div className="py-12 text-center">
          <AlertTriangle className="h-10 w-10 text-slate-600 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No adapters found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {adapters.map((a, i) => {
            const isUp = a.status === 'Up';
            return (
              <div key={i} className="glass-panel border border-brand-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-3 h-3 rounded-full mt-1.5 ${isUp ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                    <div>
                      <div className="text-sm font-bold text-slate-200">{a.name}</div>
                      <div className="text-[10px] text-slate-500">{a.description || ''}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      a.type === 'Wireless' ? 'bg-cyan-500/20 text-cyan-400' :
                      a.type === 'Bluetooth' ? 'bg-blue-500/20 text-blue-400' :
                      a.type === 'Virtual' ? 'bg-slate-700 text-slate-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>{a.type}</span>
                    {a.linkSpeed && <span className="text-[10px] text-slate-500">{a.linkSpeed}</span>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">MAC Address</div>
                    <div className="font-mono text-slate-300 mt-0.5">{a.macAddress || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold">IP Address</div>
                    <div className={`font-mono mt-0.5 ${a.ipAddress === 'Not connected' ? 'text-slate-500' : 'text-emerald-400'}`}>{a.ipAddress || '—'}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Tab 3: DNS & Reset
// =====================================================================
function DnsResetTab() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [dnsStatus, setDnsStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const logRef = useRef(null);

  const fetchDns = async () => {
    try {
      if (window.api) {
        const result = await window.api.getDnsStatus();
        setDnsStatus(result);
      } else {
        setDnsStatus({ primary: '8.8.8.8', secondary: '8.8.4.4' });
      }
    } catch (e) {
      setDnsStatus(null);
    }
  };

  useEffect(() => { fetchDns(); }, []);

  useEffect(() => {
    if (!window.api?.onStream) return undefined;
    return window.api.onStream('care-out', (data) => {
      setLogLines(prev => [...prev, ...data.split('\n').filter(Boolean)].slice(-8));
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    });
  }, []);

  const appendLog = (line) => setLogLines(prev => [...prev, line].slice(-8));

  const runWithConfirm = async (cmdKey, label) => {
    const ok = await confirm({
      title: label,
      message: `This will run "${label}". Network connectivity may be briefly interrupted. Continue?`,
      confirmLabel: 'Run',
      danger: true,
    });
    if (!ok) return;
    setBusy(cmdKey);
    appendLog(`[RUN] ${label}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand(cmdKey);
        if (res.success) {
          addNotification(label, 'Completed successfully.', 'success');
          appendLog(`[OK] ${label} completed.`);
        } else {
          addNotification(label, res.error || 'Failed.', 'error');
          appendLog(`[ERR] ${label} failed: ${res.error || 'unknown'}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        addNotification(label, 'Mock completed.', 'success');
        appendLog(`[OK] ${label} (mock) completed.`);
      }
    } catch (e) {
      addNotification(label, e.message, 'error');
      appendLog(`[ERR] ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runSimple = async (cmdKey, label) => {
    setBusy(cmdKey);
    appendLog(`[RUN] ${label}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand(cmdKey);
        if (res.success) {
          addNotification(label, 'Completed successfully.', 'success');
          appendLog(`[OK] ${label} completed.`);
        } else {
          addNotification(label, res.error || 'Failed.', 'error');
          appendLog(`[ERR] ${label} failed: ${res.error || 'unknown'}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        addNotification(label, 'Mock completed.', 'success');
        appendLog(`[OK] ${label} (mock) completed.`);
      }
    } catch (e) {
      addNotification(label, e.message, 'error');
      appendLog(`[ERR] ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* DNS Status */}
      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-brand-cyan" /> Current DNS Servers
        </h4>
        {dnsStatus ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold">Primary</div>
              <div className="font-mono text-emerald-400 mt-0.5">{dnsStatus.primary || 'Not configured'}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold">Secondary</div>
              <div className="font-mono text-cyan-400 mt-0.5">{dnsStatus.secondary || 'Not configured'}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">DNS status unavailable.</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ActionCard
          label="Flush DNS Cache"
          description="Clears the DNS resolver cache. Safe, no network interruption."
          icon={RefreshCw}
          color="cyan"
          running={busy === 'flush-dns'}
          onClick={() => runSimple('flush-dns', 'Flush DNS Cache')}
        />
        <ActionCard
          label="Reset Winsock"
          description="Resets the Winsock catalog. Requires reboot. Network drops briefly."
          icon={Network}
          color="amber"
          running={busy === 'repair-winsock'}
          onClick={() => runWithConfirm('repair-winsock', 'Reset Winsock')}
        />
        <ActionCard
          label="Reset TCP/IP"
          description="Resets TCP/IP stack to defaults. Requires reboot. Network drops briefly."
          icon={Shield}
          color="rose"
          running={busy === 'repair-tcpip'}
          onClick={() => runWithConfirm('repair-tcpip', 'Reset TCP/IP')}
        />
      </div>

      {/* Live log */}
      <div className="glass-panel border border-brand-border rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Operation Log</h4>
        <div
          ref={logRef}
          className="p-3 bg-slate-950/60 border border-brand-border rounded font-mono text-[10px] text-slate-300 h-32 overflow-y-auto"
        >
          {logLines.length === 0 ? 'No operations yet.' : logLines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}

function ActionCard({ label, description, icon: Icon, color, running, onClick }) {
  const colorMap = {
    cyan: 'border-cyan-500/30 hover:border-cyan-500/60 text-cyan-400',
    amber: 'border-amber-500/30 hover:border-amber-500/60 text-amber-400',
    rose: 'border-rose-500/30 hover:border-rose-500/60 text-rose-400',
  };
  return (
    <button
      onClick={onClick}
      disabled={running}
      className={`glass-panel rounded-xl p-4 border text-left transition-all disabled:opacity-50 cursor-pointer ${colorMap[color]}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        <span className="text-xs font-bold text-slate-200">{label}</span>
      </div>
      <p className="text-[10px] text-slate-500">{description}</p>
    </button>
  );
}
