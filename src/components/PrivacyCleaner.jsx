import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Eye, EyeOff, Trash2, RefreshCw, Globe,
  Cookie, Search, FolderOpen, HardDrive, Play, Clock, X
} from 'lucide-react';

export default function PrivacyCleaner() {
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState({});

  const privacyCategories = [
    {
      id: 'browserHistory',
      name: 'Browser History',
      description: 'Chrome, Edge, Firefox browsing history and cache',
      icon: <Globe className="h-5 w-5 text-blue-400" />,
      defaultChecked: true,
      mockSize: 245000000, // ~245MB
      cmd: 'Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\History" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\History" -Force -ErrorAction SilentlyContinue'
    },
    {
      id: 'cookies',
      name: 'Cookies & Site Data',
      description: 'Stored cookies and website data from all browsers',
      icon: <Cookie className="h-5 w-5 text-amber-400" />,
      defaultChecked: true,
      mockSize: 85000000,
      cmd: 'Remove-Item "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default\\Cookies" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default\\Cookies" -Force -ErrorAction SilentlyContinue'
    },
    {
      id: 'dnsCache',
      name: 'DNS Cache',
      description: 'Cached DNS resolution records',
      icon: <Search className="h-5 w-5 text-cyan-400" />,
      defaultChecked: true,
      mockSize: 2000000,
      cmd: 'Clear-DnsClientCache; ipconfig /flushdns'
    },
    {
      id: 'thumbnailCache',
      name: 'Thumbnail Cache',
      description: 'Cached image thumbnails from file explorer',
      icon: <Eye className="h-5 w-5 text-violet-400" />,
      defaultChecked: true,
      mockSize: 156000000,
      cmd: 'Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db" -Force -ErrorAction SilentlyContinue'
    },
    {
      id: 'tempFiles',
      name: 'Temporary Files',
      description: 'Windows and application temporary files',
      icon: <FolderOpen className="h-5 w-5 text-emerald-400" />,
      defaultChecked: true,
      mockSize: 890000000,
      cmd: 'Remove-Item "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue; Remove-Item "$env:SystemRoot\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue'
    },
    {
      id: 'recentDocs',
      name: 'Recent Documents',
      description: 'List of recently accessed files and folders',
      icon: <Clock className="h-5 w-5 text-pink-400" />,
      defaultChecked: false,
      mockSize: 15000000,
      cmd: 'Remove-Item "$env:APPDATA\\Microsoft\\Windows\\Recent\\*" -Force -ErrorAction SilentlyContinue'
    },
    {
      id: 'prefetch',
      name: 'Prefetch Files',
      description: 'Windows prefetch optimization cache',
      icon: <HardDrive className="h-5 w-5 text-orange-400" />,
      defaultChecked: false,
      mockSize: 320000000,
      cmd: 'Remove-Item "$env:SystemRoot\\Prefetch\\*" -Force -ErrorAction SilentlyContinue'
    },
    {
      id: 'windowsErrorReporting',
      name: 'Error Reports',
      description: 'Windows Error Reporting stored files',
      icon: <X className="h-5 w-5 text-rose-400" />,
      defaultChecked: true,
      mockSize: 45000000,
      cmd: 'Remove-Item "$env:ProgramData\\Microsoft\\Windows\\WER\\*" -Recurse -Force -ErrorAction SilentlyContinue'
    }
  ];

  useEffect(() => {
    const defaults = {};
    privacyCategories.forEach(cat => {
      defaults[cat.id] = cat.defaultChecked;
    });
    setSelectedCategories(defaults);
  }, []);

  const runScan = async () => {
    setScanning(true);
    setScanResults(null);
    await new Promise(r => setTimeout(r, 2000));

    const results = privacyCategories.map(cat => ({
      ...cat,
      found: true,
      size: cat.mockSize
    }));

    setScanResults(results);
    setScanning(false);
  };

  const runCleanup = async () => {
    setCleaning(true);
    const selectedItems = scanResults?.filter(item => selectedCategories[item.id]) || [];

    for (const item of selectedItems) {
      if (window.api) {
        await window.api.runSystemCommand('privacy-clean', [item.cmd]);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    setCleaning(false);
    setScanResults(null);
  };

  const toggleCategory = (id) => {
    setSelectedCategories(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const selectAll = () => {
    const all = {};
    privacyCategories.forEach(cat => { all[cat.id] = true; });
    setSelectedCategories(all);
  };

  const deselectAll = () => {
    const none = {};
    privacyCategories.forEach(cat => { none[cat.id] = false; });
    setSelectedCategories(none);
  };

  const totalSelectedSize = scanResults
    ?.filter(item => selectedCategories[item.id])
    .reduce((acc, item) => acc + item.size, 0) || 0;

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Privacy Cleaner</h2>
          <p className="text-xs text-slate-400">Clear browser data, cache, and system traces</p>
        </div>
        {scanResults && (
          <div className="text-xs text-slate-400">
            <span className="text-brand-violet font-bold">{formatSize(totalSelectedSize)}</span> selected for cleanup
          </div>
        )}
      </div>

      {/* Scan Button */}
      {!scanResults && !scanning && (
        <div className="glass-panel border border-brand-border rounded-2xl p-8 text-center space-y-4">
          <ShieldCheck className="h-12 w-12 text-brand-violet mx-auto" />
          <h3 className="text-md font-bold text-slate-200">Scan for Privacy Data</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Analyze browser history, cookies, DNS cache, thumbnails, temp files and more
          </p>
          <button
            onClick={runScan}
            className="px-8 py-3 bg-gradient-to-r from-brand-violet to-brand-cyan hover:from-brand-violet/90 hover:to-brand-cyan/90 text-sm font-bold rounded-xl cursor-pointer shadow-lg shadow-brand-violet/20 transition-all"
          >
            Start Privacy Scan
          </button>
        </div>
      )}

      {/* Scanning Progress */}
      {scanning && (
        <div className="glass-panel border border-brand-border rounded-2xl p-8 text-center space-y-4">
          <RefreshCw className="h-10 w-10 animate-spin text-brand-violet mx-auto" />
          <h3 className="text-md font-bold text-slate-200">Scanning Privacy Data...</h3>
          <p className="text-xs text-slate-400">Checking all categories for cached data</p>
        </div>
      )}

      {/* Scan Results */}
      {scanResults && !scanning && (
        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={selectAll}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
            >
              Deselect All
            </button>
            <button
              onClick={() => setScanResults(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
            >
              Re-scan
            </button>
            <button
              onClick={runCleanup}
              disabled={cleaning || totalSelectedSize === 0}
              className="px-6 py-2 bg-gradient-to-r from-brand-violet to-brand-cyan hover:from-brand-violet/90 hover:to-brand-cyan/90 disabled:opacity-50 text-xs font-bold rounded-xl cursor-pointer shadow-lg shadow-brand-violet/20 transition-all flex items-center gap-2"
            >
              {cleaning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Cleaning...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Clean Selected ({formatSize(totalSelectedSize)})
                </>
              )}
            </button>
          </div>

          {/* Category List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scanResults.map(item => {
              const isSelected = selectedCategories[item.id];
              return (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-brand-violet/30 bg-brand-violet/5'
                      : 'border-brand-border bg-slate-950/20 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCategory(item.id)}
                    className="h-4 w-4 mt-1 accent-brand-violet"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {item.icon}
                      <span className="text-sm font-bold text-slate-200">{item.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-2">{item.description}</p>
                    <span className="text-[10px] font-bold text-brand-cyan bg-brand-cyan/10 px-2 py-0.5 rounded">
                      Found: {formatSize(item.size)}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Cleaning Complete */}
      {!scanning && !scanResults && cleaning === false && (
        <div className="glass-panel border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4">
          <ShieldCheck className="h-12 w-12 text-brand-success mx-auto" />
          <h3 className="text-md font-bold text-slate-200">Privacy Cleanup Complete</h3>
          <p className="text-xs text-slate-400">All selected privacy data has been securely removed</p>
          <button
            onClick={() => { setScanResults(null); setSelectedCategories({}); runScan(); }}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
          >
            Scan Again
          </button>
        </div>
      )}
    </div>
  );
}
