const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getInstallPath: () => ipcRenderer.invoke('get-install-path'),
  checkInstalled: () => ipcRenderer.invoke('check-installed'),
  getLocalVersion: () => ipcRenderer.invoke('get-local-version'),
  fetchServerVersion: () => ipcRenderer.invoke('fetch-server-version'),
  downloadClient: () => ipcRenderer.invoke('download-client'),
  launchClient: () => ipcRenderer.invoke('launch-client'),
  showLogs: () => ipcRenderer.invoke('show-logs'),

  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (event, data) => callback(data));
  },

  onStatusUpdate: (callback) => {
    ipcRenderer.on('status-update', (event, data) => callback(data));
  },

  onAIMessage: (callback) => {
    ipcRenderer.on('ai-message', (event, message) => callback(message));
  }
});
