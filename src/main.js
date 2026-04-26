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
const cursorModelCatalogCacheTtlMs = 10 * 60 * 1000;
let cursorModelCatalogCache = null;
const APP_STORAGE_DIR_NAME = '.cli-in-one';
const APP_FILES_DIR_NAME = '.files';
const AGENT_AVATARS_DIR_NAME = 'agent-avatars';
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
const CLAUDE_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh']);
const CLAUDE_PERMISSION_MODES = new Set(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']);
const CLAUDE_QUICK_PROFILES_FILE_NAME = 'claude-quick-profiles.json';
const QUICK_PROMPTS_FILE_NAME = 'quick-prompts.json';
const IMAGE_TOOLS_HTML_FILE_NAME = 'image-tools.html';
const QUICK_PROMPTS_MAX_ITEMS = 80;
const QUICK_PROMPT_MAX_LENGTH = 20000;
const IMAGE_API_CONFIG_FILE_NAME = 'image-api-config.json';
const USAGE_TRACKING_FILE_NAME = 'usage-tracking.json';
const USAGE_TRACKING_MAX_RECORDS = 2000;
const IMAGE_API_DEFAULT_MODEL = 'gpt-image-2';
const IMAGE_API_DEFAULT_SIZE = '1024x1024';
const IMAGE_API_DEFAULT_COUNT = 1;
const IMAGE_API_DISPATCH_TIMEOUT_MS = 60 * 1000;
const IMAGE_API_IMAGE_DOWNLOAD_TIMEOUT_MS = 90 * 1000;
const IMAGE_API_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const IMAGE_API_POLL_INITIAL_DELAY_MS = 2000;
const IMAGE_API_POLL_MAX_DELAY_MS = 10000;
const IMAGE_API_TASK_ID_PATTERN = /^[a-zA-Z0-9_.:-]{1,160}$/;
const RELEASE_REPOSITORY_OWNER = 'whd3131';
const RELEASE_REPOSITORY_NAME = 'cli-in-one';
const GITHUB_RELEASES_URL = `https://github.com/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases`;
const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases`;
const GITHUB_RELEASE_FETCH_TIMEOUT_MS = 12000;
const AGENT_AVATAR_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_API_SUCCESS_STATUSES = new Set([
  'complete',
  'completed',
  'done',
  'success',
  'succeeded'
]);
const IMAGE_API_FAILED_STATUSES = new Set([
  'cancelled',
  'canceled',
  'error',
  'failed',
  'rejected',
  'timeout',
  'timed_out'
]);
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

function getBundledChangelogPathCandidates() {
  return [
    path.join(app.getAppPath(), 'CHANGELOG.md'),
    path.join(__dirname, '..', 'CHANGELOG.md'),
    path.join(getAppBaseDir(), 'CHANGELOG.md')
  ];
}

function getAppBaseDir() {
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
}

function getProgramStorageDir() {
  return path.join(getAppBaseDir(), APP_STORAGE_DIR_NAME);
}

function getProgramFilesDir() {
  return path.join(getAppBaseDir(), APP_FILES_DIR_NAME);
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

function getClaudeQuickProfilesPath() {
  return path.join(getProgramStorageDir(), CLAUDE_QUICK_PROFILES_FILE_NAME);
}

function getQuickPromptsPath() {
  return path.join(getProgramStorageDir(), QUICK_PROMPTS_FILE_NAME);
}

function getImageApiConfigPath() {
  return path.join(getProgramStorageDir(), IMAGE_API_CONFIG_FILE_NAME);
}

async function openImageToolsPage() {
  const sourcePath = getStaticAssetPath(IMAGE_TOOLS_HTML_FILE_NAME);
  const targetPath = path.join(getProgramStorageDir(), IMAGE_TOOLS_HTML_FILE_NAME);
  const content = await fs.promises.readFile(sourcePath, 'utf8');

  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, content, 'utf8');

  const result = await electronShell.openPath(targetPath);
  if (result) {
    throw new Error(result);
  }

  return {
    path: targetPath
  };
}

function getUsageTrackingPath() {
  return path.join(getProgramStorageDir(), USAGE_TRACKING_FILE_NAME);
}

function normalizeReleaseVersion(value) {
  return asString(value).trim().replace(/^v/i, '');
}

function stripInlineMarkdown(value) {
  return asString(value)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

function parseChangelogHeading(line) {
  const heading = asString(line).trim();
  const match = /^##\s+(?:\[?v?([0-9][^\]\s)]*)\]?(?:\(([^)]+)\))?)?(?:\s+\(([^)]+)\))?/i.exec(heading);
  if (!match || !match[1]) {
    return null;
  }

  return {
    version: normalizeReleaseVersion(match[1]),
    url: asString(match[2]).trim(),
    date: asString(match[3]).trim()
  };
}

function parseChangelogEntry(content, requestedVersion) {
  const normalizedVersion = normalizeReleaseVersion(requestedVersion);
  if (!normalizedVersion) {
    return null;
  }

  const lines = asString(content).split(/\r\n|\r|\n/g);
  let selected = null;

  for (let index = 0; index <= lines.length; index += 1) {
    const line = index < lines.length ? lines[index] : '## __end__';
    if (!/^##\s+/.test(line)) {
      continue;
    }

    if (selected) {
      selected.endIndex = index;
      break;
    }

    const heading = parseChangelogHeading(line);
    if (heading?.version === normalizedVersion) {
      selected = {
        ...heading,
        startIndex: index + 1,
        endIndex: lines.length
      };
    }
  }

  if (!selected) {
    return null;
  }

  const sections = [];
  let currentSection = null;
  const entryLines = lines.slice(selected.startIndex, selected.endIndex);

  for (const rawLine of entryLines) {
    const line = asString(rawLine).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = /^###\s+(.+)$/.exec(line);
    if (sectionMatch) {
      currentSection = {
        title: stripInlineMarkdown(sectionMatch[1]),
        notes: []
      };
      sections.push(currentSection);
      continue;
    }

    const noteMatch = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (noteMatch) {
      if (!currentSection) {
        currentSection = { title: '', notes: [] };
        sections.push(currentSection);
      }

      const note = stripInlineMarkdown(noteMatch[1]);
      if (note) {
        currentSection.notes.push(note);
      }
    }
  }

  const normalizedSections = sections
    .map((section) => ({
      title: section.title,
      notes: section.notes.filter(Boolean)
    }))
    .filter((section) => section.title || section.notes.length > 0);

  return {
    date: selected.date,
    found: true,
    notes: normalizedSections.flatMap((section) => section.notes),
    sections: normalizedSections,
    url: selected.url,
    version: selected.version
  };
}

function parseReleaseBodyMarkdown(content, requestedVersion) {
  const changelogEntry = parseChangelogEntry(content, requestedVersion);
  if (changelogEntry && (changelogEntry.sections.length > 0 || changelogEntry.date)) {
    return changelogEntry;
  }

  const lines = asString(content).split(/\r\n|\r|\n/g);
  const sections = [];
  let currentSection = null;
  let detectedDate = '';
  let detectedVersion = normalizeReleaseVersion(requestedVersion);
  let paragraphLines = [];

  const ensureSection = () => {
    if (!currentSection) {
      currentSection = { title: '', notes: [] };
      sections.push(currentSection);
    }

    return currentSection;
  };

  const flushParagraph = () => {
    const note = stripInlineMarkdown(paragraphLines.join(' '));
    paragraphLines = [];
    if (note) {
      ensureSection().notes.push(note);
    }
  };

  for (const rawLine of lines) {
    const line = asString(rawLine).trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    if (/^#{1,2}\s+/.test(line)) {
      flushParagraph();
      const heading = parseChangelogHeading(line);
      if (heading?.date) {
        detectedDate = heading.date;
      }
      if (heading?.version) {
        detectedVersion = heading.version;
      }
      continue;
    }

    const sectionMatch = /^###\s+(.+)$/.exec(line);
    if (sectionMatch) {
      flushParagraph();
      currentSection = {
        title: stripInlineMarkdown(sectionMatch[1]),
        notes: []
      };
      sections.push(currentSection);
      continue;
    }

    const noteMatch = /^(?:[-*+]|\d+[.)])\s+(.+)$/.exec(line);
    if (noteMatch) {
      flushParagraph();
      const note = stripInlineMarkdown(noteMatch[1]);
      if (note) {
        ensureSection().notes.push(note);
      }
      continue;
    }

    paragraphLines.push(line);
  }

  flushParagraph();

  const normalizedSections = sections
    .map((section) => ({
      title: section.title,
      notes: section.notes.filter(Boolean)
    }))
    .filter((section) => section.title || section.notes.length > 0);

  return {
    date: detectedDate,
    found: asString(content).trim().length > 0,
    notes: normalizedSections.flatMap((section) => section.notes),
    sections: normalizedSections,
    url: '',
    version: detectedVersion
  };
}

async function readCurrentChangelogEntry(version) {
  const errors = [];
  const triedPaths = new Set();

  for (const candidatePath of getBundledChangelogPathCandidates()) {
    if (!candidatePath || triedPaths.has(candidatePath)) {
      continue;
    }

    triedPaths.add(candidatePath);

    try {
      const content = await fs.promises.readFile(candidatePath, 'utf8');
      const entry = parseChangelogEntry(content, version);
      return entry || {
        found: false,
        notes: [],
        path: candidatePath,
        sections: [],
        version: normalizeReleaseVersion(version)
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        errors.push(error.message || String(error));
      }
    }
  }

  return {
    error: errors[0] || 'CHANGELOG.md not found',
    found: false,
    notes: [],
    sections: [],
    version: normalizeReleaseVersion(version)
  };
}

function getReleaseTagCandidates(version) {
  const normalizedVersion = normalizeReleaseVersion(version);
  if (!normalizedVersion) {
    return [];
  }

  return [...new Set([`v${normalizedVersion}`, normalizedVersion])];
}

async function fetchGithubJson(url, { allowNotFound = false } = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('当前运行环境不支持 fetch。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_RELEASE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'CLI-in-One'
      },
      signal: controller.signal
    });

    if (response.status === 404 && allowNotFound) {
      return null;
    }

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = asString(payload?.message).trim();
      } catch {
        detail = await response.text().catch(() => '');
      }
      throw new Error(`GitHub Releases 返回 ${response.status}${detail ? `：${detail}` : ''}`);
    }

    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('GitHub Releases 请求超时。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeGithubReleaseChangelog(release, requestedVersion) {
  const tagName = asString(release?.tag_name).trim();
  const releaseVersion = normalizeReleaseVersion(tagName || release?.name || requestedVersion);
  const parsed = parseReleaseBodyMarkdown(release?.body || '', releaseVersion || requestedVersion);
  const releaseDate = asString(release?.published_at || release?.created_at).slice(0, 10);
  const releaseUrl = asString(release?.html_url).trim()
    || (tagName ? `${GITHUB_RELEASES_URL}/tag/${encodeURIComponent(tagName)}` : GITHUB_RELEASES_URL);

  return {
    ...parsed,
    date: parsed.date || releaseDate,
    found: true,
    source: 'github',
    tagName,
    title: stripInlineMarkdown(release?.name) || tagName || formatReleaseVersionLabel(releaseVersion),
    url: releaseUrl,
    version: releaseVersion || normalizeReleaseVersion(requestedVersion)
  };
}

function formatReleaseVersionLabel(version) {
  const normalizedVersion = normalizeReleaseVersion(version);
  return normalizedVersion ? `v${normalizedVersion}` : '';
}

async function fetchGithubReleaseForVersion(version) {
  const normalizedVersion = normalizeReleaseVersion(version);
  for (const tagName of getReleaseTagCandidates(normalizedVersion)) {
    const release = await fetchGithubJson(
      `${GITHUB_RELEASES_API_URL}/tags/${encodeURIComponent(tagName)}`,
      { allowNotFound: true }
    );

    if (release) {
      return release;
    }
  }

  const releases = await fetchGithubJson(`${GITHUB_RELEASES_API_URL}?per_page=50`);
  if (!Array.isArray(releases)) {
    return null;
  }

  return releases.find((release) => (
    normalizeReleaseVersion(release?.tag_name) === normalizedVersion ||
    normalizeReleaseVersion(release?.name) === normalizedVersion
  )) || null;
}

async function readGithubReleaseChangelog(version) {
  const normalizedVersion = normalizeReleaseVersion(version);
  const release = await fetchGithubReleaseForVersion(normalizedVersion);
  if (!release) {
    return {
      found: false,
      notes: [],
      sections: [],
      source: 'github',
      url: GITHUB_RELEASES_URL,
      version: normalizedVersion
    };
  }

  return normalizeGithubReleaseChangelog(release, normalizedVersion);
}

async function readReleaseChangelog(version) {
  const normalizedVersion = normalizeReleaseVersion(version || app.getVersion());

  try {
    const githubEntry = await readGithubReleaseChangelog(normalizedVersion);
    if (githubEntry.found) {
      return githubEntry;
    }

    const localEntry = await readCurrentChangelogEntry(normalizedVersion);
    if (localEntry.found) {
      return {
        ...localEntry,
        fallbackReason: 'github-release-not-found',
        source: 'local',
        url: githubEntry.url || GITHUB_RELEASES_URL
      };
    }

    return githubEntry;
  } catch (error) {
    const localEntry = await readCurrentChangelogEntry(normalizedVersion).catch(() => null);
    if (localEntry?.found) {
      return {
        ...localEntry,
        fallbackReason: error?.message || String(error),
        source: 'local',
        url: GITHUB_RELEASES_URL
      };
    }

    return {
      error: error?.message || String(error),
      found: false,
      notes: [],
      sections: [],
      source: 'github',
      url: GITHUB_RELEASES_URL,
      version: normalizedVersion
    };
  }
}

function getAgentAvatarsDir() {
  return path.join(getProgramStorageDir(), AGENT_AVATARS_DIR_NAME);
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

async function readClaudeSettingsConfig() {
  try {
    const content = await fs.promises.readFile(getClaudeSettingsPath(), 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error instanceof SyntaxError)) {
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

function getClaudeConfigDir() {
  return path.join(getUserHomeDir(), '.claude');
}

function getClaudeSettingsPath() {
  return path.join(getClaudeConfigDir(), 'settings.json');
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

async function openExternalUrl(targetUrl) {
  const normalizedUrl = asString(targetUrl).trim();
  if (!normalizedUrl) {
    throw new Error('没有可打开的链接。');
  }

  let parsed;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error('链接地址无效。');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('只支持打开 http(s) 链接。');
  }

  await electronShell.openExternal(parsed.toString());
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

function createDefaultUsageTrackingStore() {
  return {
    version: 1,
    rates: {},
    records: []
  };
}

function normalizeUsageRate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeUsageRates(rates = {}) {
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rates)
      .map(([key, value]) => {
        const providerId = asString(key).trim();
        if (!providerId) {
          return null;
        }

        const costPerMillionTokens = typeof value === 'object' && value !== null
          ? normalizeUsageRate(value.costPerMillionTokens)
          : normalizeUsageRate(value);

        return [providerId, { costPerMillionTokens }];
      })
      .filter(Boolean)
  );
}

function normalizeUsageRecord(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }

  const id = asString(record.id).trim();
  if (!id) {
    return null;
  }

  return {
    id,
    title: asString(record.title).trim(),
    cwd: asString(record.cwd).trim(),
    cliProviderId: asString(record.cliProviderId, 'shell').trim() || 'shell',
    model: asString(record.model).trim(),
    providerName: asString(record.providerName).trim(),
    initialCommand: asString(record.initialCommand).trim(),
    status: asString(record.status).trim(),
    backend: asString(record.backend).trim(),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
    endedAt: Number.isFinite(record.endedAt) ? record.endedAt : Date.now(),
    runtimeMs: Number.isFinite(record.runtimeMs) ? Math.max(0, record.runtimeMs) : 0,
    transcriptBytes: Number.isFinite(record.transcriptBytes) ? Math.max(0, record.transcriptBytes) : 0,
    outputChars: Number.isFinite(record.outputChars) ? Math.max(0, record.outputChars) : 0,
    estimatedTokens: Number.isFinite(record.estimatedTokens) ? Math.max(0, record.estimatedTokens) : 0,
    exitCode: Number.isFinite(record.exitCode) ? record.exitCode : null,
    signal: asString(record.signal).trim() || null
  };
}

function normalizeUsageTrackingStore(raw = {}) {
  const records = Array.isArray(raw?.records)
    ? raw.records.map(normalizeUsageRecord).filter(Boolean)
    : [];

  return {
    version: 1,
    rates: normalizeUsageRates(raw?.rates),
    records: records.slice(-USAGE_TRACKING_MAX_RECORDS)
  };
}

function readUsageTrackingStoreSync() {
  const usagePath = getUsageTrackingPath();

  try {
    const content = fs.readFileSync(usagePath, 'utf8');
    return normalizeUsageTrackingStore(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return createDefaultUsageTrackingStore();
    }

    if (error instanceof SyntaxError) {
      return createDefaultUsageTrackingStore();
    }

    throw error;
  }
}

function writeUsageTrackingStoreSync(store) {
  const usagePath = getUsageTrackingPath();
  const normalized = normalizeUsageTrackingStore(store);
  const tempPath = path.join(
    path.dirname(usagePath),
    `${USAGE_TRACKING_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
  );

  fs.mkdirSync(path.dirname(usagePath), { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');

  try {
    fs.renameSync(tempPath, usagePath);
  } catch (error) {
    if (process.platform === 'win32' && fs.existsSync(usagePath)) {
      fs.rmSync(usagePath, { force: true });
      fs.renameSync(tempPath, usagePath);
      return normalized;
    }

    fs.rmSync(tempPath, { force: true });
    throw error;
  }

  return normalized;
}

function estimateUsageTokensFromText(text) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return 0;
  }

  return Math.ceil(normalizedText.length / 4);
}

function buildUsageRecordFromSession(session, endedAt = Date.now()) {
  if (!session) {
    return null;
  }

  const body = normalizeTranscriptText((session.transcriptChunks || []).join(''));
  const createdAt = Number.isFinite(session.createdAt) ? session.createdAt : endedAt;
  const exitCode = Number.isFinite(session.exitCode) ? session.exitCode : null;
  const signal = asString(session.signal).trim() || null;

  return normalizeUsageRecord({
    id: `${session.id}-${endedAt}`,
    title: session.title,
    cwd: session.cwd,
    cliProviderId: session.cliProviderId || 'shell',
    model: asString(session.codexModel).trim(),
    providerName: asString(session.codexProviderName).trim(),
    initialCommand: session.initialCommand,
    status: exitCode === 0 && !signal ? 'completed' : (signal ? 'killed' : 'ended'),
    backend: session.backend,
    createdAt,
    endedAt,
    runtimeMs: endedAt - createdAt,
    transcriptBytes: session.transcriptBytes || Buffer.byteLength(body, 'utf8'),
    outputChars: body.length,
    estimatedTokens: estimateUsageTokensFromText(body),
    exitCode,
    signal
  });
}

function recordUsageForSession(session, endedAt = Date.now()) {
  if (!session || session.usageRecorded) {
    return null;
  }

  const record = buildUsageRecordFromSession(session, endedAt);
  session.usageRecorded = true;
  if (!record) {
    return null;
  }

  try {
    const store = readUsageTrackingStoreSync();
    const records = [...store.records, record].slice(-USAGE_TRACKING_MAX_RECORDS);
    writeUsageTrackingStoreSync({
      ...store,
      records
    });
  } catch (error) {
    console.warn(`[usage] failed to record terminal usage: ${error.message}`);
  }

  return record;
}

function readUsageTrackingPayload() {
  const store = readUsageTrackingStoreSync();
  return {
    path: getUsageTrackingPath(),
    ...store
  };
}

function writeUsageTrackingRates(rates = {}) {
  const store = readUsageTrackingStoreSync();
  const nextStore = writeUsageTrackingStoreSync({
    ...store,
    rates: normalizeUsageRates(rates)
  });

  return {
    path: getUsageTrackingPath(),
    ...nextStore
  };
}

function clearUsageTrackingRecords() {
  const store = readUsageTrackingStoreSync();
  const nextStore = writeUsageTrackingStoreSync({
    ...store,
    records: []
  });

  return {
    path: getUsageTrackingPath(),
    ...nextStore
  };
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
  const normalizedMimeType = typeof mimeType === 'string'
    ? mimeType.trim().toLowerCase().split(';')[0].trim()
    : '';
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

function isSupportedImageAsset(fileName, mimeType) {
  const normalizedMimeType = typeof mimeType === 'string'
    ? mimeType.trim().toLowerCase().split(';')[0].trim()
    : '';
  const originalExtension = typeof fileName === 'string'
    ? path.extname(fileName).trim().toLowerCase()
    : '';

  return imageExtensions.has(originalExtension) || imageExtensionByMimeType.has(normalizedMimeType);
}

async function saveCommandDockImageAsset(options = {}) {
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
  const assetDir = getProgramFilesDir();
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

async function saveAgentAvatarAsset(options = {}) {
  const buffer = normalizeBinaryPayload(options.bytes);
  if (buffer.length === 0) {
    throw new Error('头像内容为空。');
  }
  if (buffer.length > AGENT_AVATAR_MAX_BYTES) {
    throw new Error('头像不能超过 8 MB。');
  }

  const rawFileName = asString(options.fileName).trim();
  const mimeType = asString(options.mimeType).trim().toLowerCase();
  if (!isSupportedImageAsset(rawFileName, mimeType)) {
    throw new Error('请选择图片文件。');
  }

  const extension = inferImageExtension(rawFileName, mimeType);
  const agentId = sanitizeFileNamePart(asString(options.agentId).trim(), 'agent');
  const baseName = sanitizeFileNamePart(
    rawFileName ? path.basename(rawFileName, path.extname(rawFileName)) : 'avatar',
    'avatar'
  );
  const assetDir = getAgentAvatarsDir();
  await fs.promises.mkdir(assetDir, { recursive: true });

  const filePath = await getUniqueFilePath(
    assetDir,
    `${formatFileTimestamp()}-${agentId}-${baseName}`,
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

function createDefaultImageApiConfig() {
  return {
    version: 1,
    baseUrl: '',
    apiKey: '',
    model: IMAGE_API_DEFAULT_MODEL,
    n: IMAGE_API_DEFAULT_COUNT,
    size: IMAGE_API_DEFAULT_SIZE
  };
}

function normalizeImageApiUrl(value) {
  const trimmed = asString(value).trim();
  if (!trimmed) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('图像 API URL 必须是有效的 http(s) 地址。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('图像 API URL 只支持 http 或 https。');
  }

  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/+$/, '');
}

function normalizeImageApiCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return IMAGE_API_DEFAULT_COUNT;
  }

  return Math.min(4, Math.max(1, parsed));
}

function normalizeImageApiSize(value) {
  const size = asString(value, IMAGE_API_DEFAULT_SIZE).trim() || IMAGE_API_DEFAULT_SIZE;
  if (size === 'auto' || /^\d{2,5}x\d{2,5}$/i.test(size)) {
    return size;
  }

  throw new Error('图像尺寸必须类似 1024x1024，或使用 auto。');
}

function normalizeImageApiConfig(raw = {}, previousConfig = createDefaultImageApiConfig()) {
  const previous = {
    ...createDefaultImageApiConfig(),
    ...(previousConfig || {})
  };
  const hasApiKeyUpdate = Object.prototype.hasOwnProperty.call(raw || {}, 'apiKey');
  const nextApiKey = hasApiKeyUpdate && asString(raw.apiKey).trim()
    ? asString(raw.apiKey).trim()
    : raw?.clearApiKey ? '' : previous.apiKey;

  return {
    version: 1,
    baseUrl: normalizeImageApiUrl(raw?.baseUrl ?? previous.baseUrl),
    apiKey: nextApiKey,
    model: asString(raw?.model, previous.model).trim() || IMAGE_API_DEFAULT_MODEL,
    n: normalizeImageApiCount(raw?.n ?? previous.n),
    size: normalizeImageApiSize(raw?.size ?? previous.size)
  };
}

function redactImageApiConfig(config) {
  const normalized = {
    ...createDefaultImageApiConfig(),
    ...(config || {})
  };

  return {
    path: getImageApiConfigPath(),
    baseUrl: normalized.baseUrl || '',
    configured: Boolean(normalized.baseUrl && normalized.apiKey),
    apiKeySet: Boolean(normalized.apiKey),
    model: normalized.model || IMAGE_API_DEFAULT_MODEL,
    n: normalizeImageApiCount(normalized.n),
    size: normalized.size || IMAGE_API_DEFAULT_SIZE
  };
}

async function readImageApiConfig({ includeSecret = false } = {}) {
  const configPath = getImageApiConfigPath();
  let raw = {};

  try {
    const content = await fs.promises.readFile(configPath, 'utf8');
    raw = JSON.parse(content);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      const defaults = createDefaultImageApiConfig();
      return includeSecret ? defaults : redactImageApiConfig(defaults);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`图像 API 配置文件不是有效 JSON：${error.message}`);
    }

    throw error;
  }

  const normalized = normalizeImageApiConfig(raw, createDefaultImageApiConfig());
  return includeSecret ? normalized : redactImageApiConfig(normalized);
}

async function writeImageApiConfig(payload = {}) {
  const previousConfig = await readImageApiConfig({ includeSecret: true });
  const nextConfig = normalizeImageApiConfig(payload || {}, previousConfig);
  const configPath = getImageApiConfigPath();
  const tempPath = path.join(
    path.dirname(configPath),
    `${IMAGE_API_CONFIG_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
  );

  await fs.promises.mkdir(path.dirname(configPath), { recursive: true });

  try {
    await fs.promises.writeFile(tempPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tempPath, configPath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return redactImageApiConfig(nextConfig);
}

function buildImageApiUrls(baseUrl) {
  const normalizedBaseUrl = normalizeImageApiUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error('请先配置图像 API URL。');
  }

  const parsed = new URL(normalizedBaseUrl);
  const rawPathName = parsed.pathname.replace(/\/+$/, '');
  const pathName = rawPathName === '/' ? '' : rawPathName;
  const lowerPathName = pathName.toLowerCase();

  if (lowerPathName.endsWith('/images/generations')) {
    const prefix = pathName.slice(0, -'/images/generations'.length);
    const taskBasePath = `${prefix}/images/tasks`;
    return {
      generationUrl: `${parsed.origin}${pathName}`,
      taskBaseUrl: `${parsed.origin}${taskBasePath}`,
      origin: parsed.origin
    };
  }

  if (lowerPathName.endsWith('/images')) {
    return {
      generationUrl: `${parsed.origin}${pathName}/generations`,
      taskBaseUrl: `${parsed.origin}${pathName}/tasks`,
      origin: parsed.origin
    };
  }

  const basePath = pathName || '/v1';
  return {
    generationUrl: `${parsed.origin}${basePath}/images/generations`,
    taskBaseUrl: `${parsed.origin}${basePath}/images/tasks`,
    origin: parsed.origin
  };
}

function getImageApiRequestHeaders(config) {
  if (!config.apiKey) {
    throw new Error('请先配置图像 API Key。');
  }

  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  if (typeof fetch !== 'function') {
    throw new Error('当前运行环境不支持 fetch，无法调用图像 API。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('图像 API 请求超时。');
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getImageApiErrorMessage(body) {
  if (!body || typeof body !== 'object') {
    return '';
  }

  const error = body.error;
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    return asString(error.message) || asString(error.detail) || asString(error.code);
  }

  return asString(body.message) || asString(body.detail);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

async function fetchImageApiJson(url, options = {}, timeoutMs = IMAGE_API_DISPATCH_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  const body = await readJsonResponse(response);

  if (!response.ok) {
    const message = getImageApiErrorMessage(body) || response.statusText || '请求失败';
    throw new Error(`图像 API 请求失败 (${response.status})：${message}`);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('图像 API 返回内容不是有效对象。');
  }

  return body;
}

function getImageApiResultUrlEntries(result, config) {
  const entries = [];
  const seen = new Set();
  const addUrl = (url, fileId = '') => {
    const rawUrl = asString(url).trim();
    if (!rawUrl || seen.has(rawUrl)) {
      return;
    }
    seen.add(rawUrl);
    entries.push({
      type: 'url',
      url: new URL(rawUrl, buildImageApiUrls(config.baseUrl).origin).toString(),
      fileId: asString(fileId).trim()
    });
  };
  const addBase64 = (base64, mimeType = '') => {
    const rawBase64 = asString(base64).trim();
    if (!rawBase64) {
      return;
    }
    const key = rawBase64.slice(0, 160);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    entries.push({
      type: 'base64',
      b64Json: rawBase64,
      mimeType: asString(mimeType).trim()
    });
  };

  if (Array.isArray(result?.data)) {
    for (const item of result.data) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      addUrl(item.url, item.file_id || item.fileId);
      addBase64(item.b64_json || item.b64Json, item.mime_type || item.mimeType);
    }
  }

  if (Array.isArray(result?.image_urls)) {
    result.image_urls.forEach((url) => addUrl(url));
  }

  if (entries.length === 0 && Array.isArray(result?.source_image_urls)) {
    result.source_image_urls.forEach((url) => addUrl(url));
  }

  return entries;
}

function isImageApiTaskSuccessful(result, config) {
  const status = asString(result?.status).trim().toLowerCase();
  if (status && !IMAGE_API_SUCCESS_STATUSES.has(status)) {
    return false;
  }

  return getImageApiResultUrlEntries(result, config).length > 0;
}

function isImageApiTaskFailed(result) {
  const status = asString(result?.status).trim().toLowerCase();
  return IMAGE_API_FAILED_STATUSES.has(status);
}

function createImageApiTaskId() {
  return `image-task-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`;
}

function normalizeImageApiClientTaskId(taskId) {
  const normalized = asString(taskId).trim();
  return IMAGE_API_TASK_ID_PATTERN.test(normalized) ? normalized : createImageApiTaskId();
}

function serializeImageApiTask(task) {
  return {
    id: asString(task?.id),
    taskId: asString(task?.taskId),
    status: asString(task?.status || 'queued'),
    prompt: asString(task?.prompt),
    created: task?.created || null,
    createdAt: task?.createdAt || null,
    updatedAt: task?.updatedAt || null,
    finishedAt: task?.finishedAt || null,
    model: asString(task?.model),
    n: Number.isFinite(Number.parseInt(task?.n, 10)) ? Number.parseInt(task?.n, 10) : null,
    size: asString(task?.size),
    images: Array.isArray(task?.images) ? task.images : [],
    imageUrls: Array.isArray(task?.imageUrls) ? task.imageUrls : [],
    creditCost: task?.creditCost ?? null,
    error: asString(task?.error)
  };
}

function emitImageApiTaskUpdate(webContents, task) {
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  webContents.send('image-api:task-update', serializeImageApiTask(task));
}

function updateImageApiTask(webContents, task, patch = {}) {
  Object.assign(task, patch, { updatedAt: Date.now() });

  const status = asString(task.status).trim().toLowerCase();
  if ((status === 'success' || status === 'failed') && !task.finishedAt) {
    task.finishedAt = task.updatedAt;
  }

  emitImageApiTaskUpdate(webContents, task);
  return task;
}

async function pollImageApiTask(config, taskId, options = {}) {
  const id = asString(taskId).trim();
  if (!id) {
    throw new Error('图像 API 未返回 task_id。');
  }

  const { taskBaseUrl } = buildImageApiUrls(config.baseUrl);
  const headers = getImageApiRequestHeaders(config);
  const startedAt = Date.now();
  let delayMs = IMAGE_API_POLL_INITIAL_DELAY_MS;

  while (Date.now() - startedAt < IMAGE_API_POLL_TIMEOUT_MS) {
    await sleep(delayMs);

    const taskUrl = `${taskBaseUrl}/${encodeURIComponent(id)}`;
    const result = await fetchImageApiJson(taskUrl, {
      method: 'GET',
      headers
    }, IMAGE_API_DISPATCH_TIMEOUT_MS);

    if (typeof options.onResult === 'function') {
      try {
        options.onResult(result);
      } catch {
        // Task status notifications should not interrupt polling.
      }
    }

    if (isImageApiTaskSuccessful(result, config)) {
      return result;
    }

    if (isImageApiTaskFailed(result)) {
      throw new Error(getImageApiErrorMessage(result) || result.error || '图像任务失败。');
    }

    if (result?.finished_at && getImageApiResultUrlEntries(result, config).length === 0) {
      throw new Error(getImageApiErrorMessage(result) || '图像任务已结束，但没有返回图片。');
    }

    delayMs = Math.min(IMAGE_API_POLL_MAX_DELAY_MS, Math.round(delayMs * 1.6));
  }

  throw new Error('图像任务轮询超时。');
}

function inferImageExtensionFromUrl(url, mimeType) {
  let fileName = '';
  try {
    fileName = path.posix.basename(new URL(url).pathname);
  } catch {
    fileName = '';
  }

  return inferImageExtension(fileName, mimeType);
}

async function saveImageApiBufferAsset(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('图像 API 返回的图片内容为空。');
  }

  const assetDir = getProgramFilesDir();
  await fs.promises.mkdir(assetDir, { recursive: true });

  const filePath = await getUniqueFilePath(
    assetDir,
    `${formatFileTimestamp()}-${sanitizeFileNamePart(options.baseName, 'generated-image')}`,
    options.extension || '.png'
  );

  await fs.promises.writeFile(filePath, buffer);
  const stats = await fs.promises.stat(filePath);

  return {
    path: filePath,
    dir: assetDir,
    name: path.basename(filePath),
    size: stats.size,
    sourceUrl: options.sourceUrl || '',
    fileId: options.fileId || ''
  };
}

async function saveImageApiUrlAsset(entry) {
  const response = await fetchWithTimeout(entry.url, {}, IMAGE_API_IMAGE_DOWNLOAD_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`下载生成图片失败 (${response.status})：${response.statusText || entry.url}`);
  }

  const mimeType = response.headers.get('content-type') || '';
  const extension = inferImageExtensionFromUrl(entry.url, mimeType);
  const buffer = Buffer.from(await response.arrayBuffer());

  return saveImageApiBufferAsset(buffer, {
    baseName: 'generated-image',
    extension,
    sourceUrl: entry.url,
    fileId: entry.fileId
  });
}

async function saveImageApiBase64Asset(entry) {
  const dataUrlMatch = /^data:([^;,]+)?;base64,(.+)$/i.exec(entry.b64Json);
  const mimeType = dataUrlMatch?.[1] || entry.mimeType || 'image/png';
  const rawBase64 = dataUrlMatch ? dataUrlMatch[2] : entry.b64Json;
  const extension = inferImageExtension('', mimeType);
  const buffer = Buffer.from(rawBase64, 'base64');

  return saveImageApiBufferAsset(buffer, {
    baseName: 'generated-image',
    extension
  });
}

async function saveImageApiResultAssets(result, config) {
  const entries = getImageApiResultUrlEntries(result, config);
  const images = [];

  for (const entry of entries) {
    if (entry.type === 'url') {
      images.push(await saveImageApiUrlAsset(entry));
    } else if (entry.type === 'base64') {
      images.push(await saveImageApiBase64Asset(entry));
    }
  }

  if (images.length === 0) {
    throw new Error('图像 API 没有返回可保存的图片。');
  }

  return images;
}

async function finishImageApiTask(webContents, task, config, dispatched) {
  try {
    let result = dispatched;

    if (!isImageApiTaskSuccessful(dispatched, config)) {
      if (isImageApiTaskFailed(dispatched)) {
        throw new Error(getImageApiErrorMessage(dispatched) || dispatched.error || '图像任务失败。');
      }

      const remoteTaskId = asString(dispatched.task_id || dispatched.taskId).trim();
      if (!remoteTaskId) {
        throw new Error('图像 API 未返回 task_id。');
      }

      updateImageApiTask(webContents, task, {
        taskId: remoteTaskId,
        status: asString(dispatched.status || 'running') || 'running',
        created: dispatched.created || null
      });

      result = await pollImageApiTask(config, remoteTaskId, {
        onResult: (pollResult) => {
          if (isImageApiTaskSuccessful(pollResult, config) || isImageApiTaskFailed(pollResult)) {
            return;
          }

          const status = asString(pollResult?.status).trim();
          updateImageApiTask(webContents, task, {
            status: status || 'running',
            finishedAt: pollResult?.finished_at || null
          });
        }
      });
    }

    if (isImageApiTaskFailed(result)) {
      throw new Error(getImageApiErrorMessage(result) || result.error || '图像任务失败。');
    }

    updateImageApiTask(webContents, task, {
      taskId: asString(result.task_id || result.taskId || task.taskId),
      status: 'saving',
      created: result.created || task.created || null,
      finishedAt: result.finished_at || task.finishedAt || null,
      creditCost: result.credit_cost ?? task.creditCost ?? null
    });

    const images = await saveImageApiResultAssets(result, config);

    updateImageApiTask(webContents, task, {
      taskId: asString(result.task_id || result.taskId || task.taskId),
      status: 'success',
      created: result.created || task.created || null,
      finishedAt: result.finished_at || Date.now(),
      images,
      imageUrls: images.map((image) => image.path),
      creditCost: result.credit_cost ?? null,
      error: ''
    });
  } catch (error) {
    updateImageApiTask(webContents, task, {
      status: 'failed',
      error: error?.message || '图像任务失败。'
    });
  }
}

async function generateImageWithApi(options = {}, context = {}) {
  const prompt = asString(options.prompt).trim();
  if (!prompt) {
    throw new Error('请输入图片提示词。');
  }

  const savedConfig = await readImageApiConfig({ includeSecret: true });
  const config = {
    ...savedConfig,
    model: asString(options.model, savedConfig.model).trim() || IMAGE_API_DEFAULT_MODEL,
    n: normalizeImageApiCount(options.n ?? savedConfig.n),
    size: normalizeImageApiSize(options.size ?? savedConfig.size)
  };
  const { generationUrl } = buildImageApiUrls(config.baseUrl);
  const requestUrl = new URL(generationUrl);
  requestUrl.searchParams.set('async', '1');

  const body = {
    model: config.model || IMAGE_API_DEFAULT_MODEL,
    prompt,
    n: normalizeImageApiCount(config.n),
    size: config.size || IMAGE_API_DEFAULT_SIZE
  };
  const referenceImages = Array.isArray(options.referenceImageUrls)
    ? options.referenceImageUrls.map((url) => asString(url).trim()).filter(Boolean)
    : [];
  if (referenceImages.length > 0) {
    body.reference_images = referenceImages;
  }

  const dispatched = await fetchImageApiJson(requestUrl.toString(), {
    method: 'POST',
    headers: getImageApiRequestHeaders(config),
    body: JSON.stringify(body)
  }, IMAGE_API_DISPATCH_TIMEOUT_MS);

  const task = {
    id: normalizeImageApiClientTaskId(options.clientTaskId || options.id),
    taskId: asString(dispatched.task_id || dispatched.taskId),
    model: body.model,
    n: body.n,
    size: body.size,
    status: isImageApiTaskSuccessful(dispatched, config)
      ? 'saving'
      : (asString(dispatched.status || 'queued') || 'queued'),
    prompt,
    created: dispatched.created || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: dispatched.finished_at || null,
    images: [],
    imageUrls: [],
    creditCost: dispatched.credit_cost ?? null,
    error: ''
  };

  setImmediate(() => {
    void finishImageApiTask(context.webContents, task, config, dispatched);
  });

  return serializeImageApiTask(task);
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

async function resolveClaudeSessionMeta(initialCommand) {
  const settings = await readClaudeSettingsConfig();
  const env = getJsonObject(settings?.env);
  const modelFromCommand = asString(getLastCommandOptionValue(initialCommand, ['-m', '--model'])).trim();
  const configuredModel = asString(
    env.ANTHROPIC_MODEL
    || env.CLAUDE_CODE_MODEL
    || settings?.model
    || ''
  ).trim();

  return {
    codexModel: modelFromCommand || configuredModel,
    codexProviderName: 'Claude'
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

  if (cliProviderId === 'claude-code') {
    try {
      return {
        ...baseMeta,
        ...(await resolveClaudeSessionMeta(initialCommand))
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
        const endedAt = Date.now();
        current.exited = true;
        current.endedAt = endedAt;
        current.exitCode = exitCode;
        current.signal = signal || null;
        current.process = null;
        recordUsageForSession(current, endedAt);
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
        const endedAt = Date.now();
        current.exited = true;
        current.endedAt = endedAt;
        current.exitCode = exitCode;
        current.signal = signal || null;
        current.process = null;
        recordUsageForSession(current, endedAt);
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

  const endedAt = Date.now();
  session.exited = true;
  session.endedAt = endedAt;
  session.signal = session.signal || 'killed';
  recordUsageForSession(session, endedAt);
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

function validateJsonText(content, fileLabel = 'auth.json') {
  if (typeof content !== 'string') {
    throw new Error(`${fileLabel} 内容必须是文本。`);
  }

  if (!content.trim()) {
    throw new Error(`${fileLabel} 不能为空；如果要清空配置，请写 {}。`);
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

function parseClaudeSettings(content) {
  if (!content || !content.trim()) {
    return {};
  }

  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('settings.json 根节点必须是 JSON 对象。');
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

function normalizeClaudeUrl(value) {
  const trimmed = asString(value).trim();
  if (!trimmed) {
    return '';
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Claude Code Base URL 必须是有效的 http(s) 地址。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Claude Code Base URL 只支持 http 或 https。');
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

function getJsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getClaudeProfileModel(settings) {
  const env = getJsonObject(settings?.env);
  return asString(env.ANTHROPIC_MODEL)
    || asString(env.CLAUDE_CODE_MODEL)
    || asString(settings?.model);
}

function getClaudeProfileEffortLevel(settings) {
  const env = getJsonObject(settings?.env);
  const rawEffortLevel = asString(env.CLAUDE_CODE_EFFORT_LEVEL) || asString(settings?.effortLevel);
  const effortLevel = rawEffortLevel.trim();
  return CLAUDE_EFFORT_LEVELS.has(effortLevel) ? effortLevel : '';
}

function buildClaudeProfile(settingsSnapshot) {
  const settings = parseClaudeSettings(settingsSnapshot.content || '');
  const env = getJsonObject(settings.env);
  const permissions = getJsonObject(settings.permissions);
  const permissionMode = asString(permissions.defaultMode).trim();

  return {
    apiKey: asString(env.ANTHROPIC_API_KEY),
    baseUrl: asString(env.ANTHROPIC_BASE_URL),
    effortLevel: getClaudeProfileEffortLevel(settings),
    model: getClaudeProfileModel(settings),
    permissionMode: CLAUDE_PERMISSION_MODES.has(permissionMode) ? permissionMode : ''
  };
}

async function getClaudeProfileSnapshot() {
  const settingsSnapshot = await getClaudeFileSnapshot('settings');

  return {
    settings: settingsSnapshot,
    profile: buildClaudeProfile(settingsSnapshot)
  };
}

function normalizeClaudeProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Claude Code 配置必须是对象。');
  }

  const rawBaseUrl = asString(profile.baseUrl).trim();
  const baseUrl = rawBaseUrl ? normalizeClaudeUrl(rawBaseUrl) : '';
  const effortLevel = asString(profile.effortLevel).trim();
  const permissionMode = asString(profile.permissionMode).trim();

  if (effortLevel && !CLAUDE_EFFORT_LEVELS.has(effortLevel)) {
    throw new Error('Claude Code effortLevel 只能是 low、medium、high 或 xhigh。');
  }

  if (permissionMode && !CLAUDE_PERMISSION_MODES.has(permissionMode)) {
    throw new Error('Claude Code 默认权限模式不受支持。');
  }

  return {
    apiKey: asString(profile.apiKey).trim(),
    baseUrl,
    effortLevel,
    model: asString(profile.model).trim(),
    permissionMode
  };
}

function pruneEmptyObject(parent, key) {
  if (
    parent[key]
    && typeof parent[key] === 'object'
    && !Array.isArray(parent[key])
    && Object.keys(parent[key]).length === 0
  ) {
    delete parent[key];
  }
}

function applyClaudeProfileToSettings(content, profile) {
  const settings = parseClaudeSettings(content || '');
  const nextSettings = { ...settings };
  const env = { ...getJsonObject(nextSettings.env) };

  if (profile.apiKey) {
    env.ANTHROPIC_API_KEY = profile.apiKey;
  } else {
    delete env.ANTHROPIC_API_KEY;
  }

  if (profile.baseUrl) {
    env.ANTHROPIC_BASE_URL = profile.baseUrl;
  } else {
    delete env.ANTHROPIC_BASE_URL;
  }

  delete env.ANTHROPIC_MODEL;
  delete env.CLAUDE_CODE_MODEL;
  delete env.CLAUDE_CODE_EFFORT_LEVEL;

  if (Object.keys(env).length > 0) {
    nextSettings.env = env;
  } else {
    delete nextSettings.env;
  }

  if (profile.model) {
    nextSettings.model = profile.model;
  } else {
    delete nextSettings.model;
  }

  if (profile.effortLevel) {
    nextSettings.effortLevel = profile.effortLevel;
  } else {
    delete nextSettings.effortLevel;
  }

  if (profile.permissionMode || getJsonObject(nextSettings.permissions) === nextSettings.permissions) {
    const permissions = { ...getJsonObject(nextSettings.permissions) };
    if (profile.permissionMode) {
      permissions.defaultMode = profile.permissionMode;
    } else {
      delete permissions.defaultMode;
    }
    nextSettings.permissions = permissions;
    pruneEmptyObject(nextSettings, 'permissions');
  }

  const nextContent = `${JSON.stringify(nextSettings, null, 2)}\n`;
  validateJsonText(nextContent, 'settings.json');
  return nextContent;
}

async function writeClaudeProfile(profilePayload) {
  const profile = normalizeClaudeProfile(profilePayload);
  const settingsSnapshot = await getClaudeFileSnapshot('settings');
  const nextSettings = applyClaudeProfileToSettings(settingsSnapshot.content || '', profile);
  const settingsResult = await writeClaudeFileText('settings', nextSettings);
  const snapshot = await getClaudeProfileSnapshot();

  return {
    ...snapshot,
    backups: {
      settings: settingsResult.backupPath || null
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

function createClaudeQuickProfileId() {
  return crypto.randomUUID();
}

function deriveClaudeQuickProfileName(profile, fallback = 'Claude Code 配置') {
  const parts = [profile.model, profile.permissionMode, profile.baseUrl]
    .map((part) => asString(part).trim())
    .filter(Boolean);
  return parts.join(' / ') || fallback;
}

function normalizeClaudeQuickProfileName(value, profile, fallback) {
  const trimmed = asString(value).trim();
  return (trimmed || deriveClaudeQuickProfileName(profile, fallback)).slice(0, 120);
}

function normalizeClaudeQuickProfileRecord(record, index) {
  const profile = normalizeClaudeProfile(record?.profile || record);
  const id = asString(record?.id).trim() || createClaudeQuickProfileId();
  const now = Date.now();
  const createdAt = Number.isFinite(record?.createdAt) ? record.createdAt : now + index;
  const updatedAt = Number.isFinite(record?.updatedAt) ? record.updatedAt : createdAt;

  return {
    id,
    name: normalizeClaudeQuickProfileName(record?.name, profile, `Claude Code 配置 ${index + 1}`),
    profile,
    createdAt,
    updatedAt
  };
}

function normalizeClaudeQuickProfileStore(raw) {
  const sourceProfiles = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.profiles) ? raw.profiles : [];
  const profiles = [];
  const seenIds = new Set();

  sourceProfiles.forEach((record, index) => {
    try {
      const normalized = normalizeClaudeQuickProfileRecord(record, index);
      if (seenIds.has(normalized.id)) {
        normalized.id = createClaudeQuickProfileId();
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

function toClaudeQuickProfileStorePayload(store) {
  return {
    path: getClaudeQuickProfilesPath(),
    version: 1,
    activeId: store.activeId || '',
    profiles: store.profiles
  };
}

async function readClaudeQuickProfileStore() {
  const storePath = getClaudeQuickProfilesPath();

  try {
    const content = await fs.promises.readFile(storePath, 'utf8');
    return normalizeClaudeQuickProfileStore(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeClaudeQuickProfileStore({});
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Claude Code 快捷配置方案文件不是有效 JSON：${error.message}`);
    }

    throw error;
  }
}

async function writeClaudeQuickProfileStore(store) {
  const normalized = normalizeClaudeQuickProfileStore(store);
  const storePath = getClaudeQuickProfilesPath();
  const tempPath = path.join(
    path.dirname(storePath),
    `${CLAUDE_QUICK_PROFILES_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
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

async function listClaudeQuickProfiles() {
  return toClaudeQuickProfileStorePayload(await readClaudeQuickProfileStore());
}

async function saveClaudeQuickProfile(payload = {}) {
  const store = await readClaudeQuickProfileStore();
  const profile = normalizeClaudeProfile(payload.profile);
  const requestedId = asString(payload.id).trim();
  const existingIndex = requestedId
    ? store.profiles.findIndex((record) => record.id === requestedId)
    : -1;
  const existing = existingIndex >= 0 ? store.profiles[existingIndex] : null;
  const record = {
    id: existing?.id || requestedId || createClaudeQuickProfileId(),
    name: normalizeClaudeQuickProfileName(payload.name, profile, existing?.name || 'Claude Code 配置'),
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

  const nextStore = await writeClaudeQuickProfileStore({
    ...store,
    activeId: record.id,
    profiles
  });

  return {
    ...toClaudeQuickProfileStorePayload(nextStore),
    savedProfile: record
  };
}

async function deleteClaudeQuickProfile(id) {
  const store = await readClaudeQuickProfileStore();
  const profileId = asString(id).trim();
  const existing = store.profiles.find((record) => record.id === profileId);

  if (!existing) {
    throw new Error('选择的 Claude Code 快捷配置方案不存在。');
  }

  const profiles = store.profiles.filter((record) => record.id !== profileId);
  const nextStore = await writeClaudeQuickProfileStore({
    ...store,
    activeId: store.activeId === profileId ? '' : store.activeId,
    profiles
  });

  return {
    ...toClaudeQuickProfileStorePayload(nextStore),
    deletedProfile: existing
  };
}

function createQuickPromptId() {
  return crypto.randomUUID();
}

function normalizeQuickPromptContent(value) {
  const prompt = asString(value).replace(/\r\n/g, '\n').trim();
  if (!prompt) {
    throw new Error('常用 prompt 内容不能为空。');
  }

  if (prompt.length > QUICK_PROMPT_MAX_LENGTH) {
    throw new Error(`常用 prompt 不能超过 ${QUICK_PROMPT_MAX_LENGTH} 个字符。`);
  }

  return prompt;
}

function deriveQuickPromptTitle(prompt, fallback = 'Prompt') {
  const title = asString(prompt)
    .split(/\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (title || fallback).slice(0, 120);
}

function normalizeQuickPromptTitle(value, prompt, fallback = 'Prompt') {
  const title = asString(value).trim();
  return (title || deriveQuickPromptTitle(prompt, fallback)).slice(0, 120);
}

function normalizeQuickPromptRecord(record, index) {
  const prompt = normalizeQuickPromptContent(record?.prompt ?? record?.content);
  const id = asString(record?.id).trim() || createQuickPromptId();
  const now = Date.now();
  const createdAt = Number.isFinite(record?.createdAt) ? record.createdAt : now + index;
  const updatedAt = Number.isFinite(record?.updatedAt) ? record.updatedAt : createdAt;

  return {
    id,
    title: normalizeQuickPromptTitle(record?.title ?? record?.name, prompt, `Prompt ${index + 1}`),
    prompt,
    createdAt,
    updatedAt
  };
}

function normalizeQuickPromptStore(raw) {
  const sourcePrompts = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.prompts) ? raw.prompts : [];
  const prompts = [];
  const seenIds = new Set();

  sourcePrompts.forEach((record, index) => {
    try {
      const normalized = normalizeQuickPromptRecord(record, index);
      if (seenIds.has(normalized.id)) {
        normalized.id = createQuickPromptId();
      }
      seenIds.add(normalized.id);
      prompts.push(normalized);
    } catch {
      // Ignore invalid saved prompts instead of blocking the quick-send dock.
    }
  });

  return {
    version: 1,
    prompts: prompts.slice(0, QUICK_PROMPTS_MAX_ITEMS)
  };
}

function toQuickPromptStorePayload(store) {
  return {
    path: getQuickPromptsPath(),
    version: 1,
    prompts: store.prompts
  };
}

async function readQuickPromptStore() {
  const storePath = getQuickPromptsPath();

  try {
    const content = await fs.promises.readFile(storePath, 'utf8');
    return normalizeQuickPromptStore(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeQuickPromptStore({});
    }

    if (error instanceof SyntaxError) {
      throw new Error(`常用 prompt 文件不是有效 JSON：${error.message}`);
    }

    throw error;
  }
}

async function writeQuickPromptStore(store) {
  const normalized = normalizeQuickPromptStore(store);
  const storePath = getQuickPromptsPath();
  const tempPath = path.join(
    path.dirname(storePath),
    `${QUICK_PROMPTS_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
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

async function listQuickPrompts() {
  return toQuickPromptStorePayload(await readQuickPromptStore());
}

async function saveQuickPrompt(payload = {}) {
  const store = await readQuickPromptStore();
  const prompt = normalizeQuickPromptContent(payload.prompt ?? payload.content);
  const requestedId = asString(payload.id).trim();
  const existingIndex = requestedId
    ? store.prompts.findIndex((record) => record.id === requestedId)
    : -1;
  const existing = existingIndex >= 0 ? store.prompts[existingIndex] : null;
  const record = {
    id: existing?.id || requestedId || createQuickPromptId(),
    title: normalizeQuickPromptTitle(payload.title ?? payload.name, prompt, existing?.title || 'Prompt'),
    prompt,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const prompts = [...store.prompts];
  if (existingIndex >= 0) {
    prompts[existingIndex] = record;
  } else {
    prompts.unshift(record);
  }

  const nextStore = await writeQuickPromptStore({
    ...store,
    prompts: prompts.slice(0, QUICK_PROMPTS_MAX_ITEMS)
  });

  return {
    ...toQuickPromptStorePayload(nextStore),
    savedPrompt: record
  };
}

async function deleteQuickPrompt(id) {
  const store = await readQuickPromptStore();
  const promptId = asString(id).trim();
  const existing = store.prompts.find((record) => record.id === promptId);

  if (!existing) {
    throw new Error('选择的常用 prompt 不存在。');
  }

  const nextStore = await writeQuickPromptStore({
    ...store,
    prompts: store.prompts.filter((record) => record.id !== promptId)
  });

  return {
    ...toQuickPromptStorePayload(nextStore),
    deletedPrompt: existing
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

function getClaudeEditableFile(kind) {
  if (kind === 'settings') {
    return {
      name: 'settings.json',
      path: getClaudeSettingsPath(),
      validate: (content) => validateJsonText(content, 'settings.json')
    };
  }

  throw new Error(`未知 Claude Code 配置文件：${kind}`);
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

async function getNextClaudeBackupPath(configDir, fileName) {
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

  throw new Error('无法生成唯一的 Claude Code 配置备份文件名。');
}

async function getClaudeFileSnapshot(kind = 'settings') {
  const file = getClaudeEditableFile(kind);
  const configDir = getClaudeConfigDir();

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

async function listClaudeBackups(kind = 'settings') {
  const file = getClaudeEditableFile(kind);
  const configDir = getClaudeConfigDir();
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

async function writeClaudeFileText(kind = 'settings', content) {
  const file = getClaudeEditableFile(kind);
  file.validate(content);
  const configDir = getClaudeConfigDir();
  const tempPath = path.join(configDir, `${file.name}.${process.pid}.${Date.now()}.tmp`);
  let backupPath = null;

  await fs.promises.mkdir(configDir, { recursive: true });

  try {
    const oldContent = await fs.promises.readFile(file.path);
    backupPath = await getNextClaudeBackupPath(configDir, file.name);
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

  const snapshot = await getClaudeFileSnapshot(kind);
  return {
    ...snapshot,
    backupPath
  };
}

async function restoreClaudeBackup(kind = 'settings', backupName) {
  const file = getClaudeEditableFile(kind);
  const configDir = getClaudeConfigDir();

  if (typeof backupName !== 'string' || !backupName.trim()) {
    throw new Error('请选择要恢复的备份。');
  }

  const normalizedName = path.basename(backupName);
  const prefix = `${file.name}.bak-`;
  if (normalizedName !== backupName || !backupName.startsWith(prefix)) {
    throw new Error('备份文件名不属于当前 Claude Code 配置文件。');
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

  const snapshot = await writeClaudeFileText(kind, backupContent);
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
    const appVersion = app.getVersion();
    await fs.promises.mkdir(historyDir, { recursive: true }).catch(() => {});

    return {
      appVersion,
      claudeConfigDir: getClaudeConfigDir(),
      defaultShell: getDefaultShell(),
      codexHomeDir: getCodexHomeDir(),
      historyDir,
      homeDir: getUserHomeDir(),
      ptyEnabled: Boolean(pty),
      ptyError: ptyLoadError ? ptyLoadError.message : null,
      platform: process.platform
    };
  });

  ipcMain.handle('app:release-changelog', (_event, version) => {
    return readReleaseChangelog(version || app.getVersion());
  });

  ipcMain.handle('app:system-stats', () => getSystemStats());

  ipcMain.handle('usage:read', () => {
    return readUsageTrackingPayload();
  });

  ipcMain.handle('usage:write-rates', (_event, rates = {}) => {
    return writeUsageTrackingRates(rates || {});
  });

  ipcMain.handle('usage:clear-records', () => {
    return clearUsageTrackingRecords();
  });

  ipcMain.handle('workspace:open-path', (_event, targetPath) => {
    return openLocalPath(targetPath);
  });

  ipcMain.handle('workspace:open-url', (_event, targetUrl) => {
    return openExternalUrl(targetUrl);
  });

  ipcMain.handle('image-tools:open', () => {
    return openImageToolsPage();
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

  ipcMain.handle('claude-config:read', (_event, kind = 'settings') => {
    return getClaudeFileSnapshot(kind);
  });

  ipcMain.handle('claude-config:validate', (_event, kind = 'settings', content) => {
    try {
      getClaudeEditableFile(kind).validate(content || '');
      return { valid: true, error: null };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  });

  ipcMain.handle('claude-config:write', (_event, kind = 'settings', content) => {
    return writeClaudeFileText(kind, content || '');
  });

  ipcMain.handle('claude-config:list-backups', (_event, kind = 'settings') => {
    return listClaudeBackups(kind);
  });

  ipcMain.handle('claude-config:restore-backup', (_event, kind = 'settings', backupName) => {
    return restoreClaudeBackup(kind, backupName);
  });

  ipcMain.handle('claude-config:read-profile', () => {
    return getClaudeProfileSnapshot();
  });

  ipcMain.handle('claude-config:write-profile', (_event, profile) => {
    return writeClaudeProfile(profile);
  });

  ipcMain.handle('claude-config:list-quick-profiles', () => {
    return listClaudeQuickProfiles();
  });

  ipcMain.handle('claude-config:save-quick-profile', (_event, payload) => {
    return saveClaudeQuickProfile(payload);
  });

  ipcMain.handle('claude-config:delete-quick-profile', (_event, id) => {
    return deleteClaudeQuickProfile(id);
  });

  ipcMain.handle('claude-config:open-folder', async () => {
    const dir = getClaudeConfigDir();
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

  ipcMain.handle('quick-prompts:list', () => {
    return listQuickPrompts();
  });

  ipcMain.handle('quick-prompts:save', (_event, payload) => {
    return saveQuickPrompt(payload || {});
  });

  ipcMain.handle('quick-prompts:delete', (_event, id) => {
    return deleteQuickPrompt(id);
  });

  ipcMain.handle('agents:save-avatar', (_event, payload) => {
    return saveAgentAvatarAsset(payload || {});
  });

  ipcMain.handle('image-api:read-config', () => {
    return readImageApiConfig();
  });

  ipcMain.handle('image-api:write-config', (_event, payload) => {
    return writeImageApiConfig(payload || {});
  });

  ipcMain.handle('image-api:generate', (event, payload) => {
    return generateImageWithApi(payload || {}, { webContents: event.sender });
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
