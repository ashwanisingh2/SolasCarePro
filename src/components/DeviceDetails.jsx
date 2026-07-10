import React, { useState, useEffect, useMemo } from 'react';
import {
  Monitor, Cpu, HardDrive, MemoryStick, Server, Zap, RefreshCw, Loader2, Info,
  CircuitBoard, MonitorPlay, BatteryCharging, Wifi, Shield, Boxes, Package, DownloadCloud,
  Users, Activity, Bluetooth, AlertTriangle, Radio, ChevronDown, ChevronRight,
  Search, FileJson, FileSpreadsheet, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';

// Section definitions: key must match a key emitted by scripts/device_details.ps1.
// type 'kv'   -> plain object rendered as label/value rows
// type 'list' -> array of objects, each rendered as its own sub-card
const SECTIONS = [
  { key: 'Basic',          title: 'Basic Information', icon: Info,            type: 'kv'   },
  { key: 'OS',             title: 'Operating System',  icon: Zap,             type: 'kv'   },
  { key: 'CPU',            title: 'Processor (CPU)',   icon: Cpu,             type: 'kv'   },
  { key: 'RAM',            title: 'Memory (RAM)',      icon: MemoryStick,     type: 'kv'   },
  { key: 'RAMModules',     title: 'RAM Modules',       icon: MemoryStick,     type: 'list' },
  { key: 'Storage',        title: 'Storage',           icon: HardDrive,       type: 'list' },
  { key: 'Motherboard',    title: 'Motherboard / BIOS / TPM', icon: CircuitBoard, type: 'kv' },
  { key: 'GPU',            title: 'Graphics (GPU)',    icon: MonitorPlay,     type: 'list' },
  { key: 'Display',        title: 'Display',           icon: Monitor,         type: 'list' },
  { key: 'Battery',        title: 'Battery',           icon: BatteryCharging, type: 'kv'   },
  { key: 'Network',        title: 'Network',           icon: Wifi,            type: 'kv'   },
  { key: 'Security',       title: 'Security',          icon: Shield,          type: 'kv'   },
  { key: 'Drivers',        title: 'Drivers',           icon: Boxes,           type: 'kv'   },
  { key: 'Software',       title: 'Software',          icon: Package,         type: 'kv'   },
  { key: 'WindowsUpdate',  title: 'Windows Update',    icon: DownloadCloud,   type: 'kv'   },
  { key: 'Users',          title: 'Users',             icon: Users,           type: 'list' },
  { key: 'HardwareHealth', title: 'Hardware Health',   icon: Activity,        type: 'kv'   },
  { key: 'Connectivity',   title: 'Connectivity',      icon: Bluetooth,       type: 'kv'   },
  { key: 'Events',         title: 'Event & Monitoring',icon: AlertTriangle,   type: 'kv'   },
  { key: 'Remote',         title: 'Remote Management',  icon: Radio,          type: 'kv'   },
];

const isEmpty = (v) => v == null || (typeof v === 'object' && Object.keys(v).length === 0) || (Array.isArray(v) && v.length === 0);

// A value that reads as "unavailable" gets a muted style.
const isNA = (v) => v === 'N/A' || v === 'Not Available' || v === 'None';

function KVRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-800/40 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className={`text-xs font-semibold text-right break-all ${isNA(value) ? 'text-slate-600 italic' : 'text-slate-200'}`}>
        {String(value)}
      </span>
    </div>
  );
}

function SectionCard({ section, data, expanded, onToggle, query }) {
  const Icon = section.icon;
  const q = query.trim().toLowerCase();

  // Build the rows for this section, applying the search filter.
  let body = null;
  let matchCount = 0;

  if (section.type === 'kv') {
    const entries = Object.entries(data || {}).filter(([label, value]) =>
      !q || label.toLowerCase().includes(q) || String(value).toLowerCase().includes(q)
    );
    matchCount = entries.length;
    body = entries.length ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        {entries.map(([label, value]) => <KVRow key={label} label={label} value={value} />)}
      </div>
    ) : <p className="text-xs text-slate-600 italic py-2">No data available.</p>;
  } else {
    const items = (Array.isArray(data) ? data : []).map((item, idx) => {
      const entries = Object.entries(item || {}).filter(([label, value]) =>
        !q || label.toLowerCase().includes(q) || String(value).toLowerCase().includes(q)
      );
      return { entries, idx };
    }).filter(it => it.entries.length > 0);
    matchCount = items.reduce((n, it) => n + it.entries.length, 0);
    body = items.length ? (
      <div className="space-y-3">
        {items.map(({ entries, idx }) => (
          <div key={idx} className="bg-slate-950/40 rounded-lg border border-slate-800/50 p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {entries.map(([label, value]) => <KVRow key={label} label={label} value={value} />)}
            </div>
          </div>
        ))}
      </div>
    ) : <p className="text-xs text-slate-600 italic py-2">No data available.</p>;
  }

  // While searching, hide sections with zero matches.
  if (q && matchCount === 0) return null;

  return (
    <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-800/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-brand-violet/15 border border-brand-violet/30">
            <Icon className="h-4 w-4 text-brand-violet" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">{section.title}</h3>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
      </button>
      {(expanded || q) && (
        <div className="px-5 pb-4 pt-1 border-t border-slate-800/40">{body}</div>
      )}
    </div>
  );
}

export default function DeviceDetails() {
  const { addNotification } = useNotification();
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [software, setSoftware] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadingSoftware, setLoadingSoftware] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({}); // section key -> true if collapsed
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Track first load
  const [lastFetchTime, setLastFetchTime] = useState(0); // Cache timestamp

  const fetchDetails = async (forceRefresh = false) => {
    // Cache for 5 minutes to avoid repeated slow fetches
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    if (!forceRefresh && deviceInfo && (now - lastFetchTime < CACHE_DURATION)) {
      addNotification('Device Details', 'Using cached data (refresh to get latest)', 'info');
      return;
    }
    
    setError(null);
    setLoadingInfo(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-device-details');
        if (res.success && res.stdout) {
          setDeviceInfo(JSON.parse(res.stdout));
          setLastFetchTime(now);
        } else {
          throw new Error(res.error || 'Failed to fetch device details.');
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingInfo(false);
      setIsInitialLoad(false);
    }
  };

  const fetchSoftware = async () => {
    setLoadingSoftware(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-installed-software');
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          setSoftware(Array.isArray(parsed) ? parsed : [parsed]);
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error(e);
      }
    } finally {
      setLoadingSoftware(false);
    }
  };

  useEffect(() => {
    // Fetch basic details immediately
    fetchDetails();
    
    // Defer software fetch by 500ms to avoid blocking UI
    const softwareTimer = setTimeout(() => {
      fetchSoftware();
    }, 500);
    
    return () => clearTimeout(softwareTimer);
  }, []);

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const setAll = (collapse) => {
    const next = {};
    SECTIONS.forEach(s => { next[s.key] = collapse; });
    setCollapsed(next);
  };

  // Initialize collapsed state - only expand first 3 sections by default
  useEffect(() => {
    if (deviceInfo && Object.keys(collapsed).length === 0) {
      const initialCollapsed = {};
      SECTIONS.forEach((s, idx) => {
        // Expand only first 3 sections (Basic, OS, CPU)
        initialCollapsed[s.key] = idx >= 3;
      });
      setCollapsed(initialCollapsed);
    }
  }, [deviceInfo]);

  // ---- Exports (client-side blob download; works in the Electron renderer) ----
  const download = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    addNotification('Device Details', `Exported ${filename}`, 'success');
  };

  const flatRows = useMemo(() => {
    if (!deviceInfo) return [];
    const rows = [];
    SECTIONS.forEach(({ key, title, type }) => {
      const data = deviceInfo[key];
      if (isEmpty(data)) return;
      if (type === 'kv') {
        Object.entries(data).forEach(([label, value]) => rows.push([title, label, value]));
      } else if (Array.isArray(data)) {
        data.forEach((item, i) => Object.entries(item || {}).forEach(([label, value]) =>
          rows.push([`${title} #${i + 1}`, label, value])));
      }
    });
    return rows;
  }, [deviceInfo]);

  const exportJSON = () => download(`device-details-${Date.now()}.json`, JSON.stringify(deviceInfo, null, 2), 'application/json');
  const exportCSV = () => {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = ['Category,Field,Value', ...flatRows.map(r => r.map(esc).join(','))].join('\r\n');
    download(`device-details-${Date.now()}.csv`, csv, 'text/csv');
  };
  const printReport = () => window.print();

  const deviceName = deviceInfo?.Basic?.['Device Name (Hostname)'];

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Device Details</h2>
          <p className="text-xs text-slate-400 mt-1">
            Complete hardware, OS, security &amp; connectivity inventory{deviceName && deviceName !== 'N/A' ? ` — ${deviceName}` : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportJSON} disabled={!deviceInfo} title="Export JSON"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-lg cursor-pointer transition-colors">
            <FileJson className="h-4 w-4" /> JSON
          </button>
          <button onClick={exportCSV} disabled={!deviceInfo} title="Export CSV"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-lg cursor-pointer transition-colors">
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </button>
          <button onClick={printReport} disabled={!deviceInfo} title="Print / Save as PDF"
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold rounded-lg cursor-pointer transition-colors">
            <Printer className="h-4 w-4" /> PDF
          </button>
          <button onClick={() => { fetchDetails(true); fetchSoftware(); }} disabled={loadingInfo} title="Refresh"
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-violet hover:bg-brand-violet/85 disabled:opacity-40 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors">
            <RefreshCw className={`h-4 w-4 ${loadingInfo ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-brand-border rounded-xl p-1">
        <button onClick={() => setActiveTab('details')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${activeTab === 'details' ? 'bg-brand-violet text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
          <Server className="h-4 w-4" /> Device Details
        </button>
        <button onClick={() => setActiveTab('software')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${activeTab === 'software' ? 'bg-brand-violet text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}>
          <Monitor className="h-4 w-4" /> Installed Software {software.length > 0 && `(${software.length})`}
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Search + expand controls */}
              {deviceInfo && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search any field (e.g. IP, TPM, RAM, Serial)..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-brand-border rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet/60"
                    />
                  </div>
                  <button onClick={() => setAll(false)} className="text-xs font-semibold text-slate-400 hover:text-white px-2 py-2 cursor-pointer">Expand all</button>
                  <button onClick={() => setAll(true)} className="text-xs font-semibold text-slate-400 hover:text-white px-2 py-2 cursor-pointer">Collapse all</button>
                </div>
              )}

              {loadingInfo ? (
                isInitialLoad ? (
                  // Skeleton loader for initial load
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className="glass-panel border border-brand-border rounded-xl p-5 animate-pulse">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 bg-slate-800 rounded-lg"></div>
                          <div className="h-4 bg-slate-800 rounded w-32"></div>
                        </div>
                        <div className="space-y-2">
                          <div className="h-3 bg-slate-800/60 rounded w-full"></div>
                          <div className="h-3 bg-slate-800/60 rounded w-5/6"></div>
                          <div className="h-3 bg-slate-800/60 rounded w-4/6"></div>
                        </div>
                      </div>
                    ))}
                    <div className="text-center mt-4">
                      <p className="text-xs text-slate-500 font-semibold">Loading device information...</p>
                      <p className="text-xs text-slate-600 mt-1">This may take 10-30 seconds on first load</p>
                    </div>
                  </div>
                ) : (
                  // Simple spinner for refresh
                  <div className="glass-panel border border-brand-border rounded-xl p-12 text-center space-y-3">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
                    <p className="text-xs text-slate-500 font-semibold animate-pulse">Refreshing device information...</p>
                  </div>
                )
              ) : error ? (
                <div className="glass-panel border border-rose-500/30 rounded-xl p-8 text-center space-y-3">
                  <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto" />
                  <p className="text-rose-400 text-sm font-bold">{error}</p>
                  <button onClick={() => fetchDetails(true)} className="text-xs px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white cursor-pointer">Retry</button>
                </div>
              ) : deviceInfo ? (
                <div className="space-y-3">
                  {SECTIONS.map(section => (
                    <SectionCard
                      key={section.key}
                      section={section}
                      data={deviceInfo[section.key]}
                      expanded={!collapsed[section.key]}
                      onToggle={() => toggleSection(section.key)}
                      query={query}
                    />
                  ))}
                </div>
              ) : (
                <div className="glass-panel border border-brand-border rounded-xl p-12 text-center text-slate-500 text-xs">
                  Device details are only available inside the desktop app.
                </div>
              )}
            </div>
          )}

          {activeTab === 'software' && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-brand-violet" /> Installed Applications
                </h3>
                <button onClick={fetchSoftware} className="text-slate-500 hover:text-white transition-colors cursor-pointer" disabled={loadingSoftware}>
                  <RefreshCw className={`h-4 w-4 ${loadingSoftware ? 'animate-spin' : ''}`} />
                </button>
              </div>
              {loadingSoftware ? (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
                  <p className="text-xs text-slate-500 font-semibold animate-pulse">Enumerating installed software...</p>
                </div>
              ) : (
                <div className="max-h-[560px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {software.length > 0 ? (
                    software.map((app, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 rounded bg-slate-950/30 border border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-200">{app.DisplayName}</p>
                          <p className="text-xs text-slate-500">{app.Publisher || 'Unknown Publisher'}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {app.DisplayVersion || 'N/A'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-slate-500 text-xs">No software found or unable to read registry.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
