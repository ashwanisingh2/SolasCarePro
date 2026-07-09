import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown, Check, X, Loader2, Sparkles, Zap, Shield, Clock, Key
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

// --- License context + hook ---

const LicenseContext = React.createContext(null);

export function useLicense() {
  const ctx = React.useContext(LicenseContext);
  return ctx;
}

export function LicenseProvider({ children }) {
  const [state, setState] = useState({ tier: 'free', trialDaysRemaining: 0 });
  const [showUpgrade, setShowUpgrade] = useState(null); // null | featureId

  const refresh = useCallback(async () => {
    if (window.api?.licenseGetState) {
      const res = await window.api.licenseGetState();
      if (res.success) {
        setState({
          ...res.state,
          trialDaysRemaining: res.state.tier === 'trial'
            ? Math.ceil((new Date(res.state.trialExpiresIso).getTime() - Date.now()) / (24*60*60*1000))
            : 0
        });
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Check feature access — shows upgrade modal if blocked
  const checkFeature = useCallback(async (featureId) => {
    if (!window.api?.licenseCheckFeature) return { allowed: true };
    const res = await window.api.licenseCheckFeature(featureId);
    if (res.success && !res.access.allowed) {
      setShowUpgrade(featureId);
      return res.access;
    }
    return res.access || { allowed: true };
  }, []);

  // Increment usage counter (for free-tier limits)
  const incrementUsage = useCallback(async (counterId) => {
    if (!window.api?.licenseIncrementUsage) return 0;
    const res = await window.api.licenseIncrementUsage(counterId);
    return res.success ? res.count : 0;
  }, []);

  // Track feature usage (telemetry)
  const trackFeature = useCallback((featureId) => {
    if (window.api?.telemetryTrackEvent) {
      window.api.telemetryTrackEvent('feature-use', { featureId });
    }
  }, []);

  const value = {
    state,
    isPro: state.tier === 'pro' || state.tier === 'trial',
    isTrial: state.tier === 'trial',
    isFree: state.tier === 'free',
    checkFeature,
    incrementUsage,
    trackFeature,
    refresh,
    showUpgrade: (featureId) => setShowUpgrade(featureId),
    hideUpgrade: () => setShowUpgrade(null)
  };

  return (
    <LicenseContext.Provider value={value}>
      {children}
      {showUpgrade && <UpgradeModal featureId={showUpgrade} onClose={() => setShowUpgrade(null)} onActivated={refresh} />}
    </LicenseContext.Provider>
  );
}

// --- Feature Gate Wrapper ---
// Wrap any Pro-only feature component with this. If user is on free tier
// (and not in trial), shows UpgradeModal instead of the component.

export function ProFeatureGate({ featureId, children, fallbackLabel }) {
  const license = useLicense();
  const [checked, setChecked] = React.useState(false);
  const [allowed, setAllowed] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const access = await license.checkFeature(featureId);
      if (mounted) {
        setAllowed(access.allowed);
        setChecked(true);
      }
    })();
    return () => { mounted = false; };
  }, [featureId, license]);

  if (!checked) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-violet" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 space-y-5 text-left">
        <div className="glass-panel border border-brand-violet/30 rounded-xl p-8 text-center">
          <Crown className="h-12 w-12 text-brand-violet mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-200 mb-2">
            {fallbackLabel || 'Pro Feature'}
          </h2>
          <p className="text-xs text-slate-400 mb-6 max-w-md mx-auto">
            This feature is part of SolasCare Pro. {license.state.trialDaysRemaining > 0
              ? `Your trial ends in ${license.state.trialDaysRemaining} days. `
              : 'Activate a license or start a 14-day free trial to unlock.'}
          </p>
          <button
            onClick={() => license.showUpgrade(featureId)}
            className="px-6 py-3 bg-brand-violet hover:bg-brand-violet/80 text-white text-sm font-bold rounded-xl cursor-pointer"
          >
            <Crown className="h-4 w-4 inline mr-2" />
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  return children;
}

// --- Upgrade Modal ---

const PRO_FEATURES_LIST = [
  { icon: Zap, label: 'Unlimited Surgical Uninstalls' },
  { icon: Zap, label: 'Update All apps (Software Forge)' },
  { icon: Zap, label: 'Unlimited God Mode Tweaks' },
  { icon: Shield, label: 'Full Privacy Blackhole (Firewall + GPO)' },
  { icon: Shield, label: 'Solas Vault (Ransomware-proof storage)' },
  { icon: Clock, label: 'Micro-Snapshots (Time Travel)' },
  { icon: Key, label: 'One-Click PC Clone' },
  { icon: Sparkles, label: 'Solas Sentinel (Background Watchdog)' },
  { icon: Sparkles, label: 'Predictive Maintenance + Trend Graphs' },
  { icon: Sparkles, label: 'Smart Workspace Triggers (Time/App/Network)' }
];

const FEATURE_LABELS = {
  'software-forge-update-all': 'Update All Apps',
  'privacy-blackhole-full': 'Full Privacy Blackhole',
  'sentinel': 'Solas Sentinel',
  'vault': 'Solas Vault',
  'snapshots': 'Micro-Snapshots',
  'pc-clone': 'PC Clone',
  'predictive-maintenance': 'Predictive Maintenance',
  'workspace-triggers': 'Workspace Triggers'
};

export default function UpgradeModal({ featureId, onClose, onActivated }) {
  const { addNotification } = useNotification();
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  const featureLabel = FEATURE_LABELS[featureId] || 'Pro Feature';

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    setActivating(true);
    try {
      if (window.api?.licenseActivate) {
        const res = await window.api.licenseActivate(licenseKey.trim());
        if (res.success) {
          addNotification('License', 'Pro activated! All features unlocked.', 'success');
          await onActivated();
          onClose();
        } else {
          addNotification('License', res.error || 'Invalid license key.', 'error');
        }
      }
    } catch (e) {
      addNotification('License', e.message, 'error');
    } finally {
      setActivating(false);
    }
  };

  const handleGenerateDemo = async () => {
    if (window.api?.licenseGenerateDemoKey) {
      const res = await window.api.licenseGenerateDemoKey();
      if (res.success) {
        setLicenseKey(res.key);
        addNotification('License', 'Demo key generated (for testing only).', 'info');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="glass-panel border border-brand-violet/40 rounded-2xl max-w-lg w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 text-center border-b border-brand-border">
          <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white cursor-pointer">
            <X className="h-4 w-4" />
          </button>
          <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-violet/20 flex items-center justify-center mb-3">
            <Crown className="w-8 h-8 text-brand-violet" />
          </div>
          <h2 className="text-xl font-bold text-white">Upgrade to SolasCare Pro</h2>
          <p className="text-xs text-slate-400 mt-1">
            <strong className="text-brand-violet">{featureLabel}</strong> is a Pro feature.
            {featureId && ' Unlock it + 9 more Pro features below.'}
          </p>
        </div>

        {/* Trial banner */}
        <div className="px-6 pt-4">
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-xs text-slate-300 flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-emerald-300">14-day free trial included.</strong> All Pro features unlocked
              for 14 days from first launch. No credit card required.
            </span>
          </div>
        </div>

        {/* Pro features list */}
        <div className="p-6">
          <div className="text-[10px] font-bold text-slate-500 uppercase mb-3">Pro Features</div>
          <div className="grid grid-cols-1 gap-2">
            {PRO_FEATURES_LIST.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <Icon className="h-3.5 w-3.5 text-brand-violet shrink-0" />
                  <span>{f.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pricing */}
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="glass-panel border border-brand-border rounded-xl p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase font-bold">Monthly</div>
              <div className="text-2xl font-black text-white mt-1">₹42</div>
              <div className="text-[10px] text-slate-500">/month · ₹499/year</div>
            </div>
            <div className="glass-panel border border-emerald-500/30 rounded-xl p-4 text-center bg-emerald-500/5">
              <div className="text-[10px] text-emerald-400 uppercase font-bold">Lifetime</div>
              <div className="text-2xl font-black text-white mt-1">₹1,499</div>
              <div className="text-[10px] text-slate-500">one-time · best value</div>
            </div>
          </div>

          {/* Activate / Buy */}
          {!showKeyInput ? (
            <div className="space-y-2">
              <a href="https://solas.care/buy" target="_blank" rel="noopener noreferrer"
                className="block w-full px-4 py-3 bg-brand-violet hover:bg-brand-violet/80 text-white text-sm font-bold rounded-xl text-center cursor-pointer">
                Buy License Key →
              </a>
              <button onClick={() => setShowKeyInput(true)}
                className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg cursor-pointer">
                I have a license key
              </button>
              <button onClick={handleGenerateDemo}
                className="w-full px-2 py-1 text-slate-600 hover:text-slate-400 text-[10px] cursor-pointer">
                Generate demo key (testing)
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                placeholder="SOLAS-XXXX-XXXX-XXXX-XXXX"
                className="w-full bg-slate-900 border border-brand-border rounded-lg px-3 py-2 text-xs text-slate-200 font-mono text-center focus:outline-none focus:border-brand-violet"
              />
              <button onClick={handleActivate} disabled={activating || !licenseKey.trim()}
                className="w-full px-4 py-2.5 bg-brand-violet hover:bg-brand-violet/80 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer">
                {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                Activate License
              </button>
              <button onClick={() => setShowKeyInput(false)}
                className="w-full px-2 py-1 text-slate-500 hover:text-slate-300 text-[10px] cursor-pointer">
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
