import React, { useState, useEffect } from 'react';
import {
  Eye, EyeOff, Search, X, Trash2, FolderOpen, HardDrive, FileText, RefreshCw
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { useConfirm } from './shared/ConfirmModal';
import { useNotification } from '../context/NotificationContext';

export default function LargeFileFinder() {
  const confirm = useConfirm();
  const { addNotification } = useNotification();
  const [largeFiles, setLargeFiles] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSize, setMinSize] = useState(100); // MB
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [scanned, setScanned] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  // Drive letters state
  const [drives, setDrives] = useState([{ DriveLetter: 'C' }]);
  const [selectedDrive, setSelectedDrive] = useState('C');

  useEffect(() => {
    loadDrives();
  }, []);

  const loadDrives = async () => {
    if (window.api) {
      try {
        const res = await window.api.runSystemCommand('get-drives-info');
        if (res.success && res.stdout) {
          const driveData = JSON.parse(res.stdout);
          const driveList = Array.isArray(driveData) ? driveData : [driveData];
          if (driveList.length > 0) {
            setDrives(driveList);
            setSelectedDrive(driveList[0].DriveLetter);
          }
        }
      } catch (err) {
        console.error('Failed to query system logical drives:', err);
      }
    }
  };

  const scanForLargeFiles = async () => {
    setScanning(true);
    setProgress(0);
    setLargeFiles([]);
    setSelectedFiles([]);
    setStatusMessage(`Scanning drive ${selectedDrive}: for files larger than ${minSize} MB...`);

    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('scan-large-files', [minSize, selectedDrive]);
        if (res.success && res.stdout) {
          const files = JSON.parse(res.stdout.trim());
          const fileList = Array.isArray(files) ? files : [files];
          // Casing in PowerShell: FullName, Size, LastWriteTime
          setLargeFiles(fileList.map((f, i) => ({
            id: i,
            path: f.FullName,
            size: f.Size,
            modified: f.LastWriteTime ? new Date(f.LastWriteTime).toLocaleDateString() : 'N/A',
            type: f.FullName.split('.').pop().toUpperCase() || 'File'
          })));
          setStatusMessage(`Scan complete. Found ${fileList.length} files.`);
        } else {
          setStatusMessage(res.error || 'Scan finished with no matches.');
        }
      } else {
        // Mock data with progress simulation
        for (let i = 0; i <= 100; i += 20) {
          await new Promise(r => setTimeout(r, 200));
          setProgress(i);
        }
        setLargeFiles([
          { id: 0, path: `${selectedDrive}:\\Users\\User\\Videos\\project_backup.zip`, size: 4500000000, modified: '2026-06-10', type: 'ZIP' },
          { id: 1, path: `${selectedDrive}:\\Users\\User\\Downloads\\windows11.iso`, size: 5200000000, modified: '2026-05-20', type: 'ISO' },
          { id: 2, path: `${selectedDrive}:\\Program Files\\Common\\large_data.db`, size: 2100000000, modified: '2026-06-01', type: 'DB' },
          { id: 3, path: `${selectedDrive}:\\Users\\User\\Documents\\backup_2025.tar.gz`, size: 1800000000, modified: '2025-12-15', type: 'GZ' },
          { id: 4, path: `${selectedDrive}:\\Users\\User\\AppData\\Local\\Temp\\huge_log.txt`, size: 900000000, modified: '2026-06-23', type: 'TXT' }
        ]);
        setStatusMessage('Mock scan complete.');
      }
      setScanned(true);
    } catch (e) {
      console.error('Failed to scan:', e);
      setStatusMessage('Scan failed: ' + e.message);
    } finally {
      setScanning(false);
    }
  };

  const toggleFile = (path) => {
    setSelectedFiles(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const selectAll = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map(f => f.path));
    }
  };

  const deleteSelected = async () => {
    if (selectedFiles.length === 0) return;
    // IMPROVEMENT: use the styled ConfirmModal instead of native window.confirm.
    const totalSize = largeFiles
      .filter(f => selectedFiles.includes(f.path))
      .reduce((sum, f) => sum + (f.size || 0), 0);
    const ok = await confirm({
      title: 'Delete Selected Files',
      message: `Permanently delete ${selectedFiles.length} file(s) (${formatBytes(totalSize)})?`,
      detail: 'This action cannot be undone. Files bypass the Recycle Bin.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;

    setStatusMessage('Deleting files...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('delete-files', [JSON.stringify(selectedFiles)]);
        if (res.success) {
          setLargeFiles(prev => prev.filter(f => !selectedFiles.includes(f.path)));
          setSelectedFiles([]);
          setStatusMessage('Selected files deleted successfully.');
          addNotification('Files Deleted', `${selectedFiles.length} file(s) deleted successfully.`, 'success');
        } else {
          addNotification('Delete Failed', res.error || 'Permission Denied', 'error');
          setStatusMessage('Deletion failed.');
        }
      } else {
        setLargeFiles(prev => prev.filter(f => !selectedFiles.includes(f.path)));
        setSelectedFiles([]);
        setStatusMessage('Mock delete complete.');
      }
    } catch (e) {
      console.error('Failed to delete:', e);
      setStatusMessage('Deletion error: ' + e.message);
      addNotification('Delete Error', e.message, 'error');
    }
  };

  const filteredFiles = largeFiles.filter(file =>
    file.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6 text-left">
      {/* Title */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-brand-border pb-4 select-none">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Large File Finder</h2>
          <p className="text-xs text-slate-400">Search recursively to identify and purge large space-consuming files</p>
        </div>
      </section>

      {statusMessage && (
        <div className="p-3 bg-slate-900 border border-brand-border text-slate-300 text-xs font-bold rounded-xl animate-fade-in">
          {statusMessage}
        </div>
      )}

      {/* Control panel */}
      <section className="glass-panel border border-brand-border rounded-2xl p-5 flex flex-wrap gap-4 items-center select-none justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Drive Selector */}
          <div>
            <label className="text-[10px] text-slate-500 block uppercase font-bold mb-1">Target Drive</label>
            <select
              value={selectedDrive}
              onChange={(e) => setSelectedDrive(e.target.value)}
              disabled={scanning}
              className="bg-slate-900 border border-brand-border rounded-xl text-slate-200 text-xs font-bold p-2.5 focus:outline-none focus:border-brand-violet"
            >
              {drives.map(d => (
                <option key={d.DriveLetter} value={d.DriveLetter}>Drive {d.DriveLetter}:</option>
              ))}
            </select>
          </div>

          {/* Size filter */}
          <div>
            <label className="text-[10px] text-slate-500 block uppercase font-bold mb-1">Min Size (MB)</label>
            <input
              type="number"
              value={minSize}
              onChange={(e) => setMinSize(Math.max(1, parseInt(e.target.value) || 0))}
              disabled={scanning}
              className="w-24 bg-slate-900 border border-brand-border rounded-xl text-slate-200 text-xs font-bold p-2.5 outline-none focus:border-brand-violet"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={scanForLargeFiles}
            disabled={scanning}
            className="px-6 py-2.5 bg-brand-violet hover:bg-brand-violet/85 text-xs font-black text-white rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {scanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {scanning ? `Scanning... ${progress > 0 ? progress + '%' : ''}` : 'Start Scan'}
          </button>
          {selectedFiles.length > 0 && (
            <button
              onClick={deleteSelected}
              className="px-5 py-2.5 bg-brand-danger hover:bg-brand-danger/85 text-xs font-black text-white rounded-xl cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" /> Delete Selected ({selectedFiles.length})
            </button>
          )}
        </div>
      </section>

      {/* Query Search & File List */}
      {scanned && (
        <section className="glass-panel border border-brand-border rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:max-w-xs">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search file path..."
                className="w-full bg-slate-900 border border-brand-border rounded-xl px-9 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-brand-violet"
              />
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            </div>
            <button
              onClick={selectAll}
              className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer select-none"
            >
              {selectedFiles.length === filteredFiles.length ? 'Deselect All' : 'Select All Filtered'}
            </button>
          </div>

          <div className="max-h-[480px] overflow-y-auto space-y-2">
            {filteredFiles.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs font-semibold select-none">
                No files found matching the search criteria.
              </div>
            ) : (
              filteredFiles.map(file => {
                const isSelected = selectedFiles.includes(file.path);
                return (
                  <div
                    key={file.id}
                    onClick={() => toggleFile(file.path)}
                    className={`glass-panel border p-4 rounded-xl flex items-center justify-between gap-4 cursor-pointer transition hover:border-slate-500 bg-slate-900/30 ${
                      isSelected ? 'border-brand-violet/50 bg-brand-violet/5' : 'border-brand-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 select-none">
                        {file.type}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-xs font-bold text-slate-200 truncate break-all pr-4">{file.path}</span>
                        <span className="block text-[9px] text-slate-500 font-mono mt-0.5">Modified: {file.modified}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-xs font-black text-slate-300">{formatBytes(file.size)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFile(file.path); }}
                        className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-brand-violet border-brand-violet text-white' : 'border-slate-600 bg-slate-950/20'
                        }`}
                      >
                        {isSelected && '✓'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
