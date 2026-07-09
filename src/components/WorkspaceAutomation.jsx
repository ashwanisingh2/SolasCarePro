import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Briefcase, Code, Video, Gamepad2, Plus, Pencil, Trash2, Play, RotateCcw,
  Loader2, RefreshCw, Clock, AppWindow, Wifi, X, Sparkles, Zap, Bell, BellOff,
  Power, Pause, Info, AlertTriangle, CheckCircle2, Settings2
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import CommandOutput from './shared/CommandOutput';

// --- Helpers ---------------------------------------------------------------

function safeJsonParse(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[m.length - 1]); } catch (_) { return null; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch (_) { return iso; }
}

const PROFILE_PRESETS = [
  {
    name: 'Coding Mode', icon: 'code', color: 'cyan',
    actions: {
      launchApps: ['code', 'chrome', 'windows-terminal'],
      killApps: ['spotify', 'discord'],
      focusAssist: true, powerPlan: 'high', pauseWindowsUpdate: false
    }
  },
  {
    name: 'Video Editing', icon: 'video', color: 'violet',
    actions: {
      launchApps: ['premiere', 'afterfx'],
      killApps: ['chrome', 'slack'],
      focusAssist: true, powerPlan: 'high', pauseWindowsUpdate: true
    }
  },
  {
    name: 'Work Mode', icon: 'briefcase', color: 'emerald',
    actions: {
      launchApps: ['outlook', 'teams', 'chrome'],
      killApps: ['steam', 'epicgameslauncher'],
      focusAssist: true, powerPlan: 'balanced', pauseWindowsUpdate: false
    }
  },
  {
    name: 'Gaming Mode', icon: 'gamepad', color: 'rose',
    actions: {
      launchApps: ['steam'],
      killApps: ['outlook', 'teams', 'slack'],
      focusAssist: true, powerPlan: 'high', pauseWindowsUpdate: true
    }
  }
];

const ICON_MAP = {
  code: Code, video: Video, briefcase: Briefcase, gamepad: Gamepad2,
  zap: Zap, sparkles: Sparkles
};
const COLOR_MAP = {
  cyan: 'text-brand-cyan bg-brand-cyan/10 border-brand-cyan/30',
  violet: 'text-brand-violet bg-brand-violet/10 border-brand-violet/30',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  rose: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/30'
};

function genId() {
  return 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// --- Main Component --------------------------------------------------------

export default function WorkspaceAutomation() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);  // null | 'new' | profile object
  const [applied, setApplied] = useState(null);
  const [applying, setApplying] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [triggerFired, setTriggerFired] = useState(null);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const [profRes, appRes] = await Promise.all([
          window.api.workspaceListProfiles(),
          window.api.workspaceGetApplied()
        ]);
        if (profRes.success) setProfiles(profRes.profiles || []);
        if (appRes.success) setApplied(appRes.applied);
      } else {
        setProfiles([
          { id: 'ws_mock1', name: 'Coding Mode', icon: 'code', color: 'cyan', actions: { launchApps: ['code','chrome'], killApps: ['spotify'], focusAssist: true, powerPlan: 'high', pauseWindowsUpdate: false } },
          { id: 'ws_mock2', name: 'Gaming Mode', icon: 'gamepad', color: 'rose', actions: { launchApps: ['steam'], killApps: [], focusAssist: true, powerPlan: 'high', pauseWindowsUpdate: true } }
        ]);
        setApplied(null);
      }
    } catch (e) {
      addNotification('Workspace', 'Failed to load: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  // Subscribe to trigger-fired events
  useEffect(() => {
    if (!window.api?.onWorkspaceTriggerFired) return;
    const unsub = window.api.onWorkspaceTriggerFired((data) => {
      setTriggerFired(data);
      addNotification('Workspace Auto-Activated',
        `"${data.profileName}" profile activated (${data.triggerType} trigger).`,
        'info');
      // Refresh applied state
      window.api.workspaceGetApplied().then(res => {
        if (res.success) setApplied(res.applied);
      });
    });
    return () => { unsub && unsub(); };
  }, [addNotification]);

  const handleApply = async (profile) => {
    const summary = [
      profile.actions?.launchApps?.length ? `Launch ${profile.actions.launchApps.length} app(s)` : null,
      profile.actions?.killApps?.length ? `Kill ${profile.actions.killApps.length} app(s)` : null,
      profile.actions?.focusAssist ? 'DND ON' : null,
      profile.actions?.powerPlan ? `Power: ${profile.actions.powerPlan}` : null,
      profile.actions?.pauseWindowsUpdate ? 'Pause WU' : null
    ].filter(Boolean).join(' · ');
    const ok = await confirm({
      title: 'Apply Profile',
      message: `Apply "${profile.name}"? This will:`,
      detail: summary || 'No actions defined.',
      confirmLabel: 'Apply',
      danger: false
    });
    if (!ok) return;
    setApplying(profile.id);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-workspace-tool',
          ['apply-profile', JSON.stringify(profile)]);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Workspace', `"${profile.name}" applied.`, 'success');
          const appRes = await window.api.workspaceGetApplied();
          if (appRes.success) setApplied(appRes.applied);
        } else {
          addNotification('Workspace', obj?.error || 'Apply failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 800));
        addNotification('Workspace', `Mock apply of "${profile.name}".`, 'success');
        setApplied({ profileId: profile.id, profileName: profile.name, appliedIso: new Date().toISOString() });
      }
    } catch (e) {
      addNotification('Workspace', e.message, 'error');
    } finally {
      setApplying(null);
    }
  };

  const handleRestore = async () => {
    if (!applied) return;
    const ok = await confirm({
      title: 'Restore Previous State',
      message: `Restore the system to its state before "${applied.profileName}" was applied?`,
      confirmLabel: 'Restore',
      danger: false
    });
    if (!ok) return;
    setRestoring(true);
    setShowOutput(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-workspace-tool', ['restore-profile']);
        const obj = safeJsonParse(res.stdout);
        if (obj?.success) {
          addNotification('Workspace', 'Restored to previous state.', 'success');
          setApplied(null);
        } else {
          addNotification('Workspace', obj?.error || 'Restore failed.', 'error');
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
        addNotification('Workspace', 'Mock restore.', 'success');
        setApplied(null);
      }
    } catch (e) {
      addNotification('Workspace', e.message, 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleSaveProfile = async (profile) => {
    try {
      if (window.api) {
        const res = await window.api.workspaceSaveProfile(profile);
        if (res.success) {
          addNotification('Workspace', `Profile "${profile.name}" saved.`, 'success');
          await fetchProfiles();
          setEditing(null);
        } else {
          addNotification('Workspace', res.error || 'Save failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Workspace', e.message, 'error');
    }
  };

  const handleDelete = async (profile) => {
    const ok = await confirm({
      title: 'Delete Profile',
      message: `Delete profile "${profile.name}"? This also removes its triggers.`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    try {
      if (window.api) {
        const res = await window.api.workspaceDeleteProfile(profile.id);
        if (res.success) {
          addNotification('Workspace', 'Profile deleted.', 'success');
          await fetchProfiles();
          if (selectedId === profile.id) setSelectedId(null);
        } else {
          addNotification('Workspace', res.error || 'Delete failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Workspace', e.message, 'error');
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedId);

  return (
    <div className="p-6 space-y-5 text-left">
      <header className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-brand-violet" />
            Smart Workspace Automation
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Context-aware profiles: launch apps, kill distractions, set power plan, enable DND.
            Configure automatic triggers (time / app / network) to activate profiles hands-free.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing('new')}
            className="px-3 py-2 bg-brand-violet hover:bg-brand-violet/80 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> New Profile
          </button>
          <button
            onClick={() => setShowOutput(s => !s)}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-brand-border flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {showOutput ? 'Hide' : 'Show'} Output
          </button>
        </div>
      </header>

      {/* Applied state banner */}
      {applied ? (
        <div className="glass-panel border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-sm font-bold text-slate-200">
                Profile active: <span className="text-emerald-400">{applied.profileName}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Applied {formatDateTime(applied.appliedIso)} · Click Restore to revert all changes
              </div>
            </div>
          </div>
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-2 cursor-pointer"
          >
            {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Restore
          </button>
        </div>
      ) : (
        <div className="bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg p-3 text-xs text-slate-400 flex items-start gap-2">
          <Info className="h-4 w-4 text-brand-cyan shrink-0 mt-0.5" />
          <div>
            <strong className="text-brand-cyan">How it works:</strong> Pick a preset or create a custom profile.
            Apply it manually or set up automatic triggers. Click "Restore" to revert all changes back to your
            previous state (power plan, Focus Assist, Windows Update).
          </div>
        </div>
      )}

      {/* Trigger-fired toast (transient) */}
      {triggerFired && (
        <div className="glass-panel border border-violet-500/30 rounded-xl p-3 flex items-center justify-between gap-3 bg-violet-500/5">
          <div className="flex items-center gap-3">
            <Sparkles className="h-4 w-4 text-brand-violet shrink-0" />
            <div className="text-xs text-slate-300">
              <strong className="text-brand-violet">{triggerFired.profileName}</strong> auto-activated via{' '}
              <span className="text-slate-200">{triggerFired.triggerType}</span> trigger
              {triggerFired.detail ? ` (${triggerFired.detail})` : ''}
            </div>
          </div>
          <button onClick={() => setTriggerFired(null)} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showOutput && <CommandOutput channel="care-out" height="180px" />}

      {/* Editor overlay */}
      {editing && (
        <ProfileEditor
          profile={editing === 'new' ? null : editing}
          onSave={handleSaveProfile}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Profile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <div className="col-span-full py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-violet" />
            <p className="text-xs text-slate-400">Loading profiles...</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="col-span-full py-12 text-center">
            <Briefcase className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 mb-1">No profiles yet.</p>
            <p className="text-xs text-slate-500">Click "New Profile" or pick a preset to get started.</p>
          </div>
        ) : (
          profiles.map(p => (
            <ProfileCard
              key={p.id}
              profile={p}
              isSelected={selectedId === p.id}
              isApplied={applied?.profileId === p.id}
              isApplying={applying === p.id}
              onSelect={() => setSelectedId(p.id)}
              onApply={() => handleApply(p)}
              onEdit={() => setEditing(p)}
              onDelete={() => handleDelete(p)}
            />
          ))
        )}
      </div>

      {/* Triggers panel for selected profile */}
      {selectedProfile && (
        <TriggersPanel profile={selectedProfile} />
      )}
    </div>
  );
}

// --- Profile Card ----------------------------------------------------------

function ProfileCard({ profile, isSelected, isApplied, isApplying, onSelect, onApply, onEdit, onDelete }) {
  const Icon = ICON_MAP[profile.icon] || Sparkles;
  const colorClass = COLOR_MAP[profile.color] || COLOR_MAP.violet;
  const actionCount = [
    profile.actions?.launchApps?.length > 0,
    profile.actions?.killApps?.length > 0,
    profile.actions?.focusAssist,
    profile.actions?.powerPlan,
    profile.actions?.pauseWindowsUpdate
  ].filter(Boolean).length;

  return (
    <div
      onClick={onSelect}
      className={`glass-panel rounded-xl p-4 border cursor-pointer transition-all ${
        isSelected ? 'border-brand-violet ring-1 ring-brand-violet/30' : 'border-brand-border hover:border-slate-600'
      } ${isApplied ? 'ring-1 ring-emerald-500/40' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        {isApplied && (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            ACTIVE
          </span>
        )}
      </div>
      <h3 className="text-sm font-bold text-slate-100">{profile.name}</h3>
      <p className="text-[10px] text-slate-500 mt-0.5">{actionCount} action{actionCount === 1 ? '' : 's'} configured</p>

      {/* Action chips */}
      <div className="flex flex-wrap gap-1 mt-3">
        {profile.actions?.launchApps?.length > 0 && (
          <ActionChip icon={Play} label={`${profile.actions.launchApps.length} launch`} />
        )}
        {profile.actions?.killApps?.length > 0 && (
          <ActionChip icon={X} label={`${profile.actions.killApps.length} kill`} color="rose" />
        )}
        {profile.actions?.focusAssist && (
          <ActionChip icon={BellOff} label="DND" color="amber" />
        )}
        {profile.actions?.powerPlan && (
          <ActionChip icon={Power} label={profile.actions.powerPlan} color="cyan" />
        )}
        {profile.actions?.pauseWindowsUpdate && (
          <ActionChip icon={Pause} label="WU pause" color="violet" />
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 mt-4 pt-3 border-t border-brand-border/50">
        <button
          onClick={(e) => { e.stopPropagation(); onApply(); }}
          disabled={isApplying}
          className="flex-1 px-3 py-1.5 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-[11px] font-bold rounded flex items-center justify-center gap-1 cursor-pointer"
        >
          {isApplying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {isApplying ? 'Applying...' : 'Apply'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded border border-brand-border cursor-pointer"
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-2 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-500/30 text-rose-400 text-[11px] font-bold rounded cursor-pointer"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function ActionChip({ icon: Icon, label, color = 'slate' }) {
  const colors = {
    slate: 'bg-slate-800/40 text-slate-400 border-slate-700',
    rose: 'bg-rose-950/40 text-rose-400 border-rose-500/30',
    amber: 'bg-amber-950/40 text-amber-400 border-amber-500/30',
    cyan: 'bg-cyan-950/40 text-cyan-400 border-cyan-500/30',
    violet: 'bg-violet-950/40 text-violet-400 border-violet-500/30'
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${colors[color]}`}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

// --- Profile Editor --------------------------------------------------------

function ProfileEditor({ profile, onSave, onCancel }) {
  const [name, setName] = useState(profile?.name || '');
  const [icon, setIcon] = useState(profile?.icon || 'sparkles');
  const [color, setColor] = useState(profile?.color || 'violet');
  const [launchApps, setLaunchApps] = useState((profile?.actions?.launchApps || []).join(', '));
  const [killApps, setKillApps] = useState((profile?.actions?.killApps || []).join(', '));
  const [focusAssist, setFocusAssist] = useState(!!profile?.actions?.focusAssist);
  const [powerPlan, setPowerPlan] = useState(profile?.actions?.powerPlan || 'balanced');
  const [pauseWU, setPauseWU] = useState(!!profile?.actions?.pauseWindowsUpdate);

  const handleSave = () => {
    if (!name.trim()) return;
    const newProfile = {
      id: profile?.id || genId(),
      name: name.trim(),
      icon, color,
      actions: {
        launchApps: launchApps.split(',').map(s => s.trim()).filter(Boolean),
        killApps: killApps.split(',').map(s => s.trim()).filter(Boolean),
        focusAssist, powerPlan, pauseWindowsUpdate: pauseWU
      }
    };
    onSave(newProfile);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="glass-panel border border-brand-border rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-100">
            {profile ? 'Edit Profile' : 'New Profile'}
          </h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Presets */}
        {!profile && (
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Quick Presets</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {PROFILE_PRESETS.map(preset => {
                const Icon = ICON_MAP[preset.icon] || Sparkles;
                return (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setName(preset.name);
                      setIcon(preset.icon);
                      setColor(preset.color);
                      setLaunchApps(preset.actions.launchApps.join(', '));
                      setKillApps(preset.actions.killApps.join(', '));
                      setFocusAssist(preset.actions.focusAssist);
                      setPowerPlan(preset.actions.powerPlan);
                      setPauseWU(preset.actions.pauseWindowsUpdate);
                    }}
                    className={`p-2 border rounded-lg text-[11px] font-bold flex flex-col items-center gap-1 cursor-pointer transition-all ${COLOR_MAP[preset.color]} hover:scale-105`}
                  >
                    <Icon className="h-4 w-4" />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Name + Icon + Color */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="md:col-span-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Name</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)} maxLength={50}
              placeholder="e.g. Coding Mode"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-violet"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Icon</label>
            <select value={icon} onChange={e => setIcon(e.target.value)}
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200">
              {Object.keys(ICON_MAP).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Color</label>
            <select value={color} onChange={e => setColor(e.target.value)}
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200">
              {Object.keys(COLOR_MAP).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3 mb-4">
          <div className="text-[10px] font-bold text-slate-500 uppercase">Actions</div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Apps to Launch (comma-separated exe names or paths)</label>
            <input
              type="text" value={launchApps} onChange={e => setLaunchApps(e.target.value)}
              placeholder="code, chrome, C:\\Program Files\\App\\app.exe"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Apps to Kill (comma-separated process names without .exe)</label>
            <input
              type="text" value={killApps} onChange={e => setKillApps(e.target.value)}
              placeholder="spotify, discord, slack"
              className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ToggleRow
              icon={BellOff} label="Focus Assist (DND)"
              value={focusAssist} onChange={setFocusAssist}
              description="Silence notifications"
            />
            <div>
              <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                <Power className="h-3 w-3" /> Power Plan
              </label>
              <select value={powerPlan} onChange={e => setPowerPlan(e.target.value)}
                className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-1.5 text-xs text-slate-200">
                <option value="balanced">Balanced (default)</option>
                <option value="high">High Performance</option>
                <option value="saver">Power Saver</option>
                <option value="ultimate">Ultimate Performance</option>
              </select>
            </div>
            <ToggleRow
              icon={Pause} label="Pause Windows Update"
              value={pauseWU} onChange={setPauseWU}
              description="7-day pause"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-brand-border">
          <button onClick={onCancel}
            className="px-4 py-2 text-xs font-bold rounded-lg border border-brand-border text-slate-300 hover:bg-slate-800/60 cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!name.trim()}
            className="px-4 py-2 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer">
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, value, onChange, description }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </label>
      <button
        onClick={() => onChange(!value)}
        className={`w-full px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition-colors ${
          value
            ? 'bg-brand-violet/20 border-brand-violet text-white'
            : 'bg-slate-900 border-brand-border text-slate-400'
        }`}
      >
        {value ? 'ON' : 'OFF'}
      </button>
      {description && <p className="text-[10px] text-slate-600 mt-0.5">{description}</p>}
    </div>
  );
}

// --- Triggers Panel --------------------------------------------------------

function TriggersPanel({ profile }) {
  const { addNotification } = useNotification();
  const [triggers, setTriggers] = useState({ time: [], app: [], network: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Local editable state
  const [timeFrom, setTimeFrom] = useState('09:00');
  const [timeTo, setTimeTo] = useState('18:00');
  const [timeDays, setTimeDays] = useState(['Monday','Tuesday','Wednesday','Thursday','Friday']);
  const [appName, setAppName] = useState('');
  const [networkName, setNetworkName] = useState('');

  const fetchTriggers = useCallback(async () => {
    setLoading(true);
    try {
      if (window.api) {
        const res = await window.api.workspaceGetTriggers(profile.id);
        if (res.success) {
          setTriggers(res.triggers || { time: [], app: [], network: [] });
        }
      } else {
        setTriggers({
          time: [{ from: '09:00', to: '18:00', days: ['Monday','Tuesday','Wednesday','Thursday','Friday'] }],
          app: ['code'], network: []
        });
      }
    } catch (_) {} finally { setLoading(false); }
  }, [profile.id]);

  useEffect(() => { fetchTriggers(); }, [fetchTriggers]);

  const save = async (newTriggers) => {
    setSaving(true);
    try {
      if (window.api) {
        const res = await window.api.workspaceSetTriggers(profile.id, newTriggers);
        if (res.success) {
          setTriggers(res.triggers);
          addNotification('Workspace', 'Triggers saved.', 'success');
        } else {
          addNotification('Workspace', res.error || 'Save failed.', 'error');
        }
      }
    } catch (e) {
      addNotification('Workspace', e.message, 'error');
    } finally { setSaving(false); }
  };

  const addTimeTrigger = () => {
    const newT = { from: timeFrom, to: timeTo, days: timeDays };
    save({ ...triggers, time: [...(triggers.time || []), newT] });
  };
  const removeTimeTrigger = (idx) => {
    save({ ...triggers, time: (triggers.time || []).filter((_, i) => i !== idx) });
  };

  const addAppTrigger = () => {
    if (!appName.trim()) return;
    save({ ...triggers, app: [...(triggers.app || []), appName.trim()] });
    setAppName('');
  };
  const removeAppTrigger = (idx) => {
    save({ ...triggers, app: (triggers.app || []).filter((_, i) => i !== idx) });
  };

  const addNetworkTrigger = () => {
    if (!networkName.trim()) return;
    save({ ...triggers, network: [...(triggers.network || []), networkName.trim()] });
    setNetworkName('');
  };
  const removeNetworkTrigger = (idx) => {
    save({ ...triggers, network: (triggers.network || []).filter((_, i) => i !== idx) });
  };

  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  return (
    <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-brand-border flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-brand-violet" />
        <h3 className="text-sm font-bold text-slate-200">
          Triggers for <span className="text-brand-violet">{profile.name}</span>
        </h3>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-violet ml-auto" />}
      </div>

      <div className="p-4 space-y-4">
        <div className="text-[10px] text-slate-500 bg-slate-900/40 border border-brand-border rounded p-2 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-brand-cyan shrink-0 mt-0.5" />
          <div>
            Triggers auto-activate this profile when conditions are met. <strong className="text-slate-400">Only works while SolasCare is running.</strong>
            A profile won't auto-apply if another is already active. You must manually Restore before a new trigger can fire.
          </div>
        </div>

        {/* Time triggers */}
        <div>
          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-2">
            <Clock className="h-3.5 w-3.5 text-brand-cyan" /> Time-based Triggers
          </div>
          {triggers.time?.length > 0 && (
            <div className="space-y-1 mb-2">
              {triggers.time.map((t, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-900/40 border border-brand-border rounded px-3 py-1.5">
                  <div className="text-[11px] text-slate-300">
                    <span className="font-mono">{t.from} - {t.to}</span>
                    {t.days?.length > 0 && (
                      <span className="text-slate-500 ml-2">· {t.days.map(d => d.slice(0,3)).join(', ')}</span>
                    )}
                  </div>
                  <button onClick={() => removeTimeTrigger(i)} className="text-rose-400 hover:text-rose-300 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-2 bg-slate-900/30 border border-brand-border rounded p-2">
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">From</label>
              <input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)}
                className="bg-slate-900 border border-brand-border rounded px-2 py-1 text-xs text-slate-200" />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-0.5">To</label>
              <input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)}
                className="bg-slate-900 border border-brand-border rounded px-2 py-1 text-xs text-slate-200" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] text-slate-500 mb-0.5">Days</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map(d => {
                  const active = timeDays.includes(d);
                  return (
                    <button key={d} onClick={() => setTimeDays(prev => active ? prev.filter(x => x !== d) : [...prev, d])}
                      className={`text-[10px] font-bold px-2 py-1 rounded border cursor-pointer ${
                        active ? 'bg-brand-cyan/20 border-brand-cyan text-brand-cyan' : 'bg-slate-900 border-brand-border text-slate-500'
                      }`}>
                      {d.slice(0,3)}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={addTimeTrigger} disabled={saving}
              className="px-3 py-1.5 bg-brand-cyan/10 hover:bg-brand-cyan/20 border border-brand-cyan/30 text-brand-cyan text-[11px] font-bold rounded cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>

        {/* App triggers */}
        <div>
          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-2">
            <AppWindow className="h-3.5 w-3.5 text-emerald-400" /> App-launch Triggers
          </div>
          <p className="text-[10px] text-slate-500 mb-2">Profile auto-activates when one of these apps starts. Use process name without .exe (e.g. <code className="text-slate-400">code</code>).</p>
          {triggers.app?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {triggers.app.map((a, i) => (
                <span key={i} className="text-[11px] font-mono bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded flex items-center gap-1">
                  {a}
                  <button onClick={() => removeAppTrigger(i)} className="text-emerald-500 hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={appName} onChange={e => setAppName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addAppTrigger(); }}
              placeholder="e.g. code"
              className="flex-1 bg-slate-900 border border-brand-border rounded px-3 py-1.5 text-xs text-slate-200 font-mono" />
            <button onClick={addAppTrigger} disabled={saving || !appName.trim()}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold rounded cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>

        {/* Network triggers */}
        <div>
          <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1 mb-2">
            <Wifi className="h-3.5 w-3.5 text-violet-400" /> Network (WiFi SSID) Triggers
          </div>
          <p className="text-[10px] text-slate-500 mb-2">Profile auto-activates when you connect to a WiFi network whose name contains this text.</p>
          {triggers.network?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {triggers.network.map((n, i) => (
                <span key={i} className="text-[11px] font-mono bg-violet-950/40 border border-violet-500/30 text-violet-300 px-2 py-0.5 rounded flex items-center gap-1">
                  {n}
                  <button onClick={() => removeNetworkTrigger(i)} className="text-violet-500 hover:text-rose-400 cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input type="text" value={networkName} onChange={e => setNetworkName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addNetworkTrigger(); }}
              placeholder="e.g. Home, Office_5G"
              className="flex-1 bg-slate-900 border border-brand-border rounded px-3 py-1.5 text-xs text-slate-200 font-mono" />
            <button onClick={addNetworkTrigger} disabled={saving || !networkName.trim()}
              className="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/30 text-violet-300 text-[11px] font-bold rounded cursor-pointer disabled:opacity-50 flex items-center gap-1">
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
