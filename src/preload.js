const { clipboard, contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('cliBridge', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getSystemStats: () => ipcRenderer.invoke('app:system-stats'),
  openWorkspacePath: (targetPath) => ipcRenderer.invoke('workspace:open-path', targetPath),
  readWorkspaceTree: (options) => ipcRenderer.invoke('workspace:read-tree', options),
  readWorkspaceSkills: (options) => ipcRenderer.invoke('workspace:read-skills', options),
  chooseDirectory: () => ipcRenderer.invoke('dialog:choose-directory'),
  chooseTerminalExportDirectory: () => ipcRenderer.invoke('dialog:choose-export-directory'),
  readCodexConfig: (kind) => ipcRenderer.invoke('codex-config:read', kind),
  validateCodexConfig: (kind, content) => ipcRenderer.invoke('codex-config:validate', kind, content),
  writeCodexConfig: (kind, content) => ipcRenderer.invoke('codex-config:write', kind, content),
  listCodexConfigBackups: (kind) => ipcRenderer.invoke('codex-config:list-backups', kind),
  restoreCodexConfigBackup: (kind, backupName) => ipcRenderer.invoke('codex-config:restore-backup', kind, backupName),
  readCodexProfile: () => ipcRenderer.invoke('codex-config:read-profile'),
  writeCodexProfile: (profile) => ipcRenderer.invoke('codex-config:write-profile', profile),
  listCodexQuickProfiles: () => ipcRenderer.invoke('codex-config:list-quick-profiles'),
  saveCodexQuickProfile: (payload) => ipcRenderer.invoke('codex-config:save-quick-profile', payload),
  deleteCodexQuickProfile: (id) => ipcRenderer.invoke('codex-config:delete-quick-profile', id),
  openCodexConfigFolder: () => ipcRenderer.invoke('codex-config:open-folder'),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
    return true;
  },
  saveCommandDockImage: (payload) => ipcRenderer.invoke('command-dock:save-image', payload),
  createTerminal: (options) => ipcRenderer.invoke('terminal:create', options),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', id),
  killAllTerminals: () => ipcRenderer.invoke('terminal:kill-all'),
  exportTerminal: (id, options) => ipcRenderer.invoke('terminal:export', id, options),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  onTerminalData: (callback) => subscribe('terminal:data', callback),
  onTerminalExit: (callback) => subscribe('terminal:exit', callback)
});
