import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Zap, Settings, 
<<<<<<< HEAD
  ShieldAlert, ShieldCheck, RefreshCw, LifeBuoy, ClipboardList, FileText,
  Sun, Moon, Cpu, Wifi, Clock, Battery, Eye, Trash2, BarChart3, Power
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
=======
  ShieldAlert, ShieldCheck, RefreshCw, LifeBuoy, ClipboardList, FileText
} from 'lucide-react';
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
import SettingsView from './components/Settings';
import PowerFeatures from './components/PowerFeatures';
import RepairDashboard from './components/RepairDashboard';
import FixMyProblem from './components/FixMyProblem';
import ToolsHub from './components/ToolsHub';
import LogsCenter from './components/LogsCenter';
<<<<<<< HEAD
import PerformanceMode from './components/PerformanceMode';
import NetworkMonitor from './components/NetworkMonitor';
import StartupManager from './components/StartupManager';
import RepairHistory from './components/RepairHistory';
import BatterySaver from './components/BatterySaver';
import PrivacyCleaner from './components/PrivacyCleaner';
import LargeFileFinder from './components/LargeFileFinder';
import QuickFix from './components/QuickFix';
=======
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
<<<<<<< HEAD
  const [theme, setTheme] = useState(() => localStorage.getItem('solas-theme') || 'dark');
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
    } else {
      root.classList.remove('light-mode');
    }
    localStorage.setItem('solas-theme', theme);
  }, [theme]);

  useEffect(() => {
=======

  useEffect(() => {
    // Check administrator status and system info from Electron
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
    const initApp = async () => {
      try {
        if (window.api) {
          const res = await window.api.isAdmin();
          setIsAdmin(res);
          const info = await window.api.getSystemInfo();
          setSystemInfo(info);
        } else {
<<<<<<< HEAD
=======
          // Fallback for web browser testing
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
          setIsAdmin(true);
        }
      } catch (err) {
        console.error('Failed app init:', err);
      } finally {
        setLoading(false);
      }
    };
    initApp();
  }, []);

<<<<<<< HEAD
  const addNotification = (title, message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'quickfix', label: 'Quick Fixes', icon: Zap },
    { id: 'fix', label: 'Fix My Problem', icon: LifeBuoy },
    { id: 'performance', label: 'Performance', icon: Cpu },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'startup', label: 'Startup', icon: Clock },
    { id: 'battery', label: 'Battery', icon: Battery },
    { id: 'privacy', label: 'Privacy', icon: Eye },
    { id: 'largefiles', label: 'Large Files', icon: Trash2 },
    { id: 'history', label: 'Repair History', icon: BarChart3 },
    { id: 'power', label: 'Power Features', icon: Power },
=======
  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'fix', label: 'Fix My Problem', icon: LifeBuoy },
    { id: 'power', label: 'Power Features', icon: Zap },
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
    { id: 'tools', label: 'Tools', icon: ClipboardList },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <RepairDashboard setActiveTab={setActiveTab} />;
<<<<<<< HEAD
      case 'quickfix':
        return <QuickFix />;
      case 'fix':
        return <FixMyProblem />;
      case 'performance':
        return <PerformanceMode />;
      case 'network':
        return <NetworkMonitor />;
      case 'startup':
        return <StartupManager />;
      case 'battery':
        return <BatterySaver />;
      case 'privacy':
        return <PrivacyCleaner />;
      case 'largefiles':
        return <LargeFileFinder />;
      case 'history':
        return <RepairHistory />;
=======
      case 'fix':
        return <FixMyProblem />;
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
      case 'power':
        return <PowerFeatures />;
      case 'tools':
        return <ToolsHub />;
      case 'logs':
        return <LogsCenter />;
      case 'settings':
<<<<<<< HEAD
        return <SettingsView theme={theme} setTheme={setTheme} />;
=======
        return <SettingsView />;
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
      default:
        return <RepairDashboard setActiveTab={setActiveTab} />;
    }
  };

  const getBreadcrumb = () => {
    const item = navigation.find(n => n.id === activeTab);
    return item ? item.label : 'Dashboard';
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-navy">
        <RefreshCw className="h-8 w-8 animate-spin text-brand-violet" />
      </div>
    );
  }

  return (
<<<<<<< HEAD
    <div className="flex h-screen w-screen overflow-hidden bg-brand-navy font-sans text-white transition-colors duration-300">
      {/* Notifications */}
      <AnimatePresence>
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`glass-panel border rounded-xl p-4 shadow-lg flex items-start gap-3 ${
                  notif.type === 'success' ? 'border-emerald-500/30 bg-emerald-950/20' :
                  notif.type === 'error' ? 'border-rose-500/30 bg-rose-950/20' :
                  notif.type === 'warning' ? 'border-amber-500/30 bg-amber-950/20' :
                  'border-brand-violet/30 bg-brand-violet/10'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  {notif.type === 'success' && <span className="text-lg">✅</span>}
                  {notif.type === 'error' && <span className="text-lg">❌</span>}
                  {notif.type === 'warning' && <span className="text-lg">⚠️</span>}
                  {notif.type === 'info' && <span className="text-lg">ℹ️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-100">{notif.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{notif.message}</p>
                </div>
                <button
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                  className="shrink-0 text-slate-500 hover:text-white text-lg leading-none"
                >
                  ×
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-brand-border flex flex-col justify-between p-4 select-none overflow-y-auto">
=======
    <div className="flex h-screen w-screen overflow-hidden bg-brand-navy font-sans text-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-brand-border flex flex-col justify-between p-4 select-none">
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
        <div>
          {/* Logo Section */}
          <div className="flex items-center gap-3 px-2 py-4 mb-6">
            <Zap className="h-8 w-8 text-brand-violet animate-pulse" />
            <div>
              <h1 className="text-lg font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-brand-violet to-brand-cyan">
                SOLAS PRO
              </h1>
              <p className="text-[10px] text-slate-400 font-medium">Windows Repair Center</p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    isActive 
                      ? 'bg-gradient-to-r from-brand-violet/20 to-brand-cyan/10 border-l-4 border-brand-violet text-white shadow-md' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? 'text-brand-violet' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Area with Privilege Badge */}
<<<<<<< HEAD
        <div className="border-t border-brand-border pt-4 space-y-3">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>

=======
        <div className="border-t border-brand-border pt-4">
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isAdmin ? 'bg-emerald-950/30 border border-emerald-500/20' : 'bg-rose-950/30 border border-rose-500/20'}`}>
            {isAdmin ? (
              <ShieldCheck className="h-5 w-5 text-brand-success shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-brand-danger shrink-0" />
            )}
            <div className="truncate">
              <p className="text-[11px] font-bold text-slate-300">PRIVILEGES</p>
              <p className={`text-[10px] font-semibold ${isAdmin ? 'text-brand-success' : 'text-brand-danger'}`}>
                {isAdmin ? 'Administrator Mode' : 'Standard User'}
              </p>
            </div>
          </div>
<<<<<<< HEAD
          <p className="text-[10px] text-slate-500 text-center mt-3 font-medium">Solas Care Pro v3.0.0</p>
=======
          <p className="text-[10px] text-slate-500 text-center mt-3 font-medium">Solas Care Pro v2.0.0</p>
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
        </div>
      </aside>

      {/* Main Panel Content Area */}
<<<<<<< HEAD
      <main className="flex-1 flex flex-col min-w-0 bg-brand-navy transition-colors duration-300">
=======
      <main className="flex-1 flex flex-col min-w-0 bg-brand-navy">
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
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

        {/* Body View Host */}
<<<<<<< HEAD
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-brand-navy via-slate-900 to-brand-navy transition-colors duration-300">
=======
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-brand-navy via-slate-900 to-brand-navy">
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
