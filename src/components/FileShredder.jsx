import React, { useState } from 'react';
import { Loader2, Scissors, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';

export default function FileShredder() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [filePath, setFilePath] = useState('');
  const [shredding, setShredding] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const handleShred = async () => {
    if (!filePath.trim()) {
      addNotification('File Shredder', 'Enter a file path first.', 'error');
      return;
    }
    const ok = await confirm({
      title: 'Secure Shred - Irreversible',
      message: `Permanently shred "${filePath}"? The file will be overwritten 3 times (zeros, ones, random) then deleted. This CANNOT be undone.`,
      confirmLabel: 'Shred Forever',
      danger: true,
    });
    if (!ok) return;
    setShredding(true);
    setLastResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['shred', filePath]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          addNotification('File Shredder', obj.message, 'success');
          setLastResult(obj);
          setFilePath('');
        } else {
          addNotification('File Shredder', obj?.message || res.error || 'Shred failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        addNotification('File Shredder', `Mock shred of "${filePath}" (3-pass).`, 'success');
        setLastResult({ success: true, bytes: 1024, passes: 3, message: 'Mock shred complete.' });
        setFilePath('');
      }
    } catch (e) {
      addNotification('File Shredder', e.message, 'error');
    } finally {
      setShredding(false);
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header>
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
          <Scissors className="h-6 w-6 text-rose-400" /> Secure File Shredder
        </h2>
        <p className="text-xs text-slate-400 mt-1">Overwrite a file with 3 passes (zeros, ones, random bytes) then delete it. The file cannot be recovered by any undelete tool.</p>
      </header>

      <div className="glass-panel border border-rose-500/30 bg-rose-950/5 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
        <div className="text-xs text-rose-300">
          <p className="font-bold mb-1">Warning: Irreversible Operation</p>
          <p className="text-rose-400/80">Shredded files bypass the Recycle Bin. Use only on sensitive data you truly want to destroy (financial records, credentials, etc.).</p>
        </div>
      </div>

      <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
        <label className="block text-[10px] uppercase font-bold text-slate-500">File Path to Shred</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            placeholder="C:\Users\you\Documents\sensitive.pdf"
            className="flex-1 px-3 py-2 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
          />
          <button
            onClick={handleShred}
            disabled={shredding || !filePath}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-2 cursor-pointer"
          >
            {shredding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
            {shredding ? 'Shredding...' : 'Shred File'}
          </button>
        </div>
        <p className="text-[10px] text-slate-500">Only single files are supported. Directories are rejected.</p>
      </div>

      {lastResult && (
        <div className="glass-panel border border-emerald-500/30 bg-emerald-950/10 rounded-xl p-4 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-emerald-400" />
            <span className="font-bold text-emerald-300">Shred Complete</span>
          </div>
          <div className="text-slate-400 space-y-1">
            <div>Bytes shredded: <span className="text-slate-200 font-mono">{lastResult.bytes}</span></div>
            <div>Passes: <span className="text-slate-200 font-mono">{lastResult.passes} (zeros, ones, random)</span></div>
            <div>Status: <span className="text-emerald-400">{lastResult.message}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
