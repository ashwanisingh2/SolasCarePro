import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2, RefreshCw } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import CommandOutput from './shared/CommandOutput';

export default function DriverSweeper() {
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const runTool = async () => {
    setLoading(true);
    setResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['list-apps']);
        if (res.success) {
          addNotification('Success', 'Driver Sweeper operation completed.', 'success');
          setResult(res.stdout);
        } else {
          addNotification('Error', res.error || 'Operation failed', 'error');
          setResult(res.error || res.stderr);
        }
      } else {
        setTimeout(() => {
          setResult('Mock output for Driver Sweeper');
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
    <div className="h-full flex flex-col space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Driver Sweeper</h1>
          <p className="text-slate-400 mt-1 text-sm">Deeply clean out old GPU/Audio drivers for a fresh installation.</p>
        </div>
        <button 
          onClick={runTool}
          disabled={loading}
          className="px-6 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {loading ? 'Running...' : 'Execute Tool'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        {result ? (
          <CommandOutput logs={typeof result === 'string' ? result.split('\n') : [JSON.stringify(result)]} />
        ) : (
          <div className="glass-panel border border-brand-border rounded-xl p-8 text-center space-y-4">
            <h3 className="text-xl font-bold text-slate-300">Ready to Scan</h3>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Click "Execute Tool" to run the engine.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
