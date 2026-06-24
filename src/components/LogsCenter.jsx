import React, { useEffect, useState } from 'react';
import { Download, FileText, FolderOpen, Loader2, RefreshCw, ShieldCheck, Terminal } from 'lucide-react';

export default function LogsCenter() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Repair history ready.');

  const loadHistory = async () => {
    setLoading(true);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand('read-repair-history')
        : { success: true, stdout: '' };
      const lines = (result.stdout || '').split('\n').filter(Boolean);
      setHistory(lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { timestamp: '', action: 'Log Entry', result: 'INFO', error: line };
        }
      }).reverse());
      setStatus(`Loaded ${lines.length} repair history entries.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const openLogs = async () => {
    await window.api?.openLogsFolder?.();
  };

  const exportLogs = async () => {
    setStatus('Exporting Windows event logs...');
    const result = await window.api?.runSystemCommand?.('export-event-logs');
    setStatus(result?.success ? 'Diagnostic event logs exported to TEMP.' : result?.error || 'Export failed.');
  };

  return (
    <div className="p-6 space-y-6 text-left">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100">Logs</h2>
          <p className="text-xs font-semibold text-slate-500">
            Repair History, Error Logs, Export Logs and Diagnostic Reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={loadHistory} className="flex items-center gap-2 rounded-xl border border-brand-border bg-slate-900 px-4 py-2 text-xs font-black text-slate-100 hover:bg-slate-800">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button onClick={exportLogs} className="flex items-center gap-2 rounded-xl border border-brand-border bg-slate-900 px-4 py-2 text-xs font-black text-slate-100 hover:bg-slate-800">
            <Download className="h-4 w-4" />
            Export Logs
          </button>
          <button onClick={openLogs} className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-cyan-300">
            <FolderOpen className="h-4 w-4" />
            Open Logs
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[
          ['Repair History', history.length, ShieldCheck],
          ['Error Logs', history.filter((item) => item.result === 'FAILURE').length, Terminal],
          ['Diagnostic Reports', 'TEMP', FileText],
          ['Export Logs', 'EVTX', Download],
        ].map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-brand-border bg-slate-950/30 p-5">
            <Icon className="mb-3 h-5 w-5 text-cyan-300" />
            <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-black text-slate-100">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-brand-border bg-slate-950/30">
        <div className="flex items-center justify-between border-b border-brand-border px-5 py-4">
          <h3 className="text-sm font-black text-slate-100">Repair History</h3>
          <span className="text-xs font-semibold text-slate-500">{status}</span>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {history.length === 0 ? (
            <div className="p-12 text-center text-xs font-semibold text-slate-500">No repair entries yet.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-500">
                <tr>
                  <th className="px-5 py-3">Time</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {history.map((item, index) => (
                  <tr key={`${item.timestamp}-${index}`} className="hover:bg-slate-900/50">
                    <td className="px-5 py-3 font-mono text-slate-400">{item.timestamp ? new Date(item.timestamp).toLocaleString() : '-'}</td>
                    <td className="px-5 py-3 font-bold text-slate-200">{item.action}</td>
                    <td className={`px-5 py-3 font-black ${item.result === 'SUCCESS' ? 'text-emerald-300' : item.result === 'FAILURE' ? 'text-rose-300' : 'text-slate-400'}`}>
                      {item.result}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{item.error || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
