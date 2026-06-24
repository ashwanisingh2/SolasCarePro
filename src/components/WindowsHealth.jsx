import React, { useState, useEffect, useRef } from 'react';
import { 
  MonitorCheck, RefreshCw, Loader2, Sparkles, CheckCircle2, 
  AlertTriangle, KeyRound, HardDrive, Terminal
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { formatDate } from '../utils/formatters';

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

export default function WindowsHealth() {
  const { addNotification } = useNotification();
  
  // OS and Activation info state
  const [winInfo, setWinInfo] = useState(null);
  const [actInfo, setActInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationStatus, setActivationStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [activationLogs, setActivationLogs] = useState([]);
  
  // DISM state
  const [componentStore, setComponentStore] = useState(null);
  const [loadingStore, setLoadingStore] = useState(false);
  const [cleaningStore, setCleaningStore] = useState(false);
  const [cleanupStatus, setCleanupStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [cleanupLogs, setCleanupLogs] = useState([]);
  
  const dismLogsEndRef = useRef(null);

  useEffect(() => {
    if (dismLogsEndRef.current) {
      dismLogsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [cleanupLogs]);

  const loadInfo = async () => {
    setLoadingInfo(true);
    try {
      if (window.api) {
        const resInfo = await window.api.runSystemCommand('get-windows-info');
        if (resInfo.success && resInfo.stdout) {
          setWinInfo(safeJsonParse(resInfo.stdout));
        }
        
        const resAct = await window.api.runSystemCommand('check-activation');
        if (resAct.success && resAct.stdout) {
          setActInfo(safeJsonParse(resAct.stdout));
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        setWinInfo({
          Edition: 'Windows 11 Professional',
          Build: '22631.3447',
          Version: '23H2',
          Architecture: '64-bit OS',
          InstallDate: '2024-01-15',
          LastBootTime: '2026-06-23T08:30:00',
          PendingUpdates: 3,
          LastUpdateDate: '2026-06-20'
        });
        setActInfo({
          ProductName: 'Windows(R), Professional edition',
          PartialKey: '3V66T',
          LicenseStatus: 'Licensed',
          ExpiryInfo: 'The machine is permanently activated.',
          KMSServer: null,
          GracePeriodDays: null
        });
      }
    } catch (e) {
      console.error(e);
      addNotification('Windows Health', 'Error checking OS info: ' + e.message, 'error');
    } finally {
      setLoadingInfo(false);
    }
  };

  const loadComponentStoreInfo = async () => {
    setLoadingStore(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('analyze-component-store');
        if (res.success && res.stdout) {
          setComponentStore(safeJsonParse(res.stdout));
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setComponentStore({
          totalSizeGB: 11.23,
          reclaimableGB: 1.25,
          lastCleanupDate: '2026-06-18 14:02:11'
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStore(false);
    }
  };

  const runActivationRepair = async () => {
    setActivating(true);
    setActivationStatus('idle');
    setActivationLogs(['[SYSTEM] Initiating Windows online activation sequence...', '']);
    let unsub = null;
    if (window.api && window.api.onStream) {
      unsub = window.api.onStream('care-out', (data) => {
        setActivationLogs(prev => [...prev, ...data.split('\n')]);
      });
    }
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('windows-activation-repair');
        if (res.success) {
          setActivationLogs(prev => [...prev, '', '[SUCCESS] Online activation command completed successfully.']);
          addNotification('Activation Repair', 'Windows online activation attempt complete.', 'success');
          setActivationStatus('success');
          loadInfo();
        } else if (res.cancelled) {
          setActivationLogs(prev => [...prev, '', '[CANCELLED] Activation repair cancelled.']);
          setActivationStatus('idle');
        } else {
          setActivationLogs(prev => [...prev, '', `[ERROR] Activation failed: ${res.error || res.stderr}`]);
          setActivationStatus('error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setActivationLogs(prev => [...prev, '[MOCK] slmgr /ato executed successfully.']);
        addNotification('Activation Repair', 'Windows activated (MOCK).', 'success');
        setActivationStatus('success');
      }
    } catch (e) {
      setActivationLogs(prev => [...prev, '', `[ERROR] ${e.message}`]);
      setActivationStatus('error');
    } finally {
      if (unsub) unsub();
      setActivating(false);
      setTimeout(() => {
        setActivationStatus('idle');
      }, 2000);
    }
  };

  const runComponentStoreCleanup = async () => {
    setCleaningStore(true);
    setCleanupStatus('idle');
    setCleanupLogs(['[SYSTEM] Executing WinSxS Component Store deep cleanup...', '[SYSTEM] Warning: This operation removes superseded component base packages and is IRREVERSIBLE.', '']);
    let unsub = null;
    if (window.api && window.api.onStream) {
      unsub = window.api.onStream('care-out', (data) => {
        setCleanupLogs(prev => [...prev, ...data.split('\n')]);
      });
    }
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('cleanup-component-store');
        if (res.success && res.stdout) {
          const detail = safeJsonParse(res.stdout);
          const freedSpace = detail ? detail.freedSpaceGB : 0;
          setCleanupLogs(prev => [...prev, '', `[SUCCESS] Clean complete! Reclaimed ${freedSpace || 0} GB of storage space.`]);
          addNotification('Store Cleaned', `Component store cleanup complete. Freed ${freedSpace || 0} GB.`, 'success');
          setCleanupStatus('success');
          loadComponentStoreInfo();
        } else if (res.cancelled) {
          setCleanupLogs(prev => [...prev, '', '[CANCELLED] Component store cleanup cancelled.']);
          setCleanupStatus('idle');
        } else {
          setCleanupLogs(prev => [...prev, '', `[ERROR] Cleanup failed: ${res.error}`]);
          setCleanupStatus('error');
        }
      } else {
        await new Promise(r => setTimeout(r, 2000));
        setCleanupLogs(prev => [...prev, '[MOCK] Component store cleanup completed. Reclaimed 1.25 GB.']);
        addNotification('Store Cleaned', 'Cleanup completed (MOCK).', 'success');
        setCleanupStatus('success');
      }
    } catch (e) {
      setCleanupLogs(prev => [...prev, '', `[ERROR] ${e.message}`]);
      setCleanupStatus('error');
    } finally {
      if (unsub) unsub();
      setCleaningStore(false);
      setTimeout(() => {
        setCleanupStatus('idle');
      }, 2000);
    }
  };

  useEffect(() => {
    loadInfo();
    loadComponentStoreInfo();
  }, []);

  const getActivationBtnContent = () => {
    if (activating) {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Activating...</span>
        </>
      );
    }
    if (activationStatus === 'success') {
      return (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>Activated Successfully</span>
        </>
      );
    }
    if (activationStatus === 'error') {
      return (
        <>
          <AlertTriangle className="h-4 w-4 text-rose-400" />
          <span>Activation Failed</span>
        </>
      );
    }
    return (
      <>
        <RefreshCw className="h-4 w-4" />
        <span>Attempt Online Activation</span>
      </>
    );
  };

  const getActivationBtnClass = () => {
    const base = "w-full py-2.5 text-xs font-bold rounded-lg text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors duration-200 ";
    if (activationStatus === 'success') {
      return base + "bg-emerald-600 hover:bg-emerald-500";
    }
    if (activationStatus === 'error') {
      return base + "bg-rose-600 hover:bg-rose-500";
    }
    return base + "bg-brand-violet hover:bg-brand-violet/85";
  };

  const getCleanupBtnContent = () => {
    if (cleaningStore) {
      return (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Cleaning Store...</span>
        </>
      );
    }
    if (cleanupStatus === 'success') {
      return (
        <>
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>Cleanup Complete</span>
        </>
      );
    }
    if (cleanupStatus === 'error') {
      return (
        <>
          <AlertTriangle className="h-4 w-4 text-rose-400" />
          <span>Cleanup Failed</span>
        </>
      );
    }
    return (
      <>
        <Sparkles className="h-4 w-4" />
        <span>Perform WinSxS ResetBase Cleanup</span>
      </>
    );
  };

  const getCleanupBtnClass = () => {
    const base = "w-full py-2.5 text-xs font-black rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors duration-200 ";
    if (cleanupStatus === 'success') {
      return base + "bg-emerald-600 text-white hover:bg-emerald-500";
    }
    if (cleanupStatus === 'error') {
      return base + "bg-rose-600 text-white hover:bg-rose-500";
    }
    return base + "bg-amber-500 text-slate-950 hover:bg-amber-400";
  };

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Windows Health & Component Store</h2>
          <p className="text-xs text-slate-400">Manage operating system configuration, license activation, and perform WinSxS folder cleanup.</p>
        </div>
        <button
          disabled={loadingInfo}
          onClick={() => { loadInfo(); loadComponentStoreInfo(); }}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loadingInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OS Overview & License Info */}
        <div className="space-y-6">
          {/* OS Stats */}
          {winInfo && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <MonitorCheck className="h-5 w-5 text-brand-cyan" />
                Windows Installation Overview
              </h3>
              <ul className="list-none space-y-2 text-xs pl-0">
                <li className="flex justify-between">
                  <span className="text-slate-500">Edition</span>
                  <span className="text-slate-300 font-bold">{winInfo.Edition}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Version / Feature Release</span>
                  <span className="text-slate-300 font-bold">{winInfo.Version}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">OS Build Number</span>
                  <span className="text-slate-300 font-mono font-bold">{winInfo.Build}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Architecture</span>
                  <span className="text-slate-300 font-bold">{winInfo.Architecture}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Install Date</span>
                  <span className="text-slate-300 font-bold">{winInfo.InstallDate}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Last System Boot</span>
                  <span className="text-slate-300 font-bold">{formatDate(winInfo.LastBootTime)}</span>
                </li>
              </ul>
            </div>
          )}

          {/* License Status */}
          {actInfo && (
            <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
                <KeyRound className="h-5 w-5 text-brand-violet" />
                Windows Activation & Licensing
              </h3>
              <ul className="list-none space-y-2 text-xs pl-0">
                <li className="flex justify-between">
                  <span className="text-slate-500">Product Registration</span>
                  <span className="text-slate-300 font-bold">{actInfo.ProductName}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Partial Product Key</span>
                  <span className="text-slate-300 font-mono font-bold">XXXXX-XXXXX-XXXXX-XXXXX-{actInfo.PartialKey}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    actInfo.LicenseStatus === 'Licensed' ? 'bg-emerald-500/10 text-brand-success' : 'bg-rose-500/10 text-brand-danger animate-pulse'
                  }`}>
                    {actInfo.LicenseStatus}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span className="text-slate-500">Expiration</span>
                  <span className="text-slate-300 font-bold">{actInfo.ExpiryInfo}</span>
                </li>
                {actInfo.KMSServer && (
                  <li className="flex justify-between">
                    <span className="text-slate-500">Configured KMS Host</span>
                    <span className="text-slate-300 font-bold">{actInfo.KMSServer}</span>
                  </li>
                )}
              </ul>
              
              <div className="pt-2">
                <button
                  disabled={activating || activationStatus !== 'idle'}
                  onClick={runActivationRepair}
                  className={getActivationBtnClass()}
                >
                  {getActivationBtnContent()}
                </button>
              </div>

              {activationLogs.length > 0 && (
                <div className="h-[120px] overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-3 font-mono text-[9px] leading-relaxed text-slate-300">
                  {activationLogs.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SxS Component Store Health / DISM */}
        <div className="space-y-6">
          <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
              <HardDrive className="h-5 w-5 text-amber-400" />
              Component Store (WinSxS) Health
            </h3>

            {loadingStore ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
                <p className="text-xs text-slate-500 font-semibold">Running DISM component store size analysis...</p>
              </div>
            ) : componentStore ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-slate-950/30 border border-slate-900">
                    <span className="text-slate-500 block mb-0.5">Store Actual Size</span>
                    <span className="text-slate-100 font-black text-lg">{componentStore.totalSizeGB} GB</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/30 border border-slate-900">
                    <span className="text-slate-500 block mb-0.5">Reclaimable Space</span>
                    <span className={`font-black text-lg ${componentStore.reclaimableGB > 0 ? 'text-amber-400' : 'text-brand-success'}`}>
                      {componentStore.reclaimableGB} GB
                    </span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date of Last Store Clean</span>
                  <span className="text-slate-300 font-bold">{componentStore.lastCleanupDate}</span>
                </div>

                <div className="pt-2">
                  <button
                    disabled={cleaningStore || cleanupStatus !== 'idle' || componentStore.reclaimableGB === 0}
                    onClick={runComponentStoreCleanup}
                    className={getCleanupBtnClass()}
                  >
                    {getCleanupBtnContent()}
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-xs text-slate-500 font-bold">Failed to analyze component store.</p>
              </div>
            )}

            {cleanupLogs.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-wider flex items-center gap-1.5">
                  <Terminal className="h-3 w-3" />
                  DISM Output Console
                </h4>
                <div className="h-[200px] overflow-y-auto rounded-lg border border-slate-800 bg-black/40 p-4 font-mono text-[9px] leading-relaxed text-slate-300">
                  {cleanupLogs.map((line, idx) => (
                    <p key={idx} className={line.startsWith('[ERROR]') ? 'text-rose-300' : line.startsWith('[SUCCESS]') ? 'text-emerald-300' : 'text-slate-300'}>
                      {line}
                    </p>
                  ))}
                  <div ref={dismLogsEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
