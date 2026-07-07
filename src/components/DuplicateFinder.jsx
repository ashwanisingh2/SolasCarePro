import React, { useState } from 'react';
import { Loader2, Copy, FolderSearch, AlertTriangle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export default function DuplicateFinder() {
  const { addNotification } = useNotification();
  const [searchPath, setSearchPath] = useState('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);

  const handleScan = async () => {
    if (!searchPath.trim()) {
      addNotification('Duplicate Finder', 'Enter a folder path to scan.', 'error');
      return;
    }
    setScanning(true);
    setResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['find-duplicates', searchPath]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          setResult(obj);
          addNotification('Duplicate Finder', obj.message, 'success');
        } else {
          addNotification('Duplicate Finder', obj?.message || 'Scan failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setResult({
          scannedFiles: 50,
          duplicateGroups: 2,
          duplicates: [
            { hash: 'redacted', files: [{ Path: 'C:\\Downloads\\file1.mp4', SizeMB: 245.5 }, { Path: 'C:\\Downloads\\copy.mp4', SizeMB: 245.5 }], totalSizeMB: 491 },
            { hash: 'redacted', files: [{ Path: 'C:\\Downloads\\img1.jpg', SizeMB: 12.3 }, { Path: 'C:\\Pictures\\img1.jpg', SizeMB: 12.3 }], totalSizeMB: 24.6 },
          ],
          message: 'Mock: scanned 50 files, found 2 duplicate groups.',
        });
        addNotification('Duplicate Finder', 'Mock scan complete.', 'info');
      }
    } catch (e) {
      addNotification('Duplicate Finder', e.message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const totalWasteMB = result ? result.duplicates.reduce((sum, g) => sum + (g.totalSizeMB - (g.files[0]?.SizeMB || 0)), 0) : 0;

  return (
    <div className="p-6 space-y-5 text-left">
      <header>
        <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
          <Copy className="h-6 w-6 text-brand-cyan" /> Duplicate File Finder
        </h2>
        <p className="text-xs text-slate-400 mt-1">Find duplicate files by SHA-256 hash. Only files &gt; 1 MB are hashed (first 500 max). Reclaim wasted disk space.</p>
      </header>

      <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
        <label className="block text-[10px] uppercase font-bold text-slate-500">Folder to Scan</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchPath}
            onChange={(e) => setSearchPath(e.target.value)}
            placeholder="C:\Users\you\Downloads"
            className="flex-1 px-3 py-2 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-violet font-mono"
          />
          <button
            onClick={handleScan}
            disabled={scanning || !searchPath}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-2 cursor-pointer"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
        <p className="text-[10px] text-slate-500">Larger folders take longer. The first 500 files &gt; 1 MB are scanned.</p>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-panel border border-brand-border rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Files Scanned</div>
              <div className="text-xl font-black text-cyan-400 mt-1">{result.scannedFiles}</div>
            </div>
            <div className="glass-panel border border-brand-border rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Duplicate Groups</div>
              <div className="text-xl font-black text-amber-400 mt-1">{result.duplicateGroups}</div>
            </div>
            <div className="glass-panel border border-emerald-500/30 rounded-lg p-3">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Wasted Space</div>
              <div className="text-xl font-black text-emerald-400 mt-1">{totalWasteMB.toFixed(1)} MB</div>
            </div>
          </div>

          <div className="space-y-3">
            {result.duplicates.map((g, i) => (
              <div key={i} className="glass-panel border border-brand-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-300">Group {i + 1}</span>
                  <span className="text-[10px] text-amber-400 font-bold">{g.totalSizeMB.toFixed(1)} MB total</span>
                </div>
                <div className="space-y-1.5">
                  {g.files.map((f, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 text-[11px] bg-slate-950/40 border border-brand-border/50 rounded p-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-slate-200 font-mono truncate">{f.Path}</div>
                      </div>
                      <span className="text-slate-500 font-mono">{f.SizeMB} MB</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Manual deletion required — review carefully before deleting.
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
