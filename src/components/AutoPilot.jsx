import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, ShieldCheck, RefreshCw, CheckCircle, 
  Trash2, Search, ArrowUpCircle, Wifi, Zap
} from 'lucide-react';

export default function AutoPilot() {
  const [enabled, setEnabled] = useState(false);
  const [selectedDay, setSelectedDay] = useState('Sunday');
  const [selectedTime, setSelectedTime] = useState('03:00');
  const [actions, setActions] = useState({
    junk: true,
    network: true,
    drivers: true,
    sfc: false,
    trim: true
  });
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [statusMessage, setStatusMessage] = useState('Configure auto-pilot task scheduler.');

  // Live Task status information
  const [taskInfo, setTaskInfo] = useState({ registered: false, state: 'N/A', lastRun: 'N/A', result: 'N/A', highest: false });
  const [testingTask, setTestingTask] = useState(false);

  const checkTaskStatus = async () => {
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('check-task-status');
        if (res.success && res.stdout) {
          const info = JSON.parse(res.stdout.trim());
          setTaskInfo({
            registered: info.Registered,
            state: info.State || 'N/A',
            lastRun: info.LastRunTime || 'N/A',
            result: info.LastTaskResult !== undefined ? (info.LastTaskResult === 0 ? 'Success' : 'Failed (' + info.LastTaskResult + ')') : 'N/A',
            highest: info.HighestPrivilege || false
          });
          setEnabled(info.Registered);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkTaskStatus();
    const interval = setInterval(checkTaskStatus, 15000); // Poll status every 15s
    return () => clearInterval(interval);
  }, []);

  // Weekdays array
  const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Handle countdown calculation
  useEffect(() => {
    if (!enabled) return;

    const calculateCountdown = () => {
      const now = new Date();
      const targetDayIdx = weekdays.indexOf(selectedDay);
      let nowDayIdx = now.getDay() - 1; // getDay: Sun=0, Mon=1
      if (nowDayIdx < 0) nowDayIdx = 6; // map to Mon=0, Sun=6

      // Parse target time
      const [tHour, tMin] = selectedTime.split(':').map(Number);
      
      const target = new Date();
      target.setHours(tHour, tMin, 0, 0);

      // Find days difference
      let daysDiff = targetDayIdx - nowDayIdx;
      if (daysDiff < 0 || (daysDiff === 0 && now > target)) {
        daysDiff += 7;
      }

      target.setDate(now.getDate() + daysDiff);

      const diffMs = target.getTime() - now.getTime();
      if (diffMs <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const seconds = Math.floor((diffMs / 1000) % 60);
      const minutes = Math.floor((diffMs / 1000 / 60) % 60);
      const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      setCountdown({ days, hours, minutes, seconds });
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, [enabled, selectedDay, selectedTime]);

  const handleToggle = async () => {
    const nextState = !enabled;
    setStatusMessage('Syncing task with Windows Task Scheduler...');
    try {
      if (window.api) {
        if (nextState) {
          // Register task
          const res = await window.api.runSystemCommand('schedule-care', [selectedDay, selectedTime]);
          if (res.success) {
            await checkTaskStatus();
            setStatusMessage(`Successfully scheduled weekly task on ${selectedDay} at ${selectedTime}.`);
          } else {
            setStatusMessage(`Failed to register task: ${res.stderr || 'Access Denied'}`);
          }
        } else {
          // Unregister task
          const res = await window.api.runSystemCommand('unschedule-care');
          if (res.success) {
            await checkTaskStatus();
            setStatusMessage('Successfully removed task from Windows Task Scheduler.');
          } else {
            setStatusMessage(`Failed to unregister task: ${res.stderr || 'Access Denied'}`);
          }
        }
      } else {
        // Mock UI
        setTimeout(() => {
          setEnabled(nextState);
          setTaskInfo({
            registered: nextState,
            state: nextState ? 'Ready' : 'N/A',
            lastRun: 'N/A',
            result: 'N/A',
            highest: nextState
          });
          setStatusMessage(nextState ? `(Mock) Weekly care enabled: ${selectedDay} at ${selectedTime}` : '(Mock) Weekly care disabled.');
        }, 800);
      }
    } catch (e) {
      console.error(e);
      setStatusMessage('Task Scheduler error: ' + e.message);
    }
  };

  const handleTestRun = async () => {
    setTestingTask(true);
    setStatusMessage('Triggering scheduled care task immediately...');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('start-scheduled-care');
        if (res.success) {
          setStatusMessage('Scheduled task triggered successfully! Running weekly cleanup task in background under SYSTEM context...');
          await checkTaskStatus();
        } else {
          setStatusMessage('Failed to trigger task: ' + res.stderr);
        }
      } else {
        setTimeout(() => {
          setStatusMessage('(Mock) Task triggered successfully.');
          setTaskInfo(prev => ({ ...prev, state: 'Running', lastRun: new Date().toISOString().replace('T', ' ').slice(0, 19) }));
          setTestingTask(false);
        }, 1500);
      }
    } catch (e) {
      setStatusMessage('Error running task: ' + e.message);
    } finally {
      if (window.api) setTestingTask(false);
    }
  };

  const handleActionToggle = (key) => {
    setActions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <section className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200">Auto-Pilot Task Scheduler</h2>
          <p className="text-xs text-slate-400">Configure weekly automated maintenance tasks running under NT AUTHORITY\SYSTEM context</p>
        </div>
      </section>

      {/* Task status display */}
      <section className="glass-panel border border-brand-border rounded-xl px-4 py-3 flex items-center justify-between bg-slate-900/60 text-xs">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-brand-cyan shrink-0" />
          <p className="text-slate-300 font-semibold">{statusMessage}</p>
        </div>

        {/* Enabled Status Indicator Badge */}
        <span className={`px-2.5 py-0.5 font-bold rounded uppercase ${
          enabled ? 'bg-emerald-500/10 border border-emerald-500/20 text-brand-success' : 'bg-rose-500/10 border border-rose-500/20 text-brand-danger'
        }`}>
          {enabled ? 'Active Scheduler' : 'Disabled'}
        </span>
      </section>

      {/* Main Configuration Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Card: Calendar & Day Selector */}
        <div className="md:col-span-2 glass-panel border border-brand-border rounded-2xl p-6 space-y-5 text-left select-none">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-300 uppercase">Select Target Day</h3>
            <span className="text-[10px] text-slate-500 font-bold">WEEKLY TASK POLICY</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {weekdays.map(day => {
              const isSelected = selectedDay === day;
              return (
                <button
                  key={day}
                  disabled={enabled}
                  onClick={() => setSelectedDay(day)}
                  className={`py-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-brand-violet/20 border-brand-violet text-white shadow-md shadow-brand-violet/10' 
                      : 'bg-slate-900 border-brand-border text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Time Picker */}
          <div className="flex flex-col sm:flex-row gap-6 border-t border-brand-border pt-5">
            <div className="flex-1 space-y-2">
              <label className="text-xs text-slate-400 font-bold block uppercase">Select Schedule Time</label>
              <div className="flex gap-2">
                <input
                  type="time"
                  disabled={enabled}
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="bg-slate-900 border border-brand-border rounded-lg text-slate-200 text-sm font-semibold p-2.5 focus:outline-none focus:border-brand-violet select-none"
                />
              </div>
            </div>

            {/* Enable switch button */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end mt-4">
              {enabled && (
                <button
                  disabled={testingTask}
                  onClick={handleTestRun}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-200 cursor-pointer flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {testingTask ? <RefreshCw className="h-4 w-4 animate-spin text-brand-violet" /> : <Zap className="h-4 w-4 text-brand-cyan" />}
                  Test Run Now
                </button>
              )}
              <button
                onClick={handleToggle}
                className={`px-8 py-3 rounded-lg text-xs font-bold shadow-md cursor-pointer transition-all ${
                  enabled 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/10' 
                    : 'bg-brand-violet hover:bg-brand-violet/90 text-white shadow-brand-violet/10'
                }`}
              >
                {enabled ? 'Disable Auto-Pilot' : 'Apply Scheduler Task'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Card: Checklist & Countdown Display */}
        <div className="glass-panel border border-brand-border rounded-2xl p-6 flex flex-col justify-between h-full">
          <div>
            <h3 className="text-sm font-bold text-slate-300 uppercase mb-4 text-left select-none">Include in Care</h3>
            
            <div className="space-y-3.5 text-left">
              {[
                { key: 'junk', label: 'Junk Files Cleaning', icon: Trash2 },
                { key: 'network', label: 'Network Optimizer', icon: Wifi },
                { key: 'drivers', label: 'Driver Diagnostics', icon: Search },
                { key: 'sfc', label: 'System Files Verify (SFC)', icon: RefreshCw },
                { key: 'trim', label: 'Solid-State Volume TRIM', icon: Zap }
              ].map(item => {
                const Icon = item.icon;
                return (
                  <label key={item.key} className="flex justify-between items-center cursor-pointer select-none">
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-300">{item.label}</span>
                    </div>
                    <input
                      type="checkbox"
                      disabled={enabled}
                      checked={actions[item.key]}
                      onChange={() => handleActionToggle(item.key)}
                      className="h-4.5 w-4.5 rounded border-brand-border bg-slate-900 accent-brand-violet"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Countdown Clock Display */}
          <div className="border-t border-brand-border pt-5 mt-6 select-none">
            <h4 className="text-[10px] text-slate-500 font-bold uppercase text-center mb-3">Next Execution Countdown</h4>
            {enabled ? (
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-900 border border-brand-border p-2 rounded-lg">
                  <span className="text-lg font-black text-white">{countdown.days}</span>
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Days</span>
                </div>
                <div className="bg-slate-900 border border-brand-border p-2 rounded-lg">
                  <span className="text-lg font-black text-white">{countdown.hours}</span>
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Hrs</span>
                </div>
                <div className="bg-slate-900 border border-brand-border p-2 rounded-lg">
                  <span className="text-lg font-black text-white">{countdown.minutes}</span>
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Mins</span>
                </div>
                <div className="bg-slate-900 border border-brand-border p-2 rounded-lg">
                  <span className="text-lg font-black text-white">{countdown.seconds}</span>
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">Secs</span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950/40 p-4 border border-brand-border rounded-xl text-center">
                <Clock className="h-5 w-5 text-slate-600 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500 font-bold uppercase">Scheduler Idle</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Live Windows Task Scheduler Diagnostics */}
      <section className="glass-panel border border-brand-border rounded-2xl p-6 text-left select-none space-y-4">
        <h3 className="text-sm font-bold text-slate-300 uppercase">Task Scheduler Diagnostics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-slate-900/60 border border-brand-border rounded-xl">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Registry Task State</span>
            <span className={`text-sm font-black mt-1 block uppercase ${
              taskInfo.registered ? 'text-brand-success' : 'text-slate-400'
            }`}>
              {taskInfo.registered ? `Registered (${taskInfo.state})` : 'Not Found'}
            </span>
          </div>

          <div className="p-4 bg-slate-900/60 border border-brand-border rounded-xl">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">System Run Level</span>
            <span className={`text-sm font-black mt-1 block uppercase ${
              taskInfo.highest ? 'text-brand-cyan' : 'text-slate-400'
            }`}>
              {taskInfo.highest ? 'SYSTEM (Highest RunLevel)' : 'Standard User'}
            </span>
          </div>

          <div className="p-4 bg-slate-900/60 border border-brand-border rounded-xl">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Last Execution Time</span>
            <span className="text-sm font-black text-white mt-1 block font-mono">{taskInfo.lastRun}</span>
          </div>

          <div className="p-4 bg-slate-900/60 border border-brand-border rounded-xl">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">Last Run Result</span>
            <span className={`text-sm font-black mt-1 block uppercase ${
              taskInfo.result === 'Success' ? 'text-brand-success' : taskInfo.result.includes('Failed') ? 'text-brand-danger' : 'text-slate-400'
            }`}>
              {taskInfo.result}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
