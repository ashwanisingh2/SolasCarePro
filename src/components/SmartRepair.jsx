import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, Loader2, Search,
  Cpu, Globe, HardDrive, Shield, Zap, RefreshCw, Terminal, ChevronDown,
  ChevronUp, Wrench, Stethoscope, Gauge, ArrowRight, AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from './shared/ConfirmModal';
import { useDebounced } from '../utils/hooks';
import CommandOutput from './shared/CommandOutput';

// ─── Recipe definitions (mirror commandExecutor.js smart-repair-recipe RECIPES) ───
// Kept here for UI display; the executor re-defines them for security.
const RECIPES = [
  {
    id: 'pc-slow',
    name: 'PC Running Slow',
    icon: Cpu,
    color: 'from-blue-500 to-cyan-500',
    description: 'Restore point, temp cleanup, junk scan, TRIM, SFC, DNS flush',
    estMinutes: '15-30 min',
    severity: 'low'
  },
  {
    id: 'internet-issues',
    name: 'Internet / Network Issues',
    icon: Globe,
    color: 'from-cyan-500 to-teal-500',
    description: 'DNS flush, Winsock reset, TCP/IP reset, adapter restart, WU reset',
    estMinutes: '5-10 min',
    severity: 'low'
  },
  {
    id: 'blue-screen',
    name: 'Blue Screen (BSOD)',
    icon: AlertTriangle,
    color: 'from-rose-500 to-red-500',
    description: 'BSOD analysis, restore point, SFC, DISM, driver scan',
    estMinutes: '30-60 min',
    severity: 'high'
  },
  {
    id: 'windows-update-stuck',
    name: 'Windows Update Stuck',
    icon: Shield,
    color: 'from-violet-500 to-purple-500',
    description: 'Reset WU components, DISM, SFC, restart WU service',
    estMinutes: '20-40 min',
    severity: 'medium'
  },
  {
    id: 'disk-issues',
    name: 'Disk / File System Issues',
    icon: HardDrive,
    color: 'from-amber-500 to-orange-500',
    description: 'Restore point, chkdsk scan, SFC, component store analysis + cleanup',
    estMinutes: '30-90 min',
    severity: 'medium'
  },
  {
    id: 'system-corruption',
    name: 'System File Corruption',
    icon: Wrench,
    color: 'from-emerald-500 to-green-500',
    description: 'DISM /RestoreHealth, SFC, CBS.log parse, SFC verify',
    estMinutes: '45-90 min',
    severity: 'high'
  },
  {
    id: 'freshen-windows',
    name: 'Freshen Up Windows',
    icon: Zap,
    color: 'from-fuchsia-500 to-pink-500',
    description: 'Temp cleanup, disk cleanup, icon cache, SFC, DNS, recycle bin',
    estMinutes: '20-45 min',
    severity: 'low'
  }
];

// ─── Error code lookup database ───
// Common Windows error codes mapped to suggested repair recipes / commands.
const ERROR_CODE_DB = [
  { code: '0x80070002', meaning: 'File not found', recipe: 'windows-update-stuck', command: 'repair-windows-update' },
  { code: '0x80070003', meaning: 'Path not found', recipe: 'windows-update-stuck', command: 'repair-windows-update' },
  { code: '0x80070005', meaning: 'Access denied', recipe: null, command: null, note: 'Run app as Administrator' },
  { code: '0x8007000D', meaning: 'Invalid data / corrupt files', recipe: 'system-corruption', command: 'repair-system-sfc' },
  { code: '0x80070422', meaning: 'Service disabled (often Windows Update)', recipe: 'windows-update-stuck', command: 'repair-service' },
  { code: '0x80070490', meaning: 'Element not found (registry/profile corruption)', recipe: 'system-corruption', command: 'repair-system-sfc' },
  { code: '0x800F081F', meaning: 'DISM: source not found', recipe: 'system-corruption', command: 'repair-system-dism', note: 'Use Windows ISO as DISM source' },
  { code: '0x800F0922', meaning: 'DISM: component store corrupt', recipe: 'system-corruption', command: 'repair-system-dism' },
  { code: '0x80240438', meaning: 'Windows Update COM service unavailable', recipe: 'windows-update-stuck', command: 'repair-windows-update' },
  { code: '0xC000021A', meaning: 'BSOD: WINLOGON fatal error', recipe: 'blue-screen', command: 'repair-system-sfc' },
  { code: '0x0000007E', meaning: 'BSOD: SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', recipe: 'blue-screen', command: 'scan-drivers', note: 'Likely driver issue - rollback recent driver' },
  { code: '0x000000D1', meaning: 'BSOD: DRIVER_IRQL_NOT_LESS_OR_EQUAL', recipe: 'blue-screen', command: 'scan-drivers', note: 'Driver fault - identify via analyze-bsod' },
  { code: '0x00000050', meaning: 'BSOD: PAGE_FAULT_IN_NONPAGED_AREA', recipe: 'blue-screen', command: 'schedule-ram-diagnostic', note: 'Possible RAM fault' },
  { code: '0x0000007B', meaning: 'BSOD: INACCESSIBLE_BOOT_DEVICE', recipe: null, command: 'repair-boot', note: 'Use bootrec /rebuildbcd' },
  { code: '0xC1900101', meaning: 'Windows upgrade failed', recipe: 'system-corruption', command: 'repair-system-dism' }
];

export default function SmartRepair() {
  const { addNotification } = useNotification();
  const confirm = useConfirm();

  const [activeRecipe, setActiveRecipe] = useState(null);
  const [running, setRunning] = useState(false);
  const [recipeProgress, setRecipeProgress] = useState(null); // { step, total, label }
  const [recipeResults, setRecipeResults] = useState(null);

  const [healthCheck, setHealthCheck] = useState(null);
  const [healthCheckLoading, setHealthCheckLoading] = useState(false);

  const [cbsReport, setCbsReport] = useState(null);
  const [cbsLoading, setCbsLoading] = useState(false);

  // Error code lookup
  const [errorCode, setErrorCode] = useState('');
  const debouncedCode = useDebounced(errorCode, 200);
  const errorMatch = useMemo(() => {
    const q = debouncedCode.trim().toLowerCase().replace(/^0x/, '0x');
    if (!q) return null;
    return ERROR_CODE_DB.find(e => e.code.toLowerCase() === q) || null;
  }, [debouncedCode]);

  // Before/after metrics
  const [metricsBefore, setMetricsBefore] = useState(null);
  const [metricsAfter, setMetricsAfter] = useState(null);
  const [showMetricsCompare, setShowMetricsCompare] = useState(false);

  const metricsUnsubRef = useRef(null);

  // Subscribe to live stream for recipe progress
  const [liveLogs, setLiveLogs] = useState([]);
  const [expandedLogs, setExpandedLogs] = useState(true);

  useEffect(() => {
    // Run pre-repair health check on mount
    runHealthCheck();
    return () => {
      if (metricsUnsubRef.current) metricsUnsubRef.current();
    };
  }, []);

  const captureMetrics = async () => {
    if (window.api) {
      try {
        return await window.api.getSystemMetrics();
      } catch { return null; }
    }
    return { cpu: Math.random() * 60 + 20, ram: Math.random() * 50 + 30, disk: Math.random() * 40 + 30 };
  };

  const runHealthCheck = async () => {
    setHealthCheckLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('pre-repair-health-check');
        if (res.success && res.stdout) {
          setHealthCheck(JSON.parse(res.stdout.trim()));
        }
      } else {
        setHealthCheck({
          canProceed: true,
          blockers: [],
          warnings: ['Mock: No real health check available in web preview.'],
          diskFreeGB: 245.7,
          online: true,
          pendingReboot: false,
          message: 'Mock pre-repair check passed.'
        });
      }
    } catch (e) {
      setHealthCheck({ canProceed: true, blockers: [], warnings: ['Health check failed: ' + e.message], message: 'Proceeding anyway.' });
    } finally {
      setHealthCheckLoading(false);
    }
  };

  const runRecipe = async (recipe) => {
    // Pre-flight: check health first if not done recently
    if (healthCheck && !healthCheck.canProceed) {
      addNotification('Repair Blocked', 'Pre-repair check found blockers. Resolve them first.', 'error');
      return;
    }

    const ok = await confirm({
      title: 'Run Repair Recipe',
      message: `"${recipe.name}" will run multiple repair operations sequentially.`,
      detail: `Estimated time: ${recipe.estMinutes}\n${recipe.description}`,
      confirmLabel: 'Start Repair',
      danger: recipe.severity === 'high'
    });
    if (!ok) return;

    setActiveRecipe(recipe.id);
    setRunning(true);
    setRecipeResults(null);
    setLiveLogs([]);
    setRecipeProgress({ step: 0, total: 1, label: 'Starting...' });

    // Capture "before" snapshot
    const before = await captureMetrics();
    setMetricsBefore(before);

    try {
      if (window.api && window.api.onStream) {
        metricsUnsubRef.current = window.api.onStream('care-out', (data) => {
          setLiveLogs(prev => [...prev.slice(-500), data]);
          // Parse "[RECIPE] (50%) Step 3/6: Label" lines to update progress
          const m = (typeof data === 'string' ? data : '').match(/\((\d+)%\) Step (\d+)\/(\d+): (.+)/);
          if (m) {
            setRecipeProgress({ step: parseInt(m[2]), total: parseInt(m[3]), label: m[4], pct: parseInt(m[1]) });
          }
        });
      }

      if (window.api) {
        const res = await window.api.runSystemCommand('smart-repair-recipe', [recipe.id]);
        let parsed = null;
        if (res.success && res.stdout) {
          try { parsed = JSON.parse(res.stdout.trim()); } catch {}
        }
        setRecipeResults(parsed || { success: res.success, error: res.error, results: [] });
      } else {
        // Mock mode
        await new Promise(r => setTimeout(r, 2500));
        setRecipeResults({
          success: true,
          recipe: recipe.id,
          totalSteps: 4,
          successCount: 4,
          failureCount: 0,
          results: [
            { step: 'Mock Step 1', success: true },
            { step: 'Mock Step 2', success: true },
            { step: 'Mock Step 3', success: true },
            { step: 'Mock Step 4', success: true }
          ]
        });
      }

      // Capture "after" snapshot
      const after = await captureMetrics();
      setMetricsAfter(after);
      setShowMetricsCompare(true);

      addNotification(
        'Repair Complete',
        recipe.name + ' finished. Check the results panel for details.',
        'success'
      );
    } catch (e) {
      addNotification('Repair Error', e.message, 'error');
      setRecipeResults({ success: false, error: e.message, results: [] });
    } finally {
      setRunning(false);
      setRecipeProgress(null);
      if (metricsUnsubRef.current) { metricsUnsubRef.current(); metricsUnsubRef.current = null; }
    }
  };

  const runCbsParse = async () => {
    setCbsLoading(true);
    try {
      if (window.api) {
        const res = await window.api.runSystemCommand('parse-cbs-log');
        if (res.success && res.stdout) {
          setCbsReport(JSON.parse(res.stdout.trim()));
        }
      } else {
        setCbsReport({
          success: true,
          sfcResult: 'Clean',
          corruptFilesFound: [],
          unrepairedFiles: [],
          corruptCount: 0,
          message: 'Mock: No corruption found.'
        });
      }
    } catch (e) {
      addNotification('CBS Parse Failed', e.message, 'error');
    } finally {
      setCbsLoading(false);
    }
  };

  const runErrorCodeRepair = async () => {
    if (!errorMatch) return;
    if (errorMatch.note && !errorMatch.command) {
      addNotification('Manual Action Required', errorMatch.note, 'warning');
      return;
    }
    if (errorMatch.recipe) {
      const recipe = RECIPES.find(r => r.id === errorMatch.recipe);
      if (recipe) {
        runRecipe(recipe);
        return;
      }
    }
    if (errorMatch.command) {
      const ok = await confirm({
        title: 'Run Suggested Repair',
        message: `For error ${errorMatch.code} (${errorMatch.meaning}), run: ${errorMatch.command}?`,
        confirmLabel: 'Run'
      });
      if (ok && window.api) {
        const args = errorMatch.command === 'repair-service' ? ['wuauserv', 'repair'] : [];
        const res = await window.api.runSystemCommand(errorMatch.command, args);
        addNotification(
          res.success ? 'Repair Complete' : 'Repair Failed',
          res.success ? `Command ${errorMatch.command} completed.` : (res.error || 'Failed'),
          res.success ? 'success' : 'error'
        );
      }
    }
  };

  const getSeverityColor = (sev) => {
    switch (sev) {
      case 'high': return 'border-rose-500/40 bg-rose-950/20';
      case 'medium': return 'border-amber-500/40 bg-amber-950/20';
      default: return 'border-brand-violet/40 bg-brand-violet/10';
    }
  };

  return (
    <div className="p-6 space-y-6 text-left select-none">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-brand-violet" />
            Smart Repair Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Guided repair recipes, error code lookup, and pre/post-repair diagnostics
          </p>
        </div>
        <button
          onClick={runHealthCheck}
          disabled={healthCheckLoading}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg border border-brand-border text-slate-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {healthCheckLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-run Health Check
        </button>
      </div>

      {/* Pre-repair Health Check Card */}
      {healthCheck && (
        <div className={`glass-panel border rounded-xl p-4 ${healthCheck.canProceed ? 'border-emerald-500/30' : 'border-rose-500/40'}`}>
          <div className="flex items-center gap-3 mb-2">
            {healthCheck.canProceed ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-400" />
            )}
            <h3 className="text-sm font-bold text-slate-200">Pre-Repair Health Check</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${healthCheck.canProceed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {healthCheck.canProceed ? 'READY' : 'BLOCKED'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-2">{healthCheck.message}</p>
          {healthCheck.blockers && healthCheck.blockers.length > 0 && (
            <div className="space-y-1 mb-2">
              {healthCheck.blockers.map((b, i) => (
                <div key={i} className="text-xs text-rose-400 flex items-start gap-2">
                  <XCircle className="h-3 w-3 mt-0.5 shrink-0" /> {b}
                </div>
              ))}
            </div>
          )}
          {healthCheck.warnings && healthCheck.warnings.length > 0 && (
            <div className="space-y-1">
              {healthCheck.warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Code Lookup */}
      <div className="glass-panel border border-brand-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-brand-cyan" />
          Error Code Lookup
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={errorCode}
            onChange={e => setErrorCode(e.target.value)}
            placeholder="Enter Windows error code (e.g. 0x80070002, 0xC000021A)..."
            className="flex-1 px-3 py-2 bg-slate-950/40 border border-brand-border rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-violet font-mono"
          />
          {errorMatch && (
            <button
              onClick={runErrorCodeRepair}
              disabled={running}
              className="px-4 py-2 bg-brand-violet/20 hover:bg-brand-violet/30 border border-brand-violet/40 rounded-lg text-xs font-bold text-brand-violet cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Wrench className="h-3 w-3" />
              {errorMatch.recipe ? 'Run Recipe' : 'Run Suggested Repair'}
            </button>
          )}
        </div>
        <AnimatePresence>
          {errorMatch && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-3 bg-slate-950/40 border border-brand-border rounded-lg"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-200 font-mono">{errorMatch.code}</p>
                  <p className="text-xs text-slate-300 mt-1">{errorMatch.meaning}</p>
                  {errorMatch.recipe && (
                    <p className="text-[11px] text-brand-violet mt-2">Suggested recipe: {RECIPES.find(r => r.id === errorMatch.recipe)?.name || errorMatch.recipe}</p>
                  )}
                  {errorMatch.command && !errorMatch.recipe && (
                    <p className="text-[11px] text-brand-cyan mt-2">Suggested command: <code className="font-mono">{errorMatch.command}</code></p>
                  )}
                  {errorMatch.note && (
                    <p className="text-[11px] text-amber-400 mt-2">Note: {errorMatch.note}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!errorMatch && errorCode && (
          <p className="text-xs text-slate-500 mt-2">No match found. Try common codes like 0x80070002, 0x80240438, 0xC000021A.</p>
        )}
      </div>

      {/* Repair Recipe Cards */}
      <div>
        <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-brand-violet" />
          Repair Recipes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {RECIPES.map(recipe => {
            const RecipeIcon = recipe.icon;
            const isActive = activeRecipe === recipe.id && running;
            const isDone = recipeResults && recipeResults.recipe === recipe.id;
            return (
              <motion.div
                key={recipe.id}
                whileHover={{ scale: running ? 1 : 1.02 }}
                className={`glass-panel border rounded-xl p-4 ${getSeverityColor(recipe.severity)} ${isActive ? 'ring-2 ring-brand-violet' : ''}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${recipe.color} flex items-center justify-center shrink-0`}>
                    <RecipeIcon className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-slate-200">{recipe.name}</h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">{recipe.estMinutes}</p>
                  </div>
                  {isDone && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">{recipe.description}</p>
                <button
                  onClick={() => runRecipe(recipe)}
                  disabled={running}
                  className="w-full px-3 py-2 bg-slate-800/60 hover:bg-slate-700 border border-brand-border rounded-lg text-[11px] font-bold text-slate-200 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isActive ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Running...</>
                  ) : isDone ? (
                    <><RefreshCw className="h-3 w-3" /> Run Again</>
                  ) : (
                    <><Wrench className="h-3 w-3" /> Start Repair</>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Live Progress (when running) */}
      {running && recipeProgress && (
        <div className="glass-panel border border-brand-violet/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-brand-violet" />
              Running Repair: Step {recipeProgress.step}/{recipeProgress.total}
            </h3>
            <span className="text-xs text-slate-400">{recipeProgress.pct || 0}%</span>
          </div>
          <p className="text-xs text-slate-300 mb-2">{recipeProgress.label}</p>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-violet to-brand-cyan transition-all duration-500"
              style={{ width: `${recipeProgress.pct || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Live Logs */}
      {(running || liveLogs.length > 0) && (
        <div className="glass-panel border border-brand-border rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedLogs(!expandedLogs)}
            className="w-full flex items-center justify-between p-3 hover:bg-slate-900/40"
          >
            <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-brand-cyan" />
              Live Repair Console ({liveLogs.length} lines)
            </span>
            {expandedLogs ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>
          {expandedLogs && (
            <div className="max-h-72 overflow-y-auto bg-slate-950/60 p-3 font-mono text-[11px] space-y-0.5">
              {liveLogs.map((line, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap break-all ${
                    (typeof line === 'string' && line.includes('[RECIPE] ✗')) ? 'text-rose-400' :
                    (typeof line === 'string' && line.includes('[RECIPE] ✓')) ? 'text-emerald-400' :
                    (typeof line === 'string' && line.includes('[ERROR]')) ? 'text-rose-400' :
                    'text-slate-300'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recipe Results */}
      {recipeResults && !running && (
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            {recipeResults.success ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-rose-400" />
            )}
            <h3 className="text-sm font-bold text-slate-200">Repair Results</h3>
            <span className="text-[10px] text-slate-400">
              {recipeResults.successCount || 0}/{recipeResults.totalSteps || 0} steps succeeded
            </span>
          </div>
          {recipeResults.results && recipeResults.results.length > 0 && (
            <div className="space-y-1.5">
              {recipeResults.results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                  )}
                  <span className="text-slate-300 flex-1">{r.step}</span>
                  {r.durationSec && (
                    <span className="text-[10px] text-slate-500">{r.durationSec}s</span>
                  )}
                  {r.error && (
                    <span className="text-[10px] text-rose-400 truncate max-w-[200px]" title={r.error}>{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {recipeResults.error && (
            <p className="text-xs text-rose-400 mt-2">{recipeResults.error}</p>
          )}
        </div>
      )}

      {/* Before/After Metrics Comparison */}
      {showMetricsCompare && metricsBefore && metricsAfter && (
        <div className="glass-panel border border-brand-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-brand-cyan" />
            Before / After Metrics
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'CPU Usage', before: metricsBefore.cpu, after: metricsAfter.cpu, unit: '%', lowerBetter: true },
              { label: 'RAM Usage', before: metricsBefore.ram, after: metricsAfter.ram, unit: '%', lowerBetter: true },
              { label: 'Disk Usage', before: metricsBefore.disk, after: metricsAfter.disk, unit: '%', lowerBetter: true }
            ].map(m => {
              const delta = (m.after || 0) - (m.before || 0);
              const improved = m.lowerBetter ? delta < 0 : delta > 0;
              const same = Math.abs(delta) < 0.1;
              return (
                <div key={m.label} className="bg-slate-950/40 border border-brand-border rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 mb-1">{m.label}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{(m.before || 0).toFixed(1)}{m.unit}</span>
                    <ArrowRight className="h-3 w-3 text-slate-500" />
                    <span className="text-xs font-bold text-slate-200">{(m.after || 0).toFixed(1)}{m.unit}</span>
                  </div>
                  {!same && (
                    <p className={`text-[10px] mt-1 ${improved ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {improved ? '▼' : '▲'} {Math.abs(delta).toFixed(1)}{m.unit} {improved ? 'improved' : 'higher'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CBS.log Parser */}
      <div className="glass-panel border border-brand-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-emerald-400" />
            CBS.log Corruption Analyzer
          </h3>
          <button
            onClick={runCbsParse}
            disabled={cbsLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-brand-border rounded text-[11px] font-bold text-slate-300 cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            {cbsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
            Parse CBS.log
          </button>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">
          Parses C:\Windows\Logs\CBS\CBS.log to extract files SFC could not repair. Run after SFC to identify stubborn corruptions.
        </p>
        {cbsReport && (
          <div className="space-y-2">
            <div className={`p-3 rounded-lg border ${cbsReport.sfcResult === 'Clean' || cbsReport.sfcResult === 'Repaired' ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-rose-950/20 border-rose-500/30'}`}>
              <p className="text-xs font-bold text-slate-200">
                SFC Result: <span className="font-mono">{cbsReport.sfcResult || 'Unknown'}</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-1">{cbsReport.message}</p>
            </div>
            {cbsReport.corruptFilesFound && cbsReport.corruptFilesFound.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-rose-400 mb-1">
                  Corrupt Files Found ({cbsReport.corruptCount}):
                </p>
                <div className="max-h-40 overflow-y-auto bg-slate-950/40 rounded p-2 space-y-0.5">
                  {cbsReport.corruptFilesFound.map((f, i) => (
                    <p key={i} className="text-[10px] font-mono text-slate-400 break-all">{f}</p>
                  ))}
                </div>
              </div>
            )}
            {cbsReport.unrepairedFiles && cbsReport.unrepairedFiles.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-amber-400 mb-1">
                  Files SFC Could NOT Repair ({cbsReport.unrepairedCount}):
                </p>
                <div className="max-h-40 overflow-y-auto bg-slate-950/40 rounded p-2 space-y-0.5">
                  {cbsReport.unrepairedFiles.map((f, i) => (
                    <p key={i} className="text-[10px] font-mono text-amber-400 break-all">{f}</p>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  Tip: Run "System File Corruption" recipe (DISM /RestoreHealth first, then SFC).
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
