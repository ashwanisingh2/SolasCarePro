import React, { useState, useEffect } from 'react';
import { Bot, RefreshCw, Loader2, AlertCircle, Sparkles, MessageSquare } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { formatDate } from '../utils/formatters';

export default function AiDiagnostics() {
  const { addNotification } = useNotification();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  const scanLogs = async () => {
    setLoading(true);
    setAnalysisResult(null);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-critical-logs');
        if (res.success && res.stdout) {
          const parsed = JSON.parse(res.stdout);
          setLogs(Array.isArray(parsed) ? parsed : [parsed]);
        }
      }
    } catch (e) {
      console.error(e);
      addNotification('AI Diagnostics', 'Failed to read critical event logs.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scanLogs();
  }, []);

  const runAiAnalysis = () => {
    setAnalyzing(true);
    
    // Simulate AI processing heuristic analysis on the logs
    setTimeout(() => {
      let issuesFound = [];
      let recommendation = '';
      
      const combinedMsg = logs.map(l => l.Message).join(' ').toLowerCase();
      
      if (combinedMsg.includes('disk') || combinedMsg.includes('ntfs')) {
        issuesFound.push('Storage Drive Errors (NTFS/Disk)');
        recommendation = 'Run the "Check Disk (chkdsk)" tool from the Command Hub and check your SSD health.';
      }
      if (combinedMsg.includes('kernel-power') || combinedMsg.includes('unexpected shutdown')) {
        issuesFound.push('Kernel Power Unexpected Shutdowns');
        recommendation = "Check your power supply (PSU) and ensure your system isn't overheating. Update Display Drivers.";
      }
      if (combinedMsg.includes('application error') || combinedMsg.includes('faulting module')) {
        issuesFound.push('Application/Module Crashes');
        recommendation = 'Run "SFC /Scannow" from Command Hub to repair corrupt system files. Some apps might need re-installation.';
      }
      if (combinedMsg.includes('network') || combinedMsg.includes('wlan')) {
        issuesFound.push('Network Connectivity Drops');
        recommendation = 'Use "Restart Network Adapters" or "Winsock Reset" in the Command Hub.';
      }

      if (issuesFound.length === 0) {
        setAnalysisResult({
          status: 'healthy',
          title: 'System Appears Healthy',
          desc: 'Based on the last 15 critical event logs, no major recurring hardware or software failure patterns were detected.'
        });
      } else {
        setAnalysisResult({
          status: 'warning',
          title: 'Potential Issues Detected',
          issues: issuesFound,
          desc: recommendation
        });
      }
      setAnalyzing(false);
    }, 2500);
  };

  return (
    <div className="p-6 space-y-6 text-left select-none">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Solas AI Diagnostics</h2>
          <p className="text-xs text-slate-400 mt-1">Intelligent heuristic analysis of Windows Critical Event Logs.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: AI Interface */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass-panel border border-brand-border rounded-xl p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-brand-violet/20 rounded-full flex items-center justify-center mx-auto border border-brand-violet/50 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
              <Bot className="h-8 w-8 text-brand-violet" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Ask Solas AI</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                I can analyze your recent system crashes, freezes, and critical errors to tell you exactly what's wrong and how to fix it.
              </p>
            </div>
            
            <button
              onClick={runAiAnalysis}
              disabled={loading || analyzing || logs.length === 0}
              className="w-full py-3 bg-brand-violet hover:bg-brand-violet/85 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors mt-4"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analyzing ? 'Analyzing Logs...' : 'Run AI Analysis'}
            </button>
          </div>

          {/* AI Result Card */}
          {analysisResult && (
            <div className={`glass-panel border rounded-xl p-5 ${analysisResult.status === 'healthy' ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-amber-500/50 bg-amber-950/20'}`}>
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className={`h-5 w-5 ${analysisResult.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`} />
                <h3 className={`font-bold ${analysisResult.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {analysisResult.title}
                </h3>
              </div>
              
              {analysisResult.issues && (
                <ul className="list-disc list-inside text-xs text-slate-300 mb-3 space-y-1">
                  {analysisResult.issues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              )}
              
              <div className="p-3 bg-slate-950/50 rounded text-xs text-slate-300 leading-relaxed border border-slate-800">
                <span className="text-brand-violet font-bold block mb-1">Recommendation:</span>
                {analysisResult.desc}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Raw Logs */}
        <div className="lg:col-span-2 glass-panel border border-brand-border rounded-xl p-5 flex flex-col h-[500px]">
          <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-400" /> Recent Critical Events
            </h3>
            <button onClick={scanLogs} disabled={loading} className="p-1.5 text-slate-400 hover:text-white transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-brand-violet mb-3" />
                <p className="text-xs font-bold">Fetching System Event Logs...</p>
              </div>
            ) : logs.length > 0 && logs[0] ? (
              logs.map((log, idx) => (
                <div key={idx} className="p-3 bg-slate-900/80 rounded border border-slate-800 hover:border-slate-700 transition-colors">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded uppercase font-bold tracking-wider">Error</span>
                    <span className="text-[10px] text-slate-500">{formatDate(log.TimeCreated)}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-300 mb-1">{log.ProviderName}</p>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{log.Message}</p>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No recent critical events found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
