import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Zap, Settings, 
  ShieldAlert, ShieldCheck, RefreshCw, LifeBuoy, ClipboardList, FileText,
  Sun, Moon, Cpu, Wifi, Clock, Battery, Eye, Trash2, BarChart3, Power
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useTheme } from './context/ThemeContext';
import SettingsView from './components/Settings';
import RepairDashboard from './components/RepairDashboard';
import ToolsHub from './components/ToolsHub';
import LogsCenter from './components/LogsCenter';
import OneClickCare from './components/OneClickCare';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toolsSubTab, setToolsSubTab] = useState('dashboard');
  const [isAdmin, setIsAdmin] = useState(false);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    // Check administrator status and system info from Electron
    const initApp = async () => {
      try {
        if (window.api) {
          const res = await window.api.isAdmin();
          setIsAdmin(res);
          const info = await window.api.getSystemInfo();
          setSystemInfo(info);
        } else {
          // Fallback for web browser testing
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

  const handleSetActiveTab = (tabId) => {
    if (tabId === 'fix') {
      setActiveTab('tools');
      setToolsSubTab('fix');
    } else if (tabId === 'drivers') {
      setActiveTab('tools');
      setToolsSubTab('drivers');
    } else if (tabId === 'power') {
      setActiveTab('tools');
      setToolsSubTab('performance');
    } else if ([
      'performance', 'network', 'startup', 'battery', 
      'privacy', 'largefiles', 'quickfix'
    ].includes(tabId)) {
      setActiveTab('tools');
      setToolsSubTab(tabId);
    } else if (tabId === 'history') {
      setActiveTab('tools');
      setToolsSubTab('logs');
    } else {
      setActiveTab(tabId);
    }
  };

  const navigation = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'care', label: 'One-Click Care', icon: ShieldCheck },
    { id: 'tools', label: 'Tools Hub', icon: ClipboardList },
    { id: 'logs', label: 'Logs Center', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <RepairDashboard setActiveTab={handleSetActiveTab} />;
      case 'care':
        return <OneClickCare />;
      case 'tools':
        return <ToolsHub activeSubTab={toolsSubTab} setActiveSubTab={setToolsSubTab} />;
      case 'logs':
        return <LogsCenter />;
      case 'settings':
        return <SettingsView />;
      default:
        return <RepairDashboard setActiveTab={handleSetActiveTab} />;
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
    <div className="flex h-screen w-screen overflow-hidden bg-brand-navy font-sans text-white transition-colors duration-300">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 border-r border-brand-border flex flex-col justify-between p-4 select-none overflow-y-auto shrink-0">
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
                  onClick={() => handleSetActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer ${
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
        <div className="border-t border-brand-border pt-4 space-y-3">
          {/* Theme Toggle */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>
          <div className={`flex items-center gap-3 px-3 py-2 rounded-lg ${isAdmin ? 'bg-emerald-950/30 border border-emerald-500/20' : 'bg-rose-950/30 border border-rose-500/20'}`}>
            {isAdmin ? (
              <ShieldCheck className="h-5 w-5 text-brand-success shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-brand-danger shrink-0" />
            )}
            <div className="truncate text-left">
              <p className="text-[11px] font-bold text-slate-300">PRIVILEGES</p>
              <p className={`text-[10px] font-semibold ${isAdmin ? 'text-brand-success' : 'text-brand-danger'}`}>
                {isAdmin ? 'Administrator Mode' : 'Standard User'}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 text-center mt-3 font-medium">Solas Care Pro v3.0.0</p>
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

        {/* Body View Host */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-brand-navy via-slate-900 to-brand-navy transition-colors duration-300">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
