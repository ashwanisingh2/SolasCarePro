const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isAdmin: () => ipcRenderer.invoke('is-admin'),
  runSystemCommand: (commandKey, args = []) => {
    if (typeof commandKey !== 'string') {
      throw new Error('Invalid command key');
    }
    if (!Array.isArray(args)) {
      throw new Error('Command args must be an array');
    }
    return ipcRenderer.invoke('run-system-command', commandKey, args);
  },
  getSystemMetrics: () => ipcRenderer.invoke('get-system-metrics'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getDnsStatus: () => ipcRenderer.invoke('get-dns-status'),
  
  // Settings Persistence
  getSetting: (key, defaultValue) => ipcRenderer.invoke('get-setting', { key, defaultValue }),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', { key, value }),
  openSaveDialog: (opts) => ipcRenderer.invoke('open-save-dialog', opts),
  openFileDialog: (opts) => ipcRenderer.invoke('open-file-dialog', opts),
  exportSettings: (path) => ipcRenderer.invoke('export-settings', path),
  importSettings: (path) => ipcRenderer.invoke('import-settings', path),
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
    const validChannels = ['sfc-out', 'winget-out', 'care-out'];
    if (validChannels.includes(channel)) {
      const subscription = (event, data) => callback(data);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
  },
  
  killActiveProcess: () => ipcRenderer.invoke('kill-active-process'),
  minimizeWindow: () => ipcRenderer.send('minimize-window')
});
