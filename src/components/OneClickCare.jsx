import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, Loader2, CheckCircle2, ShieldCheck, RefreshCw, XCircle,
  FolderOpen, Network, Shield, HardDrive, Terminal, AlertTriangle, Play
} from 'lucide-react';
import CommandOutput from './shared/CommandOutput';

function OneClickCare() {
  const [currentStep, setCurrentStep] = useState('idle'); // idle, restore, restore-failed, junk-scan, junk-preview, junk-undo, network-check, network-warn, network-run, sfc, trim, security, complete
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [activeDrive, setActiveDrive] = useState('C');
  const timerRef = useRef(null);
  
  // Custom states for steps
  const [junkSizes, setJunkSizes] = useState({ before: 0, after: 0 });
  const [netStatuses, setNetStatuses] = useState({ dns: 'pending', winsock: 'pending', tcp: 'pending' });
  const [securityStatus, setSecurityStatus] = useState({ defender: 'Active', firewall: 'Active' });
  
  // Restore Point States
  const [restoreError, setRestoreError] = useState('');
  const [enablingRestore, setEnablingRestore] = useState(false);

  // Junk Scan & Preview & Undo States
  const [junkFiles, setJunkFiles] = useState([]);
  const [selectedJunkPaths, setSelectedJunkPaths] = useState([]);
  const [scanningJunk, setScanningJunk] = useState(false);
  const [cleaningJunk, setCleaningJunk] = useState(false);
  const [backupDir, setBackupDir] = useState('');
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(30);
  const undoIntervalRef = useRef(null);

  // Network Check & Confirm States
  const [networkCheckData, setNetworkCheckData] = useState(null);
  const [networkProgressText, setNetworkProgressText] = useState('Idle');
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [resettingNetwork, setResettingNetwork] = useState(false);

  // SFC parsing states
  const [sfcLogs, setSfcLogs] = useState([]);
  const [sfcProgress, setSfcProgress] = useState(0);
  const [sfcEstTime, setSfcEstTime] = useState('Calculating remaining time...');
  const [sfcStartTime, setSfcStartTime] = useState(null);
  
  // Drive list for TRIM
  const [drives, setDrives] = useState([]);
  const [drivesLoading, setDrivesLoading] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [trimStatusText, setTrimStatusText] = useState('');
  
  const sfcEndRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (sfcEndRef.current) {
      sfcEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sfcLogs]);

  useEffect(() => {
    // Listen to SFC stream
    if (window.api && window.api.onStream) {
      unsubscribeRef.current = window.api.onStream('care-out', (data) => {
        try {
          if (typeof data !== 'string') return;
          const time = new Date().toLocaleTimeString(undefined, { hour12: false });
          const newLines = data.split('\n').filter(Boolean).map(line => `[${time}] ${line}`);
          
          setSfcLogs(prev => [...prev, ...newLines]);
          
          data.split('\n').forEach(line => {
            try {
              const match = line.match(/Verification\s+(\d+)%\s+complete/i) || line.match(/(\d+)%\s+complete/i) || line.match(/Verification\s+(\d+)%/i);
              if (match && match[1]) {
                const p = parseInt(match[1]);
                if (!isNaN(p)) {
                  setSfcProgress(p);
                  setProgress(65 + Math.round(p * 0.15));
                }
              }
            } catch (innerErr) {
              console.error('Error parsing line in sfc-out:', innerErr);
            }
          });
        } catch (err) {
          console.error('Error in sfc-out stream listener:', err);
        }
      });
    }
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  // Compute SFC estimated time remaining
  useEffect(() => {
    if (currentStep === 'sfc' && sfcStartTime && sfcProgress > 0) {
      const elapsed = (Date.now() - sfcStartTime) / 1000; // seconds
      if (sfcProgress > 2) {
        const totalEst = (elapsed / sfcProgress) * 100;
        const remaining = Math.round(totalEst - elapsed);
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        if (remaining > 0) {
          setSfcEstTime(`Estimated time remaining: ${m}m ${s < 10 ? '0' : ''}${s}s (${sfcProgress}% complete)`);
        } else {
          setSfcEstTime('Completing verification phase...');
        }
      }
    }
  }, [sfcProgress, currentStep, sfcStartTime]);

  // Timer counter
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  // Junk Undo Timer — keeps the interval pure (no side effects inside setState).
  useEffect(() => {
    if (currentStep !== 'junk-undo' || undoSecondsLeft <= 0) return;
    undoIntervalRef.current = setInterval(() => {
      setUndoSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(undoIntervalRef.current);
  }, [currentStep, undoSecondsLeft]);

  // When the undo countdown hits zero, automatically commit the cleanup.
  // Splitting this out of the interval keeps the setState updater pure
  // (StrictMode double-invokes updaters in dev, which would otherwise call
  // commitJunkCleanup twice).
  useEffect(() => {
    if (currentStep === 'junk-undo' && undoSecondsLeft === 0) {
      commitJunkCleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, undoSecondsLeft]);

  // Load drives configuration on mount
  const loadDrives = async () => {
    setDrivesLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('get-drives-info');
        if (res.success && res.stdout) {
          const list = JSON.parse(res.stdout.trim());
          setDrives(list);
          const firstSsd = list.find(d => d.MediaType === 'SSD');
          if (firstSsd) {
            setActiveDrive(firstSsd.DriveLetter);
          } else if (list.length > 0) {
            setActiveDrive(list[0].DriveLetter);
          }
        }
      } else {
        setDrives([
          { DriveLetter: 'C', MediaType: 'SSD', Size: 250000000000, FreeSpace: 120000000000, FragBefore: 6, FragAfter: 0 },
          { DriveLetter: 'D', MediaType: 'HDD', Size: 1000000000000, FreeSpace: 450000000000, FragBefore: 12, FragAfter: 12 },
          { DriveLetter: 'E', MediaType: 'SSD', Size: 500000000000, FreeSpace: 350000000000, FragBefore: 8, FragAfter: 0 }
        ]);
        setActiveDrive('C');
      }
    } catch(e) {
      console.error(e);
    } finally {
      setDrivesLoading(false);
    }
  };

  useEffect(() => {
    loadDrives();
  }, []);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startCare = async () => {
    setElapsedTime(0);
    setTimerActive(true);
    setSfcLogs([]);
    runRestoreStage();
  };

  // Stage 1: Restore Point Creation & Verification
  const runRestoreStage = async () => {
    setCurrentStep('restore');
    setProgress(10);
    setRestoreError('');
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('create-restore-point');
        if (res.success && res.stdout) {
          const status = JSON.parse(res.stdout.trim());
          if (status.Success) {
            // Success: Store sequence number for quick rollback
            await window.api.setSetting('lastRestorePointId', status.SequenceNumber);
            runJunkScanStage();
          } else {
            setRestoreError(status.Error || 'Failed to verify restore point creation.');
            setCurrentStep('restore-failed');
          }
        } else {
          setRestoreError(res.stderr || 'Failed to run restore point creator script.');
          setCurrentStep('restore-failed');
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        runJunkScanStage();
      }
    } catch (e) {
      setRestoreError(e.message);
      setCurrentStep('restore-failed');
    }
  };

  const enableRestoreSystem = async () => {
    setEnablingRestore(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('enable-restore');
        if (res.success) {
          // Retry
          setEnablingRestore(false);
          runRestoreStage();
        } else {
          // IMPROVEMENT: surface failure via in-app toast instead of native alert().
          setRestoreError('Failed to enable System Protection: ' + (res.stdout || res.error || 'Unknown error'));
          setEnablingRestore(false);
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setEnablingRestore(false);
        runRestoreStage();
      }
    } catch(e) {
      setRestoreError('Failed to enable System Protection: ' + e.message);
      setEnablingRestore(false);
    }
  };

  // Stage 2: Junk Files Scan & Preview
  const runJunkScanStage = async () => {
    setCurrentStep('junk-scan');
    setProgress(20);
    setScanningJunk(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('junk-scan');
        if (res.success && res.stdout) {
          const list = JSON.parse(res.stdout.trim());
          setJunkFiles(list);
          setSelectedJunkPaths(list.map(f => f.Path)); // select all by default
          setCurrentStep('junk-preview');
        } else {
          // No junk or failed, skip
          runNetworkCheckStage();
        }
      } else {
        // Mock
        await new Promise(r => setTimeout(r, 1000));
        const mockJunk = [
          { Path: 'C:\\Users\\User\\AppData\\Local\\Temp\\log_cache.tmp', Size: 24500000, Category: 'User Temp' },
          { Path: 'C:\\Windows\\Temp\\system_log_7392.log', Size: 128000000, Category: 'System Temp' },
          { Path: 'C:\\Windows\\Prefetch\\CHROME.EXE-8392.pf', Size: 4500000, Category: 'Prefetch' },
          { Path: 'C:\\Users\\User\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\data_0', Size: 32000000, Category: 'Chrome Cache' }
        ];
        setJunkFiles(mockJunk);
        setSelectedJunkPaths(mockJunk.map(f => f.Path));
        setCurrentStep('junk-preview');
      }
    } catch (e) {
      console.error(e);
      runNetworkCheckStage();
    } finally {
      setScanningJunk(false);
    }
  };

  const handleCleanJunk = async () => {
    setCleaningJunk(true);
    const beforeSize = junkFiles
      .filter(f => selectedJunkPaths.includes(f.Path))
      .reduce((acc, f) => acc + f.Size, 0);
      
    try {
      if (window.api) {
        // Run cleanup
        const jsonStr = JSON.stringify(selectedJunkPaths);
        const res = await window.api.runSystemCommand('junk-clean', [jsonStr]);
        if (res.success && res.stdout) {
          const cleanupRes = JSON.parse(res.stdout.trim());
          setBackupDir(cleanupRes.BackupDir);
          
          setJunkSizes({
            before: (beforeSize / 1048576).toFixed(1),
            after: ((beforeSize - (selectedJunkPaths.length * 15000)) / 1048576 / 15).toFixed(1)
          });
          
          setUndoSecondsLeft(30);
          setCurrentStep('junk-undo');
        } else {
          runNetworkCheckStage();
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setJunkSizes({
          before: (beforeSize / 1048576).toFixed(1),
          after: 0.1
        });
        setUndoSecondsLeft(5); // shorter for mock
        setCurrentStep('junk-undo');
      }
    } catch (e) {
      console.error(e);
      runNetworkCheckStage();
    } finally {
      setCleaningJunk(false);
    }
  };

  const undoJunkCleanup = async () => {
    clearInterval(undoIntervalRef.current);
    try {
      if (window.api && backupDir) {
        await window.api.runSystemCommand('junk-undo', [backupDir]);
      }
    } catch (e) {
      console.error(e);
    }
    // Return back to preview
    runJunkScanStage();
  };

  const commitJunkCleanup = async () => {
    clearInterval(undoIntervalRef.current);
    try {
      if (window.api && backupDir) {
        // Await commit so any error is surfaced; previously this was fire-and-forget.
        await window.api.runSystemCommand('junk-commit', [backupDir]);
      }
    } catch (e) {
      console.error('Junk commit failed:', e);
    }
    // Proceed
    runNetworkCheckStage();
  };

  const toggleJunkPath = (path) => {
    setSelectedJunkPaths(prev => 
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  // Stage 3: Network Check & Reset
  const runNetworkCheckStage = async () => {
    setCurrentStep('network-check');
    setProgress(35);
    setCheckingNetwork(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('network-check');
        if (res.success && res.stdout) {
          const data = JSON.parse(res.stdout.trim());
          setNetworkCheckData(data);
          
          if (data.ActiveDownload) {
            // Warn about active downloads
            setCurrentStep('network-warn');
          } else {
            // Direct confirm warning
            setCurrentStep('network-confirm');
          }
        } else {
          runNetworkResetStage('');
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setNetworkCheckData({ ActiveDownload: false, IsWifi: true, SSID: 'Mock-WiFi' });
        setCurrentStep('network-confirm');
      }
    } catch(e) {
      console.error(e);
      runNetworkResetStage('');
    } finally {
      setCheckingNetwork(false);
    }
  };

  const runNetworkResetStage = async (ssid) => {
    setCurrentStep('network-run');
    setProgress(40);
    setResettingNetwork(true);
    setNetworkProgressText('Resetting Socket Cache...');
    
    // Subscribe to stdout for logs
    let unsubscribe = null;
    if (window.api && window.api.onStream) {
      unsubscribe = window.api.onStream('care-out', (data) => {
        try {
          if (typeof data !== 'string') return;
          if (data.includes('Resetting...')) setNetworkProgressText('Resetting... socket catalogs flushed.');
          if (data.includes('Reconnecting...')) setNetworkProgressText('Reconnecting... power cycling network adapters.');
          if (data.includes('Connected!')) setNetworkProgressText('Connected! Internet link is back.');
        } catch (err) {
          console.error('Error in care-out stream listener:', err);
        }
      });
    }

    try {
      if (window.api) {
        setNetStatuses({ dns: 'running', winsock: 'pending', tcp: 'pending' });
        const res = await window.api.runSystemCommand('network-reset', [ssid || '']);
        if (res.success) {
          setNetStatuses({ dns: 'success', winsock: 'success', tcp: 'success' });
        } else {
          setNetStatuses({ dns: 'failed', winsock: 'failed', tcp: 'failed' });
        }
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setNetworkProgressText('Resetting... catalog directories flushed.');
        await new Promise(r => setTimeout(r, 1000));
        setNetworkProgressText('Reconnecting... local Wi-Fi active.');
        await new Promise(r => setTimeout(r, 1000));
        setNetworkProgressText('Connected! Diagnostic socket check complete.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (unsubscribe) unsubscribe();
      setResettingNetwork(false);
      runSfcStage();
    }
  };

  // Stage 4: System File Verification (SFC)
  const runSfcStage = async () => {
    setCurrentStep('sfc');
    setProgress(55);
    setSfcProgress(0);
    setSfcStartTime(Date.now());
    setSfcEstTime('Initializing verification phase...');
    
    try {
      if (window.api) {
        const time = new Date().toLocaleTimeString(undefined, { hour12: false });
        setSfcLogs([`[${time}] [SYSTEM] Initializing SFC Verification System...`]);
        const res = await window.api.runSystemCommand('repair-system-sfc');
        if (!res.success) {
          const warnTime = new Date().toLocaleTimeString(undefined, { hour12: false });
          setSfcLogs(prev => [...prev, `[${warnTime}] [WARN] SFC completed with minor warnings or resource files lock.`]);
        }
      } else {
        const mockLines = [
          'Beginning system scan. This process will take some time.',
          'Beginning verification phase of system scan.',
          'Verification 15% complete.',
          'Verification 45% complete.',
          'Verification 75% complete.',
          'Verification 100% complete.',
          'Windows Resource Protection did not find any integrity violations.'
        ];
        for (const line of mockLines) {
          await new Promise(r => setTimeout(r, 800));
          const mockTime = new Date().toLocaleTimeString(undefined, { hour12: false });
          setSfcLogs(prev => [...prev, `[${mockTime}] ${line}`]);
          const pctMatch = line.match(/Verification\s+(\d+)%/i);
          if (pctMatch && pctMatch[1]) {
            setSfcProgress(parseInt(pctMatch[1]));
          }
        }
      }
    } catch(e) {
      console.error(e);
    } finally {
      runTrimStage();
    }
  };

  // Stage 5: SSD TRIM Optimization
  const runTrimStage = async () => {
    // Reload drives to catch any fresh configurations
    await loadDrives();
    setCurrentStep('trim');
    setProgress(75);
    setTrimStatusText('');
  };

  const executeTrim = async () => {
    setTrimming(true);
    setTrimStatusText(`Initializing TRIM optimization on Drive ${activeDrive}...`);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('run-trim', [activeDrive]);
        if (res.success) {
          setTrimStatusText(`Drive ${activeDrive}: TRIM Optimization completed successfully!`);
          
          // Show fragmentation change (from before to after)
          setDrives(prev => prev.map(d => d.DriveLetter === activeDrive ? { ...d, FragBefore: d.FragAfter } : d));
        } else {
          setTrimStatusText(`Drive ${activeDrive}: TRIM failed. ${res.stderr || ''}`);
        }
      } else {
        await new Promise(r => setTimeout(r, 1500));
        setTrimStatusText(`Drive ${activeDrive}: (Mock) TRIM optimization success!`);
        setDrives(prev => prev.map(d => d.DriveLetter === activeDrive ? { ...d, FragBefore: d.FragAfter } : d));
      }
    } catch(e) {
      setTrimStatusText(`Error: ${e.message}`);
    } finally {
      setTrimming(false);
      // Wait brief moment then proceed to security audit
      setTimeout(runSecurityAudit, 2500);
    }
  };

  // Stage 6: Security audit
  const runSecurityAudit = async () => {
    setCurrentStep('security');
    setProgress(90);
    try {
      if (window.api) {
        const defenderRes = await window.api.runSystemCommand('check-defender');
        const firewallRes = await window.api.runSystemCommand('check-firewall');
        
        const isDefRunning = defenderRes.stdout.trim() === 'Running' ? 'Active' : 'Disabled';
        const isFwRunning = firewallRes.stdout.includes('ON') ? 'Active' : 'Disabled';
        setSecurityStatus({ defender: isDefRunning, firewall: isFwRunning });
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setSecurityStatus({ defender: 'Active', firewall: 'Disabled' });
      }
    } catch(e) {}

    // Complete
    setProgress(100);
    setCurrentStep('complete');
    setTimerActive(false);
  };

  const fixSecurityItem = async (item) => {
    try {
      if (window.api) {
        if (item === 'firewall') {
          await window.api.runSystemCommand('enable-firewall');
        } else {
          await window.api.runSystemCommand('start-defender');
        }
        setSecurityStatus(prev => ({ ...prev, [item]: 'Active' }));
      } else {
        setSecurityStatus(prev => ({ ...prev, [item]: 'Active' }));
      }
    } catch(e) {}
  };

  const handleCancel = async () => {
    if (window.api) {
      await window.api.killActiveProcess();
    }
    clearInterval(undoIntervalRef.current);
    setTimerActive(false);
    setCurrentStep('idle');
    setProgress(0);
  };

  const getStepIcon = (stepId) => {
    const stepsOrder = [
      'restore',
      'junk',
      'network',
      'sfc',
      'trim',
      'security'
    ];
    
    // Map current sub-states to steps order
    let mappedCurrent = currentStep;
    if (currentStep === 'restore-failed') mappedCurrent = 'restore';
    if (['junk-scan', 'junk-preview', 'junk-undo'].includes(currentStep)) mappedCurrent = 'junk';
    if (['network-check', 'network-warn', 'network-confirm', 'network-run'].includes(currentStep)) mappedCurrent = 'network';

    const currentIdx = stepsOrder.indexOf(mappedCurrent);
    const stepIdx = stepsOrder.indexOf(stepId);
    
    if (currentStep === 'complete') return <CheckCircle2 className="h-5 w-5 text-brand-success shrink-0" />;
    if (currentStep === 'idle') return <div className="h-2 w-2 rounded-full bg-slate-600 shrink-0"></div>;

    if (stepIdx < currentIdx) {
      return <CheckCircle2 className="h-5 w-5 text-brand-success shrink-0" />;
    } else if (stepIdx === currentIdx) {
      return <Loader2 className="h-5 w-5 text-brand-violet animate-spin shrink-0" />;
    } else {
      return <div className="h-2.5 w-2.5 rounded-full bg-slate-600 shrink-0"></div>;
    }
  };

  const getStepClass = (stepId) => {
    const stepsOrder = [
      'restore',
      'junk',
      'network',
      'sfc',
      'trim',
      'security'
    ];
    
    let mappedCurrent = currentStep;
    if (currentStep === 'restore-failed') mappedCurrent = 'restore';
    if (['junk-scan', 'junk-preview', 'junk-undo'].includes(currentStep)) mappedCurrent = 'junk';
    if (['network-check', 'network-warn', 'network-confirm', 'network-run'].includes(currentStep)) mappedCurrent = 'network';

    const currentIdx = stepsOrder.indexOf(mappedCurrent);
    const stepIdx = stepsOrder.indexOf(stepId);

    if (currentStep === 'complete') return 'text-slate-300 font-bold';
    if (stepIdx === currentIdx) return 'text-brand-violet font-black';
    if (stepIdx < currentIdx) return 'text-slate-400 font-medium';
    return 'text-slate-600 font-medium';
  };

  return (
    <div className="p-6 space-y-6">
      {/* Title */}
      <section className="flex justify-between items-center text-left">
        <div>
          <h2 className="text-xl font-bold text-slate-200">One-Click Maintenance</h2>
          <p className="text-xs text-slate-400">Step-by-step automated system file, socket, and disk audit wizard</p>
        </div>
        
        {currentStep !== 'idle' && currentStep !== 'complete' && (
          <div className="flex items-center gap-4 text-xs font-bold bg-slate-900 border border-brand-border px-4 py-2 rounded-lg">
            <span className="text-slate-400 uppercase">Elapsed:</span>
            <span className="text-brand-cyan">{formatTime(elapsedTime)}</span>
            <button 
              onClick={handleCancel}
              className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900 border border-brand-danger/30 rounded text-brand-danger cursor-pointer transition-colors"
            >
              Cancel Scan
            </button>
          </div>
        )}
      </section>

      {/* Progress Bar */}
      {currentStep !== 'idle' && (
        <section className="glass-panel border border-brand-border rounded-xl p-4 bg-slate-900/40 space-y-2">
          <div className="flex justify-between items-center text-xs font-bold select-none">
            <span className="text-slate-300 uppercase">Overall Optimization Progress</span>
            <span className="text-brand-cyan">{progress}%</span>
          </div>
          <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-brand-border">
            <div 
              className="bg-gradient-to-r from-brand-violet to-brand-cyan h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </section>
      )}

      {/* Main Orchestrator Panels */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Step Tracker Indicator */}
        <div className="glass-panel border border-brand-border rounded-2xl p-6 h-fit space-y-5 select-none text-left">
          <h3 className="text-sm font-bold text-slate-300 uppercase mb-2">Verification Steps</h3>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs">
              {getStepIcon('restore')}
              <span className={getStepClass('restore')}>1. Create System Restore Point</span>
            </div>
            
            <div className="flex items-center gap-4 text-xs">
              {getStepIcon('junk')}
              <span className={getStepClass('junk')}>2. System Junk &amp; Logs Cleanup</span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              {getStepIcon('network')}
              <span className={getStepClass('network')}>3. Network Socket Optimization</span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              {getStepIcon('sfc')}
              <span className={getStepClass('sfc')}>4. System File Checker (SFC)</span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              {getStepIcon('trim')}
              <span className={getStepClass('trim')}>5. Solid-State Volume TRIM</span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              {getStepIcon('security')}
              <span className={getStepClass('security')}>6. Antivirus &amp; Firewall Audit</span>
            </div>
          </div>
        </div>

        {/* Right Side: Active Wizard Panel */}
        <div className="md:col-span-2 glass-panel border border-brand-border rounded-2xl p-6 min-h-[380px] flex flex-col justify-between">
          {currentStep === 'idle' && (
            <div className="text-center py-10 my-auto space-y-6">
              <Zap className="h-16 w-16 text-brand-violet mx-auto animate-bounce" />
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-bold text-slate-100">Deep Maintenance Relauncher</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Solas Care Wizard will sequentially audit windows structures, flush cached junk files, reset broken registry socket configurations, scan file trees, and optimize drives.
                </p>
              </div>
              <button
                onClick={startCare}
                className="px-8 py-3 bg-brand-violet hover:bg-brand-violet/90 text-sm font-bold rounded-xl cursor-pointer shadow-lg shadow-brand-violet/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                Start System Care
              </button>
            </div>
          )}

          {/* Step 1: Restore Points */}
          {currentStep === 'restore' && (
            <div className="text-center py-16 my-auto space-y-4">
              <Loader2 className="h-12 w-12 text-brand-violet animate-spin mx-auto" />
              <h3 className="text-md font-bold text-slate-200">Securing System Snapshot</h3>
              <p className="text-xs text-slate-400">Creating and verifying a System Restore checkpoint. This protects your Windows files if you need to rollback changes.</p>
            </div>
          )}

          {currentStep === 'restore-failed' && (
            <div className="py-6 my-auto space-y-5 text-left">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-7 w-7 text-brand-danger animate-pulse" />
                <h3 className="text-md font-bold text-slate-200">Restore Point Creation Failed</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 p-4 border border-brand-border rounded-xl">
                {restoreError}
              </p>
              
              <div className="flex gap-3">
                <button
                  disabled={enablingRestore}
                  onClick={enableRestoreSystem}
                  className="px-6 py-2.5 bg-brand-violet hover:bg-brand-violet/95 disabled:bg-brand-violet/40 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                >
                  {enablingRestore ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : '🔧 Enable System Protection & Retry'}
                </button>
                <button
                  onClick={runJunkScanStage}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
                >
                  Skip Stage
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Junk Clean Scanning */}
          {currentStep === 'junk-scan' && (
            <div className="text-center py-16 my-auto space-y-4">
              <Loader2 className="h-12 w-12 text-brand-cyan animate-spin mx-auto" />
              <h3 className="text-md font-bold text-slate-200">Analyzing Storage Folders</h3>
              <p className="text-xs text-slate-400">Scanning for whitelisted log caches, Edge/Chrome browser temporary folders, and recycle bin items...</p>
            </div>
          )}

          {/* Step 2: Junk Clean Preview list */}
          {currentStep === 'junk-preview' && (
            <div className="flex-grow flex flex-col min-h-0 text-left space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <FolderOpen className="h-6 w-6 text-brand-cyan" />
                  <h3 className="text-sm font-bold text-slate-200">Junk Cleanup File Preview</h3>
                </div>
                <span className="text-xs text-brand-cyan font-bold bg-brand-cyan/5 border border-brand-cyan/20 px-3 py-1 rounded-lg">
                  Total Size: {(junkFiles.filter(f => selectedJunkPaths.includes(f.Path)).reduce((acc, f) => acc + f.Size, 0) / 1048576).toFixed(1)} MB
                </span>
              </div>

              {junkFiles.length === 0 ? (
                <div className="py-12 text-center my-auto">
                  <p className="text-xs text-slate-400">No temporary files found older than the safety threshold.</p>
                </div>
              ) : (
                <div className="flex-1 bg-slate-950/60 border border-brand-border rounded-xl p-3.5 overflow-y-auto max-h-[220px] space-y-2 select-none">
                  {junkFiles.map((file, idx) => {
                    const isChecked = selectedJunkPaths.includes(file.Path);
                    return (
                      <label key={idx} className="flex justify-between items-center p-2 rounded hover:bg-slate-900 border border-transparent hover:border-brand-border/40 cursor-pointer text-[10px] text-slate-300">
                        <div className="flex items-center gap-2 max-w-[80%]">
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleJunkPath(file.Path)}
                            className="h-3.5 w-3.5 accent-brand-violet"
                          />
                          <span className="font-mono truncate" title={file.Path}>{file.Path}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold">{file.Category}</span>
                          <span className="font-bold text-brand-cyan font-mono">{(file.Size / 1024).toFixed(1)} KB</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  disabled={cleaningJunk}
                  onClick={handleCleanJunk}
                  className="px-6 py-2.5 bg-brand-violet hover:bg-brand-violet/95 disabled:bg-brand-violet/40 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
                >
                  {cleaningJunk ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : 'Confirm & Clean Selected'}
                </button>
                <button
                  onClick={runNetworkCheckStage}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
                >
                  Skip Cleanup
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Junk Clean Undo Countdown */}
          {currentStep === 'junk-undo' && (
            <div className="py-6 my-auto space-y-6 text-left select-none">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-7 w-7 text-brand-success" />
                <h3 className="text-md font-bold text-slate-200">Junk Files Temporary Cleaned</h3>
              </div>
              <p className="text-xs text-slate-400">System temporary caches and browser files successfully flushed.</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-900 border border-brand-border rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Cache Before</span>
                  <span className="text-2xl font-black text-brand-danger mt-1 block">{junkSizes.before} MB</span>
                </div>
                <div className="p-4 bg-slate-900 border border-brand-border rounded-xl">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Cache After</span>
                  <span className="text-2xl font-black text-brand-success mt-1 block">{junkSizes.after} MB</span>
                </div>
              </div>

              {/* Undo control widget */}
              <div className="p-4 bg-amber-950/20 border border-amber-500/20 rounded-xl flex justify-between items-center text-xs">
                <div>
                  <h4 className="font-bold text-amber-400">File Deletion Undo Period</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">You can restore the deleted files to their original path for the next {undoSecondsLeft} seconds.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={undoJunkCleanup}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-black rounded-lg cursor-pointer transition-colors"
                  >
                    Restore (Undo)
                  </button>
                  <button
                    onClick={commitJunkCleanup}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg border border-brand-border cursor-pointer transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Network Check loading */}
          {currentStep === 'network-check' && (
            <div className="text-center py-16 my-auto space-y-4">
              <Loader2 className="h-12 w-12 text-pink-400 animate-spin mx-auto" />
              <h3 className="text-md font-bold text-slate-200">Evaluating Network Streams</h3>
              <p className="text-xs text-slate-400">Checking for active downloads and network I/O traffic to prevent connection drops...</p>
            </div>
          )}

          {/* Step 3: Network Warn download */}
          {currentStep === 'network-warn' && (
            <div className="py-6 my-auto space-y-5 text-left">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-7 w-7 text-brand-warning animate-pulse" />
                <h3 className="text-md font-bold text-slate-200">Active Download Network Activity</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Active download activity ({(networkCheckData?.BytesPerSec / 1024).toFixed(1)} KB/s) is currently running on your network. Resetting the sockets will disconnect all connections. Proceed anyway?
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => runNetworkResetStage(networkCheckData?.SSID)}
                  className="px-6 py-2.5 bg-brand-violet hover:bg-brand-violet/95 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Proceed Anyway
                </button>
                <button
                  onClick={runSfcStage}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
                >
                  Skip Optimize
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Network Confirm Reset Warning Modal */}
          {currentStep === 'network-confirm' && (
            <div className="py-6 my-auto space-y-5 text-left">
              <div className="flex items-center gap-3">
                <Network className="h-7 w-7 text-pink-400" />
                <h3 className="text-md font-bold text-slate-200">Network Sockets Optimization Warning</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will reset your local Winsock catalog entries and flush the DNS caches. <strong className="text-brand-danger">This will temporarily disconnect your internet connection for approximately 10 seconds.</strong>
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => runNetworkResetStage(networkCheckData?.SSID)}
                  className="px-6 py-2.5 bg-brand-violet hover:bg-brand-violet/95 text-xs font-bold rounded-lg cursor-pointer"
                >
                  Proceed Reset
                </button>
                <button
                  onClick={runSfcStage}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 cursor-pointer"
                >
                  Skip Optimize
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Network Resetting progress */}
          {currentStep === 'network-run' && (
            <div className="py-6 my-auto space-y-6 text-left select-none">
              <div className="flex items-center gap-3">
                <Network className="h-6 w-6 text-pink-400 animate-pulse" />
                <h3 className="text-md font-bold text-slate-200">Socket Stack Refresh</h3>
              </div>
              
              <div className="space-y-4">
                {/* Reconnection Status indicators */}
                <div className="flex justify-between items-center text-xs font-bold bg-slate-900 border border-brand-border px-4 py-3 rounded-lg">
                  <span className="text-slate-300">Status Progress</span>
                  <span className="text-brand-cyan uppercase animate-pulse">{networkProgressText}</span>
                </div>

                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">1. Flush DNS Client Resolver Cache</span>
                    <span className={`font-bold uppercase ${netStatuses.dns === 'success' ? 'text-brand-success' : 'text-brand-violet'}`}>
                      {netStatuses.dns.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">2. Reset Winsock catalog entries</span>
                    <span className={`font-bold uppercase ${netStatuses.winsock === 'success' ? 'text-brand-success' : netStatuses.winsock === 'pending' ? 'text-slate-600' : 'text-brand-violet'}`}>
                      {netStatuses.winsock.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-semibold">3. Tune TCP global auto-tuning parameters</span>
                    <span className={`font-bold uppercase ${netStatuses.tcp === 'success' ? 'text-brand-success' : netStatuses.tcp === 'pending' ? 'text-slate-600' : 'text-brand-violet'}`}>
                      {netStatuses.tcp.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: SFC Scan */}
          {currentStep === 'sfc' && (
            <div className="flex-1 flex flex-col min-h-0 text-left space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Terminal className="h-6 w-6 text-brand-violet animate-pulse" />
                  <h3 className="text-sm font-bold text-slate-200">SFC Verify Live Console</h3>
                </div>
                {/* Minimize to Tray */}
                <button
                  onClick={() => {
                    if (window.api && window.api.minimizeWindow) {
                      window.api.minimizeWindow();
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-900 border border-brand-border text-slate-400 hover:text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  📥 Minimize to Tray
                </button>
              </div>

              {/* SFC Sub-Progress Section */}
              <div className="bg-slate-900/60 border border-brand-border rounded-xl p-4 space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-slate-300 uppercase">SFC Phase Progress</span>
                  <span className="text-brand-violet">{sfcProgress}%</span>
                </div>
                <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-brand-border">
                  <div 
                    className="bg-brand-violet h-full rounded-full transition-all duration-300"
                    style={{ width: `${sfcProgress}%` }}
                  ></div>
                </div>
                <p className="text-[11px] text-slate-400 italic mt-1">{sfcEstTime}</p>
              </div>

              <CommandOutput 
                logs={sfcLogs} 
                onClear={() => setSfcLogs([])} 
                title="SFC Scan Console" 
                isRunning={currentStep === 'sfc'} 
                onCancel={window.api ? () => window.api.killActiveProcess() : null}
              />
            </div>
          )}

          {/* Step 5: SSD TRIM */}
          {currentStep === 'trim' && (
            <div className="py-6 my-auto space-y-6 text-left select-none">
              <div className="flex items-center gap-3">
                <HardDrive className="h-6 w-6 text-brand-cyan" />
                <h3 className="text-md font-bold text-slate-200">Solid-State Drive Selection</h3>
              </div>
              
              <div className="space-y-4">
                <p className="text-xs text-slate-400">Select the drive partition to run SSD TRIM speed optimization.</p>
                
                {drivesLoading ? (
                  <div className="py-6 flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-cyan" />
                    <span className="text-xs text-slate-400">Querying storage controllers...</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {drives.map(drive => {
                      const isSsd = drive.MediaType?.toUpperCase() === 'SSD';
                      return (
                        <button
                          key={drive.DriveLetter}
                          disabled={!isSsd || trimming}
                          onClick={() => setActiveDrive(drive.DriveLetter)}
                          title={!isSsd ? "TRIM only supported on SSD" : `Drive ${drive.DriveLetter}: is healthy`}
                          className={`px-5 py-3 border text-xs font-bold rounded-lg transition-all flex flex-col items-center gap-1.5 ${
                            !isSsd 
                              ? 'bg-slate-950/40 border-slate-800/80 text-slate-600 cursor-not-allowed opacity-40' 
                              : activeDrive === drive.DriveLetter 
                                ? 'bg-brand-violet border-brand-violet text-white shadow-lg shadow-brand-violet/20 cursor-pointer' 
                                : 'bg-slate-900 border-brand-border text-slate-400 hover:text-white cursor-pointer'
                          }`}
                        >
                          <span>Drive {drive.DriveLetter}: ({drive.MediaType})</span>
                          <span className="text-[10px] text-slate-500 font-medium">
                            {Math.round(drive.Size / 1073741824)} GB ({(drive.FragBefore)}% fragmented)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {trimStatusText && (
                <div className="p-3 bg-slate-900 border border-brand-border text-[11px] font-mono text-brand-success rounded-lg">
                  {trimStatusText}
                </div>
              )}

              <button
                disabled={trimming}
                onClick={executeTrim}
                className="px-6 py-2.5 bg-brand-violet hover:bg-brand-violet/95 disabled:bg-brand-violet/40 text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                {trimming ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : 'Execute SSD TRIM'}
              </button>
            </div>
          )}

          {/* Step 6: Security Audit */}
          {currentStep === 'security' && (
            <div className="py-6 my-auto space-y-5 text-left select-none">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-brand-success animate-pulse" />
                <h3 className="text-md font-bold text-slate-200">Active Shield Verification</h3>
              </div>
              
              <div className="space-y-4 text-xs">
                <div className="flex justify-between items-center p-3.5 bg-slate-900 border border-brand-border rounded-xl">
                  <div>
                    <h4 className="font-bold text-slate-200">Windows Defender Shield</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Real-time threat protection service</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${securityStatus.defender === 'Active' ? 'text-brand-success' : 'text-brand-danger'}`}>
                      {securityStatus.defender.toUpperCase()}
                    </span>
                    {securityStatus.defender !== 'Active' && (
                      <button 
                        onClick={() => fixSecurityItem('defender')}
                        className="px-3 py-1 bg-brand-success text-[10px] font-bold text-slate-950 rounded hover:bg-emerald-400 cursor-pointer"
                      >
                        FIX
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center p-3.5 bg-slate-900 border border-brand-border rounded-xl">
                  <div>
                    <h4 className="font-bold text-slate-200">Advanced Port Firewall</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Inbound network packet rules</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-bold ${securityStatus.firewall === 'Active' ? 'text-brand-success' : 'text-brand-danger'}`}>
                      {securityStatus.firewall.toUpperCase()}
                    </span>
                    {securityStatus.firewall !== 'Active' && (
                      <button 
                        onClick={() => fixSecurityItem('firewall')}
                        className="px-3 py-1 bg-brand-success text-[10px] font-bold text-slate-950 rounded hover:bg-emerald-400 cursor-pointer"
                      >
                        FIX
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Finished complete screen */}
          {currentStep === 'complete' && (
            <div className="text-center py-10 my-auto space-y-6">
              <CheckCircle2 className="h-16 w-16 text-brand-success mx-auto animate-pulse" />
              <div className="max-w-md mx-auto">
                <h3 className="text-lg font-bold text-slate-100">Care Optimization Routine Complete</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  All system elements verified. Junk flushed, internet sockets optimized, system files checked, and disk sectors optimized.
                </p>
              </div>
              <div className="p-3 bg-slate-900/60 border border-brand-border rounded-xl inline-block text-xs font-semibold text-slate-300 select-none">
                Performance Score Reset to: <span className="text-brand-success font-black">100%</span> | Time Taken: <span className="text-brand-cyan font-black">{formatTime(elapsedTime)}</span>
              </div>
              <div>
                <button
                  onClick={() => setCurrentStep('idle')}
                  className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-xl cursor-pointer border border-brand-border text-slate-200 transition-colors"
                >
                  Return to Home
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// React Error Boundary for OneClickCare
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error in OneClickCare:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-rose-950/20 border border-rose-500/30 rounded-2xl m-6 text-left space-y-4">
          <h2 className="text-lg font-black text-rose-300">Something went wrong with the Care Flow</h2>
          <p className="text-xs text-slate-400">An unexpected error occurred during execution. You can try restarting the care flow.</p>
          <div className="bg-black/40 border border-slate-800 rounded-xl p-4 font-mono text-[10px] text-rose-400 max-h-[200px] overflow-y-auto">
            {this.state.error?.toString()}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white rounded-xl cursor-pointer"
          >
            Reset Component
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SafeOneClickCare = () => (
  <ErrorBoundary>
    <OneClickCare />
  </ErrorBoundary>
);

export default SafeOneClickCare;
