import React from 'react';
import { Server } from 'lucide-react';
import { PowerTweakCard } from './UltimatePerformance';

export default function AdvancedPowerTweaks() {
  return (
    <PowerTweakCard
      title="Advanced I/O Power Tweaks"
      description="Disable PCIe Link State Power Management and USB Selective Suspend on the active power plan. Maximizes I/O performance for storage and USB devices. May slightly increase power draw."
      action="advanced-tweaks"
      icon={Server}
      accentColor="violet"
    />
  );
}
