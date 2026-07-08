import React, { useState, useEffect } from 'react';
import { Monitor, Cpu, HardDrive, Activity, Server, Zap, RefreshCw, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DeviceDetails() {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [software, setSoftware] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadingSoftware, setLoadingSoftware] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('hardware');

  const fetchDetails = async () => {
    try {
      setLoadingInfo(true);
      if (window.api) {
        const res = await window.api.runSystemCommand('get-device-details');
        if (res.success && res.stdout) {
          setDeviceInfo(JSON.parse(res.stdout));
        } else {
          throw new Error('Failed to fetch device details.');
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingInfo(false);
    }
  };

  const fetchSoftware = async () => {
    try {
      setLoadingSoftware(true);
      if (window.api) {
        const res = await window.api.runSystemCommand('get-installed-software');
        if (res.success && res.stdout) {
          setSoftware(JSON.parse(res.stdout));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSoftware(false);
    }
  };

  useEffect(() => {
    fetchDetails();
    fetchSoftware();
  }, []);

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div>
        <h2 className="text-xl font-bold text-slate-200">Device Overview</h2>
        <p className="text-xs text-slate-400 mt-1">Complete system specifications and installed software inventory.</p>
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-900/60 border border-brand-border rounded-xl p-1">
        <button
          onClick={() => setActiveTab('hardware')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'hardware' ? 'bg-brand-violet text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Server className="h-4 w-4" />
          <span>Hardware & OS</span>
        </button>
        <button
          onClick={() => setActiveTab('software')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'software' ? 'bg-brand-violet text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Monitor className="h-4 w-4" />
          <span>Installed Software</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              {loadingInfo ? (
                <div className="glass-panel border border-brand-border rounded-xl p-12 text-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
                  <p className="text-xs text-slate-500 font-semibold animate-pulse">Scanning system components...</p>
                </div>
              ) : error ? (
                <div className="glass-panel border border-rose-500/30 rounded-xl p-8 text-center text-rose-400">
                  {error}
                </div>
              ) : deviceInfo ? (
                <div className="glass-panel border border-brand-border rounded-xl p-5">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-3 mb-4">
                    <Server className="h-5 w-5 text-brand-violet" /> System Specifications Overview
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    {/* OS Summary */}
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-brand-cyan shrink-0" />
                      <div>
                        <p className="text-slate-500 text-xs">Operating System</p>
                        <p className="text-white font-semibold">{deviceInfo.OS.OsName} ({deviceInfo.OS.OsArchitecture})</p>
                      </div>
                    </div>

                    {/* CPU Summary */}
                    <div className="flex items-center gap-3">
                      <Cpu className="h-5 w-5 text-brand-violet shrink-0" />
                      <div>
                        <p className="text-slate-500 text-xs">Processor</p>
                        <p className="text-white font-semibold">{deviceInfo.CPU.Name}</p>
                      </div>
                    </div>

                    {/* RAM Summary */}
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-slate-500 text-xs">Installed Memory (RAM)</p>
                        <p className="text-white font-semibold">{deviceInfo.RAM} GB</p>
                      </div>
                    </div>

                    {/* GPU Summary */}
                    <div className="flex items-center gap-3">
                      <Monitor className="h-5 w-5 text-amber-400 shrink-0" />
                      <div>
                        <p className="text-slate-500 text-xs">Graphics</p>
                        <p className="text-white font-semibold">
                          {deviceInfo.GPU.map(g => `${g.Name} (${g.VRAM_GB} GB)`).join(' | ')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Storage Summary */}
                  <div className="mt-6 pt-4 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 mb-3">
                      <HardDrive className="h-4 w-4 text-blue-400" />
                      <p className="text-slate-500 text-xs">Storage Drives</p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {deviceInfo.Storage.map((drive, idx) => (
                        <div key={idx} className="bg-slate-950/50 px-4 py-2 rounded-lg border border-slate-800/50">
                          <span className="text-white font-bold mr-2">{drive.DeviceID}</span>
                          <span className="text-brand-cyan text-xs">{drive.FreeSpace_GB} GB Free </span>
                          <span className="text-slate-500 text-xs">/ {drive.Size_GB} GB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {activeTab === 'software' && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-brand-violet" /> Installed Applications
                </h3>
                <button onClick={fetchSoftware} className="text-slate-500 hover:text-white transition-colors cursor-pointer" disabled={loadingSoftware}>
                  <RefreshCw className={`h-4 w-4 ${loadingSoftware ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingSoftware ? (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
                  <p className="text-xs text-slate-500 font-semibold animate-pulse">Enumerating installed software...</p>
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  {software.length > 0 ? (
                    software.map((app, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 rounded bg-slate-950/30 border border-slate-800/50 hover:bg-slate-800/40 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-200">{app.DisplayName}</p>
                          <p className="text-xs text-slate-500">{app.Publisher || 'Unknown Publisher'}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs px-2 py-1 rounded bg-slate-900 border border-slate-800 text-slate-400">
                            {app.DisplayVersion || 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-slate-500 text-xs">No software found or unable to read registry.</div>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
