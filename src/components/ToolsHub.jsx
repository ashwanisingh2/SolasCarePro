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
