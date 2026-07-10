const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isAdmin: () => ipcRenderer.invoke('is-admin'),
  runSystemCommand: (commandKey, args = [], options = {}) => {
    if (typeof commandKey !== 'string') {
      throw new Error('Invalid command key');
    }
    if (!Array.isArray(args)) {
      throw new Error('Command args must be an array');
    }
    return ipcRenderer.invoke('run-system-command', commandKey, args, options);
  },
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getDnsStatus: () => ipcRenderer.invoke('get-dns-status'),

  // Settings Persistence
  getSetting: (key, defaultValue) => ipcRenderer.invoke('get-setting', { key, defaultValue }),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', { key, value }),
  openSaveDialog: (opts) => ipcRenderer.invoke('open-save-dialog', opts),
  openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
  // Routed via run-system-command allow-list (handlers live in commandExecutor.js)
  exportSettings: (filePath) => ipcRenderer.invoke('run-system-command', 'export-settings', [filePath]),
  importSettings: (filePath) => ipcRenderer.invoke('run-system-command', 'import-settings', [filePath]),
  onSettingsCorrupted: (callback) => {
    const sub = () => callback();
    ipcRenderer.on('settings-corrupted', sub);
    return () => ipcRenderer.removeListener('settings-corrupted', sub);
  },

  // Driver backup & files helpers
  checkDriverBackup: (id) => ipcRenderer.invoke('check-driver-backup', id),
  openLogsFolder: () => ipcRenderer.invoke('run-system-command', 'open-logs-folder', []),
  openReportsFolder: () => ipcRenderer.invoke('run-system-command', 'open-reports-folder', []),
  openLatestBsodReport: () => ipcRenderer.invoke('run-system-command', 'open-latest-bsod-report', []),

  // Custom streaming API for terminal redirection
  onStream: (channel, callback) => {
    const validChannels = ['winget-out', 'care-out'];
    if (validChannels.includes(channel)) {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },

  // Native system notification (uses main process Notification API for tray integration)
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),

  killActiveProcess: () => ipcRenderer.invoke('kill-active-process'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),

  // Surgical Uninstaller (Feature 1) - direct store access (file-only ops, no PS)
  surgicalListSnapshots: () => ipcRenderer.invoke('surgical-list-snapshots'),
  surgicalGetSnapshot: (id) => ipcRenderer.invoke('surgical-get-snapshot', id),
  surgicalDeleteSnapshot: (id) => ipcRenderer.invoke('surgical-delete-snapshot', id),
  surgicalSaveDiff: (diffRecord) => ipcRenderer.invoke('surgical-save-diff', diffRecord),
  surgicalListDiffs: () => ipcRenderer.invoke('surgical-list-diffs'),
  surgicalSaveFootprint: (appKey, footprint) => ipcRenderer.invoke('surgical-save-footprint', appKey, footprint),
  surgicalGetFootprint: (appKey) => ipcRenderer.invoke('surgical-get-footprint', appKey),
  surgicalSaveOrphanScan: (orphans) => ipcRenderer.invoke('surgical-save-orphan-scan', orphans),
  surgicalGetOrphanScan: () => ipcRenderer.invoke('surgical-get-orphan-scan'),

  // Smart Workspace Automation (Feature 2) - profile CRUD + triggers + applied state
  workspaceListProfiles: () => ipcRenderer.invoke('workspace-list-profiles'),
  workspaceSaveProfile: (profile) => ipcRenderer.invoke('workspace-save-profile', profile),
  workspaceDeleteProfile: (profileId) => ipcRenderer.invoke('workspace-delete-profile', profileId),
  workspaceGetTriggers: (profileId) => ipcRenderer.invoke('workspace-get-triggers', profileId),
  workspaceSetTriggers: (profileId, triggers) => ipcRenderer.invoke('workspace-set-triggers', profileId, triggers),
  workspaceGetApplied: () => ipcRenderer.invoke('workspace-get-applied'),
  onWorkspaceTriggerFired: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('workspace-trigger-fired', sub);
    return () => ipcRenderer.removeListener('workspace-trigger-fired', sub);
  },

  // God Mode Tweaker (Feature 3) - catalog + bundles + applied history
  tweakerGetCatalog: () => ipcRenderer.invoke('tweaker-get-catalog'),
  tweakerGetBundles: () => ipcRenderer.invoke('tweaker-get-bundles'),
  tweakerSaveCustomBundle: (bundle) => ipcRenderer.invoke('tweaker-save-custom-bundle', bundle),
  tweakerDeleteCustomBundle: (id) => ipcRenderer.invoke('tweaker-delete-custom-bundle', id),
  tweakerLogApplied: (entry) => ipcRenderer.invoke('tweaker-log-applied', entry),
  tweakerListHistory: () => ipcRenderer.invoke('tweaker-list-history'),
  tweakerClearHistory: () => ipcRenderer.invoke('tweaker-clear-history'),

  // Software Forge (Feature 4) - catalog + presets + custom catalogs
  forgeGetCatalog: () => ipcRenderer.invoke('forge-get-catalog'),
  forgeGetPresets: () => ipcRenderer.invoke('forge-get-presets'),
  forgeListCustomCatalogs: () => ipcRenderer.invoke('forge-list-custom-catalogs'),
  forgeSaveCustomCatalog: (catalog) => ipcRenderer.invoke('forge-save-custom-catalog', catalog),
  forgeDeleteCustomCatalog: (id) => ipcRenderer.invoke('forge-delete-custom-catalog', id),

  // Privacy Blackhole (Feature 5) - blocklist + safe whitelist + counter
  privacyGetBlocklist: () => ipcRenderer.invoke('privacy-get-blocklist'),
  privacyFilterSafe: (domains) => ipcRenderer.invoke('privacy-filter-safe', domains),
  privacyGetBlockedCount: () => ipcRenderer.invoke('privacy-get-blocked-count'),
  privacyAppendBlockedCount: (count) => ipcRenderer.invoke('privacy-append-blocked-count', count),
  privacyResetBlockedCount: () => ipcRenderer.invoke('privacy-reset-blocked-count'),

  // Solas Vault (Feature 6) - registry + activity log + auto-unmount events
  vaultListMounted: () => ipcRenderer.invoke('vault-list-mounted'),
  vaultTouchActivity: (vaultId) => ipcRenderer.invoke('vault-touch-activity', vaultId),
  vaultGetActivityLog: () => ipcRenderer.invoke('vault-get-activity-log'),
  onVaultAutoUnmounted: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('vault-auto-unmounted', sub);
    return () => ipcRenderer.removeListener('vault-auto-unmounted', sub);
  },

  // Micro-Snapshots (Feature 7) - retention settings + history
  snapshotGetSettings: () => ipcRenderer.invoke('snapshot-get-settings'),
  snapshotSaveSettings: (settings) => ipcRenderer.invoke('snapshot-save-settings', settings),
  snapshotListHistory: () => ipcRenderer.invoke('snapshot-list-history'),
  snapshotAppendHistory: (entry) => ipcRenderer.invoke('snapshot-append-history', entry),
  snapshotEvaluateRetention: (snapshots, diskUsage) => ipcRenderer.invoke('snapshot-evaluate-retention', snapshots, diskUsage),

  // PC Clone (Feature 8) - AES encryption + history
  cloneListHistory: () => ipcRenderer.invoke('clone-list-history'),
  cloneAppendHistory: (entry) => ipcRenderer.invoke('clone-append-history', entry),
  cloneEncryptFile: (sourceJsonPath, outPath, password) => ipcRenderer.invoke('clone-encrypt-file', sourceJsonPath, outPath, password),
  cloneDecryptFile: (inPath, password) => ipcRenderer.invoke('clone-decrypt-file', inPath, password),
  cloneCleanupTemp: (tempPath) => ipcRenderer.invoke('clone-cleanup-temp', tempPath),

  // Predictive Maintenance (Feature 9) - thresholds + history + alerts
  healthGetSettings: () => ipcRenderer.invoke('health-get-settings'),
  healthSaveSettings: (settings) => ipcRenderer.invoke('health-save-settings', settings),
  healthListHistory: (daysBack) => ipcRenderer.invoke('health-list-history', daysBack),
  healthListAlerts: (daysBack) => ipcRenderer.invoke('health-list-alerts', daysBack),
  healthClearAlerts: () => ipcRenderer.invoke('health-clear-alerts'),
  onHealthAlert: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('health-alert', sub);
    return () => ipcRenderer.removeListener('health-alert', sub);
  },

  // Solas Sentinel (Feature 10) - rules engine + events + digest
  sentinelListRules: () => ipcRenderer.invoke('sentinel-list-rules'),
  sentinelSaveRule: (rule) => ipcRenderer.invoke('sentinel-save-rule', rule),
  sentinelDeleteRule: (id) => ipcRenderer.invoke('sentinel-delete-rule', id),
  sentinelListEvents: (daysBack) => ipcRenderer.invoke('sentinel-list-events', daysBack),
  sentinelGetDigest: () => ipcRenderer.invoke('sentinel-get-digest'),
  sentinelGenerateDigest: () => ipcRenderer.invoke('sentinel-generate-digest'),
  onSentinelRuleFired: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('sentinel-rule-fired', sub);
    return () => ipcRenderer.removeListener('sentinel-rule-fired', sub);
  },

  // Solas V-Cache (Feature 11) - RAM disk config + activity log
  vcacheGetAutoConfig: () => ipcRenderer.invoke('vcache-get-auto-config'),
  vcacheSaveAutoConfig: (config) => ipcRenderer.invoke('vcache-save-auto-config', config),
  vcacheListActivity: (daysBack) => ipcRenderer.invoke('vcache-list-activity', daysBack),
  vcacheAppendActivity: (entry) => ipcRenderer.invoke('vcache-append-activity', entry),

  // Seamless Sandbox (Feature 12) - activity log
  sandboxListActivity: (daysBack) => ipcRenderer.invoke('sandbox-list-activity', daysBack),
  sandboxAppendActivity: (entry) => ipcRenderer.invoke('sandbox-append-activity', entry),

  // License / Monetization - Free/Pro tier + feature gating
  licenseGetState: () => ipcRenderer.invoke('license-get-state'),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseDeactivate: () => ipcRenderer.invoke('license-deactivate'),
  licenseCheckFeature: (featureId) => ipcRenderer.invoke('license-check-feature', featureId),
  licenseIncrementUsage: (counterId) => ipcRenderer.invoke('license-increment-usage', counterId),
  licenseGetUsage: () => ipcRenderer.invoke('license-get-usage'),
  licenseGenerateDemoKey: () => ipcRenderer.invoke('license-generate-demo-key'),

  // Telemetry / Success Metrics - opt-in local analytics
  telemetryGetSettings: () => ipcRenderer.invoke('telemetry-get-settings'),
  telemetrySaveSettings: (settings) => ipcRenderer.invoke('telemetry-save-settings', settings),
  telemetryTrackEvent: (eventName, eventData) => ipcRenderer.invoke('telemetry-track-event', eventName, eventData),
  telemetryGetStats: (daysBack) => ipcRenderer.invoke('telemetry-get-stats', daysBack),
  telemetryGetFeatureUsage: () => ipcRenderer.invoke('telemetry-get-feature-usage'),

  // App Update Checker — queries GitHub Releases API, returns update info
  checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
  // Opens a GitHub URL in the default system browser (allowlisted to github.com only)
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url)
});
