const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('adblockApi', {
  getState: () => ipcRenderer.invoke('get-state'),
  openTestPage: () => ipcRenderer.invoke('open-test-page'),
  reset: () => ipcRenderer.invoke('reset'),
  onReport: (cb) => ipcRenderer.on('report', (_e, r) => cb(r)),
  onReset: (cb) => ipcRenderer.on('reset', () => cb()),
});
