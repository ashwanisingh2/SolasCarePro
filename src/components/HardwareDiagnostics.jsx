import React, { useState, useEffect } from 'react';
import { Activity, ClipboardList, Clock, RefreshCw, Loader2, Play, AlertOctagon } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { formatDate } from '../utils/formatters';

export default function HardwareDiagnostics() {
  const { addNotification } = useNotification();
  const [ramResult, setRamResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const checkResult = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-ram-diagnostic-result');
        if (res.success && res.stdout) {
          setRamResult(JSON.parse(res.stdout.trim()));
        } else {
          setRamResult({ hasResult: false, result: 'No results found', testDate: 'N/A' });
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setRamResult({
          hasResult: true,
          result: 'No errors found',
          testDate: '2026-06-21 08:30:15'
        });
      }
    } catch (e) {
      console.error(e);
      addNotification('Diagnostics', 'Error reading test results: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const scheduleTest = async () => {
    setScheduling(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('schedule-ram-diagnostic');
        if (res.success) {
          addNotification('RAM Diagnostic', 'Windows Memory Diagnostic scheduled successfully.', 'success');
        } else if (res.cancelled) {
          addNotification('RAM Diagnostic', 'Operation cancelled by user.', 'info');
        } else {
          addNotification('RAM Diagnostic Error', res.error || 'Failed to schedule diagnostic.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        addNotification('RAM Diagnostic', 'Test scheduled successfully (MOCK).', 'success');
      }
    } catch (e) {
      console.error(e);
      addNotification('RAM Diagnostic Error', e.message, 'error');
    } finally {
      setScheduling(false);
    }
  };

  useEffect(() => {
    checkResult();
  }, []);

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Hardware Diagnostics</h2>
          <p className="text-xs text-slate-400">Perform RAM memory sector diagnostics and view physical health test scores.</p>
        </div>
        <button
          disabled={loading}
          onClick={checkResult}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check Results
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Results Card */}
        <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
            <ClipboardList className="h-5 w-5 text-brand-cyan" />
            Last Memory Test Status
          </h3>

          {loading ? (
            <div className="py-12 text-center space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-brand-violet mx-auto" />
              <p className="text-xs text-slate-500 font-semibold">Reading memory event records...</p>
            </div>
          ) : ramResult ? (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/30 border border-slate-900 space-y-3">
                <div>
                  <span className="text-slate-500 block">Health Verdict</span>
                  <span className={`text-lg font-black uppercase ${
                    ramResult.result === 'No errors found' ? 'text-brand-success' : 'text-rose-400 animate-pulse'
                  }`}>
                    {ramResult.result}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Last Run Date</span>
                  <span className="text-slate-200 font-bold text-sm">
                    {ramResult.testDate !== 'N/A' ? formatDate(ramResult.testDate) : 'Never Run'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 font-bold text-xs">
              No previous diagnostics results loaded.
            </div>
          )}
        </div>

        {/* Schedule Diagnostic Card */}
        <div className="glass-panel border border-brand-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-brand-border pb-2">
            <Activity className="h-5 w-5 text-brand-violet" />
            Schedule Diagnostics Test
          </h3>
          <div className="space-y-4 text-xs">
            <p className="text-slate-400 leading-relaxed">
              Schedule a Windows Memory Diagnostic test. This registers a boot task that scans physical RAM sectors for hardware anomalies on the next system startup.
            </p>
            <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-950/5 text-amber-400 flex gap-2">
              <AlertOctagon className="h-5 w-5 shrink-0" />
              <span>Requires system restart. The PC will reboot into diagnostic mode and may take up to 30 minutes.</span>
            </div>
            <button
              disabled={scheduling}
              onClick={scheduleTest}
              className="w-full py-3 bg-brand-violet hover:bg-brand-violet/85 text-xs font-black text-white rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Schedule RAM Diagnostic Test
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
