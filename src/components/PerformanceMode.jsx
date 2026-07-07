import React, { useState, useEffect } from 'react';
import { Zap, Cpu, Battery, BatteryCharging, ThermometerSun, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

const PERFORMANCE_PROFILES = {
  gaming: {
    name: 'Gaming Mode',
    icon: Zap,
    description: 'Maximize performance for gaming',
    color: 'from-purple-600 to-pink-500',
    borderColor: 'border-purple-500/30',
    glowColor: 'shadow-purple-500/20',
    settings: {
      powerPlan: 'Ultimate Performance',
      gameMode: true,
      hardwareGpuScheduling: true,
      backgroundApps: false,
      notifications: false,
      visualEffects: 'Performance',
      cpuPriority: 'High',
      gpuPriority: 'Maximum'
    }
  },
  work: {
    name: 'Work Mode',
    icon: Cpu,
    description: 'Balanced for productivity tasks',
    color: 'from-blue-600 to-cyan-500',
    borderColor: 'border-blue-500/30',
    glowColor: 'shadow-blue-500/20',
    settings: {
      powerPlan: 'Balanced',
      gameMode: false,
      hardwareGpuScheduling: true,
      backgroundApps: true,
      notifications: true,
      visualEffects: 'Balanced',
      cpuPriority: 'Balanced',
      gpuPriority: 'Balanced'
    }
  },
  powerSaving: {
    name: 'Power Saving',
    icon: Battery,
    description: 'Minimize power consumption',
    color: 'from-green-600 to-emerald-500',
    borderColor: 'border-green-500/30',
    glowColor: 'shadow-green-500/20',
    settings: {
      powerPlan: 'Power Saver',
      gameMode: false,
      hardwareGpuScheduling: false,
      backgroundApps: false,
      notifications: false,
      visualEffects: 'Best Power Saving',
      cpuPriority: 'Low',
      gpuPriority: 'Minimum'
    }
  }
};

export default function PerformanceMode({ currentMode, onModeChange }) {
  const [activeMode, setActiveMode] = useState(currentMode || 'work');
  const [isApplying, setIsApplying] = useState(false);
  const [appliedSettings, setAppliedSettings] = useState(null);

  const handleModeChange = async (mode) => {
    setIsApplying(true);
    const profile = PERFORMANCE_PROFILES[mode];

    // Map the local mode key to the allow-listed power plan key in main process.
    // Main process refuses raw `powercfg -setactive <GUID>` strings now (security).
    const POWER_PLAN_KEYS = {
      gaming: 'high',
      work: 'balanced',
      powerSaving: 'saver'
    };

    if (window.api) {
      try {
        const result = await window.api.runSystemCommand('apply-power-plan', [POWER_PLAN_KEYS[mode]]);
        if (!result.success) {
          console.warn('Power plan change failed:', result.error);
        }
        // Apply background-apps toggle to match the profile's claim (fixes prior UI lie).
        // BatterySaver.jsx uses the same allow-listed commands.
        if (profile.settings.backgroundApps === false) {
          try {
            await window.api.runSystemCommand('disable-background-apps');
          } catch (e) {
            console.warn('Failed to disable background apps:', e);
          }
        } else if (profile.settings.backgroundApps === true && activeMode === 'powerSaving') {
          // Only re-enable when transitioning OUT of a power-saving mode that disabled them.
          try {
            await window.api.runSystemCommand('enable-background-apps');
          } catch (e) {
            console.warn('Failed to enable background apps:', e);
          }
        }
      } catch (error) {
        console.warn('Failed to apply system settings:', error);
      }
    } else {
      // Mock-mode only: simulate apply delay so the UI shows the loading state.
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    setActiveMode(mode);
    setAppliedSettings(profile.settings);
    setIsApplying(false);

    if (onModeChange) {
      onModeChange(mode);
    }
  };

  const currentProfile = PERFORMANCE_PROFILES[activeMode];
  const Icon = currentProfile.icon;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Performance Mode</h2>
          <p className="text-xs text-slate-400 mt-1">Optimize system for your current activity</p>
        </div>
        {appliedSettings && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-emerald-400"
          >
            <CheckCircle2 className="h-4 w-4" />
            Applied: {currentProfile.name}
          </motion.div>
        )}
      </div>

      {/* Mode Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(PERFORMANCE_PROFILES).map(([key, profile]) => {
          const ProfileIcon = profile.icon;
          const isActive = activeMode === key;

          return (
            <motion.button
              key={key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => !isApplying && handleModeChange(key)}
              disabled={isApplying}
              className={`relative p-6 rounded-2xl border transition-all duration-300 text-left ${
                isActive
                  ? `${profile.borderColor} shadow-lg ${profile.glowColor}`
                  : 'border-brand-border hover:border-slate-600'
              } bg-slate-900/40 disabled:opacity-50`}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeMode"
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${profile.color} opacity-10`}
                />
              )}

              <div className="relative z-10">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${profile.color} flex items-center justify-center mb-4`}>
                  <ProfileIcon className="h-6 w-6 text-white" />
                </div>

                <h3 className="text-sm font-bold text-slate-200 mb-1">{profile.name}</h3>
                <p className="text-xs text-slate-400 mb-3">{profile.description}</p>

                {isActive && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full uppercase">
                      Active
                    </span>
                  </div>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Current Settings */}
      {currentProfile && (
        <div className="glass-panel border border-brand-border rounded-xl p-5">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            {currentProfile.name} Settings
          </h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(currentProfile.settings).map(([key, value]) => (
              <div key={key} className="bg-slate-950/40 rounded-lg p-3 border border-brand-border">
                <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </div>
                <div className="text-xs font-semibold text-slate-200">
                  {typeof value === 'boolean'
                    ? value ? '✓ Enabled' : '✗ Disabled'
                    : value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isApplying && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-panel border border-brand-border rounded-2xl p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-violet mx-auto mb-3"></div>
            <p className="text-sm font-bold text-slate-200">Applying {currentProfile.name}...</p>
            <p className="text-xs text-slate-400 mt-1">Optimizing system settings</p>
          </div>
        </div>
      )}
    </div>
  );
}
