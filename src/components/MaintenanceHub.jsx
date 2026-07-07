import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2, ShieldCheck, HardDrive, RefreshCw,
  CheckCircle2, AlertTriangle, Play, Pause, X, Loader2, Undo2
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';

export default function MaintenanceHub() {
  const { addNotification } = useNotification();
  // 'privacy' and 'largefiles' tabs removed - those features live under the
  // Power Features sidebar entry (PowerFeatures.jsx) to avoid duplicate UI.
  const [activeSubTab, setActiveSubTab] = useState('junk');
  
  // Junk Temp States
  const [junkFiles, setJunkFiles] = useState([]);
  const [selectedJunkPaths, setSelectedJunkPaths] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [backupDir, setBackupDir] = useState('');
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [junkSizes, setJunkSizes] = useState({ before: '0', after: '0' });
  const [recycleBinCleaning, setRecycleBinCleaning] = useState(false);
  
  const undoIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    };
  }, []);

  const scanJunk = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('junk-scan');
        if (res.success && res.stdout) {
          const list = JSON.parse(res.stdout.trim());
          setJunkFiles(list);
          setSelectedJunkPaths(list.map(f => f.Path));
          addNotification('Scan Complete', `Found ${list.length} temporary files.`, 'success');
        } else {
          setJunkFiles([]);
          addNotification('Junk Scan', 'No temporary files found.', 'info');
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1200));
        const mock = [
          { Path: 'C:\\Users\\User\\AppData\\Local\\Temp\\log_cache.tmp', Size: 24500000, Category: 'User Temp' },
          { Path: 'C:\\Windows\\Temp\\system_log_7392.log', Size: 128000000, Category: 'System Temp' },
          { Path: 'C:\\Windows\\Prefetch\\CHROME.EXE-8392.pf', Size: 4500000, Category: 'Prefetch' },
          { Path: 'C:\\Users\\User\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\data_0', Size: 32000000, Category: 'Chrome Cache' }
        ];
        setJunkFiles(mock);
        setSelectedJunkPaths(mock.map(f => f.Path));
      }
    } catch (e) {
      console.error(e);
      addNotification('Junk Scan Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const cleanJunk = async () => {
    if (selectedJunkPaths.length === 0) return;
    setCleaning(true);
    const beforeSize = junkFiles
      .filter(f => selectedJunkPaths.includes(f.Path))
      .reduce((acc, f) => acc + f.Size, 0);
      
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('junk-clean', [JSON.stringify(selectedJunkPaths)]);
        if (res.success && res.stdout) {
          const cleanRes = JSON.parse(res.stdout.trim());
          setBackupDir(cleanRes.BackupDir);
          setJunkSizes({
            before: formatBytes(beforeSize),
            after: formatBytes(beforeSize * 0.05)
          });
          
          setUndoSeconds(30);
          undoIntervalRef.current = setInterval(() => {
            // Pure updater - no side effects. The auto-commit when the timer
            // hits zero is handled by a separate useEffect below (avoids
            // StrictMode double-invoke of updaters from calling commitCleanup twice).
            setUndoSeconds(prev => (prev <= 1 ? 0 : prev - 1));
          }, 1000);
          addNotification('Clean Complete', 'Selected temporary files moved to temporary backup directory.', 'success');
        } else {
          addNotification('Cleanup Failed', res.error || 'Clean process failed', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1200));
        setJunkSizes({
          before: formatBytes(beforeSize),
          after: '0 B'
        });
        setUndoSeconds(5);
        undoIntervalRef.current = setInterval(() => {
          setUndoSeconds(prev => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
      }
    } catch (e) {
      console.error(e);
      addNotification('Cleanup Error', e.message, 'error');
    } finally {
      setCleaning(false);
    }
  };

  // Auto-commit the cleanup when the undo countdown reaches zero. Splitting
  // this out of the interval keeps the setState updater pure.
  useEffect(() => {
    if (undoSeconds === 0 && backupDir) {
      commitCleanup(backupDir);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoSeconds, backupDir]);

  const undoCleanup = async () => {
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    const targetBackup = backupDir;
    setBackupDir('');
    setUndoSeconds(0);
    
    try {
      if (window.api && targetBackup) {
        setLoading(true);
        const res = await window.api.runSystemCommand('junk-undo', [targetBackup]);
        if (res.success) {
          addNotification('Rollback Success', 'Restored temporary files successfully.', 'success');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      scanJunk();
    }
  };

  const commitCleanup = async (targetBackup = backupDir) => {
    if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    setBackupDir('');
    setUndoSeconds(0);
    try {
      if (window.api && targetBackup) {
        window.api.runSystemCommand('junk-commit', [targetBackup]);
      }
    } catch (e) {
      console.error(e);
    }
    setJunkFiles([]);
    setSelectedJunkPaths([]);
    addNotification('Cleanup Committed', 'Temporary files deleted permanently.', 'success');
  };

  const toggleJunkPath = (path) => {
    setSelectedJunkPaths(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const cleanRecycleBin = async () => {
    setRecycleBinCleaning(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('recycle-bin-cleanup');
        if (res.success) {
          addNotification('Recycle Bin Cleared', 'Recycle Bin emptied successfully.', 'success');
        } else if (res.cancelled) {
          addNotification('Recycle Bin', 'Recycle Bin cleanup cancelled.', 'info');
        } else {
          addNotification('Recycle Bin Error', res.error || 'Failed to empty Recycle Bin', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        addNotification('Recycle Bin', 'Recycle Bin cleared successfully (MOCK).', 'success');
      }
    } catch (e) {
      console.error(e);
      addNotification('Recycle Bin Error', e.message, 'error');
    } finally {
      setRecycleBinCleaning(false);
    }
  };

  const totalJunkBytesSelected = junkFiles
    .filter(f => selectedJunkPaths.includes(f.Path))
    .reduce((acc, f) => acc + f.Size, 0);

  return (
    <div className="p-6 space-y-6 text-left">
      {/* Tab Navigation header */}
      <div className="flex justify-between items-center select-none border-b border-brand-border pb-3">
        <div className="flex gap-4">
          {[
            { id: 'junk', label: 'Junk & Temp', icon: Trash2 }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-gradient-to-r from-brand-violet/20 to-brand-cyan/10 border border-brand-violet/40 text-white shadow-md' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Body views */}
      <div className="min-h-[400px]">
        {activeSubTab === 'junk' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-slate-100">Junk & Temporary Files Cleanup</h3>
                <p className="text-xs text-slate-400 mt-1">Scan and remove unused installer caches, Windows logs, and browser caching heaps.</p>
              </div>
              <div className="flex gap-3">
                <button
                  disabled={loading || cleaning || undoSeconds > 0}
                  onClick={scanJunk}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-brand-border text-xs font-bold rounded-lg text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Scan Files
                </button>
                <button
                  disabled={recycleBinCleaning}
                  onClick={cleanRecycleBin}
                  className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-900/30 border border-rose-500/20 text-xs font-bold rounded-lg text-rose-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {recycleBinCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Empty Recycle Bin
                </button>
              </div>
            </div>

            {undoSeconds > 0 ? (
              <div className="glass-panel border border-amber-500/30 bg-amber-950/10 p-6 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 animate-pulse" />
                    Temporary Clean Applied ({undoSeconds}s)
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Moved {formatBytes(totalJunkBytesSelected)} of cache data into safety backup. Click Undo to roll back.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={undoCleanup}
                    className="px-4 py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
                  >
                    <Undo2 className="h-4 w-4" />
                    Undo Restoration
                  </button>
                  <button
                    onClick={() => commitCleanup()}
                    className="px-4 py-2.5 bg-slate-800 border border-brand-border hover:bg-slate-700 text-xs font-bold rounded-lg text-white cursor-pointer"
                  >
                    Commit & Delete
                  </button>
                </div>
              </div>
            ) : null}

            {loading ? (
              <div className="py-24 text-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-brand-violet mx-auto" />
                <p className="text-xs text-slate-400">Scanning temp directories, system cache pools and app configurations...</p>
              </div>
            ) : junkFiles.length > 0 ? (
              <div className="space-y-4">
                {/* Statistics banner */}
                <div className="glass-panel border border-brand-border rounded-xl p-4 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-300">
                    Selected <span className="text-brand-cyan font-black">{selectedJunkPaths.length}</span> of {junkFiles.length} files ({formatBytes(totalJunkBytesSelected)})
                  </div>
                  <button
                    disabled={selectedJunkPaths.length === 0 || cleaning}
                    onClick={cleanJunk}
                    className="px-5 py-2 bg-brand-violet hover:bg-brand-violet/85 text-xs font-bold rounded-lg text-white flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {cleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Clean Selected Cache
                  </button>
                </div>

                {/* File list */}
                <div className="glass-panel border border-brand-border rounded-xl divide-y divide-brand-border max-h-[350px] overflow-y-auto">
                  {junkFiles.map(file => {
                    const isSelected = selectedJunkPaths.includes(file.Path);
                    return (
                      <div 
                        key={file.Path} 
                        onClick={() => toggleJunkPath(file.Path)}
                        className="p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-900/60"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-4">
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            onChange={() => {}} // handled by parent div click
                            className="rounded border-slate-700 bg-slate-800 text-brand-violet focus:ring-brand-violet/50"
                          />
                          <div className="truncate">
                            <p className="font-semibold text-slate-200 truncate">{file.Path}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{file.Category}</p>
                          </div>
                        </div>
                        <span className="font-mono text-slate-300 font-bold shrink-0">{formatBytes(file.Size)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl">
                <Trash2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                <p className="text-xs text-slate-400 font-bold">No junk cache directories loaded.</p>
                <button
                  onClick={scanJunk}
                  className="mt-4 px-4 py-2 bg-slate-800 border border-brand-border rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Start Scan
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
