import React, { useState } from 'react';
import { ShieldAlert, Zap, LayoutTemplate, Lock, RefreshCw, Power } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const TWEAKS = [
  { id: 'context-menu', name: 'Classic Windows Context Menu', desc: 'Restores the old Windows 10 right-click menu in Windows 11.', icon: LayoutTemplate },
  { id: 'telemetry', name: 'Disable Microsoft Telemetry', desc: 'Blocks Windows from sending diagnostic and usage data to Microsoft.', icon: ShieldAlert },
  { id: 'web-search', name: 'Disable Start Menu Web Search', desc: 'Removes Bing web results from Windows Start Menu search.', icon: Zap },
  { id: 'lock-ads', name: 'Disable Lock Screen Ads', desc: 'Prevents Windows from showing tips and advertisements on the lock screen.', icon: Lock }
];

export default function WindowsTweaks() {
  const { addNotification } = useNotification();
  const [processing, setProcessing] = useState(null);

  const applyTweak = async (tweakId, enable, name) => {
    setProcessing(tweakId);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('apply-win-tweak', [tweakId, enable]);
        if (res.success) {
          addNotification('Windows Tweak', `${name} ${enable ? 'Applied' : 'Reverted'} successfully.`, 'success');
        } else if (!res.cancelled) {
          throw new Error(res.error || 'Failed to apply tweak');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        addNotification('Windows Tweak', `${name} ${enable ? 'Applied' : 'Reverted'} (Mock)`, 'success');
      }
    } catch (e) {
      addNotification('Tweak Error', e.message, 'error');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div>
        <h2 className="text-xl font-bold text-slate-200">Windows "God Mode" Tweaks</h2>
        <p className="text-xs text-slate-400 mt-1">Unlock hidden registry features, enhance privacy, and remove Windows annoyances.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TWEAKS.map(tweak => {
          const Icon = tweak.icon;
          const isWorking = processing === tweak.id;
          return (
            <div key={tweak.id} className="glass-panel border border-brand-border rounded-xl p-5 hover:border-brand-violet/50 transition-colors flex flex-col justify-between">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                  <Icon className="h-6 w-6 text-brand-violet" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-200">{tweak.name}</h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">{tweak.desc}</p>
                </div>
              </div>
              
              <div className="flex gap-2 mt-6 border-t border-slate-800/50 pt-4">
                <button
                  onClick={() => applyTweak(tweak.id, true, tweak.name)}
                  disabled={isWorking}
                  className="flex-1 py-2 bg-brand-violet/20 hover:bg-brand-violet/40 text-brand-violet border border-brand-violet/30 text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isWorking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  Apply Tweak
                </button>
                <button
                  onClick={() => applyTweak(tweak.id, false, tweak.name)}
                  disabled={isWorking}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  Restore Default
                </button>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-4 p-4 rounded-xl bg-amber-950/20 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0" />
        <p><strong>Note:</strong> Some tweaks (like Classic Context Menu) will automatically restart Windows Explorer and your taskbar will blink. This is normal.</p>
      </div>
    </div>
  );
}
