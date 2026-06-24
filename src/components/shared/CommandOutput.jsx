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
    <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs border-b border-brand-border pb-2 gap-2 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-slate-400" />
          <span className="font-bold text-slate-200">{title}</span>
          <span className="bg-slate-800 text-[10px] text-slate-400 font-bold px-1.5 py-0.5 rounded-full">
            {logs.length} Lines
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyToClipboard}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            title="Copy Logs"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy</span>
          </button>
          <button
            onClick={handleClear}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            title="Clear Console"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
          {isRunning && onCancel && (
            <button
              onClick={onCancel}
              className="p-1 hover:bg-rose-950/40 rounded text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
              title="Cancel execution"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      <div className="h-[300px] overflow-y-auto rounded-lg border border-slate-900 bg-black/50 p-4 font-mono text-[10px] leading-relaxed">
        {logs.length > 0 ? (
          logs.map((line, idx) => (
            <p key={idx} className={getLineColorClass(line)}>
              {line}
            </p>
          ))
        ) : (
          <p className="text-slate-600 italic">No output logged.</p>
        )}
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
}
