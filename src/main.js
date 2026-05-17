const { app, BrowserWindow, dialog, ipcMain, shell: electronShell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');
const TOML = require('@iarna/toml');
const JSON5 = require('json5');
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
let agentBridgeWatcher = null;
let agentBridgeInboxScanTimer = null;
let agentBridgeInboxProcessing = false;
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
const COMMAND_PRESETS_FILE_NAME = 'command-presets.json';
const AGENT_BRIDGE_DIR_NAME = 'agent-bridge';
const AGENT_BRIDGE_BIN_DIR_NAME = 'bin';
const AGENT_BRIDGE_INBOX_DIR_NAME = 'inbox';
const AGENT_BRIDGE_RESPONSES_DIR_NAME = 'responses';
const AGENT_BRIDGE_SESSIONS_FILE_NAME = 'sessions.json';
const AGENT_BRIDGE_HELPER_FILE_NAME = 'cli-in-one-agent.js';
const AGENT_BRIDGE_COMMAND_FILE_NAME = 'cli-in-one.cmd';
const AGENT_BRIDGE_POWERSHELL_FILE_NAME = 'cli-in-one.ps1';
const AGENT_BRIDGE_UNIX_COMMAND_FILE_NAME = 'cli-in-one';
const AGENT_BRIDGE_REQUEST_MAX_BYTES = 1024 * 1024;
const AGENT_BRIDGE_MESSAGE_MAX_CHARS = 200000;
const AGENT_BRIDGE_RESPONSE_TTL_MS = 30 * 60 * 1000;
const IMAGE_TOOLS_HTML_FILE_NAME = 'image-tools.html';
const QUICK_PROMPTS_MAX_ITEMS = 80;
const QUICK_PROMPT_MAX_LENGTH = 20000;
const QUICK_PROMPT_ATTACHMENT_MAX_ITEMS = 12;
const QUICK_PROMPT_ATTACHMENT_TEXT_MAX_CHARS = 80000;
const COMMAND_PRESETS_MAX_ITEMS = 80;
const COMMAND_PRESET_MAX_COMMAND_LENGTH = 20000;
const IMAGE_API_CONFIG_FILE_NAME = 'image-api-config.json';
const IMAGE_API_HISTORY_FILE_NAME = 'image-generation-history.json';
const IMAGE_API_HISTORY_MAX_ITEMS = 80;
const USAGE_TRACKING_FILE_NAME = 'usage-tracking.json';
const USAGE_TRACKING_MAX_RECORDS = 2000;
const TERMINAL_TRANSCRIPT_MAX_BYTES = 2 * 1024 * 1024;
const AGENT_CONTEXT_FILE_MAX_BYTES = 256 * 1024;
const AGENT_CONTEXT_URL_MAX_BYTES = 512 * 1024;
const AGENT_CONTEXT_FETCH_TIMEOUT_MS = 15000;
const AGENT_CONTEXT_TEXT_MAX_CHARS = 160000;
const APP_ZOOM_DEFAULT_FACTOR = 1;
const APP_ZOOM_MIN_FACTOR = 0.75;
const APP_ZOOM_MAX_FACTOR = 1.75;
const IMAGE_API_DEFAULT_MODEL = 'gpt-image-2';
const IMAGE_API_DEFAULT_SIZE = '1024x1024';
const IMAGE_API_DEFAULT_COUNT = 1;
const IMAGE_API_DEFAULT_UPSCALE = '';
const IMAGE_API_DISPATCH_TIMEOUT_MS = 60 * 1000;
const IMAGE_API_IMAGE_DOWNLOAD_TIMEOUT_MS = 90 * 1000;
const IMAGE_API_POLL_TIMEOUT_MS = 8 * 60 * 1000;
const IMAGE_API_POLL_INITIAL_DELAY_MS = 2000;
const IMAGE_API_POLL_MAX_DELAY_MS = 10000;
const IMAGE_API_TASK_PAYLOAD_MAX_DEPTH = 6;
const IMAGE_API_TASK_PAYLOAD_MAX_ARRAY_LENGTH = 16;
const IMAGE_API_TASK_PAYLOAD_MAX_OBJECT_KEYS = 40;
const IMAGE_API_TASK_PAYLOAD_MAX_STRING_LENGTH = 4000;
const IMAGE_API_TASK_POLL_HISTORY_MAX_ITEMS = 24;
const IMAGE_API_REFERENCE_IMAGE_MAX_COUNT = 6;
const IMAGE_API_REFERENCE_IMAGE_MAX_BYTES = 25 * 1024 * 1024;
const IMAGE_API_TASK_ID_PATTERN = /^[a-zA-Z0-9_.:-]{1,160}$/;
const RELEASE_REPOSITORY_OWNER = 'whd3131';
const RELEASE_REPOSITORY_NAME = 'cli-in-one';
const GITHUB_RELEASES_URL = `https://github.com/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases`;
const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases`;
const GITHUB_RELEASE_FETCH_TIMEOUT_MS = 12000;
const GITHUB_RELEASE_STATUS_CACHE_FILE_NAME = 'github-latest-release-status.json';
const GITHUB_LATEST_RELEASE_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GITHUB_LATEST_RELEASE_STATUS_STALE_FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const GITHUB_TOKEN_ENV_NAMES = ['CLI_IN_ONE_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'];
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
let latestReleaseStatusCache = null;
let latestReleaseStatusCacheLoaded = false;
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
const imageMimeTypeByExtension = new Map(
  Array.from(imageExtensionByMimeType.entries()).map(([mimeType, extension]) => [extension, mimeType])
);
const imageExtensions = new Set(imageExtensionByMimeType.values());
const WORKSPACE_SKILL_MAX_DEPTH = 8;
const WORKSPACE_SKILL_MAX_FILES_PER_SOURCE = 200;
const WORKSPACE_SKILL_MAX_CONTENT_BYTES = 256 * 1024;
const WORKSPACE_TREE_MAX_DEPTH = 8;
const WORKSPACE_TREE_MAX_ENTRIES = 5000;
const WORKSPACE_TREE_MAX_CHILDREN_PER_DIRECTORY = 500;
const WORKSPACE_TREE_ABSOLUTE_MAX_DEPTH = 20;
const WORKSPACE_TREE_ABSOLUTE_MAX_ENTRIES = 20000;
const WORKSPACE_TREE_ABSOLUTE_MAX_CHILDREN_PER_DIRECTORY = 2000;
const WORKSPACE_DIFF_MAX_BYTES = 220 * 1024;
const WORKSPACE_DIFF_COMMAND_TIMEOUT_MS = 12000;
const workspaceTreeIgnoredDirectoryNames = new Set([
  '.cache',
  '.cli-in-one',
  '.files',
  '.git',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vite',
  '__pycache__',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release',
  'target'
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
const workspaceSkillToolDirectories = [
  { id: 'agents', directoryName: '.agents/skills', label: 'Agents' },
  { id: 'warp', directoryName: '.warp/skills', label: 'Warp' },
  { id: 'claude', directoryName: '.claude/skills', label: 'Claude' },
  { id: 'codex', directoryName: '.codex/skills', label: 'Codex' },
  { id: 'cursor', directoryName: '.cursor/skills', label: 'Cursor' },
  { id: 'gemini', directoryName: '.gemini/skills', label: 'Gemini' },
  { id: 'copilot', directoryName: '.copilot/skills', label: 'Copilot' },
  { id: 'factory', directoryName: '.factory/skills', label: 'Factory' },
  { id: 'github', directoryName: '.github/skills', label: 'GitHub' },
  { id: 'opencode', directoryName: '.opencode/skills', label: 'OpenCode' }
];
const workspaceSkillSources = [
  ...workspaceSkillToolDirectories.map((source) => ({
    ...source,
    id: `${source.id}-global`,
    scope: 'global'
  })),
  ...workspaceSkillToolDirectories.map((source) => ({
    ...source,
    id: `${source.id}-project`,
    scope: 'project'
  })),
  {
    id: 'cli-in-one',
    directoryName: `${APP_STORAGE_DIR_NAME}/skills`,
    ensureDirectory: true,
    label: 'Cli in One',
    scope: 'project'
  },
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

function getCommandPresetsPath() {
  return path.join(getProgramStorageDir(), COMMAND_PRESETS_FILE_NAME);
}

function getAgentBridgeDir() {
  return path.join(getProgramStorageDir(), AGENT_BRIDGE_DIR_NAME);
}

function getAgentBridgeBinDir() {
  return path.join(getProgramStorageDir(), AGENT_BRIDGE_BIN_DIR_NAME);
}

function getAgentBridgeInboxDir() {
  return path.join(getAgentBridgeDir(), AGENT_BRIDGE_INBOX_DIR_NAME);
}

function getAgentBridgeResponsesDir() {
  return path.join(getAgentBridgeDir(), AGENT_BRIDGE_RESPONSES_DIR_NAME);
}

function getAgentBridgeSessionsPath() {
  return path.join(getAgentBridgeDir(), AGENT_BRIDGE_SESSIONS_FILE_NAME);
}

function getImageApiConfigPath() {
  return path.join(getProgramStorageDir(), IMAGE_API_CONFIG_FILE_NAME);
}

function getImageApiHistoryPath() {
  return path.join(getProgramStorageDir(), IMAGE_API_HISTORY_FILE_NAME);
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

function getLatestReleaseStatusCachePath() {
  return path.join(getProgramStorageDir(), GITHUB_RELEASE_STATUS_CACHE_FILE_NAME);
}

function normalizeAppZoomFactor(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return APP_ZOOM_DEFAULT_FACTOR;
  }

  const clamped = Math.min(APP_ZOOM_MAX_FACTOR, Math.max(APP_ZOOM_MIN_FACTOR, parsed));
  return Math.round(clamped * 100) / 100;
}

function getAppZoomPayload(webContents = mainWindow?.webContents) {
  let zoomFactor = APP_ZOOM_DEFAULT_FACTOR;

  try {
    if (webContents && !webContents.isDestroyed()) {
      zoomFactor = normalizeAppZoomFactor(webContents.getZoomFactor());
    }
  } catch {
    zoomFactor = APP_ZOOM_DEFAULT_FACTOR;
  }

  return {
    defaultZoomFactor: APP_ZOOM_DEFAULT_FACTOR,
    maxZoomFactor: APP_ZOOM_MAX_FACTOR,
    minZoomFactor: APP_ZOOM_MIN_FACTOR,
    zoomFactor
  };
}

function applyAppZoomFactor(value, webContents = mainWindow?.webContents) {
  const zoomFactor = normalizeAppZoomFactor(value);

  if (webContents && !webContents.isDestroyed()) {
    webContents.setZoomFactor(zoomFactor);
  }

  return {
    ...getAppZoomPayload(webContents),
    zoomFactor
  };
}

function normalizeReleaseVersion(value) {
  return asString(value).trim().replace(/^v/i, '');
}

function parseComparableReleaseVersion(value) {
  const normalizedVersion = normalizeReleaseVersion(value);
  const withoutBuild = normalizedVersion.split('+')[0] || '';
  const [coreVersion, ...prereleaseParts] = withoutBuild.split('-');
  const numbers = coreVersion.split('.').map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }

    return Number.parseInt(part, 10);
  });

  if (numbers.length === 0 || numbers.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const prerelease = prereleaseParts.join('-').split('.').filter(Boolean).map((part) => {
    if (/^\d+$/.test(part)) {
      return Number.parseInt(part, 10);
    }

    return part.toLowerCase();
  });

  return {
    normalizedVersion,
    numbers,
    prerelease
  };
}

function comparePrereleaseIdentifiers(left, right) {
  if (left === right) {
    return 0;
  }

  const leftIsNumber = typeof left === 'number';
  const rightIsNumber = typeof right === 'number';

  if (leftIsNumber && rightIsNumber) {
    return left < right ? -1 : 1;
  }

  if (leftIsNumber) {
    return -1;
  }

  if (rightIsNumber) {
    return 1;
  }

  return String(left).localeCompare(String(right));
}

function compareReleaseVersions(left, right) {
  const leftVersion = parseComparableReleaseVersion(left);
  const rightVersion = parseComparableReleaseVersion(right);

  if (!leftVersion || !rightVersion) {
    return 0;
  }

  const segmentCount = Math.max(leftVersion.numbers.length, rightVersion.numbers.length, 3);
  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = leftVersion.numbers[index] || 0;
    const rightSegment = rightVersion.numbers[index] || 0;

    if (leftSegment !== rightSegment) {
      return leftSegment < rightSegment ? -1 : 1;
    }
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) {
    return 0;
  }

  if (leftVersion.prerelease.length === 0) {
    return 1;
  }

  if (rightVersion.prerelease.length === 0) {
    return -1;
  }

  const prereleaseCount = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < prereleaseCount; index += 1) {
    if (index >= leftVersion.prerelease.length) {
      return -1;
    }

    if (index >= rightVersion.prerelease.length) {
      return 1;
    }

    const compared = comparePrereleaseIdentifiers(
      leftVersion.prerelease[index],
      rightVersion.prerelease[index]
    );
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
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
  const result = await fetchGithubJsonResponse(url, { allowNotFound });
  if (result.notFound || result.notModified) {
    return null;
  }

  return result.data;
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

function normalizeLatestReleaseSummary(raw = {}) {
  const version = normalizeReleaseVersion(raw?.version || raw?.tagName || raw?.title);
  const tagName = asString(raw?.tagName).trim() || (version ? `v${version}` : '');
  const url = asString(raw?.url).trim()
    || (tagName ? `${GITHUB_RELEASES_URL}/tag/${encodeURIComponent(tagName)}` : GITHUB_RELEASES_URL);

  return {
    date: asString(raw?.date).trim().slice(0, 10),
    draft: Boolean(raw?.draft),
    prerelease: Boolean(raw?.prerelease),
    tagName,
    title: stripInlineMarkdown(raw?.title) || tagName || formatReleaseVersionLabel(version),
    url,
    version
  };
}

function buildLatestReleaseStatusPayload(currentVersion, latest, checkedAt, source = 'github') {
  const normalizedCurrentVersion = normalizeReleaseVersion(currentVersion);
  const normalizedLatest = latest ? normalizeLatestReleaseSummary(latest) : null;
  const comparison = normalizedCurrentVersion && normalizedLatest?.version
    ? compareReleaseVersions(normalizedCurrentVersion, normalizedLatest.version)
    : 0;

  return {
    checkedAt: Number.isFinite(checkedAt) ? Math.max(0, checkedAt) : Date.now(),
    comparison,
    currentVersion: normalizedCurrentVersion,
    found: Boolean(normalizedLatest?.version),
    isOutdated: Boolean(normalizedCurrentVersion && normalizedLatest?.version && comparison < 0),
    latestDate: normalizedLatest?.date || '',
    latestDraft: Boolean(normalizedLatest?.draft),
    latestPrerelease: Boolean(normalizedLatest?.prerelease),
    latestTagName: normalizedLatest?.tagName || '',
    latestTitle: normalizedLatest?.title || '',
    latestUrl: normalizedLatest?.url || GITHUB_RELEASES_URL,
    latestVersion: normalizedLatest?.version || '',
    source
  };
}

function normalizeLatestReleaseStatusCacheEntry(raw = {}) {
  return {
    checkedAt: Number.isFinite(raw?.checkedAt) ? Math.max(0, raw.checkedAt) : 0,
    etag: asString(raw?.etag).trim(),
    lastModified: asString(raw?.lastModified).trim(),
    latest: raw?.latest ? normalizeLatestReleaseSummary(raw.latest) : null,
    rateLimitResetAt: Number.isFinite(raw?.rateLimitResetAt) ? Math.max(0, raw.rateLimitResetAt) : 0
  };
}

async function loadLatestReleaseStatusCache() {
  if (latestReleaseStatusCacheLoaded) {
    return latestReleaseStatusCache;
  }

  const cachePath = getLatestReleaseStatusCachePath();

  try {
    const content = await fs.promises.readFile(cachePath, 'utf8');
    latestReleaseStatusCache = normalizeLatestReleaseStatusCacheEntry(JSON.parse(content));
  } catch (error) {
    if (error && error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      throw error;
    }

    latestReleaseStatusCache = null;
  }

  latestReleaseStatusCacheLoaded = true;
  return latestReleaseStatusCache;
}

async function persistLatestReleaseStatusCache(entry) {
  const normalized = normalizeLatestReleaseStatusCacheEntry(entry);
  const cachePath = getLatestReleaseStatusCachePath();
  const tempPath = path.join(
    path.dirname(cachePath),
    `${GITHUB_RELEASE_STATUS_CACHE_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
  );

  await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });

  try {
    await fs.promises.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tempPath, cachePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  latestReleaseStatusCache = normalized;
  latestReleaseStatusCacheLoaded = true;
  return normalized;
}

function getCachedLatestReleaseStatus(cache, currentVersion, maxAgeMs, now = Date.now()) {
  if (
    !cache ||
    !Number.isFinite(cache.checkedAt) ||
    cache.checkedAt <= 0 ||
    !Number.isFinite(maxAgeMs)
  ) {
    return null;
  }

  const age = Math.max(0, now - cache.checkedAt);
  if (age > maxAgeMs) {
    return null;
  }

  return buildLatestReleaseStatusPayload(currentVersion, cache.latest, cache.checkedAt, 'github-cache');
}

function getGithubApiToken() {
  for (const envName of GITHUB_TOKEN_ENV_NAMES) {
    const token = asString(process.env?.[envName]).trim();
    if (token) {
      return token;
    }
  }

  return '';
}

function buildGithubRequestHeaders({ etag = '', lastModified = '' } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'CLI-in-One'
  };
  const token = getGithubApiToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (etag) {
    headers['If-None-Match'] = etag;
  } else if (lastModified) {
    headers['If-Modified-Since'] = lastModified;
  }

  return headers;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(asString(value).trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatAbsoluteLocalDateTime(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function getGithubRateLimitResetAt(response) {
  const retryAfterSeconds = parsePositiveInteger(response?.headers?.get('retry-after'));
  if (retryAfterSeconds > 0) {
    return Date.now() + retryAfterSeconds * 1000;
  }

  const resetAtSeconds = parsePositiveInteger(response?.headers?.get('x-ratelimit-reset'));
  return resetAtSeconds > 0 ? resetAtSeconds * 1000 : 0;
}

function isGithubRateLimitResponse(response, detail = '') {
  if (!response || ![403, 429].includes(response.status)) {
    return false;
  }

  if (asString(response.headers?.get('x-ratelimit-remaining')).trim() === '0') {
    return true;
  }

  const normalizedDetail = detail.toLowerCase();
  return normalizedDetail.includes('rate limit');
}

function createGithubApiError(response, detail = '') {
  const rateLimitResetAt = getGithubRateLimitResetAt(response);
  const rateLimited = isGithubRateLimitResponse(response, detail);
  let message = `GitHub Releases 返回 ${response.status}${detail ? `：${detail}` : ''}`;

  if (rateLimited) {
    const resetAtText = formatAbsoluteLocalDateTime(rateLimitResetAt);
    const tokenHint = getGithubApiToken()
      ? ''
      : '，或设置环境变量 CLI_IN_ONE_GITHUB_TOKEN、GITHUB_TOKEN 或 GH_TOKEN 以提高限额';
    message = resetAtText
      ? `GitHub Releases 已达到速率限制，请在 ${resetAtText} 后重试${tokenHint}。`
      : `GitHub Releases 已达到速率限制，请稍后重试${tokenHint}。`;
  }

  const error = new Error(message);
  error.isGithubRateLimited = rateLimited;
  error.rateLimitResetAt = rateLimitResetAt;
  error.status = response?.status || 0;
  return error;
}

function extractGithubResponseHeaders(response) {
  return {
    etag: asString(response?.headers?.get('etag')).trim(),
    lastModified: asString(response?.headers?.get('last-modified')).trim()
  };
}

async function fetchGithubJsonResponse(
  url,
  {
    allowNotFound = false,
    allowNotModified = false,
    etag = '',
    lastModified = ''
  } = {}
) {
  if (typeof fetch !== 'function') {
    throw new Error('当前运行环境不支持 fetch。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_RELEASE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: buildGithubRequestHeaders({ etag, lastModified }),
      signal: controller.signal
    });
    const headers = extractGithubResponseHeaders(response);

    if (response.status === 304 && allowNotModified) {
      return {
        data: null,
        headers,
        notFound: false,
        notModified: true,
        url: response.url
      };
    }

    if (response.status === 404 && allowNotFound) {
      return {
        data: null,
        headers,
        notFound: true,
        notModified: false,
        url: response.url
      };
    }

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = asString(payload?.message).trim();
      } catch {
        detail = await response.text().catch(() => '');
      }
      throw createGithubApiError(response, detail);
    }

    return {
      data: await response.json(),
      headers,
      notFound: false,
      notModified: false,
      url: response.url
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('GitHub Releases 请求超时。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

function normalizeGithubReleaseSummary(release) {
  const tagName = asString(release?.tag_name).trim();
  const version = normalizeReleaseVersion(tagName || release?.name);

  return normalizeLatestReleaseSummary({
    date: asString(release?.published_at || release?.created_at).slice(0, 10),
    draft: Boolean(release?.draft),
    prerelease: Boolean(release?.prerelease),
    tagName,
    title: stripInlineMarkdown(release?.name) || tagName || formatReleaseVersionLabel(version),
    url: asString(release?.html_url).trim()
      || (tagName ? `${GITHUB_RELEASES_URL}/tag/${encodeURIComponent(tagName)}` : GITHUB_RELEASES_URL),
    version
  });
}

async function readLatestReleaseStatus(version, options = {}) {
  const currentVersion = normalizeReleaseVersion(version || app.getVersion());
  const now = Date.now();
  const force = options && typeof options === 'object' && options.force === true;
  const cachedSummary = await loadLatestReleaseStatusCache();
  const freshCachedStatus = getCachedLatestReleaseStatus(
    cachedSummary,
    currentVersion,
    GITHUB_LATEST_RELEASE_STATUS_CACHE_TTL_MS,
    now
  );

  if (!force && freshCachedStatus) {
    return freshCachedStatus;
  }

  const staleCachedStatus = getCachedLatestReleaseStatus(
    cachedSummary,
    currentVersion,
    GITHUB_LATEST_RELEASE_STATUS_STALE_FALLBACK_MAX_AGE_MS,
    now
  );

  if (cachedSummary?.rateLimitResetAt > now) {
    if (staleCachedStatus) {
      return staleCachedStatus;
    }

    return {
      checkedAt: now,
      comparison: 0,
      currentVersion,
      error: createGithubApiError({
        headers: {
          get(name) {
            return name === 'x-ratelimit-reset'
              ? String(Math.floor(cachedSummary.rateLimitResetAt / 1000))
              : '';
          }
        },
        status: 403
      }, 'API rate limit exceeded').message,
      found: false,
      isOutdated: false,
      latestUrl: GITHUB_RELEASES_URL,
      latestVersion: '',
      source: 'github'
    };
  }

  try {
    const response = await fetchGithubJsonResponse(`${GITHUB_RELEASES_API_URL}/latest`, {
      allowNotFound: true,
      allowNotModified: Boolean(cachedSummary?.etag || cachedSummary?.lastModified),
      etag: cachedSummary?.etag || '',
      lastModified: cachedSummary?.lastModified || ''
    });

    if (response.notModified && cachedSummary) {
      const nextCache = await persistLatestReleaseStatusCache({
        ...cachedSummary,
        checkedAt: now,
        etag: response.headers.etag || cachedSummary.etag,
        lastModified: response.headers.lastModified || cachedSummary.lastModified,
        rateLimitResetAt: 0
      });
      return buildLatestReleaseStatusPayload(currentVersion, nextCache.latest, nextCache.checkedAt);
    }

    if (response.notFound) {
      const nextCache = await persistLatestReleaseStatusCache({
        checkedAt: now,
        etag: response.headers.etag,
        lastModified: response.headers.lastModified,
        latest: null,
        rateLimitResetAt: 0
      });
      return buildLatestReleaseStatusPayload(currentVersion, nextCache.latest, nextCache.checkedAt);
    }

    const nextCache = await persistLatestReleaseStatusCache({
      checkedAt: now,
      etag: response.headers.etag,
      lastModified: response.headers.lastModified,
      latest: normalizeGithubReleaseSummary(response.data),
      rateLimitResetAt: 0
    });
    return buildLatestReleaseStatusPayload(currentVersion, nextCache.latest, nextCache.checkedAt);
  } catch (error) {
    if (Number.isFinite(error?.rateLimitResetAt) && error.rateLimitResetAt > 0) {
      await persistLatestReleaseStatusCache({
        ...(cachedSummary || {}),
        rateLimitResetAt: error.rateLimitResetAt
      }).catch(() => {});
    }

    if (staleCachedStatus) {
      return staleCachedStatus;
    }

    return {
      checkedAt: now,
      comparison: 0,
      currentVersion,
      error: error?.message || String(error),
      found: false,
      isOutdated: false,
      latestUrl: GITHUB_RELEASES_URL,
      latestVersion: '',
      source: 'github'
    };
  }
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

function getEnvPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
}

function prependEnvPathValue(currentValue, directoryPath) {
  const current = String(currentValue || '');
  const normalizedDirectory = path.resolve(directoryPath);
  const exists = current
    .split(path.delimiter)
    .filter(Boolean)
    .some((item) => path.resolve(item).toLowerCase() === normalizedDirectory.toLowerCase());

  if (exists) {
    return current;
  }

  return [directoryPath, current].filter(Boolean).join(path.delimiter);
}

function applyAgentBridgeEnv(env, sessionMeta = {}) {
  const pathKey = getEnvPathKey(env);
  env[pathKey] = prependEnvPathValue(env[pathKey], getAgentBridgeBinDir());
  env.CLI_IN_ONE_AGENT_BRIDGE_DIR = getAgentBridgeDir();
  env.CLI_IN_ONE_AGENT_BRIDGE_SESSIONS = getAgentBridgeSessionsPath();
  env.CLI_IN_ONE_NODE_PATH = process.execPath;

  const sessionId = asString(sessionMeta.id).trim();
  if (sessionId) {
    env.CLI_IN_ONE_SESSION_ID = sessionId;
  }

  const sessionTitle = asString(sessionMeta.title).trim();
  if (sessionTitle) {
    env.CLI_IN_ONE_SESSION_TITLE = sessionTitle;
  }

  const sessionCwd = asString(sessionMeta.cwd).trim();
  if (sessionCwd) {
    env.CLI_IN_ONE_SESSION_CWD = sessionCwd;
  }

  const cliProviderId = asString(sessionMeta.cliProviderId).trim();
  if (cliProviderId) {
    env.CLI_IN_ONE_SESSION_CLI = cliProviderId;
  }

  return env;
}

function buildSessionEnv(extraEnv = {}, sessionMeta = {}) {
  const env = {
    ...process.env,
    ...extraEnv
  };
  applyAgentBridgeEnv(env, sessionMeta);
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
    return parseClaudeSettings(content);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.isJsonParseError)) {
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

  const envShell = typeof process.env.SHELL === 'string'
    ? process.env.SHELL.trim()
    : '';

  if (envShell && path.isAbsolute(envShell)) {
    try {
      fs.accessSync(envShell, fs.constants.X_OK);
      return envShell;
    } catch {
      // Fall through to a known-good shell when SHELL points at a missing binary.
    }
  }

  const shellCandidates = process.platform === 'darwin'
    ? ['/bin/zsh', '/bin/bash', '/bin/sh']
    : ['/bin/bash', '/bin/sh'];

  for (const candidate of shellCandidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return '/bin/sh';
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

function normalizeTerminalCommandInput(command) {
  return String(command || '').replace(/\r\n/g, '\r').replace(/\n/g, '\r');
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

function normalizeWorkspaceTreeRelativePath(relativePath) {
  return String(relativePath || '').split(path.sep).join('/');
}

function coerceWorkspaceTreeLimit(value, fallback, minimum, maximum) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(numericValue), minimum), maximum);
}

function getWorkspaceTreeReadOptions(options = {}) {
  return {
    includeRoot: options.includeRoot !== false,
    includeText: options.includeText === true,
    ignoreHeavyDirectories: options.ignoreHeavyDirectories !== false,
    lazy: options.lazy === true,
    maxChildrenPerDirectory: coerceWorkspaceTreeLimit(
      options.maxChildrenPerDirectory,
      WORKSPACE_TREE_MAX_CHILDREN_PER_DIRECTORY,
      20,
      WORKSPACE_TREE_ABSOLUTE_MAX_CHILDREN_PER_DIRECTORY
    ),
    maxDepth: coerceWorkspaceTreeLimit(
      options.maxDepth,
      WORKSPACE_TREE_MAX_DEPTH,
      1,
      WORKSPACE_TREE_ABSOLUTE_MAX_DEPTH
    ),
    maxEntries: coerceWorkspaceTreeLimit(
      options.maxEntries,
      WORKSPACE_TREE_MAX_ENTRIES,
      100,
      WORKSPACE_TREE_ABSOLUTE_MAX_ENTRIES
    )
  };
}

function shouldIgnoreWorkspaceTreeDirectory(entryName, readOptions) {
  if (!readOptions.ignoreHeavyDirectories) {
    return false;
  }

  return workspaceTreeIgnoredDirectoryNames.has(String(entryName || '').toLowerCase());
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

function getWorkspaceSkillSourceBasePath(rootPath, source) {
  return source?.scope === 'global' ? os.homedir() : rootPath;
}

function isWorkspaceSkillDefinitionFile(fileName) {
  return String(fileName || '').trim().toLowerCase() === 'skill.md';
}

function normalizeWorkspaceSkillSlashName(value) {
  return String(value || '')
    .trim()
    .replace(/^\//, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeWorkspaceSkillMetadataValue(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
}

function parseWorkspaceSkillMarkdown(content) {
  const text = String(content || '').replace(/^\uFEFF/, '');
  const frontmatterMatch = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);

  if (!frontmatterMatch) {
    return {
      body: text.trim(),
      metadata: {}
    };
  }

  const metadata = {};
  frontmatterMatch[1].split(/\r?\n/g).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      return;
    }

    metadata[match[1].toLowerCase()] = normalizeWorkspaceSkillMetadataValue(match[2]);
  });

  return {
    body: text.slice(frontmatterMatch[0].length).trim(),
    metadata
  };
}

async function readWorkspaceSkillMarkdownContent(filePath) {
  const stats = await fs.promises.stat(filePath);
  const byteLength = Math.min(stats.size, WORKSPACE_SKILL_MAX_CONTENT_BYTES);
  let content = '';

  if (byteLength > 0) {
    const file = await fs.promises.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(byteLength);
      await file.read(buffer, 0, byteLength, 0);
      content = buffer.toString('utf8');
    } finally {
      await file.close();
    }
  }

  return {
    content,
    contentTruncated: stats.size > WORKSPACE_SKILL_MAX_CONTENT_BYTES
  };
}

async function readWorkspaceSkillDefinition(source, filePath, relativePath) {
  let content = '';
  let contentTruncated = false;
  let readError = '';

  try {
    const payload = await readWorkspaceSkillMarkdownContent(filePath);
    content = payload.content;
    contentTruncated = payload.contentTruncated;
  } catch (error) {
    readError = error.message || String(error);
  }

  const parsed = parseWorkspaceSkillMarkdown(content);
  const normalizedRelativePath = normalizeWorkspaceSkillRelativePath(relativePath);
  const directoryRelativePath = normalizeWorkspaceSkillRelativePath(path.dirname(relativePath));
  const fallbackName = normalizeWorkspaceSkillSlashName(
    path.basename(directoryRelativePath === '.' ? path.dirname(filePath) : directoryRelativePath)
  );
  const rawName = normalizeWorkspaceSkillMetadataValue(parsed.metadata.name) || fallbackName;
  const slashName = normalizeWorkspaceSkillSlashName(rawName);

  if (!slashName) {
    return null;
  }

  return {
    id: [
      source.id,
      source.scope || 'project',
      normalizeWorkspaceSkillRelativePath(relativePath)
    ].filter(Boolean).join(':'),
    name: rawName,
    slashName,
    description: normalizeWorkspaceSkillMetadataValue(parsed.metadata.description),
    path: filePath,
    directoryPath: path.dirname(filePath),
    relativePath: normalizedRelativePath,
    directoryRelativePath: directoryRelativePath === '.' ? '' : directoryRelativePath,
    sourceId: source.id,
    sourceDirectoryName: source.directoryName,
    sourceScope: source.scope || 'project',
    content,
    body: parsed.body || content.trim(),
    contentTruncated,
    error: readError
  };
}

async function readWorkspaceSkillSourceSnapshot(rootPath, source) {
  const sourcePath = path.join(getWorkspaceSkillSourceBasePath(rootPath, source), source.directoryName);
  let sourceStats = null;

  try {
    sourceStats = await fs.promises.stat(sourcePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      if (source.ensureDirectory) {
        try {
          await fs.promises.mkdir(sourcePath, { recursive: true });
          sourceStats = await fs.promises.stat(sourcePath);
        } catch (createError) {
          return {
            id: source.id,
            directoryName: source.directoryName,
            exists: false,
            error: createError.message,
            fileCount: 0,
            files: [],
            path: sourcePath,
            truncated: false
          };
        }
      } else {
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
    } else {
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
  const skills = [];
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

      if (isWorkspaceSkillDefinitionFile(entry.name)) {
        const skill = await readWorkspaceSkillDefinition(
          source,
          path.join(directoryPath, entry.name),
          nextRelativePath
        );
        if (skill) {
          skills.push(skill);
        }
      }
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
  skills.sort((left, right) => (
    left.slashName.localeCompare(right.slashName, undefined, { numeric: true, sensitivity: 'base' })
    || left.relativePath.localeCompare(right.relativePath, undefined, { numeric: true, sensitivity: 'base' })
  ));

  return {
    id: source.id,
    label: source.label || '',
    scope: source.scope || 'project',
    directoryName: source.directoryName,
    exists: true,
    fileCount: files.length,
    files,
    path: sourcePath,
    skillCount: skills.length,
    skills,
    truncated
  };
}

async function readWorkspaceTreeSnapshot(options = {}) {
  const cwd = resolveExistingDirectoryOrThrow(options.cwd);
  const readOptions = getWorkspaceTreeReadOptions(options);
  const lines = [];
  const state = {
    directoryCount: 0,
    entryCount: 0,
    fileCount: 0,
    omittedCount: 0,
    truncated: false
  };
  const rootLabel = path.basename(cwd) || cwd;
  const rootNode = readOptions.includeRoot ? {
    id: cwd,
    name: rootLabel,
    path: cwd,
    relativePath: '',
    type: 'directory',
    childrenLoaded: true,
    children: []
  } : null;

  const appendTreeLine = (prefix, isLast, label) => {
    if (readOptions.includeText) {
      lines.push(`${prefix}${isLast ? '└── ' : '├── '}${label}`);
    }
  };

  const appendNoticeNode = (parentNode, notice) => {
    if (!parentNode) {
      return;
    }

    parentNode.children.push({
      id: `${parentNode.path || cwd}:${notice.type}:${parentNode.children.length}`,
      type: notice.type,
      name: notice.name,
      message: notice.message || '',
      omittedCount: notice.omittedCount || 0,
      children: []
    });
  };

  const appendOmittedNotice = (prefix, parentNode, omittedCount) => {
    if (omittedCount <= 0) {
      return;
    }

    state.omittedCount += omittedCount;
    state.truncated = true;
    appendTreeLine(prefix, true, `[omitted: ${omittedCount}]`);
    appendNoticeNode(parentNode, {
      type: 'omitted',
      name: `[omitted: ${omittedCount}]`,
      omittedCount
    });
  };

  const walk = async (directoryPath, prefix, parentNode, relativeDirectoryPath = '', depth = 0) => {
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
    const visibleEntries = entries.slice(0, readOptions.maxChildrenPerDirectory);
    const directoryOmittedCount = Math.max(0, entries.length - visibleEntries.length);

    for (let index = 0; index < visibleEntries.length; index += 1) {
      if (state.entryCount >= readOptions.maxEntries) {
        appendOmittedNotice(prefix, parentNode, visibleEntries.length - index + directoryOmittedCount);
        return true;
      }

      const entry = visibleEntries[index];
      const isLast = index === visibleEntries.length - 1 && directoryOmittedCount === 0;
      const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = relativeDirectoryPath
        ? path.join(relativeDirectoryPath, entry.name)
        : entry.name;
      const normalizedRelativePath = normalizeWorkspaceTreeRelativePath(relativePath);
      const entryIsDirectory = entry.isDirectory();
      const entryIsLink = entry.isSymbolicLink();
      const entryIsIgnored = entryIsDirectory && shouldIgnoreWorkspaceTreeDirectory(entry.name, readOptions);
      const entryExceedsDepth = entryIsDirectory && depth + 1 > readOptions.maxDepth;
      const labelParts = [entry.name];

      if (entryIsDirectory) {
        labelParts.push('/');
      }
      if (entryIsLink) {
        labelParts.push(' [link]');
      }
      if (entryIsIgnored) {
        labelParts.push(' [skipped]');
      }

      appendTreeLine(prefix, isLast, labelParts.join(''));
      state.entryCount += 1;

      const entryNode = readOptions.includeRoot ? {
        id: entryPath,
        name: entry.name,
        path: entryPath,
        relativePath: normalizedRelativePath,
        type: entryIsDirectory ? 'directory' : entryIsLink ? 'link' : 'file',
        childrenLoaded: entryIsDirectory ? (entryIsIgnored || entryIsLink ? true : !readOptions.lazy) : undefined,
        ignored: entryIsIgnored,
        link: entryIsLink,
        children: []
      } : null;
      parentNode?.children.push(entryNode);

      if (entryIsDirectory) {
        state.directoryCount += 1;

        if (entryIsIgnored) {
          state.omittedCount += 1;
          state.truncated = true;
          continue;
        }

        if (entryIsLink) {
          continue;
        }

        if (readOptions.lazy) {
          continue;
        }

        if (entryExceedsDepth) {
          state.omittedCount += 1;
          state.truncated = true;
          appendNoticeNode(entryNode, {
            type: 'depth-limit',
            name: '[depth limit]'
          });
          if (readOptions.includeText) {
            appendTreeLine(nextPrefix, true, '[depth limit]');
          }
          continue;
        }

        const stopped = await walk(entryPath, nextPrefix, entryNode, relativePath, depth + 1);
        if (stopped) {
          return true;
        }
        continue;
      }

      state.fileCount += 1;
    }

    appendOmittedNotice(prefix, parentNode, directoryOmittedCount);
    return false;
  };

  if (readOptions.includeText) {
    lines.push(rootLabel.endsWith(path.sep) ? rootLabel : `${rootLabel}${path.sep}`);
  }
  await walk(cwd, '', rootNode);

  return {
    cwd,
    root: rootNode,
    text: readOptions.includeText ? lines.join('\n') : '',
    directoryCount: state.directoryCount,
    fileCount: state.fileCount,
    omittedCount: state.omittedCount,
    truncated: state.truncated
  };
}

function runGitWorkspaceCommand(cwd, args, options = {}) {
  const maxBytes = clampNumber(options.maxBytes, 1024, WORKSPACE_DIFF_MAX_BYTES, WORKSPACE_DIFF_MAX_BYTES);
  const timeoutMs = clampNumber(
    options.timeoutMs,
    1000,
    WORKSPACE_DIFF_COMMAND_TIMEOUT_MS,
    WORKSPACE_DIFF_COMMAND_TIMEOUT_MS
  );

  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: buildSessionEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const chunks = [];
    const errorChunks = [];
    let byteCount = 0;
    let errorByteCount = 0;
    let truncated = false;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      truncated = true;
      child.kill();
    }, timeoutMs);

    const collect = (buffer, targetChunks, countName) => {
      if (truncated) {
        return;
      }

      const nextBytes = countName === 'stderr'
        ? errorByteCount + buffer.length
        : byteCount + buffer.length;
      if (nextBytes > maxBytes) {
        const remaining = Math.max(0, maxBytes - (countName === 'stderr' ? errorByteCount : byteCount));
        if (remaining > 0) {
          targetChunks.push(buffer.subarray(0, remaining));
        }
        truncated = true;
        child.kill();
        return;
      }

      targetChunks.push(buffer);
      if (countName === 'stderr') {
        errorByteCount = nextBytes;
      } else {
        byteCount = nextBytes;
      }
    };

    child.stdout.on('data', (buffer) => collect(buffer, chunks, 'stdout'));
    child.stderr.on('data', (buffer) => collect(buffer, errorChunks, 'stderr'));
    child.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({
        code: -1,
        error: error.message,
        stderr: error.message,
        stdout: '',
        truncated
      });
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        error: '',
        stderr: Buffer.concat(errorChunks).toString('utf8'),
        stdout: Buffer.concat(chunks).toString('utf8'),
        truncated
      });
    });
  });
}

function normalizeGitCommandText(value) {
  return asString(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

async function readWorkspaceDiffSnapshot(options = {}) {
  const cwd = resolveExistingDirectoryOrThrow(options.cwd);
  const maxBytes = clampNumber(options.maxBytes, 16 * 1024, WORKSPACE_DIFF_MAX_BYTES, WORKSPACE_DIFF_MAX_BYTES);
  const rootResult = await runGitWorkspaceCommand(cwd, ['rev-parse', '--show-toplevel'], {
    maxBytes: 16 * 1024
  });

  if (rootResult.code !== 0) {
    throw new Error(normalizeGitCommandText(rootResult.stderr) || '当前目录不是 Git 仓库。');
  }

  const repositoryRoot = normalizeGitCommandText(rootResult.stdout) || cwd;
  const commandMaxBytes = Math.max(16 * 1024, Math.floor(maxBytes / 2));
  const [statusResult, stagedStatResult, unstagedStatResult, stagedDiffResult, unstagedDiffResult] = await Promise.all([
    runGitWorkspaceCommand(cwd, ['status', '--short'], { maxBytes: 64 * 1024 }),
    runGitWorkspaceCommand(cwd, ['diff', '--cached', '--stat', '--no-color'], { maxBytes: 64 * 1024 }),
    runGitWorkspaceCommand(cwd, ['diff', '--stat', '--no-color'], { maxBytes: 64 * 1024 }),
    runGitWorkspaceCommand(cwd, ['diff', '--cached', '--no-color', '--no-ext-diff'], { maxBytes: commandMaxBytes }),
    runGitWorkspaceCommand(cwd, ['diff', '--no-color', '--no-ext-diff'], { maxBytes: commandMaxBytes })
  ]);
  const failedResult = [statusResult, stagedStatResult, unstagedStatResult, stagedDiffResult, unstagedDiffResult]
    .find((result) => result.code !== 0 && normalizeGitCommandText(result.stderr));

  if (failedResult) {
    throw new Error(normalizeGitCommandText(failedResult.stderr));
  }

  const status = normalizeGitCommandText(statusResult.stdout);
  const stagedStat = normalizeGitCommandText(stagedStatResult.stdout);
  const unstagedStat = normalizeGitCommandText(unstagedStatResult.stdout);
  const stagedDiff = normalizeGitCommandText(stagedDiffResult.stdout);
  const unstagedDiff = normalizeGitCommandText(unstagedDiffResult.stdout);
  const sections = [];

  if (status) {
    sections.push(`Status:\n${status}`);
  }
  if (stagedStat) {
    sections.push(`Staged diff stat:\n${stagedStat}`);
  }
  if (stagedDiff) {
    sections.push(`Staged diff:\n${stagedDiff}`);
  }
  if (unstagedStat) {
    sections.push(`Unstaged diff stat:\n${unstagedStat}`);
  }
  if (unstagedDiff) {
    sections.push(`Unstaged diff:\n${unstagedDiff}`);
  }

  const truncated = [statusResult, stagedStatResult, unstagedStatResult, stagedDiffResult, unstagedDiffResult]
    .some((result) => result.truncated);
  if (truncated) {
    sections.push('[cli-in-one] Diff output was truncated.');
  }

  return {
    cwd,
    generatedAt: Date.now(),
    repositoryRoot,
    stagedDiff,
    stagedStat,
    status,
    text: sections.join('\n\n'),
    truncated,
    unstagedDiff,
    unstagedStat
  };
}

async function readWorkspaceSkillsSnapshot(options = {}) {
  const cwd = resolveExistingDirectoryOrThrow(options.cwd);
  const scopes = [];
  let totalFiles = 0;
  let totalSkills = 0;
  const seenSkillPaths = new Set();

  for (const source of workspaceSkillSources) {
    const snapshot = await readWorkspaceSkillSourceSnapshot(cwd, source);
    if (Array.isArray(snapshot.skills) && snapshot.skills.length > 0) {
      snapshot.skills = snapshot.skills.filter((skill) => {
        const skillPath = asString(skill?.path).trim();
        if (!skillPath) {
          return false;
        }

        const key = path.resolve(skillPath).toLowerCase();
        if (seenSkillPaths.has(key)) {
          return false;
        }

        seenSkillPaths.add(key);
        return true;
      });
      snapshot.skillCount = snapshot.skills.length;
    }
    scopes.push(snapshot);
    totalFiles += snapshot.fileCount || 0;
    totalSkills += snapshot.skillCount || 0;
  }

  return {
    cwd,
    scannedAt: Date.now(),
    scopes,
    totalFiles,
    totalSkills
  };
}

function normalizeAgentContextText(value, maxChars = AGENT_CONTEXT_TEXT_MAX_CHARS) {
  const text = asString(value)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '');

  if (text.length <= maxChars) {
    return {
      text: text.trimEnd(),
      truncated: false
    };
  }

  return {
    text: text.slice(0, maxChars).trimEnd(),
    truncated: true
  };
}

function looksLikeBinaryBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return false;
  }

  let controlCount = 0;
  const sampleLength = Math.min(buffer.length, 4096);
  for (let index = 0; index < sampleLength; index += 1) {
    const value = buffer[index];
    if (value === 0) {
      return true;
    }
    if (value < 32 && value !== 9 && value !== 10 && value !== 13 && value !== 8) {
      controlCount += 1;
    }
  }

  return controlCount / sampleLength > 0.08;
}

async function readFileHead(filePath, maxBytes) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function resolveWorkspaceContextFile(options = {}) {
  const cwd = resolveExistingDirectoryOrThrow(options.cwd);
  const requestedPath = asString(options.path || options.targetPath || options.filePath)
    .trim()
    .replace(/^@+/, '');

  if (!requestedPath) {
    throw new Error('请选择要加入上下文的文件。');
  }

  const candidatePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(cwd, requestedPath);
  const relativePath = path.relative(cwd, candidatePath);

  if (!isPathInside(cwd, candidatePath)) {
    throw new Error('只能读取当前工作区内的文件。');
  }

  const stats = await fs.promises.stat(candidatePath).catch((error) => {
    if (error && error.code === 'ENOENT') {
      throw new Error('选择的文件不存在。');
    }
    throw error;
  });

  if (!stats.isFile()) {
    throw new Error('只能把文件加入上下文。');
  }

  const [cwdRealPath, fileRealPath] = await Promise.all([
    fs.promises.realpath(cwd),
    fs.promises.realpath(candidatePath)
  ]);
  if (!isPathInside(cwdRealPath, fileRealPath)) {
    throw new Error('只能读取当前工作区内的文件。');
  }

  return {
    cwd,
    path: candidatePath,
    relativePath: normalizeWorkspaceTreeRelativePath(relativePath),
    size: stats.size
  };
}

async function readWorkspaceFileContext(options = {}) {
  const file = await resolveWorkspaceContextFile(options);
  const bytesToRead = Math.min(file.size, AGENT_CONTEXT_FILE_MAX_BYTES);
  const buffer = await readFileHead(file.path, bytesToRead);

  if (looksLikeBinaryBuffer(buffer)) {
    throw new Error('这个文件看起来不是文本文件。');
  }

  const normalized = normalizeAgentContextText(buffer.toString('utf8'));
  const truncated = normalized.truncated || file.size > AGENT_CONTEXT_FILE_MAX_BYTES;

  return {
    cwd: file.cwd,
    path: file.path,
    relativePath: file.relativePath,
    name: path.basename(file.path),
    size: file.size,
    truncated,
    content: normalized.text
  };
}

async function readLocalFileContext(filePath, options = {}) {
  const rawPath = asString(filePath).trim();
  if (!rawPath) {
    throw new Error('请选择要加入的文件。');
  }
  const resolvedPath = path.resolve(rawPath);

  const stats = await fs.promises.stat(resolvedPath).catch((error) => {
    if (error && error.code === 'ENOENT') {
      throw new Error('选择的文件不存在。');
    }
    throw error;
  });

  if (!stats.isFile()) {
    throw new Error('只能添加文件。');
  }

  const bytesToRead = Math.min(stats.size, AGENT_CONTEXT_FILE_MAX_BYTES);
  const buffer = await readFileHead(resolvedPath, bytesToRead);
  const binary = looksLikeBinaryBuffer(buffer);
  const normalized = binary
    ? { text: '', truncated: false }
    : normalizeAgentContextText(buffer.toString('utf8'), options.maxChars || QUICK_PROMPT_ATTACHMENT_TEXT_MAX_CHARS);

  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    size: stats.size,
    binary,
    truncated: normalized.truncated || stats.size > AGENT_CONTEXT_FILE_MAX_BYTES,
    content: normalized.text
  };
}

function inferPromptAttachmentMimeType(filePath) {
  const extension = path.extname(asString(filePath)).trim().toLowerCase();
  const mimeTypes = new Map([
    ['.csv', 'text/csv'],
    ['.html', 'text/html'],
    ['.htm', 'text/html'],
    ['.json', 'application/json'],
    ['.jsonl', 'application/jsonl'],
    ['.log', 'text/plain'],
    ['.md', 'text/markdown'],
    ['.mdx', 'text/markdown'],
    ['.pdf', 'application/pdf'],
    ['.rtf', 'application/rtf'],
    ['.toml', 'application/toml'],
    ['.tsv', 'text/tab-separated-values'],
    ['.txt', 'text/plain'],
    ['.xml', 'application/xml'],
    ['.yaml', 'application/yaml'],
    ['.yml', 'application/yaml'],
    ['.doc', 'application/msword'],
    ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['.ppt', 'application/vnd.ms-powerpoint'],
    ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['.xls', 'application/vnd.ms-excel'],
    ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  ]);

  return mimeTypes.get(extension) || '';
}

async function createQuickPromptAttachmentFromPath(filePath, kindHint = '') {
  const resolvedPath = path.resolve(asString(filePath).trim());
  const stats = await fs.promises.stat(resolvedPath).catch((error) => {
    if (error && error.code === 'ENOENT') {
      throw new Error('选择的文件不存在。');
    }
    throw error;
  });

  if (!stats.isFile()) {
    throw new Error('只能添加文件。');
  }

  const image = kindHint === 'image' || isSupportedImageFilePath(resolvedPath);
  if (image) {
    if (!isSupportedImageFilePath(resolvedPath)) {
      throw new Error(`请选择图片文件：${path.basename(resolvedPath)}`);
    }

    const savedImage = await saveCommandDockImageAsset({
      bytes: await fs.promises.readFile(resolvedPath),
      fileName: path.basename(resolvedPath),
      mimeType: inferImageMimeType(resolvedPath)
    });

    return {
      id: crypto.randomUUID(),
      kind: 'image',
      title: savedImage.name || path.basename(resolvedPath),
      path: savedImage.path,
      content: '',
      size: savedImage.size,
      mimeType: inferImageMimeType(savedImage.path),
      truncated: false,
      binary: true
    };
  }

  const file = await readLocalFileContext(resolvedPath, {
    maxChars: QUICK_PROMPT_ATTACHMENT_TEXT_MAX_CHARS
  });

  return {
    id: crypto.randomUUID(),
    kind: 'file',
    title: file.name,
    path: file.path,
    content: file.content,
    size: file.size,
    mimeType: inferPromptAttachmentMimeType(file.path),
    truncated: file.truncated,
    binary: file.binary
  };
}

async function chooseQuickPromptAttachments(options = {}) {
  const kind = normalizeQuickPromptAttachmentKind(options.kind);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: kind === 'image' ? 'Choose prompt images' : 'Choose prompt documents',
    properties: ['openFile', 'multiSelections'],
    filters: kind === 'image'
      ? [
          { name: 'Images', extensions: ['apng', 'avif', 'bmp', 'gif', 'jpg', 'jpeg', 'png', 'svg', 'webp'] },
          { name: 'All files', extensions: ['*'] }
        ]
      : [
          { name: 'Documents', extensions: ['txt', 'md', 'mdx', 'json', 'jsonl', 'csv', 'tsv', 'toml', 'yaml', 'yml', 'xml', 'html', 'htm', 'log', 'pdf', 'doc', 'docx', 'rtf', 'ppt', 'pptx', 'xls', 'xlsx'] },
          { name: 'All files', extensions: ['*'] }
        ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const attachments = [];
  for (const filePath of result.filePaths) {
    attachments.push(await createQuickPromptAttachmentFromPath(filePath, kind));
  }

  return normalizeQuickPromptAttachments(attachments);
}

function decodeBasicHtmlEntities(value) {
  return asString(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
        ? String.fromCodePoint(codePoint)
        : '';
    })
    .replace(/&#(\d+);/g, (_match, digits) => {
      const codePoint = Number.parseInt(digits, 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF
        ? String.fromCodePoint(codePoint)
        : '';
    });
}

function extractHtmlTitle(content) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(asString(content));
  if (!match) {
    return '';
  }

  return decodeBasicHtmlEntities(match[1])
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function extractReadableTextFromHtml(content) {
  const withoutNoise = asString(content)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n');
  const text = withoutNoise
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|section|article|header|footer|main|aside|nav|li|tr|h[1-6]|pre|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeBasicHtmlEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readFetchResponseBuffer(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer: buffer.length > maxBytes ? buffer.subarray(0, maxBytes) : buffer,
      truncated: buffer.length > maxBytes
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      if (totalBytes + chunk.length > maxBytes) {
        chunks.push(chunk.subarray(0, Math.max(0, maxBytes - totalBytes)));
        totalBytes = maxBytes;
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }

      chunks.push(chunk);
      totalBytes += chunk.length;
    }
  } finally {
    reader.releaseLock?.();
  }

  return {
    buffer: Buffer.concat(chunks, totalBytes),
    truncated
  };
}

async function fetchAgentContextUrl(options = {}) {
  const rawUrl = asString(options.url).trim();
  if (!rawUrl) {
    throw new Error('请输入要加入上下文的 URL。');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error('URL 地址无效。');
  }

  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('只支持 http(s) URL。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_CONTEXT_FETCH_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(parsedUrl.toString(), {
      headers: {
        Accept: 'text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.5',
        'User-Agent': 'CLI-in-One-Agent-Context/1.0'
      },
      redirect: 'follow',
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('URL 读取超时。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`URL 读取失败：HTTP ${response.status}`);
  }

  const contentType = asString(response.headers.get('content-type')).split(';')[0].trim().toLowerCase();
  const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > AGENT_CONTEXT_URL_MAX_BYTES * 4) {
    throw new Error('URL 内容太大，无法加入上下文。');
  }

  const body = await readFetchResponseBuffer(response, AGENT_CONTEXT_URL_MAX_BYTES);
  if (looksLikeBinaryBuffer(body.buffer)) {
    throw new Error('URL 返回的内容看起来不是文本。');
  }

  const rawContent = body.buffer.toString('utf8');
  const html = contentType === 'text/html' || /<\/?[a-z][\s\S]*>/i.test(rawContent);
  const extractedText = html ? extractReadableTextFromHtml(rawContent) : rawContent;
  const normalized = normalizeAgentContextText(extractedText);

  return {
    url: response.url || parsedUrl.toString(),
    requestedUrl: parsedUrl.toString(),
    title: html ? extractHtmlTitle(rawContent) : '',
    contentType,
    truncated: body.truncated || normalized.truncated,
    content: normalized.text
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

function getVSCodeExecutableCandidates() {
  const candidates = [];
  const seen = new Set();
  const appendCandidate = (candidatePath) => {
    const normalizedPath = asString(candidatePath).trim();
    if (!normalizedPath) {
      return;
    }

    const resolvedPath = path.resolve(normalizedPath);
    const key = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    candidates.push(resolvedPath);
  };

  const pathValue = process.env.PATH || process.env.Path || '';
  for (const pathEntry of pathValue.split(path.delimiter)) {
    if (!pathEntry) {
      continue;
    }

    appendCandidate(path.join(pathEntry, 'Code.exe'));
    appendCandidate(path.resolve(pathEntry, '..', 'Code.exe'));
    if (process.platform !== 'win32') {
      appendCandidate(path.join(pathEntry, 'code'));
    }
  }

  appendCandidate(process.env.LOCALAPPDATA && path.join(
    process.env.LOCALAPPDATA,
    'Programs',
    'Microsoft VS Code',
    'Code.exe'
  ));
  appendCandidate(process.env.ProgramFiles && path.join(
    process.env.ProgramFiles,
    'Microsoft VS Code',
    'Code.exe'
  ));
  appendCandidate(process.env['ProgramFiles(x86)'] && path.join(
    process.env['ProgramFiles(x86)'],
    'Microsoft VS Code',
    'Code.exe'
  ));
  appendCandidate(process.env.LOCALAPPDATA && path.join(
    process.env.LOCALAPPDATA,
    'Programs',
    'Microsoft VS Code Insiders',
    'Code - Insiders.exe'
  ));
  appendCandidate(process.env.ProgramFiles && path.join(
    process.env.ProgramFiles,
    'Microsoft VS Code Insiders',
    'Code - Insiders.exe'
  ));

  return candidates;
}

async function findVSCodeExecutable() {
  for (const candidatePath of getVSCodeExecutableCandidates()) {
    try {
      const stats = await fs.promises.stat(candidatePath);
      if (stats.isFile()) {
        return candidatePath;
      }
    } catch {
      // Keep searching known PATH and install locations.
    }
  }

  return '';
}

function openPathWithVSCodeExecutable(executablePath, targetPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, ['--reuse-window', targetPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });

    child.once('error', (error) => {
      reject(new Error(`启动 VSCode 失败：${error.message}`));
    });

    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}

async function openPathInVSCode(targetPath) {
  const normalizedPath = asString(targetPath).trim();
  if (!normalizedPath) {
    throw new Error('没有可打开的路径。');
  }

  const resolvedPath = path.resolve(normalizedPath);
  const executablePath = await findVSCodeExecutable();
  if (executablePath) {
    return openPathWithVSCodeExecutable(executablePath, resolvedPath);
  }

  const fileUrl = pathToFileURL(resolvedPath).toString().replace(/^file:\/+/i, '');
  await electronShell.openExternal(`vscode://file/${fileUrl}`);
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

function getAgentBridgeHelperScript() {
  return String.raw`#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function usage() {
  return [
    'CLI in One agent bridge',
    '',
    'Usage:',
    '  cli-in-one sessions',
    '  cli-in-one dispatch --target <session-id-or-title> --message "<task>"',
    '  cli-in-one dispatch --target <session-id-or-title> --file task.txt',
    '  cli-in-one dispatch --target <session-id-or-title> --stdin',
    '',
    'Options:',
    '  -t, --target <value>   Target live session id, id prefix, exact title, or unique title fragment.',
    '  -m, --message <text>   Text to send to the target session.',
    '  -f, --file <path>      Read message text from a file.',
    '      --stdin            Read message text from standard input.',
    '      --no-enter         Send text without the final Enter key.',
    '      --timeout <ms>     Wait time for bridge acknowledgement. Default: 10000.'
  ].join(os.EOL);
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function getBridgeDir() {
  const bridgeDir = String(process.env.CLI_IN_ONE_AGENT_BRIDGE_DIR || '').trim();
  if (!bridgeDir) {
    fail('CLI_IN_ONE_AGENT_BRIDGE_DIR is not set. Run this command inside a CLI in One session.');
  }
  return bridgeDir;
}

function parseArgs(argv) {
  const result = {
    flags: new Set(),
    positionals: [],
    values: {}
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('-') || arg === '-') {
      result.positionals.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf('=');
    const rawName = eqIndex > 0 ? arg.slice(0, eqIndex) : arg;
    const name = rawName.replace(/^-+/, '');
    const valueFromEquals = eqIndex > 0 ? arg.slice(eqIndex + 1) : null;
    const expectsValue = new Set(['t', 'target', 'm', 'message', 'f', 'file', 'timeout']).has(name);

    if (expectsValue) {
      const value = valueFromEquals !== null ? valueFromEquals : argv[index + 1];
      if (typeof value === 'undefined' || (value.startsWith('-') && valueFromEquals === null)) {
        fail('Missing value for --' + name);
      }
      if (valueFromEquals === null) {
        index += 1;
      }
      result.values[name] = value;
      continue;
    }

    result.flags.add(name);
  }

  return result;
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function formatCell(value, width) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= width) {
    return text.padEnd(width, ' ');
  }
  return text.slice(0, Math.max(0, width - 1)) + '…';
}

function printSessions() {
  const bridgeDir = getBridgeDir();
  const sessionsPath = process.env.CLI_IN_ONE_AGENT_BRIDGE_SESSIONS
    || path.join(bridgeDir, 'sessions.json');
  const payload = readJsonFile(sessionsPath, { sessions: [] });
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  const currentId = String(process.env.CLI_IN_ONE_SESSION_ID || '');

  if (sessions.length === 0) {
    console.log('No live CLI in One sessions were published yet.');
    return;
  }

  console.log([
    formatCell('ID', 12),
    formatCell('TITLE', 28),
    formatCell('CLI', 14),
    formatCell('SELF', 5),
    'CWD'
  ].join('  '));

  for (const session of sessions) {
    const id = String(session.id || '');
    console.log([
      formatCell(id.slice(0, 12), 12),
      formatCell(session.title || '', 28),
      formatCell(session.cliProviderId || '', 14),
      formatCell(id === currentId ? 'yes' : '', 5),
      String(session.cwd || '')
    ].join('  '));
  }
}

function readDispatchMessage(args) {
  const message = args.values.message ?? args.values.m;
  if (typeof message === 'string') {
    return message;
  }

  const filePath = args.values.file ?? args.values.f;
  if (typeof filePath === 'string') {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  }

  if (args.flags.has('stdin')) {
    return fs.readFileSync(0, 'utf8');
  }

  return args.positionals.join(' ');
}

function sleep(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function waitForResponse(responsePath, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (fs.existsSync(responsePath)) {
      const response = readJsonFile(responsePath, null);
      try {
        fs.rmSync(responsePath, { force: true });
      } catch {}
      return response;
    }
    sleep(100);
  }
  return null;
}

function dispatch(args) {
  const target = String(args.values.target ?? args.values.t ?? '').trim();
  if (!target) {
    fail('Missing --target. Run "cli-in-one sessions" to choose a target session.');
  }

  const message = readDispatchMessage(args);
  if (!String(message || '').trim()) {
    fail('Missing message. Use --message, --file, --stdin, or positional text.');
  }

  const bridgeDir = getBridgeDir();
  const inboxDir = path.join(bridgeDir, 'inbox');
  const responsesDir = path.join(bridgeDir, 'responses');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.mkdirSync(responsesDir, { recursive: true });

  const id = Date.now() + '-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  const responsePath = path.join(responsesDir, id + '.json');
  const requestPath = path.join(inboxDir, id + '.json');
  const tempPath = requestPath + '.tmp';
  const timeoutValue = Number.parseInt(args.values.timeout || '10000', 10);
  const timeoutMs = Number.isFinite(timeoutValue) ? Math.max(1000, timeoutValue) : 10000;
  const request = {
    version: 1,
    id,
    type: 'dispatch',
    target,
    message,
    enter: !args.flags.has('no-enter'),
    sourceSessionId: String(process.env.CLI_IN_ONE_SESSION_ID || ''),
    sourceSessionTitle: String(process.env.CLI_IN_ONE_SESSION_TITLE || ''),
    createdAt: Date.now(),
    responsePath
  };

  fs.writeFileSync(tempPath, JSON.stringify(request, null, 2), 'utf8');
  fs.renameSync(tempPath, requestPath);

  const response = waitForResponse(responsePath, timeoutMs);
  if (!response) {
    fail('Timed out waiting for CLI in One to process the dispatch request.');
  }
  if (!response.ok) {
    fail(response.error || 'Dispatch failed.');
  }

  console.log(response.message || ('Dispatched to ' + (response.targetTitle || response.targetId || target) + '.'));
}

const command = String(process.argv[2] || 'help').trim().toLowerCase();
const args = parseArgs(process.argv.slice(3));

if (command === 'sessions' || command === 'list' || command === 'ls') {
  printSessions();
} else if (command === 'dispatch' || command === 'send') {
  dispatch(args);
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(usage());
} else {
  console.error('Unknown command: ' + command);
  console.log('');
  console.log(usage());
  process.exit(1);
}
`;
}

function getAgentBridgeCmdScript() {
  return [
    '@echo off',
    'setlocal',
    'if not defined CLI_IN_ONE_NODE_PATH set "CLI_IN_ONE_NODE_PATH=node"',
    'set "ELECTRON_RUN_AS_NODE=1"',
    '"%CLI_IN_ONE_NODE_PATH%" "%~dp0cli-in-one-agent.js" %*',
    'exit /b %ERRORLEVEL%',
    ''
  ].join('\r\n');
}

function getAgentBridgePowerShellScript() {
  return [
    '$node = $env:CLI_IN_ONE_NODE_PATH',
    'if ([string]::IsNullOrWhiteSpace($node)) { $node = "node" }',
    '$env:ELECTRON_RUN_AS_NODE = "1"',
    '& $node "$PSScriptRoot\\cli-in-one-agent.js" @args',
    'exit $LASTEXITCODE',
    ''
  ].join('\n');
}

function getAgentBridgeUnixScript() {
  return [
    '#!/usr/bin/env sh',
    'set -eu',
    ': "${CLI_IN_ONE_NODE_PATH:=node}"',
    'SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"',
    'ELECTRON_RUN_AS_NODE=1 "$CLI_IN_ONE_NODE_PATH" "$SCRIPT_DIR/cli-in-one-agent.js" "$@"',
    ''
  ].join('\n');
}

async function writeTextFileIfChanged(filePath, content, options = {}) {
  let current = null;
  try {
    current = await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (current === content) {
    return false;
  }

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
  if (Number.isFinite(options.mode)) {
    await fs.promises.chmod(filePath, options.mode).catch(() => {});
  }
  return true;
}

async function ensureAgentBridgeFiles() {
  const bridgeDir = getAgentBridgeDir();
  const binDir = getAgentBridgeBinDir();

  await Promise.all([
    fs.promises.mkdir(getAgentBridgeInboxDir(), { recursive: true }),
    fs.promises.mkdir(getAgentBridgeResponsesDir(), { recursive: true }),
    fs.promises.mkdir(binDir, { recursive: true })
  ]);

  await Promise.all([
    writeTextFileIfChanged(
      path.join(binDir, AGENT_BRIDGE_HELPER_FILE_NAME),
      getAgentBridgeHelperScript(),
      { mode: 0o755 }
    ),
    writeTextFileIfChanged(
      path.join(binDir, AGENT_BRIDGE_COMMAND_FILE_NAME),
      getAgentBridgeCmdScript()
    ),
    writeTextFileIfChanged(
      path.join(binDir, AGENT_BRIDGE_POWERSHELL_FILE_NAME),
      getAgentBridgePowerShellScript()
    ),
    writeTextFileIfChanged(
      path.join(binDir, AGENT_BRIDGE_UNIX_COMMAND_FILE_NAME),
      getAgentBridgeUnixScript(),
      { mode: 0o755 }
    )
  ]);

  await fs.promises.mkdir(bridgeDir, { recursive: true });
}

function writeJsonFileAtomicSync(filePath, payload) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function serializeAgentBridgeSession(session) {
  return {
    backend: session.backend || '',
    cliProviderId: session.cliProviderId || 'shell',
    createdAt: session.createdAt || Date.now(),
    cwd: session.cwd || '',
    id: session.id,
    initialCommand: session.initialCommand || '',
    title: session.title || session.id
  };
}

function publishAgentBridgeSessions() {
  try {
    const liveSessions = Array.from(sessions.values())
      .filter((session) => session && !session.exited && session.process)
      .map(serializeAgentBridgeSession)
      .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));

    writeJsonFileAtomicSync(getAgentBridgeSessionsPath(), {
      app: 'CLI in One',
      publishedAt: Date.now(),
      sessions: liveSessions,
      version: 1
    });
  } catch (error) {
    console.warn(`[agent-bridge] failed to publish sessions: ${error.message}`);
  }
}

function normalizeAgentBridgeDispatchInput(message, enter = true) {
  const normalized = String(message || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const payload = normalized.replace(/\n/g, '\r');
  return enter && !payload.endsWith('\r') ? `${payload}\r` : payload;
}

function getAgentBridgeLiveSessions() {
  return Array.from(sessions.values()).filter((session) => (
    session && !session.exited && session.process
  ));
}

function findUniqueAgentBridgeSession(candidates, description) {
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    const names = candidates
      .slice(0, 5)
      .map((session) => `${session.title || session.id} (${session.id.slice(0, 8)})`)
      .join(', ');
    throw new Error(`目标 ${description} 匹配到多个会话：${names}`);
  }
  return null;
}

function resolveAgentBridgeTargetSession(target, sourceSessionId = '') {
  const normalizedTarget = asString(target).trim();
  const liveSessions = getAgentBridgeLiveSessions();
  if (!normalizedTarget) {
    throw new Error('缺少目标会话。请先运行 cli-in-one sessions 查看可用目标。');
  }

  if (normalizedTarget.toLowerCase() === 'self') {
    const selfSession = liveSessions.find((session) => session.id === sourceSessionId);
    if (!selfSession) {
      throw new Error('当前会话不可用，无法使用 self 作为目标。');
    }
    return selfSession;
  }

  const exactId = liveSessions.find((session) => session.id === normalizedTarget);
  if (exactId) {
    return exactId;
  }

  const lowerTarget = normalizedTarget.toLowerCase();
  const exactTitle = liveSessions.find((session) => (
    asString(session.title).trim().toLowerCase() === lowerTarget
  ));
  if (exactTitle) {
    return exactTitle;
  }

  const idPrefixMatch = findUniqueAgentBridgeSession(
    liveSessions.filter((session) => session.id.toLowerCase().startsWith(lowerTarget)),
    `id 前缀 "${normalizedTarget}"`
  );
  if (idPrefixMatch) {
    return idPrefixMatch;
  }

  const titleFragmentMatch = findUniqueAgentBridgeSession(
    liveSessions.filter((session) => asString(session.title).trim().toLowerCase().includes(lowerTarget)),
    `标题片段 "${normalizedTarget}"`
  );
  if (titleFragmentMatch) {
    return titleFragmentMatch;
  }

  throw new Error(`未找到目标会话：${normalizedTarget}`);
}

async function writeAgentBridgeResponse(request, response) {
  const responsePath = path.resolve(asString(request?.responsePath).trim());
  if (!responsePath || !isPathInside(getAgentBridgeResponsesDir(), responsePath)) {
    return;
  }

  await fs.promises.mkdir(path.dirname(responsePath), { recursive: true });
  await fs.promises.writeFile(responsePath, `${JSON.stringify(response, null, 2)}\n`, 'utf8');
}

function pruneAgentBridgeResponses() {
  const responsesDir = getAgentBridgeResponsesDir();
  const cutoff = Date.now() - AGENT_BRIDGE_RESPONSE_TTL_MS;

  fs.promises.readdir(responsesDir, { withFileTypes: true }).then((entries) => (
    Promise.all(entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        return;
      }

      const responsePath = path.join(responsesDir, entry.name);
      try {
        const stats = await fs.promises.stat(responsePath);
        if (stats.mtimeMs < cutoff) {
          await fs.promises.rm(responsePath, { force: true });
        }
      } catch {
        // Response pruning is best-effort only.
      }
    }))
  )).catch(() => {});
}

async function handleAgentBridgeRequest(request) {
  if (!request || typeof request !== 'object' || request.type !== 'dispatch') {
    throw new Error('不支持的 agent bridge 请求。');
  }

  const message = asString(request.message);
  if (!message.trim()) {
    throw new Error('分配内容为空。');
  }
  if (message.length > AGENT_BRIDGE_MESSAGE_MAX_CHARS) {
    throw new Error(`分配内容过长，最多 ${AGENT_BRIDGE_MESSAGE_MAX_CHARS} 个字符。`);
  }

  const targetSession = resolveAgentBridgeTargetSession(request.target, request.sourceSessionId);
  const payload = normalizeAgentBridgeDispatchInput(message, request.enter !== false);
  if (!payload) {
    throw new Error('分配内容为空。');
  }

  const wrote = writeToSessionProcess(targetSession, payload);
  if (!wrote) {
    throw new Error(`无法写入目标会话：${targetSession.title || targetSession.id}`);
  }

  if (targetSession.backend !== 'conpty') {
    appendTerminalTranscript(targetSession, payload);
  }

  sendToRenderer(mainWindow?.webContents, 'agent-bridge:dispatch', {
    id: asString(request.id).trim(),
    message,
    sourceSessionId: asString(request.sourceSessionId).trim(),
    sourceSessionTitle: asString(request.sourceSessionTitle).trim(),
    targetId: targetSession.id,
    targetTitle: targetSession.title || targetSession.id,
    timestamp: Date.now()
  });

  return {
    message: `Dispatched to ${targetSession.title || targetSession.id} (${targetSession.id.slice(0, 8)}).`,
    targetId: targetSession.id,
    targetTitle: targetSession.title || targetSession.id
  };
}

async function processAgentBridgeRequestFile(filePath) {
  let request = null;
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile() || stats.size > AGENT_BRIDGE_REQUEST_MAX_BYTES) {
      throw new Error('agent bridge 请求文件无效或过大。');
    }
    request = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const result = await handleAgentBridgeRequest(request);
    await writeAgentBridgeResponse(request, {
      ok: true,
      ...result
    });
  } catch (error) {
    if (request) {
      await writeAgentBridgeResponse(request, {
        ok: false,
        error: error?.message || String(error)
      });
    }
    console.warn(`[agent-bridge] failed to process request: ${error?.message || error}`);
  } finally {
    await fs.promises.rm(filePath, { force: true }).catch(() => {});
  }
}

function scheduleAgentBridgeInboxScan(delayMs = 80) {
  if (agentBridgeInboxScanTimer) {
    return;
  }

  agentBridgeInboxScanTimer = setTimeout(() => {
    agentBridgeInboxScanTimer = null;
    scanAgentBridgeInbox().catch((error) => {
      console.warn(`[agent-bridge] inbox scan failed: ${error.message}`);
    });
  }, delayMs);

  agentBridgeInboxScanTimer.unref?.();
}

async function scanAgentBridgeInbox() {
  if (agentBridgeInboxProcessing) {
    scheduleAgentBridgeInboxScan(120);
    return;
  }

  agentBridgeInboxProcessing = true;
  try {
    const inboxDir = getAgentBridgeInboxDir();
    const entries = await fs.promises.readdir(inboxDir, { withFileTypes: true }).catch((error) => {
      if (error && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    });
    const requestFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(inboxDir, entry.name))
      .sort();

    for (const requestFile of requestFiles) {
      await processAgentBridgeRequestFile(requestFile);
    }
  } finally {
    agentBridgeInboxProcessing = false;
  }
}

async function startAgentBridgeWatcher() {
  await ensureAgentBridgeFiles();
  publishAgentBridgeSessions();
  pruneAgentBridgeResponses();
  scheduleAgentBridgeInboxScan(0);

  try {
    agentBridgeWatcher?.close();
  } catch {}

  try {
    agentBridgeWatcher = fs.watch(getAgentBridgeInboxDir(), { persistent: false }, () => {
      scheduleAgentBridgeInboxScan();
    });
  } catch (error) {
    console.warn(`[agent-bridge] fs.watch unavailable: ${error.message}`);
  }

  const pollTimer = setInterval(() => {
    scheduleAgentBridgeInboxScan(0);
    pruneAgentBridgeResponses();
  }, 1000);
  pollTimer.unref?.();
}

async function prepareProgramStorage() {
  await fs.promises.mkdir(getProgramStorageDir(), { recursive: true }).catch(() => {});
  await movePathIfMissing(getLegacyDefaultHistoryDir(), getDefaultHistoryDir()).catch(() => {});
  await movePathIfMissing(getLegacyCodexQuickProfilesPath(), getCodexQuickProfilesPath()).catch(() => {});
  await migrateLegacyTempSettingsHomes();
  await pruneEmptyLegacyTempSettingsHomes();
  await ensureAgentBridgeFiles();
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

  const chunkBytes = Buffer.byteLength(data, 'utf8');
  session.transcriptChunks.push(data);
  session.transcriptBytes += chunkBytes;
  session.transcriptBufferedBytes += chunkBytes;
  trimTerminalTranscriptBuffer(session);
}

function sliceUtf8TailByBytes(value, maxBytes) {
  if (typeof value !== 'string' || maxBytes <= 0) {
    return '';
  }

  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) {
    return value;
  }

  let start = Math.max(0, buffer.length - maxBytes);
  while (start < buffer.length && (buffer[start] & 0xC0) === 0x80) {
    start += 1;
  }

  return buffer.subarray(start).toString('utf8');
}

function trimTerminalTranscriptBuffer(session) {
  if (!session || !Array.isArray(session.transcriptChunks)) {
    return;
  }

  let bufferedBytes = Number.isFinite(session.transcriptBufferedBytes)
    ? Math.max(0, session.transcriptBufferedBytes)
    : 0;

  while (bufferedBytes > TERMINAL_TRANSCRIPT_MAX_BYTES && session.transcriptChunks.length > 0) {
    const firstChunk = session.transcriptChunks[0];
    const firstChunkBytes = Buffer.byteLength(firstChunk, 'utf8');
    const overflowBytes = bufferedBytes - TERMINAL_TRANSCRIPT_MAX_BYTES;

    session.transcriptTruncated = true;

    if (firstChunkBytes <= overflowBytes) {
      session.transcriptChunks.shift();
      bufferedBytes -= firstChunkBytes;
      continue;
    }

    const trimmedChunk = sliceUtf8TailByBytes(firstChunk, firstChunkBytes - overflowBytes);
    const trimmedChunkBytes = Buffer.byteLength(trimmedChunk, 'utf8');
    session.transcriptChunks[0] = trimmedChunk;
    bufferedBytes -= Math.max(0, firstChunkBytes - trimmedChunkBytes);
    break;
  }

  session.transcriptBufferedBytes = bufferedBytes;
}

function getBufferedTerminalTranscriptText(session) {
  return normalizeTranscriptText((session?.transcriptChunks || []).join(''));
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
  const body = getBufferedTerminalTranscriptText(session);
  const headerLines = [
    'CLI in One terminal transcript',
    `Title: ${session.title}`,
    `CWD: ${session.cwd}`,
    `Shell: ${session.shell}`,
    `Backend: ${session.backend}`,
    `CLI: ${session.cliProviderId || 'shell'}`,
    `Started: ${startedAt.toLocaleString()}`,
    `Exported: ${exportedAt.toLocaleString()}`,
    `Status: ${status}`
  ];

  if (session.transcriptTruncated) {
    headerLines.push(
      `Note: earlier output was trimmed in memory; only the most recent ${Math.round(TERMINAL_TRANSCRIPT_MAX_BYTES / (1024 * 1024))} MiB are included below.`
    );
  }

  headerLines.push('', '---', '');
  const header = headerLines.join(os.EOL);

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

  const body = getBufferedTerminalTranscriptText(session);
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

function inferImageMimeType(fileName, mimeType) {
  const normalizedMimeType = typeof mimeType === 'string'
    ? mimeType.trim().toLowerCase().split(';')[0].trim()
    : '';
  if (normalizedMimeType.startsWith('image/')) {
    return normalizedMimeType;
  }

  const originalExtension = typeof fileName === 'string'
    ? path.extname(fileName).trim().toLowerCase()
    : '';
  if (originalExtension === '.jpg' || originalExtension === '.jpeg') {
    return 'image/jpeg';
  }

  return imageMimeTypeByExtension.get(originalExtension) || 'image/png';
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

function isSupportedImageFilePath(fileName) {
  return /\.(?:apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(asString(fileName));
}

function getImageApiReferenceValue(reference) {
  if (reference && typeof reference === 'object' && !Array.isArray(reference)) {
    return asString(
      reference.url
      || reference.path
      || reference.normalizedPath
      || reference.sourceUrl
      || reference.href
    ).trim();
  }

  return asString(reference).trim();
}

function resolveLocalImageReferencePath(value) {
  const rawValue = asString(value).trim();
  if (!rawValue) {
    return '';
  }

  if (/^file:/i.test(rawValue)) {
    try {
      return fileURLToPath(rawValue);
    } catch {
      return '';
    }
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawValue) && !/^[a-zA-Z]:[\\/]/.test(rawValue)) {
    return '';
  }

  return path.isAbsolute(rawValue) ? rawValue : '';
}

async function normalizeImageApiReferenceImage(reference) {
  const rawValue = getImageApiReferenceValue(reference);
  if (!rawValue) {
    return '';
  }

  if (/^data:image\/[^;,]+;base64,/i.test(rawValue)) {
    return rawValue;
  }

  const filePath = resolveLocalImageReferencePath(rawValue);
  if (!filePath && /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(rawValue) && !/^[a-zA-Z]:[\\/]/.test(rawValue)) {
    return rawValue;
  }
  if (!filePath) {
    return rawValue;
  }

  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats?.isFile()) {
    throw new Error(`参考图不存在：${filePath}`);
  }
  if (stats.size > IMAGE_API_REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error(`参考图不能超过 ${Math.floor(IMAGE_API_REFERENCE_IMAGE_MAX_BYTES / 1024 / 1024)} MB：${path.basename(filePath)}`);
  }

  if (!isSupportedImageFilePath(filePath)) {
    throw new Error(`参考图不是支持的图片文件：${filePath}`);
  }
  const mimeType = inferImageMimeType(filePath);

  const buffer = await fs.promises.readFile(filePath);
  if (buffer.length === 0) {
    throw new Error(`参考图内容为空：${filePath}`);
  }

  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function normalizeImageApiReferenceImages(references) {
  const sourceReferences = Array.isArray(references) ? references : [];
  const normalizedReferences = [];
  const seen = new Set();

  for (const reference of sourceReferences) {
    const normalizedReference = await normalizeImageApiReferenceImage(reference);
    if (!normalizedReference) {
      continue;
    }

    const key = normalizedReference.startsWith('data:')
      ? normalizedReference.slice(0, 200)
      : normalizedReference;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedReferences.push(normalizedReference);

    if (normalizedReferences.length >= IMAGE_API_REFERENCE_IMAGE_MAX_COUNT) {
      break;
    }
  }

  return normalizedReferences;
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

async function saveCommandDockImagePathAsset(filePath) {
  const resolvedPath = path.resolve(asString(filePath).trim());
  if (!resolvedPath) {
    throw new Error('图片路径为空。');
  }

  const stats = await fs.promises.stat(resolvedPath).catch((error) => {
    if (error && error.code === 'ENOENT') {
      throw new Error('图片文件不存在。');
    }
    throw error;
  });

  if (!stats.isFile()) {
    throw new Error('只能保存图片文件。');
  }
  if (!isSupportedImageFilePath(resolvedPath)) {
    throw new Error('请选择图片文件。');
  }

  return saveCommandDockImageAsset({
    bytes: await fs.promises.readFile(resolvedPath),
    fileName: path.basename(resolvedPath),
    mimeType: inferImageMimeType(resolvedPath)
  });
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
    size: IMAGE_API_DEFAULT_SIZE,
    upscale: IMAGE_API_DEFAULT_UPSCALE,
    requestEditorEnabled: false
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

function normalizeImageApiUpscale(value) {
  const normalized = asString(value, IMAGE_API_DEFAULT_UPSCALE).trim().toLowerCase();
  if (!normalized) {
    return IMAGE_API_DEFAULT_UPSCALE;
  }

  if (normalized === '2k' || normalized === '4k') {
    return normalized;
  }

  throw new Error('图像清晰度只支持 2k、4k，或留空。');
}

function normalizeImageApiUpscaleLoose(value) {
  try {
    return normalizeImageApiUpscale(value);
  } catch {
    return IMAGE_API_DEFAULT_UPSCALE;
  }
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
    size: normalizeImageApiSize(raw?.size ?? previous.size),
    upscale: normalizeImageApiUpscale(raw?.upscale ?? previous.upscale),
    requestEditorEnabled: Boolean(raw?.requestEditorEnabled ?? previous.requestEditorEnabled)
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
    size: normalized.size || IMAGE_API_DEFAULT_SIZE,
    upscale: normalizeImageApiUpscale(normalized.upscale),
    requestEditorEnabled: Boolean(normalized.requestEditorEnabled)
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

function normalizeImageApiHistoryStatus(value, fallback = 'success') {
  return asString(value, fallback).trim().toLowerCase() || fallback;
}

function normalizeImageApiHistoryNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeImageApiHistoryItem(record, index = 0) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const pathValue = asString(record.path).trim();
  const normalizedPath = asString(record.normalizedPath, pathValue).replace(/\\/g, '/').trim();
  const rawKind = asString(record.kind).trim().toLowerCase();
  const kind = rawKind === 'task' && !pathValue && !normalizedPath ? 'task' : 'image';
  const status = normalizeImageApiHistoryStatus(record.status, kind === 'task' ? 'failed' : 'success');

  if (kind === 'task' && status !== 'success' && !IMAGE_API_FAILED_STATUSES.has(status)) {
    return null;
  }

  if (kind === 'image' && !pathValue && !normalizedPath) {
    return null;
  }

  const createdAt = normalizeImageApiHistoryNumber(record.createdAt, Date.now());
  const updatedAt = normalizeImageApiHistoryNumber(record.updatedAt, createdAt);
  const id = asString(record.id).trim()
    || `${kind}-${createdAt}-${index}-${crypto.randomBytes(3).toString('hex')}`;
  const count = Number.parseInt(record.n, 10);
  const referenceImageCount = Number.parseInt(record.referenceImageCount, 10);

  return {
    id,
    kind,
    taskId: asString(record.taskId).trim(),
    status,
    createdAt,
    updatedAt,
    finishedAt: normalizeImageApiHistoryNumber(record.finishedAt, null),
    model: asString(record.model).trim(),
    n: Number.isFinite(count) ? Math.min(4, Math.max(1, count)) : null,
    size: asString(record.size).trim(),
    upscale: normalizeImageApiUpscaleLoose(record.upscale),
    referenceImageCount: Number.isFinite(referenceImageCount) ? Math.max(0, referenceImageCount) : 0,
    name: asString(record.name).trim(),
    normalizedPath,
    path: pathValue || normalizedPath,
    prompt: asString(record.prompt),
    error: asString(record.error).trim(),
    pollEvents: Array.isArray(record.pollEvents)
      ? record.pollEvents.map((event, eventIndex) => serializeImageApiPollEvent(event, eventIndex))
      : [],
    successPayload: typeof record.successPayload === 'undefined'
      ? null
      : sanitizeImageApiPayload(record.successPayload),
    failurePayload: typeof record.failurePayload === 'undefined'
      ? null
      : sanitizeImageApiPayload(record.failurePayload),
    requestParams: typeof record.requestParams === 'undefined'
      ? null
      : sanitizeImageApiPayload(record.requestParams),
    requestBody: typeof record.requestBody === 'undefined'
      ? null
      : sanitizeImageApiPayload(record.requestBody)
  };
}

function normalizeImageApiHistoryStore(raw = {}) {
  const sourceItems = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items) ? raw.items : [];
  const items = [];
  const seenIds = new Set();

  sourceItems.forEach((record, index) => {
    const normalized = normalizeImageApiHistoryItem(record, index);
    if (!normalized) {
      return;
    }

    if (seenIds.has(normalized.id)) {
      normalized.id = `${normalized.id}-${crypto.randomBytes(3).toString('hex')}`;
    }
    seenIds.add(normalized.id);
    items.push(normalized);
  });

  return {
    version: 1,
    items: items.slice(0, IMAGE_API_HISTORY_MAX_ITEMS)
  };
}

function toImageApiHistoryPayload(store) {
  return {
    path: getImageApiHistoryPath(),
    version: 1,
    items: store.items
  };
}

async function readImageApiHistoryStore() {
  const historyPath = getImageApiHistoryPath();

  try {
    const content = await fs.promises.readFile(historyPath, 'utf8');
    return normalizeImageApiHistoryStore(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeImageApiHistoryStore({});
    }

    if (error instanceof SyntaxError) {
      throw new Error(`生图历史文件不是有效 JSON：${error.message}`);
    }

    throw error;
  }
}

async function writeImageApiHistoryStore(store) {
  const normalized = normalizeImageApiHistoryStore(store);
  const historyPath = getImageApiHistoryPath();
  const tempPath = path.join(
    path.dirname(historyPath),
    `${IMAGE_API_HISTORY_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
  );

  await fs.promises.mkdir(path.dirname(historyPath), { recursive: true });

  try {
    await fs.promises.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    await fs.promises.rename(tempPath, historyPath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return normalized;
}

async function listImageApiHistory() {
  return toImageApiHistoryPayload(await readImageApiHistoryStore());
}

async function writeImageApiHistory(payload = {}) {
  const store = await writeImageApiHistoryStore(payload || {});
  return toImageApiHistoryPayload(store);
}

async function clearImageApiHistory() {
  const store = await writeImageApiHistoryStore({ items: [] });
  return toImageApiHistoryPayload(store);
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

function truncateImageApiPayloadString(value) {
  const text = asString(value);
  if (text.length <= IMAGE_API_TASK_PAYLOAD_MAX_STRING_LENGTH) {
    return text;
  }

  const headLength = Math.max(
    1200,
    Math.min(3200, IMAGE_API_TASK_PAYLOAD_MAX_STRING_LENGTH - 180)
  );
  const tailLength = Math.min(140, IMAGE_API_TASK_PAYLOAD_MAX_STRING_LENGTH - 80);
  const omitted = Math.max(0, text.length - headLength - tailLength);
  return omitted > 0
    ? `${text.slice(0, headLength)}\n...[${omitted} chars omitted]...\n${text.slice(-tailLength)}`
    : text.slice(0, IMAGE_API_TASK_PAYLOAD_MAX_STRING_LENGTH);
}

function sanitizeImageApiPayload(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return truncateImageApiPayloadString(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'undefined') {
    return null;
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (Array.isArray(value)) {
    if (depth >= IMAGE_API_TASK_PAYLOAD_MAX_DEPTH) {
      return [`[Array(${value.length})]`];
    }

    const items = value
      .slice(0, IMAGE_API_TASK_PAYLOAD_MAX_ARRAY_LENGTH)
      .map((item) => sanitizeImageApiPayload(item, depth + 1, seen));
    if (value.length > IMAGE_API_TASK_PAYLOAD_MAX_ARRAY_LENGTH) {
      items.push(`[+${value.length - IMAGE_API_TASK_PAYLOAD_MAX_ARRAY_LENGTH} more item(s)]`);
    }
    return items;
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    if (depth >= IMAGE_API_TASK_PAYLOAD_MAX_DEPTH) {
      return `[Object ${Object.keys(value).length} keys]`;
    }

    seen.add(value);
    const output = {};
    const entries = Object.entries(value);
    for (const [key, entryValue] of entries.slice(0, IMAGE_API_TASK_PAYLOAD_MAX_OBJECT_KEYS)) {
      output[key] = sanitizeImageApiPayload(entryValue, depth + 1, seen);
    }
    if (entries.length > IMAGE_API_TASK_PAYLOAD_MAX_OBJECT_KEYS) {
      output.__truncatedKeys = `[+${entries.length - IMAGE_API_TASK_PAYLOAD_MAX_OBJECT_KEYS} more key(s)]`;
    }
    seen.delete(value);
    return output;
  }

  return truncateImageApiPayloadString(String(value));
}

function createImageApiError(message, payload) {
  const error = new Error(message);
  if (typeof payload !== 'undefined') {
    error.imageApiPayload = payload;
  }
  return error;
}

function serializeImageApiPollEvent(event, index = 0) {
  const eventIndex = Number.isFinite(Number(event?.index))
    ? Number(event.index)
    : index + 1;
  const receivedAt = Number(event?.receivedAt);

  return {
    index: eventIndex > 0 ? eventIndex : index + 1,
    receivedAt: Number.isFinite(receivedAt) && receivedAt > 0 ? receivedAt : Date.now(),
    status: asString(event?.status || 'running') || 'running',
    finishedAt: event?.finishedAt || null,
    payload: sanitizeImageApiPayload(event?.payload)
  };
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
    throw createImageApiError(`图像 API 请求失败 (${response.status})：${message}`, body);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('图像 API 返回内容不是有效对象。');
  }

  return body;
}

function getImageApiRequestParams(value) {
  const source = getJsonObject(value);
  const params = {};

  Object.entries(source).forEach(([key, entryValue]) => {
    const paramName = asString(key).trim();
    if (!paramName) {
      return;
    }

    if (entryValue === null || typeof entryValue === 'undefined') {
      params[paramName] = '';
      return;
    }

    if (Array.isArray(entryValue)) {
      params[paramName] = entryValue
        .filter((item) => item !== null && typeof item !== 'undefined')
        .map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item));
      return;
    }

    params[paramName] = typeof entryValue === 'object' ? JSON.stringify(entryValue) : String(entryValue);
  });

  return params;
}

function applyImageApiRequestParams(requestUrl, params) {
  requestUrl.search = '';

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => requestUrl.searchParams.append(key, item));
      return;
    }

    requestUrl.searchParams.set(key, value);
  });
}

async function normalizeImageApiRequestBodyReferenceImages(body, fallbackReferences = []) {
  const rawBody = getJsonObject(body);
  const nextBody = { ...rawBody };
  const sourceReferences = Array.isArray(rawBody.reference_images)
    ? rawBody.reference_images
    : fallbackReferences;
  const referenceImages = await normalizeImageApiReferenceImages(sourceReferences);

  if (referenceImages.length > 0) {
    nextBody.reference_images = referenceImages;
  } else if (Array.isArray(rawBody.reference_images)) {
    delete nextBody.reference_images;
  }

  return {
    body: nextBody,
    referenceImageCount: referenceImages.length
  };
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
    upscale: normalizeImageApiUpscaleLoose(task?.upscale),
    referenceImageCount: Number.isFinite(Number.parseInt(task?.referenceImageCount, 10))
      ? Number.parseInt(task?.referenceImageCount, 10)
      : 0,
    images: Array.isArray(task?.images) ? task.images : [],
    imageUrls: Array.isArray(task?.imageUrls) ? task.imageUrls : [],
    pollEvents: Array.isArray(task?.pollEvents)
      ? task.pollEvents.map((event, index) => serializeImageApiPollEvent(event, index))
      : [],
    successPayload: typeof task?.successPayload === 'undefined'
      ? null
      : sanitizeImageApiPayload(task.successPayload),
    failurePayload: typeof task?.failurePayload === 'undefined'
      ? null
      : sanitizeImageApiPayload(task.failurePayload),
    requestParams: typeof task?.requestParams === 'undefined'
      ? null
      : sanitizeImageApiPayload(task.requestParams),
    requestBody: typeof task?.requestBody === 'undefined'
      ? null
      : sanitizeImageApiPayload(task.requestBody),
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
      throw createImageApiError(getImageApiErrorMessage(result) || result.error || '图像任务失败。', result);
    }

    if (result?.finished_at && getImageApiResultUrlEntries(result, config).length === 0) {
      throw createImageApiError(getImageApiErrorMessage(result) || '图像任务已结束，但没有返回图片。', result);
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
        throw createImageApiError(getImageApiErrorMessage(dispatched) || dispatched.error || '图像任务失败。', dispatched);
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
          const status = asString(pollResult?.status).trim();
          const existingPollEvents = Array.isArray(task.pollEvents) ? task.pollEvents : [];
          const nextPollEvents = [
            ...existingPollEvents,
            serializeImageApiPollEvent({
              index: existingPollEvents.length + 1,
              receivedAt: Date.now(),
              status: status || 'running',
              finishedAt: pollResult?.finished_at || null,
              payload: pollResult
            }, existingPollEvents.length)
          ].slice(-IMAGE_API_TASK_POLL_HISTORY_MAX_ITEMS);
          const pollUpdate = {
            pollEvents: nextPollEvents
          };

          if (!isImageApiTaskSuccessful(pollResult, config) && !isImageApiTaskFailed(pollResult)) {
            pollUpdate.status = status || 'running';
            pollUpdate.finishedAt = pollResult?.finished_at || null;
          }

          updateImageApiTask(webContents, task, pollUpdate);
        }
      });
    }

    if (isImageApiTaskFailed(result)) {
      throw createImageApiError(getImageApiErrorMessage(result) || result.error || '图像任务失败。', result);
    }

    updateImageApiTask(webContents, task, {
      taskId: asString(result.task_id || result.taskId || task.taskId),
      status: 'saving',
      created: result.created || task.created || null,
      finishedAt: result.finished_at || task.finishedAt || null,
      creditCost: result.credit_cost ?? task.creditCost ?? null,
      successPayload: sanitizeImageApiPayload(result),
      failurePayload: null
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
      successPayload: sanitizeImageApiPayload(result),
      failurePayload: null,
      error: ''
    });
  } catch (error) {
    updateImageApiTask(webContents, task, {
      status: 'failed',
      failurePayload: typeof error?.imageApiPayload === 'undefined'
        ? null
        : sanitizeImageApiPayload(error.imageApiPayload),
      error: error?.message || '图像任务失败。'
    });
  }
}

async function generateImageWithApi(options = {}, context = {}) {
  const savedConfig = await readImageApiConfig({ includeSecret: true });
  const config = {
    ...savedConfig,
    model: asString(options.model, savedConfig.model).trim() || IMAGE_API_DEFAULT_MODEL,
    n: normalizeImageApiCount(options.n ?? savedConfig.n),
    size: normalizeImageApiSize(options.size ?? savedConfig.size),
    upscale: normalizeImageApiUpscale(options.upscale ?? savedConfig.upscale)
  };
  const { generationUrl } = buildImageApiUrls(config.baseUrl);
  const requestUrl = new URL(generationUrl);
  const requestParams = getImageApiRequestParams(
    Object.prototype.hasOwnProperty.call(options || {}, 'requestParams')
      ? options.requestParams
      : { async: '1' }
  );
  applyImageApiRequestParams(requestUrl, requestParams);

  const defaultBody = {
    model: config.model || IMAGE_API_DEFAULT_MODEL,
    prompt: asString(options.prompt).trim(),
    n: normalizeImageApiCount(config.n),
    size: config.size || IMAGE_API_DEFAULT_SIZE
  };
  if (config.upscale) {
    defaultBody.upscale = config.upscale;
  }

  const customBody = Object.prototype.hasOwnProperty.call(options || {}, 'requestBody')
    ? getJsonObject(options.requestBody)
    : null;
  const requestBodySource = customBody ? { ...customBody } : defaultBody;
  if (!asString(requestBodySource.prompt).trim() && defaultBody.prompt) {
    requestBodySource.prompt = defaultBody.prompt;
  }
  const { body, referenceImageCount } = await normalizeImageApiRequestBodyReferenceImages(
    requestBodySource,
    options.referenceImageUrls
  );
  const prompt = asString(body.prompt).trim();
  if (!prompt) {
    throw new Error('请输入图片提示词。');
  }
  const taskCount = Number.parseInt(body.n, 10);

  const task = {
    id: normalizeImageApiClientTaskId(options.clientTaskId || options.id),
    taskId: '',
    model: asString(body.model, config.model).trim() || IMAGE_API_DEFAULT_MODEL,
    n: Number.isFinite(taskCount) ? taskCount : normalizeImageApiCount(config.n),
    size: asString(body.size, config.size).trim() || IMAGE_API_DEFAULT_SIZE,
    upscale: normalizeImageApiUpscaleLoose(body.upscale ?? config.upscale),
    referenceImageCount,
    status: 'submitting',
    prompt,
    created: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: null,
    images: [],
    imageUrls: [],
    pollEvents: [],
    successPayload: null,
    failurePayload: null,
    requestParams: sanitizeImageApiPayload(requestParams),
    requestBody: sanitizeImageApiPayload(body),
    creditCost: null,
    error: ''
  };

  let dispatched;
  try {
    dispatched = await fetchImageApiJson(requestUrl.toString(), {
      method: 'POST',
      headers: getImageApiRequestHeaders(config),
      body: JSON.stringify(body)
    }, IMAGE_API_DISPATCH_TIMEOUT_MS);
  } catch (error) {
    updateImageApiTask(context.webContents, task, {
      status: 'failed',
      finishedAt: Date.now(),
      failurePayload: typeof error?.imageApiPayload === 'undefined'
        ? null
        : sanitizeImageApiPayload(error.imageApiPayload),
      error: error?.message || '图像任务失败。'
    });
    throw error;
  }

  Object.assign(task, {
    taskId: asString(dispatched.task_id || dispatched.taskId),
    status: isImageApiTaskSuccessful(dispatched, config)
      ? 'saving'
      : (asString(dispatched.status || 'queued') || 'queued'),
    created: dispatched.created || null,
    finishedAt: dispatched.finished_at || null,
    creditCost: dispatched.credit_cost ?? null
  });

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
  let backend = pty ? 'conpty' : 'pipe';
  let ptyStartError = null;
  let ptyProcess = null;

  if (pty) {
    try {
      ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: buildSessionEnv({
          COLORTERM: 'truecolor',
          TERM: 'xterm-256color'
        }, {
          cliProviderId: cliProvider?.id || requestedCliProviderId,
          cwd,
          id,
          title
        })
      });
    } catch (error) {
      backend = 'pipe';
      ptyStartError = error;
    }
  }

  const meta = {
    id,
    title,
    cwd,
    shell,
    backend,
    initialCommand,
    createdAt: Date.now(),
    transcriptBytes: 0,
    transcriptChunks: [],
    transcriptBufferedBytes: 0,
    transcriptTruncated: false,
    exited: false,
    exitCode: null,
    signal: null,
    ...cliMeta
  };

  if (ptyProcess) {
    const session = {
      ...meta,
      process: ptyProcess
    };

    ptyProcess.onData((data) => {
      appendTerminalTranscript(session, data);
      sendToRenderer(webContents, 'terminal:data', { id, data });
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
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
      publishAgentBridgeSessions();
      sendToRenderer(webContents, 'terminal:exit', {
        id,
        exitCode,
        signal: signal || null
      });
    });

    sessions.set(id, session);
    publishAgentBridgeSessions();
  } else {
    const proc = spawn(shell, args, {
      cwd,
      env: buildSessionEnv({}, {
        cliProviderId: cliProvider?.id || requestedCliProviderId,
        cwd,
        id,
        title
      }),
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
      publishAgentBridgeSessions();
      sendToRenderer(webContents, 'terminal:exit', {
        id,
        exitCode,
        signal: signal || null
      });
    });

    sessions.set(id, session);
    publishAgentBridgeSessions();

    if (ptyStartError) {
      const data = `\r\n[cli-in-one] node-pty failed to start ${shell}: ${ptyStartError.message}\r\n[cli-in-one] fell back to pipe mode.\r\n`;
      appendTerminalTranscript(session, data);
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data
      });
    }
  }

  if (initialCommand) {
    setTimeout(() => {
      const session = sessions.get(id);
      if (session) {
        writeToSessionProcess(session, `${normalizeTerminalCommandInput(initialCommand)}\r`);
      }
    }, process.platform === 'win32' ? 450 : 300);
  }

  const { transcriptChunks, transcriptBufferedBytes, transcriptTruncated, ...publicMeta } = meta;
  return publicMeta;
}

function updateTerminalSessionMeta(id, patch = {}) {
  const session = sessions.get(id);
  if (!session || !patch || typeof patch !== 'object') {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
    const title = asString(patch.title).trim();
    if (title) {
      session.title = title;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'codexModel')) {
    session.codexModel = asString(patch.codexModel).trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'codexProviderName')) {
    session.codexProviderName = asString(patch.codexProviderName).trim();
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'cliProviderId')) {
    const cliProvider = getCliProviderById(asString(patch.cliProviderId).trim());
    if (cliProvider) {
      session.cliProviderId = cliProvider.id;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'initialCommand')) {
    session.initialCommand = asString(patch.initialCommand).trim();
  }

  publishAgentBridgeSessions();

  return {
    id: session.id,
    cliProviderId: session.cliProviderId || '',
    initialCommand: session.initialCommand || '',
    title: session.title,
    codexModel: session.codexModel || '',
    codexProviderName: session.codexProviderName || ''
  };
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
  publishAgentBridgeSessions();
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

function stripJsonBom(content) {
  return typeof content === 'string' && content.charCodeAt(0) === 0xFEFF
    ? content.slice(1)
    : content;
}

function createJsonParseError(message) {
  const error = new Error(message);
  error.isJsonParseError = true;
  return error;
}

function parseJsonObjectText(content, fileLabel = 'auth.json', { allowJson5 = false } = {}) {
  const parse = allowJson5 ? JSON5.parse : JSON.parse;
  const syntaxLabel = allowJson5 ? 'JSON / JSONC / JSON5' : 'JSON';

  try {
    const parsed = parse(stripJsonBom(content));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw createJsonParseError(`${fileLabel} 根节点必须是 JSON 对象。`);
    }
    return parsed;
  } catch (error) {
    if (error?.isJsonParseError) {
      throw error;
    }

    throw createJsonParseError(`${fileLabel} ${syntaxLabel} 格式错误：${error.message}`);
  }
}

function validateJsonText(content, fileLabel = 'auth.json', options = {}) {
  if (typeof content !== 'string') {
    throw new Error(`${fileLabel} 内容必须是文本。`);
  }

  if (!content.trim()) {
    throw new Error(`${fileLabel} 不能为空；如果要清空配置，请写 {}。`);
  }

  parseJsonObjectText(content, fileLabel, options);
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

  const parsed = JSON.parse(stripJsonBom(content));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('auth.json 根节点必须是 JSON 对象。');
  }
  return parsed;
}

function parseClaudeSettings(content) {
  if (!content || !content.trim()) {
    return {};
  }

  return parseJsonObjectText(content, 'settings.json', { allowJson5: true });
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
  validateJsonText(nextContent, 'settings.json', { allowJson5: true });
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

function normalizeQuickPromptAttachmentKind(value) {
  const kind = asString(value).trim().toLowerCase();
  return kind === 'image' ? 'image' : 'file';
}

function normalizeQuickPromptAttachment(record, index = 0) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const pathValue = asString(record.path).trim();
  const content = normalizeAgentContextText(
    record.content,
    QUICK_PROMPT_ATTACHMENT_TEXT_MAX_CHARS
  );
  const title = asString(record.title || record.name).trim()
    || (pathValue ? path.basename(pathValue) : '');

  if (!pathValue && !content.text) {
    return null;
  }

  return {
    id: asString(record.id).trim() || `attachment-${Date.now()}-${index}-${crypto.randomBytes(3).toString('hex')}`,
    kind: normalizeQuickPromptAttachmentKind(record.kind),
    title,
    path: pathValue,
    content: content.text,
    size: Number.isFinite(record.size) && record.size >= 0 ? record.size : null,
    mimeType: asString(record.mimeType).trim(),
    truncated: Boolean(record.truncated || content.truncated)
  };
}

function normalizeQuickPromptAttachments(value) {
  const attachments = [];
  const seen = new Set();

  for (const [index, record] of (Array.isArray(value) ? value : []).entries()) {
    const attachment = normalizeQuickPromptAttachment(record, index);
    if (!attachment) {
      continue;
    }

    const key = [
      attachment.kind,
      attachment.path ? `path:${attachment.path.toLowerCase()}` : '',
      attachment.content ? `content:${attachment.content.slice(0, 200)}` : '',
      attachment.title
    ].filter(Boolean).join(':');
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    attachments.push(attachment);
    if (attachments.length >= QUICK_PROMPT_ATTACHMENT_MAX_ITEMS) {
      break;
    }
  }

  return attachments;
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
    attachments: normalizeQuickPromptAttachments(record?.attachments),
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
    attachments: normalizeQuickPromptAttachments(payload.attachments ?? existing?.attachments),
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

function createCommandPresetId() {
  return crypto.randomUUID();
}

function normalizeCommandPresetCommand(value) {
  return asString(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, COMMAND_PRESET_MAX_COMMAND_LENGTH);
}

function deriveCommandPresetName(command, fallback = 'CMD 命令') {
  const firstLine = normalizeCommandPresetCommand(command)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return (firstLine || fallback).replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeCommandPresetName(value, command, fallback) {
  const trimmed = asString(value).trim();
  return (trimmed || deriveCommandPresetName(command, fallback)).slice(0, 120);
}

function normalizeCommandPresetRecord(record, index) {
  const command = normalizeCommandPresetCommand(record?.command ?? record?.initialCommand);
  if (!command) {
    return null;
  }

  const id = asString(record?.id).trim() || createCommandPresetId();
  const now = Date.now();
  const createdAt = Number.isFinite(record?.createdAt) ? record.createdAt : now + index;
  const updatedAt = Number.isFinite(record?.updatedAt) ? record.updatedAt : createdAt;

  return {
    id,
    name: normalizeCommandPresetName(record?.name ?? record?.title, command, `CMD 命令 ${index + 1}`),
    command,
    createdAt,
    updatedAt
  };
}

function normalizeCommandPresetStore(raw = {}) {
  const sourcePresets = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.presets) ? raw.presets : [];
  const presets = [];
  const seenIds = new Set();

  sourcePresets.forEach((record, index) => {
    try {
      const normalized = normalizeCommandPresetRecord(record, index);
      if (!normalized) {
        return;
      }

      if (seenIds.has(normalized.id)) {
        normalized.id = createCommandPresetId();
      }
      seenIds.add(normalized.id);
      presets.push(normalized);
    } catch {
      // Ignore invalid saved commands instead of blocking new terminal creation.
    }
  });

  const activeId = presets.some((preset) => preset.id === raw?.activeId)
    ? raw.activeId
    : '';

  return {
    version: 1,
    activeId,
    presets: presets.slice(0, COMMAND_PRESETS_MAX_ITEMS)
  };
}

function toCommandPresetStorePayload(store) {
  return {
    path: getCommandPresetsPath(),
    version: 1,
    activeId: store.activeId || '',
    presets: store.presets
  };
}

async function readCommandPresetStore() {
  const storePath = getCommandPresetsPath();

  try {
    const content = await fs.promises.readFile(storePath, 'utf8');
    return normalizeCommandPresetStore(JSON.parse(content));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeCommandPresetStore({});
    }

    if (error instanceof SyntaxError) {
      throw new Error(`CMD 命令预置文件不是有效 JSON：${error.message}`);
    }

    throw error;
  }
}

async function writeCommandPresetStore(store) {
  const normalized = normalizeCommandPresetStore(store);
  const storePath = getCommandPresetsPath();
  const tempPath = path.join(
    path.dirname(storePath),
    `${COMMAND_PRESETS_FILE_NAME}.${process.pid}.${Date.now()}.tmp`
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

async function listCommandPresets() {
  return toCommandPresetStorePayload(await readCommandPresetStore());
}

async function saveCommandPreset(payload = {}) {
  const store = await readCommandPresetStore();
  const command = normalizeCommandPresetCommand(payload.command ?? payload.initialCommand);
  if (!command) {
    throw new Error('CMD 命令不能为空。');
  }

  const requestedId = asString(payload.id).trim();
  const existingIndex = requestedId
    ? store.presets.findIndex((record) => record.id === requestedId)
    : -1;
  const existing = existingIndex >= 0 ? store.presets[existingIndex] : null;
  const record = {
    id: existing?.id || requestedId || createCommandPresetId(),
    name: normalizeCommandPresetName(payload.name ?? payload.title, command, existing?.name || 'CMD 命令'),
    command,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  const presets = [...store.presets];
  if (existingIndex >= 0) {
    presets[existingIndex] = record;
  } else {
    presets.unshift(record);
  }

  const nextStore = await writeCommandPresetStore({
    ...store,
    activeId: record.id,
    presets: presets.slice(0, COMMAND_PRESETS_MAX_ITEMS)
  });

  return {
    ...toCommandPresetStorePayload(nextStore),
    savedPreset: record
  };
}

async function selectCommandPreset(id) {
  const store = await readCommandPresetStore();
  const presetId = asString(id).trim();
  if (presetId && !store.presets.some((record) => record.id === presetId)) {
    throw new Error('选择的 CMD 命令预置不存在。');
  }

  const nextStore = await writeCommandPresetStore({
    ...store,
    activeId: presetId
  });

  return toCommandPresetStorePayload(nextStore);
}

async function deleteCommandPreset(id) {
  const store = await readCommandPresetStore();
  const presetId = asString(id).trim();
  const existing = store.presets.find((record) => record.id === presetId);

  if (!existing) {
    throw new Error('选择的 CMD 命令预置不存在。');
  }

  const nextStore = await writeCommandPresetStore({
    ...store,
    activeId: store.activeId === presetId ? '' : store.activeId,
    presets: store.presets.filter((record) => record.id !== presetId)
  });

  return {
    ...toCommandPresetStorePayload(nextStore),
    deletedPreset: existing
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
      validate: (content) => validateJsonText(content, 'settings.json', { allowJson5: true })
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
  await startAgentBridgeWatcher();

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

  ipcMain.handle('app:latest-release-status', (_event, version, options = {}) => {
    return readLatestReleaseStatus(version || app.getVersion(), options || {});
  });

  ipcMain.handle('app:system-stats', () => getSystemStats());

  ipcMain.handle('app:get-zoom-factor', (event) => {
    return getAppZoomPayload(event.sender);
  });

  ipcMain.handle('app:set-zoom-factor', (event, zoomFactor) => {
    return applyAppZoomFactor(zoomFactor, event.sender);
  });

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

  ipcMain.handle('workspace:open-path-vscode', (_event, targetPath) => {
    return openPathInVSCode(targetPath);
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

  ipcMain.handle('workspace:read-diff', (_event, options = {}) => {
    return readWorkspaceDiffSnapshot(options || {});
  });

  ipcMain.handle('workspace:read-skills', (_event, options = {}) => {
    return readWorkspaceSkillsSnapshot(options || {});
  });

  ipcMain.handle('agent-context:read-file', (_event, options = {}) => {
    return readWorkspaceFileContext(options || {});
  });

  ipcMain.handle('agent-context:fetch-url', (_event, options = {}) => {
    return fetchAgentContextUrl(options || {});
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

  ipcMain.handle('command-dock:save-image-path', (_event, filePath) => {
    return saveCommandDockImagePathAsset(filePath);
  });

  ipcMain.handle('quick-prompts:choose-attachments', (_event, options = {}) => {
    return chooseQuickPromptAttachments(options || {});
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

  ipcMain.handle('command-presets:list', () => {
    return listCommandPresets();
  });

  ipcMain.handle('command-presets:save', (_event, payload) => {
    return saveCommandPreset(payload || {});
  });

  ipcMain.handle('command-presets:select', (_event, id) => {
    return selectCommandPreset(id);
  });

  ipcMain.handle('command-presets:delete', (_event, id) => {
    return deleteCommandPreset(id);
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

  ipcMain.handle('image-api:list-history', () => {
    return listImageApiHistory();
  });

  ipcMain.handle('image-api:write-history', (_event, payload) => {
    return writeImageApiHistory(payload || {});
  });

  ipcMain.handle('image-api:clear-history', () => {
    return clearImageApiHistory();
  });

  ipcMain.handle('image-api:generate', (event, payload) => {
    return generateImageWithApi(payload || {}, { webContents: event.sender });
  });

  ipcMain.handle('terminal:create', (event, options) => {
    return createTerminalSession(event.sender, options);
  });

  ipcMain.handle('terminal:update-meta', (_event, id, patch) => {
    return updateTerminalSessionMeta(id, patch || {});
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

app.on('before-quit', () => {
  try {
    agentBridgeWatcher?.close();
  } catch {}
  killAllSessions();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
