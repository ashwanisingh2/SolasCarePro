import React from 'react';
import { Cpu } from 'lucide-react';
import { PowerTweakCard } from './UltimatePerformance';

export default function CoreParking() {
  return (
    <PowerTweakCard
      title="CPU Core Parking - Disable"
      description="Disable CPU core parking so all cores remain active at all times. Reduces latency for bursty workloads (gaming, builds, VMs). Slightly increases idle power draw."
      action="unpark-cores"
      icon={Cpu}
      accentColor="cyan"
    />
  );
}
