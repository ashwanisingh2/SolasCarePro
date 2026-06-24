import React, { useState } from 'react';
import {
  Zap, Cpu, Wifi, Shield, Clock, Trash2, Calendar, ClipboardList
} from 'lucide-react';
import { motion } from 'framer-motion';

import PerformanceMode from './PerformanceMode';
import BatterySaver from './BatterySaver';
import NetworkMonitor from './NetworkMonitor';
import PrivacyCleaner from './PrivacyCleaner';
import StartupManager from './StartupManager';
import LargeFileFinder from './LargeFileFinder';
import HistoryLogs from './HistoryLogs';

export default function PowerFeatures({ activeSubTab: propActiveSubTab, setActiveSubTab: propSetActiveSubTab }) {
  const [internalSubTab, setInternalSubTab] = useState('performance');
  
  const activeSubTab = propActiveSubTab || internalSubTab;
  const setActiveSubTab = propSetActiveSubTab || setInternalSubTab;

  const subTabs = [
    { id: 'performance', label: 'Performance Mode', icon: Cpu },
    { id: 'battery', label: 'Battery Saver', icon: BatterySaver }, // Wait, icon is a React component, let's use the component or a Lucide icon. Lucide Battery fits.
    { id: 'network', label: 'Network Monitor', icon: Wifi },
    { id: 'privacy', label: 'Privacy Cleaner', icon: Shield },
    { id: 'startup', label: 'Startup Manager', icon: Clock },
    { id: 'largefiles', label: 'Large File Finder', icon: Trash2 },
    { id: 'history', label: 'Repair History & Logs', icon: ClipboardList }
  ];

  const renderContent = () => {
    switch (activeSubTab) {
      case 'performance':
        return <PerformanceMode />;
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
        return <HistoryLogs />;
      default:
        return <PerformanceMode />;
    }
  };

  return (
    <div className="flex flex-col h-full text-left">
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-brand-border select-none">
        <h2 className="text-lg font-bold text-slate-200">Power Features & Tuning</h2>
        <p className="text-xs text-slate-400">Optimize, clean, monitor and view logs for your Windows installation</p>
      </div>

      {/* Tabs navigation + Content Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sub-sidebar */}
        <div className="w-56 bg-slate-900/50 border-r border-brand-border p-3 overflow-y-auto shrink-0 select-none">
          {subTabs.map(tab => {
            const TabIcon = tab.id === 'battery' ? Zap : tab.icon; // Lucide Battery or Zap
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all mb-1 text-left cursor-pointer ${
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

        {/* Sub-view Content panel */}
        <motion.div
          key={activeSubTab}
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
          className="flex-1 overflow-y-auto bg-slate-950/20"
        >
          {renderContent()}
        </motion.div>
      </div>
    </div>
  );
}
