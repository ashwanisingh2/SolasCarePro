import React, { useState, useEffect } from 'react';
import {
  Zap, Loader2, CheckCircle2, ShieldCheck, RefreshCw, XCircle,
  FolderOpen, Network, Shield, HardDrive, Terminal, AlertTriangle, Play,
  Wifi, Cpu, BarChart3, Clock, Trash2, Settings as SettingsIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import PerformanceMode from './PerformanceMode';
import BatterySaver from './BatterySaver';
import PrivacyCleaner from './PrivacyCleaner';
import RepairHistory from './RepairHistory';
import StartupManager from './StartupManager';
import LargeFileFinder from './LargeFileFinder';
import NetworkMonitor from './NetworkMonitor';

export default function PowerFeatures() {
  const [activeSubTab, setActiveSubTab] = useState('performance');
  const [currentMode, setCurrentMode] = useState('work');

  const subTabs = [
    { id: 'performance', label: 'Performance Mode', icon: Zap },
    { id: 'battery', label: 'Battery Saver', icon: BatterySaver },
    { id: 'network', label: 'Network Monitor', icon: Network },
    { id: 'privacy', label: 'Privacy Cleaner', icon: Shield },
    { id: 'startup', label: 'Startup Manager', icon: Clock },
    { id: 'largefiles', label: 'Large File Finder', icon: Trash2 },
    { id: 'history', label: 'Repair History', icon: BarChart3 }
  ];

  const renderContent = () => {
    switch (activeSubTab) {
      case 'performance':
        return <PerformanceMode currentMode={currentMode} onModeChange={setCurrentMode} />;
      case 'battery':
        return <BatterySaver />;
      case 'network':
        return <NetworkMonitor />;
      case 'privacy':
        return <PrivacyCleaner />;
      case 'startup':
        return <StartupManager />;
      case 'largefiles':
        return <LargeFileFinder />;
      case 'history':
        return <RepairHistory />;
      default:
        return <PerformanceMode currentMode={currentMode} onModeChange={setCurrentMode} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub tabs header */}
      <div className="flex border-b border-brand-border overflow-x-auto select-none">
        {subTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2.5 px-6 py-3 border-b-2 text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-brand-violet text-brand-violet'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Panel */}
      <motion.div
        key={activeSubTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="glass-panel border border-brand-border rounded-2xl min-h-[400px]"
      >
        {renderContent()}
      </motion.div>
    </div>
  );
}
