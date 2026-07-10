import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Cpu, CircuitBoard, Package, Globe, Settings2, Database, Info, Bot, Zap, Settings, ShieldCheck, ShieldAlert, RefreshCw, FileText,
  Trash2, Scissors, Copy, FileX, Unlock, Clock, Wifi, Shield, ClipboardList, Loader2, Terminal, Skull, ChevronDown, ChevronRight, Crosshair, Briefcase, SlidersHorizontal, Hammer, ShieldOff, Lock, History, HeartPulse, Radar, Gauge, Box
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ErrorBoundary from './components/ErrorBoundary';
import { ProFeatureGate } from './components/UpgradeModal';

// Map feature tab IDs to Pro feature gate IDs. Only Pro-only features are listed.
const PRO_FEATURE_MAP = {
  'solas-vault':               { featureId: 'vault', label: 'Solas Vault' },
  'solas-sentinel':            { featureId: 'sentinel', label: 'Solas Sentinel' },
  'micro-snapshots':           { featureId: 'snapshots', label: 'Micro-Snapshots' },
  'pc-clone':                  { featureId: 'pc-clone', label: 'PC Clone' },
  'predictive-maintenance':    { featureId: 'predictive-maintenance', label: 'Predictive Maintenance' },
  'v-cache':                   { featureId: 'v-cache', label: 'Solas V-Cache (RAM Disk)' },
  'seamless-sandbox':          { featureId: 'sandbox', label: 'Seamless Sandbox' }
};

const UnifiedDashboard = React.lazy(() => import('./components/UnifiedDashboard'));
const PerformanceTuning = React.lazy(() => import('./components/PerformanceTuning'));
const DriverManager = React.lazy(() => import('./components/DriverManager'));
const HardwareDiagnostics = React.lazy(() => import('./components/HardwareDiagnostics'));
const DeviceDetails = React.lazy(() => import('./components/DeviceDetails'));
const SoftwareUpdater = React.lazy(() => import('./components/SoftwareUpdater'));
const BrowserRepair = React.lazy(() => import('./components/BrowserRepair'));
const ServiceManager = React.lazy(() => import('./components/ServiceManager'));
const RegistryManager = React.lazy(() => import('./components/RegistryManager'));
const SettingsView = React.lazy(() => import('./components/Settings'));
const ReportCenter = React.lazy(() => import('./components/ReportCenter'));
const BsodAnalyzer = React.lazy(() => import('./components/BsodAnalyzer'));
const AiDiagnostics = React.lazy(() => import('./components/AiDiagnostics'));

const StartupManager = React.lazy(() => import('./components/StartupManager'));
const NetworkMonitor = React.lazy(() => import('./components/NetworkMonitor'));
const PrivacyCleaner = React.lazy(() => import('./components/PrivacyCleaner'));
const HistoryLogs = React.lazy(() => import('./components/HistoryLogs'));

// Advanced Tools
const ForceUninstaller = React.lazy(() => import('./components/ForceUninstaller'));
const FileShredder = React.lazy(() => import('./components/FileShredder'));
const FileUnlocker = React.lazy(() => import('./components/FileUnlocker'));
const DuplicateFinder = React.lazy(() => import('./components/DuplicateFinder'));
const BrokenShortcuts = React.lazy(() => import('./components/BrokenShortcuts'));
const CommandHub = React.lazy(() => import('./components/CommandHub'));
const WindowsTweaks = React.lazy(() => import('./components/WindowsTweaks'));
const HostsEditor = React.lazy(() => import('./components/HostsEditor'));
const Onboarding = React.lazy(() => import('./components/Onboarding'));

// Phase 1 - Feature 1: Surgical Uninstaller (snapshot + diff + surgical cleanup)
const SurgicalUninstaller = React.lazy(() => import('./components/SurgicalUninstaller'));

// Phase 1 - Feature 2: Smart Workspace Automation (profiles + triggers)
const WorkspaceAutomation = React.lazy(() => import('./components/WorkspaceAutomation'));

// Phase 2 - Feature 3: God Mode Visual Tweaker (cards + micro-snapshots + undo)
const GodModeTweaker = React.lazy(() => import('./components/GodModeTweaker'));

// Phase 2 - Feature 4: Software Forge (silent installer + bloatware + driver rollback)
const SoftwareForge = React.lazy(() => import('./components/SoftwareForge'));

// Phase 3 - Feature 5: Privacy Blackhole (HOSTS + firewall + GPO)
const PrivacyBlackhole = React.lazy(() => import('./components/PrivacyBlackhole'));

// Phase 3 - Feature 6: Solas Vault (VHD + BitLocker + auto-unmount)
const SolasVault = React.lazy(() => import('./components/SolasVault'));

// Phase 4 - Feature 7: Micro-Snapshots (System Restore + retention policy)
const MicroSnapshots = React.lazy(() => import('./components/MicroSnapshots'));

// Phase 4 - Feature 8: One-Click PC Clone (AES-256 encrypted migration)
const PcClone = React.lazy(() => import('./components/PcClone'));

// Phase 5 - Feature 9: Predictive Maintenance (hardware health + trend graphs)
const PredictiveMaintenance = React.lazy(() => import('./components/PredictiveMaintenance'));

// Phase 5 - Feature 10: Solas Sentinel (background watchdog + auto-heal rules)
const SolasSentinel = React.lazy(() => import('./components/SolasSentinel'));

// Phase 6 - Feature 11: Solas V-Cache (RAM disk via ImDisk) — STRETCH GOAL
const VCache = React.lazy(() => import('./components/VCache'));

// Phase 6 - Feature 12: Seamless Sandbox (Windows Sandbox wrapper) — STRETCH GOAL
const SeamlessSandbox = React.lazy(() => import('./components/SeamlessSandbox'));


export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isWindowActive, setIsWindowActive] = useState(true);
  const [visitedTabs, setVisitedTabs] = useState(['dashboard']);
  const [expandedCats, setExpandedCats] = useState({ 
    'Dashboard': true, 
    'Diagnostics & Health': true, 
    'Performance & Drivers': true, 
    'Software & Updates': false,
    'Privacy & Security': true, 
    'System Management': false,
    'Backup & Recovery': false,
    'Automation & Intelligence': false,
    'Advanced Tools': false,
    'Logs & Reports': true
  });

  // Load persistence theme and startup init
  useEffect(() => {
    // Check onboarding status
    if (!localStorage.getItem('solas_onboarded')) {
      setShowOnboarding(true);
    }

    // Handle visibility for battery/CPU saving during polling
    const handleVisibilityChange = () => {
      setIsWindowActive(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const initAppAndTheme = async () => {
      try {
        if (window.api) {
          const res = await window.api.isAdmin();
          setIsAdmin(res);
          const info = await window.api.getSystemInfo();
          setSystemInfo(info);
          
          const savedTheme = await window.api.getSetting('theme', 'dark');
          setTheme(savedTheme);
        } else {
          setIsAdmin(true);
          const savedTheme = localStorage.getItem('solas-theme') || 'dark';
          setTheme(savedTheme);
        }
      } catch (err) {
        console.error('Failed app init:', err);
      } finally {
        setLoading(false);
      }
    };
    initAppAndTheme();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync theme changes with DOM and Electron SettingsStore
  const handleSetTheme = async (newTheme) => {
    setTheme(newTheme);
    if (window.api) {
      await window.api.setSetting('theme', newTheme);
    } else {
      localStorage.setItem('solas-theme', newTheme);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
    } else {
      root.classList.remove('light-mode');
    }
  }, [theme]);

  // Accumulate visited tabs dynamically to implement state-preserving lazy mount
  useEffect(() => {
    if (!visitedTabs.includes(activeTab)) {
      setVisitedTabs(prev => [...prev, activeTab]);
    }
  }, [activeTab]);

  const handleSetActiveTab = (tabId) => {
    setActiveTab(tabId);
  };

  // Refactored navigation — cleaner, priority-based, logical grouping
  const navigationCategories = [
    {
      label: 'Dashboard',
      items: [
        { id: 'dashboard',      label: 'Control Center',     icon: LayoutDashboard,  component: UnifiedDashboard }
      ]
    },
    {
      label: 'Diagnostics & Health',
      items: [
        { id: 'ai-diagnostics',        label: 'Smart Diagnostics',        icon: Bot,             component: AiDiagnostics },
        { id: 'hardware',              label: 'Hardware Health',          icon: CircuitBoard,    component: HardwareDiagnostics },
        { id: 'device-details',        label: 'Device Details',           icon: Info,            component: DeviceDetails },
        { id: 'bsod-analyzer',         label: 'BSOD Analyzer',            icon: Skull,           component: BsodAnalyzer },
        { id: 'predictive-maintenance', label: 'Predictive Maintenance',  icon: HeartPulse,      component: PredictiveMaintenance }
      ]
    },
    {
      label: 'Performance & Drivers',
      items: [
        { id: 'performance',    label: 'Performance Boost',  icon: Zap,              component: PerformanceTuning },
        { id: 'driver',         label: 'Driver Manager',     icon: Cpu,              component: DriverManager },
        { id: 'startup',        label: 'Startup Control',    icon: Clock,            component: StartupManager },
        { id: 'god-mode-tweaker', label: 'System Tweaker',   icon: SlidersHorizontal, component: GodModeTweaker }
      ]
    },
    {
      label: 'Software & Updates',
      items: [
        { id: 'software',              label: 'Software Updater',         icon: Package,         component: SoftwareUpdater },
        { id: 'software-forge',        label: 'Software Forge',           icon: Hammer,          component: SoftwareForge },
        { id: 'surgical-uninstaller',  label: 'Surgical Uninstaller',     icon: Crosshair,       component: SurgicalUninstaller },
        { id: 'force-uninstaller',     label: 'Force Uninstaller',        icon: Trash2,          component: ForceUninstaller }
      ]
    },
    {
      label: 'Privacy & Security',
      items: [
        { id: 'privacy',           label: 'Privacy Cleaner',       icon: Shield,          component: PrivacyCleaner },
        { id: 'privacy-blackhole', label: 'Privacy Blackhole',     icon: ShieldOff,       component: PrivacyBlackhole },
        { id: 'solas-vault',       label: 'Encrypted Vault',       icon: Lock,            component: SolasVault },
        { id: 'hosts-editor',      label: 'Hosts Ad-Block',        icon: ShieldAlert,     component: HostsEditor },
        { id: 'browser',           label: 'Browser Repair',        icon: Globe,           component: BrowserRepair }
      ]
    },
    {
      label: 'System Management',
      items: [
        { id: 'registry',          label: 'Registry Manager',      icon: Database,        component: RegistryManager },
        { id: 'services',          label: 'Services Manager',      icon: Settings2,       component: ServiceManager },
        { id: 'network',           label: 'Network Monitor',       icon: Wifi,            component: NetworkMonitor },
        { id: 'windows-tweaks',    label: 'Windows God Mode',      icon: ShieldAlert,     component: WindowsTweaks },
        { id: 'command-hub',       label: 'Command Terminal',      icon: Terminal,        component: CommandHub }
      ]
    },
    {
      label: 'Backup & Recovery',
      items: [
        { id: 'micro-snapshots',   label: 'System Snapshots',      icon: History,         component: MicroSnapshots },
        { id: 'pc-clone',          label: 'PC Clone & Migrate',    icon: Copy,            component: PcClone }
      ]
    },
    {
      label: 'Automation & Intelligence',
      items: [
        { id: 'workspace-automation', label: 'Workspace Profiles',   icon: Briefcase,       component: WorkspaceAutomation },
        { id: 'solas-sentinel',       label: 'Auto-Heal Watchdog',   icon: Radar,           component: SolasSentinel }
      ]
    },
    {
      label: 'Advanced Tools',
      items: [
        { id: 'file-shredder',     label: 'Secure File Shredder',  icon: Scissors,        component: FileShredder },
        { id: 'file-unlocker',     label: 'File Unlocker',         icon: Unlock,          component: FileUnlocker },
        { id: 'duplicate-finder',  label: 'Duplicate Finder',      icon: Copy,            component: DuplicateFinder },
        { id: 'broken-shortcuts',  label: 'Shortcut Cleaner',      icon: FileX,           component: BrokenShortcuts },
        { id: 'v-cache',           label: 'RAM Disk (V-Cache)',    icon: Gauge,           component: VCache },
        { id: 'seamless-sandbox',  label: 'App Sandbox',           icon: Box,             component: SeamlessSandbox }
      ]
    },
    {
      label: 'Logs & Reports',
      items: [
        { id: 'history',           label: 'Activity History',      icon: ClipboardList,   component: HistoryLogs },
        { id: 'report-center',     label: 'Report Center',         icon: FileText,        component: ReportCenter },
        { id: 'settings',          label: 'Settings',              icon: Settings,        component: SettingsView }
      ]
    }
  ];

  const getBreadcrumb = () => {
    for (const cat of navigationCategories) {
      const item = cat.items.find(n => n.id === activeTab);
      if (item) return item.label;
    }
    return 'Home';
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-navy">
        <Loader2 className="h-12 w-12 animate-spin text-brand-violet" />
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <React.Suspense fallback={<div className="bg-brand-navy w-full h-screen"></div>}>
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      </React.Suspense>
    );
  }

  return (
    <ErrorBoundary>
    <div className="flex h-screen w-screen overflow-hidden bg-[#070b14] font-sans text-white transition-colors duration-300 relative">
      
      {/* Stunning Aurora Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-brand-violet/20 blur-[120px] animate-rotate-slow"></div>
        <div className="absolute top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-brand-cyan/10 blur-[140px] animate-pulse-glow"></div>
        <div className="absolute -bottom-[20%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-emerald-500/10 blur-[120px] animate-pulse-glow"></div>
      </div>

      {/* Main App Container */}
      <div className="relative z-10 flex w-full h-full p-4 gap-4 md:p-6 md:gap-6">
        
        {/* Floating Sidebar */}
        <aside className="w-20 md:w-72 bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] flex flex-col justify-between p-3 md:p-5 select-none overflow-y-auto shrink-0 shadow-2xl transition-all duration-350 z-20">
          <div>
            {/* Logo Section */}
            <div className="flex items-center gap-3 px-1 md:px-2 py-4 mb-4">
              <div className="p-2.5 bg-gradient-to-br from-brand-violet to-brand-cyan rounded-2xl shadow-lg shrink-0">
                <Zap className="h-6 w-6 text-white animate-pulse" />
              </div>
              <div className="hidden md:block">
                <div className="flex flex-col">
                  <span className="font-black text-xl tracking-wider text-white drop-shadow-md">
                    SOLASCARE
                  </span>
                  <span className="text-[10px] text-brand-cyan uppercase font-bold tracking-widest bg-brand-cyan/10 px-2 py-0.5 rounded-full w-max mt-1 border border-brand-cyan/20">Pro Edition</span>
                </div>
              </div>
            </div>

            {/* Navigation Items */}
            <nav className="space-y-4">
              {navigationCategories.map((cat, index) => {
                const isExpanded = expandedCats[cat.label];
                return (
                  <div key={index} className="flex flex-col">
                    <button
                      onClick={() => setExpandedCats(prev => ({ ...prev, [cat.label]: !prev[cat.label] }))}
                      className="flex items-center justify-between w-full px-2 py-1 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-white transition-colors cursor-pointer hidden md:flex group"
                    >
                      <span>{cat.label}</span>
                      {isExpanded ? <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-100" /> : <ChevronRight className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
                    </button>
                    
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: 'auto' }} 
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-1 overflow-hidden"
                        >
                          {cat.items.map(item => {
                            const Icon = item.icon;
                            const isActive = activeTab === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => handleSetActiveTab(item.id)}
                                title={item.label}
                                className={`w-full flex items-center justify-center md:justify-start gap-3 px-3 md:px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer relative group overflow-hidden ${
                                  isActive 
                                    ? 'text-white bg-white/10 shadow-[0_0_15px_rgba(139,92,246,0.15)] border border-white/10' 
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5 border border-transparent'
                                }`}
                              >
                                {isActive && (
                                  <motion.div layoutId="activeTabIndicator" className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-brand-violet to-brand-cyan" />
                                )}
                                <Icon className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-brand-cyan' : 'text-slate-400 group-hover:text-brand-violet'}`} />
                                <span className="hidden md:inline truncate relative z-10">{item.label}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Footer Area */}
          <div className="mt-6 pt-4 border-t border-white/5">
            <div className={`flex items-center justify-center md:justify-start gap-3 px-4 py-3 rounded-xl backdrop-blur-md ${isAdmin ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-rose-500/10 border border-rose-500/20'}`}>
              {isAdmin ? (
                <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
              )}
              <div className="hidden md:block truncate text-left">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Access Level</p>
                <p className={`text-xs font-black ${isAdmin ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isAdmin ? 'ADMINISTRATOR' : 'STANDARD'}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Panel Content Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-900/40 backdrop-blur-3xl rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 z-20 relative">
          
          {/* Header Bar */}
          <header className="h-16 border-b border-white/10 flex items-center justify-between px-8 shrink-0 bg-white/5 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-400 select-none uppercase tracking-widest">
              <span>SolasCare</span>
              <span className="text-brand-violet">/</span>
              <span className="text-white drop-shadow-md">{getBreadcrumb()}</span>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-mono text-slate-500 bg-slate-950/50 px-3 py-1 rounded-full border border-white/5">
                v{systemInfo?.appVersion || '5.1.0'}
              </span>
            </div>
          </header>

          {/* Body View Host */}
          <div className="flex-1 overflow-y-auto bg-transparent relative p-4 md:p-6 scroll-smooth">
            <React.Suspense fallback={
              <div className="flex h-full w-full items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full blur-xl bg-brand-violet/30 animate-pulse"></div>
                  <RefreshCw className="h-8 w-8 animate-spin text-brand-cyan relative z-10" />
                </div>
              </div>
            }>
              {navigationCategories.flatMap(cat => cat.items).map((item) => {
                const Component = item.component;
                const isVisited = visitedTabs.includes(item.id);
                const isActive = activeTab === item.id;
                if (!isVisited) return null;
                const proGate = PRO_FEATURE_MAP[item.id];
                const renderContent = () => (
                  item.id === 'dashboard' ? (
                    <Component setActiveTab={handleSetActiveTab} isWindowActive={isWindowActive} />
                  ) : item.id === 'network' ? (
                    <Component isWindowActive={isWindowActive} />
                  ) : item.id === 'settings' ? (
                    <Component theme={theme} setTheme={handleSetTheme} />
                  ) : item.id === 'ai-diagnostics' ? (
                    <Component setActiveTab={handleSetActiveTab} />
                  ) : (
                    <Component />
                  )
                );
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                    animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0.98, y: isActive ? 0 : 10 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className={isActive ? "h-full w-full" : "hidden"}
                  >
                    {proGate ? (
                      <ProFeatureGate featureId={proGate.featureId} fallbackLabel={proGate.label}>
                        {renderContent()}
                      </ProFeatureGate>
                    ) : renderContent()}
                  </motion.div>
                );
              })}
            </React.Suspense>
          </div>
        </main>
      </div>
    </div>
    </ErrorBoundary>
  );
}
