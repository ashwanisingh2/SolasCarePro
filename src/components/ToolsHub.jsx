<<<<<<< HEAD
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Settings, Sun, Moon, Globe,
  Bell, BellRing, BellOff, ShieldCheck, ShieldAlert,
  Monitor, RefreshCw, Download, HardDrive, Network,
  Cpu, HardDriveIcon as HardDriveFilled, Wifi, Battery, BatteryCharging,
  Eye, EyeOff, Timer, CheckCircle2, XCircle, Play, Trash2,
  BarChart3, Clock, FolderOpen, FileText, Terminal, Activity,
  Search, AlertTriangle, Info, LayoutDashboard, LifeBuoy, ClipboardList,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import QuickFix from './QuickFix';
import NetworkMonitor from './NetworkMonitor';
import StartupManager from './StartupManager';
import RepairHistory from './RepairHistory';
import BatterySaver from './BatterySaver';
import PrivacyCleaner from './PrivacyCleaner';
import LargeFileFinder from './LargeFileFinder';
import PerformanceMode from './PerformanceMode';

export default function ToolsHub() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      if (window.api) {
        const metrics = await window.api.getSystemMetrics();
        setSystemMetrics(metrics);
      } else {
        setSystemMetrics({
          cpu: 34.5,
          ram: 62.3,
          disk: 48.7,
          netSpeed: 1024000
        });
      }
    } catch (e) {
      console.error('Failed to load metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'quickfix', label: 'Quick Fixes', icon: Zap },
    { id: 'performance', label: 'Performance', icon: Cpu },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'startup', label: 'Startup', icon: Timer },
    { id: 'battery', label: 'Battery', icon: Battery },
    { id: 'privacy', label: 'Privacy', icon: Eye },
    { id: 'largefiles', label: 'Large Files', icon: Trash2 },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'quickfix':
        return <QuickFix />;
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
      case 'settings':
        return <div className="p-6 text-center text-slate-400">Settings available in the main Settings tab</div>;
      case 'dashboard':
      default:
        return (
          <div className="p-6 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="CPU Usage"
                value={systemMetrics?.cpu ? `${systemMetrics.cpu}%` : 'N/A'}
                icon={Cpu}
                color="violet"
              />
              <StatCard
                label="RAM Usage"
                value={systemMetrics?.ram ? `${systemMetrics.ram}%` : 'N/A'}
                icon={HardDriveFilled}
                color="cyan"
              />
              <StatCard
                label="Disk Usage"
                value={systemMetrics?.disk ? `${systemMetrics.disk}%` : 'N/A'}
                icon={HardDrive}
                color="emerald"
              />
              <StatCard
                label="Network"
                value={systemMetrics?.netSpeed ? `${(systemMetrics.netSpeed / 1024).toFixed(1)} KB/s` : 'N/A'}
                icon={Network}
                color="pink"
              />
            </div>

            {/* Quick Access Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ToolCard
                title="Quick Fixes"
                desc="One-click solutions for common problems"
                icon={Zap}
                color="violet"
                onClick={() => setActiveTab('quickfix')}
              />
              <ToolCard
                title="Performance Mode"
                desc="Gaming, Work, Power Saving profiles"
                icon={Cpu}
                color="cyan"
                onClick={() => setActiveTab('performance')}
              />
              <ToolCard
                title="Network Monitor"
                desc="Real-time speed and connection tracking"
                icon={Wifi}
                color="emerald"
                onClick={() => setActiveTab('network')}
              />
              <ToolCard
                title="Startup Manager"
                desc="Control apps running at boot"
                icon={Timer}
                color="pink"
                onClick={() => setActiveTab('startup')}
              />
              <ToolCard
                title="Battery Saver"
                desc="Extend battery life on laptops"
                icon={Battery}
                color="amber"
                onClick={() => setActiveTab('battery')}
              />
              <ToolCard
                title="Privacy Cleaner"
                desc="Clear browser data and system traces"
                icon={Eye}
                color="rose"
                onClick={() => setActiveTab('privacy')}
              />
              <ToolCard
                title="Large File Finder"
                desc="Find and delete space-hogging files"
                icon={Trash2}
                color="orange"
                onClick={() => setActiveTab('largefiles')}
              />
              <ToolCard
                title="Repair History"
                desc="View past maintenance operations"
                icon={Clock}
                color="teal"
                onClick={() => setActiveTab('history')}
              />
            </div>
          </div>
        );
    }
  };

  const currentTab = tabs.find(t => t.id === activeTab);
  const Icon = currentTab?.icon || LayoutDashboard;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 text-brand-violet" />
          <div>
            <h2 className="text-lg font-bold text-slate-200">{currentTab?.label || 'Tools Hub'}</h2>
            <p className="text-xs text-slate-400">System utilities and tools</p>
          </div>
        </div>
        <button
          onClick={loadMetrics}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded-lg text-xs font-bold text-slate-300 cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-slate-900/50 border-r border-brand-border p-3 overflow-y-auto">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all mb-1 text-left ${
                  isActive
                    ? 'bg-brand-violet/20 text-brand-violet border-l-2 border-brand-violet'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <TabIcon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 overflow-y-auto"
        >
          {renderContent()}
        </motion.div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  };

  return (
    <div className={`glass-panel border rounded-xl p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-lg ${colors[color]} flex items-center justify-center`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-bold">{label}</p>
        <p className="text-lg font-black text-slate-200">{value}</p>
      </div>
    </div>
  );
}

function ToolCard({ title, desc, icon: Icon, color, onClick }) {
  const colors = {
    violet: 'from-violet-500/20 to-violet-500/5 hover:from-violet-500/30 hover:to-violet-500/10 border-violet-500/20 text-violet-400',
    cyan: 'from-cyan-500/20 to-cyan-500/5 hover:from-cyan-500/30 hover:to-cyan-500/10 border-cyan-500/20 text-cyan-400',
    emerald: 'from-emerald-500/20 to-emerald-500/5 hover:from-emerald-500/30 hover:to-emerald-500/10 border-emerald-500/20 text-emerald-400',
    pink: 'from-pink-500/20 to-pink-500/5 hover:from-pink-500/30 hover:to-pink-500/10 border-pink-500/20 text-pink-400',
    amber: 'from-amber-500/20 to-amber-500/5 hover:from-amber-500/30 hover:to-amber-500/10 border-amber-500/20 text-amber-400',
    rose: 'from-rose-500/20 to-rose-500/5 hover:from-rose-500/30 hover:to-rose-500/10 border-rose-500/20 text-rose-400',
    orange: 'from-orange-500/20 to-orange-500/5 hover:from-orange-500/30 hover:to-orange-500/10 border-orange-500/20 text-orange-400',
    teal: 'from-teal-500/20 to-teal-500/5 hover:from-teal-500/30 hover:to-teal-500/10 border-teal-500/20 text-teal-400',
  };

  return (
    <button
      onClick={onClick}
      className={`glass-panel border bg-gradient-to-br rounded-2xl p-6 text-left transition-all cursor-pointer group ${colors[color]}`}
    >
      <Icon className="h-7 w-7 mb-3 group-hover:scale-110 transition-transform" />
      <h4 className="text-sm font-bold text-slate-200 mb-1">{title}</h4>
      <p className="text-[10px] text-slate-400">{desc}</p>
    </button>
  );
}
=======
import React, { useState } from 'react';
import {
  AppWindow,
  CalendarClock,
  ClipboardList,
  Database,
  Download,
  FileClock,
  Gauge,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Terminal,
  Wrench,
} from 'lucide-react';
import SoftwareUpdater from './SoftwareUpdater';

const tools = [
  ['Autoruns Manager', 'Review auto-start entries using Task Manager startup tools', Settings2, 'open-autoruns-manager'],
  ['Startup Manager', 'Open Windows startup app manager', Gauge, 'open-startup-manager'],
  ['Installed Programs Manager', 'Open Programs and Features for app repair/uninstall', AppWindow, 'open-installed-programs'],
  ['Driver Information', 'Open Device Manager for driver inspection', HardDrive, 'open-driver-information'],
  ['Service Manager', 'Open Windows Services console', Database, 'open-service-manager'],
  ['Scheduled Tasks Manager', 'Open Task Scheduler', CalendarClock, 'open-scheduled-tasks'],
  ['Event Viewer Shortcut', 'Open Event Viewer', ClipboardList, 'open-event-viewer'],
  ['Reliability Monitor Shortcut', 'Open Reliability Monitor', FileClock, 'open-reliability-monitor'],
];

export default function ToolsHub() {
  const [activeTool, setActiveTool] = useState(null);
  const [toolStatus, setToolStatus] = useState('Support tools ready.');
  const [driverFolder, setDriverFolder] = useState('');
  const [packageId, setPackageId] = useState('');
  const [packageSource, setPackageSource] = useState('winget');

  const runTool = async (label, commandKey) => {
    setActiveTool(commandKey);
    setToolStatus(`Opening ${label}...`);
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand(commandKey)
        : { success: true };
      setToolStatus(result.success ? `${label} opened successfully.` : result.error || `${label} failed.`);
    } catch (error) {
      setToolStatus(error.message);
    } finally {
      setActiveTool(null);
    }
  };

  const installDriverSource = async () => {
    if (!driverFolder.trim()) {
      setToolStatus('Enter a local driver folder path containing INF files.');
      return;
    }
    setActiveTool('install-driver-source');
    setToolStatus('Installing driver package from local source...');
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand('install-driver-source', [driverFolder.trim()])
        : { success: true };
      setToolStatus(result.success ? 'Driver source install completed.' : result.error || 'Driver install failed.');
    } catch (error) {
      setToolStatus(error.message);
    } finally {
      setActiveTool(null);
    }
  };

  const installAppSource = async () => {
    if (!packageId.trim()) {
      setToolStatus('Enter a Winget package id, for example Google.Chrome.');
      return;
    }
    setActiveTool('install-software-source');
    setToolStatus('Installing application from selected source...');
    try {
      const result = window.api?.runSystemCommand
        ? await window.api.runSystemCommand('install-software-source', [packageId.trim(), packageSource.trim() || 'winget'])
        : { success: true };
      setToolStatus(result.success ? 'Application source install completed.' : result.error || 'Application install failed.');
    } catch (error) {
      setToolStatus(error.message);
    } finally {
      setActiveTool(null);
    }
  };

  return (
    <div className="p-6 space-y-6 text-left">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100">Tools</h2>
          <p className="text-xs font-semibold text-slate-500">
            Support-engineer shortcuts plus a better integrated Software Updater.
          </p>
        </div>
        <div className="rounded-xl border border-brand-border bg-slate-950/40 px-4 py-3 text-xs font-bold text-slate-300">
          {toolStatus}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tools.map(([label, description, Icon, commandKey]) => (
          <button
            key={commandKey}
            disabled={activeTool !== null}
            onClick={() => runTool(label, commandKey)}
            className="group min-h-[140px] rounded-2xl border border-brand-border bg-slate-950/30 p-5 text-left transition hover:border-cyan-400/40 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="mb-4 flex items-center justify-between">
              <Icon className="h-6 w-6 text-cyan-300" />
              {activeTool === commandKey ? (
                <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              ) : (
                <Play className="h-4 w-4 text-slate-600 group-hover:text-cyan-300" />
              )}
            </div>
            <h3 className="text-sm font-black text-slate-100">{label}</h3>
            <p className="mt-2 text-xs font-medium text-slate-500">{description}</p>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-brand-border bg-slate-950/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-2">
              <HardDrive className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-100">Driver Update / Install From Source</h3>
              <p className="text-xs font-semibold text-slate-500">
                Install signed driver INF packages from a local extracted driver folder.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={driverFolder}
              onChange={(e) => setDriverFolder(e.target.value)}
              placeholder="C:\\Drivers\\RealtekAudio"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-cyan-400"
            />
            <button
              disabled={activeTool !== null}
              onClick={installDriverSource}
              className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeTool === 'install-driver-source' ? 'Installing...' : 'Install Driver'}
            </button>
          </div>
          <p className="mt-3 text-[11px] font-medium text-slate-500">
            Uses `pnputil /add-driver *.inf /subdirs /install` through the secure command registry.
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-slate-950/30 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2">
              <Download className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-100">Application Update / Install From Source</h3>
              <p className="text-xs font-semibold text-slate-500">
                Install apps by package id from Winget or another configured source.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_130px_auto]">
            <input
              value={packageId}
              onChange={(e) => setPackageId(e.target.value)}
              placeholder="Google.Chrome"
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-emerald-400"
            />
            <input
              value={packageSource}
              onChange={(e) => setPackageSource(e.target.value)}
              placeholder="winget"
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 outline-none focus:border-emerald-400"
            />
            <button
              disabled={activeTool !== null}
              onClick={installAppSource}
              className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeTool === 'install-software-source' ? 'Installing...' : 'Install App'}
            </button>
          </div>
          <p className="mt-3 text-[11px] font-medium text-slate-500">
            Existing Software Updater below handles scan/update of installed applications.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-border bg-slate-950/20">
        <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2">
              <Download className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-100">Software Updater</h3>
              <p className="text-xs font-semibold text-slate-500">Winget upgrades, source repair, DNS fix and live install logs.</p>
            </div>
          </div>
          <RefreshCw className="h-5 w-5 text-slate-500" />
        </div>
        <SoftwareUpdater compact />
      </section>
    </div>
  );
}
>>>>>>> ef9ba8c2986cbdc90189fe151417237d1c2946af
