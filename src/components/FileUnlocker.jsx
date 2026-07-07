import React, { useState } from 'react';
import { Loader2, Unlock, Skull, RefreshCw } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';

export default function FileUnlocker() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockers, setLockers] = useState([]);

  const findLockers = async () => {
    if (!filePath.trim()) {
      addNotification('File Unlocker', 'Enter a file path first.', 'error');
      return;
    }
    setLoading(true);
    setLockers([]);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['unlock', filePath]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          setLockers(obj.lockers || []);
          if ((obj.lockers || []).length === 0) {
            addNotification('File Unlocker', 'No processes are locking this file.', 'info');
          } else {
            addNotification('File Unlocker', `Found ${obj.lockers.length} process(es) locking the file.`, 'success');
          }
        } else {
          addNotification('File Unlocker', obj?.message || 'Failed to query lockers.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 600));
        setLockers([{ pid: 1234, name: 'MockApp.exe', path: 'C:\\Program Files\\MockApp\\MockApp.exe' }]);
        addNotification('File Unlocker', 'Mock: found 1 process locking the file.', 'info');
      }
    } catch (e) {
      addNotification('File Unlocker', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const killAll = async () => {
    if (lockers.length === 0) return;
    const ok = await confirm({
      title: 'Force Kill Locking Processes',
      message: `Kill ${lockers.length} process(es) holding the file? Unsaved data in those apps will be lost.`,
      confirmLabel: 'Kill All',
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['unlock-kill', filePath]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          addNotification('File Unlocker', `Killed ${obj.killed} process(es). File is now unlocked.`, 'success');
          setLockers([]);
        } else {
          addNotification('File Unlocker', obj?.message || 'Kill failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        addNotification('File Unlocker', `Mock: killed ${lockers.length} process(es).`, 'success');
        setLockers([]);
      }
    } catch (e) {
      addNotification('File Unlocker', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header>
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
          <Unlock className="h-6 w-6 text-brand-cyan" /> File Unlocker
        </h2>
        <p className="text-xs text-slate-400 mt-1">Find processes locking a file ("file in use" errors) and optionally force-kill them to release the lock.</p>
      </header>

      <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
        <label className="block text-[10px] uppercase font-bold text-slate-500">Locked File Path</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="C:\Users\you\Documents\locked.docx"
            className="flex-1 px-3 py-2 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet font-mono"
          />
          <button
            onClick={findLockers}
            disabled={loading || !filePath}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-2 cursor-pointer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Find Lockers
          </button>
        </div>
      </div>

      {lockers.length > 0 && (
        <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
          <div className="bg-slate-950/40 px-4 py-3 border-b border-brand-border flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-400 uppercase">{lockers.length} Process(es) Locking File</h4>
            <button
              onClick={killAll}
              disabled={loading}
              className="px-3 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
            >
              <Skull className="h-3 w-3" /> Kill All
            </button>
          </div>
          <div className="divide-y divide-brand-border">
            {lockers.map((p, i) => (
              <div key={i} className="p-3 flex items-center gap-3">
                <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400">
                  PID
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-200">{p.name || 'Unknown'}</div>
                  <div className="text-[10px] text-slate-500 font-mono">PID {p.pid} · {p.path || 'N/A'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {lockers.length === 0 && !loading && filePath && (
        <div className="glass-panel border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-400">
          No processes are locking the file. You can freely delete or move it.
        </div>
      )}
    </div>
  );
}
