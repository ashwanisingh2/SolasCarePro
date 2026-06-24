import React, { useState, useEffect } from 'react';
import { Cpu, CircuitBoard, Info, MemoryStick, RefreshCw, Loader2, LibraryBig, HardDrive, Network } from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';

function safeJsonParse(str, fallback = null) {
  if (!str) return fallback;
  try {
    const startObj = str.indexOf('{');
    const startArr = str.indexOf('[');
    let startIndex = -1;
    let endIndex = -1;
    
    if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
      startIndex = startObj;
      endIndex = str.lastIndexOf('}');
    } else if (startArr !== -1) {
      startIndex = startArr;
      endIndex = str.lastIndexOf(']');
    }
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const jsonStr = str.substring(startIndex, endIndex + 1);
      return JSON.parse(jsonStr);
    }
    
    return JSON.parse(str.trim());
  } catch (e) {
    console.error('Failed to parse JSON:', e, 'Raw string:', str);
    return fallback;
  }
}

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
          setData(safeJsonParse(res.stdout));
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
          BIOS: { Manufacturer: 'American Megatrends Inc.', Version: '3002', ReleaseDate: '2023-03-10' },
          Storage: [
            { Model: 'Samsung SSD 980 PRO 1TB', SizeGB: 931.51, MediaType: 'SSD', InterfaceType: 'NVMe', SerialNumber: 'S690NX0R123456' }
          ],
          NetworkAdapters: [
            { Name: 'Intel(R) Ethernet Controller I225-V', AdapterType: 'Ethernet 802.3', MACAddress: '00:1A:2B:3C:4D:5E', Speed: '1000 Mbps', Status: 2 }
          ]
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 select-none">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-panel border border-brand-border rounded-xl p-5 space-y-4 animate-pulse bg-slate-900/10">
              <div className="flex items-center gap-2 border-b border-brand-border pb-2">
                <div className="h-5 w-5 bg-slate-800 rounded-full"></div>
                <div className="h-4 bg-slate-800 rounded w-1/3"></div>
              </div>
              <div className="space-y-3">
                <div className="h-5 bg-slate-800 rounded w-3/4"></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                    <div className="h-4 bg-slate-800 rounded w-2/3"></div>
                  </div>
                  <div className="space-y-1">
                    <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                    <div className="h-4 bg-slate-800 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 select-none">
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

          {/* Storage Card */}
          {data.Storage && data.Storage.length > 0 && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4 bg-slate-900/10">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <HardDrive className="h-5 w-5 text-amber-400" />
                Physical Storage (Drives)
              </h3>
              <div className="space-y-4 text-xs">
                {data.Storage.map((disk, idx) => (
                  <div key={idx} className="space-y-1.5 border-b border-slate-900 last:border-0 pb-2.5 last:pb-0">
                    <p className="font-bold text-slate-200">{disk.Model}</p>
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                      <div>Capacity: <span className="text-slate-300 font-semibold">{disk.SizeGB} GB</span></div>
                      <div>Type: <span className="text-slate-300 font-semibold">{disk.MediaType || 'Fixed hard disk'}</span></div>
                      <div>Interface: <span className="text-slate-300 font-semibold">{disk.InterfaceType}</span></div>
                      <div className="truncate" title={disk.SerialNumber}>S/N: <span className="text-slate-400 font-mono text-[10px]">{disk.SerialNumber}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Network Adapters Card */}
          {data.NetworkAdapters && data.NetworkAdapters.length > 0 && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4 bg-slate-900/10">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <Network className="h-5 w-5 text-brand-cyan" />
                Network Interfaces
              </h3>
              <div className="space-y-4 text-xs">
                {data.NetworkAdapters.map((nic, idx) => (
                  <div key={idx} className="space-y-1.5 border-b border-slate-900 last:border-0 pb-2.5 last:pb-0">
                    <p className="font-bold text-slate-200">{nic.Name}</p>
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                      <div>Link Speed: <span className="text-slate-300 font-semibold">{nic.Speed}</span></div>
                      <div>MAC: <span className="text-slate-400 font-mono text-[10px]">{nic.MACAddress}</span></div>
                      <div className="col-span-2">Type: <span className="text-slate-300 font-semibold">{nic.AdapterType || 'Ethernet'}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl space-y-4 bg-slate-900/10">
          <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-1 animate-pulse" />
          <div>
            <p className="text-xs text-slate-400 font-bold">Failed to load hardware specifications.</p>
            <p className="text-[10px] text-slate-500 mt-1">Please check WMI service presence or try running as Administrator.</p>
          </div>
          <button
            onClick={loadHardware}
            className="px-5 py-2.5 bg-brand-violet hover:bg-brand-violet/85 text-xs font-bold rounded-lg text-white cursor-pointer shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
          >
            Retry Query
          </button>
        </div>
      )}
    </div>
  );
}
