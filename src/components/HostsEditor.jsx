import React, { useState, useEffect } from 'react';
import { Loader2, ShieldAlert, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';

// Common ad/malware/tracking domains to block via the hosts file.
const PRESET_DOMAINS = [
  { ip: '0.0.0.0', domain: 'doubleclick.net', label: 'Google Ads' },
  { ip: '0.0.0.0', domain: 'google-analytics.com', label: 'Google Analytics' },
  { ip: '0.0.0.0', domain: 'facebook.com', label: 'Facebook Tracking' },
  { ip: '0.0.0.0', domain: 'googlesyndication.com', label: 'Google AdSense' },
  { ip: '0.0.0.0', domain: 'googletagmanager.com', label: 'Google Tag Manager' },
  { ip: '0.0.0.0', domain: 'adservice.google.com', label: 'Google AdService' },
  { ip: '0.0.0.0', domain: 'amazon-adsystem.com', label: 'Amazon Ads' },
  { ip: '0.0.0.0', domain: 'scorecardresearch.com', label: 'Scorecard Research' },
];

export default function HostsEditor() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(false);
  const [hostsLines, setHostsLines] = useState([]);
  const [newIp, setNewIp] = useState('0.0.0.0');
  const [newDomain, setNewDomain] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchHosts = async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['read-hosts']);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          setHostsLines(obj.lines || []);
        } else {
          addNotification('Hosts Editor', obj?.message || 'Failed to read hosts file.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 400));
        setHostsLines([
          '# Mock hosts file',
          '127.0.0.1 localhost',
          '::1 localhost',
        ]);
      }
    } catch (e) {
      addNotification('Hosts Editor', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHosts(); }, []);

  const addEntry = async (ip, domain) => {
    if (!ip || !domain) {
      addNotification('Hosts Editor', 'IP and domain are required.', 'error');
      return;
    }
    const entry = `${ip} ${domain}`;
    if (!entry.match(/^\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\s+\S+\s*$/)) {
      addNotification('Hosts Editor', 'Invalid format. Use "IP domain" (e.g. "0.0.0.0 ad.com")', 'error');
      return;
    }
    setAdding(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['add-hosts-entry', entry]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          addNotification('Hosts Editor', `Blocked ${domain} → ${ip}`, 'success');
          await fetchHosts();
        } else {
          addNotification('Hosts Editor', obj?.message || 'Failed to add entry.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 300));
        addNotification('Hosts Editor', `Mock blocked ${domain} → ${ip}`, 'success');
        setHostsLines(prev => [...prev, entry]);
      }
    } catch (e) {
      addNotification('Hosts Editor', e.message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleAddPreset = async (preset) => {
    const ok = await confirm({
      title: 'Block Domain',
      message: `Block "${preset.domain}" (${preset.label}) by pointing it to ${preset.ip}?`,
      confirmLabel: 'Block',
    });
    if (!ok) return;
    await addEntry(preset.ip, preset.domain);
  };

  const handleAddCustom = async () => {
    await addEntry(newIp, newDomain);
    setNewDomain('');
  };

  const removeEntry = async (indexToRemove) => {
    const ok = await confirm({
      title: 'Remove Hosts Entry',
      message: 'Are you sure you want to remove this line?',
      confirmLabel: 'Remove',
      danger: true
    });
    if (!ok) return;
    
    setLoading(true);
    try {
      const newLines = hostsLines.filter((_, idx) => idx !== indexToRemove);
      const newContent = newLines.join('\n');
      
      if (window.api) {
        const res = await window.api.runSystemCommand('run-advanced-tool', ['write-hosts', newContent]);
        const m = res.stdout?.match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[m.length-1]) : null;
        if (obj?.success) {
          addNotification('Hosts Editor', `Entry removed successfully.`, 'success');
          await fetchHosts();
        } else {
          addNotification('Hosts Editor', obj?.message || 'Failed to remove entry.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 300));
        addNotification('Hosts Editor', `Mock entry removed.`, 'success');
        setHostsLines(newLines);
      }
    } catch (e) {
      addNotification('Hosts Editor', e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-brand-violet" /> Hosts File Ad-Blocker
          </h2>
          <p className="text-xs text-slate-400 mt-1">Block tracking, ads, and malicious domains at the system level via the Windows hosts file.</p>
        </div>
        <button
          onClick={fetchHosts}
          disabled={loading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Reload
        </button>
      </header>

      <div className="glass-panel border border-amber-500/30 bg-amber-950/5 rounded-xl p-3 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-300/80">Editing the hosts file affects ALL applications on this PC. Browsers cache DNS — restart them after changes for blocks to take effect.</p>
      </div>

      {/* Preset blockers */}
      <div className="glass-panel border border-brand-border rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Quick-Block Presets</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {PRESET_DOMAINS.map(p => (
            <button
              key={p.domain}
              onClick={() => handleAddPreset(p)}
              disabled={adding}
              className="text-left p-2 bg-slate-950/40 border border-brand-border/60 hover:border-brand-violet rounded text-[11px] disabled:opacity-50 cursor-pointer"
            >
              <div className="font-bold text-slate-200">{p.label}</div>
              <div className="text-[10px] text-slate-500 font-mono truncate">{p.domain}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom entry */}
      <div className="glass-panel border border-brand-border rounded-xl p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase">Add Custom Block</h4>
        <div className="flex gap-2">
          <input
            type="text"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="0.0.0.0"
            className="w-32 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-violet"
          />
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="adserver.example.com"
            className="flex-1 px-3 py-1.5 bg-slate-900 border border-brand-border rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-brand-violet"
          />
          <button
            onClick={handleAddCustom}
            disabled={adding || !newDomain}
            className="px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/90 disabled:opacity-50 text-xs font-bold rounded flex items-center gap-1 cursor-pointer"
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Block
          </button>
        </div>
      </div>

      {/* Current hosts content */}
      <div className="glass-panel border border-brand-border rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Current Hosts File ({hostsLines.length} lines)</h4>
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand-violet" />
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto bg-black/60 border border-slate-800 rounded p-3 font-mono text-[10px] text-slate-300">
            {hostsLines.map((line, i) => {
              const isComment = line.trim().startsWith('#');
              const isEssential = line.trim() === '127.0.0.1 localhost' || line.trim() === '::1 localhost';
              const canDelete = line.trim() && !isEssential;
              
              return (
                <div key={i} className={`flex items-center justify-between hover:bg-slate-800/50 px-2 py-0.5 rounded transition-colors ${isComment ? 'text-slate-500' : 'text-emerald-300'}`}>
                  <span className="truncate pr-2">{line || ' '}</span>
                  {canDelete && (
                    <button 
                      onClick={() => removeEntry(i)} 
                      className="text-slate-500 hover:text-rose-400 p-1 bg-slate-900/50 hover:bg-rose-950 rounded cursor-pointer shrink-0 transition-colors" 
                      title="Remove Entry"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
