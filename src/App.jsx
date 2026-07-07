import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Wrench, MonitorCheck, Cpu, CircuitBoard, Package, Globe, 
  Sparkles, Settings2, Database, Info, Activity, Bot, LifeBuoy, Zap, Settings,
  Sun, Moon, ShieldCheck, ShieldAlert, RefreshCw, Stethoscope, Brain, FileText,
  Trash2, Lock, Unlock, Copy, FileWarning, Search, Trash, FileX, Scissors, XSquare
} from 'lucide-react';

const OneClickDashboard = React.lazy(() => import('./components/RepairDashboard'));
const SmartRepair = React.lazy(() => import('./components/SmartRepair'));
const DriverManager = React.lazy(() => import('./components/DriverManager'));
const PowerFeatures = React.lazy(() => import('./components/PowerFeatures'));
const HardwareDiagnostics = React.lazy(() => import('./components/HardwareDiagnostics'));
const SoftwareUpdater = React.lazy(() => import('./components/SoftwareUpdater'));
const BrowserRepair = React.lazy(() => import('./components/BrowserRepair'));
const MaintenanceHub = React.lazy(() => import('./components/MaintenanceHub'));
const ServiceManager = React.lazy(() => import('./components/ServiceManager'));
const RegistryManager = React.lazy(() => import('./components/RegistryManager'));
const SettingsView = React.lazy(() => import('./components/Settings'));
const AIDiagnostics = React.lazy(() => import('./components/AIDiagnostics'));
const ReportCenter = React.lazy(() => import('./components/ReportCenter'));
const NetworkMonitor = React.lazy(() => import('./components/NetworkMonitor'));
const PrivacyCleaner = React.lazy(() => import('./components/PrivacyCleaner'));
const StartupManager = React.lazy(() => import('./components/StartupManager'));
const LargeFileFinder = React.lazy(() => import('./components/LargeFileFinder'));
const HistoryLogs = React.lazy(() => import('./components/HistoryLogs'));

// NEW: Advanced Tools
const ForceUninstaller = React.lazy(() => import('./components/ForceUninstaller'));
const FileShredder = React.lazy(() => import('./components/FileShredder'));
const FileUnlocker = React.lazy(() => import('./components/FileUnlocker'));
const DriverSweeper = React.lazy(() => import('./components/DriverSweeper'));
const DuplicateFinder = React.lazy(() => import('./components/DuplicateFinder'));
const BrokenShortcuts = React.lazy(() => import('./components/BrokenShortcuts'));
const HostsEditor = React.lazy(() => import('./components/HostsEditor'));


export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [powerSubTab, setPowerSubTab] = useState('performance');
  const [isAdmin, setIsAdmin] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [visitedTabs, setVisitedTabs] = useState(['dashboard']);

  // Load persistence theme on mount (FIX 6)
  useEffect(() => {
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
  }, []);

  // Sync theme changes with DOM and Electron SettingsStore (FIX 6)
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

  // Deep linking and routing mapper
  const handleSetActiveTab = (tabId) => {
    if (tabId === 'drivers' || tabId === 'driver') {
      setActiveTab('driver');
    } else if (tabId === 'power') {
      setActiveTab('power');
      setPowerSubTab('performance');
    } else if ([
      'performance', 'network', 'startup', 'battery', 
      'privacy', 'largefiles', 'history'
    ].includes(tabId)) {
      setActiveTab('power');
      setPowerSubTab(tabId);
    } else {
      setActiveTab(tabId);
    }
  };

  // Removed duplicates from sidebar to keep the tool clean and professional
  const navigation = [
    { isHeader: true, label: 'Core Tools' },
    { id: 'dashboard',    label: 'Dashboard',          icon: LayoutDashboard,  component: OneClickDashboard },
    { id: 'ai-diagnostics', label: 'Smart Diagnostics',   icon: Brain,            component: AIDiagnostics },
    { id: 'smart-repair', label: 'Smart Repair',       icon: Stethoscope,      component: SmartRepair },
    { isHeader: true, label: '🛠️ Utilities' },
    { id: 'driver',       label: 'Drivers',             icon: Cpu,              component: DriverManager },
    { id: 'power',        label: 'Power Features',      icon: Zap,              component: PowerFeatures },
    { id: 'hardware',     label: 'Hardware',            icon: CircuitBoard,     component: HardwareDiagnostics },
    { id: 'software',     label: 'Software',            icon: Package,          component: SoftwareUpdater },
    { id: 'maintenance',  label: 'Maintenance',         icon: Sparkles,         component: MaintenanceHub },
    { id: 'startup',      label: 'Startup',             icon: Zap,              component: StartupManager },
    { id: 'large-files',  label: 'Large Files',         icon: Database,         component: LargeFileFinder },
    { id: 'history',      label: 'History Logs',        icon: FileText,         component: HistoryLogs },
    { id: 'report-center',label: 'Report Center',       icon: FileText,         component: ReportCenter },
    { isHeader: true, label: '🌐 Network Tools' },
    { id: 'network',      label: 'Network Monitor',     icon: Globe,            component: NetworkMonitor },
    { id: 'browser',      label: 'Browser Repair',      icon: Globe,            component: BrowserRepair },
    { isHeader: true, label: '🔒 Security Tools' },
    { id: 'services',     label: 'Services',            icon: Settings2,        component: ServiceManager },
    { id: 'registry',     label: 'Registry',            icon: Database,         component: RegistryManager },
    { id: 'privacy',      label: 'Privacy Cleaner',     icon: ShieldCheck,      component: PrivacyCleaner },
    { isHeader: true, label: '⚙️ System' },
    { id: 'settings',     label: 'Settings',            icon: Settings,         component: SettingsView },
    { isHeader: true, label: '🔥 Advanced Tools' },
    { id: 'force-uninstaller', label: 'Force Uninstaller', icon: Trash2,         component: ForceUninstaller },
    { id: 'file-shredder',     label: 'File Shredder',     icon: Scissors,       component: FileShredder },
    { id: 'file-unlocker',     label: 'File Unlocker',     icon: Unlock,         component: FileUnlocker },
    { id: 'driver-sweeper',    label: 'Driver Sweeper',    icon: Trash,          component: DriverSweeper },
    { id: 'duplicate-finder',  label: 'Duplicate Finder',  icon: Copy,           component: DuplicateFinder },
    { id: 'broken-shortcuts',  label: 'Broken Shortcuts',  icon: FileX,          component: BrokenShortcuts },
    { id: 'hosts-editor',      label: 'Hosts Ad-Blocker',  icon: ShieldAlert,    component: HostsEditor },
  ];

  const getBreadcrumb = () => {
    const item = navigation.find(n => n.id === activeTab);
    return item ? item.label : 'Power Features';
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-navy">
        <RefreshCw className="h-8 w-8 animate-spin text-brand-violet" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-brand-navy font-sans text-white transition-colors duration-300">
      {/* Sidebar Navigation */}
      <aside className="w-16 md:w-64 bg-slate-900 border-r border-brand-border flex flex-col justify-between p-3 md:p-4 select-none overflow-y-auto shrink-0 transition-all duration-350">
        <div>
          {/* Logo Section */}
          <div className="flex items-center gap-3 px-1 md:px-2 py-4 mb-6">
            <Zap className="h-8 w-8 text-brand-violet animate-pulse shrink-0" />
            <div className="hidden md:block">
              <h1 className="text-lg font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-brand-violet to-brand-cyan">
                SOLAS MASTER
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">Windows Repair Center</p>
            </div>
            <span className="bg-brand-violet text-white px-2 py-0.5 rounded text-[10px] font-black">
              v4.2.0
            </span>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {navigation.map((item, index) => {
              if (item.isHeader) {
                return (
                  <div key={`header-${index}`} className="px-4 py-2 mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider hidden md:block">
                    {item.label}
                  </div>
                );
              }
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSetActiveTab(item.id)}
                  title={item.label}
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
          </nav>
        </div>

        {/* Footer Area with Privilege Badge */}
        <div className="border-t border-brand-border pt-4 space-y-3">
          {/* Theme Toggle */}
          <button
            onClick={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
            <span className="hidden md:inline">{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</span>
          </button>
          <div className={`flex items-center justify-center md:justify-start gap-3 px-3 py-2 rounded-lg ${isAdmin ? 'bg-emerald-950/30 border border-emerald-500/20' : 'bg-rose-950/30 border border-rose-500/20'}`}>
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
          <p className="hidden md:block text-[10px] text-slate-500 text-center mt-3 font-medium">Solas PC Master v4.2.0</p>
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

        {/* Compatibility Mode Banner for Win 7/8 */}
        {systemInfo?.isLegacyWin && (
          <div className="bg-amber-950/40 border-b border-amber-500/20 text-amber-400 px-6 py-2.5 text-xs font-semibold flex items-center gap-2 select-none text-left shrink-0">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
            <span>Compatibility Mode: Limited features active on {systemInfo.osName || 'Windows Legacy'}. Winget and modern disk optimization are disabled.</span>
          </div>
        )}

        {/* Body View Host with state-preserving tabs visibility toggling */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-brand-navy via-slate-900 to-brand-navy transition-colors duration-300 relative">
          <React.Suspense fallback={
            <div className="flex h-full w-full items-center justify-center bg-brand-navy">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-violet" />
            </div>
          }>
            {navigation.map((item) => {
              const Component = item.component;
              const isVisited = visitedTabs.includes(item.id);
              const isActive = activeTab === item.id;
              if (!isVisited) return null;
              return (
                <div 
                  key={item.id} 
                  className={isActive ? "h-full w-full" : "hidden"}
                >
                  {item.id === 'dashboard' ? (
                    <Component setActiveTab={handleSetActiveTab} />
                  ) : item.id === 'settings' ? (
                    <Component theme={theme} setTheme={handleSetTheme} />
                  ) : item.id === 'power' ? (
                    <Component activeSubTab={powerSubTab} setActiveSubTab={handleSetActiveTab} />
                  ) : (
                    <Component />
                  )}
                </div>
              );
            })}
          </React.Suspense>
        </div>
      </main>
    </div>
  );
}
