import React, { useState, useEffect } from 'react';
import { FileText, Trash2, ExternalLink, RefreshCw, Loader2, FileJson, FileCode, Search } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import { useDebounced } from '../utils/hooks';
import { SkeletonTable } from './shared/Skeleton';

export default function ReportCenter() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 200);

  const loadReports = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('list-reports');
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout.trim());
          setReports(parsed.reports || []);
        }
      } else {
        setReports([
          { name: 'SystemReport_20250706_120000.html', path: '', sizeKB: 45, modified: new Date().toISOString() },
          { name: 'RepairSummary_20250706_110000.html', path: '', sizeKB: 12, modified: new Date(Date.now() - 3600000).toISOString() },
          { name: 'solas_bsod_report.html', path: '', sizeKB: 8, modified: new Date(Date.now() - 7200000).toISOString() }
        ]);
      }
    } catch (e) {
      addNotification('Report Center', 'Failed to load reports: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, []);

  const openReport = async (name) => {
    if (window.api) {
      const res = await window.api.runSystemCommand('open-report', [name]);
      if (!res.success) addNotification('Report Center', res.error || 'Failed to open', 'error');
    }
  };

  const deleteReport = async (name) => {
    const ok = await confirm({ title: 'Delete Report', message: `Delete "${name}"?`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    if (window.api) {
      const res = await window.api.runSystemCommand('delete-report', [name]);
      if (res.success) {
        addNotification('Report Deleted', name, 'success');
        loadReports();
      } else {
        addNotification('Delete Failed', res.error || 'Failed', 'error');
      }
    }
  };

  const filtered = reports.filter(r => r.name.toLowerCase().includes(debouncedSearch.toLowerCase()));

  const formatDate = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <FileText className="h-6 w-6 text-brand-violet" />
            Report Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">Browse, open, and delete all generated diagnostic reports</p>
        </div>
        <button onClick={loadReports} disabled={loading} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {!loading && reports.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reports..." className="w-full pl-9 pr-3 py-2 bg-slate-950/40 border border-brand-border rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-violet" />
        </div>
      )}

      {loading ? (
        <SkeletonTable cols={4} rows={5} />
      ) : filtered.length > 0 ? (
        <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-950/40 text-slate-400 border-b border-brand-border">
                <th className="px-4 py-3 font-bold">Report Name</th>
                <th className="px-4 py-3 font-bold">Size</th>
                <th className="px-4 py-3 font-bold">Modified</th>
                <th className="px-4 py-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filtered.map(r => {
                const isJson = r.name.endsWith('.json');
                return (
                  <tr key={r.name} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-slate-200 flex items-center gap-2">
                      {isJson ? <FileJson className="h-4 w-4 text-amber-400 shrink-0" /> : <FileCode className="h-4 w-4 text-brand-cyan shrink-0" />}
                      <span className="break-all">{r.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{r.sizeKB < 1024 ? `${r.sizeKB} KB` : `${(r.sizeKB/1024).toFixed(1)} MB`}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(r.modified)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openReport(r.name)} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded text-[10px] font-bold text-slate-300 cursor-pointer flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> Open
                        </button>
                        <button onClick={() => deleteReport(r.name)} className="px-2 py-1 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 rounded text-[10px] font-bold text-rose-400 cursor-pointer flex items-center gap-1">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl">
          <FileText className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-bold">{reports.length === 0 ? 'No reports found. Generate one from Smart Repair or the Dashboard.' : 'No reports match your search.'}</p>
        </div>
      )}
    </div>
  );
}
