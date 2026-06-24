import React, { useState, useEffect } from 'react';
import { Cpu, CircuitBoard, Info, MemoryStick, RefreshCw, Loader2, LibraryBig } from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';

export default function HardwareInfo() {
  const { addNotification } = useNotification();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadHardware = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-hardware-info');
        if (res.success && res.stdout) {
          setData(JSON.parse(res.stdout.trim()));
        } else {
          addNotification('Hardware Query', 'Failed to retrieve hardware specs', 'error');
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        setData({
          CPU: { Name: 'AMD Ryzen 7 5800X 8-Core Processor', Cores: 8, LogicalProcessors: 16, MaxClockSpeedMHz: 3800, LoadPercent: 24 },
          GPU: [
            { Name: 'NVIDIA GeForce RTX 3080', AdapterRAM: 10737418240, DriverVersion: '551.61', VideoProcessor: 'NVIDIA' }
          ],
          RAM: {
            TotalGB: 31.91,
            FreeGB: 18.23,
            UsedPercent: 42.8,
            Slots: [
              { Capacity: 16, Speed: 3200, Manufacturer: 'Corsair' },
              { Capacity: 16, Speed: 3200, Manufacturer: 'Corsair' }
            ]
          },
          Motherboard: { Manufacturer: 'ASUSTeK COMPUTER INC.', Product: 'ROG STRIX B550-F GAMING', SerialNumber: '21098234792348' },
          BIOS: { Manufacturer: 'American Megatrends Inc.', Version: '3002', ReleaseDate: '2023-03-10' }
        });
      }
    } catch (e) {
      console.error(e);
      addNotification('Hardware Info Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHardware();
  }, []);

  return (
    <div className="p-6 space-y-6 text-left">
      <div className="flex justify-between items-center select-none">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Hardware Specifications</h2>
          <p className="text-xs text-slate-400">Complete hardware inventory and current resource states</p>
        </div>
        <button
          disabled={loading}
          onClick={loadHardware}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-violet mx-auto" />
          <p className="text-xs text-slate-400">Querying motherboard chips, CPU registries, BIOS status and graphics devices...</p>
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 select-none">
          {/* CPU Card */}
          {data.CPU && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <Cpu className="h-5 w-5 text-brand-cyan" />
                Processor (CPU)
              </h3>
              <div className="space-y-2 text-xs">
                <p className="text-sm font-black text-slate-100">{data.CPU.Name}</p>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <span className="text-slate-500 block">Physical Cores</span>
                    <span className="text-slate-200 font-bold text-sm">{data.CPU.Cores} Cores</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Logical Threads</span>
                    <span className="text-slate-200 font-bold text-sm">{data.CPU.LogicalProcessors} Threads</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Base Clock Speed</span>
                    <span className="text-slate-200 font-bold text-sm">{data.CPU.MaxClockSpeedMHz} MHz</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Current Load</span>
                    <span className={`font-black text-sm ${data.CPU.LoadPercent > 80 ? 'text-rose-400' : 'text-brand-success'}`}>
                      {data.CPU.LoadPercent}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Memory Card */}
          {data.RAM && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <MemoryStick className="h-5 w-5 text-brand-violet" />
                Physical Memory (RAM)
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-black text-slate-100">{data.RAM.TotalGB} GB Total Installed</p>
                    <p className="text-[10px] text-slate-500 mt-1">Available: {data.RAM.FreeGB} GB</p>
                  </div>
                  <span className="font-bold text-slate-300">{data.RAM.UsedPercent}% Used</span>
                </div>
                
                {/* Progress bar */}
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div 
                    className="h-full bg-brand-violet transition-all duration-500" 
                    style={{ width: `${data.RAM.UsedPercent}%` }}
                  />
                </div>

                {/* Slots details */}
                {data.RAM.Slots && data.RAM.Slots.length > 0 && (
                  <div className="pt-2">
                    <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Memory Modules Detail</p>
                    <div className="space-y-2">
                      {data.RAM.Slots.map((slot, idx) => (
                        <div key={idx} className="flex justify-between p-2 rounded bg-slate-950/30 text-[11px] border border-slate-900">
                          <span className="font-bold text-slate-300">DIMM Slot #{idx+1} ({slot.Capacity} GB)</span>
                          <span className="text-slate-500">{slot.Speed} MHz | {slot.Manufacturer || 'OEM'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* GPU Card */}
          {data.GPU && data.GPU.length > 0 && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <CircuitBoard className="h-5 w-5 text-emerald-400" />
                Graphics Adapter (GPU)
              </h3>
              <div className="space-y-4 text-xs">
                {data.GPU.map((gpu, idx) => (
                  <div key={idx} className="space-y-2">
                    <p className="text-sm font-black text-slate-100">{gpu.Name}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-slate-500 block">VRAM Adapter Size</span>
                        <span className="text-slate-200 font-bold text-sm">{formatBytes(gpu.AdapterRAM)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Active Driver Version</span>
                        <span className="text-slate-200 font-mono font-bold text-sm">{gpu.DriverVersion}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Board & BIOS Card */}
          <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
              <Info className="h-5 w-5 text-amber-400" />
              Motherboard & BIOS
            </h3>
            <div className="space-y-3 text-xs">
              {data.Motherboard && (
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Baseboard (Motherboard)</p>
                  <ul className="list-none space-y-1.5 pl-0">
                    <li className="flex justify-between">
                      <span className="text-slate-500">Manufacturer</span>
                      <span className="text-slate-300 font-bold">{data.Motherboard.Manufacturer}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-500">Product Model</span>
                      <span className="text-slate-300 font-bold">{data.Motherboard.Product}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-500">Serial Key</span>
                      <span className="text-slate-400 font-mono truncate max-w-[200px]">{data.Motherboard.SerialNumber}</span>
                    </li>
                  </ul>
                </div>
              )}
              {data.BIOS && (
                <div className="pt-2 border-t border-slate-900">
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">BIOS firmware</p>
                  <ul className="list-none space-y-1.5 pl-0">
                    <li className="flex justify-between">
                      <span className="text-slate-500">Brand</span>
                      <span className="text-slate-300 font-bold">{data.BIOS.Manufacturer}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-500">Version Code</span>
                      <span className="text-slate-300 font-mono font-bold">{data.BIOS.Version}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-slate-500">Release Date</span>
                      <span className="text-slate-300 font-bold">{data.BIOS.ReleaseDate}</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl">
          <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-bold">Failed to load hardware inventory.</p>
        </div>
      )}
    </div>
  );
}
