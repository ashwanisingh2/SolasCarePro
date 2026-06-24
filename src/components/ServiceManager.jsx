import React, { useState, useEffect } from 'react';
import { Settings2, RefreshCw, Loader2, Play, Power, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

export default function ServiceManager() {
  const { addNotification } = useNotification();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actingOnService, setActingOnService] = useState(null);

  const loadServices = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('list-services');
        if (res.success && res.stdout) {
          setServices(JSON.parse(res.stdout.trim()));
        } else {
          setServices([]);
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        setServices([
          { Name: 'wuauserv', DisplayName: 'Windows Update', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false },
          { Name: 'bits', DisplayName: 'Background Intelligent Transfer Service', Status: 'Stopped', StartType: 'Manual', CanStop: false, IsRequired: false },
          { Name: 'WSearch', DisplayName: 'Windows Search', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false },
          { Name: 'Spooler', DisplayName: 'Print Spooler', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false },
          { Name: 'MpsSvc', DisplayName: 'Windows Defender Firewall', Status: 'Running', StartType: 'Automatic', CanStop: false, IsRequired: true },
          { Name: 'WinDefend', DisplayName: 'Microsoft Defender Antivirus Service', Status: 'Running', StartType: 'Automatic', CanStop: false, IsRequired: true },
          { Name: 'Audiosrv', DisplayName: 'Windows Audio', Status: 'Running', StartType: 'Automatic', CanStop: true, IsRequired: false }
        ]);
      }
    } catch (e) {
      console.error(e);
      addNotification('Services Manager', 'Failed to query services status: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const repairService = async (name) => {
    setActingOnService(name);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('repair-service', [name, 'repair']);
        if (res.success) {
          addNotification('Service Repair', `Successfully re-enabled and started service: ${name}`, 'success');
          loadServices();
        } else if (res.cancelled) {
          addNotification('Service Repair', 'Operation cancelled by user.', 'info');
        } else {
          addNotification('Service Repair Error', res.error || 'Failed to repair service.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        addNotification('Service Repair', `Repaired service ${name} successfully (MOCK).`, 'success');
      }
    } catch (e) {
      console.error(e);
      addNotification('Service Repair Error', e.message, 'error');
    } finally {
      setActingOnService(null);
    }
  };

  const restartService = async (name) => {
    setActingOnService(name);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('repair-service', [name, 'restart']);
        if (res.success) {
          addNotification('Service Restart', `Successfully restarted service: ${name}`, 'success');
          loadServices();
        } else if (res.cancelled) {
          addNotification('Service Restart', 'Operation cancelled by user.', 'info');
        } else {
          addNotification('Service Restart Error', res.error || 'Failed to restart service.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        addNotification('Service Restart', `Restarted service ${name} successfully (MOCK).`, 'success');
      }
    } catch (e) {
      console.error(e);
      addNotification('Service Restart Error', e.message, 'error');
    } finally {
      setActingOnService(null);
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Critical Services Manager</h2>
          <p className="text-xs text-slate-400">Inspect state status of core Windows background update, audio, networking, and security services.</p>
        </div>
        <button
          disabled={loading}
          onClick={loadServices}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-brand-violet mx-auto" />
          <p className="text-xs text-slate-400">Scanning active Windows service hosts...</p>
        </div>
      ) : services.length > 0 ? (
        <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/40 text-slate-400 border-b border-brand-border">
                  <th className="px-6 py-4 font-bold">Service Display Name</th>
                  <th className="px-6 py-4 font-bold">System Name</th>
                  <th className="px-6 py-4 font-bold">Status</th>
                  <th className="px-6 py-4 font-bold">Startup Type</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {services.map(svc => (
                  <tr key={svc.Name} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        {svc.IsRequired ? (
                          <ShieldCheck className="h-4 w-4 text-brand-success shrink-0" />
                        ) : null}
                        <span>{svc.DisplayName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-400">{svc.Name}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded font-black text-[10px] uppercase ${
                        svc.Status === 'Running' ? 'bg-emerald-500/10 text-brand-success' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {svc.Status}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-300">{svc.StartType}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          disabled={actingOnService !== null}
                          onClick={() => restartService(svc.Name)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded text-[11px] font-bold text-slate-300 cursor-pointer disabled:opacity-50"
                        >
                          {actingOnService === svc.Name ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Restart'}
                        </button>
                        <button
                          disabled={actingOnService !== null}
                          onClick={() => repairService(svc.Name)}
                          className="px-2.5 py-1 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 rounded text-[11px] font-bold text-brand-violet cursor-pointer disabled:opacity-50"
                        >
                          {actingOnService === svc.Name ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Repair & Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-24 text-center border border-dashed border-slate-800 rounded-2xl">
          <Settings2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-bold">Failed to load core services listing.</p>
        </div>
      )}
    </div>
  );
}
