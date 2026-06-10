const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opsdeck', {
  saveAccessToken: (token) => ipcRenderer.invoke('opsdeck:save-token', token),
});
