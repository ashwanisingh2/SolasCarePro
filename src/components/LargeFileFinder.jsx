import React, { useState, useEffect } from 'react';
import {
  Eye, EyeOff, Search, X, Trash2, FolderOpen, HardDrive, FileText, RefreshCw
} from 'lucide-react';

export default function LargeFileFinder() {
  const [largeFiles, setLargeFiles] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSize, setMinSize] = useState(100); // MB
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [scanned, setScanned] = useState(false);

  const scanForLargeFiles = async () => {
    setScanning(true);
    setProgress(0);
    setLargeFiles([]);
    setSelectedFiles([]);

    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('scan-large-files', [minSize]);
        if (res.success && res.stdout) {
          setLargeFiles(JSON.parse(res.stdout.trim()));
        }
      } else {
        // Mock data with progress simulation
        for (let i = 0; i <= 100; i += 10) {
          await new Promise(r => setTimeout(r, 200));
          setProgress(i);
        }
        setLargeFiles([
          { path: 'C:\\Users\\User\\Videos\\project_backup.zip', size: 4500000000, modified: '2026-06-10', type: 'Archive' },
          { path: 'C:\\Users\\User\\Downloads\\windows11.iso', size: 5200000000, modified: '2026-05-20', type: 'ISO' },
          { path: 'C:\\Program Files\\Common Files\\large_data.db', size: 2100000000, modified: '2026-06-01', type: 'Database' },
          { path: 'C:\\Users\\User\\Documents\\backup_2025.tar.gz', size: 1800000000, modified: '2025-12-15', type: 'Archive' },
          { path: 'C:\\Users\\User\\AppData\\Local\\Temp\\huge_log.txt', size: 900000000, modified: '2026-06-23', type: 'Log' },
          { path: 'C:\\Windows\\Installer\\$PatchCache$\large.msp', size: 750000000, modified: '2026-04-10', type: 'Installer' }
        ]);
      }
      setScanned(true);
    } catch (e) {
      console.error('Failed to scan:', e);
    } finally {
      setScanning(false);
    }
  };

  const toggleFile = (path) => {
    setSelectedFiles(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const deleteSelected = async () => {
    if (selectedFiles.length === 0) return;
    if (!confirm(`Delete ${selectedFiles.length} selected files? This cannot be undone.`)) return;

    try {
      if (window.api) {
        await window.api.runSystemCommand('delete-files', [JSON.stringify(selectedFiles)]);
      }
      setLargeFiles(prev => prev.filter(f => !selectedFiles.includes(f.path)));
      setSelectedFiles([]);
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  const filteredFiles = largeFiles.filter(f =>
    f.path.toLowerCase().includes(searchQuery.toLowerCase()) &&
    f.size >= minSize * 1048576
  );

  const totalSize = filteredFiles.reduce((acc, f) => acc + f.size, 0);

  const getFileIcon = (type) => {
    if (type === 'Archive') return <FolderOpen className="h-4 w-4 text-amber-400" />;
    if (type === 'ISO') return <HardDrive className="h-4 w-4 text-blue-400" />;
    if (type === 'Log') return <FileText className="h-4 w-4 text-slate-400" />;
    return <FileText className="h-4 w-4 text-slate-400" />;
  };

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Large File Finder</h2>
          <p className="text-xs text-slate-400">Find and delete large files taking up disk space</p>
        </div>
        {scanned && (
          <div className="text-xs text-slate-400">
            Found: <span className="text-brand-cyan font-bold">{filteredFiles.length}</span> files
            {' | '}Total: <span className="text-brand-violet font-bold">{formatSize(totalSize)}</span>
          </div>
        )}
      </div>

      {/* Scan Controls */}
      {!scanned && !scanning && (
        <div className="glass-panel border border-brand-border rounded-2xl p-6 text-center space-y-4">
          <div className="flex justify-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-violet/20 to-brand-cyan/10 flex items-center justify-center">
              <Search className="h-8 w-8 text-brand-violet" />
            </div>
          </div>
          <h3 className="text-md font-bold text-slate-200">Scan for Large Files</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Find files larger than the specified size threshold across your system drives
          </p>
          <div className="flex items-center justify-center gap-4">
            <label className="text-xs text-slate-400">Minimum Size (MB):</label>
            <input
              type="number"
              value={minSize}
              onChange={(e) => setMinSize(Number(e.target.value))}
              className="bg-slate-800 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-white w-24 text-center"
              min="10"
              max="10000"
            />
          </div>
          <button
            onClick={scanForLargeFiles}
            className="px-8 py-3 bg-gradient-to-r from-brand-violet to-brand-cyan hover:from-brand-violet/90 hover:to-brand-cyan/90 text-sm font-bold rounded-xl cursor-pointer shadow-lg shadow-brand-violet/20 transition-all"
          >
            Start Scan
          </button>
        </div>
      )}

      {/* Scanning Progress */}
      {scanning && (
        <div className="glass-panel border border-brand-border rounded-2xl p-6 text-center space-y-4">
          <RefreshCw className="h-10 w-10 animate-spin text-brand-violet mx-auto" />
          <h3 className="text-md font-bold text-slate-200">Scanning System Drives...</h3>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-brand-violet to-brand-cyan h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-400">{progress}% complete</p>
        </div>
      )}

      {/* Results */}
      {scanned && !scanning && (
        <div className="space-y-4">
          {/* Search and Actions */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-brand-border rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-violet"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-slate-500 hover:text-white" />
                </button>
              )}
            </div>
            <button
              onClick={scanForLargeFiles}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded-lg text-xs font-bold text-slate-300 cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Rescan
            </button>
            {selectedFiles.length > 0 && (
              <button
                onClick={deleteSelected}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-xs font-bold text-white cursor-pointer flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" /> Delete ({selectedFiles.length})
              </button>
            )}
          </div>

          {/* File List */}
          <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
            {filteredFiles.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">No files found matching criteria</div>
            ) : (
              <div className="divide-y divide-brand-border max-h-[400px] overflow-y-auto">
                {filteredFiles.map((file, idx) => {
                  const isSelected = selectedFiles.includes(file.path);
                  return (
                    <label
                      key={idx}
                      className="flex items-center gap-4 p-4 hover:bg-slate-800/30 cursor-pointer text-left"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFile(file.path)}
                        className="h-4 w-4 accent-brand-violet"
                      />
                      <div className="shrink-0">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate" title={file.path}>
                          {file.path}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Modified: {file.modified} | Type: {file.type}
                        </p>
                      </div>
                      <span className="text-sm font-black text-brand-cyan shrink-0">
                        {formatSize(file.size)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
