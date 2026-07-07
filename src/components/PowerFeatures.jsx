import React, { useState } from 'react';
import {
  Zap, Cpu, Clock, Battery, Server, Wifi, Shield, Trash2, ClipboardList
} from 'lucide-react';
import { motion } from 'framer-motion';

import PerformanceMode from './PerformanceMode';
import BatterySaver from './BatterySaver';
import UltimatePerformance from './UltimatePerformance';
import CoreParking from './CoreParking';
import FastStartup from './FastStartup';
import AdvancedPowerTweaks from './AdvancedPowerTweaks';
import NetworkMonitor from './NetworkMonitor';
import PrivacyCleaner from './PrivacyCleaner';
import StartupManager from './StartupManager';
import LargeFileFinder from './LargeFileFinder';
import HistoryLogs from './HistoryLogs';

export default function PowerFeatures({ activeSubTab: propActiveSubTab, setActiveSubTab: propSetActiveTab }) {
  const [internalSubTab, setInternalSubTab] = useState('performance');

  const activeSubTab = propActiveSubTab || internalSubTab;
  const setActiveSubTab = propSetActiveTab || setInternalSubTab;

  const subTabs = [
    { id: 'performance',    label: 'Performance Mode',   icon: Cpu },
    { id: 'battery',        label: 'Battery Saver',      icon: Battery },
    { id: 'ultimate',       label: 'Ultimate Performance',icon: Zap },
    { id: 'coreparking',    label: 'CPU Core Parking',   icon: Cpu },
    { id: 'faststartup',    label: 'Fast Startup',       icon: Clock },
    { id: 'advancedtweaks', label: 'Advanced Tweaks',    icon: Server },
    { id: 'network',        label: 'Network Monitor',    icon: Wifi },
    { id: 'privacy',        label: 'Privacy Cleaner',    icon: Shield },
    { id: 'startup',        label: 'Startup Manager',    icon: Clock },
    { id: 'largefiles',     label: 'Large Files',        icon: Trash2 },
    { id: 'history',        label: 'Repair History',     icon: ClipboardList },
  ];

  const renderContent = () => {
    switch (activeSubTab) {
      case 'performance':    return <PerformanceMode />;
      case 'battery':        return <BatterySaver />;
      case 'ultimate':       return <UltimatePerformance />;
      case 'coreparking':    return <CoreParking />;
      case 'faststartup':    return <FastStartup />;
      case 'advancedtweaks': return <AdvancedPowerTweaks />;
      case 'network':        return <NetworkMonitor />;
      case 'privacy':        return <PrivacyCleaner />;
      case 'startup':        return <StartupManager />;
      case 'largefiles':     return <LargeFileFinder />;
      case 'history':        return <HistoryLogs />;
      default:               return <PerformanceMode />;
    }
  };

  return (
    <div className="flex flex-col h-full text-left">
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-brand-border select-none">
        <h2 className="text-lg font-bold text-slate-200">Power Features & Tuning</h2>
        <p className="text-xs text-slate-400">Performance, power, network, privacy, and history tools</p>
      </div>

      {/* Tabs navigation + Content Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar for Tabs */}
        <div className="w-48 border-r border-brand-border bg-slate-900/50 p-4 space-y-1 overflow-y-auto select-none shrink-0">
          {subTabs.map(t => {
            const Icon = t.icon;
            const active = activeSubTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveSubTab(t.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  active ? 'bg-brand-violet text-white shadow' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-brand-violet'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-brand-navy">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
