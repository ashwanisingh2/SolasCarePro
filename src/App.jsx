import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Wrench, MonitorCheck, Cpu, CircuitBoard, Package, Globe,
  Sparkles, Settings2, Database, Info, Activity, Bot, LifeBuoy, Zap, Settings,
  Sun, Moon, ShieldCheck, ShieldAlert, RefreshCw, Stethoscope, Brain, FileText,
  Trash2, Scissors, Copy, FileX, Unlock, Clock, Wifi, Shield, ClipboardList, Loader2, Terminal, Skull, ChevronDown, ChevronRight, Crosshair, Briefcase, SlidersHorizontal, Hammer, ShieldOff, Lock, History, GitCompareArrows, HeartPulse, Radar, Gauge, Box
} from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import { ProFeatureGate } from './components/UpgradeModal';

// Map feature tab IDs to Pro feature gate IDs. Only Pro-only features are listed.
const PRO_FEATURE_MAP = {
  'solas-vault':               { featureId: 'vault', label: 'Solas Vault' },
  'solas-sentinel':            { featureId: 'sentinel', label: 'Solas Sentinel' },
  'micro-snapshots':           { featureId: 'snapshots', label: 'Micro-Snapshots' },
  'pc-clone':                  { featureId: 'pc-clone', label: 'PC Clone' },
  'predictive-maintenance':    { featureId: 'predictive-maintenance', label: 'Predictive Maintenance' }
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
  const [expandedCats, setExpandedCats] = useState({ 'Main': true, 'Core Tools': true, 'Logs & Settings': true, 'System Tools': true, 'Cleanup & Privacy': true, 'Ironclad Defense': true, 'Time Machine': true, 'Always-On Intelligence': true, 'Stretch Goals': true, 'Extra Tools': true });

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

  // Refactored navigation into structured categories for collapsible UI
  const navigationCategories = [
    {
      label: 'Main',
      items: [
        { id: 'dashboard',      label: 'Unified Dashboard',  icon: LayoutDashboard,  component: UnifiedDashboard }
      ]
    },
    {
      label: 'Core Tools',
      items: [
        { id: 'driver',         label: 'Drivers',            icon: Cpu,              component: DriverManager },
        { id: 'hardware',       label: 'Hardware Diagnostics', icon: CircuitBoard,   component: HardwareDiagnostics },
        { id: 'device-details', label: 'Device Details',     icon: Info,             component: DeviceDetails },
        { id: 'performance',    label: 'Performance Tuning', icon: Zap,              component: PerformanceTuning },
        { id: 'software',       label: 'Software Updater',   icon: Package,          component: SoftwareUpdater },
        { id: 'ai-diagnostics', label: 'Solas Smart Diagnostics', icon: Bot,            component: AiDiagnostics }
      ]
    },
    {
      label: 'System Tools',
      items: [
        { id: 'registry',       label: 'Registry',           icon: Database,         component: RegistryManager },
        { id: 'services',       label: 'Services',           icon: Settings2,        component: ServiceManager },
        { id: 'startup',        label: 'Startup Manager',    icon: Clock,            component: StartupManager },
        { id: 'network',        label: 'Network Monitor',    icon: Wifi,             component: NetworkMonitor }
      ]
    },
    {
      label: 'Cleanup & Privacy',
      items: [
        { id: 'privacy',        label: 'Privacy Cleaner',    icon: Shield,           component: PrivacyCleaner },
        { id: 'browser',        label: 'Browser Repair',     icon: Globe,            component: BrowserRepair },
        { id: 'hosts-editor',   label: 'Hosts Ad-Blocker',   icon: ShieldAlert,      component: HostsEditor }
      ]
    },
    {
      label: 'Logs & Settings',
      items: [
        { id: 'history',        label: 'Repair History',     icon: ClipboardList,    component: HistoryLogs },
        { id: 'bsod-analyzer',  label: 'BSOD Analyzer',      icon: Skull,            component: BsodAnalyzer },
        { id: 'report-center',  label: 'Report Center',      icon: FileText,         component: ReportCenter },
        { id: 'settings',       label: 'Settings',           icon: Settings,         component: SettingsView }
      ]
    },
    {
      label: 'Ironclad Defense',
      items: [
        { id: 'privacy-blackhole', label: 'Privacy Blackhole', icon: ShieldOff,      component: PrivacyBlackhole },
        { id: 'solas-vault',       label: 'Solas Vault',       icon: Lock,           component: SolasVault }
      ]
    },
    {
      label: 'Time Machine',
      items: [
        { id: 'micro-snapshots',   label: 'Micro-Snapshots',   icon: History,        component: MicroSnapshots },
        { id: 'pc-clone',          label: 'PC Clone',          icon: Copy,           component: PcClone }
      ]
    },
    {
      label: 'Always-On Intelligence',
      items: [
        { id: 'predictive-maintenance', label: 'Predictive Maintenance', icon: HeartPulse, component: PredictiveMaintenance },
        { id: 'solas-sentinel',         label: 'Solas Sentinel',         icon: Radar,     component: SolasSentinel }
      ]
    },
    {
      label: 'Stretch Goals',
      items: [
        { id: 'v-cache',          label: 'Solas V-Cache',  icon: Gauge, component: VCache },
        { id: 'seamless-sandbox', label: 'Seamless Sandbox', icon: Box, component: SeamlessSandbox }
      ]
    },
    {
      label: 'Extra Tools',
      items: [
        { id: 'command-hub',          label: 'Command Hub',         icon: Terminal,       component: CommandHub },
        { id: 'windows-tweaks',       label: 'Windows God Mode',    icon: ShieldAlert,    component: WindowsTweaks },
        { id: 'god-mode-tweaker',     label: 'God Mode Tweaker',    icon: SlidersHorizontal, component: GodModeTweaker },
        { id: 'software-forge',       label: 'Software Forge',      icon: Hammer,         component: SoftwareForge },
        { id: 'surgical-uninstaller', label: 'Surgical Uninstaller', icon: Crosshair,     component: SurgicalUninstaller },
        { id: 'workspace-automation', label: 'Workspace Automation', icon: Briefcase,     component: WorkspaceAutomation },
        { id: 'force-uninstaller',    label: 'Force Uninstaller',   icon: Trash2,         component: ForceUninstaller },
        { id: 'file-shredder',        label: 'File Shredder',       icon: Scissors,       component: FileShredder },
        { id: 'file-unlocker',        label: 'File Unlocker',       icon: Unlock,         component: FileUnlocker },
        { id: 'duplicate-finder',     label: 'Duplicate Finder',    icon: Copy,           component: DuplicateFinder },
        { id: 'broken-shortcuts',     label: 'Broken Shortcuts',    icon: FileX,          component: BrokenShortcuts }
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
    <div className="flex h-screen w-screen overflow-hidden bg-brand-navy font-sans text-white transition-colors duration-300">
      {/* Sidebar Navigation */}
      <aside className="w-16 md:w-64 bg-slate-900 border-r border-brand-border flex flex-col justify-between p-3 md:p-4 select-none overflow-y-auto shrink-0 transition-all duration-350">
        <div>
          {/* Logo Section */}
          <div className="flex items-center gap-3 px-1 md:px-2 py-4 mb-6">
            <Zap className="h-8 w-8 text-brand-violet animate-pulse shrink-0" />
            <div className="hidden md:block">
              <div className="flex flex-col">
                <span className="font-black text-xl tracking-widest text-white drop-shadow-md">
                  SOLASCARE PRO
                </span>
                <span className="text-[10px] text-brand-violet uppercase font-bold tracking-widest"> Repair Center</span>
              </div>
            </div>
            <span className="bg-brand-violet text-white px-2 py-0.5 rounded text-[10px] font-black">
              v5.0.0
            </span>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-2">
            {navigationCategories.map((cat, index) => {
              const isExpanded = expandedCats[cat.label];
              return (
                <div key={index} className="flex flex-col">
                  {/* Category Header */}
                  <button
                    onClick={() => setExpandedCats(prev => ({ ...prev, [cat.label]: !prev[cat.label] }))}
                    className="flex items-center justify-between w-full px-4 py-2 mt-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-white transition-colors cursor-pointer hidden md:flex group"
                  >
                    <span>{cat.label}</span>
                    {isExpanded ? <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-100" /> : <ChevronRight className="h-3 w-3 opacity-50 group-hover:opacity-100" />}
                  </button>
                  
                  {/* Category Items */}
                  {isExpanded && (
                    <div className="space-y-1 mt-1">
                      {cat.items.map(item => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSetActiveTab(item.id)}
                            title={item.label}
                            aria-label={`Navigate to ${item.label}`}
                            className={`w-full flex items-center justify-center md:justify-start gap-3 px-3 md:px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
                              isActive 
                                ? 'bg-gradient-to-r from-brand-violet/20 to-brand-cyan/10 border-l-4 border-brand-violet text-white shadow-md' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                            }`}
                          >
                            <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-brand-violet' : 'text-slate-400'}`} />
                            <span className="hidden md:inline truncate">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Area with Privilege Badge */}
        <div className="border-t border-brand-border pt-4 space-y-3">
          <div className={`flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-lg ${isAdmin ? 'bg-emerald-950/30 border border-emerald-500/20' : 'bg-rose-950/30 border border-rose-500/20'}`} role="status" aria-label={isAdmin ? 'Running in Admin Mode' : 'Running in Standard Mode'}>
            {isAdmin ? (
              <ShieldCheck className="h-5 w-5 text-brand-success shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-brand-danger shrink-0" />
            )}
            <div className="hidden md:block truncate text-left">
              <p className="text-[11px] font-bold text-slate-300">PRIVILEGES</p>
              <p className={`text-[10px] font-semibold ${isAdmin ? 'text-brand-success' : 'text-brand-danger'}`}>
                {isAdmin ? 'Admin Mode' : 'Standard'}
              </p>
            </div>
            </div>
            <div className="mt-auto px-4 pb-6">
            <p className="hidden md:block text-[10px] text-slate-500 text-center mt-3 font-medium">SolasCare Pro v5.0.0</p>
          </div>
        </div>
      </aside>

      {/* Main Panel Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-brand-navy transition-colors duration-300">
        {/* Header Bar */}
        <header className="h-16 border-b border-brand-border flex items-center justify-between px-6 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 select-none">
            <span>Home</span>
            <span>/</span>
            <span className="text-brand-cyan">{getBreadcrumb()}</span>
          </div>
        </header>

        {/* Body View Host with state-preserving tabs visibility toggling */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-brand-navy via-slate-900 to-brand-navy transition-colors duration-300 relative">
          <React.Suspense fallback={
            <div className="flex h-full w-full items-center justify-center bg-brand-navy">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-violet" />
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
                ) : (
                  <Component />
                )
              );
              return (
                <div
                  key={item.id}
                  className={isActive ? "h-full w-full" : "hidden"}
                >
                  {proGate ? (
                    <ProFeatureGate featureId={proGate.featureId} fallbackLabel={proGate.label}>
                      {renderContent()}
                    </ProFeatureGate>
                  ) : renderContent()}
                </div>
              );
            })}
          </React.Suspense>
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}
