import React, { useState, useEffect } from 'react';
import { Skull, RefreshCw, Loader2, Info } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { formatDate } from '../utils/formatters';

export default function BsodAnalyzer() {
  const { addNotification } = useNotification();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-bsod-logs');
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          setLogs(Array.isArray(parsed) ? parsed : [parsed]);
        }
      }
    } catch (e) {
      console.error(e);
      addNotification('BSOD Analyzer', 'Failed to read minidump logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const analyzeMessage = (message) => {
    // Attempt to extract bugcheck string
    const match = message.match(/bugcheck was: (.*?)\./i);
    const code = match ? match[1] : 'Unknown BugCheck';
    
    let probableCause = 'Unknown or Undocumented Error';
    if (code.includes('0x0000003B') || code.includes('0x0000001E') || code.includes('0x0000007E')) probableCause = 'System Service Exception (Usually Graphics/Driver Fault)';
    if (code.includes('0x0000000A') || code.includes('0x000000D1') || code.includes('0x000000C2')) probableCause = 'Faulty Driver (IRQL_NOT_LESS_OR_EQUAL / Bad Pool Caller)';
    if (code.includes('0x0000001A') || code.includes('0x00000050') || code.includes('0x00000139')) probableCause = 'RAM / Memory Management Error (PAGE_FAULT_IN_NONPAGED_AREA)';
    if (code.includes('0x0000007B') || code.includes('0x000000ED')) probableCause = 'Inaccessible Boot Device (Storage/AHCI or Corrupt Boot Sector)';
    if (code.includes('0x00000116') || code.includes('0x00000117') || code.includes('0x00000119')) probableCause = 'GPU Video TDR Failure (Display Driver timeout)';
    if (code.includes('0x000000EF') || code.includes('0x000000F4')) probableCause = 'Critical Process Died (System file corruption or malware)';
    if (code.includes('0x00000133')) probableCause = 'DPC Watchdog Violation (Often SSD Firmware or SATA driver issue)';
    if (code.includes('0x0000009F')) probableCause = 'Driver Power State Failure (Power management / Sleep issue)';
    if (code.includes('0x00000109')) probableCause = 'Critical Structure Corruption (RAM or Rootkit modification)';
    if (code.includes('0x00000124')) probableCause = 'WHEA Uncorrectable Error (Hardware Failure - CPU Overheating/Voltage)';

    return { code, probableCause };
  };

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">BSOD Crash Analyzer</h2>
          <p className="text-xs text-slate-400 mt-1">Parses Windows System Event Logs to find the root cause of Blue Screen crashes.</p>
        </div>
        <button onClick={fetchLogs} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded flex items-center gap-2 cursor-pointer transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Logs
        </button>
      </div>

      {loading ? (
        <div className="glass-panel border border-brand-border rounded-xl p-12 text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
          <p className="text-xs text-slate-500 font-semibold animate-pulse">Scanning Windows Minidumps and Event Logs...</p>
        </div>
      ) : logs.length > 0 && logs[0] ? (
        <div className="space-y-4">
          {logs.map((log, idx) => {
            if (!log) return null;
            const analysis = analyzeMessage(log.Message || '');
            return (
              <div key={idx} className="glass-panel border-l-4 border-l-rose-500 border-t border-r border-b border-brand-border rounded-r-xl p-5 hover:bg-slate-800/30 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <Skull className="h-5 w-5 text-rose-500" />
                    <h3 className="text-sm font-bold text-rose-400">System Crash Detected</h3>
                  </div>
                  <span className="text-xs text-slate-500">{formatDate(log.TimeCreated)}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                  <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                    <p className="text-xs text-slate-500 mb-1">BugCheck Code</p>
                    <p className="text-white font-mono">{analysis.code}</p>
                  </div>
                  <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                    <p className="text-xs text-slate-500 mb-1">Probable Cause (Heuristic)</p>
                    <p className="text-amber-400 font-bold">{analysis.probableCause}</p>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-slate-900 rounded text-xs text-slate-400 font-mono">
                  {log.Message}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel border border-emerald-500/30 rounded-xl p-12 text-center space-y-3">
          <Info className="h-8 w-8 text-emerald-400 mx-auto" />
          <h3 className="text-lg font-bold text-white">No BSOD Crashes Found</h3>
          <p className="text-xs text-slate-400">Your system event logs show no recent BugCheck (Event ID 1001) errors. System is stable!</p>
        </div>
      )}
    </div>
  );
}
