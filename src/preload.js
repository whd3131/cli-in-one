const { clipboard, contextBridge, ipcRenderer, webUtils } = require('electron');
const { fileURLToPath } = require('url');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function normalizeClipboardFilePath(value) {
  const text = String(value || '').replace(/\0+$/g, '').trim();
  if (!text) {
    return '';
  }

  if (/^file:/i.test(text)) {
    try {
      return fileURLToPath(text);
    } catch {
      return '';
    }
  }

  return text.replace(/^"(.*)"$/s, '$1').trim();
}

function parseClipboardFilePathList(value) {
  const text = String(value || '').replace(/^\uFEFF/, '');
  return text
    .split(/\0+|\r\n|\n|\r/g)
    .map(normalizeClipboardFilePath)
    .filter(Boolean);
}

function readClipboardFormatText(format, encoding = 'utf8') {
  try {
    const buffer = clipboard.readBuffer(format);
    if (buffer && buffer.length > 0) {
      return buffer.toString(encoding);
    }
  } catch {
    // Some clipboard formats are exposed as strings only.
  }

  try {
    return clipboard.read(format) || '';
  } catch {
    return '';
  }
}

function readClipboardFilePaths() {
  const paths = [];
  const seen = new Set();
  const appendPaths = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      const filePath = normalizeClipboardFilePath(item);
      const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
      if (!filePath || seen.has(key)) {
        continue;
      }

      seen.add(key);
      paths.push(filePath);
    }
  };

  appendPaths(parseClipboardFilePathList(readClipboardFormatText('FileNameW', 'utf16le')));
  appendPaths(parseClipboardFilePathList(readClipboardFormatText('FileName', 'utf8')));
  appendPaths(parseClipboardFilePathList(readClipboardFormatText('text/uri-list', 'utf8')));

  return paths;
}

function readClipboardImage() {
  try {
    const image = clipboard.readImage();
    if (!image || image.isEmpty()) {
      return null;
    }

    const bytes = image.toPNG();
    if (!bytes || bytes.length === 0) {
      return null;
    }

    return {
      fileName: `clipboard-image-${Date.now()}.png`,
      mimeType: 'image/png',
      bytes: new Uint8Array(bytes)
    };
  } catch {
    return null;
  }
}

contextBridge.exposeInMainWorld('cliBridge', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getReleaseChangelog: (version) => ipcRenderer.invoke('app:release-changelog', version),
  getLatestReleaseStatus: (version, options) => ipcRenderer.invoke('app:latest-release-status', version, options),
  getSystemStats: () => ipcRenderer.invoke('app:system-stats'),
  getAppZoomFactor: () => ipcRenderer.invoke('app:get-zoom-factor'),
  setAppZoomFactor: (zoomFactor) => ipcRenderer.invoke('app:set-zoom-factor', zoomFactor),
  readUsageTracking: () => ipcRenderer.invoke('usage:read'),
  writeUsageRates: (rates) => ipcRenderer.invoke('usage:write-rates', rates),
  clearUsageRecords: () => ipcRenderer.invoke('usage:clear-records'),
  openWorkspacePath: (targetPath) => ipcRenderer.invoke('workspace:open-path', targetPath),
  openWorkspacePathInVSCode: (targetPath) => ipcRenderer.invoke('workspace:open-path-vscode', targetPath),
  openExternalUrl: (targetUrl) => ipcRenderer.invoke('workspace:open-url', targetUrl),
  openImageToolsPage: () => ipcRenderer.invoke('image-tools:open'),
  readWorkspaceTree: (options) => ipcRenderer.invoke('workspace:read-tree', options),
  readWorkspaceDiff: (options) => ipcRenderer.invoke('workspace:read-diff', options),
  readWorkspaceSkills: (options) => ipcRenderer.invoke('workspace:read-skills', options),
  readAgentContextFile: (options) => ipcRenderer.invoke('agent-context:read-file', options),
  fetchAgentContextUrl: (options) => ipcRenderer.invoke('agent-context:fetch-url', options),
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
  readClaudeConfig: (kind) => ipcRenderer.invoke('claude-config:read', kind),
  validateClaudeConfig: (kind, content) => ipcRenderer.invoke('claude-config:validate', kind, content),
  writeClaudeConfig: (kind, content) => ipcRenderer.invoke('claude-config:write', kind, content),
  listClaudeConfigBackups: (kind) => ipcRenderer.invoke('claude-config:list-backups', kind),
  restoreClaudeConfigBackup: (kind, backupName) => ipcRenderer.invoke('claude-config:restore-backup', kind, backupName),
  readClaudeProfile: () => ipcRenderer.invoke('claude-config:read-profile'),
  writeClaudeProfile: (profile) => ipcRenderer.invoke('claude-config:write-profile', profile),
  listClaudeQuickProfiles: () => ipcRenderer.invoke('claude-config:list-quick-profiles'),
  saveClaudeQuickProfile: (payload) => ipcRenderer.invoke('claude-config:save-quick-profile', payload),
  deleteClaudeQuickProfile: (id) => ipcRenderer.invoke('claude-config:delete-quick-profile', id),
  openClaudeConfigFolder: () => ipcRenderer.invoke('claude-config:open-folder'),
  readClipboardText: () => clipboard.readText(),
  writeClipboardText: (text) => {
    clipboard.writeText(typeof text === 'string' ? text : '');
    return true;
  },
  readClipboardFilePaths,
  readClipboardImage,
  getPathForFile: (file) => {
    try {
      return webUtils?.getPathForFile?.(file) || '';
    } catch {
      return '';
    }
  },
  saveCommandDockImage: (payload) => ipcRenderer.invoke('command-dock:save-image', payload),
  saveCommandDockImagePath: (filePath) => ipcRenderer.invoke('command-dock:save-image-path', filePath),
  chooseQuickPromptAttachments: (options) => ipcRenderer.invoke('quick-prompts:choose-attachments', options),
  listQuickPrompts: () => ipcRenderer.invoke('quick-prompts:list'),
  saveQuickPrompt: (payload) => ipcRenderer.invoke('quick-prompts:save', payload),
  deleteQuickPrompt: (id) => ipcRenderer.invoke('quick-prompts:delete', id),
  listCommandPresets: () => ipcRenderer.invoke('command-presets:list'),
  saveCommandPreset: (payload) => ipcRenderer.invoke('command-presets:save', payload),
  selectCommandPreset: (id) => ipcRenderer.invoke('command-presets:select', id),
  deleteCommandPreset: (id) => ipcRenderer.invoke('command-presets:delete', id),
  saveAgentAvatar: (payload) => ipcRenderer.invoke('agents:save-avatar', payload),
  readImageApiConfig: () => ipcRenderer.invoke('image-api:read-config'),
  writeImageApiConfig: (payload) => ipcRenderer.invoke('image-api:write-config', payload),
  listImageGenerationHistory: () => ipcRenderer.invoke('image-api:list-history'),
  writeImageGenerationHistory: (payload) => ipcRenderer.invoke('image-api:write-history', payload),
  clearImageGenerationHistory: () => ipcRenderer.invoke('image-api:clear-history'),
  generateImage: (payload) => ipcRenderer.invoke('image-api:generate', payload),
  onImageGenerationTaskUpdate: (callback) => subscribe('image-api:task-update', callback),
  onAgentBridgeDispatch: (callback) => subscribe('agent-bridge:dispatch', callback),
  createTerminal: (options) => ipcRenderer.invoke('terminal:create', options),
  updateTerminalMeta: (id, patch) => ipcRenderer.invoke('terminal:update-meta', id, patch),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', id),
  killAllTerminals: () => ipcRenderer.invoke('terminal:kill-all'),
  exportTerminal: (id, options) => ipcRenderer.invoke('terminal:export', id, options),
  writeTerminal: (id, data) => ipcRenderer.send('terminal:write', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  onTerminalData: (callback) => subscribe('terminal:data', callback),
  onTerminalExit: (callback) => subscribe('terminal:exit', callback)
});
