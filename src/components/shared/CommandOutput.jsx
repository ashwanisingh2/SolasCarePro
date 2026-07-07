import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Trash2, XCircle } from 'lucide-react';

export default function CommandOutput({ 
  channel, 
  isRunning, 
  onCancel, 
  title = "Console Output", 
  maxLines = 1000, 
  logs: parentLogs, 
  onClear 
}) {
  const [internalLogs, setInternalLogs] = useState([]);
  const consoleEndRef = useRef(null);

  const logs = parentLogs || internalLogs;

  useEffect(() => {
    if (!channel || parentLogs) return;

    if (window.api && window.api.onStream) {
      const unsubscribe = window.api.onStream(channel, (data) => {
        if (typeof data !== 'string') return;
        const timeString = new Date().toLocaleTimeString(undefined, { hour12: false });
        const newLines = data.split('\n')
          .map(line => line.replace(/\r/g, ''))
          .filter(Boolean)
          .map(line => `[${timeString}] ${line}`);
        
        setInternalLogs(prev => {
          const combined = [...prev, ...newLines];
          if (combined.length > maxLines) {
            return combined.slice(combined.length - maxLines);
          }
          return combined;
        });
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [channel, parentLogs, maxLines]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const copyToClipboard = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      setInternalLogs([]);
    }
  };

  const getLineColorClass = (line) => {
    const cleanLine = line.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '').replace(/\r/g, '').trim();
    if (cleanLine.startsWith('[ERROR]')) return 'text-rose-400';
    if (cleanLine.startsWith('[WARN]')) return 'text-amber-400';
    if (cleanLine.startsWith('[OK]') || cleanLine.toLowerCase().includes('success') || cleanLine.startsWith('[SUCCESS]')) return 'text-brand-success';
    return 'text-slate-300';
  };

  return (
    <div className="glass-panel border border-brand-border/60 rounded-[18px] p-4 space-y-3 relative overflow-hidden bg-slate-950/20 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs border-b border-brand-border/40 pb-2.5 gap-2 select-none">
        <div className="flex items-center gap-2">
          {/* Simulated Tab Header */}
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-brand-border/40 rounded-t-lg border-b-0 -mb-3 text-[10px] font-bold text-slate-300">
            <Terminal className="h-3 w-3 text-brand-cyan" />
            <span>PowerShell</span>
          </div>
          <span className="text-[10px] text-slate-500 font-bold ml-2 shrink-0">{title}</span>
          <span className="bg-slate-900/60 text-[9px] text-slate-400 font-bold px-2 py-0.5 rounded-full border border-brand-border/30">
            {logs.length} lines
          </span>
        </div>
        
        {/* Controls */}
        <div className="flex gap-2">
          <button
            onClick={copyToClipboard}
            className="px-2 py-1 hover:bg-slate-800 rounded border border-brand-border/40 hover:border-brand-violet text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all"
            title="Copy Logs"
          >
            <Copy className="h-3 w-3" />
            <span>Copy</span>
          </button>
          <button
            onClick={handleClear}
            className="px-2 py-1 hover:bg-slate-800 rounded border border-brand-border/40 hover:border-brand-violet text-[10px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all"
            title="Clear Console"
          >
            <Trash2 className="h-3 w-3" />
            <span>Clear</span>
          </button>
          {isRunning && onCancel && (
            <button
              onClick={onCancel}
              className="px-2 py-1 bg-rose-950/40 hover:bg-rose-900 border border-rose-500/20 text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition-all"
              title="Cancel execution"
            >
              <XCircle className="h-3 w-3" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Simulated Console Box */}
      <div className="h-72 overflow-y-auto rounded-xl border border-slate-950 bg-black/80 p-4 font-mono text-[10px] leading-relaxed text-left shadow-inner custom-scrollbar relative select-text">
        {/* Shell Greeting */}
        <div className="text-slate-500 mb-3 select-none">
          <p>Windows PowerShell</p>
          <p>Copyright (C) Microsoft Corporation. All rights reserved.</p>
          <p className="mt-1 text-[9px] text-brand-cyan/60">Try the new cross-platform PowerShell https://aka.ms/pscore6</p>
        </div>

        {/* Live Logs */}
        {logs.length > 0 ? (
          <div className="space-y-0.5">
            {logs.map((line, idx) => (
              <p key={idx} className={getLineColorClass(line)}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-slate-700 italic select-none">Console stream idle...</p>
        )}

        {/* Dynamic Prompt Selector */}
        <div className="mt-2 text-slate-500 flex items-center gap-1 select-none">
          <span>PS C:\Windows\system32&gt;</span>
          {isRunning ? (
            <span className="w-1.5 h-3 bg-brand-cyan animate-ping inline-block"></span>
          ) : (
            <span className="w-1.5 h-3 bg-slate-500 animate-pulse inline-block"></span>
          )}
        </div>
        
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
}
