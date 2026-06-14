const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit API surface exposed to the renderer.
// The renderer has no direct access to Node, ipcRenderer, or require —
// only the functions below.
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // Window
  hideWindow: () => ipcRenderer.invoke('hide-window'),

  // TaskNotes HTTP API proxy (request is made in the main process)
  request: (method, path, body) =>
    ipcRenderer.invoke('api-request', { method, path, body }),

  // Subscribe to settings changes pushed from the main process.
  // Returns an unsubscribe function.
  onSettingsUpdated: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on('settings-updated', listener);
    return () => ipcRenderer.removeListener('settings-updated', listener);
  },
});
