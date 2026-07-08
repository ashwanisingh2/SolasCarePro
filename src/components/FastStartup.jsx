import React from 'react';
import { Clock } from 'lucide-react';
import { PowerTweakCard } from './UltimatePerformance';

export default function FastStartup() {
  return (
    <PowerTweakCard
      title="Fast Startup & Hibernation - Disable"
      description="Disable Windows Fast Startup and Hibernation. Frees up disk space (hiberfil.sys = ~40% of RAM) and ensures clean cold boots. Fixes some driver/update issues that occur due to hybrid shutdown."
      action="disable-hibernation"
      icon={Clock}
      accentColor="amber"
    />
  );
}
