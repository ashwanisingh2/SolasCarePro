import React, { useState, useEffect } from 'react';
import { Loader2, FileX, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';

export default function BrokenShortcuts() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [shortcuts, setShortcuts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fetchShortcuts = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['find-broken-shortcuts']);
        if (res.success && res.stdout) {
          const m = res.stdout.match(/\[[\s\S]*\]/) || res.stdout.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            setShortcuts(Array.isArray(parsed) ? parsed : [parsed]);
            addNotification('Broken Shortcuts', `Found ${(Array.isArray(parsed) ? parsed.length : 1)} broken shortcut(s).`, 'info');
          } else {
            setShortcuts([]);
          }
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        setShortcuts([
          { ShortcutPath: 'C:\\Users\\you\\Desktop\\OldApp.lnk', TargetPath: 'C:\\Program Files\\Removed\\app.exe', Name: 'OldApp' },
        ]);
      }
    } catch (e) {
      addNotification('Broken Shortcuts', 'Failed to scan: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShortcuts(); }, []);

  const handleDelete = async (sc) => {
    const ok = await confirm({
      title: 'Delete Broken Shortcut',
      message: `Delete shortcut "${sc.Name}"? It points to a missing target:\n${sc.TargetPath}`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeleting(sc.ShortcutPath);
    try {
      if (window.api) {
        // Reuse the shred action to delete the .lnk file
        const res = await window.api.runSystemCommand('run-advanced-tool', ['shred', sc.ShortcutPath]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          addNotification('Broken Shortcuts', `Deleted "${sc.Name}".`, 'success');
          setShortcuts(prev => prev.filter(s => s.ShortcutPath !== sc.ShortcutPath));
        } else {
          addNotification('Broken Shortcuts', 'Delete failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 300));
        addNotification('Broken Shortcuts', `Mock deleted "${sc.Name}".`, 'success');
        setShortcuts(prev => prev.filter(s => s.ShortcutPath !== sc.ShortcutPath));
      }
    } catch (e) {
      addNotification('Broken Shortcuts', e.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <FileX className="h-6 w-6 text-amber-400" /> Broken Shortcuts
          </h2>
          <p className="text-xs text-slate-400 mt-1">Find .lnk shortcuts pointing to missing files (Desktop, Start Menu) and delete them.</p>
        </div>
        <button
          onClick={fetchShortcuts}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Re-scan
        </button>
      </header>

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
          <p className="text-xs text-slate-400">Scanning Desktop and Start Menu for broken shortcuts...</p>
        </div>
      ) : shortcuts.length === 0 ? (
        <div className="glass-panel border border-emerald-500/30 rounded-xl p-12 text-center">
          <FileX className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-bold text-emerald-300">No Broken Shortcuts Found</p>
          <p className="text-xs text-slate-500 mt-1">All .lnk files in Desktop and Start Menu point to valid targets.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="glass-panel border border-amber-500/30 bg-amber-950/5 rounded-xl p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-[11px] text-amber-300">Found {shortcuts.length} broken shortcut(s). Deleting them is safe — they point to nothing.</p>
          </div>
          {shortcuts.map((sc, i) => (
            <div key={i} className="glass-panel border border-brand-border rounded-xl p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-200">{sc.Name}</div>
                <div className="text-[10px] text-slate-500 font-mono truncate" title={sc.ShortcutPath}>{sc.ShortcutPath}</div>
                <div className="text-[10px] text-rose-400 font-mono truncate mt-0.5" title={sc.TargetPath}>→ {sc.TargetPath} (missing)</div>
              </div>
              <button
                onClick={() => handleDelete(sc)}
                disabled={deleting !== null}
                className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 disabled:opacity-50 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
              >
                {deleting === sc.ShortcutPath ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
