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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* OS */}
                  <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                      <Zap className="h-4 w-4 text-brand-cyan" /> Operating System
                    </h3>
                    <div className="space-y-2 text-xs text-slate-400">
                      <p><span className="text-slate-500">Name:</span> <span className="text-white font-semibold">{deviceInfo.OS.OsName}</span></p>
                      <p><span className="text-slate-500">Version:</span> <span className="text-white font-semibold">{deviceInfo.OS.OsVersion}</span></p>
                      <p><span className="text-slate-500">Architecture:</span> <span className="text-white font-semibold">{deviceInfo.OS.OsArchitecture}</span></p>
                      <p><span className="text-slate-500">Host Name:</span> <span className="text-white font-semibold">{deviceInfo.OS.CsName}</span></p>
                    </div>
                  </div>

                  {/* CPU */}
                  <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                      <Cpu className="h-4 w-4 text-brand-violet" /> Processor
                    </h3>
                    <div className="space-y-2 text-xs text-slate-400">
                      <p><span className="text-slate-500">Model:</span> <span className="text-white font-semibold">{deviceInfo.CPU.Name}</span></p>
                      <p><span className="text-slate-500">Cores:</span> <span className="text-white font-semibold">{deviceInfo.CPU.NumberOfCores}</span></p>
                      <p><span className="text-slate-500">Logical Processors:</span> <span className="text-white font-semibold">{deviceInfo.CPU.NumberOfLogicalProcessors}</span></p>
                    </div>
                  </div>

                  {/* RAM */}
                  <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                      <Activity className="h-4 w-4 text-emerald-400" /> Memory
                    </h3>
                    <div className="space-y-2 text-xs text-slate-400">
                      <p><span className="text-slate-500">Total Installed RAM:</span> <span className="text-white font-semibold text-lg">{deviceInfo.RAM} GB</span></p>
                    </div>
                  </div>

                  {/* GPU */}
                  <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                      <Monitor className="h-4 w-4 text-amber-400" /> Graphics
                    </h3>
                    <div className="space-y-3 text-xs text-slate-400">
                      {deviceInfo.GPU.map((gpu, idx) => (
                        <div key={idx} className="p-3 bg-slate-950/30 rounded border border-slate-800/50">
                          <p><span className="text-slate-500">Name:</span> <span className="text-white font-semibold">{gpu.Name}</span></p>
                          <p><span className="text-slate-500">VRAM:</span> <span className="text-white font-semibold">{gpu.VRAM_GB} GB</span></p>
                          <p><span className="text-slate-500">Driver:</span> <span className="text-white">{gpu.DriverVersion}</span></p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Storage */}
                  <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-3 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                      <HardDrive className="h-4 w-4 text-blue-400" /> Storage Drives
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-400">
                      {deviceInfo.Storage.map((drive, idx) => (
                        <div key={idx} className="p-3 bg-slate-950/30 rounded border border-slate-800/50 flex flex-col gap-2">
                          <div className="flex justify-between items-center">
                            <span className="text-white font-bold">{drive.DeviceID} {drive.VolumeName ? `(${drive.VolumeName})` : ''}</span>
                            <span className="text-brand-cyan">{drive.FreeSpace_GB} GB Free</span>
                          </div>
                          <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className="bg-brand-violet h-1.5" 
                              style={{ width: `${Math.max(0, 100 - (drive.FreeSpace_GB / drive.Size_GB) * 100)}%` }} 
                            />
                          </div>
                          <p className="text-right text-slate-500">Total: {drive.Size_GB} GB</p>
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
