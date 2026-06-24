import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, RefreshCw, CalendarDays, Play, Trash2,
  CheckCircle2, X, AlertTriangle, Terminal, FileText
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function RepairHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepair, setSelectedRepair] = useState(null);

  useEffect(() => {
    loadRepairHistory();
  }, []);

  const loadRepairHistory = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('read-repair-history');
        if (res.success && res.stdout) {
          try {
            const entries = JSON.parse(res.stdout);
            setHistory(entries.map((entry, idx) => ({ ...entry, id: idx })));
          } catch {
            // If not JSON, parse line by line
            const lines = res.stdout.trim().split('\n').filter(Boolean);
            const parsed = lines.map(line => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            }).filter(Boolean).map((entry, idx) => ({ ...entry, id: idx }));
            setHistory(parsed);
          }
        } else {
          // Use mock data for web dev testing
          setMockHistory();
        }
      } else {
        setMockHistory();
      }
    } catch (e) {
      console.error('Failed to load repair history:', e);
      setMockHistory();
    } finally {
      setLoading(false);
    }
  };

  const setMockHistory = () => {
    setHistory([
      {
        id: 0,
        timestamp: '2026-06-23T10:30:00',
        action: 'junk-clean',
        details: { type: 'Junk Files', size: '1.2GB removed' },
        result: 'SUCCESS',
        error: null,
        user: 'Ashwani'
      },
      {
        id: 1,
        timestamp: '2026-06-22T15:45:00',
        action: 'run-sfc-scan',
        details: { type: 'System File Check', duration: '12 minutes' },
        result: 'SUCCESS',
        error: null,
        user: 'Ashwani'
      },
      {
        id: 2,
        timestamp: '2026-06-21T09:15:00',
        action: 'network-reset',
        details: { type: 'Network Optimization', dns: 'Flushed' },
        result: 'SUCCESS',
        error: null,
        user: 'Ashwani'
      },
      {
        id: 3,
        timestamp: '2026-06-20T22:00:00',
        action: 'schedule-care',
        details: { type: 'Scheduled Task', day: 'Sunday', time: '03:00' },
        result: 'SUCCESS',
        error: null,
        user: 'Ashwani'
      },
      {
        id: 4,
        timestamp: '2026-06-19T14:30:00',
        action: 'scan-drivers',
        details: { type: 'Driver Scan', found: 3, updated: 2 },
        result: 'SUCCESS',
        error: null,
        user: 'Ashwani'
      },
      {
        id: 5,
        timestamp: '2026-06-18T11:20:00',
        action: 'create-restore-point',
        details: { type: 'System Restore Point', sequence: 45 },
        result: 'FAILURE',
        error: 'System Protection disabled on C:',
        user: 'Ashwani'
      }
    ]);
  };

  const formatDate = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  };

  const getActionLabel = (action) => {
    const labels = {
      'junk-clean': 'Junk Cleanup',
      'run-sfc-scan': 'System File Check',
      'network-reset': 'Network Reset',
      'schedule-care': 'Scheduled Maintenance',
      'scan-drivers': 'Driver Scan',
      'create-restore-point': 'System Restore Point',
      'repair-system-sfc': 'System Repair (SFC)',
      'repair-system-dism': 'System Repair (DISM)',
      'repair-winsock': 'Winsock Reset',
      'repair-tcpip': 'TCP/IP Reset',
      'repair-windows-update': 'Windows Update Repair',
      'repair-temp-cleanup': 'Temp Files Cleanup',
      'repair-cache-cleanup': 'Cache Cleanup',
      'repair-bsod': 'BSOD Repair',
      'repair-store': 'Microsoft Store Repair',
      'repair-onedrive': 'OneDrive Reset',
      'repair-print-spooler': 'Print Spooler Fix',
      'repair-firewall-service': 'Firewall Enable',
      'repair-defender-service': 'Defender Enable',
      'repair-wmi': 'WMI Repair',
      'repair-bcd-rebuild': 'Boot Record Repair',
      'update-software': 'Software Update',
      'run-trim': 'SSD TRIM'
    };
    return labels[action] || action;
  };

  const getActionIcon = (action) => {
    if (action.includes('junk') || action.includes('cleanup') || action.includes('clean')) return <Trash2 className="h-4 w-4 text-brand-cyan" />;
    if (action.includes('sfc') || action.includes('dism') || action.includes('repair')) return <RefreshCw className="h-4 w-4 text-brand-violet" />;
    if (action.includes('network') || action.includes('dns') || action.includes('winsock') || action.includes('tcpip')) return <AlertTriangle className="h-4 w-4 text-pink-400" />;
    if (action.includes('driver')) return <FileText className="h-4 w-4 text-amber-400" />;
    if (action.includes('schedule') || action.includes('restore')) return <CalendarDays className="h-4 w-4 text-emerald-400" />;
    return <CheckCircle2 className="h-4 w-4 text-brand-success" />;
  };

  const filteredHistory = selectedRepair
    ? history.filter(h => h.action === selectedRepair)
    : history;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Repair History</h2>
          <p className="text-xs text-slate-400">Timeline of all system maintenance and repair operations</p>
        </div>
        <div className="flex gap-3">
          <select
            value={selectedRepair || 'all'}
            onChange={(e) => setSelectedRepair(e.target.value === 'all' ? null : e.target.value)}
            className="bg-slate-800 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-violet"
          >
            <option value="all">All Actions</option>
            {[...new Set(history.map(h => h.action))].map(action => (
              <option key={action} value={action}>{getActionLabel(action)}</option>
            ))}
          </select>
          <button
            onClick={loadRepairHistory}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <p className="text-xs text-slate-400 font-bold uppercase">Total Repairs</p>
          <p className="text-2xl font-black text-white mt-1">{history.length}</p>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <p className="text-xs text-slate-400 font-bold uppercase">Successful</p>
          <p className="text-2xl font-black text-brand-success mt-1">
            {history.filter(h => h.result === 'SUCCESS').length}
          </p>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <p className="text-xs text-slate-400 font-bold uppercase">Failed</p>
          <p className="text-2xl font-black text-brand-danger mt-1">
            {history.filter(h => h.result === 'FAILURE').length}
          </p>
        </div>
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <p className="text-xs text-slate-400 font-bold uppercase">Success Rate</p>
          <p className="text-2xl font-black text-brand-cyan mt-1">
            {history.length > 0
              ? `${Math.round((history.filter(h => h.result === 'SUCCESS').length / history.length) * 100)}%`
              : 'N/A'}
          </p>
        </div>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="py-12 flex items-center justify-center gap-2">
          <RefreshCw className="h-5 w-5 animate-spin text-brand-violet" />
          <span className="text-xs text-slate-400">Loading repair history...</span>
        </div>
      ) : history.length === 0 ? (
        <div className="py-12 text-center text-slate-500">
          <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold">No repair history found</p>
          <p className="text-xs mt-1">Run some system repairs to see them here</p>
        </div>
      ) : (
        <div className="timeline-line space-y-4">
          {filteredHistory.map((item, idx) => (
            <motion.div
              key={item.id || idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="relative pl-4"
            >
              {/* Timeline dot */}
              <div className={`absolute left-[-9px] top-5 w-4 h-4 rounded-full border-2 ${
                item.result === 'SUCCESS' ? 'border-brand-success bg-emerald-900' : 'border-brand-danger bg-rose-900'
              }`} />

              <div className="glass-panel border border-brand-border rounded-xl p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {getActionIcon(item.action)}
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{getActionLabel(item.action)}</h4>
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {formatDate(item.timestamp)} | {item.user}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    item.result === 'SUCCESS'
                      ? 'bg-emerald-500/20 text-brand-success'
                      : 'bg-rose-500/20 text-brand-danger'
                  }`}>
                    {item.result}
                  </span>
                </div>

                {item.details && Object.keys(item.details).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-brand-border">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(item.details).map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="text-slate-500 block uppercase text-[10px]">{key}</span>
                          <span className="text-slate-300 font-medium">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {item.error && (
                  <div className="mt-3 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-brand-danger">
                    {item.error}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
