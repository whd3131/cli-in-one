const { app, BrowserWindow, dialog, ipcMain, shell: electronShell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TOML = require('@iarna/toml');
const cliProviders = require('./shared/cli-providers.json');

let pty = null;
let ptyLoadError = null;

try {
  pty = require('node-pty');
} catch (error) {
  ptyLoadError = error;
}

const sessions = new Map();
let mainWindow = null;
const releasesUrl = 'https://github.com/whd3131/cli-in-one/releases';
const latestReleaseApiUrl = 'https://api.github.com/repos/whd3131/cli-in-one/releases/latest';
const releaseCacheTtlMs = 10 * 60 * 1000;
let latestReleaseCache = null;
const cursorModelCatalogCacheTtlMs = 10 * 60 * 1000;
let cursorModelCatalogCache = null;
const APP_STORAGE_DIR_NAME = '.cli-in-one';
const LEGACY_HISTORY_DIR_NAME = '.history';
const HISTORY_DIR_NAME = 'history';
const SETTINGS_HOMES_DIR_NAME = 'settings-homes';
const TEMP_SETTINGS_HOME_PATTERN = /^\.tmp-settings-home-\d+$/i;
const CODEX_CONTEXT_WINDOW_TOKENS = 1000000;
const CODEX_AUTO_COMPACT_TOKEN_LIMIT = 900000;
const CODEX_APPROVAL_POLICIES = new Set(['untrusted', 'on-request', 'never']);
const CODEX_SANDBOX_MODES = new Set(['read-only', 'workspace-write', 'danger-full-access']);
const CODEX_WIRE_APIS = new Set(['responses', 'chat']);
const CODEX_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);
const CODEX_QUICK_PROFILES_FILE_NAME = 'codex-quick-profiles.json';
const cliProviderList = Array.isArray(cliProviders) ? cliProviders : [];
const cliProviderMap = new Map(
  cliProviderList
    .filter((provider) => provider && typeof provider.id === 'string' && provider.id.trim())
    .map((provider) => [provider.id.trim(), provider])
);
const defaultCliProviderId = cliProviderMap.has('codex')
  ? 'codex'
  : (cliProviderList[0]?.id || 'shell');
const imageExtensionByMimeType = new Map([
  ['image/apng', '.apng'],
  ['image/avif', '.avif'],
  ['image/bmp', '.bmp'],
  ['image/gif', '.gif'],
  ['image/jpeg', '.jpg'],
  ['image/jpg', '.jpg'],
  ['image/png', '.png'],
  ['image/svg+xml', '.svg'],
  ['image/webp', '.webp']
]);
const imageExtensions = new Set(imageExtensionByMimeType.values());
const WORKSPACE_TREE_MAX_DEPTH = 6;
const WORKSPACE_TREE_MAX_ENTRIES = 2000;
const WORKSPACE_TREE_MAX_CHILDREN_PER_DIRECTORY = 200;
const WORKSPACE_SKILL_MAX_DEPTH = 8;
const WORKSPACE_SKILL_MAX_FILES_PER_SOURCE = 200;
const workspaceTreeIgnoredDirectoryNames = new Set([
  '.git',
  'node_modules',
  '.next',
  '.nuxt',
  '.yarn',
  '.pnpm-store',
  '.turbo',
  '.cache'
]);
const workspaceSkillFileExtensions = new Set([
  '.json',
  '.jsonc',
  '.md',
  '.mdc',
  '.mdx',
  '.toml',
  '.txt',
  '.yaml',
  '.yml'
]);
const workspaceSkillGithubAllowedDirectoryNames = new Set([
  'agents',
  'chatmodes',
  'instructions',
  'prompts',
  'skills'
]);
const workspaceSkillGithubAllowedFileNames = new Set([
  'agent-instructions.md',
  'agent-instructions.txt',
  'copilot-instructions.md',
  'copilot-instructions.txt',
  'instructions.md',
  'instructions.txt'
]);
const workspaceSkillSources = [
  { id: 'cursor', directoryName: '.cursor' },
  { id: 'claude', directoryName: '.claude' },
  { id: 'agent', directoryName: '.agent' },
  { id: 'github', directoryName: '.github' }
];

function getCliProviderById(id) {
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  return normalizedId ? (cliProviderMap.get(normalizedId) || null) : null;
}

function getCliProviderTitleBase(provider) {
  if (!provider || typeof provider !== 'object') {
    return 'CLI';
  }

  if (provider.panelTitle && typeof provider.panelTitle === 'object') {
    return provider.panelTitle.en || provider.panelTitle.zh || provider.id || 'CLI';
  }

  return provider.id || 'CLI';
}

function doesCommandMatchCliProvider(provider, initialCommand) {
  if (!provider || typeof provider !== 'object') {
    return false;
  }

  const command = String(initialCommand || '').trim();
  if (!command) {
    return Boolean(provider.detect?.emptyCommand);
  }

  const pattern = provider.detect?.pattern;
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return false;
  }

  try {
    return new RegExp(pattern, 'i').test(command);
  } catch {
    return false;
  }
}

function detectCliProviderByCommand(initialCommand) {
  const command = String(initialCommand || '').trim();

  if (!command) {
    return getCliProviderById('shell');
  }

  return cliProviderList.find((provider) => doesCommandMatchCliProvider(provider, command)) || null;
}

function resolveCliProvider(requestedCliProviderId, initialCommand) {
  return (
    getCliProviderById(requestedCliProviderId)
    || detectCliProviderByCommand(initialCommand)
    || getCliProviderById(defaultCliProviderId)
    || cliProviderList[0]
    || null
  );
}

function getStaticAssetPath(fileName) {
  return path.join(__dirname, '..', 'static', fileName);
}

function getAppBaseDir() {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
}

function getProgramStorageDir() {
  return path.join(getAppBaseDir(), APP_STORAGE_DIR_NAME);
}

function getManagedSettingsHomesDir() {
  return path.join(getProgramStorageDir(), SETTINGS_HOMES_DIR_NAME);
}

function getLegacyDefaultHistoryDir() {
  return path.join(getAppBaseDir(), LEGACY_HISTORY_DIR_NAME);
}

function getDefaultHistoryDir() {
  return path.join(getProgramStorageDir(), HISTORY_DIR_NAME);
}

function getLegacyCodexQuickProfilesPath() {
  return path.join(getAppBaseDir(), CODEX_QUICK_PROFILES_FILE_NAME);
}

function getCodexQuickProfilesPath() {
  return path.join(getProgramStorageDir(), CODEX_QUICK_PROFILES_FILE_NAME);
}

function getUserHomeDir() {
  try {
    return app.getPath('home');
  } catch {
    return os.homedir();
  }
}

function isPathInside(parentDir, targetPath) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(targetPath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isLegacyTempSettingsHomeDir(dirPath) {
  return TEMP_SETTINGS_HOME_PATTERN.test(path.basename(path.resolve(dirPath)));
}

function getCodexHomeDir() {
  const rawHomeDir = path.resolve(os.homedir());
  if (!isLegacyTempSettingsHomeDir(rawHomeDir) || !isPathInside(getAppBaseDir(), rawHomeDir)) {
    return rawHomeDir;
  }

  return path.join(getManagedSettingsHomesDir(), path.basename(rawHomeDir));
}

function buildSessionEnv(extraEnv = {}) {
  const env = {
    ...process.env,
    ...extraEnv
  };
  const codexHomeDir = getCodexHomeDir();

  if (codexHomeDir === path.resolve(os.homedir())) {
    return env;
  }

  env.HOME = codexHomeDir;
  if (process.platform === 'win32') {
    const parsedRoot = path.parse(codexHomeDir).root;
    const drive = parsedRoot.replace(/[\\/]+$/g, '');
    const homePath = codexHomeDir.slice(Math.max(parsedRoot.length - 1, 0));
    env.USERPROFILE = codexHomeDir;
    env.HOMEDRIVE = drive;
    env.HOMEPATH = homePath.startsWith('\\') || homePath.startsWith('/')
      ? homePath
      : `\\${homePath}`;
  }

  return env;
}

async function runShellCommand(commandLine, options = {}) {
  const shell = process.platform === 'win32'
    ? (process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe')
    : '/bin/sh';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', commandLine]
    : ['-lc', commandLine];

  return new Promise((resolve, reject) => {
    const proc = spawn(shell, args, {
      cwd: options.cwd || getUserHomeDir(),
      env: buildSessionEnv(options.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (buffer) => {
      stdout += buffer.toString('utf8');
    });

    proc.stderr.on('data', (buffer) => {
      stderr += buffer.toString('utf8');
    });

    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error((stderr || stdout || `Command failed with exit code ${code}.`).trim()));
    });
  });
}

async function readCursorCliConfig() {
  try {
    const content = await fs.promises.readFile(getCursorCliConfigPath(), 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function getCursorModelCatalog() {
  const now = Date.now();
  if (
    cursorModelCatalogCache
    && now - cursorModelCatalogCache.fetchedAt < cursorModelCatalogCacheTtlMs
  ) {
    return cursorModelCatalogCache.models;
  }

  try {
    const { stdout } = await runShellCommand('agent models');
    const models = parseCursorModelCatalog(stdout);
    cursorModelCatalogCache = {
      fetchedAt: now,
      models
    };
    return models;
  } catch {
    return cursorModelCatalogCache?.models || new Map();
  }
}

function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
  }

  if (process.platform === 'darwin') {
    return process.env.SHELL || '/bin/zsh';
  }

  return process.env.SHELL || '/bin/bash';
}

function getDefaultShellArgs() {
  if (process.platform === 'win32') {
    return ['/K', 'chcp 65001 >NUL'];
  }

  return [];
}

function readCpuSnapshot() {
  return os.cpus().reduce((snapshot, cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return {
      idle: snapshot.idle + cpu.times.idle,
      total: snapshot.total + total
    };
  }, { idle: 0, total: 0 });
}

let lastCpuSnapshot = readCpuSnapshot();

function getSystemStats() {
  const currentCpuSnapshot = readCpuSnapshot();
  const idleDelta = currentCpuSnapshot.idle - lastCpuSnapshot.idle;
  const totalDelta = currentCpuSnapshot.total - lastCpuSnapshot.total;
  lastCpuSnapshot = currentCpuSnapshot;

  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(0, totalMemory - freeMemory);

  return {
    cpuUsage: totalDelta > 0 ? Math.min(1, Math.max(0, 1 - idleDelta / totalDelta)) : 0,
    freeMemory,
    memoryUsage: totalMemory > 0 ? Math.min(1, Math.max(0, usedMemory / totalMemory)) : 0,
    sampledAt: Date.now(),
    totalMemory,
    usedMemory
  };
}

function getCodexConfigDir() {
  return path.join(getCodexHomeDir(), '.codex');
}

function getCodexConfigPath() {
  return path.join(getCodexConfigDir(), 'config.toml');
}

function getCodexAuthPath() {
  return path.join(getCodexConfigDir(), 'auth.json');
}

function getCursorConfigDir() {
  return path.join(getUserHomeDir(), '.cursor');
}

function getCursorCliConfigPath() {
  return path.join(getCursorConfigDir(), 'cli-config.json');
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function resolveCwd(cwd) {
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    return getUserHomeDir();
  }

  const resolved = path.resolve(cwd);
  try {
    if (fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    return getUserHomeDir();
  }

  return getUserHomeDir();
}

function tokenizeCommandLine(commandLine) {
  const input = String(commandLine || '').trim();
  if (!input) {
    return [];
  }

  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === '"' && char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function getCommandOptionValues(commandLine, optionNames) {
  const options = new Set(Array.isArray(optionNames) ? optionNames : []);
  if (options.size === 0) {
    return [];
  }

  const tokens = tokenizeCommandLine(commandLine);
  const values = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (options.has(token)) {
      const next = tokens[index + 1];
      if (typeof next === 'string' && next.length > 0) {
        values.push(next);
        index += 1;
      }
      continue;
    }

    for (const optionName of options) {
      if (token.startsWith(`${optionName}=`)) {
        values.push(token.slice(optionName.length + 1));
        break;
      }
    }
  }

  return values;
}

function getLastCommandOptionValue(commandLine, optionNames) {
  const values = getCommandOptionValues(commandLine, optionNames);
  return values.length > 0 ? values[values.length - 1] : '';
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.trunc(parsed);
}

function parseTomlScalar(value) {
  const content = String(value || '').trim();
  if (!content) {
    return undefined;
  }

  try {
    return TOML.parse(`value = ${content}`).value;
  } catch {
    return content;
  }
}

function extractCodexConfigOverrideValue(commandLine, key) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return undefined;
  }

  const overrides = getCommandOptionValues(commandLine, ['-c', '--config']);
  for (let index = overrides.length - 1; index >= 0; index -= 1) {
    const override = String(overrides[index] || '').trim();
    const separatorIndex = override.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const currentKey = override.slice(0, separatorIndex).trim();
    if (currentKey !== normalizedKey) {
      continue;
    }

    return parseTomlScalar(override.slice(separatorIndex + 1));
  }

  return undefined;
}

function parseContextWindowTokens(value) {
  return parsePositiveInteger(value);
}

function formatTokenCountLabel(value) {
  const count = parsePositiveInteger(value);
  if (!count) {
    return '';
  }

  if (count >= 1000000) {
    const millions = count / 1000000;
    return `${Number.isInteger(millions) ? millions : Number(millions.toFixed(1))}M`;
  }

  if (count >= 1000) {
    const thousands = count / 1000;
    return `${Number.isInteger(thousands) ? thousands : Number(thousands.toFixed(1))}K`;
  }

  return String(count);
}

function parseContextWindowTokensFromText(value) {
  const text = asString(value).trim();
  if (!text) {
    return null;
  }

  const compactMatch = /\b(\d+(?:\.\d+)?)\s*([KkMm])\b/.exec(text);
  if (compactMatch) {
    const amount = Number(compactMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const multiplier = compactMatch[2].toLowerCase() === 'm' ? 1000000 : 1000;
    return Math.trunc(amount * multiplier);
  }

  const rawMatch = /\b(\d{4,})\b/.exec(text);
  if (!rawMatch) {
    return null;
  }

  return parsePositiveInteger(rawMatch[1]);
}

function parseCursorModelCatalog(content) {
  const models = new Map();

  for (const line of String(content || '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9._-]+)\s+-\s+(.+?)\s*$/.exec(line);
    if (!match) {
      continue;
    }

    const [, id, label] = match;
    const contextWindowTokens = parseContextWindowTokensFromText(label);
    models.set(id, {
      id,
      label,
      contextWindowTokens,
      contextWindowLabel: formatTokenCountLabel(contextWindowTokens)
    });
  }

  return models;
}

function resolveExistingDirectoryOrThrow(dirPath) {
  const normalizedPath = asString(dirPath).trim();
  if (!normalizedPath) {
    throw new Error('当前没有可读取的工作区目录。');
  }

  const resolvedPath = path.resolve(normalizedPath);
  let stats = null;

  try {
    stats = fs.statSync(resolvedPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('当前工作区目录不存在。');
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error('当前工作区路径不是目录。');
  }

  return resolvedPath;
}

function shouldIgnoreWorkspaceTreeDirectory(name) {
  return workspaceTreeIgnoredDirectoryNames.has(String(name || '').trim().toLowerCase());
}

function compareWorkspaceTreeEntries(left, right) {
  const leftIsDirectory = left.isDirectory();
  const rightIsDirectory = right.isDirectory();

  if (leftIsDirectory !== rightIsDirectory) {
    return leftIsDirectory ? -1 : 1;
  }

  return left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function formatWorkspaceTreeMoreLabel(count) {
  return `... [${count} more omitted]`;
}

function normalizeWorkspaceSkillRelativePath(relativePath) {
  return String(relativePath || '').split(path.sep).join('/');
}

function shouldTraverseWorkspaceSkillDirectory(sourceId, relativePath) {
  if (sourceId !== 'github') {
    return true;
  }

  const normalizedPath = normalizeWorkspaceSkillRelativePath(relativePath);
  if (!normalizedPath) {
    return true;
  }

  const firstSegment = normalizedPath.split('/')[0]?.toLowerCase() || '';
  return workspaceSkillGithubAllowedDirectoryNames.has(firstSegment);
}

function shouldIncludeWorkspaceSkillFile(sourceId, relativePath) {
  const normalizedPath = normalizeWorkspaceSkillRelativePath(relativePath);
  if (!normalizedPath) {
    return false;
  }

  const baseName = path.basename(normalizedPath).toLowerCase();
  const extension = path.extname(baseName).toLowerCase();
  if (!workspaceSkillFileExtensions.has(extension)) {
    return false;
  }

  if (sourceId !== 'github') {
    return true;
  }

  if (workspaceSkillGithubAllowedFileNames.has(baseName)) {
    return true;
  }

  const firstSegment = normalizedPath.split('/')[0]?.toLowerCase() || '';
  return workspaceSkillGithubAllowedDirectoryNames.has(firstSegment);
}

async function readWorkspaceSkillSourceSnapshot(rootPath, source) {
  const sourcePath = path.join(rootPath, source.directoryName);
  let sourceStats = null;

  try {
    sourceStats = await fs.promises.stat(sourcePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        id: source.id,
        directoryName: source.directoryName,
        exists: false,
        fileCount: 0,
        files: [],
        path: sourcePath,
        truncated: false
      };
    }

    return {
      id: source.id,
      directoryName: source.directoryName,
      exists: false,
      error: error.message,
      fileCount: 0,
      files: [],
      path: sourcePath,
      truncated: false
    };
  }

  if (!sourceStats.isDirectory()) {
    return {
      id: source.id,
      directoryName: source.directoryName,
      exists: false,
      fileCount: 0,
      files: [],
      path: sourcePath,
      truncated: false
    };
  }

  const files = [];
  let truncated = false;

  const walk = async (directoryPath, relativeDirectoryPath, depth) => {
    if (depth > WORKSPACE_SKILL_MAX_DEPTH || files.length >= WORKSPACE_SKILL_MAX_FILES_PER_SOURCE) {
      truncated = true;
      return;
    }

    let entries = [];
    entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    entries.sort(compareWorkspaceTreeEntries);

    for (const entry of entries) {
      if (files.length >= WORKSPACE_SKILL_MAX_FILES_PER_SOURCE) {
        truncated = true;
        return;
      }

      const nextRelativePath = relativeDirectoryPath
        ? path.join(relativeDirectoryPath, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        if (!shouldTraverseWorkspaceSkillDirectory(source.id, nextRelativePath)) {
          continue;
        }

        await walk(path.join(directoryPath, entry.name), nextRelativePath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!shouldIncludeWorkspaceSkillFile(source.id, nextRelativePath)) {
        continue;
      }

      files.push({
        extension: path.extname(entry.name).toLowerCase(),
        name: entry.name,
        path: path.join(directoryPath, entry.name),
        relativePath: normalizeWorkspaceSkillRelativePath(nextRelativePath)
      });
    }
  };

  try {
    await walk(sourcePath, '', 1);
  } catch (error) {
    return {
      id: source.id,
      directoryName: source.directoryName,
      exists: true,
      error: error.message,
      fileCount: 0,
      files: [],
      path: sourcePath,
      truncated: false
    };
  }

  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, {
    numeric: true,
    sensitivity: 'base'
  }));

  return {
    id: source.id,
    directoryName: source.directoryName,
    exists: true,
    fileCount: files.length,
    files,
    path: sourcePath,
    truncated
  };
}

async function readWorkspaceTreeSnapshot(options = {}) {
  const cwd = resolveExistingDirectoryOrThrow(options.cwd);
  const lines = [];
  const state = {
    directoryCount: 0,
    fileCount: 0,
    entryCount: 0,
    omittedCount: 0,
    truncated: false
  };
  const rootLabel = path.basename(cwd) || cwd;
  const rootNode = {
    id: cwd,
    name: rootLabel,
    path: cwd,
    relativePath: '',
    type: 'directory',
    children: []
  };

  const appendTreeLine = (prefix, isLast, label) => {
    lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label}`);
  };

  const appendNoticeNode = (parentNode, notice) => {
    parentNode.children.push({
      id: `${parentNode.path || cwd}:${notice.type}:${parentNode.children.length}`,
      type: notice.type,
      name: notice.name,
      message: notice.message || '',
      omittedCount: notice.omittedCount || 0,
      children: []
    });
  };

  const normalizeRelativeWorkspaceTreePath = (relativePath) => (
    String(relativePath || '').split(path.sep).join('/')
  );

  const walk = async (directoryPath, prefix, depth, parentNode, relativeDirectoryPath = '') => {
    let entries = [];

    try {
      entries = await fs.promises.readdir(directoryPath, { withFileTypes: true });
    } catch (error) {
      const message = error.code || error.message || 'error';
      appendTreeLine(prefix, true, `[unreadable: ${message}]`);
      appendNoticeNode(parentNode, {
        type: 'unreadable',
        name: `[unreadable: ${message}]`,
        message
      });
      return false;
    }

    entries.sort(compareWorkspaceTreeEntries);

    const omittedChildrenCount = Math.max(
      0,
      entries.length - WORKSPACE_TREE_MAX_CHILDREN_PER_DIRECTORY
    );
    const visibleEntries = omittedChildrenCount > 0
      ? entries.slice(0, WORKSPACE_TREE_MAX_CHILDREN_PER_DIRECTORY)
      : entries;

    if (omittedChildrenCount > 0) {
      state.omittedCount += omittedChildrenCount;
      state.truncated = true;
    }

    for (let index = 0; index < visibleEntries.length; index += 1) {
      if (state.entryCount >= WORKSPACE_TREE_MAX_ENTRIES) {
        const remainingVisibleCount = visibleEntries.length - index;
        const remainingCount = remainingVisibleCount + omittedChildrenCount;
        if (remainingCount > 0) {
          const label = formatWorkspaceTreeMoreLabel(remainingCount);
          appendTreeLine(prefix, true, label);
          appendNoticeNode(parentNode, {
            type: 'omitted',
            name: label,
            omittedCount: remainingCount
          });
          state.omittedCount += remainingVisibleCount;
        }
        state.truncated = true;
        return true;
      }

      const entry = visibleEntries[index];
      const isLastVisible = index === visibleEntries.length - 1;
      const isLast = isLastVisible && omittedChildrenCount === 0;
      const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = relativeDirectoryPath
        ? path.join(relativeDirectoryPath, entry.name)
        : entry.name;
      const entryIsDirectory = entry.isDirectory();
      const entryIsLink = entry.isSymbolicLink();
      const labelParts = [entry.name];

      if (entryIsDirectory) {
        labelParts.push('/');
      }
      if (entryIsLink) {
        labelParts.push(' [link]');
      }
      if (entryIsDirectory && shouldIgnoreWorkspaceTreeDirectory(entry.name)) {
        labelParts.push(' [ignored]');
      }

      appendTreeLine(prefix, isLast, labelParts.join(''));
      state.entryCount += 1;

      const entryNode = {
        id: entryPath,
        name: entry.name,
        path: entryPath,
        relativePath: normalizeRelativeWorkspaceTreePath(relativePath),
        type: entryIsDirectory ? 'directory' : entryIsLink ? 'link' : 'file',
        ignored: entryIsDirectory && shouldIgnoreWorkspaceTreeDirectory(entry.name),
        link: entryIsLink,
        children: []
      };
      parentNode.children.push(entryNode);

      if (entryIsDirectory) {
        state.directoryCount += 1;

        if (shouldIgnoreWorkspaceTreeDirectory(entry.name) || entryIsLink) {
          continue;
        }

        if (depth + 1 > WORKSPACE_TREE_MAX_DEPTH) {
          const label = '... [depth limit]';
          appendTreeLine(nextPrefix, true, label);
          appendNoticeNode(entryNode, {
            type: 'depth-limit',
            name: label
          });
          state.omittedCount += 1;
          state.truncated = true;
          continue;
        }

        const shouldStop = await walk(entryPath, nextPrefix, depth + 1, entryNode, relativePath);
        if (shouldStop) {
          return true;
        }
        continue;
      }

      state.fileCount += 1;
    }

    if (omittedChildrenCount > 0) {
      const label = formatWorkspaceTreeMoreLabel(omittedChildrenCount);
      appendTreeLine(prefix, true, label);
      appendNoticeNode(parentNode, {
        type: 'omitted',
        name: label,
        omittedCount: omittedChildrenCount
      });
    }

    return false;
  };

  lines.push(rootLabel.endsWith(path.sep) ? rootLabel : `${rootLabel}${path.sep}`);
  await walk(cwd, '', 1, rootNode);

  return {
    cwd,
    root: rootNode,
    text: lines.join('\n'),
    directoryCount: state.directoryCount,
    fileCount: state.fileCount,
    omittedCount: state.omittedCount,
    truncated: state.truncated,
    maxDepth: WORKSPACE_TREE_MAX_DEPTH,
    maxEntries: WORKSPACE_TREE_MAX_ENTRIES
  };
}

async function readWorkspaceSkillsSnapshot(options = {}) {
  const cwd = resolveExistingDirectoryOrThrow(options.cwd);
  const scopes = [];
  let totalFiles = 0;

  for (const source of workspaceSkillSources) {
    const snapshot = await readWorkspaceSkillSourceSnapshot(cwd, source);
    scopes.push(snapshot);
    totalFiles += snapshot.fileCount || 0;
  }

  return {
    cwd,
    scannedAt: Date.now(),
    scopes,
    totalFiles
  };
}

async function openLocalPath(targetPath) {
  const normalizedPath = asString(targetPath).trim();
  if (!normalizedPath) {
    throw new Error('没有可打开的路径。');
  }

  const resolvedPath = path.resolve(normalizedPath);
  const result = await electronShell.openPath(resolvedPath);
  if (result) {
    throw new Error(result);
  }

  return true;
}

async function pathExists(targetPath) {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function movePathIfMissing(sourcePath, targetPath) {
  if (!await pathExists(sourcePath) || await pathExists(targetPath)) {
    return false;
  }

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.rename(sourcePath, targetPath);
  return true;
}

async function migrateLegacyTempSettingsHomes() {
  const appBaseDir = getAppBaseDir();
  let entries = [];

  try {
    entries = await fs.promises.readdir(appBaseDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory() || !TEMP_SETTINGS_HOME_PATTERN.test(entry.name)) {
      return;
    }

    const legacyHomeDir = path.join(appBaseDir, entry.name);
    if (!isPathInside(appBaseDir, legacyHomeDir)) {
      return;
    }

    const legacyConfigDir = path.join(legacyHomeDir, '.codex');
    const managedConfigDir = path.join(getManagedSettingsHomesDir(), entry.name, '.codex');
    await movePathIfMissing(legacyConfigDir, managedConfigDir).catch(() => {});
  }));
}

async function pruneEmptyLegacyTempSettingsHomes() {
  const appBaseDir = getAppBaseDir();
  let entries = [];

  try {
    entries = await fs.promises.readdir(appBaseDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(entries.map(async (entry) => {
    if (!entry.isDirectory() || !TEMP_SETTINGS_HOME_PATTERN.test(entry.name)) {
      return;
    }

    const fullPath = path.join(appBaseDir, entry.name);
    if (!isPathInside(appBaseDir, fullPath)) {
      return;
    }

    try {
      const children = await fs.promises.readdir(fullPath);
      if (children.length === 0) {
        await fs.promises.rmdir(fullPath);
      }
    } catch {
      // Ignore non-empty or concurrently-used legacy temp homes.
    }
  }));
}

async function prepareProgramStorage() {
  await fs.promises.mkdir(getProgramStorageDir(), { recursive: true }).catch(() => {});
  await movePathIfMissing(getLegacyDefaultHistoryDir(), getDefaultHistoryDir()).catch(() => {});
  await movePathIfMissing(getLegacyCodexQuickProfilesPath(), getCodexQuickProfilesPath()).catch(() => {});
  await migrateLegacyTempSettingsHomes();
  await pruneEmptyLegacyTempSettingsHomes();
}

function sendToRenderer(webContents, channel, payload) {
  if (webContents && !webContents.isDestroyed()) {
    webContents.send(channel, payload);
  }
}

function normalizeLatestRelease(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('GitHub Releases 返回了无效数据。');
  }

  return {
    tagName: typeof data.tag_name === 'string' ? data.tag_name : '',
    name: typeof data.name === 'string' ? data.name : '',
    body: typeof data.body === 'string' ? data.body : '',
    htmlUrl: typeof data.html_url === 'string' ? data.html_url : releasesUrl,
    publishedAt: typeof data.published_at === 'string' ? data.published_at : '',
    prerelease: Boolean(data.prerelease)
  };
}

async function getLatestReleaseSnapshot(force = false) {
  const now = Date.now();
  if (
    !force &&
    latestReleaseCache &&
    now - latestReleaseCache.fetchedAt < releaseCacheTtlMs
  ) {
    return latestReleaseCache;
  }

  const response = await fetch(latestReleaseApiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `cli-in-one/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    throw new Error(`读取 GitHub Releases 失败：HTTP ${response.status}`);
  }

  latestReleaseCache = {
    fetchedAt: now,
    release: normalizeLatestRelease(await response.json())
  };
  return latestReleaseCache;
}

function normalizeAllowedExternalUrl(value) {
  const parsed = new URL(value || releasesUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'github.com' ||
    !parsed.pathname.startsWith('/whd3131/cli-in-one/releases')
  ) {
    throw new Error('只能打开 CLI in One 的 GitHub Releases 链接。');
  }

  return parsed.href;
}

function appendTerminalTranscript(session, data) {
  if (!session || typeof data !== 'string' || data.length === 0) {
    return;
  }

  session.transcriptChunks.push(data);
  session.transcriptBytes += Buffer.byteLength(data, 'utf8');
}

function stripTerminalControlSequences(value) {
  return String(value || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[()][A-Za-z0-9]/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '')
    .replace(/[\x00\x07\x0B\x0C\x0E-\x1F]/g, (char) => (
      char === '\n' || char === '\r' || char === '\t' || char === '\b' ? char : ''
    ));
}

function normalizeTranscriptText(value) {
  let text = stripTerminalControlSequences(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (/[^\n]\x08/.test(text)) {
    text = text.replace(/[^\n]\x08/g, '');
  }

  return text.replace(/\x08/g, '').replace(/\n/g, os.EOL);
}

function sanitizeFileNamePart(value, fallback = 'session') {
  const normalized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 60);

  return normalized || fallback;
}

function formatFileTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

async function getUniqueFilePath(dir, baseName, extension) {
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index}`;
    const filePath = path.join(dir, `${baseName}${suffix}${extension}`);

    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return filePath;
      }
      throw error;
    }
  }

  throw new Error('无法生成唯一的导出文件名。');
}

function buildTerminalTranscriptText(session) {
  const startedAt = new Date(session.createdAt || Date.now());
  const exportedAt = new Date();
  const status = session.exited
    ? `exit${Number.isFinite(session.exitCode) ? ` ${session.exitCode}` : ''}${session.signal ? ` (${session.signal})` : ''}`
    : 'running';
  const body = normalizeTranscriptText(session.transcriptChunks.join(''));
  const header = [
    'CLI in One terminal transcript',
    `Title: ${session.title}`,
    `CWD: ${session.cwd}`,
    `Shell: ${session.shell}`,
    `Backend: ${session.backend}`,
    `CLI: ${session.cliProviderId || 'shell'}`,
    `Started: ${startedAt.toLocaleString()}`,
    `Exported: ${exportedAt.toLocaleString()}`,
    `Status: ${status}`,
    '',
    '---',
    ''
  ].join(os.EOL);

  return `${header}${body}${body.endsWith(os.EOL) || body.length === 0 ? '' : os.EOL}`;
}

async function exportTerminalSession(id, options = {}) {
  const session = sessions.get(id);
  if (!session) {
    throw new Error('会话不存在，无法导出。');
  }

  const requestedDir = typeof options.directory === 'string' && options.directory.trim()
    ? options.directory
    : getDefaultHistoryDir();
  const exportDir = path.resolve(requestedDir);
  await fs.promises.mkdir(exportDir, { recursive: true });

  const fileStamp = formatFileTimestamp();
  const titlePart = sanitizeFileNamePart(session.title);
  const filePath = await getUniqueFilePath(exportDir, `${fileStamp}-${titlePart}`, '.txt');
  const content = buildTerminalTranscriptText(session);
  await fs.promises.writeFile(filePath, content, 'utf8');
  const stats = await fs.promises.stat(filePath);

  return {
    path: filePath,
    dir: exportDir,
    size: stats.size,
    exportedAt: stats.mtimeMs
  };
}

function normalizeBinaryPayload(value) {
  if (!value) {
    return Buffer.alloc(0);
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value)) {
    return Buffer.from(value);
  }

  throw new Error('图片内容无效。');
}

function inferImageExtension(fileName, mimeType) {
  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
  const originalExtension = typeof fileName === 'string'
    ? path.extname(fileName).trim().toLowerCase()
    : '';

  if (imageExtensions.has(originalExtension)) {
    return originalExtension;
  }

  if (imageExtensionByMimeType.has(normalizedMimeType)) {
    return imageExtensionByMimeType.get(normalizedMimeType);
  }

  return '.png';
}

async function saveCommandDockImageAsset(options = {}) {
  const cwd = resolveCwd(options.cwd);
  const buffer = normalizeBinaryPayload(options.bytes);
  if (buffer.length === 0) {
    throw new Error('图片内容为空。');
  }

  const rawFileName = asString(options.fileName).trim();
  const mimeType = asString(options.mimeType).trim().toLowerCase();
  const extension = inferImageExtension(rawFileName, mimeType);
  const baseName = sanitizeFileNamePart(
    rawFileName ? path.basename(rawFileName, path.extname(rawFileName)) : 'image',
    'image'
  );
  const assetDir = path.join(cwd, '.files');
  await fs.promises.mkdir(assetDir, { recursive: true });

  const filePath = await getUniqueFilePath(
    assetDir,
    `${formatFileTimestamp()}-${baseName}`,
    extension
  );

  await fs.promises.writeFile(filePath, buffer);
  const stats = await fs.promises.stat(filePath);

  return {
    path: filePath,
    dir: assetDir,
    name: path.basename(filePath),
    size: stats.size
  };
}

function resolveCodexContextWindowTokens(config, initialCommand) {
  const overrideValue = extractCodexConfigOverrideValue(initialCommand, 'model_context_window');
  if (typeof overrideValue !== 'undefined') {
    return parseContextWindowTokens(overrideValue);
  }

  return parseContextWindowTokens(config?.model_context_window);
}

async function resolveCursorSessionMeta(initialCommand) {
  const config = await readCursorCliConfig();
  const modelFromCommand = asString(getLastCommandOptionValue(initialCommand, ['-m', '--model'])).trim();
  const configuredModel = asString(config?.selectedModel?.modelId || config?.model?.modelId).trim();
  const modelId = modelFromCommand || configuredModel;
  const fallbackDisplayName = asString(
    config?.model?.displayNameShort || config?.model?.displayName || modelId
  ).trim();
  let contextWindowTokens = parseContextWindowTokensFromText(fallbackDisplayName);
  let contextWindowLabel = formatTokenCountLabel(contextWindowTokens);

  if (modelId) {
    const catalog = await getCursorModelCatalog();
    const modelMeta = catalog.get(modelId);
    if (modelMeta?.contextWindowTokens) {
      contextWindowTokens = modelMeta.contextWindowTokens;
      contextWindowLabel = modelMeta.contextWindowLabel;
    }
  }

  return {
    contextWindowTokens,
    contextWindowLabel
  };
}

async function resolveSessionCliMeta(requestedCliProviderId, initialCommand) {
  const cliProvider = resolveCliProvider(requestedCliProviderId, initialCommand);
  const cliProviderId = cliProvider?.id || defaultCliProviderId;
  const baseMeta = {
    cliProviderId,
    codexSession: cliProviderId === 'codex',
    codexModel: '',
    codexProviderName: '',
    contextWindowTokens: null,
    contextWindowLabel: ''
  };

  if (cliProviderId === 'codex') {
    try {
      const snapshot = await getCodexProfileSnapshot();
      const profile = snapshot?.profile || {};
      const config = parseCodexToml(snapshot?.config?.content || '');
      const commandModel = asString(getLastCommandOptionValue(initialCommand, ['-m', '--model'])).trim();
      const contextWindowTokens = resolveCodexContextWindowTokens(config, initialCommand);

      return {
        ...baseMeta,
        codexModel: commandModel || asString(profile.model).trim(),
        codexProviderName: asString(profile.providerName, profile.providerKey).trim(),
        contextWindowTokens,
        contextWindowLabel: formatTokenCountLabel(contextWindowTokens)
      };
    } catch {
      return baseMeta;
    }
  }

  if (cliProviderId === 'cursor-agent') {
    try {
      return {
        ...baseMeta,
        ...(await resolveCursorSessionMeta(initialCommand))
      };
    } catch {
      return baseMeta;
    }
  }

  return baseMeta;
}

async function createTerminalSession(webContents, options = {}) {
  const id = crypto.randomUUID();
  const cols = clampNumber(options.cols, 20, 500, 100);
  const rows = clampNumber(options.rows, 5, 200, 28);
  const cwd = resolveCwd(options.cwd);
  const shell = getDefaultShell();
  const args = Array.isArray(options.args) ? options.args : getDefaultShellArgs();
  const requestedCliProviderId = typeof options.cliProviderId === 'string'
    ? options.cliProviderId.trim()
    : '';
  const initialCommand = typeof options.initialCommand === 'string' && options.initialCommand.trim()
    ? options.initialCommand.trim()
    : '';
  const cliProvider = resolveCliProvider(requestedCliProviderId, initialCommand);
  const title = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim()
    : `${getCliProviderTitleBase(cliProvider)} ${sessions.size + 1}`;
  const cliMeta = await resolveSessionCliMeta(requestedCliProviderId, initialCommand);

  const meta = {
    id,
    title,
    cwd,
    shell,
    backend: pty ? 'conpty' : 'pipe',
    initialCommand,
    createdAt: Date.now(),
    transcriptBytes: 0,
    transcriptChunks: [],
    exited: false,
    exitCode: null,
    signal: null,
    ...cliMeta
  };

  if (pty) {
    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: buildSessionEnv({
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color'
      })
    });

    const session = {
      ...meta,
      process: proc
    };

    proc.onData((data) => {
      appendTerminalTranscript(session, data);
      sendToRenderer(webContents, 'terminal:data', { id, data });
    });

    proc.onExit(({ exitCode, signal }) => {
      const current = sessions.get(id);
      if (current) {
        current.exited = true;
        current.exitCode = exitCode;
        current.signal = signal || null;
        current.process = null;
      }
      sendToRenderer(webContents, 'terminal:exit', {
        id,
        exitCode,
        signal: signal || null
      });
    });

    sessions.set(id, session);
  } else {
    const proc = spawn(shell, args, {
      cwd,
      env: buildSessionEnv(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const session = {
      ...meta,
      process: proc
    };

    proc.stdout.on('data', (buffer) => {
      const data = buffer.toString('utf8');
      appendTerminalTranscript(session, data);
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data
      });
    });

    proc.stderr.on('data', (buffer) => {
      const data = buffer.toString('utf8');
      appendTerminalTranscript(session, data);
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data
      });
    });

    proc.on('error', (error) => {
      const data = `\r\n[cli-in-one] failed to start ${shell}: ${error.message}\r\n`;
      appendTerminalTranscript(session, data);
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data
      });
    });

    proc.on('exit', (exitCode, signal) => {
      const current = sessions.get(id);
      if (current) {
        current.exited = true;
        current.exitCode = exitCode;
        current.signal = signal || null;
        current.process = null;
      }
      sendToRenderer(webContents, 'terminal:exit', {
        id,
        exitCode,
        signal: signal || null
      });
    });

    sessions.set(id, session);
  }

  if (initialCommand) {
    setTimeout(() => {
      const session = sessions.get(id);
      if (session) {
        writeToSessionProcess(session, `${initialCommand}\r`);
      }
    }, process.platform === 'win32' ? 450 : 300);
  }

  const { transcriptChunks, ...publicMeta } = meta;
  return publicMeta;
}

function writeToSessionProcess(session, data) {
  if (!session || session.exited || !session.process || typeof data !== 'string') {
    return false;
  }

  try {
    if (session.backend === 'conpty') {
      session.process.write(data);
      return true;
    }

    if (session.process.stdin && session.process.stdin.writable) {
      session.process.stdin.write(data);
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function killSession(id) {
  const session = sessions.get(id);
  if (!session) {
    return false;
  }

  try {
    if (session.process && !session.exited) {
      session.process.kill();
    }
  } catch {
    // Closing a panel should still release its transcript if the process already exited.
  }

  sessions.delete(id);
  return true;
}

function killAllSessions() {
  for (const id of [...sessions.keys()]) {
    killSession(id);
  }
}

function validateTomlText(content) {
  if (typeof content !== 'string') {
    throw new Error('config.toml 内容必须是文本。');
  }

  if (!content.trim()) {
    return;
  }

  try {
    TOML.parse(content);
  } catch (error) {
    throw new Error(`TOML 格式错误：${error.message}`);
  }
}

function validateJsonText(content) {
  if (typeof content !== 'string') {
    throw new Error('auth.json 内容必须是文本。');
  }

  if (!content.trim()) {
    throw new Error('auth.json 不能为空；如果要清空配置，请写 {}。');
  }

  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('根节点必须是 JSON 对象。');
    }
  } catch (error) {
    if (error.message === '根节点必须是 JSON 对象。') {
      throw error;
    }
    throw new Error(`JSON 格式错误：${error.message}`);
  }
}

function parseCodexToml(content) {
  if (!content || !content.trim()) {
    return {};
  }

  return TOML.parse(content);
}

function parseCodexAuth(content) {
  if (!content || !content.trim()) {
    return {};
  }

  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('auth.json 根节点必须是 JSON 对象。');
  }
  return parsed;
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeCodexProviderKey(value) {
  const normalized = asString(value, 'custom')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'custom';
}

function normalizeCodexUrl(value) {
  const trimmed = asString(value).trim();
  if (!trimmed) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Codex base_url 必须是有效的 http(s) 地址。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Codex base_url 只支持 http 或 https。');
  }

  return trimmed.replace(/\/+$/, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeTomlString(value) {
  return JSON.stringify(String(value));
}

function formatTomlValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return escapeTomlString(value);
}

function splitTomlLines(content) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized ? normalized.split('\n') : [];
}

function joinTomlLines(lines) {
  if (!lines.length) {
    return '';
  }

  return `${lines.join('\n').replace(/\n+$/g, '')}\n`;
}

function readTomlTableHeader(line) {
  const match = String(line).match(/^\s*\[\s*([^\]]+?)\s*\]\s*(?:#.*)?$/);
  return match ? match[1].trim() : null;
}

function getTomlRootRange(lines) {
  const firstTable = lines.findIndex((line) => readTomlTableHeader(line));
  return {
    start: 0,
    end: firstTable === -1 ? lines.length : firstTable
  };
}

function getTomlSectionRange(lines, sectionName) {
  const start = lines.findIndex((line) => readTomlTableHeader(line) === sectionName);
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (readTomlTableHeader(lines[index])) {
      end = index;
      break;
    }
  }

  return { start, end };
}

function setTomlKeyInRange(lines, range, key, value) {
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  const existingIndex = lines.findIndex((line, index) => index >= range.start && index < range.end && keyPattern.test(line));

  if (value === undefined || value === null) {
    if (existingIndex !== -1) {
      lines.splice(existingIndex, 1);
    }
    return lines;
  }

  const nextLine = `${key} = ${formatTomlValue(value)}`;
  if (existingIndex !== -1) {
    lines[existingIndex] = nextLine;
    return lines;
  }

  let insertAt = range.end;
  while (insertAt > range.start && lines[insertAt - 1]?.trim() === '') {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, nextLine);
  return lines;
}

function setTomlRootKey(content, key, value) {
  const lines = splitTomlLines(content);
  setTomlKeyInRange(lines, getTomlRootRange(lines), key, value);
  return joinTomlLines(lines);
}

function ensureTomlSection(content, sectionName) {
  const lines = splitTomlLines(content);
  if (getTomlSectionRange(lines, sectionName)) {
    return joinTomlLines(lines);
  }

  if (lines.length && lines[lines.length - 1].trim() !== '') {
    lines.push('');
  }
  lines.push(`[${sectionName}]`);
  return joinTomlLines(lines);
}

function setTomlSectionKey(content, sectionName, key, value) {
  let nextContent = content;
  if (value !== undefined && value !== null) {
    nextContent = ensureTomlSection(nextContent, sectionName);
  }

  const lines = splitTomlLines(nextContent);
  const range = getTomlSectionRange(lines, sectionName);
  if (!range) {
    return joinTomlLines(lines);
  }

  setTomlKeyInRange(lines, range, key, value);
  return joinTomlLines(lines);
}

function getFirstProviderKey(config) {
  const providers = config && typeof config.model_providers === 'object' ? config.model_providers : null;
  if (!providers) {
    return 'custom';
  }

  return Object.keys(providers).find(Boolean) || 'custom';
}

function buildCodexProfile(authSnapshot, configSnapshot) {
  const auth = parseCodexAuth(authSnapshot.content || '');
  const config = parseCodexToml(configSnapshot.content || '');
  const rawProviderKey = asString(config.model_provider, getFirstProviderKey(config));
  const providerKey = normalizeCodexProviderKey(rawProviderKey);
  const providers = config && typeof config.model_providers === 'object' ? config.model_providers : {};
  const providerConfig = providers && typeof providers[providerKey] === 'object' ? providers[providerKey] : {};
  const features = config && typeof config.features === 'object' ? config.features : {};
  const contextWindow = Number(config.model_context_window);
  const autoCompactLimit = Number(config.model_auto_compact_token_limit);
  const rawModelReasoningEffort = asString(config.model_reasoning_effort, 'high').trim();
  const approvalPolicy = asString(config.approval_policy);
  const sandboxMode = asString(config.sandbox_mode);

  return {
    apiKey: asString(auth.OPENAI_API_KEY),
    approvalPolicy: CODEX_APPROVAL_POLICIES.has(approvalPolicy) ? approvalPolicy : '',
    authMode: asString(auth.auth_mode),
    baseUrl: asString(providerConfig.base_url),
    contextWindow1m: contextWindow === CODEX_CONTEXT_WINDOW_TOKENS && autoCompactLimit === CODEX_AUTO_COMPACT_TOKEN_LIMIT,
    disableResponseStorage: Boolean(config.disable_response_storage),
    fastMode: config.service_tier === 'fast' && features.fast_mode !== false,
    model: asString(config.model),
    modelReasoningEffort: CODEX_REASONING_EFFORTS.has(rawModelReasoningEffort) ? rawModelReasoningEffort : 'high',
    providerKey,
    providerName: asString(providerConfig.name, providerKey),
    requiresOpenaiAuth: providerConfig.requires_openai_auth !== false,
    sandboxMode: CODEX_SANDBOX_MODES.has(sandboxMode) ? sandboxMode : '',
    wireApi: CODEX_WIRE_APIS.has(providerConfig.wire_api) ? providerConfig.wire_api : 'responses'
  };
}

async function getCodexProfileSnapshot() {
  const [authSnapshot, configSnapshot] = await Promise.all([
    getCodexFileSnapshot('auth'),
    getCodexFileSnapshot('config')
  ]);

  return {
    auth: authSnapshot,
    config: configSnapshot,
    profile: buildCodexProfile(authSnapshot, configSnapshot)
  };
}

function normalizeCodexProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Codex 配置必须是对象。');
  }

  const providerKey = normalizeCodexProviderKey(profile.providerKey);
  const providerName = asString(profile.providerName, providerKey).trim() || providerKey;
  const model = asString(profile.model).trim();
  const rawBaseUrl = asString(profile.baseUrl).trim();
  const baseUrl = rawBaseUrl ? normalizeCodexUrl(rawBaseUrl) : '';
  const wireApi = asString(profile.wireApi, 'responses').trim();
  const modelReasoningEffort = asString(profile.modelReasoningEffort, 'high').trim() || 'high';
  const approvalPolicy = asString(profile.approvalPolicy).trim();
  const sandboxMode = asString(profile.sandboxMode).trim();

  if (!CODEX_WIRE_APIS.has(wireApi)) {
    throw new Error('Codex wire_api 只能是 responses 或 chat。');
  }

  if (!CODEX_REASONING_EFFORTS.has(modelReasoningEffort)) {
    throw new Error('Codex 推理强度只能是 minimal、low、medium、high 或 xhigh。');
  }

  if (approvalPolicy && !CODEX_APPROVAL_POLICIES.has(approvalPolicy)) {
    throw new Error('Codex approval_policy 只能是 untrusted、on-request 或 never。');
  }

  if (sandboxMode && !CODEX_SANDBOX_MODES.has(sandboxMode)) {
    throw new Error('Codex sandbox_mode 只能是 read-only、workspace-write 或 danger-full-access。');
  }

  return {
    apiKey: asString(profile.apiKey).trim(),
    approvalPolicy,
    baseUrl,
    contextWindow1m: Boolean(profile.contextWindow1m),
    disableResponseStorage: Boolean(profile.disableResponseStorage),
    fastMode: Boolean(profile.fastMode),
    model,
    modelReasoningEffort,
    providerKey,
    providerName,
    requiresOpenaiAuth: profile.requiresOpenaiAuth !== false,
    sandboxMode,
    wireApi
  };
}

function applyCodexProfileToToml(content, profile) {
  const providerSection = `model_providers.${profile.providerKey}`;
  let nextContent = content || '';
  const shouldWriteProvider = Boolean(profile.baseUrl);

  nextContent = setTomlRootKey(nextContent, 'model_provider', shouldWriteProvider ? profile.providerKey : null);
  nextContent = setTomlRootKey(nextContent, 'model', profile.model || null);
  nextContent = setTomlRootKey(nextContent, 'model_reasoning_effort', profile.modelReasoningEffort || 'high');
  nextContent = setTomlRootKey(nextContent, 'disable_response_storage', profile.disableResponseStorage);
    nextContent = setTomlRootKey(nextContent, 'approval_policy', profile.approvalPolicy || null);
    nextContent = setTomlRootKey(nextContent, 'sandbox_mode', profile.sandboxMode || null);
  nextContent = setTomlRootKey(nextContent, 'service_tier', profile.fastMode ? 'fast' : null);
  nextContent = setTomlSectionKey(nextContent, 'features', 'fast_mode', profile.fastMode ? true : null);

  if (profile.contextWindow1m) {
    nextContent = setTomlRootKey(nextContent, 'model_context_window', CODEX_CONTEXT_WINDOW_TOKENS);
    nextContent = setTomlRootKey(nextContent, 'model_auto_compact_token_limit', CODEX_AUTO_COMPACT_TOKEN_LIMIT);
  } else {
    nextContent = setTomlRootKey(nextContent, 'model_context_window', null);
    nextContent = setTomlRootKey(nextContent, 'model_auto_compact_token_limit', null);
  }

  if (shouldWriteProvider) {
    nextContent = setTomlSectionKey(nextContent, providerSection, 'name', profile.providerName);
    nextContent = setTomlSectionKey(nextContent, providerSection, 'base_url', profile.baseUrl);
    nextContent = setTomlSectionKey(nextContent, providerSection, 'wire_api', profile.wireApi);
    nextContent = setTomlSectionKey(nextContent, providerSection, 'requires_openai_auth', profile.requiresOpenaiAuth);
  } else {
    nextContent = setTomlSectionKey(nextContent, providerSection, 'name', null);
    nextContent = setTomlSectionKey(nextContent, providerSection, 'base_url', null);
    nextContent = setTomlSectionKey(nextContent, providerSection, 'wire_api', null);
    nextContent = setTomlSectionKey(nextContent, providerSection, 'requires_openai_auth', null);
  }

  validateTomlText(nextContent);
  return nextContent;
}

function applyCodexProfileToAuth(content, profile) {
  const auth = parseCodexAuth(content || '');
  if (profile.apiKey) {
    auth.auth_mode = 'apikey';
    auth.OPENAI_API_KEY = profile.apiKey;
  } else {
    delete auth.OPENAI_API_KEY;
    if (auth.auth_mode === 'apikey') {
      delete auth.auth_mode;
    }
  }

  return `${JSON.stringify(auth, null, 2)}\n`;
}

async function writeCodexProfile(profilePayload) {
  const profile = normalizeCodexProfile(profilePayload);
  const [authSnapshot, configSnapshot] = await Promise.all([
    getCodexFileSnapshot('auth'),
    getCodexFileSnapshot('config')
  ]);

  const nextConfig = applyCodexProfileToToml(configSnapshot.content || '', profile);
  const nextAuth = applyCodexProfileToAuth(authSnapshot.content || '', profile);
  const authHasContent = authSnapshot.exists || profile.apiKey || nextAuth.trim() !== '{}';

  let authResult = null;
  if (authHasContent) {
    authResult = await writeCodexFileText('auth', nextAuth);
  }

  const configResult = await writeCodexFileText('config', nextConfig);
  const snapshot = await getCodexProfileSnapshot();

  return {
    ...snapshot,
    backups: {
      auth: authResult?.backupPath || null,
      config: configResult.backupPath || null
    }
  };
}

function createCodexQuickProfileId() {
  return crypto.randomUUID();
}

function deriveCodexQuickProfileName(profile, fallback = 'Codex 配置') {
  const parts = [profile.providerName, profile.model]
    .map((part) => asString(part).trim())
    .filter(Boolean);
  return parts.join(' / ') || fallback;
}

function normalizeCodexQuickProfileName(value, profile, fallback) {
  const trimmed = asString(value).trim();
  return (trimmed || deriveCodexQuickProfileName(profile, fallback)).slice(0, 120);
}

function normalizeCodexQuickProfileRecord(record, index) {
  const profile = normalizeCodexProfile(record?.profile || record);
  const id = asString(record?.id).trim() || createCodexQuickProfileId();
  const now = Date.now();
  const createdAt = Number.isFinite(record?.createdAt) ? record.createdAt : now + index;
  const updatedAt = Number.isFinite(record?.updatedAt) ? record.updatedAt : createdAt;

  return {
    id,
    name: normalizeCodexQuickProfileName(record?.name, profile, `Codex 配置 ${index + 1}`),
    profile,
    createdAt,
    updatedAt
  };
}

function normalizeCodexQuickProfileStore(raw) {
  const sourceProfiles = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.profiles) ? raw.profiles : [];
  const profiles = [];
  const seenIds = new Set();

  sourceProfiles.forEach((record, index) => {
    try {
      const normalized = normalizeCodexQuickProfileRecord(record, index);
      if (seenIds.has(normalized.id)) {
        normalized.id = createCodexQuickProfileId();
      }
      seenIds.add(normalized.id);
      profiles.push(normalized);
    } catch {
      // Ignore invalid saved presets instead of blocking the settings panel.
    }
  });

  const activeId = profiles.some((profile) => profile.id === raw?.activeId)
    ? raw.activeId
    : '';

  return {
    version: 1,
    activeId,
    profiles
  };
}

function toCodexQuickProfileStorePayload(store) {
  return {
    path: getCodexQuickProfilesPath(),
    version: 1,
    activeId: store.activeId || '',
    profiles: store.profiles
  };
}

async function readCodexQuickProfileStore() {
  const storePath = getCodexQuickProfilesPath();

  try {
    const content = await fs.promises.readFile(storePath, 'utf8');
    return normalizeCodexQuickProfileStore(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeCodexQuickProfileStore({});
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Codex 快捷配置方案文件不是有效 JSON：${error.message}`);
    }

    throw error;
  }
}

async function writeCodexQuickProfileStore(store) {
  const normalized = normalizeCodexQuickProfileStore(store);
  const storePath = getCodexQuickProfilesPath();
  const tempPath = path.join(
    path.dirname(storePath),
    `${CODEX_QUICK_PROFILES_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
  );

  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });

  try {
    await fs.promises.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tempPath, storePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return normalized;
}

async function listCodexQuickProfiles() {
  return toCodexQuickProfileStorePayload(await readCodexQuickProfileStore());
}

async function saveCodexQuickProfile(payload = {}) {
  const store = await readCodexQuickProfileStore();
  const profile = normalizeCodexProfile(payload.profile);
  const requestedId = asString(payload.id).trim();
  const existingIndex = requestedId
    ? store.profiles.findIndex((record) => record.id === requestedId)
    : -1;
  const existing = existingIndex >= 0 ? store.profiles[existingIndex] : null;
  const record = {
    id: existing?.id || requestedId || createCodexQuickProfileId(),
    name: normalizeCodexQuickProfileName(payload.name, profile, existing?.name || 'Codex 配置'),
    profile,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const profiles = [...store.profiles];
  if (existingIndex >= 0) {
    profiles[existingIndex] = record;
  } else {
    profiles.unshift(record);
  }

  const nextStore = await writeCodexQuickProfileStore({
    ...store,
    activeId: record.id,
    profiles
  });

  return {
    ...toCodexQuickProfileStorePayload(nextStore),
    savedProfile: record
  };
}

async function deleteCodexQuickProfile(id) {
  const store = await readCodexQuickProfileStore();
  const profileId = asString(id).trim();
  const existing = store.profiles.find((record) => record.id === profileId);

  if (!existing) {
    throw new Error('选择的 Codex 快捷配置方案不存在。');
  }

  const profiles = store.profiles.filter((record) => record.id !== profileId);
  const nextStore = await writeCodexQuickProfileStore({
    ...store,
    activeId: store.activeId === profileId ? '' : store.activeId,
    profiles
  });

  return {
    ...toCodexQuickProfileStorePayload(nextStore),
    deletedProfile: existing
  };
}

function getCodexEditableFile(kind) {
  if (kind === 'auth') {
    return {
      name: 'auth.json',
      path: getCodexAuthPath(),
      validate: validateJsonText
    };
  }

  if (kind === 'config') {
    return {
      name: 'config.toml',
      path: getCodexConfigPath(),
      validate: validateTomlText
    };
  }

  throw new Error(`未知 Codex 配置文件：${kind}`);
}

function formatBackupTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function parseBackupTimestamp(fileName, editableFileName) {
  const prefix = `${editableFileName}.bak-`;
  if (!fileName.startsWith(prefix)) {
    return null;
  }

  const stamp = fileName.slice(prefix.length);
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?$/.exec(stamp);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  const createdAt = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();

  return Number.isFinite(createdAt) ? createdAt : null;
}

async function getNextCodexBackupPath(configDir, fileName) {
  const baseName = `${fileName}.bak-${formatBackupTimestamp()}`;

  for (let index = 0; index < 1000; index += 1) {
    const backupName = index === 0 ? baseName : `${baseName}-${index}`;
    const backupPath = path.join(configDir, backupName);

    try {
      await fs.promises.access(backupPath, fs.constants.F_OK);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return backupPath;
      }
      throw error;
    }
  }

  throw new Error('无法生成唯一的 Codex 配置备份文件名。');
}

async function getCodexFileSnapshot(kind) {
  const file = getCodexEditableFile(kind);
  const configDir = getCodexConfigDir();

  try {
    const [content, stats] = await Promise.all([
      fs.promises.readFile(file.path, 'utf8'),
      fs.promises.stat(file.path)
    ]);

    return {
      kind,
      name: file.name,
      path: file.path,
      dir: configDir,
      exists: true,
      content,
      size: stats.size,
      modifiedAt: stats.mtimeMs
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        kind,
        name: file.name,
        path: file.path,
        dir: configDir,
        exists: false,
        content: '',
        size: 0,
        modifiedAt: null
      };
    }

    throw error;
  }
}

async function listCodexBackups(kind) {
  const file = getCodexEditableFile(kind);
  const configDir = getCodexConfigDir();
  const prefix = `${file.name}.bak-`;
  let entries = [];

  try {
    entries = await fs.promises.readdir(configDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
      .map(async (entry) => {
        const backupPath = path.join(configDir, entry.name);
        const stats = await fs.promises.stat(backupPath);

        return {
          name: entry.name,
          path: backupPath,
          size: stats.size,
          modifiedAt: stats.mtimeMs,
          createdAt: parseBackupTimestamp(entry.name, file.name)
        };
      })
  );

  return backups.sort((a, b) => {
    const aTime = a.createdAt || a.modifiedAt || 0;
    const bTime = b.createdAt || b.modifiedAt || 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return b.name.localeCompare(a.name);
  });
}

async function writeCodexFileText(kind, content) {
  const file = getCodexEditableFile(kind);
  file.validate(content);
  const configDir = getCodexConfigDir();
  const tempPath = path.join(configDir, `${file.name}.${process.pid}.${Date.now()}.tmp`);
  let backupPath = null;

  await fs.promises.mkdir(configDir, { recursive: true });

  try {
    const oldContent = await fs.promises.readFile(file.path);
    backupPath = await getNextCodexBackupPath(configDir, file.name);
    await fs.promises.writeFile(backupPath, oldContent);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await fs.promises.writeFile(tempPath, content, 'utf8');
    await fs.promises.rename(tempPath, file.path);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  const snapshot = await getCodexFileSnapshot(kind);
  return {
    ...snapshot,
    backupPath
  };
}

async function restoreCodexBackup(kind, backupName) {
  const file = getCodexEditableFile(kind);
  const configDir = getCodexConfigDir();

  if (typeof backupName !== 'string' || !backupName.trim()) {
    throw new Error('请选择要恢复的备份。');
  }

  const normalizedName = path.basename(backupName);
  const prefix = `${file.name}.bak-`;
  if (normalizedName !== backupName || !backupName.startsWith(prefix)) {
    throw new Error('备份文件名不属于当前 Codex 配置文件。');
  }

  const backupPath = path.join(configDir, normalizedName);
  let backupContent = '';

  try {
    backupContent = await fs.promises.readFile(backupPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('选择的备份文件不存在。');
    }

    throw error;
  }

  const snapshot = await writeCodexFileText(kind, backupContent);
  return {
    ...snapshot,
    restoredFrom: {
      name: normalizedName,
      path: backupPath
    }
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'CLI in One',
    backgroundColor: '#101114',
    autoHideMenuBar: true,
    icon: getStaticAssetPath('favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    killAllSessions();
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await prepareProgramStorage();

  ipcMain.handle('app:info', async () => {
    const historyDir = getDefaultHistoryDir();
    await fs.promises.mkdir(historyDir, { recursive: true }).catch(() => {});

    return {
      appVersion: app.getVersion(),
      defaultShell: getDefaultShell(),
      codexHomeDir: getCodexHomeDir(),
      historyDir,
      homeDir: getUserHomeDir(),
      ptyEnabled: Boolean(pty),
      ptyError: ptyLoadError ? ptyLoadError.message : null,
      platform: process.platform
    };
  });

  ipcMain.handle('app:system-stats', () => getSystemStats());

  ipcMain.handle('release:latest', (_event, options = {}) => {
    return getLatestReleaseSnapshot(Boolean(options.force));
  });

  ipcMain.handle('app:open-external', async (_event, url) => {
    await electronShell.openExternal(normalizeAllowedExternalUrl(url));
    return true;
  });

  ipcMain.handle('workspace:open-path', (_event, targetPath) => {
    return openLocalPath(targetPath);
  });

  ipcMain.handle('workspace:read-tree', (_event, options = {}) => {
    return readWorkspaceTreeSnapshot(options || {});
  });

  ipcMain.handle('workspace:read-skills', (_event, options = {}) => {
    return readWorkspaceSkillsSnapshot(options || {});
  });

  ipcMain.handle('codex-config:read', (_event, kind = 'config') => {
    return getCodexFileSnapshot(kind);
  });

  ipcMain.handle('codex-config:validate', (_event, kind = 'config', content) => {
    try {
      getCodexEditableFile(kind).validate(content || '');
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  });

  ipcMain.handle('codex-config:write', (_event, kind = 'config', content) => {
    return writeCodexFileText(kind, content || '');
  });

  ipcMain.handle('codex-config:list-backups', (_event, kind = 'config') => {
    return listCodexBackups(kind);
  });

  ipcMain.handle('codex-config:restore-backup', (_event, kind = 'config', backupName) => {
    return restoreCodexBackup(kind, backupName);
  });

  ipcMain.handle('codex-config:read-profile', () => {
    return getCodexProfileSnapshot();
  });

  ipcMain.handle('codex-config:write-profile', (_event, profile) => {
    return writeCodexProfile(profile);
  });

  ipcMain.handle('codex-config:list-quick-profiles', () => {
    return listCodexQuickProfiles();
  });

  ipcMain.handle('codex-config:save-quick-profile', (_event, payload) => {
    return saveCodexQuickProfile(payload);
  });

  ipcMain.handle('codex-config:delete-quick-profile', (_event, id) => {
    return deleteCodexQuickProfile(id);
  });

  ipcMain.handle('codex-config:open-folder', async () => {
    const dir = getCodexConfigDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const result = await electronShell.openPath(dir);
    if (result) {
      throw new Error(result);
    }
    return true;
  });

  ipcMain.handle('dialog:choose-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a working directory',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('dialog:choose-export-directory', async () => {
    const historyDir = getDefaultHistoryDir();
    await fs.promises.mkdir(historyDir, { recursive: true }).catch(() => {});

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a terminal export directory',
      defaultPath: historyDir,
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('command-dock:save-image', (_event, payload) => {
    return saveCommandDockImageAsset(payload || {});
  });

  ipcMain.handle('terminal:create', (event, options) => {
    return createTerminalSession(event.sender, options);
  });

  ipcMain.handle('terminal:kill', (_event, id) => {
    return killSession(id);
  });

  ipcMain.handle('terminal:kill-all', () => {
    killAllSessions();
    return true;
  });

  ipcMain.handle('terminal:export', (_event, id, options) => {
    return exportTerminalSession(id, options || {});
  });

  ipcMain.on('terminal:write', (_event, payload) => {
    const session = sessions.get(payload && payload.id);
    if (!session || typeof payload.data !== 'string') {
      return;
    }

    if (session.backend !== 'conpty') {
      appendTerminalTranscript(session, payload.data);
    }
    writeToSessionProcess(session, payload.data);
  });

  ipcMain.on('terminal:resize', (_event, payload) => {
    const session = sessions.get(payload && payload.id);
    if (!session || session.backend !== 'conpty' || !session.process || session.exited) {
      return;
    }

    const cols = clampNumber(payload.cols, 20, 500, 100);
    const rows = clampNumber(payload.rows, 5, 200, 28);

    try {
      session.process.resize(cols, rows);
    } catch {
      // Resizing can race with process exit; ignoring is fine.
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', killAllSessions);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
