import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Loader2, Server } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import CommandOutput from './shared/CommandOutput';

export default function UltimatePerformance() {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const applyTweak = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-power-tweak', ['ultimate-plan']);
        if (res.success) {
          addNotification('Success', 'Ultimate Performance Plan applied successfully.', 'success');
          const m = res.stdout.match(/\{[\s\S]*\}/); let out = res.stdout; if (m) { try { out = JSON.parse(m[0]).message || out; } catch(e){} }; setResult(out);
        } else {
          addNotification('Error', res.error || 'Failed to apply tweak', 'error');
          setResult(res.error || res.stderr);
        }
      } else {
        setTimeout(() => {
          setResult('Mock successful operation for Ultimate Performance Plan');
          setLoading(false);
        }, 1000);
        return;
      }
    } catch (e) {
      addNotification('Error', e.message, 'error');
      setResult(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Ultimate Performance Plan</h2>
          <p className="text-xs text-slate-400">Unlock and apply the hidden Windows Ultimate Performance power plan for zero latency.</p>
        </div>
        <button 
          onClick={applyTweak}
          disabled={loading}
          className="px-6 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {loading ? 'Applying...' : 'Apply Tweak'}
        </button>
      </div>

      <div className="glass-panel border border-brand-border rounded-xl p-6">
        {result ? (
          <CommandOutput logs={typeof result === 'string' ? result.split('\n') : [JSON.stringify(result)]} />
        ) : (
          <div className="text-center py-8 space-y-4">
             <Server className="h-10 w-10 text-slate-500 mx-auto" />
             <p className="text-slate-400 text-sm max-w-md mx-auto">
               Ready to apply system-level power configuration for maximum performance.
             </p>
          </div>
        )}
      </div>
    </div>
  );
}
