import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Download, FileText, FolderOpen, Loader2, RefreshCw,
  ShieldCheck, Terminal, Clock, CalendarDays, Trash2,
  AlertTriangle, CheckCircle2, ChevronRight, X, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDate } from '../utils/formatters';
import { useDebounced } from '../utils/hooks';

export default function HistoryLogs() {
  const [subView, setSubView] = useState('history'); // 'history' or 'raw'
  const [history, setHistory] = useState([]);
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Diagnostic logs and repair history ready.');
  const [selectedEntry, setSelectedEntry] = useState(null);
  const rawConsoleEndRef = useRef(null);
  // IMPROVEMENT: search + result filter + category filter
  const [search, setSearch] = useState('');
  const [resultFilter, setResultFilter] = useState('All'); // All | SUCCESS | FAILURE
  const debouncedSearch = useDebounced(search, 200);

  const loadHistory = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const result = await window.api.runSystemCommand('read-repair-history');
        if (result.success && result.stdout && result.stdout.trim()) {
          setRawText(result.stdout);
          const lines = result.stdout.trim().split('\n').filter(Boolean);
          const parsed = lines.map((line, idx) => {
            try {
              return { ...JSON.parse(line), id: idx };
            } catch {
              return { timestamp: '', action: 'System Log', result: 'INFO', error: line, id: idx };
            }
          }).reverse(); // Latest first
          setHistory(parsed);
          setStatus(`Loaded ${lines.length} repair entries.`);
        } else {
          // Real history is empty - do NOT show mock data here (misleading).
          // Only show mocks in pure-web (non-Electron) preview mode below.
          setHistory([]);
          setRawText('');
          setStatus('No repair history yet. Run a repair operation to populate this log.');
        }
      } else {
        setMockHistory();
        setStatus('Web preview: showing sample entries (not connected to Electron).');
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      setStatus(`Failed to read history: ${error.message}`);
      setHistory([]);
      setRawText('');
    } finally {
      setLoading(false);
    }
  };

  const setMockHistory = () => {
    const mockData = [
      {
        id: 0,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        action: 'junk-clean',
        details: { type: 'Junk Files', size: '1.2GB removed' },
        result: 'SUCCESS',
        error: null,
        user: 'Administrator'
      },
      {
        id: 1,
        timestamp: new Date(Date.now() - 14400000).toISOString(),
        action: 'repair-system-sfc',
        details: { type: 'System File Check', duration: '12 minutes' },
        result: 'SUCCESS',
        error: null,
        user: 'System'
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        action: 'flush-dns',
        details: { type: 'Network Optimization', dns: 'Flushed' },
        result: 'SUCCESS',
        error: null,
        user: 'Administrator'
      },
      {
        id: 3,
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        action: 'schedule-care',
        details: { type: 'Scheduled Task', day: 'Sunday', time: '03:00' },
        result: 'SUCCESS',
        error: null,
        user: 'System'
      },
      {
        id: 4,
        timestamp: new Date(Date.now() - 259200000).toISOString(),
        action: 'create-restore-point',
        details: { type: 'System Restore Point' },
        result: 'FAILURE',
        error: 'System Protection disabled on C: drive',
        user: 'Administrator'
      }
    ];
    setHistory(mockData);
    setRawText(mockData.map(m => JSON.stringify(m)).join('\n'));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (subView === 'raw' && rawConsoleEndRef.current) {
      rawConsoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [subView, rawText]);

  const openLogs = async () => {
    if (window.api?.openLogsFolder) {
      await window.api.openLogsFolder();
      setStatus('Opened local logs folder in Windows Explorer.');
    } else {
      setStatus('Folder open is only supported in desktop app.');
    }
  };

  const exportLogs = async () => {
    setStatus('Exporting Windows event logs...');
    if (window.api) {
      const result = await window.api.runSystemCommand('export-event-logs');
      setStatus(result?.success ? 'Diagnostic event logs (.evtx) exported to TEMP.' : result?.error || 'Export failed.');
    } else {
      setStatus('Event export is only supported in desktop app.');
    }
  };

  // IMPROVEMENT: export the currently-visible (filtered) history array as JSON.
  const exportVisibleJson = () => {
    if (filteredHistory.length === 0) {
      setStatus('Nothing to export - no matching entries.');
      return;
    }
    try {
      const blob = new Blob([JSON.stringify(filteredHistory, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `solas_history_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus(`Exported ${filteredHistory.length} entries to JSON.`);
    } catch (e) {
      setStatus('Export failed: ' + e.message);
    }
  };

  // IMPROVEMENT: memoized filtered+searched history. Previously the entire
  // list rendered with no filtering/search capability.
  const filteredHistory = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return history.filter(h => {
      if (resultFilter !== 'All' && h.result !== resultFilter) return false;
      if (!q) return true;
      return (
        (h.action || '').toLowerCase().includes(q) ||
        (h.error || '').toLowerCase().includes(q) ||
        JSON.stringify(h.details || {}).toLowerCase().includes(q)
      );
    });
  }, [history, debouncedSearch, resultFilter]);



  const getActionLabel = (action) => {
    const labels = {
      'junk-clean': 'Junk Cleanup',
      'repair-system-sfc': 'System File Check (SFC)',
      'repair-system-dism': 'Component Store Repair (DISM)',
      'repair-winsock': 'Winsock Interface Reset',
      'repair-tcpip': 'TCP/IP Config Reset',
      'repair-file-permissions': 'User Permission Fix',
      'repair-registry-permissions': 'Security Policies Reset',
      'repair-windows-update': 'Update Components Repair',
      'repair-temp-cleanup': 'Temporary Folder Cleanup',
      'repair-cache-cleanup': 'Store & App Cache Cleanup',
      'flush-dns': 'DNS Cache Flush',
      'scan-drivers': 'PnP Drivers Diagnostic',
      'driver-action': 'PnP Reset Action',
      'schedule-care': 'Automated Task Registry',
      'create-restore-point': 'System Restore Checkpoint',
      'install-windows-updates': 'Windows Update Installation',
      'toggle-startup-app': 'Startup Application Toggle'
    };
    return labels[action] || action;
  };

  const getActionIcon = (action) => {
    const act = String(action).toLowerCase();
    if (act.includes('junk') || act.includes('cleanup') || act.includes('clean')) return <Trash2 className="h-4 w-4 text-brand-cyan" />;
    if (act.includes('sfc') || act.includes('dism') || act.includes('update')) return <RefreshCw className="h-4 w-4 text-brand-violet" />;
    if (act.includes('network') || act.includes('dns') || act.includes('winsock') || act.includes('tcpip')) return <AlertTriangle className="h-4 w-4 text-pink-400" />;
    if (act.includes('driver')) return <FileText className="h-4 w-4 text-amber-400" />;
    if (act.includes('schedule') || act.includes('restore')) return <CalendarDays className="h-4 w-4 text-emerald-400" />;
    return <CheckCircle2 className="h-4 w-4 text-brand-success" />;
  };

  const successfulRepairs = history.filter(h => h.result === 'SUCCESS').length;
  const failedRepairs = history.filter(h => h.result === 'FAILURE').length;
  const successRate = history.length > 0 ? Math.round((successfulRepairs / history.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6 text-left">
      {/* Top Header */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-brand-border pb-4 select-none">
        <div>
          <h2 className="text-xl font-bold text-slate-200">History & Logs</h2>
          <p className="text-xs text-slate-400">
            View repair history timeline or analyze raw diagnostics and application log execution paths
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={loadHistory} className="flex items-center gap-2 rounded-xl border border-brand-border bg-slate-900 px-4 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 cursor-pointer">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-violet" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button onClick={exportLogs} className="flex items-center gap-2 rounded-xl border border-brand-border bg-slate-900 px-4 py-2 text-xs font-black text-slate-200 hover:bg-slate-800 cursor-pointer">
            <Download className="h-4 w-4 text-brand-cyan" />
            Export System Logs
          </button>
          <button onClick={openLogs} className="flex items-center gap-2 rounded-xl bg-brand-violet/20 border border-brand-violet/40 px-4 py-2 text-xs font-black text-white hover:bg-brand-violet/30 cursor-pointer">
            <FolderOpen className="h-4 w-4" />
            Browse Files
          </button>
        </div>
      </section>

      {/* Segmented Sub-view Controller */}
      <div className="flex bg-slate-950/40 border border-brand-border rounded-xl p-1 select-none w-max">
        <button
          onClick={() => setSubView('history')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            subView === 'history' ? 'bg-brand-violet/20 border border-brand-violet/30 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="h-4 w-4" />
          Repair History (Timeline)
        </button>
        <button
          onClick={() => setSubView('raw')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            subView === 'raw' ? 'bg-brand-violet/20 border border-brand-violet/30 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Terminal className="h-4 w-4" />
          Raw System Logs
        </button>
      </div>

      {/* Metrics Cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 select-none">
        {[
          ['Total Operations', history.length, Clock, 'text-brand-violet bg-brand-violet/10'],
          ['Successful Actions', successfulRepairs, CheckCircle2, 'text-brand-success bg-emerald-950/20'],
          ['Failed Attempts', failedRepairs, X, 'text-brand-danger bg-rose-950/20'],
          ['Success Ratio', `${successRate}%`, ShieldCheck, 'text-brand-cyan bg-brand-cyan/10']
        ].map(([label, value, Icon, colorClass]) => (
          <div key={label} className="glass-panel border border-brand-border rounded-2xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase">{label}</p>
              <p className="text-lg font-black text-slate-100">{value}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Active Panel View */}
      {subView === 'history' ? (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left list */}
          <div className="lg:col-span-2 glass-panel border border-brand-border rounded-2xl p-5">
            <div className="flex items-center justify-between border-b border-brand-border/60 pb-3 mb-4 select-none">
              <h3 className="text-sm font-bold text-slate-300 uppercase">Repair Logs Timeline</h3>
              <span className="text-[10px] text-slate-500 font-semibold">{status}</span>
            </div>

            {/* IMPROVEMENT: search + result filter chips + export-visible button */}
            {history.length > 0 && (
              <div className="flex flex-wrap gap-3 items-center mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by action, error, or details..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950/40 border border-brand-border rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-violet"
                  />
                </div>
                <div className="flex gap-1">
                  {['All', 'SUCCESS', 'FAILURE'].map(r => (
                    <button
                      key={r}
                      onClick={() => setResultFilter(r)}
                      className={`px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer border transition-colors ${
                        resultFilter === r
                          ? 'bg-brand-violet/20 border-brand-violet text-brand-violet'
                          : 'bg-slate-800/40 border-brand-border text-slate-400 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <button
                  onClick={exportVisibleJson}
                  className="px-3 py-1.5 text-[10px] font-bold rounded cursor-pointer border border-brand-border bg-slate-800/40 text-slate-300 hover:bg-slate-700 flex items-center gap-1"
                  title="Export the currently filtered entries as JSON"
                >
                  <Download className="h-3 w-3" /> Export Visible
                </button>
              </div>
            )}

            <div className="max-h-[460px] overflow-y-auto space-y-3 pr-1">
              {history.length === 0 ? (
                <div className="py-12 text-center text-xs font-semibold text-slate-500">No logs found in registry database.</div>
              ) : filteredHistory.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-xs font-semibold text-slate-500">No entries match the current filter.</p>
                  <button onClick={() => { setSearch(''); setResultFilter('All'); }} className="mt-2 text-xs text-brand-violet cursor-pointer">Clear filters</button>
                </div>
              ) : (
                filteredHistory.map((item, index) => (
                  <motion.div
                    key={item.id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.04, 0.4) }}
                    onClick={() => setSelectedEntry(item)}
                    className={`glass-panel border rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer transition hover:border-slate-500 bg-slate-900/40 hover:bg-slate-900/80 ${
                      selectedEntry?.id === item.id ? 'border-brand-violet/50 bg-brand-violet/5' : 'border-brand-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.result === 'SUCCESS' ? 'bg-emerald-950/30' : 'bg-rose-950/30'
                      }`}>
                        {getActionIcon(item.action)}
                      </div>
                      <div className="min-w-0 text-left">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{getActionLabel(item.action)}</h4>
                        <p className="text-[9px] text-slate-500 font-mono mt-0.5">{formatDate(item.timestamp)} | By {item.user || 'System'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        item.result === 'SUCCESS' ? 'bg-emerald-500/20 text-brand-success' : 'bg-rose-500/20 text-brand-danger'
                      }`}>
                        {item.result}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-600" />
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Right Details Panel */}
          <div className="glass-panel border border-brand-border rounded-2xl p-5 min-h-[350px] flex flex-col justify-between">
            <div>
              <div className="border-b border-brand-border/60 pb-3 mb-4 select-none">
                <h3 className="text-sm font-bold text-slate-300 uppercase">Log Entry Details</h3>
              </div>
              {selectedEntry ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <span className="text-slate-500 block uppercase text-[9px] font-bold">Action Name</span>
                    <span className="text-slate-200 font-bold text-sm">{getActionLabel(selectedEntry.action)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold">Timestamp</span>
                      <span className="text-slate-300 font-mono">{formatDate(selectedEntry.timestamp)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold">Operator</span>
                      <span className="text-slate-300 font-mono">{selectedEntry.user || 'System'}</span>
                    </div>
                  </div>

                  {selectedEntry.details && Object.keys(selectedEntry.details).length > 0 && (
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold mb-1.5">Parameters/Info</span>
                      <div className="bg-slate-950/40 border border-brand-border rounded-lg p-2.5 space-y-1 font-mono text-[10px]">
                        {Object.entries(selectedEntry.details).map(([key, val]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-slate-500">{key}:</span>
                            <span className="text-slate-300">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedEntry.error && (
                    <div>
                      <span className="text-slate-500 block uppercase text-[9px] font-bold mb-1.5">Error Message</span>
                      <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-2.5 text-brand-danger font-mono text-[10px] break-all leading-normal">
                        {selectedEntry.error}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2 select-none">
                  <FileText className="h-8 w-8 opacity-40 text-slate-400" />
                  <p>Select any timeline log entry to view full execution parameters.</p>
                </div>
              )}
            </div>
            {selectedEntry && (
              <button
                onClick={() => setSelectedEntry(null)}
                className="w-full mt-4 py-2 border border-slate-700 bg-slate-900/50 hover:bg-slate-900 rounded-lg text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                Clear Selection
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="glass-panel border border-brand-border rounded-2xl p-5 flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-3 select-none">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-brand-cyan shrink-0" />
              <h3 className="text-sm font-bold text-slate-200 uppercase">Raw Diagnostics Terminal</h3>
            </div>
          </div>
          <div className="flex-1 bg-black/80 border border-brand-border rounded-xl p-4 font-mono text-[10px] text-slate-300 overflow-y-auto leading-relaxed select-text shadow-inner">
            {rawText.trim() === '' ? (
              <p className="text-slate-500 font-bold italic">Console idle. No raw logs found.</p>
            ) : (
              rawText.split('\n').map((line, index) => {
                let isSuccess = line.includes('"SUCCESS"');
                let isFailure = line.includes('"FAILURE"');
                return (
                  <p 
                    key={index} 
                    className={
                      isFailure ? 'text-brand-danger' : 
                      isSuccess ? 'text-brand-success' : 
                      'text-slate-300'
                    }
                  >
                    {line}
                  </p>
                );
              })
            )}
            <div ref={rawConsoleEndRef} />
          </div>
        </section>
      )}
    </div>
  );
}
