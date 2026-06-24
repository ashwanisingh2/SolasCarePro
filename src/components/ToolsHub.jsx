import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Settings, Globe, ShieldCheck, ShieldAlert,
  Monitor, RefreshCw, Download, HardDrive, Network,
  Cpu, HardDriveIcon as HardDriveFilled, Wifi, Battery,
  Eye, Timer, CheckCircle2, XCircle, Play, Trash2,
  Clock, FileText, LayoutDashboard, LifeBuoy, Wrench
} from 'lucide-react';
import { useSystemMetrics } from '../context/SystemMetricsContext';

import QuickFix from './QuickFix';
import NetworkMonitor from './NetworkMonitor';
import StartupManager from './StartupManager';
import LogsCenter from './LogsCenter';
import BatterySaver from './BatterySaver';
import PrivacyCleaner from './PrivacyCleaner';
import LargeFileFinder from './LargeFileFinder';
import PerformanceMode from './PerformanceMode';
import DriverManager from './DriverManager';
import SoftwareUpdater from './SoftwareUpdater';
import FixMyProblem from './FixMyProblem';

export default function ToolsHub({ activeSubTab: propActiveTab, setActiveSubTab: propSetActiveTab }) {
  const [internalActiveTab, setInternalActiveTab] = useState('dashboard');
  const { systemMetrics, loading, refresh } = useSystemMetrics();

  const activeTab = propActiveTab || internalActiveTab;
  const setActiveTab = propSetActiveTab || setInternalActiveTab;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'quickfix', label: 'Quick Fixes', icon: Zap },
    { id: 'fix', label: 'Guided Repair', icon: LifeBuoy },
    { id: 'performance', label: 'Performance Mode', icon: Cpu },
    { id: 'network', label: 'Network Monitor', icon: Wifi },
    { id: 'startup', label: 'Startup Manager', icon: Timer },
    { id: 'battery', label: 'Battery Saver', icon: Battery },
    { id: 'privacy', label: 'Privacy Cleaner', icon: Eye },
    { id: 'largefiles', label: 'Large File Finder', icon: Trash2 },
    { id: 'drivers', label: 'Driver Manager', icon: HardDrive },
    { id: 'updater', label: 'Software Updater', icon: RefreshCw },
    { id: 'logs', label: 'Logs Center', icon: Clock },
  ];

  const renderContent = () => {
    switch (activeTab) {
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
      case 'drivers':
        return <DriverManager />;
      case 'updater':
        return <SoftwareUpdater />;
      case 'logs':
        return <LogsCenter />;
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <ToolCard
                title="Quick Fixes"
                desc="One-click solutions for common problems"
                icon={Zap}
                color="violet"
                onClick={() => setActiveTab('quickfix')}
              />
              <ToolCard
                title="Guided Repair"
                desc="Inspect system symptoms and apply targeted fixes"
                icon={LifeBuoy}
                color="orange"
                onClick={() => setActiveTab('fix')}
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
                title="Driver Manager"
                desc="Backup, restore and manage device drivers"
                icon={HardDrive}
                color="teal"
                onClick={() => setActiveTab('drivers')}
              />
              <ToolCard
                title="Software Updater"
                desc="Update installed software and system components"
                icon={RefreshCw}
                color="cyan"
                onClick={() => setActiveTab('updater')}
              />
              <ToolCard
                title="Logs Center"
                desc="View past maintenance operations and diagnostics"
                icon={Clock}
                color="violet"
                onClick={() => setActiveTab('logs')}
              />
            </div>
          </div>
        );
    }
  };

  const currentTab = tabs.find(t => t.id === activeTab);
  const Icon = currentTab?.icon || LayoutDashboard;

  return (
    <div className="flex flex-col h-full text-left">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border select-none">
        <div className="flex items-center gap-3">
          <Icon className="h-6 w-6 text-brand-violet animate-pulse" />
          <div>
            <h2 className="text-lg font-bold text-slate-200">{currentTab?.label || 'Tools Hub'}</h2>
            <p className="text-xs text-slate-400">System utilities and tools</p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded-lg text-xs font-bold text-slate-300 cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 bg-slate-900/50 border-r border-brand-border p-3 overflow-y-auto shrink-0 select-none">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all mb-1 text-left cursor-pointer ${
                  isActive
                    ? 'bg-brand-violet/20 text-brand-violet border-l-2 border-brand-violet font-bold'
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
          className="flex-1 overflow-y-auto bg-slate-950/20"
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
    <div className={`glass-panel border border-brand-border rounded-xl p-4 flex items-center gap-3 select-none`}>
      <div className={`w-10 h-10 rounded-lg ${colors[color] || colors.violet} flex items-center justify-center`}>
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
      className={`glass-panel border bg-gradient-to-br rounded-2xl p-6 text-left transition-all cursor-pointer group ${colors[color] || colors.violet}`}
    >
      <Icon className="h-7 w-7 mb-3 group-hover:scale-110 transition-transform" />
      <h4 className="text-sm font-bold text-slate-200 mb-1">{title}</h4>
      <p className="text-[10px] text-slate-400 leading-normal">{desc}</p>
    </button>
  );
}

