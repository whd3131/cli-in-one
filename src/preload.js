const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('cliBridge', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  readCodexConfig: (kind) => ipcRenderer.invoke('codex-config:read', kind),
  validateCodexConfig: (kind, content) => ipcRenderer.invoke('codex-config:validate', kind, content),
  writeCodexConfig: (kind, content) => ipcRenderer.invoke('codex-config:write', kind, content),
  openCodexConfigFolder: () => ipcRenderer.invoke('codex-config:open-folder'),
  createTerminal: (options) => ipcRenderer.invoke('terminal:create', options),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', id),
  killAllTerminals: () => ipcRenderer.invoke('terminal:kill-all'),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  onTerminalData: (callback) => subscribe('terminal:data', callback),
  onTerminalExit: (callback) => subscribe('terminal:exit', callback)
});
