import React, { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  Archive,
  BrainCircuit,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Cpu,
  ExternalLink,
  FileDiff,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GripVertical,
  Grid2X2,
  ImagePlus,
  Languages,
  ListTodo,
  LayoutGrid,
  Maximize2,
  MessageSquarePlus,
  MemoryStick,
  Minus,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PencilLine,
  Pin,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  SquareTerminal,
  Sun,
  Tags,
  Trash2,
  X,
  ZoomIn
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DiffReviewModal } from '@/components/DiffReviewModal';
import { FloatingCommandDock } from '@/components/FloatingCommandDock';
import { ImageGenerationCanvasPage } from '@/components/ImageGenerationCanvasPage';
import { PromptManagementDialog } from '@/components/PromptManagementDialog';
import { SessionReviewModal } from '@/components/SessionReviewModal';
import { WorkspaceTreeSidebar } from '@/components/WorkspaceTreeSidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarSection } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  formatCommandDockTaskTitle,
  parseCommandDockDispatchTasks
} from '@/lib/commandDockTasks';
import {
  appendSessionReviewOutput,
  buildSessionReviewSummaryText,
  getSessionReviewPreviewText,
  getSessionReviewStatusCounts
} from '@/lib/sessionReview';
import { getWorkspaceTreeInsertPath } from '@/lib/workspaceTree';
import cliProviderRegistry from '../shared/cli-providers.json';
import claudeIconSvg from '../../static/claude.svg?raw';
import codexIconSvg from '../../static/codex-color.svg?raw';
import copilotIconSvg from '../../static/copilot.svg?raw';
import cursorIconSvg from '../../static/cursor.svg?raw';
import droidIconSvg from '../../static/droid.svg?raw';

const bridge = window.cliBridge;
const settingsKey = 'cli-in-one.settings.v3';
const workspaceKey = 'cli-in-one.workspace.v1';
const agentsKey = 'cli-in-one.agents.v1';
const autopilotKey = 'cli-in-one.autopilot.v1';
const appLogoUrl = `${import.meta.env.BASE_URL}logo.webp`;
const imageApiHelpUrl = 'https://github.com/432539/gpt2api';
const releasePageUrl = 'https://github.com/whd3131/cli-in-one/releases';
const cliProviderIconMarkup = {
  'claude-code': claudeIconSvg,
  codex: codexIconSvg,
  copilot: copilotIconSvg,
  'cursor-agent': cursorIconSvg,
  droid: droidIconSvg
};
const canvasModes = new Set(['shared', 'project']);
const sharedCanvasKey = '__shared__';
const noProjectCanvasKey = '__no_project__';
const historyProjectId = '__history__';
const idleCommandLineGroupKind = 'idle-command-line';
const endpointWidth = 300;
const endpointHeight = 44;
const idleCommandLineGroupWidth = 380;
const canvasFrameMinWidth = 220;
const canvasFrameMinHeight = 140;
const canvasFrameDefaultWidth = 360;
const canvasFrameDefaultHeight = 200;
const canvasContextMenuWidth = 244;
const canvasContextMenuHeight = 440;
const canvasTodoMinWidth = 280;
const canvasTodoMinHeight = 240;
const canvasTodoDefaultWidth = 340;
const canvasTodoDefaultHeight = 420;
const agentPlanTodoDefaultWidth = 380;
const agentPlanTodoDefaultHeight = 500;
const agentPlanTodoGap = 22;
const canvasTodoPlanTextMaxLength = 6000;
const canvasTodoTaskTextMaxLength = 260;
const canvasTodoOutputCarryMaxChars = 1200;
const canvasTodoPlanStatusOrder = {
  todo: 0,
  in_progress: 1,
  blocked: 1,
  done: 2
};
const canvasConnectionTones = [
  { color: '#7c3aed', glow: 'rgba(124, 58, 237, 0.2)' },
  { color: '#0d9488', glow: 'rgba(13, 148, 136, 0.2)' },
  { color: '#2563eb', glow: 'rgba(37, 99, 235, 0.2)' },
  { color: '#e11d48', glow: 'rgba(225, 29, 72, 0.2)' },
  { color: '#ea580c', glow: 'rgba(234, 88, 12, 0.2)' }
];
const connectionPortDragThreshold = 6;
const terminalContextMenuWidth = 280;
const terminalContextMenuEstimatedHeight = 360;
const zoomPresetScales = [0.5, 1, 1.5, 2];
const appZoomDefaultFactor = 1;
const appZoomMinFactor = 0.75;
const appZoomMaxFactor = 1.75;
const appZoomStep = 0.05;
const appZoomPresetFactors = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75];
const systemStatsRefreshMs = 2000;
const terminalScrollbackLines = 1500;
const terminalPanelOpenDurationMs = 250;
const memoryUsageWarningThreshold = 0.85;
const memoryUsageCriticalThreshold = 0.95;
const panelIdleThresholdMs = 12000;
const panelActivityFlushMs = 120;
const agentTaskSubmitDelayMs = 1800;
const commandDockTaskSubmitDelayMs = 1800;
const commandDockDispatchSparkleMs = 5200;
const commandDockHistoryLimit = 10;
const commandDockContextMaxItems = 24;
const commandDockContextTextMaxChars = 80000;
const commandDockTerminalContextMaxChars = 24000;
const autopilotSchedulerIntervalMs = 30000;
const autopilotDefaultTime = '09:00';
const autopilotDefaultCronExpression = '0 9 * * 1-5';
const autopilotScheduleTypes = new Set(['daily', 'weekday', 'weekly', 'cron']);
const autopilotWeekdayIds = ['1', '2', '3', '4', '5', '6', '0'];
const workspaceSkillsInitialLoadDelayMs = 180;
const commandDockShortcutOptions = [
  { id: 'enter', label: 'Enter', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
  { id: 'ctrlEnter', label: 'Ctrl+Enter', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
  { id: 'altEnter', label: 'Alt+Enter', ctrlKey: false, shiftKey: false, altKey: true, metaKey: false },
  { id: 'ctrlShiftEnter', label: 'Ctrl+Shift+Enter', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false }
];
const commandDockShortcutOptionIds = new Set(commandDockShortcutOptions.map((option) => option.id));
const commandDockDefaultShortcuts = {
  sendShortcut: 'enter',
  dispatchShortcut: 'ctrlEnter'
};
const sessionHeaderItemOptions = [
  { id: 'tag', labelKey: 'sessionHeaderShowTag' },
  { id: 'model', labelKey: 'sessionHeaderShowModel' },
  { id: 'context', labelKey: 'sessionHeaderShowContext' },
  { id: 'status', labelKey: 'sessionHeaderShowStatus' },
  { id: 'runtime', labelKey: 'sessionHeaderShowRuntime' }
];
const sessionHeaderItemIds = new Set(sessionHeaderItemOptions.map((option) => option.id));
const sessionHeaderDefaultVisibility = {
  tag: true,
  model: true,
  context: true,
  status: true,
  runtime: true
};
const canvasArrangeDurationMs = 760;
const canvasArrangeMaxStaggerMs = 180;

function toSelectOptions(values, getLabel = (value) => value) {
  return (Array.isArray(values) ? values : []).map((value) => ({
    label: getLabel(value),
    value
  }));
}

function normalizeAppZoomFactor(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return appZoomDefaultFactor;
  }

  const clamped = clamp(parsed, appZoomMinFactor, appZoomMaxFactor);
  return Math.round(clamped * 100) / 100;
}

function formatAppZoomPercent(value) {
  return Math.round(normalizeAppZoomFactor(value) * 100);
}

function normalizeCommandDockDispatchMode(value) {
  return value === 'new' ? 'new' : 'reuse';
}

function normalizeSessionHeaderVisibility(value) {
  const source = value && typeof value === 'object' ? value : {};
  return sessionHeaderItemOptions.reduce((result, option) => {
    result[option.id] = Object.prototype.hasOwnProperty.call(source, option.id)
      ? Boolean(source[option.id])
      : sessionHeaderDefaultVisibility[option.id];
    return result;
  }, {});
}

function normalizeLoadedSessionHeaderVisibility(value) {
  const source = value && typeof value === 'object' ? value : null;
  const legacyCompactDefaults = source
    && sessionHeaderItemOptions.every((option) => Object.prototype.hasOwnProperty.call(source, option.id))
    && source.tag === true
    && source.model === false
    && source.context === false
    && source.status === true
    && source.runtime === false;

  return legacyCompactDefaults
    ? normalizeSessionHeaderVisibility()
    : normalizeSessionHeaderVisibility(value);
}

function updateSessionHeaderVisibilitySetting(current, itemId, visible) {
  const normalizedItemId = String(itemId || '').trim();
  const next = normalizeSessionHeaderVisibility(current);
  if (sessionHeaderItemIds.has(normalizedItemId)) {
    next[normalizedItemId] = Boolean(visible);
  }
  return next;
}

function normalizeCommandDockShortcut(value, fallback = commandDockDefaultShortcuts.sendShortcut) {
  const normalized = String(value || '').trim();
  return commandDockShortcutOptionIds.has(normalized) ? normalized : fallback;
}

function getCommandDockShortcutFallback(excludedShortcut, preferredShortcut) {
  const preferred = normalizeCommandDockShortcut(preferredShortcut, commandDockDefaultShortcuts.dispatchShortcut);
  if (preferred !== excludedShortcut) {
    return preferred;
  }

  return commandDockShortcutOptions.find((option) => option.id !== excludedShortcut)?.id
    || commandDockDefaultShortcuts.dispatchShortcut;
}

function normalizeCommandDockShortcutSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const sendShortcut = normalizeCommandDockShortcut(
    source.sendShortcut,
    commandDockDefaultShortcuts.sendShortcut
  );
  let dispatchShortcut = normalizeCommandDockShortcut(
    source.dispatchShortcut,
    commandDockDefaultShortcuts.dispatchShortcut
  );

  if (sendShortcut === dispatchShortcut) {
    dispatchShortcut = getCommandDockShortcutFallback(
      sendShortcut,
      commandDockDefaultShortcuts.dispatchShortcut
    );
  }

  return {
    sendShortcut,
    dispatchShortcut
  };
}

function updateCommandDockShortcutSetting(current, action, value) {
  const next = normalizeCommandDockShortcutSettings(current);
  const actionKey = action === 'dispatch' ? 'dispatchShortcut' : 'sendShortcut';
  const otherKey = actionKey === 'sendShortcut' ? 'dispatchShortcut' : 'sendShortcut';
  const previousActionShortcut = next[actionKey];
  const nextShortcut = normalizeCommandDockShortcut(value, previousActionShortcut);

  next[actionKey] = nextShortcut;
  if (next[otherKey] === nextShortcut) {
    next[otherKey] = previousActionShortcut !== nextShortcut
      ? previousActionShortcut
      : getCommandDockShortcutFallback(nextShortcut, commandDockDefaultShortcuts[otherKey]);
  }

  return normalizeCommandDockShortcutSettings(next);
}

function getCommandDockShortcutLabel(value) {
  const shortcut = normalizeCommandDockShortcut(value);
  return commandDockShortcutOptions.find((option) => option.id === shortcut)?.label || 'Enter';
}

function normalizeCommandDockHistory(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const history = [];
  for (const item of value) {
    const entry = String(item || '');
    if (!entry.trim() || history.includes(entry)) {
      continue;
    }

    history.push(entry);
    if (history.length >= commandDockHistoryLimit) {
      break;
    }
  }

  return history;
}

function addCommandDockHistoryEntry(history, value) {
  const entry = String(value || '');
  if (!entry.trim()) {
    return normalizeCommandDockHistory(history);
  }

  return [
    entry,
    ...normalizeCommandDockHistory(history).filter((item) => item !== entry)
  ].slice(0, commandDockHistoryLimit);
}

function normalizeCommandPresetCommandInput(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function deriveCommandPresetTitle(command, fallback = 'CMD command') {
  const firstLine = normalizeCommandPresetCommandInput(command)
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return (firstLine || fallback).replace(/\s+/g, ' ').slice(0, 120);
}

function createDefaultView() {
  return { x: 80, y: 80, scale: 1 };
}

const cliProviders = Array.isArray(cliProviderRegistry) ? cliProviderRegistry : [];
const sessionLauncherProviderOrder = ['codex', 'copilot', 'droid', 'claude-code', 'cursor-agent', 'shell'];
const cliProviderMap = new Map(
  cliProviders
    .filter((provider) => provider && typeof provider.id === 'string' && provider.id.trim())
    .map((provider) => [provider.id.trim(), provider])
);
const defaultCliProviderId = cliProviderMap.has('codex')
  ? 'codex'
  : (cliProviders[0]?.id || 'shell');
const shellCliProviderId = 'shell';

function getLocalizedCliValue(source, language, fallback = '') {
  if (source && typeof source === 'object') {
    return source[language] || source.zh || source.en || fallback;
  }

  return typeof source === 'string' ? source : fallback;
}

function getCliProviderById(id) {
  const normalizedId = String(id || '').trim();
  return normalizedId ? (cliProviderMap.get(normalizedId) || null) : null;
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

  return cliProviders.find((provider) => doesCommandMatchCliProvider(provider, command)) || null;
}

function resolveCliProvider(providerId, initialCommand) {
  return (
    getCliProviderById(providerId)
    || detectCliProviderByCommand(initialCommand)
    || getCliProviderById(defaultCliProviderId)
    || cliProviders[0]
    || null
  );
}

function getCliProviderDisplayName(provider, language) {
  return getLocalizedCliValue(provider?.displayName, language, provider?.id || 'CLI');
}

function getCliProviderBadgeLabel(provider, language) {
  return getLocalizedCliValue(
    provider?.badgeLabel,
    language,
    getCliProviderDisplayName(provider, language)
  );
}

function getCliProviderTitleBase(provider, language) {
  return getLocalizedCliValue(
    provider?.panelTitle,
    language,
    getCliProviderBadgeLabel(provider, language)
  );
}

function getCliProviderDescription(provider, language) {
  return getLocalizedCliValue(provider?.description, language, '');
}

function formatDispatchTargetList(targets, language) {
  const separator = language === 'zh' ? '、' : ', ';
  const names = [];
  const seen = new Set();

  for (const target of Array.isArray(targets) ? targets : []) {
    const id = String(target?.id || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    names.push(String(target?.title || id).trim() || id);
  }

  const visibleNames = names.slice(0, 5);
  const suffix = names.length > visibleNames.length ? ` +${names.length - visibleNames.length}` : '';
  return `${visibleNames.join(separator)}${suffix}`;
}

function CliProviderIcon({ className, provider, providerId }) {
  const resolvedProviderId = String(providerId || provider?.id || '').trim();

  if (resolvedProviderId === 'shell') {
    return <SquareTerminal className={className} aria-hidden="true" />;
  }

  const iconMarkup = cliProviderIconMarkup[resolvedProviderId];
  if (iconMarkup) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center [&>svg]:block [&>svg]:h-full [&>svg]:w-full',
          className
        )}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: iconMarkup }}
      />
    );
  }

  return <MessageSquarePlus className={className} aria-hidden="true" />;
}

function CliProviderBadge({ className, language, provider, variant = 'outline' }) {
  if (!provider) {
    return null;
  }

  return (
    <Badge variant={variant} className={cn('inline-flex items-center gap-1.5', className)}>
      <CliProviderIcon provider={provider} className="h-3.5 w-3.5" />
      <span>{getCliProviderBadgeLabel(provider, language)}</span>
    </Badge>
  );
}

function getCliLaunchCommand(provider, targetType = 'project') {
  const launchCommand = provider?.launchCommand;

  if (typeof launchCommand === 'string') {
    return launchCommand;
  }

  if (!launchCommand || typeof launchCommand !== 'object') {
    return '';
  }

  return String(
    launchCommand[targetType]
    ?? launchCommand.default
    ?? ''
  );
}

function cliProviderSupportsTarget(provider, targetType) {
  const targets = Array.isArray(provider?.targets) ? provider.targets : [];
  return targets.length === 0 ? true : targets.includes(targetType);
}

function getSessionLauncherProviderRank(provider) {
  const index = sessionLauncherProviderOrder.indexOf(String(provider?.id || ''));
  return index === -1 ? sessionLauncherProviderOrder.length : index;
}

function getSelectableCliProviders(targetTypes = ['project', 'directory']) {
  const requestedTargetTypes = Array.isArray(targetTypes) ? targetTypes : [targetTypes];
  return cliProviders
    .filter((provider) => requestedTargetTypes.some((targetType) => (
      cliProviderSupportsTarget(provider, targetType)
    )))
    .sort((left, right) => (
      getSessionLauncherProviderRank(left) - getSessionLauncherProviderRank(right)
    ));
}

function getInitialCliProviderId(providerId, providers) {
  const normalizedProviderId = String(providerId || '').trim();

  if (providers.some((provider) => provider.id === normalizedProviderId)) {
    return normalizedProviderId;
  }

  if (providers.some((provider) => provider.id === defaultCliProviderId)) {
    return defaultCliProviderId;
  }

  return providers[0]?.id || defaultCliProviderId;
}

function resolveSelectableCliProvider(providerId, providers) {
  const normalizedProviderId = String(providerId || '').trim();
  return (
    providers.find((provider) => provider.id === normalizedProviderId)
    || providers.find((provider) => provider.id === defaultCliProviderId)
    || providers[0]
    || resolveCliProvider(providerId)
  );
}

function getPanelCliProvider(panel) {
  return resolveCliProvider(panel?.cliProviderId, panel?.initialCommand);
}

function isAgentCliProvider(provider) {
  const providerId = String(provider?.id || '').trim();
  return Boolean(providerId && providerId !== shellCliProviderId);
}

function collectSubmittedTerminalCommands(buffer, data) {
  const commands = [];
  let nextBuffer = String(buffer || '').slice(-500);
  let skippingEscape = false;

  for (const character of String(data || '')) {
    if (skippingEscape) {
      if (/[A-Za-z~]/.test(character)) {
        skippingEscape = false;
      }
      continue;
    }

    if (character === '\x1b') {
      skippingEscape = true;
      continue;
    }

    if (character === '\r' || character === '\n') {
      const command = nextBuffer.trim();
      if (command) {
        commands.push(command);
      }
      nextBuffer = '';
      continue;
    }

    if (character === '\x03' || character === '\x15' || character === '\x18') {
      nextBuffer = '';
      continue;
    }

    if (character === '\b' || character === '\x7f') {
      nextBuffer = nextBuffer.slice(0, -1);
      continue;
    }

    if (character >= ' ' && character !== '\x7f') {
      nextBuffer = `${nextBuffer}${character}`.slice(-500);
    }
  }

  return {
    buffer: nextBuffer,
    commands
  };
}

const terminalThemes = {
  dark: {
    background: '#090a0c',
    foreground: '#e8edf2',
    cursor: '#f3bc45',
    cursorAccent: '#090a0c',
    selectionBackground: '#335f7c',
    black: '#15171b',
    red: '#f06d78',
    green: '#46d18c',
    yellow: '#f3bc45',
    blue: '#70b7ff',
    magenta: '#ce8cff',
    cyan: '#5dd8cf',
    white: '#eceff3',
    brightBlack: '#6e7681',
    brightRed: '#ff8992',
    brightGreen: '#71e6a9',
    brightYellow: '#ffd36b',
    brightBlue: '#9acbff',
    brightMagenta: '#ddb0ff',
    brightCyan: '#8ce8e1',
    brightWhite: '#ffffff'
  },
  light: {
    background: '#fbfdff',
    foreground: '#172033',
    cursor: '#0f766e',
    cursorAccent: '#fbfdff',
    selectionBackground: '#bfdbfe',
    black: '#1f2937',
    red: '#dc2626',
    green: '#15803d',
    yellow: '#a16207',
    blue: '#2563eb',
    magenta: '#7c3aed',
    cyan: '#0891b2',
    white: '#e5e7eb',
    brightBlack: '#64748b',
    brightRed: '#ef4444',
    brightGreen: '#16a34a',
    brightYellow: '#ca8a04',
    brightBlue: '#3b82f6',
    brightMagenta: '#9333ea',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff'
  }
};

const codexFileMeta = {
  auth: {
    owner: 'codex',
    kind: 'auth',
    title: 'Codex auth.json',
    valid: 'JSON 有效',
    invalid: 'JSON 格式错误',
    missing: '文件不存在，保存有效 JSON 后创建',
    saved: 'Codex auth.json 已保存'
  },
  config: {
    owner: 'codex',
    kind: 'config',
    title: 'Codex config.toml',
    valid: 'TOML 有效',
    invalid: 'TOML 格式错误',
    missing: '文件不存在，保存后创建',
    saved: 'Codex config.toml 已保存'
  },
  claudeSettings: {
    owner: 'claude',
    kind: 'settings',
    title: 'Claude settings.json',
    valid: 'JSON 有效',
    invalid: 'JSON 格式错误',
    missing: '文件不存在，保存有效 JSON 后创建',
    saved: 'Claude settings.json 已保存'
  }
};

const codexProfileDefaults = {
  apiKey: '',
  approvalPolicy: '',
  baseUrl: '',
  contextWindow1m: false,
  disableResponseStorage: true,
  fastMode: true,
  model: '',
  modelReasoningEffort: 'high',
  providerKey: 'custom',
  providerName: 'custom',
  requiresOpenaiAuth: true,
  sandboxMode: '',
  wireApi: 'responses'
};

const claudeProfileDefaults = {
  apiKey: '',
  baseUrl: '',
  effortLevel: '',
  model: '',
  permissionMode: ''
};

const imageApiConfigDefaults = {
  apiKey: '',
  apiKeySet: false,
  baseUrl: '',
  clearApiKey: false,
  configured: false,
  model: 'gpt-image-2',
  n: 1,
  path: '',
  size: '1024x1024',
  upscale: '',
  requestEditorEnabled: false
};

const approvalPolicyOptions = ['', 'untrusted', 'on-request', 'never'];
const sandboxModeOptions = ['', 'read-only', 'workspace-write', 'danger-full-access'];
const reasoningEffortOptions = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const wireApiOptions = ['responses', 'chat'];
const quickModelOptions = ['gpt-5.5', 'gpt-5.4'];
const claudeEffortLevelOptions = ['', 'low', 'medium', 'high', 'xhigh'];
const claudePermissionModeOptions = ['', 'default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'];
const quickClaudeModelOptions = ['sonnet', 'opus', 'haiku', 'opusplan', 'sonnet[1m]', 'opus[1m]'];
const workspaceSkillPreviewCount = 6;
const commandDockSkillMentionMaxItems = 18;
const commandDockSkillMentionMenuWidth = 320;
const commandDockSkillMentionMenuMaxHeight = 232;
const sessionReviewFlushMs = 180;
const workspaceSkillSources = [
  { id: 'cli-in-one', directoryName: '.cli-in-one/skills', label: 'Project' },
  { id: 'cursor', directoryName: '.cursor', label: 'Cursor' },
  { id: 'claude', directoryName: '.claude', label: 'Claude' },
  { id: 'agent', directoryName: '.agent', label: 'Agent' },
  { id: 'github', directoryName: '.github', label: 'GitHub' }
];
const gridSessionCountMin = 1;
const gridSessionCountMax = 24;
const sessionTagMaxLength = 32;
const sessionTagNoneValue = '__session_tag_none__';
const sessionTagCustomValue = '__session_tag_custom__';
const sessionTagPresets = [
  { id: 'important', labelKey: 'sessionTagImportant', aliases: ['important', '重要'] },
  { id: 'normal', labelKey: 'sessionTagNormal', aliases: ['normal', '一般'] },
  { id: 'test', labelKey: 'sessionTagTest', aliases: ['test', 'testing', '测试'] },
  { id: 'review', labelKey: 'sessionTagReview', aliases: ['review', '审查'] },
  { id: 'investigation', labelKey: 'sessionTagInvestigation', aliases: ['investigation', 'investigate', '调查'] },
  { id: 'documentation', labelKey: 'sessionTagDocumentation', aliases: ['documentation', 'docs', 'doc', '编写文档'] }
];
const sessionTagPresetIds = new Set(sessionTagPresets.map((tag) => tag.id));

const messages = {
  zh: {
    appSubtitle: '本地项目与会话',
    expandSidebar: '展开侧边栏',
    collapseSidebar: '收起侧边栏',
    addProject: '新增项目',
    deleteProject: '删除项目',
    pinProject: '置顶项目',
    unpinProject: '取消置顶',
    dragProject: '拖拽排序',
    completedProjectSessionsBadge: '该项目有 {count} 个已完成会话',
    codexConfig: 'Codex 配置',
    projects: '项目',
    projectEmpty: '选择一个目录后会在这里管理项目。',
    canvasMode: '画布模式',
    canvasModeShared: '共享',
    canvasModeProject: '按项目',
    canvasModeProjectTooltip: '每个项目保留独立画布，只显示当前项目关联的会话和说明框。',
    canvasModeSharedTooltip: '所有项目共用同一个画布，方便跨项目同时查看和整理会话。',
    sharedWorkspace: '共享工作区',
    freeSessionWorkspace: '自由会话',
    settings: '设置',
    closeAll: '全部关闭',
    closeAllConfirm: '确认关闭全部会话？所有当前运行状态会被中断。',
    workspace: '工作区',
    noProject: '不绑定项目',
    addSession: '新增会话',
    sessionList: '当前会话',
    sessionListEmpty: '当前视图还没有会话，点击上方新增会话。',
    canvasSessionStatusQueue: '会话状态',
    canvasSessionStatusRefresh: '刷新会话状态',
    canvasSessionStatusUpdatedAt: '更新 {time}',
    canvasSessionStatusFocus: '定位会话',
    canvasSessionStatusEndpoint: '端点',
    agents: 'Agents',
    agentsDialogTitle: 'Agents',
    agentsDialogDescription: '保存可复用的 agent instructions，并把任务分配给指定 CLI 自动启动。',
    agentsEmpty: '还没有 Agent。先新增一个并填写 instructions。',
    newAgent: '新增 Agent',
    saveAgent: '保存 Agent',
    deleteAgent: '删除 Agent',
    agentName: 'Agent 名称',
    agentNamePlaceholder: '例如：代码审查、测试修复、文档整理',
    agentInstructions: 'Agent instructions',
    agentInstructionsPlaceholder: '写下这个 Agent 每次执行任务时都要遵循的角色、约束和工作方式。',
    agentSkills: '关联 Skills',
    agentSkillsHint: '启动 Agent 时会把已选 skill 的目录路径注入任务提示词。',
    agentSkillsSelectedCount: '已选 {count}',
    agentSkillsEmpty: '当前工作区没有可关联的 skill。',
    agentSkillMissing: '未在当前扫描结果中',
    agentAvatar: '头像',
    uploadAgentAvatar: '上传头像',
    removeAgentAvatar: '移除头像',
    agentAvatarHint: '图片会保存到程序目录的 .cli-in-one/agent-avatars，保存 Agent 后生效。',
    agentTask: '任务描述',
    agentTaskPlaceholder: '输入这次要分配给 Agent 的具体任务。',
    agentRun: '分配并启动',
    agentRequired: '请先选择或新增一个 Agent。',
    agentNameRequired: 'Agent 名称不能为空。',
    agentTaskRequired: '任务描述不能为空。',
    agentSaved: 'Agent 已保存：{name}',
    agentDeleted: 'Agent 已删除：{name}',
    agentStarted: '已启动 Agent：{name}',
    agentAvatarSaved: '头像已上传，保存 Agent 后生效。',
    agentAvatarSaveFailed: '头像上传失败：{message}',
    agentAvatarInvalid: '请选择图片文件。',
    agentDeleteConfirm: '确认删除 Agent“{name}”？',
    agentUtilityBarTitle: 'Agent 工具栏',
    agentUtilityQuickTarget: '设为目标',
    agentUtilityQuickTargetTitle: '设为快捷发送目标',
    agentUtilityAttachImage: '图片',
    agentUtilityAttachImageTitle: '添加图片上下文到快捷发送',
    agentUtilityFiles: '文件',
    agentUtilityFilesTitle: '打开文件树并加入文件上下文',
    agentUtilityDiff: 'Diff',
    agentUtilityDiffTitle: '插入当前 Git diff',
    agentUtilityDiffLoading: '读取中',
    agentUtilityReview: '审阅',
    agentUtilityReviewTitle: '打开 Diff/Review 面板并定位该会话',
    agentUtilityTargetReady: '快捷发送目标已切换到 {name}',
    agentUtilityDiffContextHeader: '当前 Git diff（{path}）',
    agentUtilityDiffEmpty: '当前工作区没有 Git diff。',
    agentUtilityDiffInserted: '已插入 Git diff 上下文。',
    agentUtilityDiffFailed: '读取 Git diff 失败：{message}',
    agentUtilityPanelMissing: '未找到这个 Agent 会话。',
    autopilot: 'Autopilot',
    autopilotDialogTitle: 'Autopilot',
    autopilotDialogDescription: '配置启动后自动运行的 runbook，分配给已有 Agent，并按计划触发。',
    autopilotEmpty: '还没有 Autopilot。新增一个 runbook 并选择 Agent。',
    newAutopilot: '新增 Autopilot',
    saveAutopilot: '保存 Autopilot',
    deleteAutopilot: '删除 Autopilot',
    autopilotName: '名称',
    autopilotNamePlaceholder: '例如：每日巡检、工作日构建检查',
    autopilotAgent: '分配 Agent',
    autopilotRunbook: 'Runbook',
    autopilotRunbookPlaceholder: '写下自动执行时要交给 Agent 的完整 runbook。',
    autopilotEnabled: '启用计划运行',
    autopilotSchedule: 'Schedule',
    autopilotScheduleDaily: 'Daily',
    autopilotScheduleWeekday: 'Weekday',
    autopilotScheduleWeekly: 'Weekly',
    autopilotScheduleCron: 'Custom cron',
    autopilotTime: '时间',
    autopilotWeekday: '星期',
    autopilotCron: 'Cron',
    autopilotCronPlaceholder: '例如：0 9 * * 1-5',
    autopilotLastRun: '上次运行',
    autopilotNextRun: '下次运行',
    autopilotNeverRun: '从未运行',
    autopilotNotScheduled: '未排程',
    autopilotRunNow: '立即运行',
    autopilotRequired: '请先选择或新增一个 Autopilot。',
    autopilotAgentRequired: '请选择要分配的 Agent。',
    autopilotRunbookRequired: 'Runbook 不能为空。',
    autopilotCronInvalid: 'Cron 表达式必须是 5 段，并使用有效的分钟、小时、日期、月份和星期字段。',
    autopilotSaved: 'Autopilot 已保存：{name}',
    autopilotDeleted: 'Autopilot 已删除：{name}',
    autopilotStarted: 'Autopilot 已启动：{name}',
    autopilotMissingAgent: 'Autopilot「{name}」找不到分配的 Agent。',
    autopilotDeleteConfirm: '确认删除 Autopilot“{name}”？',
    weekdayMonday: '周一',
    weekdayTuesday: '周二',
    weekdayWednesday: '周三',
    weekdayThursday: '周四',
    weekdayFriday: '周五',
    weekdaySaturday: '周六',
    weekdaySunday: '周日',
    addCommandLine: '新增 CMD',
    addProjectDialogTitle: '新增项目',
    addProjectDialogDescription: '先配置项目目录和名称，确认后再加入侧边栏。',
    addProjectConfirm: '加入项目',
    addProjectPath: '项目目录',
    addProjectName: '项目名称',
    addProjectNamePlaceholder: '默认使用目录名',
    addCommandDialogTitle: '新增 CMD',
    addCommandDialogDescription: '先配置启动目录，确认后再创建 CMD 会话。',
    addCommandConfirm: '创建 CMD',
    addCommandDirectoryHint: '会话会在这个目录启动，并加入当前工作区。',
    commandPreset: '命令预置',
    commandPresetNone: '不使用预置',
    commandPresetCommand: '启动命令',
    commandPresetPlaceholder: '例如：pnpm dev:console',
    commandPresetHint: '留空只启动空 CMD；填写后创建 CMD 时会自动输入并执行。',
    commandPresetDefaultBadge: '默认',
    commandPresetSave: '保存预置',
    commandPresetSetDefault: '设为默认',
    commandPresetDelete: '删除预置',
    commandPresetNamePrompt: '输入命令预置名称',
    commandPresetNameRequired: '命令预置名称不能为空。',
    commandPresetCommandRequired: '请先输入启动命令。',
    commandPresetSaved: '命令预置已保存：{name}',
    commandPresetDeleted: '命令预置已删除：{name}',
    commandPresetSelected: '默认命令预置已切换：{name}',
    commandPresetDeleteConfirm: '确认删除命令预置“{name}”？',
    commandPresetLoadFailed: '读取命令预置失败：{message}',
    commandPresetSaveFailed: '保存命令预置失败：{message}',
    commandPresetDeleteFailed: '删除命令预置失败：{message}',
    commandPresetSelectFailed: '切换默认命令预置失败：{message}',
    dialogPathRequired: '请先选择目录。',
    addSessionGrid: '批量会话',
    quickGrid2x2: '2x2',
    gridSessionDialogTitle: '批量新增会话',
    gridSessionDialogDescription: '输入要创建的会话数量，系统会自动按网格排布到当前工作区。',
    gridSessionCount: '会话数量',
    gridSessionCountHint: '支持 1 到 {max} 个，会自动按接近方阵排布。',
    gridSessionCreate: '创建会话',
    gridSessionInvalid: '请输入 1 到 {max} 之间的整数。',
    newSessionSource: '选择会话目录',
    newSessionSourceDescription: '先选择要启动的 CLI，再选择项目或当前目录。',
    cliProvider: 'CLI',
    cliTarget: '启动目标',
    launchCommand: '启动命令',
    freeWindow: '自由窗口',
    defaultDirectory: '默认目录',
    directory: '目录',
    chooseDirectory: '选择目录',
    workspaceTree: '文件树',
    workspaceTreeOpen: '展开文件树',
    workspaceTreeClose: '收起文件树',
    sessionReview: '审阅台',
    sessionReviewOpen: '打开审阅台',
    sessionReviewClose: '关闭审阅台',
    zoomOut: '缩小',
    zoomIn: '放大',
    zoomLevel: '缩放比例',
    zoomPreset: '缩放到 {percent}%',
    resetView: '重置视图',
    arrange: '整理',
    cpuUsage: 'CPU',
    memoryUsage: '内存',
    systemStatsUnavailable: '系统状态不可用',
    topbarRunningSessions: '跨项目进行中',
    topbarSessionStatsTitle: '跨项目会话：{total} 个会话，{running} 进行中，{idle} 闲置，{completed} 已完成，{error} 异常',
    runningModePipe: '管道模式',
    runtimeStarting: '启动中',
    session: '会话',
    sessionFallbackTitle: '会话',
    commandLine: 'CMD',
    commandLineFallbackTitle: 'CMD',
    startEmpty: '新增会话开始',
    startHint: '右键空白画布可快速新增 Codex、Claude、CMD 等会话。',
    movePanel: '移动会话',
    minimizeSession: '缩成端点',
    expandSession: '展开会话',
    renameSession: '修改会话名称',
    renameSessionPrompt: '输入新的会话名称',
    sessionContextMenu: '会话菜单',
    copySelection: '复制选区',
    pasteClipboard: '粘贴剪贴板',
    switchSessionModel: '切换模型',
    customModel: '自定义模型...',
    modelPrompt: '输入模型名称',
    modelRequired: '模型名称不能为空。',
    modelSwitchUnavailable: '这个会话当前不支持模型切换。',
    canvasContextMenu: '画布菜单',
    addCliSession: '新增会话',
    addProviderSession: '新增 {provider}',
    addCanvasFrame: '说明框',
    addCanvasFrameArmed: '拖拽画框',
    canvasConnect: '连线',
    canvasConnectArmed: '连线中',
    canvasConnectHint: '点击任意会话两侧圆点，再点击另一个会话完成连线。',
    canvasConnectionStart: '选择另一个会话完成连线。',
    canvasConnectionCancel: '已取消连线。',
    canvasConnectionCreated: '已连接会话。',
    canvasConnectionRemoved: '已移除这条连线。',
    deleteCanvasConnection: '删除连线',
    canvasFrameHint: '在空白画布拖拽一下，创建一个只给人看的说明框。',
    moveCanvasFrame: '移动说明框',
    resizeCanvasFrame: '调整说明框大小',
    renameCanvasFrame: '修改说明框标题',
    deleteCanvasFrame: '删除说明框',
    canvasFrameDefaultTitle: '流程说明',
    canvasFrameTitlePlaceholder: '这组 CMD 在做什么',
    addCanvasTodo: 'Todo',
    canvasTodoAdded: 'Todo 已钉到画布',
    moveCanvasTodo: '移动 Todo',
    resizeCanvasTodo: '调整 Todo 大小',
    renameCanvasTodo: '修改 Todo 标题',
    deleteCanvasTodo: '删除 Todo',
    pinCanvasTodo: '置顶 Todo',
    unpinCanvasTodo: '取消置顶 Todo',
    canvasTodoDefaultTitle: 'Todo List',
    canvasTodoTitlePlaceholder: 'Todo 标题',
    canvasTodoAddPlaceholder: '新增待办',
    canvasTodoItemPlaceholder: '待办内容',
    canvasTodoEmpty: '还没有待办。',
    canvasTodoProgress: '{done}/{total} 完成',
    canvasTodoProgressEmpty: '0 个待办',
    canvasTodoPlan: 'Plan',
    canvasTodoPlanPlaceholder: '写下计划、背景或验收标准。',
    canvasTodoTasks: 'Tasks',
    canvasTodoAutoSync: '从输出同步',
    canvasTodoManualSync: '手动维护',
    canvasTodoLinkedSession: '绑定会话：{name}',
    agentPlanTodoTitle: '{name} Plan',
    agentPlanTodoCreated: '已为 Agent 创建 Plan/Todo 卡片。',
    groupEndpoints: '分组端点',
    ungroupEndpoints: '取消分组',
    endpointGroup: '端点组',
    groupEndpointsUnavailable: '至少需要两个已收起端点。',
    collectIdleCmd: '收纳闲置 CMD',
    idleCmdGroup: '闲置 CMD',
    collectIdleCmdUnavailable: '当前画布没有闲置 CMD。',
    collectIdleCmdDone: '已收纳 {count} 个闲置 CMD。',
    sessionTag: 'Tag',
    sessionTagNone: '无标签',
    sessionTagCustom: '自定义...',
    sessionTagCustomPrompt: '输入自定义 tag',
    sessionTagImportant: '重要',
    sessionTagNormal: '一般',
    sessionTagTest: '测试',
    sessionTagReview: '审查',
    sessionTagInvestigation: '调查',
    sessionTagDocumentation: '编写文档',
    arrangeByTag: '按 Tag',
    arrangeByTagEmpty: '当前会话还没有 tag，会按未打标区域整理。',
    taskRunning: '进行中',
    taskIdle: '闲置',
    taskCompleted: '已完成',
    taskError: '异常',
    sessionIdleToast: '会话「{name}」已闲置',
    floatingComposerDrag: '拖拽移动快捷发送，双击回到底部',
    floatingComposerTitle: '快捷发送',
    floatingComposerSubtitle: '发送到：{name}',
    floatingComposerTarget: '目标会话',
    floatingComposerTargetSelector: '切换发送目标',
    floatingComposerTargetCount: '{count} 个会话',
    floatingComposerTargetMenu: '选择发送目标',
    floatingComposerTargetSearch: '搜索会话、CLI 或路径',
    floatingComposerTargetNoMatch: '没有匹配的会话。',
    floatingComposerUnavailable: '当前画布没有可接收输入的会话。',
    floatingComposerPlaceholder: '输入内容后发送到 {name}',
    floatingComposerHint: '{sendShortcut} 发送，{dispatchShortcut} 分发任务，Shift+Enter 换行，粘贴或拖拽图片会加入上下文包',
    floatingComposerCurrent: '当前',
    floatingComposerSend: '发送',
    floatingComposerCollapse: '收起快捷发送',
    floatingComposerExpand: '展开快捷发送',
    floatingComposerSent: '已发送到 {name}',
    floatingComposerHistory: '发送历史',
    floatingComposerHistoryEmpty: '暂无发送历史',
    floatingComposerHistoryUntitled: '空内容',
    floatingComposerImageReference: '图片({path})',
    floatingComposerImagesAdded: '已添加 {count} 张图片',
    floatingComposerImageMissingDir: '未找到可保存图片的目录。',
    floatingComposerImageSaveFailed: '图片保存失败：{message}',
    floatingComposerContextPack: '上下文包',
    floatingComposerContextCount: '{count} 项上下文',
    floatingComposerContextEmpty: '暂无上下文',
    floatingComposerContextClear: '清空上下文包',
    floatingComposerContextRemove: '移除上下文',
    floatingComposerContextAddFile: '从文件树选择项目文件',
    floatingComposerContextAddTerminalSelection: '加入终端选区',
    floatingComposerContextAddLatestOutput: '加入目标会话最近输出',
    floatingComposerContextAddSelectedText: '加入选中文本或剪贴板',
    floatingComposerContextAddUrl: '加入 URL 内容',
    floatingComposerContextAdded: '已加入上下文：{name}',
    floatingComposerContextAddFailed: '加入上下文失败：{message}',
    floatingComposerContextNoTerminalSelection: '先在某个终端里选中输出。',
    floatingComposerContextNoSelectedText: '没有可加入的选中文本或剪贴板文本。',
    floatingComposerContextSelectedText: '选中文本',
    floatingComposerContextFile: '文件',
    floatingComposerContextImage: '图片',
    floatingComposerContextUrl: 'URL',
    floatingComposerContextTerminalSelection: '终端选区',
    floatingComposerContextTerminalOutput: '终端输出',
    floatingComposerUrlPrompt: '输入要加入上下文的 URL',
    imageGeneration: 'GPT 生图',
    imageGenerationTitle: 'GPT 生图',
    imageGenerationDescription: '使用已配置的图像 API 生成图片。',
    imageGenerationClose: '关闭 GPT 生图',
    imageGenerationBackToWorkspace: '返回工作区',
    imageGenerationControls: '生成设置',
    imageGenerationOpenSettings: '图像 API 设置',
    imageGenerationToolsTitle: '图片工具页',
    imageGenerationOpenToolsPage: '浏览器打开',
    imageGenerationPrompt: '提示词',
    imageGenerationPlaceholder: '描述要生成的图片。',
    imageGenerationModel: '图片模型',
    imageGenerationAspectRatio: '画面比例',
    imageGenerationAspectAuto: '自动',
    imageGenerationAspectSummary: '比例 {ratio}',
    imageGenerationCurrentSize: '尺寸 {size}',
    imageGenerationCustomAspect: '当前自定义比例：{ratio}',
    imageGenerationUpscale: '输出清晰度',
    imageGenerationUpscaleDefault: '默认',
    imageGenerationUpscaleSummary: '清晰度 {value}',
    imageGenerationCountLabel: '生成张数',
    imageGenerationRequestedCount: '请求 {count} 张',
    imageGenerationReferenceImages: '参考图',
    imageGenerationReferenceCount: '已选 {count} 张',
    imageGenerationReferenceImage: '参考图',
    imageGenerationReferenceEmpty: '暂无参考图',
    imageGenerationReferenceAdd: '添加参考图',
    imageGenerationReferenceClear: '清空',
    imageGenerationReferenceRemove: '移除参考图',
    imageGenerationReferenceSummary: '参考图 {count}',
    imageGenerationUseAsReference: '用作参考图',
    imageGenerationReferenceAdded: '已添加 {count} 张参考图',
    imageGenerationReferenceSaveFailed: '参考图保存失败：{message}',
    imageGenerationResetCanvas: '重置画布',
    imageGenerationCanvasEmpty: '生成结果会出现在画布上。',
    imageGenerationConfigLoading: '正在加载配置',
    imageGenerationGenerate: '生成',
    imageGenerationSubmitting: '提交中',
    imageGenerationGenerating: '生成中',
    imageGenerationResult: '生成图片',
    imageGenerationCount: '{count} 张生成结果',
    imageGenerationEmpty: '暂无生成结果。',
    imageGenerationClear: '清空结果',
    imageGenerationHistoryTitle: '本地历史',
    imageGenerationHistoryEmpty: '暂无本地生图历史。',
    imageGenerationHistoryUntitled: '未命名任务',
    imageGenerationHistoryLatest: '最新',
    imageGenerationHistoryImageCount: '{count} 张',
    imageGenerationHistoryTaskCount: '{count} 条任务',
    imageGenerationTaskIdLabel: 'Task ID',
    imageGenerationFailureReason: '失败原因',
    imageGenerationPollHistory: '轮询记录',
    imageGenerationPollHistoryCount: '{count} 次轮询',
    imageGenerationPollResult: '轮询 #{index}',
    imageGenerationRequestParams: '请求参数',
    imageGenerationRequestBody: '请求体',
    imageGenerationRequestEditor: '请求编辑器',
    imageGenerationRequestEditorReset: '同步当前 UI',
    imageGenerationRequestJsonInvalid: '{name} 必须是 JSON 对象：{message}',
    imageGenerationRequestPromptRequired: '请求体里需要 prompt，或在提示词输入框填写 prompt。',
    imageGenerationSuccessPayload: '成功 Payload',
    imageGenerationFailurePayload: '失败 Payload',
    imageGenerationNoPayload: '暂无 payload',
    imageGenerationViewFullPrompt: '查看完整提示词',
    imageGenerationViewFullPayload: '查看完整 Payload',
    imageGenerationCopyReference: '复制图片引用',
    imageGenerationOpenFile: '打开图片',
    imageGenerationCopied: '图片引用已复制。',
    imageGenerationFileUnavailable: '图片不可用',
    imageGenerationGenerated: '已生成 {count} 张图片',
    imageGenerationTaskSubmitted: '生图任务已提交。',
    imageGenerationTaskPending: '生成中',
    imageGenerationTaskFailedTitle: '生成失败',
    imageGenerationFailed: '生成图片失败：{message}',
    imageGenerationNoLocalPath: '图像 API 没有返回本地图片路径。',
    imageGenerationHistoryLoadFailed: '读取生图历史失败：{message}',
    imageGenerationHistorySaveFailed: '保存生图历史失败：{message}',
    imageGenerationUnknownError: '未知错误',
    floatingComposerDispatchTasks: '分发任务',
    floatingComposerDispatchingTasks: '分发中',
    floatingComposerDispatchMode: '分发模式',
    floatingComposerDispatchModeReuse: '复用',
    floatingComposerDispatchModeNew: '新开',
    floatingComposerDispatchModeReuseTooltip: '复用模式：按行分发任务时优先发送到闲置会话，不够时自动新建会话。',
    floatingComposerDispatchModeNewTooltip: '新开模式：按行分发任务时每条任务都会创建一个新会话，不占用现有会话。',
    floatingComposerDispatchTasksTitle: '按行分发任务：使用当前分发模式执行（{dispatchShortcut}）',
    floatingComposerDispatchTasksTitleReuse: '按行分发任务：优先使用闲置会话，不够时自动新建会话（{dispatchShortcut}）',
    floatingComposerDispatchTasksTitleNew: '按行分发任务：每条任务都会新开一个会话（{dispatchShortcut}）',
    floatingComposerDispatchEmpty: '先在快捷发送里按行写任务。',
    floatingComposerDispatchDone: '已分发 {count} 个任务，复用 {reused} 个闲置会话，新建 {created} 个会话。目标：{targets}',
    floatingComposerDispatchReuseEnterHint: '看到闪亮外框的复用会话时，请到对应 CMD 会话里按一次 Enter，让任务开始输出。',
    floatingComposerDispatchFailed: '任务分发失败：{message}',
    quickPrompts: '常用 prompt',
    quickPromptDefaultName: '常用 prompt',
    quickPromptSave: '保存 prompt',
    quickPromptUse: '插入常用 prompt：{name}',
    quickPromptDelete: '删除常用 prompt',
    quickPromptNamePrompt: '输入常用 prompt 名称',
    quickPromptNameRequired: '常用 prompt 名称不能为空。',
    quickPromptContentRequired: '先输入要保存的 prompt。',
    quickPromptSaved: '已保存常用 prompt：{name}',
    quickPromptDeleted: '已删除常用 prompt：{name}',
    quickPromptInserted: '已插入常用 prompt：{name}',
    quickPromptDeleteConfirm: '确认删除常用 prompt「{name}」？',
    quickPromptLoadFailed: '读取常用 prompt 失败：{message}',
    quickPromptSaveFailed: '保存常用 prompt 失败：{message}',
    quickPromptDeleteFailed: '删除常用 prompt 失败：{message}',
    promptMenu: '提示词',
    promptManagerTitle: '提示词管理中心',
    promptManagerDescription: '维护快捷发送里的常用 prompt。',
    promptManagerNew: '新增 prompt',
    promptManagerEmpty: '还没有常用 prompt。',
    promptManagerTitleLabel: '标题',
    promptManagerTitlePlaceholder: '给这个 prompt 起个名字',
    promptManagerContentLabel: 'Prompt 内容',
    promptManagerContentPlaceholder: '输入常用 prompt 内容',
    promptManagerDiscardConfirm: '当前 prompt 有未保存更改，确认丢弃？',
    promptManagerSaved: '已保存：{name}',
    promptManagerDeleted: '已删除：{name}',
    promptManagerCount: '{count} 条',
    sessionRuntime: '运行',
    sessionContext: '上下文',
    exportSession: '导出会话',
    exportSessionCustom: '导出到指定目录',
    sessionExported: '已导出：{path}',
    exportSessionFailed: '导出失败：{message}',
    historyFolder: '历史记录',
    openHistoryFolder: '打开历史记录',
    historyFolderUnavailable: '历史目录未就绪',
    restart: '重启',
    close: '关闭',
    restartConfirm: '确认重启这个会话？当前运行状态会被中断。',
    closeConfirm: '确认关闭这个会话？当前运行状态会被中断。',
    resize: '调整大小',
    preferences: '偏好',
    appearance: '外观',
    appZoom: '应用缩放',
    appZoomPreset: '应用缩放 {percent}%',
    appZoomReset: '重置为 100%',
    appZoomApplyFailed: '应用缩放失败：{message}',
    sessionHeaderDisplay: '会话 CMD 顶部',
    sessionHeaderDisplayHint: '未勾选的项目会收进会话顶部的信息下拉菜单，随时可以打开查看。',
    sessionHeaderMore: '会话信息',
    sessionHeaderShowTag: 'Tag',
    sessionHeaderShowModel: '模型',
    sessionHeaderShowContext: '上下文',
    sessionHeaderShowStatus: '状态',
    sessionHeaderShowRuntime: '运行时间',
    commandDockShortcuts: '快捷发送快捷键',
    commandDockSendShortcut: '发送快捷键',
    commandDockDispatchShortcut: '分发任务快捷键',
    commandDockShortcutHint: '两个动作不能使用同一个快捷键；选择重复项时会自动交换。Shift+Enter 保留为换行。',
    light: '浅色',
    dark: '深色',
    language: '语言',
    chinese: '中文',
    english: 'English',
    codexQuickConfig: '快捷配置',
    providerKey: 'Provider Key',
    providerName: 'Provider Name',
    apiKey: 'API Key',
    baseUrl: 'Base URL',
    model: 'Model',
    reasoningEffort: '推理强度',
    approvalPolicy: '审批策略',
    sandboxMode: '沙箱权限',
    defaultValue: '默认',
    wireApi: 'Wire API',
    quickProfile: '配置方案',
    currentCodexProfile: '当前 Codex 配置',
    currentClaudeProfile: '当前 Claude Code 配置',
    saveQuickProfile: '保存方案',
    saveQuickProfileAs: '另存为',
    deleteQuickProfile: '删除方案',
    quickModel: '快速模型',
    quickModelHint: '点击按钮可快速填入常用模型，也可以继续手动输入自定义模型。',
    claudeQuickConfig: 'Claude Code 快捷配置',
    claudeApiKey: 'Anthropic API Key',
    claudeBaseUrl: 'Anthropic Base URL',
    claudeEffortLevel: '思考强度',
    claudePermissionMode: '默认权限模式',
    claudeQuickModel: 'Claude 快速模型',
    claudeQuickModelHint: '点击按钮可快速填入 Claude Code 常用模型别名。',
    imageApiConfig: '图像 API',
    configFiles: '配置文件',
    imageApiUrl: 'API URL',
    imageApiModel: '图像模型',
    imageApiSize: '尺寸',
    imageApiUpscale: '清晰度',
    imageApiCount: '数量',
    imageApiKeySavedPlaceholder: '已保存，留空保持不变',
    imageApiRequestEditor: '显示请求编辑器',
    imageApiRequestEditorHint: '开启后 GPT 生图面板会显示可编辑的 URL 请求参数和 JSON 请求体。',
    clearApiKey: '清除密钥',
    saveImageApiConfig: '保存图像 API',
    usageTracking: '用量与成本',
    usageTrackingDescription: '基于本地终端输出估算 token；这不是供应商真实账单。',
    usageSessions: '会话',
    usageRuntime: '运行时长',
    usageEstimatedTokens: '估算 Tokens',
    usageEstimatedCost: '估算成本',
    usageOutput: '终端输出',
    usageRate: '单价',
    usageRateHint: 'USD / 100 万估算 token',
    saveUsageRates: '保存单价',
    clearUsageRecords: '清空记录',
    usageRecordsCleared: '用量记录已清空。',
    usageRatesSaved: '用量单价已保存。',
    usageTrackingLoaded: '用量记录已加载',
    usageTrackingReadFailed: '读取用量记录失败：{message}',
    usageTrackingDirty: '用量单价有未保存更改',
    usageNoRecords: '暂无已结束会话记录。',
    usageRecentSessions: '最近会话',
    usageByCli: '按 CLI 汇总',
    usageClearConfirm: '确认清空本地用量记录？单价配置会保留。',
    imageApiHelp: '需要自建 OpenAI 兼容图像网关时，可参考 gpt2api；保存后把 API URL 填为你的 /v1 地址。',
    imageApiHelpLink: '查看 gpt2api',
    rawCodexEditor: 'CLI 配置文件编辑',
    rawCodexEditorDescription: '这里可以直接修改并保存 Codex 或 Claude Code 的本地配置文件。',
    fastMode: 'Fast mode',
    requiresOpenaiAuth: '使用 OpenAI auth',
    disableResponseStorage: '禁用响应存储',
    contextWindow1m: '1M 上下文',
    applyQuickConfig: '应用快捷配置',
    reload: '刷新',
    copy: '复制',
    validate: '校验',
    openFolder: '打开目录',
    openPathFailed: '打开路径失败：{message}',
    save: '保存',
    loading: '加载中',
    skills: 'Skills',
    skillsLoading: '正在扫描当前工作区的 skill 文件…',
    skillsHint: '自动识别当前工作区里的 .cli-in-one/skills、.cursor、.claude、.agent、.github。',
    collapseSkills: '收起 Skills',
    expandSkills: '展开 Skills',
    skillsEmpty: '未识别到可管理的 skill 文件。',
    skillsScopeEmpty: '目录存在，但没有识别到 skill 文件。',
    skillsLoadFailed: '读取 skills 失败：{message}',
    skillsMoreFiles: '还有 {count} 个文件',
    skillsTruncated: '结果过多，已截断显示。',
    floatingComposerSkillEmpty: '当前工作区没有可插入的 skill。',
    floatingComposerSkillFile: '文件',
    floatingComposerSkillDirectory: '目录',
    floatingComposerSkillInserted: '已插入 Skill：{path}',
    floatingComposerSkillNoMatch: '没有匹配的 skill。',
    currentVersion: '当前版本',
    versionCheckTitle: '版本检查',
    versionCheckChecking: '正在检查最新版本…',
    versionCheckCurrent: '已是最新版本：{version}',
    versionCheckOutdated: '发现新版本：{latest}（当前 {current}）',
    versionCheckAhead: '当前版本 {current} 高于 GitHub 最新版本 {latest}。',
    versionCheckUnavailable: '暂时无法确认最新版本。',
    versionCheckFailed: '检查最新版本失败：{message}',
    versionCheckCheckingTip: '正在检查 GitHub 最新版本…',
    versionCheckCurrentTip: '已是最新版本：{version}',
    versionCheckOutdatedTip: '有新版本 {latest} 可用，当前 {current}',
    versionCheckAheadTip: '当前 {current} 高于 GitHub 最新版本 {latest}',
    versionCheckFailedTip: '版本检查失败：{message}',
    versionCheckPendingTip: '等待版本信息…',
    versionCheckUnknownTip: '暂时无法确认最新版本',
    checkUpdates: '检查更新',
    checkingUpdates: '检查更新中…',
    latestVersion: '最新版本',
    openLatestRelease: '打开最新 Release',
    changelogTitle: 'GitHub Releases',
    changelogLoading: '正在从 GitHub Releases 读取本版本更新…',
    changelogMissing: 'GitHub Releases 中没有找到当前版本的 changelog。',
    changelogReadFailed: '读取 GitHub Releases 失败：{message}',
    changelogSourceGithub: 'GitHub Releases',
    changelogSourceLocal: '本地备用',
    openRelease: '打开 Release',
    localOnly: '完全本地',
    localData: '本地存储',
    localDataSummary: '应用偏好、项目列表、画布布局和导出记录都保存在当前设备。',
    appNetwork: '应用联网',
    appNetworkSummary: '启动后会请求 GitHub Releases 检查最新版本；点击版本号时会读取本版本 changelog；使用图像 API 或快捷发送 URL 上下文时会连接对应服务；应用不做云同步。',
    cliNetworkNotice: 'CLI 说明',
    cliNetworkNoticeSummary: '终端里运行的 Codex、Claude Code、Cursor 或其他命令是否联网，取决于这些工具自身的行为和配置。',
    modelUnset: '未设置模型',
    modelSwitched: '模型已切换为 {model}',
    modelSwitchFailed: '切换模型失败：{message}',
    backupHistory: '历史备份',
    noBackups: '暂无备份',
    restoreBackup: '恢复备份',
    settingsDescription: '应用偏好、历史记录、Codex 和 Claude Code 配置文件。',
    switchedProject: '当前项目：{name}',
    addedProject: '已新增项目：{name}',
    switchedExistingProject: '已切换到项目：{name}',
    deletedProject: '已删除项目：{name}',
    switchedCanvasModeShared: '已切换到共享画布',
    switchedCanvasModeProject: '已切换到按项目画布',
    deleteProjectConfirm: '确认删除项目“{name}”？这只会从侧边栏移除项目，不会删除本地文件。',
    ptyFallback: '当前使用管道模式；安装 node-pty 成功后会自动切换到 ConPTY。',
    configReadFailed: '读取配置失败：{message}',
    codexReadFailed: '读取 Codex 配置失败：{message}',
    codexProfileReadFailed: '读取 Codex 快捷配置失败：{message}',
    codexProfileSaved: 'Codex 快捷配置已保存。',
    claudeProfileReadFailed: '读取 Claude Code 快捷配置失败：{message}',
    claudeProfileSaved: 'Claude Code 快捷配置已保存。',
    reloadFailed: '刷新失败：{message}',
    saveFailed: '保存失败：{message}',
    backupListFailed: '读取备份失败：{message}',
    restoreFailed: '恢复失败：{message}',
    quickProfileStoreFailed: '读取快捷配置方案失败：{message}',
    imageApiConfigLoaded: '图像 API 配置已加载',
    imageApiConfigDirty: '图像 API 配置有未保存更改',
    imageApiConfigSaved: '图像 API 配置已保存',
    imageApiConfigReadFailed: '读取图像 API 配置失败：{message}',
    openUrlFailed: '打开链接失败：{message}',
    openDirFailed: '打开目录失败：{message}',
    invalidNotSaved: '{name}，未保存。',
    unsavedCloseConfirm: '{name} 还没有保存，确认关闭？',
    switchDiscardConfirm: '切换文件会丢弃当前未保存更改，确认切换？',
    switchQuickProfileDiscardConfirm: '切换配置方案会丢弃当前快捷配置未保存更改，确认切换？',
    deleteQuickProfileConfirm: '确认删除配置方案“{name}”？这不会修改当前 Codex 配置文件。',
    deleteClaudeQuickProfileConfirm: '确认删除配置方案“{name}”？这不会修改当前 Claude Code 配置文件。',
    reloadDiscardConfirm: '重新加载 {name} 会丢弃未保存更改，确认刷新？',
    restoreBackupConfirm: '确认用选中的历史备份覆盖当前 {name}？恢复前会先备份当前文件。',
    restoreBackupDirtyConfirm: '{name} 有未保存更改。确认用选中的历史备份覆盖，并丢弃未保存更改？恢复前会先备份当前文件。',
    restoreBackupSaved: '已从备份恢复',
    restoreBackupSavedWithBackup: '已从备份恢复，恢复前版本已备份',
    restoreBackupSavedToast: '已从 {name} 恢复。',
    profileSaveDiscardConfirm: '应用快捷配置会覆盖当前编辑器未保存更改，确认继续？',
    quickConfigLoaded: '快捷配置已加载',
    quickConfigDirty: '快捷配置有未保存更改',
    newQuickProfile: '新配置方案',
    newClaudeQuickProfile: '新 Claude Code 配置方案',
    quickProfileNamePrompt: '输入配置方案名称',
    quickProfileNameRequired: '配置方案名称不能为空。',
    quickProfileSaved: '配置方案已保存：{name}',
    quickProfileDeleted: '配置方案已删除：{name}',
    quickProfileSwitched: '已载入配置方案：{name}',
    workspaceTreeTitle: '当前工作区文件树',
    workspaceTreeDescription: '查看当前目录结构，会跳过大型生成目录并限制读取规模。',
    workspaceTreeSummary: '{directories} 个目录，{files} 个文件',
    workspaceTreeSummaryWithOmitted: '{directories} 个目录，{files} 个文件，省略 {omitted} 项',
    workspaceTreeLoading: '正在读取文件树…',
    workspaceTreeUnavailable: '当前没有可查看的工作区目录。',
    workspaceTreeFailed: '读取文件树失败：{message}',
    workspaceTreeCopied: '文件树已复制到剪贴板。',
    workspaceTreeInsertToComposer: '加入上下文包',
    workspaceTreeSelectFileHint: '选中文件后，可加入快捷发送上下文包',
    workspaceTreeSelectedFile: '已选：{path}',
    workspaceTreePathInserted: '已加入文件上下文：{path}',
    workspaceTreeNoData: '还没有读取文件树。',
    workspaceTreeEmpty: '这个目录目前是空的。',
    workspaceTreeIgnored: '已跳过',
    workspaceTreeLink: '链接',
    workspaceTreeDepthLimit: '已达到深度限制',
    workspaceTreeOmitted: '省略 {count} 项',
    workspaceTreeUnreadable: '无法读取：{message}',
    sessionReviewTitle: '会话审阅台',
    sessionReviewDescription: '统一查看当前画布所有会话的最新输出。',
    sessionReviewSummaryLine: '{total} 个会话，{running} 进行中，{idle} 闲置，{completed} 已完成，{error} 异常',
    sessionReviewEmpty: '当前画布没有会话。',
    sessionReviewLatestOutput: '最近输出',
    sessionReviewNoOutput: '还没有输出记录。',
    sessionReviewCopyAll: '复制汇总',
    sessionReviewCopied: '会话汇总已复制。',
    sessionReviewCopyOne: '复制这个会话',
    sessionReviewExportAll: '导出全部',
    sessionReviewExportedAll: '已导出 {count} 个会话。',
    sessionReviewExportAllFailed: '批量导出失败：{message}',
    sessionReviewOpenSession: '定位会话',
    sessionReviewSetQuickTarget: '设为快捷发送目标',
    sessionReviewUpdatedAt: '更新 {time}',
    sessionReviewNeverUpdated: '未更新',
    refresh: '刷新',
    cancel: '取消',
    diffReview: 'Diff 审阅',
    diffReviewTitle: 'Diff / Review',
    diffReviewDescription: '查看当前 Git diff，集中写下审阅意见，再把这些反馈交给指定 Agent 处理。',
    diffReviewNoWorkspace: '当前没有可用的工作区目录。',
    diffReviewLoadFailed: '读取 Git diff 失败。',
    diffReviewUpdatedAt: '更新 {time}',
    diffReviewCopyDiff: '复制 diff',
    diffReviewDiffLabel: 'Git diff',
    diffReviewLoading: '正在读取 Git diff…',
    diffReviewNoDiffBody: '当前没有可显示的 diff。',
    diffReviewClean: '当前工作区没有 Git diff。',
    diffReviewCommentsLabel: '审阅意见',
    diffReviewSummary: '变更摘要',
    diffReviewStatusEmpty: '没有 status 输出。',
    diffReviewStaged: '已暂存',
    diffReviewUnstaged: '未暂存',
    diffReviewAgent: '发送给 Agent',
    diffReviewAgentPlaceholder: '选择 Agent',
    diffReviewOpenAgents: '管理 Agents',
    diffReviewCommentsPlaceholder: '把要批量发回 Agent 的评论写在这里，例如：\n- 这里会覆盖用户改动，改成增量处理\n- 给新增 IPC 补错误提示\n- 跑一次 renderer build',
    diffReviewSend: '发送给 Agent',
    diffReviewQueued: '已发送审阅意见给 Agent：{name}',
    apiKeyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    modelPlaceholder: 'gpt-5.1-codex-max'
  },
  en: {
    appSubtitle: 'Local projects and sessions',
    expandSidebar: 'Expand sidebar',
    collapseSidebar: 'Collapse sidebar',
    addProject: 'Add project',
    deleteProject: 'Delete project',
    pinProject: 'Pin project',
    unpinProject: 'Unpin project',
    dragProject: 'Drag to reorder',
    completedProjectSessionsBadge: '{count} completed session(s) in this project',
    codexConfig: 'Codex config',
    projects: 'Projects',
    projectEmpty: 'Choose a folder to manage projects here.',
    canvasMode: 'Canvas mode',
    canvasModeShared: 'Shared',
    canvasModeProject: 'Per project',
    canvasModeProjectTooltip: 'Each project keeps its own canvas and only shows sessions and frames linked to the active project.',
    canvasModeSharedTooltip: 'All projects share one canvas, useful for viewing and arranging sessions across projects.',
    sharedWorkspace: 'Shared workspace',
    freeSessionWorkspace: 'Free sessions',
    settings: 'Settings',
    closeAll: 'Close all',
    closeAllConfirm: 'Close all sessions? Their current running state will be interrupted.',
    workspace: 'Workspace',
    noProject: 'No project',
    addSession: 'New session',
    sessionList: 'Current sessions',
    sessionListEmpty: 'No sessions in this view yet. Create one above.',
    canvasSessionStatusQueue: 'Session status',
    canvasSessionStatusRefresh: 'Refresh session status',
    canvasSessionStatusUpdatedAt: 'Updated {time}',
    canvasSessionStatusFocus: 'Focus session',
    canvasSessionStatusEndpoint: 'Endpoint',
    agents: 'Agents',
    agentsDialogTitle: 'Agents',
    agentsDialogDescription: 'Save reusable agent instructions, then assign a task to launch the selected CLI automatically.',
    agentsEmpty: 'No agents yet. Create one and write its instructions.',
    newAgent: 'New agent',
    saveAgent: 'Save agent',
    deleteAgent: 'Delete agent',
    agentName: 'Agent name',
    agentNamePlaceholder: 'For example: code review, test repair, docs cleanup',
    agentInstructions: 'Agent instructions',
    agentInstructionsPlaceholder: 'Write the role, constraints, and working style this agent should follow on every task.',
    agentSkills: 'Associated skills',
    agentSkillsHint: 'Selected skill directory paths are injected into the task prompt when the agent starts.',
    agentSkillsSelectedCount: '{count} selected',
    agentSkillsEmpty: 'No attachable skills were found in the current workspace.',
    agentSkillMissing: 'Not found in the current scan',
    agentAvatar: 'Avatar',
    uploadAgentAvatar: 'Upload avatar',
    removeAgentAvatar: 'Remove avatar',
    agentAvatarHint: 'Images are saved to the app .cli-in-one/agent-avatars folder and take effect after saving the agent.',
    agentTask: 'Task description',
    agentTaskPlaceholder: 'Describe the task to assign to this agent.',
    agentRun: 'Assign and launch',
    agentRequired: 'Select or create an agent first.',
    agentNameRequired: 'Agent name is required.',
    agentTaskRequired: 'Task description is required.',
    agentSaved: 'Agent saved: {name}',
    agentDeleted: 'Agent deleted: {name}',
    agentStarted: 'Agent started: {name}',
    agentAvatarSaved: 'Avatar uploaded. Save the agent to apply it.',
    agentAvatarSaveFailed: 'Failed to upload avatar: {message}',
    agentAvatarInvalid: 'Choose an image file.',
    agentDeleteConfirm: 'Delete agent "{name}"?',
    agentUtilityBarTitle: 'Agent tools',
    agentUtilityQuickTarget: 'Target',
    agentUtilityQuickTargetTitle: 'Set as the Quick Send target',
    agentUtilityAttachImage: 'Image',
    agentUtilityAttachImageTitle: 'Add image context to Quick Send',
    agentUtilityFiles: 'Files',
    agentUtilityFilesTitle: 'Open the file tree and add file context',
    agentUtilityDiff: 'Diff',
    agentUtilityDiffTitle: 'Insert the current Git diff',
    agentUtilityDiffLoading: 'Reading',
    agentUtilityReview: 'Review',
    agentUtilityReviewTitle: 'Open Diff/Review and focus this session',
    agentUtilityTargetReady: 'Quick Send target switched to {name}',
    agentUtilityDiffContextHeader: 'Current Git diff ({path})',
    agentUtilityDiffEmpty: 'There is no Git diff in the current workspace.',
    agentUtilityDiffInserted: 'Inserted Git diff context.',
    agentUtilityDiffFailed: 'Failed to read Git diff: {message}',
    agentUtilityPanelMissing: 'Could not find this agent session.',
    autopilot: 'Autopilot',
    autopilotDialogTitle: 'Autopilot',
    autopilotDialogDescription: 'Configure startup-ready runbooks, assign them to saved agents, and trigger them on a schedule.',
    autopilotEmpty: 'No autopilots yet. Create a runbook and choose an agent.',
    newAutopilot: 'New autopilot',
    saveAutopilot: 'Save autopilot',
    deleteAutopilot: 'Delete autopilot',
    autopilotName: 'Name',
    autopilotNamePlaceholder: 'For example: daily audit, weekday build check',
    autopilotAgent: 'Assigned agent',
    autopilotRunbook: 'Runbook',
    autopilotRunbookPlaceholder: 'Write the full runbook to hand to the agent when this runs.',
    autopilotEnabled: 'Enable scheduled run',
    autopilotSchedule: 'Schedule',
    autopilotScheduleDaily: 'Daily',
    autopilotScheduleWeekday: 'Weekday',
    autopilotScheduleWeekly: 'Weekly',
    autopilotScheduleCron: 'Custom cron',
    autopilotTime: 'Time',
    autopilotWeekday: 'Weekday',
    autopilotCron: 'Cron',
    autopilotCronPlaceholder: 'For example: 0 9 * * 1-5',
    autopilotLastRun: 'Last run',
    autopilotNextRun: 'Next run',
    autopilotNeverRun: 'Never run',
    autopilotNotScheduled: 'Not scheduled',
    autopilotRunNow: 'Run now',
    autopilotRequired: 'Select or create an autopilot first.',
    autopilotAgentRequired: 'Choose an agent to assign.',
    autopilotRunbookRequired: 'Runbook is required.',
    autopilotCronInvalid: 'Cron must have 5 fields with valid minute, hour, day-of-month, month, and day-of-week values.',
    autopilotSaved: 'Autopilot saved: {name}',
    autopilotDeleted: 'Autopilot deleted: {name}',
    autopilotStarted: 'Autopilot started: {name}',
    autopilotMissingAgent: 'Autopilot "{name}" cannot find its assigned agent.',
    autopilotDeleteConfirm: 'Delete autopilot "{name}"?',
    weekdayMonday: 'Monday',
    weekdayTuesday: 'Tuesday',
    weekdayWednesday: 'Wednesday',
    weekdayThursday: 'Thursday',
    weekdayFriday: 'Friday',
    weekdaySaturday: 'Saturday',
    weekdaySunday: 'Sunday',
    addCommandLine: 'New CMD',
    addProjectDialogTitle: 'Add project',
    addProjectDialogDescription: 'Choose the project folder and name before adding it to the sidebar.',
    addProjectConfirm: 'Add project',
    addProjectPath: 'Project directory',
    addProjectName: 'Project name',
    addProjectNamePlaceholder: 'Defaults to the folder name',
    addCommandDialogTitle: 'New CMD',
    addCommandDialogDescription: 'Choose the launch directory before creating the CMD session.',
    addCommandConfirm: 'Create CMD',
    addCommandDirectoryHint: 'The session will start in this directory and appear in the current workspace.',
    commandPreset: 'Command preset',
    commandPresetNone: 'No preset',
    commandPresetCommand: 'Startup command',
    commandPresetPlaceholder: 'For example: pnpm dev:console',
    commandPresetHint: 'Leave empty to start a blank CMD; when filled, the command is typed and submitted on creation.',
    commandPresetDefaultBadge: 'Default',
    commandPresetSave: 'Save preset',
    commandPresetSetDefault: 'Set default',
    commandPresetDelete: 'Delete preset',
    commandPresetNamePrompt: 'Enter command preset name',
    commandPresetNameRequired: 'Command preset name is required.',
    commandPresetCommandRequired: 'Enter a startup command first.',
    commandPresetSaved: 'Command preset saved: {name}',
    commandPresetDeleted: 'Command preset deleted: {name}',
    commandPresetSelected: 'Default command preset switched: {name}',
    commandPresetDeleteConfirm: 'Delete command preset "{name}"?',
    commandPresetLoadFailed: 'Failed to read command presets: {message}',
    commandPresetSaveFailed: 'Failed to save command preset: {message}',
    commandPresetDeleteFailed: 'Failed to delete command preset: {message}',
    commandPresetSelectFailed: 'Failed to switch default command preset: {message}',
    dialogPathRequired: 'Choose a directory first.',
    addSessionGrid: 'Batch sessions',
    quickGrid2x2: '2x2',
    gridSessionDialogTitle: 'Create session grid',
    gridSessionDialogDescription: 'Enter how many sessions to create and they will be arranged as a grid in the current workspace.',
    gridSessionCount: 'Session count',
    gridSessionCountHint: 'Supports 1 to {max} sessions and arranges them into a near-square grid automatically.',
    gridSessionCreate: 'Create sessions',
    gridSessionInvalid: 'Enter an integer between 1 and {max}.',
    newSessionSource: 'Choose session directory',
    newSessionSourceDescription: 'Choose a CLI first, then pick a project or the current directory.',
    cliProvider: 'CLI',
    cliTarget: 'Launch target',
    launchCommand: 'Launch command',
    freeWindow: 'Free window',
    defaultDirectory: 'Default directory',
    directory: 'Directory',
    chooseDirectory: 'Choose directory',
    workspaceTree: 'File tree',
    workspaceTreeOpen: 'Open file tree',
    workspaceTreeClose: 'Close file tree',
    sessionReview: 'Review',
    sessionReviewOpen: 'Open review',
    sessionReviewClose: 'Close review',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomLevel: 'Zoom level',
    zoomPreset: 'Zoom to {percent}%',
    resetView: 'Reset view',
    arrange: 'Arrange',
    cpuUsage: 'CPU',
    memoryUsage: 'Memory',
    systemStatsUnavailable: 'System stats unavailable',
    topbarRunningSessions: 'Cross-project running',
    topbarSessionStatsTitle: 'Cross-project sessions: {total} total, {running} running, {idle} idle, {completed} completed, {error} error',
    runningModePipe: 'Pipe mode',
    runtimeStarting: 'Starting',
    session: 'Session',
    sessionFallbackTitle: 'Session',
    commandLine: 'CMD',
    commandLineFallbackTitle: 'CMD',
    startEmpty: 'Start a new session',
    startHint: 'Right-click empty canvas space to quickly create Codex, Claude, CMD, and other sessions.',
    movePanel: 'Move session',
    minimizeSession: 'Minimize to endpoint',
    expandSession: 'Expand session',
    renameSession: 'Rename session',
    renameSessionPrompt: 'Enter the new session name',
    sessionContextMenu: 'Session menu',
    copySelection: 'Copy selection',
    pasteClipboard: 'Paste clipboard',
    switchSessionModel: 'Switch model',
    customModel: 'Custom model...',
    modelPrompt: 'Enter model name',
    modelRequired: 'Model name is required.',
    modelSwitchUnavailable: 'This session cannot switch models right now.',
    canvasContextMenu: 'Canvas menu',
    addCliSession: 'New session',
    addProviderSession: 'New {provider}',
    addCanvasFrame: 'Frame',
    addCanvasFrameArmed: 'Draw frame',
    canvasConnect: 'Connect',
    canvasConnectArmed: 'Connecting',
    canvasConnectHint: 'Click a dot on any session, then click another session to create a connection.',
    canvasConnectionStart: 'Choose another session to finish the connection.',
    canvasConnectionCancel: 'Connection canceled.',
    canvasConnectionCreated: 'Sessions connected.',
    canvasConnectionRemoved: 'Connection removed.',
    deleteCanvasConnection: 'Delete connection',
    canvasFrameHint: 'Drag on empty canvas to create a human-only annotation frame.',
    moveCanvasFrame: 'Move frame',
    resizeCanvasFrame: 'Resize frame',
    renameCanvasFrame: 'Rename frame',
    deleteCanvasFrame: 'Delete frame',
    canvasFrameDefaultTitle: 'Workflow note',
    canvasFrameTitlePlaceholder: 'What these CMDs are doing',
    addCanvasTodo: 'Todo',
    canvasTodoAdded: 'Todo pinned to canvas',
    moveCanvasTodo: 'Move Todo',
    resizeCanvasTodo: 'Resize Todo',
    renameCanvasTodo: 'Rename Todo',
    deleteCanvasTodo: 'Delete Todo',
    pinCanvasTodo: 'Pin Todo',
    unpinCanvasTodo: 'Unpin Todo',
    canvasTodoDefaultTitle: 'Todo List',
    canvasTodoTitlePlaceholder: 'Todo title',
    canvasTodoAddPlaceholder: 'Add a task',
    canvasTodoItemPlaceholder: 'Task',
    canvasTodoEmpty: 'No tasks yet.',
    canvasTodoProgress: '{done}/{total} done',
    canvasTodoProgressEmpty: '0 tasks',
    canvasTodoPlan: 'Plan',
    canvasTodoPlanPlaceholder: 'Write the plan, context, or acceptance criteria.',
    canvasTodoTasks: 'Tasks',
    canvasTodoAutoSync: 'Sync from output',
    canvasTodoManualSync: 'Manual',
    canvasTodoLinkedSession: 'Linked session: {name}',
    agentPlanTodoTitle: '{name} Plan',
    agentPlanTodoCreated: 'Created a Plan/Todo card for the agent.',
    groupEndpoints: 'Group endpoints',
    ungroupEndpoints: 'Ungroup endpoints',
    endpointGroup: 'Endpoint group',
    groupEndpointsUnavailable: 'At least two minimized endpoints are required.',
    collectIdleCmd: 'Collect idle CMD',
    idleCmdGroup: 'Idle CMD',
    collectIdleCmdUnavailable: 'There are no idle CMD sessions on this canvas.',
    collectIdleCmdDone: 'Collected {count} idle CMD session(s).',
    sessionTag: 'Tag',
    sessionTagNone: 'No tag',
    sessionTagCustom: 'Custom...',
    sessionTagCustomPrompt: 'Enter a custom tag',
    sessionTagImportant: 'Important',
    sessionTagNormal: 'Normal',
    sessionTagTest: 'Test',
    sessionTagReview: 'Review',
    sessionTagInvestigation: 'Investigation',
    sessionTagDocumentation: 'Docs',
    arrangeByTag: 'By Tag',
    arrangeByTagEmpty: 'No sessions have tags yet; arranging them as untagged.',
    taskRunning: 'Running',
    taskIdle: 'Idle',
    taskCompleted: 'Completed',
    taskError: 'Error',
    sessionIdleToast: 'Session "{name}" is idle.',
    floatingComposerDrag: 'Drag quick send, double-click to return to bottom',
    floatingComposerTitle: 'Quick send',
    floatingComposerSubtitle: 'Send to: {name}',
    floatingComposerTarget: 'Target session',
    floatingComposerTargetSelector: 'Switch send target',
    floatingComposerTargetCount: '{count} sessions',
    floatingComposerTargetMenu: 'Choose send target',
    floatingComposerTargetSearch: 'Search sessions, CLI, or path',
    floatingComposerTargetNoMatch: 'No matching sessions.',
    floatingComposerUnavailable: 'No live session on this canvas can receive input.',
    floatingComposerPlaceholder: 'Type here and send to {name}',
    floatingComposerHint: '{sendShortcut} to send, {dispatchShortcut} to dispatch tasks, Shift+Enter for newline, paste or drop images to add them to the context pack',
    floatingComposerCurrent: 'Current',
    floatingComposerSend: 'Send',
    floatingComposerCollapse: 'Collapse quick send',
    floatingComposerExpand: 'Expand quick send',
    floatingComposerSent: 'Sent to {name}',
    floatingComposerHistory: 'Sent history',
    floatingComposerHistoryEmpty: 'No sent history',
    floatingComposerHistoryUntitled: 'Empty content',
    floatingComposerImageReference: 'image({path})',
    floatingComposerImagesAdded: 'Added {count} image(s)',
    floatingComposerImageMissingDir: 'No directory is available for saving images.',
    floatingComposerImageSaveFailed: 'Failed to save image: {message}',
    floatingComposerContextPack: 'Context pack',
    floatingComposerContextCount: '{count} context item(s)',
    floatingComposerContextEmpty: 'No context',
    floatingComposerContextClear: 'Clear context pack',
    floatingComposerContextRemove: 'Remove context',
    floatingComposerContextAddFile: 'Choose a project file from the file tree',
    floatingComposerContextAddTerminalSelection: 'Add terminal selection',
    floatingComposerContextAddLatestOutput: 'Add latest target output',
    floatingComposerContextAddSelectedText: 'Add selected text or clipboard',
    floatingComposerContextAddUrl: 'Add URL content',
    floatingComposerContextAdded: 'Added context: {name}',
    floatingComposerContextAddFailed: 'Failed to add context: {message}',
    floatingComposerContextNoTerminalSelection: 'Select output in a terminal first.',
    floatingComposerContextNoSelectedText: 'No selected text or clipboard text is available.',
    floatingComposerContextSelectedText: 'Selected text',
    floatingComposerContextFile: 'File',
    floatingComposerContextImage: 'Image',
    floatingComposerContextUrl: 'URL',
    floatingComposerContextTerminalSelection: 'Terminal selection',
    floatingComposerContextTerminalOutput: 'Terminal output',
    floatingComposerUrlPrompt: 'Enter the URL to add as context',
    imageGeneration: 'GPT Image',
    imageGenerationTitle: 'GPT Image',
    imageGenerationDescription: 'Generate images with the configured Image API.',
    imageGenerationClose: 'Close GPT Image',
    imageGenerationBackToWorkspace: 'Back to workspace',
    imageGenerationControls: 'Generation settings',
    imageGenerationOpenSettings: 'Image API settings',
    imageGenerationToolsTitle: 'Image tools',
    imageGenerationOpenToolsPage: 'Open in browser',
    imageGenerationPrompt: 'Prompt',
    imageGenerationPlaceholder: 'Describe the image to generate.',
    imageGenerationModel: 'Image model',
    imageGenerationAspectRatio: 'Aspect ratio',
    imageGenerationAspectAuto: 'Auto',
    imageGenerationAspectSummary: 'Ratio {ratio}',
    imageGenerationCurrentSize: 'Size {size}',
    imageGenerationCustomAspect: 'Current custom ratio: {ratio}',
    imageGenerationUpscale: 'Output quality',
    imageGenerationUpscaleDefault: 'Default',
    imageGenerationUpscaleSummary: 'Upscale {value}',
    imageGenerationCountLabel: 'Image count',
    imageGenerationRequestedCount: 'Requested {count}',
    imageGenerationReferenceImages: 'Reference images',
    imageGenerationReferenceCount: '{count} selected',
    imageGenerationReferenceImage: 'Reference image',
    imageGenerationReferenceEmpty: 'No reference images',
    imageGenerationReferenceAdd: 'Add reference',
    imageGenerationReferenceClear: 'Clear',
    imageGenerationReferenceRemove: 'Remove reference image',
    imageGenerationReferenceSummary: '{count} reference image(s)',
    imageGenerationUseAsReference: 'Use as reference',
    imageGenerationReferenceAdded: 'Added {count} reference image(s)',
    imageGenerationReferenceSaveFailed: 'Failed to save reference image: {message}',
    imageGenerationResetCanvas: 'Reset canvas',
    imageGenerationCanvasEmpty: 'Generated images will appear on the canvas.',
    imageGenerationConfigLoading: 'Loading config',
    imageGenerationGenerate: 'Generate',
    imageGenerationSubmitting: 'Submitting',
    imageGenerationGenerating: 'Generating',
    imageGenerationResult: 'Generated image',
    imageGenerationCount: '{count} generated image(s)',
    imageGenerationEmpty: 'No generated images yet.',
    imageGenerationClear: 'Clear results',
    imageGenerationHistoryTitle: 'Local history',
    imageGenerationHistoryEmpty: 'No local image history yet.',
    imageGenerationHistoryUntitled: 'Untitled task',
    imageGenerationHistoryLatest: 'Latest',
    imageGenerationHistoryImageCount: '{count} image(s)',
    imageGenerationHistoryTaskCount: '{count} task(s)',
    imageGenerationTaskIdLabel: 'Task ID',
    imageGenerationFailureReason: 'Failure reason',
    imageGenerationPollHistory: 'Poll history',
    imageGenerationPollHistoryCount: '{count} poll(s)',
    imageGenerationPollResult: 'Poll #{index}',
    imageGenerationRequestParams: 'Request params',
    imageGenerationRequestBody: 'Request body',
    imageGenerationRequestEditor: 'Request editor',
    imageGenerationRequestEditorReset: 'Sync current UI',
    imageGenerationRequestJsonInvalid: '{name} must be a JSON object: {message}',
    imageGenerationRequestPromptRequired: 'The request body needs a prompt, or fill the prompt field.',
    imageGenerationSuccessPayload: 'Success payload',
    imageGenerationFailurePayload: 'Failure payload',
    imageGenerationNoPayload: 'No payload',
    imageGenerationViewFullPrompt: 'View full prompt',
    imageGenerationViewFullPayload: 'View full payload',
    imageGenerationCopyReference: 'Copy image reference',
    imageGenerationOpenFile: 'Open image',
    imageGenerationCopied: 'Image reference copied.',
    imageGenerationFileUnavailable: 'Image unavailable',
    imageGenerationGenerated: 'Generated {count} image(s)',
    imageGenerationTaskSubmitted: 'Image generation task submitted.',
    imageGenerationTaskPending: 'Generating',
    imageGenerationTaskFailedTitle: 'Generation failed',
    imageGenerationFailed: 'Image generation failed: {message}',
    imageGenerationNoLocalPath: 'The Image API did not return a local image path.',
    imageGenerationHistoryLoadFailed: 'Failed to load image history: {message}',
    imageGenerationHistorySaveFailed: 'Failed to save image history: {message}',
    imageGenerationUnknownError: 'Unknown error',
    floatingComposerDispatchTasks: 'Dispatch tasks',
    floatingComposerDispatchingTasks: 'Dispatching',
    floatingComposerDispatchMode: 'Dispatch mode',
    floatingComposerDispatchModeReuse: 'Reuse',
    floatingComposerDispatchModeNew: 'New',
    floatingComposerDispatchModeReuseTooltip: 'Reuse mode: dispatch one task per line to idle sessions first, creating new sessions only when needed.',
    floatingComposerDispatchModeNewTooltip: 'New-session mode: dispatch one task per line by creating a fresh session for every task, without using existing sessions.',
    floatingComposerDispatchTasksTitle: 'Dispatch one task per line with the current dispatch mode. ({dispatchShortcut})',
    floatingComposerDispatchTasksTitleReuse: 'Dispatch one task per line. Idle sessions are used first; new sessions are created when needed. ({dispatchShortcut})',
    floatingComposerDispatchTasksTitleNew: 'Dispatch one task per line. A new session is created for every task. ({dispatchShortcut})',
    floatingComposerDispatchEmpty: 'Write one task per line in quick send first.',
    floatingComposerDispatchDone: 'Dispatched {count} task(s), reused {reused} idle session(s), created {created} session(s). Targets: {targets}',
    floatingComposerDispatchReuseEnterHint: 'For reused sessions with the flashing outline, open the target CMD session and press Enter once to start output.',
    floatingComposerDispatchFailed: 'Task dispatch failed: {message}',
    quickPrompts: 'Prompts',
    quickPromptDefaultName: 'Saved prompt',
    quickPromptSave: 'Save prompt',
    quickPromptUse: 'Insert saved prompt: {name}',
    quickPromptDelete: 'Delete saved prompt',
    quickPromptNamePrompt: 'Enter saved prompt name',
    quickPromptNameRequired: 'Saved prompt name is required.',
    quickPromptContentRequired: 'Type a prompt before saving it.',
    quickPromptSaved: 'Saved prompt: {name}',
    quickPromptDeleted: 'Deleted prompt: {name}',
    quickPromptInserted: 'Inserted prompt: {name}',
    quickPromptDeleteConfirm: 'Delete saved prompt "{name}"?',
    quickPromptLoadFailed: 'Failed to read saved prompts: {message}',
    quickPromptSaveFailed: 'Failed to save prompt: {message}',
    quickPromptDeleteFailed: 'Failed to delete prompt: {message}',
    promptMenu: 'Prompts',
    promptManagerTitle: 'Prompt manager',
    promptManagerDescription: 'Manage Quick Send saved prompts.',
    promptManagerNew: 'New prompt',
    promptManagerEmpty: 'No saved prompts yet.',
    promptManagerTitleLabel: 'Title',
    promptManagerTitlePlaceholder: 'Name this prompt',
    promptManagerContentLabel: 'Prompt content',
    promptManagerContentPlaceholder: 'Type the saved prompt content',
    promptManagerDiscardConfirm: 'This prompt has unsaved changes. Discard them?',
    promptManagerSaved: 'Saved: {name}',
    promptManagerDeleted: 'Deleted: {name}',
    promptManagerCount: '{count} item(s)',
    sessionRuntime: 'Run',
    sessionContext: 'Context',
    exportSession: 'Export session',
    exportSessionCustom: 'Export to folder',
    sessionExported: 'Exported: {path}',
    exportSessionFailed: 'Export failed: {message}',
    historyFolder: 'History',
    openHistoryFolder: 'Open history',
    historyFolderUnavailable: 'History folder is not ready',
    restart: 'Restart',
    close: 'Close',
    restartConfirm: 'Restart this session? Its current running state will be interrupted.',
    closeConfirm: 'Close this session? Its current running state will be interrupted.',
    resize: 'Resize',
    preferences: 'Preferences',
    appearance: 'Appearance',
    appZoom: 'App zoom',
    appZoomPreset: 'Set app zoom to {percent}%',
    appZoomReset: 'Reset to 100%',
    appZoomApplyFailed: 'Failed to apply app zoom: {message}',
    sessionHeaderDisplay: 'Session CMD header',
    sessionHeaderDisplayHint: 'Unchecked items move into the session header info menu and remain available there.',
    sessionHeaderMore: 'Session info',
    sessionHeaderShowTag: 'Tag',
    sessionHeaderShowModel: 'Model',
    sessionHeaderShowContext: 'Context',
    sessionHeaderShowStatus: 'Status',
    sessionHeaderShowRuntime: 'Runtime',
    commandDockShortcuts: 'Quick send shortcuts',
    commandDockSendShortcut: 'Send shortcut',
    commandDockDispatchShortcut: 'Dispatch shortcut',
    commandDockShortcutHint: 'The two actions cannot share one shortcut; duplicate selections are swapped automatically. Shift+Enter stays as newline.',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    chinese: '中文',
    english: 'English',
    codexQuickConfig: 'Quick config',
    providerKey: 'Provider key',
    providerName: 'Provider name',
    apiKey: 'API key',
    baseUrl: 'Base URL',
    model: 'Model',
    reasoningEffort: 'Reasoning effort',
    approvalPolicy: 'Approval policy',
    sandboxMode: 'Sandbox mode',
    defaultValue: 'Default',
    wireApi: 'Wire API',
    quickProfile: 'Preset',
    currentCodexProfile: 'Current Codex config',
    currentClaudeProfile: 'Current Claude Code config',
    saveQuickProfile: 'Save preset',
    saveQuickProfileAs: 'Save as',
    deleteQuickProfile: 'Delete preset',
    quickModel: 'Quick model',
    quickModelHint: 'Use the buttons to fill common models quickly, or keep typing a custom model manually.',
    claudeQuickConfig: 'Claude Code quick config',
    claudeApiKey: 'Anthropic API key',
    claudeBaseUrl: 'Anthropic Base URL',
    claudeEffortLevel: 'Thinking effort',
    claudePermissionMode: 'Default permission mode',
    claudeQuickModel: 'Claude quick model',
    claudeQuickModelHint: 'Use the buttons to fill common Claude Code model aliases quickly.',
    imageApiConfig: 'Image API',
    configFiles: 'Config files',
    imageApiUrl: 'API URL',
    imageApiModel: 'Image model',
    imageApiSize: 'Size',
    imageApiUpscale: 'Upscale',
    imageApiCount: 'Count',
    imageApiKeySavedPlaceholder: 'Saved; leave blank to keep it',
    imageApiRequestEditor: 'Show request editor',
    imageApiRequestEditorHint: 'When enabled, the GPT Image panel shows editable URL request params and JSON request body.',
    clearApiKey: 'Clear key',
    saveImageApiConfig: 'Save Image API',
    usageTracking: 'Usage and cost',
    usageTrackingDescription: 'Estimates tokens from local terminal output; this is not the provider bill.',
    usageSessions: 'Sessions',
    usageRuntime: 'Runtime',
    usageEstimatedTokens: 'Estimated tokens',
    usageEstimatedCost: 'Estimated cost',
    usageOutput: 'Terminal output',
    usageRate: 'Rate',
    usageRateHint: 'USD / 1M estimated tokens',
    saveUsageRates: 'Save rates',
    clearUsageRecords: 'Clear records',
    usageRecordsCleared: 'Usage records cleared.',
    usageRatesSaved: 'Usage rates saved.',
    usageTrackingLoaded: 'Usage records loaded',
    usageTrackingReadFailed: 'Failed to read usage records: {message}',
    usageTrackingDirty: 'Usage rates have unsaved changes',
    usageNoRecords: 'No completed session records yet.',
    usageRecentSessions: 'Recent sessions',
    usageByCli: 'By CLI',
    usageClearConfirm: 'Clear local usage records? Rate settings will be kept.',
    imageApiHelp: 'For a self-hosted OpenAI-compatible image gateway, see gpt2api; then set API URL to your /v1 endpoint.',
    imageApiHelpLink: 'View gpt2api',
    rawCodexEditor: 'CLI config file editor',
    rawCodexEditorDescription: 'Edit and save local Codex or Claude Code config files directly here.',
    fastMode: 'Fast mode',
    requiresOpenaiAuth: 'Use OpenAI auth',
    disableResponseStorage: 'Disable response storage',
    contextWindow1m: '1M context',
    applyQuickConfig: 'Apply quick config',
    reload: 'Reload',
    copy: 'Copy',
    validate: 'Validate',
    openFolder: 'Open folder',
    openPathFailed: 'Open path failed: {message}',
    save: 'Save',
    loading: 'Loading',
    skills: 'Skills',
    skillsLoading: 'Scanning workspace skill files…',
    skillsHint: 'Auto-detects .cli-in-one/skills, .cursor, .claude, .agent, and .github in the current workspace.',
    collapseSkills: 'Collapse Skills',
    expandSkills: 'Expand Skills',
    skillsEmpty: 'No manageable skill files were detected.',
    skillsScopeEmpty: 'The directory exists, but no skill files were detected.',
    skillsLoadFailed: 'Failed to read skills: {message}',
    skillsMoreFiles: '{count} more file(s)',
    skillsTruncated: 'Results were truncated.',
    floatingComposerSkillEmpty: 'No insertable skill was found in this workspace.',
    floatingComposerSkillFile: 'File',
    floatingComposerSkillDirectory: 'Directory',
    floatingComposerSkillInserted: 'Inserted Skill: {path}',
    floatingComposerSkillNoMatch: 'No matching skill.',
    currentVersion: 'Current version',
    versionCheckTitle: 'Version check',
    versionCheckChecking: 'Checking latest version...',
    versionCheckCurrent: 'You are on the latest version: {version}',
    versionCheckOutdated: 'New version available: {latest} (current {current})',
    versionCheckAhead: 'Current version {current} is ahead of the latest GitHub release {latest}.',
    versionCheckUnavailable: 'Latest version could not be confirmed right now.',
    versionCheckFailed: 'Version check failed: {message}',
    versionCheckCheckingTip: 'Checking the latest GitHub release...',
    versionCheckCurrentTip: 'You are on the latest version: {version}',
    versionCheckOutdatedTip: 'New version {latest} is available; current {current}',
    versionCheckAheadTip: 'Current {current} is ahead of latest GitHub release {latest}',
    versionCheckFailedTip: 'Version check failed: {message}',
    versionCheckPendingTip: 'Waiting for version info...',
    versionCheckUnknownTip: 'Latest version could not be confirmed right now',
    checkUpdates: 'Check for updates',
    checkingUpdates: 'Checking for updates...',
    latestVersion: 'Latest version',
    openLatestRelease: 'Open latest release',
    changelogTitle: 'GitHub Releases',
    changelogLoading: 'Loading this version from GitHub Releases...',
    changelogMissing: 'No changelog entry was found for the current version in GitHub Releases.',
    changelogReadFailed: 'Failed to read GitHub Releases: {message}',
    changelogSourceGithub: 'GitHub Releases',
    changelogSourceLocal: 'Local fallback',
    openRelease: 'Open release',
    localOnly: 'Local only',
    localData: 'Local storage',
    localDataSummary: 'App preferences, project lists, canvas layouts, and exported records stay on this device.',
    appNetwork: 'App network',
    appNetworkSummary: 'On startup, the app requests GitHub Releases to check the latest version; clicking the version loads this version changelog; using Image API or quick-send URL context connects to the relevant service; the app does not sync data to any cloud service.',
    cliNetworkNotice: 'CLI notice',
    cliNetworkNoticeSummary: 'Whether Codex, Claude Code, Cursor, or any other command inside the terminal connects to a network depends on that tool itself.',
    modelUnset: 'Model not set',
    modelSwitched: 'Model switched to {model}',
    modelSwitchFailed: 'Failed to switch model: {message}',
    backupHistory: 'Backups',
    noBackups: 'No backups',
    restoreBackup: 'Restore',
    settingsDescription: 'App preferences, history, Codex config files, and Claude Code config files.',
    switchedProject: 'Current project: {name}',
    addedProject: 'Added project: {name}',
    switchedExistingProject: 'Switched to project: {name}',
    deletedProject: 'Deleted project: {name}',
    switchedCanvasModeShared: 'Switched to shared canvas',
    switchedCanvasModeProject: 'Switched to per-project canvas',
    deleteProjectConfirm: 'Delete project "{name}"? This only removes it from the sidebar and will not delete local files.',
    ptyFallback: 'Pipe mode is active. Install node-pty successfully to use ConPTY.',
    configReadFailed: 'Failed to read config: {message}',
    codexReadFailed: 'Failed to read Codex config: {message}',
    codexProfileReadFailed: 'Failed to read Codex quick config: {message}',
    codexProfileSaved: 'Codex quick config saved.',
    claudeProfileReadFailed: 'Failed to read Claude Code quick config: {message}',
    claudeProfileSaved: 'Claude Code quick config saved.',
    reloadFailed: 'Reload failed: {message}',
    saveFailed: 'Save failed: {message}',
    backupListFailed: 'Failed to read backups: {message}',
    restoreFailed: 'Restore failed: {message}',
    quickProfileStoreFailed: 'Failed to read quick presets: {message}',
    imageApiConfigLoaded: 'Image API config loaded',
    imageApiConfigDirty: 'Image API config has unsaved changes',
    imageApiConfigSaved: 'Image API config saved',
    imageApiConfigReadFailed: 'Failed to read Image API config: {message}',
    openUrlFailed: 'Open link failed: {message}',
    openDirFailed: 'Open folder failed: {message}',
    invalidNotSaved: '{name}, not saved.',
    unsavedCloseConfirm: '{name} has unsaved changes. Close anyway?',
    switchDiscardConfirm: 'Switching files will discard unsaved changes. Continue?',
    switchQuickProfileDiscardConfirm: 'Switching presets will discard unsaved quick config changes. Continue?',
    deleteQuickProfileConfirm: 'Delete preset "{name}"? This will not modify current Codex config files.',
    deleteClaudeQuickProfileConfirm: 'Delete preset "{name}"? This will not modify current Claude Code config files.',
    reloadDiscardConfirm: 'Reloading {name} will discard unsaved changes. Continue?',
    restoreBackupConfirm: 'Restore the selected backup over current {name}? The current file will be backed up first.',
    restoreBackupDirtyConfirm: '{name} has unsaved changes. Restore the selected backup and discard those changes? The current file will be backed up first.',
    restoreBackupSaved: 'Restored from backup',
    restoreBackupSavedWithBackup: 'Restored from backup; previous version was backed up',
    restoreBackupSavedToast: 'Restored from {name}.',
    profileSaveDiscardConfirm: 'Applying quick config will replace unsaved editor changes. Continue?',
    quickConfigLoaded: 'Quick config loaded',
    quickConfigDirty: 'Quick config has unsaved changes',
    newQuickProfile: 'New preset',
    newClaudeQuickProfile: 'New Claude Code preset',
    quickProfileNamePrompt: 'Enter preset name',
    quickProfileNameRequired: 'Preset name is required.',
    quickProfileSaved: 'Preset saved: {name}',
    quickProfileDeleted: 'Preset deleted: {name}',
    quickProfileSwitched: 'Loaded preset: {name}',
    workspaceTreeTitle: 'Current workspace file tree',
    workspaceTreeDescription: 'View the current directory structure with generated folders skipped and scan limits applied.',
    workspaceTreeSummary: '{directories} directories, {files} files',
    workspaceTreeSummaryWithOmitted: '{directories} directories, {files} files, {omitted} omitted',
    workspaceTreeLoading: 'Loading file tree…',
    workspaceTreeUnavailable: 'There is no workspace directory to inspect.',
    workspaceTreeFailed: 'Failed to read file tree: {message}',
    workspaceTreeCopied: 'File tree copied to clipboard.',
    workspaceTreeInsertToComposer: 'Add to context pack',
    workspaceTreeSelectFileHint: 'Select a file to add it to the quick send context pack.',
    workspaceTreeSelectedFile: 'Selected: {path}',
    workspaceTreePathInserted: 'Added file context: {path}',
    workspaceTreeNoData: 'File tree has not been loaded yet.',
    workspaceTreeEmpty: 'This directory is currently empty.',
    workspaceTreeIgnored: 'Skipped',
    workspaceTreeLink: 'Link',
    workspaceTreeDepthLimit: 'Depth limit reached',
    workspaceTreeOmitted: '{count} omitted',
    workspaceTreeUnreadable: 'Unreadable: {message}',
    sessionReviewTitle: 'Session review',
    sessionReviewDescription: 'Review the latest output from every session on the current canvas.',
    sessionReviewSummaryLine: '{total} sessions, {running} running, {idle} idle, {completed} completed, {error} error',
    sessionReviewEmpty: 'There are no sessions on the current canvas.',
    sessionReviewLatestOutput: 'Latest output',
    sessionReviewNoOutput: 'No output has been captured yet.',
    sessionReviewCopyAll: 'Copy summary',
    sessionReviewCopied: 'Session summary copied.',
    sessionReviewCopyOne: 'Copy this session',
    sessionReviewExportAll: 'Export all',
    sessionReviewExportedAll: 'Exported {count} session(s).',
    sessionReviewExportAllFailed: 'Bulk export failed: {message}',
    sessionReviewOpenSession: 'Focus session',
    sessionReviewSetQuickTarget: 'Set quick-send target',
    sessionReviewUpdatedAt: 'Updated {time}',
    sessionReviewNeverUpdated: 'Not updated',
    refresh: 'Refresh',
    cancel: 'Cancel',
    diffReview: 'Diff review',
    diffReviewTitle: 'Diff / Review',
    diffReviewDescription: 'Review the current Git diff, write batched comments, then send that feedback to a selected Agent.',
    diffReviewNoWorkspace: 'No workspace directory is available.',
    diffReviewLoadFailed: 'Failed to read Git diff.',
    diffReviewUpdatedAt: 'Updated {time}',
    diffReviewCopyDiff: 'Copy diff',
    diffReviewDiffLabel: 'Git diff',
    diffReviewLoading: 'Reading Git diff...',
    diffReviewNoDiffBody: 'There is no diff to display.',
    diffReviewClean: 'There is no Git diff in the current workspace.',
    diffReviewCommentsLabel: 'Review comments',
    diffReviewSummary: 'Change summary',
    diffReviewStatusEmpty: 'No status output.',
    diffReviewStaged: 'Staged',
    diffReviewUnstaged: 'Unstaged',
    diffReviewAgent: 'Send to Agent',
    diffReviewAgentPlaceholder: 'Choose an Agent',
    diffReviewOpenAgents: 'Manage Agents',
    diffReviewCommentsPlaceholder: 'Write the comments to send back to the Agent, for example:\n- This may overwrite user changes; make it incremental\n- Add error handling to the new IPC path\n- Run the renderer build once',
    diffReviewSend: 'Send to Agent',
    diffReviewQueued: 'Sent review comments to Agent: {name}',
    apiKeyPlaceholder: 'sk-...',
    baseUrlPlaceholder: 'https://api.example.com/v1',
    modelPlaceholder: 'gpt-5.1-codex-max'
  }
};

function translate(language, key, values = {}) {
  const template = messages[language]?.[key] || messages.zh[key] || key;
  return template.replace(/\{(\w+)\}/g, (_match, name) => String(values[name] ?? ''));
}

function createEmptyCodexProfile() {
  return { ...codexProfileDefaults };
}

function createEmptyClaudeProfile() {
  return { ...claudeProfileDefaults };
}

function normalizeCodexProfile(raw) {
  return {
    ...codexProfileDefaults,
    ...(raw || {}),
    approvalPolicy: approvalPolicyOptions.includes(raw?.approvalPolicy)
      ? raw.approvalPolicy
      : '',
    modelReasoningEffort: reasoningEffortOptions.includes(raw?.modelReasoningEffort)
      ? raw.modelReasoningEffort
      : codexProfileDefaults.modelReasoningEffort,
    fastMode: Object.prototype.hasOwnProperty.call(raw || {}, 'fastMode')
      ? Boolean(raw.fastMode)
      : codexProfileDefaults.fastMode,
    contextWindow1m: Boolean(raw?.contextWindow1m),
    disableResponseStorage: raw?.disableResponseStorage !== false,
    requiresOpenaiAuth: raw?.requiresOpenaiAuth !== false,
    sandboxMode: sandboxModeOptions.includes(raw?.sandboxMode)
      ? raw.sandboxMode
      : ''
  };
}

function normalizeClaudeProfile(raw) {
  return {
    ...claudeProfileDefaults,
    ...(raw || {}),
    effortLevel: claudeEffortLevelOptions.includes(raw?.effortLevel)
      ? raw.effortLevel
      : claudeProfileDefaults.effortLevel,
    permissionMode: claudePermissionModeOptions.includes(raw?.permissionMode)
      ? raw.permissionMode
      : claudeProfileDefaults.permissionMode
  };
}

function createEmptyImageApiConfig() {
  return { ...imageApiConfigDefaults };
}

function normalizeImageApiUpscale(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '2k' || normalized === '4k' ? normalized : '';
}

function normalizeImageApiConfig(raw) {
  const count = Number.parseInt(raw?.n, 10);
  return {
    ...imageApiConfigDefaults,
    ...(raw || {}),
    apiKey: '',
    apiKeySet: Boolean(raw?.apiKeySet),
    clearApiKey: Boolean(raw?.clearApiKey),
    configured: Boolean(raw?.configured),
    n: Number.isFinite(count) ? Math.min(4, Math.max(1, count)) : imageApiConfigDefaults.n,
    model: String(raw?.model || imageApiConfigDefaults.model).trim() || imageApiConfigDefaults.model,
    size: String(raw?.size || imageApiConfigDefaults.size).trim() || imageApiConfigDefaults.size,
    upscale: normalizeImageApiUpscale(raw?.upscale),
    requestEditorEnabled: Boolean(raw?.requestEditorEnabled)
  };
}

function deriveQuickProfileName(profile, fallback) {
  const normalized = normalizeCodexProfile(profile);
  const parts = [normalized.providerName, normalized.model]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(' / ') || fallback;
}

function deriveClaudeQuickProfileName(profile, fallback) {
  const normalized = normalizeClaudeProfile(profile);
  const parts = [normalized.model, normalized.permissionMode, normalized.baseUrl]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(' / ') || fallback;
}

function deriveQuickPromptTitle(prompt, fallback) {
  const firstLine = String(prompt || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return (firstLine || fallback).slice(0, 48);
}

function formatQuickProfileLabel(record) {
  const profile = normalizeCodexProfile(record?.profile);
  const detail = [profile.providerName, profile.model]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' / ');

  if (!detail || detail === record.name) {
    return record.name;
  }

  return `${record.name} (${detail})`;
}

function formatClaudeQuickProfileLabel(record) {
  const profile = normalizeClaudeProfile(record?.profile);
  const detail = [profile.model, profile.permissionMode, profile.baseUrl]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' / ');

  if (!detail || detail === record.name) {
    return record.name;
  }

  return `${record.name} (${detail})`;
}

function QuickModelButtons({ className, currentModel, disabled = false, models = quickModelOptions, onSelect, t }) {
  const normalizedModel = String(currentModel || '').trim();
  const modelOptions = Array.isArray(models) && models.length > 0 ? models : quickModelOptions;
  const hasQuickModel = modelOptions.includes(normalizedModel);

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {modelOptions.map((model) => (
        <Button
          key={model}
          type="button"
          size="sm"
          variant={normalizedModel === model ? 'primary' : 'outline'}
          onClick={() => onSelect(model)}
          disabled={disabled || normalizedModel === model}
        >
          {model}
        </Button>
      ))}
      {!hasQuickModel && (
        <Badge
          variant="outline"
          className="max-w-[180px] truncate font-mono text-[11px]"
          title={normalizedModel || t('modelUnset')}
        >
          {normalizedModel || t('modelUnset')}
        </Badge>
      )}
    </div>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bindPointerSession(onPointerMove, onPointerEnd) {
  let active = true;

  const handlePointerMove = (event) => {
    if (!active) {
      return;
    }
    onPointerMove(event);
  };

  const finish = (event) => {
    if (!active) {
      return;
    }

    active = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', finish);
    document.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
    onPointerEnd?.(event);
  };

  document.addEventListener('pointermove', handlePointerMove);
  document.addEventListener('pointerup', finish);
  document.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);

  return finish;
}

function parseGridSessionCount(value) {
  const trimmed = String(value || '').trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < gridSessionCountMin || parsed > gridSessionCountMax) {
    return null;
  }

  return parsed;
}

function formatUsagePercent(value) {
  if (!Number.isFinite(value)) {
    return '--%';
  }

  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function getMemoryUsageAlertTone(value) {
  if (!Number.isFinite(value)) {
    return 'normal';
  }

  if (value > memoryUsageCriticalThreshold) {
    return 'critical';
  }

  if (value > memoryUsageWarningThreshold) {
    return 'warning';
  }

  return 'normal';
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Math.max(0, value);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function createEmptyUsageTrackingState() {
  return {
    path: '',
    rates: {},
    records: []
  };
}

function normalizeUsageRate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeUsageRates(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw)
      .map(([providerId, value]) => {
        const normalizedId = String(providerId || '').trim();
        if (!normalizedId) {
          return null;
        }

        const costPerMillionTokens = typeof value === 'object' && value !== null
          ? normalizeUsageRate(value.costPerMillionTokens)
          : normalizeUsageRate(value);

        return [normalizedId, { costPerMillionTokens }];
      })
      .filter(Boolean)
  );
}

function normalizeUsageRecord(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const id = String(raw.id || '').trim();
  if (!id) {
    return null;
  }

  return {
    id,
    title: String(raw.title || '').trim(),
    cwd: String(raw.cwd || '').trim(),
    cliProviderId: String(raw.cliProviderId || 'shell').trim() || 'shell',
    model: String(raw.model || '').trim(),
    providerName: String(raw.providerName || '').trim(),
    initialCommand: String(raw.initialCommand || '').trim(),
    status: String(raw.status || '').trim(),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : 0,
    endedAt: Number.isFinite(raw.endedAt) ? raw.endedAt : 0,
    runtimeMs: Number.isFinite(raw.runtimeMs) ? Math.max(0, raw.runtimeMs) : 0,
    transcriptBytes: Number.isFinite(raw.transcriptBytes) ? Math.max(0, raw.transcriptBytes) : 0,
    outputChars: Number.isFinite(raw.outputChars) ? Math.max(0, raw.outputChars) : 0,
    estimatedTokens: Number.isFinite(raw.estimatedTokens) ? Math.max(0, raw.estimatedTokens) : 0
  };
}

function normalizeUsageTrackingState(raw = {}) {
  return {
    path: String(raw?.path || '').trim(),
    rates: normalizeUsageRates(raw?.rates),
    records: Array.isArray(raw?.records)
      ? raw.records.map(normalizeUsageRecord).filter(Boolean)
      : []
  };
}

function getUsageRecordCost(record, rates) {
  const rate = normalizeUsageRate(rates?.[record.cliProviderId]?.costPerMillionTokens);
  return (record.estimatedTokens / 1000000) * rate;
}

function summarizeUsageRecords(records, rates) {
  return records.reduce((summary, record) => {
    const cost = getUsageRecordCost(record, rates);
    const provider = summary.byProvider[record.cliProviderId] || {
      providerId: record.cliProviderId,
      sessions: 0,
      runtimeMs: 0,
      transcriptBytes: 0,
      estimatedTokens: 0,
      estimatedCost: 0
    };

    provider.sessions += 1;
    provider.runtimeMs += record.runtimeMs;
    provider.transcriptBytes += record.transcriptBytes;
    provider.estimatedTokens += record.estimatedTokens;
    provider.estimatedCost += cost;

    return {
      sessions: summary.sessions + 1,
      runtimeMs: summary.runtimeMs + record.runtimeMs,
      transcriptBytes: summary.transcriptBytes + record.transcriptBytes,
      estimatedTokens: summary.estimatedTokens + record.estimatedTokens,
      estimatedCost: summary.estimatedCost + cost,
      byProvider: {
        ...summary.byProvider,
        [record.cliProviderId]: provider
      }
    };
  }, {
    sessions: 0,
    runtimeMs: 0,
    transcriptBytes: 0,
    estimatedTokens: 0,
    estimatedCost: 0,
    byProvider: {}
  });
}

function formatUsageCurrency(value) {
  if (!Number.isFinite(value)) {
    return '$0.00';
  }

  return `$${Math.max(0, value).toFixed(value >= 1 ? 2 : 4)}`;
}

function formatUsageNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '0';
}

function formatElapsedDuration(startedAt, endedAt) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return '--:--';
  }

  const totalSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value) => String(value).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${minutes}:${pad(seconds)}`;
}

function normalizeCanvasView(value, fallback = createDefaultView()) {
  const base = fallback && Number.isFinite(fallback.x) && Number.isFinite(fallback.y) && Number.isFinite(fallback.scale)
    ? fallback
    : createDefaultView();

  if (!value || typeof value !== 'object') {
    return { ...base, scale: clamp(base.scale, 0.35, 2.5) };
  }

  return {
    x: Number.isFinite(value.x) ? value.x : base.x,
    y: Number.isFinite(value.y) ? value.y : base.y,
    scale: Number.isFinite(value.scale) ? clamp(value.scale, 0.35, 2.5) : clamp(base.scale, 0.35, 2.5)
  };
}

function sameCanvasView(left, right) {
  return Boolean(
    left &&
    right &&
    left.x === right.x &&
    left.y === right.y &&
    left.scale === right.scale
  );
}

function getProjectCanvasKey(projectId) {
  return projectId || noProjectCanvasKey;
}

function getWorkspaceCanvasKey(workspace) {
  return workspace.canvasMode === 'shared'
    ? sharedCanvasKey
    : getProjectCanvasKey(workspace.activeProjectId);
}

function getPanelCanvasKey(panel) {
  return getProjectCanvasKey(panel.projectId);
}

function isPanelVisibleInWorkspace(panel, workspace) {
  return workspace.canvasMode === 'shared' || getPanelCanvasKey(panel) === getWorkspaceCanvasKey(workspace);
}

function getWorkspaceCanvasView(workspace, fallback = createDefaultView()) {
  if (workspace.canvasMode === 'shared') {
    return normalizeCanvasView(workspace.sharedView, fallback);
  }

  return normalizeCanvasView(workspace.projectViews?.[getWorkspaceCanvasKey(workspace)], fallback);
}

function withWorkspaceCanvasView(workspace, canvasKey, view) {
  const nextView = normalizeCanvasView(view);

  if (canvasKey === sharedCanvasKey) {
    if (sameCanvasView(workspace.sharedView, nextView)) {
      return workspace;
    }
    return { ...workspace, sharedView: nextView };
  }

  const currentView = workspace.projectViews?.[canvasKey];
  if (sameCanvasView(currentView, nextView)) {
    return workspace;
  }

  return {
    ...workspace,
    projectViews: {
      ...workspace.projectViews,
      [canvasKey]: nextView
    }
  };
}

function normalizeCanvasFrame(frame, index = 0) {
  const fallbackX = 40 + index * 20;
  const fallbackY = 40 + index * 20;

  return {
    id: frame?.id || createLocalId('canvas-frame'),
    title: typeof frame?.title === 'string' ? frame.title : '',
    x: Number.isFinite(frame?.x) ? frame.x : fallbackX,
    y: Number.isFinite(frame?.y) ? frame.y : fallbackY,
    width: Number.isFinite(frame?.width)
      ? clamp(frame.width, canvasFrameMinWidth, 3200)
      : canvasFrameDefaultWidth,
    height: Number.isFinite(frame?.height)
      ? clamp(frame.height, canvasFrameMinHeight, 2400)
      : canvasFrameDefaultHeight
  };
}

function normalizeCanvasFrameMap(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([canvasKey, frames]) => [
      canvasKey,
      Array.isArray(frames)
        ? frames.map((frame, index) => normalizeCanvasFrame(frame, index))
        : []
    ])
  );
}

function getWorkspaceCanvasFrames(workspace, canvasKey = getWorkspaceCanvasKey(workspace)) {
  return Array.isArray(workspace?.canvasFrames?.[canvasKey]) ? workspace.canvasFrames[canvasKey] : [];
}

function sameCanvasFrame(left, right) {
  return Boolean(
    left &&
    right &&
    left.id === right.id &&
    left.title === right.title &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function sameCanvasFrameList(left, right) {
  if (left === right) {
    return true;
  }

  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((frame, index) => sameCanvasFrame(frame, right[index]));
}

function withWorkspaceCanvasFrames(workspace, canvasKey, frames) {
  const currentFrames = getWorkspaceCanvasFrames(workspace, canvasKey);
  const nextFrames = Array.isArray(frames)
    ? frames.map((frame, index) => normalizeCanvasFrame(frame, index))
    : [];

  if (sameCanvasFrameList(currentFrames, nextFrames)) {
    return workspace;
  }

  const nextCanvasFrames = { ...(workspace.canvasFrames || {}) };
  if (nextFrames.length === 0) {
    delete nextCanvasFrames[canvasKey];
  } else {
    nextCanvasFrames[canvasKey] = nextFrames;
  }

  return {
    ...workspace,
    canvasFrames: nextCanvasFrames
  };
}

function normalizeCanvasTodoStatus(value, done = false) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'done' || normalized === 'completed' || normalized === 'success') {
    return 'done';
  }
  if (normalized === 'in_progress' || normalized === 'running' || normalized === 'doing' || normalized === 'active') {
    return 'in_progress';
  }
  if (normalized === 'blocked' || normalized === 'failed' || normalized === 'error') {
    return 'blocked';
  }
  return done ? 'done' : 'todo';
}

function normalizeCanvasTodoTaskText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, canvasTodoTaskTextMaxLength);
}

function normalizeCanvasTodoPlanText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .slice(0, canvasTodoPlanTextMaxLength);
}

function normalizeCanvasTodoItem(item, index = 0) {
  const now = Date.now();
  const status = normalizeCanvasTodoStatus(item?.status, Boolean(item?.done));
  return {
    id: item?.id || createLocalId('canvas-todo-item'),
    text: normalizeCanvasTodoTaskText(item?.text),
    status,
    done: status === 'done',
    source: String(item?.source || '').trim(),
    createdAt: Number.isFinite(item?.createdAt) ? item.createdAt : now + index,
    updatedAt: Number.isFinite(item?.updatedAt) ? item.updatedAt : now + index
  };
}

function normalizeCanvasTodo(todo, index = 0) {
  const fallbackX = 72 + index * 24;
  const fallbackY = 72 + index * 24;

  return {
    id: todo?.id || createLocalId('canvas-todo'),
    title: typeof todo?.title === 'string' ? todo.title : '',
    pinned: Boolean(todo?.pinned),
    linkedPanelId: String(todo?.linkedPanelId || '').trim(),
    linkedPanelTitle: String(todo?.linkedPanelTitle || '').trim(),
    source: String(todo?.source || '').trim(),
    agentId: String(todo?.agentId || '').trim(),
    agentName: String(todo?.agentName || '').trim(),
    autoSync: Boolean(todo?.autoSync),
    followPanel: Boolean(todo?.linkedPanelId) && todo?.followPanel !== false,
    planText: normalizeCanvasTodoPlanText(todo?.planText),
    lastExtractedAt: Number.isFinite(todo?.lastExtractedAt) ? todo.lastExtractedAt : 0,
    x: Number.isFinite(todo?.x) ? todo.x : fallbackX,
    y: Number.isFinite(todo?.y) ? todo.y : fallbackY,
    width: Number.isFinite(todo?.width)
      ? clamp(todo.width, canvasTodoMinWidth, 1600)
      : canvasTodoDefaultWidth,
    height: Number.isFinite(todo?.height)
      ? clamp(todo.height, canvasTodoMinHeight, 1600)
      : canvasTodoDefaultHeight,
    items: Array.isArray(todo?.items)
      ? todo.items.map((item, itemIndex) => normalizeCanvasTodoItem(item, itemIndex))
      : []
  };
}

function normalizeCanvasTodoMap(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([canvasKey, todos]) => [
      canvasKey,
      Array.isArray(todos)
        ? todos.map((todo, index) => normalizeCanvasTodo(todo, index))
        : []
    ])
  );
}

function getWorkspaceCanvasTodos(workspace, canvasKey = getWorkspaceCanvasKey(workspace)) {
  return Array.isArray(workspace?.canvasTodos?.[canvasKey]) ? workspace.canvasTodos[canvasKey] : [];
}

function sameCanvasTodoItem(left, right) {
  return Boolean(
    left &&
    right &&
    left.id === right.id &&
    left.text === right.text &&
    left.status === right.status &&
    left.done === right.done &&
    left.source === right.source &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt
  );
}

function sameCanvasTodo(left, right) {
  return Boolean(
    left &&
    right &&
    left.id === right.id &&
    left.title === right.title &&
    left.pinned === right.pinned &&
    left.linkedPanelId === right.linkedPanelId &&
    left.linkedPanelTitle === right.linkedPanelTitle &&
    left.source === right.source &&
    left.agentId === right.agentId &&
    left.agentName === right.agentName &&
    left.autoSync === right.autoSync &&
    left.followPanel === right.followPanel &&
    left.planText === right.planText &&
    left.lastExtractedAt === right.lastExtractedAt &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    Array.isArray(left.items) &&
    Array.isArray(right.items) &&
    left.items.length === right.items.length &&
    left.items.every((item, index) => sameCanvasTodoItem(item, right.items[index]))
  );
}

function sameCanvasTodoList(left, right) {
  if (left === right) {
    return true;
  }

  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((todo, index) => sameCanvasTodo(todo, right[index]));
}

function withWorkspaceCanvasTodos(workspace, canvasKey, todos) {
  const currentTodos = getWorkspaceCanvasTodos(workspace, canvasKey);
  const nextTodos = Array.isArray(todos)
    ? todos.map((todo, index) => normalizeCanvasTodo(todo, index))
    : [];

  if (sameCanvasTodoList(currentTodos, nextTodos)) {
    return workspace;
  }

  const nextCanvasTodos = { ...(workspace.canvasTodos || {}) };
  if (nextTodos.length === 0) {
    delete nextCanvasTodos[canvasKey];
  } else {
    nextCanvasTodos[canvasKey] = nextTodos;
  }

  return {
    ...workspace,
    canvasTodos: nextCanvasTodos
  };
}

function normalizeCanvasTodoOutputText(value) {
  return String(value || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[()][A-Za-z0-9]/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00\x07\x0B\x0C\x0E-\x1F]/g, (char) => (
      char === '\n' || char === '\t' || char === '\b' ? char : ''
    ))
    .replace(/[^\n]\x08/g, '')
    .replace(/\x08/g, '');
}

function getCanvasTodoTaskKey(text) {
  return normalizeCanvasTodoTaskText(text)
    .toLowerCase()
    .replace(/[`"'“”‘’.,;:!?()[\]{}<>，。；：！？（）【】]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeExtractedCanvasTodoStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['x', '✓', '✔', 'done', 'complete', 'completed', 'success', 'passed', 'finished', '完成', '已完成'].includes(normalized)) {
    return 'done';
  }
  if (['~', '-', '…', '...', 'doing', 'active', 'running', 'in_progress', 'progress', '进行中', '处理中'].includes(normalized)) {
    return 'in_progress';
  }
  if (['blocked', 'failed', 'error', 'stuck', '阻塞', '失败'].includes(normalized)) {
    return 'blocked';
  }
  return 'todo';
}

function cleanExtractedCanvasTodoTaskText(value) {
  return normalizeCanvasTodoTaskText(
    String(value || '')
      .replace(/\s+\((?:pending|todo|queued|doing|running|in progress|done|completed|blocked|failed)\)\s*$/i, '')
      .replace(/\s+[。.]?\s*$/g, '')
  );
}

function parseCanvasTodoTaskLine(rawLine) {
  const line = String(rawLine || '').replace(/^[\s>|│┃┆]+/g, '').trim();
  if (!line || /^[-=_*]{3,}$/.test(line)) {
    return null;
  }

  const taskListMatch = line.match(/^(?:[-*+]|\d+[.)])\s+\[([^\]]*)\]\s+(.+)$/);
  if (taskListMatch) {
    const text = cleanExtractedCanvasTodoTaskText(taskListMatch[2]);
    return text ? { text, status: normalizeExtractedCanvasTodoStatus(taskListMatch[1]) } : null;
  }

  const bracketStatusMatch = line.match(/^(?:[-*+]|\d+[.)])?\s*\[([a-zA-Z_\-\s]+|完成|已完成|进行中|阻塞|失败)\]\s+(.+)$/);
  if (bracketStatusMatch) {
    const text = cleanExtractedCanvasTodoTaskText(bracketStatusMatch[2]);
    return text ? { text, status: normalizeExtractedCanvasTodoStatus(bracketStatusMatch[1]) } : null;
  }

  const prefixedStatusMatch = line.match(/^(?:[-*+]|\d+[.)])\s+(todo|pending|queued|doing|running|in progress|done|completed|blocked|failed|待办|进行中|完成|已完成|阻塞|失败)\s*[:：-]\s+(.+)$/i);
  if (prefixedStatusMatch) {
    const text = cleanExtractedCanvasTodoTaskText(prefixedStatusMatch[2]);
    return text ? { text, status: normalizeExtractedCanvasTodoStatus(prefixedStatusMatch[1]) } : null;
  }

  const doneGlyphMatch = line.match(/^(?:[-*+]\s*)?(?:✓|✔|☑)\s+(.+)$/);
  if (doneGlyphMatch) {
    const text = cleanExtractedCanvasTodoTaskText(doneGlyphMatch[1]);
    return text ? { text, status: 'done' } : null;
  }

  const pendingGlyphMatch = line.match(/^(?:[-*+]\s*)?(?:□|☐|○|◯)\s+(.+)$/);
  if (pendingGlyphMatch) {
    const text = cleanExtractedCanvasTodoTaskText(pendingGlyphMatch[1]);
    return text ? { text, status: 'todo' } : null;
  }

  const activeGlyphMatch = line.match(/^(?:[-*+]\s*)?(?:▶|►|…|\.\.\.)\s+(.+)$/);
  if (activeGlyphMatch) {
    const text = cleanExtractedCanvasTodoTaskText(activeGlyphMatch[1]);
    return text ? { text, status: 'in_progress' } : null;
  }

  return null;
}

function extractCanvasTodoPlanTextFromLines(lines) {
  const normalizedLines = Array.isArray(lines) ? lines : [];
  const startIndex = normalizedLines.findIndex((line) => {
    const text = String(line || '').trim().replace(/[*_`#：:]+$/g, '').toLowerCase();
    return text === 'plan' || text === 'planning' || text === '计划';
  });
  if (startIndex < 0) {
    return '';
  }

  const collected = [];
  for (let index = startIndex + 1; index < normalizedLines.length; index += 1) {
    const line = String(normalizedLines[index] || '').replace(/^[\s>|│┃┆]+/g, '').trim();
    if (!line) {
      if (collected.length > 0) {
        break;
      }
      continue;
    }
    if (/^(tasks?|todo|task list|任务|待办)\s*[:：]?$/i.test(line)) {
      break;
    }
    if (collected.length >= 8) {
      break;
    }
    collected.push(line);
  }

  const planText = collected.join('\n').trim();
  return collected.length >= 2 || planText.length >= 24 ? normalizeCanvasTodoPlanText(planText) : '';
}

function extractCanvasTodoProgressFromOutput(value) {
  const output = normalizeCanvasTodoOutputText(value);
  if (!output.trim()) {
    return { tasks: [], planText: '' };
  }

  const lines = output.split('\n');
  const tasks = [];
  const seenKeys = new Set();
  lines.forEach((line) => {
    const task = parseCanvasTodoTaskLine(line);
    if (!task) {
      return;
    }

    const key = getCanvasTodoTaskKey(task.text);
    if (!key || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    tasks.push(task);
  });

  return {
    tasks,
    planText: extractCanvasTodoPlanTextFromLines(lines)
  };
}

function resolveCanvasTodoMergedStatus(currentStatus, extractedStatus) {
  const current = normalizeCanvasTodoStatus(currentStatus);
  const next = normalizeCanvasTodoStatus(extractedStatus);
  if (next === 'done') {
    return 'done';
  }
  if (current === 'done') {
    return current;
  }
  if (next === 'todo' && current !== 'todo') {
    return current;
  }

  const currentRank = canvasTodoPlanStatusOrder[current] ?? 0;
  const nextRank = canvasTodoPlanStatusOrder[next] ?? 0;
  return nextRank >= currentRank ? next : current;
}

function mergeCanvasTodoExtractedProgress(todo, extracted, now = Date.now()) {
  const tasks = Array.isArray(extracted?.tasks) ? extracted.tasks : [];
  const extractedPlanText = normalizeCanvasTodoPlanText(extracted?.planText);
  if (tasks.length === 0 && !extractedPlanText) {
    return todo;
  }

  const items = Array.isArray(todo.items) ? todo.items.map((item) => normalizeCanvasTodoItem(item)) : [];
  const keyToIndex = new Map();
  items.forEach((item, index) => {
    const key = getCanvasTodoTaskKey(item.text);
    if (key && !keyToIndex.has(key)) {
      keyToIndex.set(key, index);
    }
  });

  let changed = false;
  tasks.forEach((task) => {
    const text = cleanExtractedCanvasTodoTaskText(task.text);
    const key = getCanvasTodoTaskKey(text);
    if (!key) {
      return;
    }

    const nextStatus = normalizeCanvasTodoStatus(task.status);
    if (!keyToIndex.has(key)) {
      keyToIndex.set(key, items.length);
      items.push(normalizeCanvasTodoItem({
        id: createLocalId('canvas-todo-item'),
        text,
        status: nextStatus,
        source: 'output',
        createdAt: now,
        updatedAt: now
      }));
      changed = true;
      return;
    }

    const index = keyToIndex.get(key);
    const currentItem = items[index];
    const mergedStatus = resolveCanvasTodoMergedStatus(currentItem.status, nextStatus);
    if (mergedStatus !== currentItem.status) {
      items[index] = normalizeCanvasTodoItem({
        ...currentItem,
        status: mergedStatus,
        done: mergedStatus === 'done',
        source: currentItem.source || 'output',
        updatedAt: now
      });
      changed = true;
    }
  });

  const shouldAdoptPlanText = extractedPlanText && !String(todo.planText || '').trim();
  if (!changed && !shouldAdoptPlanText) {
    return todo;
  }

  return normalizeCanvasTodo({
    ...todo,
    planText: shouldAdoptPlanText ? extractedPlanText : todo.planText,
    items,
    lastExtractedAt: now
  });
}

function getCanvasConnectionPairKey(fromId, toId) {
  return [String(fromId || '').trim(), String(toId || '').trim()].sort().join('::');
}

function normalizeCanvasConnection(connection, index = 0) {
  const fromId = String(connection?.fromId || connection?.sourceId || '').trim();
  const toId = String(connection?.toId || connection?.targetId || '').trim();
  const createdAt = Number.isFinite(connection?.createdAt) ? connection.createdAt : Date.now() + index;

  return {
    id: connection?.id || createLocalId('canvas-connection'),
    fromId,
    toId,
    createdAt
  };
}

function normalizeCanvasConnectionList(connections) {
  if (!Array.isArray(connections)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];
  connections.forEach((connection, index) => {
    const nextConnection = normalizeCanvasConnection(connection, index);
    if (!nextConnection.fromId || !nextConnection.toId || nextConnection.fromId === nextConnection.toId) {
      return;
    }

    const pairKey = getCanvasConnectionPairKey(nextConnection.fromId, nextConnection.toId);
    if (seen.has(pairKey)) {
      return;
    }

    seen.add(pairKey);
    normalized.push(nextConnection);
  });

  return normalized;
}

function normalizeCanvasConnectionMap(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(raw).map(([canvasKey, connections]) => [
      canvasKey,
      normalizeCanvasConnectionList(connections)
    ])
  );
}

function getWorkspaceCanvasConnections(workspace, canvasKey = getWorkspaceCanvasKey(workspace)) {
  return Array.isArray(workspace?.canvasConnections?.[canvasKey]) ? workspace.canvasConnections[canvasKey] : [];
}

function sameCanvasConnection(left, right) {
  return Boolean(
    left &&
    right &&
    left.id === right.id &&
    left.fromId === right.fromId &&
    left.toId === right.toId &&
    left.createdAt === right.createdAt
  );
}

function sameCanvasConnectionList(left, right) {
  if (left === right) {
    return true;
  }

  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((connection, index) => sameCanvasConnection(connection, right[index]));
}

function withWorkspaceCanvasConnections(workspace, canvasKey, connections) {
  const currentConnections = getWorkspaceCanvasConnections(workspace, canvasKey);
  const nextConnections = normalizeCanvasConnectionList(connections);

  if (sameCanvasConnectionList(currentConnections, nextConnections)) {
    return workspace;
  }

  const nextCanvasConnections = { ...(workspace.canvasConnections || {}) };
  if (nextConnections.length === 0) {
    delete nextCanvasConnections[canvasKey];
  } else {
    nextCanvasConnections[canvasKey] = nextConnections;
  }

  return {
    ...workspace,
    canvasConnections: nextCanvasConnections
  };
}

function withoutWorkspaceCanvasConnectionsForSession(workspace, sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return workspace;
  }

  const nextCanvasConnections = {};
  let changed = false;
  Object.entries(workspace.canvasConnections || {}).forEach(([canvasKey, connections]) => {
    const nextConnections = normalizeCanvasConnectionList(connections).filter((connection) => (
      connection.fromId !== normalizedSessionId && connection.toId !== normalizedSessionId
    ));
    if (nextConnections.length !== (Array.isArray(connections) ? connections.length : 0)) {
      changed = true;
    }
    if (nextConnections.length > 0) {
      nextCanvasConnections[canvasKey] = nextConnections;
    }
  });

  return changed ? { ...workspace, canvasConnections: nextCanvasConnections } : workspace;
}

function hashCanvasConnectionId(value) {
  return String(value || '').split('').reduce((hash, char) => (
    ((hash << 5) - hash + char.charCodeAt(0)) | 0
  ), 0);
}

function getCanvasConnectionTone(connection) {
  const hash = Math.abs(hashCanvasConnectionId(connection?.id || getCanvasConnectionPairKey(connection?.fromId, connection?.toId)));
  return canvasConnectionTones[hash % canvasConnectionTones.length];
}

function getPanelCanvasRect(panel, panels, endpointGroups, workspace) {
  if (!panel || !workspace) {
    return null;
  }

  if (panel.minimized) {
    const group = panel.groupId
      ? endpointGroups.find((item) => item.id === panel.groupId)
      : null;

    if (group && group.canvasKey === getWorkspaceCanvasKey(workspace)) {
      const members = panels.filter((item) => (
        item.groupId === group.id &&
        item.minimized &&
        isPanelVisibleInWorkspace(item, workspace)
      ));
      const index = Math.max(0, members.findIndex((item) => item.id === panel.id));
      return {
        x: group.x + 14,
        y: group.y + 58 + index * 42,
        width: Math.max(group.width - 28, 1),
        height: 36
      };
    }

    return {
      x: panel.x,
      y: panel.y,
      width: endpointWidth,
      height: endpointHeight
    };
  }

  return {
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height
  };
}

function getCanvasConnectionAnchors(fromRect, toRect) {
  const fromCenter = {
    x: fromRect.x + fromRect.width / 2,
    y: fromRect.y + fromRect.height / 2
  };
  const toCenter = {
    x: toRect.x + toRect.width / 2,
    y: toRect.y + toRect.height / 2
  };
  const leftToRight = fromCenter.x <= toCenter.x;

  return {
    from: {
      x: leftToRight ? fromRect.x + fromRect.width : fromRect.x,
      y: fromCenter.y
    },
    to: {
      x: leftToRight ? toRect.x : toRect.x + toRect.width,
      y: toCenter.y
    },
    direction: leftToRight ? 1 : -1
  };
}

function buildCanvasConnectionPath(fromRect, toRect) {
  const anchors = getCanvasConnectionAnchors(fromRect, toRect);
  const distance = Math.abs(anchors.to.x - anchors.from.x);
  const curve = clamp(distance * 0.48, 84, 260);
  const c1x = anchors.from.x + curve * anchors.direction;
  const c2x = anchors.to.x - curve * anchors.direction;

  return {
    ...anchors,
    midpoint: {
      x: (anchors.from.x + anchors.to.x) / 2,
      y: (anchors.from.y + anchors.to.y) / 2
    },
    path: `M ${anchors.from.x} ${anchors.from.y} C ${c1x} ${anchors.from.y}, ${c2x} ${anchors.to.y}, ${anchors.to.x} ${anchors.to.y}`
  };
}

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
}

function getPanelIdFromEventTarget(target) {
  const panelElement = closestElement(target, '[data-terminal-id]');
  return String(panelElement?.getAttribute('data-terminal-id') || '').trim();
}

function readClipboardText() {
  try {
    return bridge.readClipboardText?.() || '';
  } catch {
    return '';
  }
}

function writeClipboardText(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }

  try {
    return bridge.writeClipboardText?.(text) !== false;
  } catch {
    return false;
  }
}

function copyTerminalSelection(term, clearSelection = false) {
  const selection = term.getSelection();
  if (!selection || !writeClipboardText(selection)) {
    return false;
  }

  if (clearSelection) {
    term.clearSelection();
  }
  return true;
}

function pasteClipboardIntoTerminal(term, text = readClipboardText()) {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }

  term.paste(text);
  focusTerminalForTextInput(term);
  return true;
}

function normalizeTerminalInputPayload(value, options = {}) {
  const normalized = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) {
    return '';
  }

  const payload = normalized.replace(/\n/g, '\r');
  const input = options.bracketedPasteMode ? `\x1b[200~${payload}\x1b[201~` : payload;
  return input.endsWith('\r') ? input : `${input}\r`;
}

function trimTrailingLineBreaks(value) {
  return String(value || '').replace(/(?:\r\n|\r|\n)+$/g, '');
}

function normalizeCommandDockContextText(value, maxChars = commandDockContextTextMaxChars) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false
    };
  }

  return {
    text: text.slice(0, maxChars).trimEnd(),
    truncated: true
  };
}

function getCommandDockContextPathName(value, fallback = '') {
  const normalized = String(value || '').replace(/\\/g, '/').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.split('/').filter(Boolean).pop() || normalized || fallback;
}

function createCommandDockContextItem(kind, options = {}) {
  const normalizedContent = normalizeCommandDockContextText(
    options.content,
    Number.isFinite(options.maxChars) ? options.maxChars : commandDockContextTextMaxChars
  );
  const pathValue = String(options.path || '').trim();
  const urlValue = String(options.url || '').trim();
  const title = String(
    options.title
    || getCommandDockContextPathName(pathValue)
    || urlValue
    || ''
  ).trim();

  return {
    id: createLocalId('command-context'),
    kind: String(kind || 'text').trim() || 'text',
    title,
    subtitle: String(options.subtitle || '').trim(),
    path: pathValue,
    url: urlValue,
    content: normalizedContent.text,
    panelId: String(options.panelId || '').trim(),
    panelTitle: String(options.panelTitle || '').trim(),
    truncated: Boolean(options.truncated || normalizedContent.truncated),
    createdAt: Date.now()
  };
}

function getCommandDockContextItemKey(item) {
  const kind = String(item?.kind || 'text').trim() || 'text';
  const pathValue = String(item?.path || '').trim();
  const urlValue = String(item?.url || '').trim();

  if (pathValue) {
    return `${kind}:path:${pathValue.toLowerCase()}`;
  }
  if (urlValue) {
    return `${kind}:url:${urlValue.toLowerCase()}`;
  }

  const content = String(item?.content || '').trim();
  if (content) {
    return `${kind}:content:${content.slice(0, 300)}`;
  }

  return `${kind}:${String(item?.title || item?.id || '').trim()}`;
}

function normalizeCommandDockContextItems(items) {
  const result = [];
  const seen = new Set();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const key = getCommandDockContextItemKey(item);
    if (!key || seen.has(key)) {
      continue;
    }

    const normalized = {
      ...item,
      kind: String(item.kind || 'text').trim() || 'text',
      title: String(item.title || item.path || item.url || '').trim(),
      subtitle: String(item.subtitle || '').trim(),
      path: String(item.path || '').trim(),
      url: String(item.url || '').trim(),
      content: normalizeCommandDockContextText(item.content).text,
      panelId: String(item.panelId || '').trim(),
      panelTitle: String(item.panelTitle || '').trim(),
      truncated: Boolean(item.truncated),
      id: item.id || createLocalId('command-context')
    };

    if (!normalized.title && normalized.path) {
      normalized.title = getCommandDockContextPathName(normalized.path);
    }
    if (!normalized.title && normalized.url) {
      normalized.title = normalized.url;
    }
    if (!normalized.title && !normalized.content) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
    if (result.length >= commandDockContextMaxItems) {
      break;
    }
  }

  return result;
}

function getCommandDockContextPromptKind(item) {
  switch (item?.kind) {
    case 'file':
      return 'File';
    case 'image':
      return 'Image';
    case 'url':
      return 'URL';
    case 'terminal-selection':
      return 'Terminal selection';
    case 'terminal-output':
      return 'Terminal output';
    default:
      return 'Selected text';
  }
}

function getCommandDockContextPromptTitle(item) {
  return String(
    item?.title
    || item?.path
    || item?.url
    || item?.panelTitle
    || getCommandDockContextPromptKind(item)
  ).trim();
}

function getMarkdownFenceForContent(content) {
  let fence = '```';
  const text = String(content || '');
  while (text.includes(fence)) {
    fence += '`';
  }
  return fence;
}

function serializeCommandDockContextItem(item, index) {
  const title = getCommandDockContextPromptTitle(item);
  const lines = [`### ${index + 1}. ${getCommandDockContextPromptKind(item)}: ${title}`];

  if (item.path) {
    lines.push(`Path: ${item.kind === 'file' ? `@${normalizePromptFilePath(item.path)}` : normalizePromptFilePath(item.path)}`);
  }
  if (item.url) {
    lines.push(`URL: ${item.url}`);
  }
  if (item.panelTitle) {
    lines.push(`Session: ${item.panelTitle}`);
  }
  if (item.subtitle) {
    lines.push(`Note: ${item.subtitle}`);
  }
  if (item.truncated) {
    lines.push('Note: content was truncated before sending.');
  }

  const content = String(item.content || '').trimEnd();
  if (item.kind === 'image') {
    lines.push('', 'Image file path is included above. Use the local file if your CLI can read images.');
    return lines.join('\n');
  }

  if (content) {
    const fence = getMarkdownFenceForContent(content);
    lines.push('', `${fence}text`, content, fence);
  }

  return lines.join('\n');
}

function buildCommandDockContextPayload(message, contextItems) {
  const prompt = trimTrailingLineBreaks(message);
  const items = normalizeCommandDockContextItems(contextItems);
  if (items.length === 0) {
    return prompt;
  }

  const lines = [];
  if (String(prompt || '').trim()) {
    lines.push(prompt.trimEnd(), '');
  }

  lines.push('## Context Package');
  lines.push('Use the following context together with the request above.');
  items.forEach((item, index) => {
    lines.push('', serializeCommandDockContextItem(item, index));
  });

  return lines.join('\n').trim();
}

function formatCommandDockContextHistoryEntry(message, contextItems) {
  const prompt = String(message || '').trim();
  const items = normalizeCommandDockContextItems(contextItems);
  if (items.length === 0) {
    return prompt;
  }

  const summary = items
    .slice(0, 4)
    .map((item) => getCommandDockContextPromptTitle(item))
    .join(', ');
  const suffix = items.length > 4 ? ` +${items.length - 4}` : '';
  return prompt ? `${prompt}\n[Context: ${summary}${suffix}]` : `[Context: ${summary}${suffix}]`;
}

function isCommandDockSubmitKey(event) {
  return event.key === 'Enter'
    || event.code === 'Enter'
    || event.nativeEvent?.key === 'Enter'
    || event.nativeEvent?.code === 'Enter'
    || event.keyCode === 13
    || event.which === 13;
}

function isCommandDockShortcutMatch(event, shortcut) {
  if (!isCommandDockSubmitKey(event)) {
    return false;
  }

  const option = commandDockShortcutOptions.find((item) => (
    item.id === normalizeCommandDockShortcut(shortcut)
  ));
  if (!option) {
    return false;
  }

  return Boolean(event?.ctrlKey) === option.ctrlKey
    && Boolean(event?.shiftKey) === option.shiftKey
    && Boolean(event?.altKey) === option.altKey
    && Boolean(event?.metaKey) === option.metaKey;
}

function normalizePromptFilePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function createClosedCommandDockSkillMention() {
  return {
    open: false,
    query: '',
    triggerIndex: -1,
    caretIndex: 0,
    selectedIndex: 0,
    position: { left: 12, bottom: 12 }
  };
}

function getCommandDockSkillMentionTrigger(value, caretIndex) {
  const text = String(value || '');
  const index = clamp(Number.isFinite(caretIndex) ? caretIndex : text.length, 0, text.length);
  const beforeCaret = text.slice(0, index);
  const triggerIndex = beforeCaret.lastIndexOf('@');

  if (triggerIndex < 0) {
    return null;
  }

  const query = beforeCaret.slice(triggerIndex + 1);
  if (/[\s@]/.test(query)) {
    return null;
  }

  return {
    query,
    triggerIndex
  };
}

function getTextareaCaretPopupPosition(textarea, caretIndex) {
  if (!(textarea instanceof HTMLTextAreaElement)) {
    return { left: 12, top: 12 };
  }

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const mirroredProperties = [
    'boxSizing',
    'width',
    'height',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'letterSpacing',
    'lineHeight',
    'textAlign',
    'textIndent',
    'textTransform',
    'tabSize'
  ];

  mirroredProperties.forEach((property) => {
    mirror.style[property] = style[property];
  });

  mirror.style.position = 'absolute';
  mirror.style.left = '-9999px';
  mirror.style.top = '0';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflow = 'hidden';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.wordBreak = style.wordBreak;
  mirror.textContent = textarea.value.slice(0, clamp(caretIndex, 0, textarea.value.length));
  marker.textContent = '\u200b';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const menuWidth = Math.min(
    commandDockSkillMentionMenuWidth,
    Math.max(180, textarea.clientWidth - 16)
  );
  const left = clamp(
    marker.offsetLeft - textarea.scrollLeft,
    8,
    Math.max(8, textarea.clientWidth - menuWidth - 8)
  );
  const caretTop = marker.offsetTop - textarea.scrollTop;
  const bottom = clamp(
    textarea.clientHeight - caretTop + 6,
    8,
    Math.max(8, textarea.clientHeight - 8)
  );
  const menuBottomY = textarea.getBoundingClientRect().top + caretTop - 6;
  const maxHeight = Math.min(
    commandDockSkillMentionMenuMaxHeight,
    Math.max(72, Math.floor(menuBottomY - 12))
  );

  document.body.removeChild(mirror);
  return { left, bottom, maxHeight };
}

function normalizeSkillMentionSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function getWorkspaceSkillMentionItems(snapshot) {
  const scopes = Array.isArray(snapshot?.scopes) ? snapshot.scopes : [];
  const items = [];

  scopes.forEach((scope) => {
    const directoryName = String(scope?.directoryName || '').trim();
    const scopeLabel = String(scope?.label || directoryName || '').trim();
    const scopePath = String(scope?.path || '').trim();
    const files = Array.isArray(scope?.files) ? scope.files : [];

    if (scope?.exists && directoryName && scopePath) {
      const insertPath = normalizePromptFilePath(`${directoryName}/`);
      const title = insertPath;
      const subtitle = scopeLabel;
      items.push({
        id: `directory:${scope.id || directoryName}`,
        kind: 'directory',
        label: title,
        subtitle,
        title: scopePath,
        insertPath,
        searchText: normalizeSkillMentionSearchText([
          title,
          subtitle,
          scopePath
        ].join(' '))
      });
    }

    files.forEach((file) => {
      const relativePath = String(file?.relativePath || file?.name || '').trim();
      const filePath = String(file?.path || '').trim();
      const insertPath = normalizePromptFilePath(
        relativePath && directoryName ? `${directoryName}/${relativePath}` : (relativePath || filePath)
      );

      if (!insertPath) {
        return;
      }

      const label = String(file?.name || relativePath || insertPath).trim();
      const subtitle = insertPath;
      items.push({
        id: `file:${scope.id || directoryName}:${relativePath || filePath || label}`,
        kind: 'file',
        label,
        subtitle,
        title: filePath || insertPath,
        insertPath,
        searchText: normalizeSkillMentionSearchText([
          label,
          subtitle,
          scopeLabel,
          filePath
        ].join(' '))
      });
    });
  });

  return items;
}

function filterWorkspaceSkillMentionItems(items, query) {
  const normalizedQuery = normalizeSkillMentionSearchText(query);
  const sourceItems = Array.isArray(items) ? items : [];

  if (!normalizedQuery) {
    return sourceItems.slice(0, commandDockSkillMentionMaxItems);
  }

  return sourceItems
    .filter((item) => item.searchText.includes(normalizedQuery))
    .slice(0, commandDockSkillMentionMaxItems);
}

function deriveSkillDirectoryFromPath(filePath) {
  const normalizedPath = normalizePromptFilePath(filePath).replace(/\/+$/g, '');
  if (!normalizedPath) {
    return '';
  }

  const slashIndex = normalizedPath.lastIndexOf('/');
  return slashIndex > 0 ? normalizedPath.slice(0, slashIndex) : '';
}

function getAgentSkillReferenceDirectoryPath(skill) {
  const directoryPath = normalizePromptFilePath(skill?.directoryPath || '').replace(/\/+$/g, '');
  if (directoryPath) {
    return directoryPath;
  }

  return deriveSkillDirectoryFromPath(skill?.path);
}

function getAgentSkillReferenceKey(skill) {
  return normalizePromptFilePath(
    getAgentSkillReferenceDirectoryPath(skill)
    || skill?.path
    || skill?.id
    || skill?.slashName
    || skill?.name
    || ''
  ).trim().toLowerCase();
}

function normalizeAgentSkillReference(skill) {
  if (!skill || typeof skill !== 'object') {
    return null;
  }

  const directoryPath = getAgentSkillReferenceDirectoryPath(skill);
  const pathValue = normalizePromptFilePath(skill.path || (directoryPath ? `${directoryPath}/SKILL.md` : ''));
  if (!directoryPath && !pathValue) {
    return null;
  }

  const slashName = String(skill.slashName || skill.name || '').trim().replace(/^\//, '');
  const name = String(skill.name || slashName || directoryPath.split('/').filter(Boolean).pop() || '').trim();

  return {
    id: String(skill.id || directoryPath || pathValue || slashName).trim(),
    name,
    slashName,
    description: String(skill.description || '').trim(),
    path: pathValue,
    directoryPath,
    relativePath: normalizePromptFilePath(skill.relativePath || ''),
    directoryRelativePath: normalizePromptFilePath(skill.directoryRelativePath || ''),
    sourceDirectoryName: String(skill.sourceDirectoryName || '').trim(),
    sourceId: String(skill.sourceId || '').trim(),
    sourceScope: String(skill.sourceScope || '').trim()
  };
}

function normalizeAgentSkillReferences(skills) {
  const result = [];
  const seen = new Set();

  (Array.isArray(skills) ? skills : []).forEach((skill) => {
    const normalized = normalizeAgentSkillReference(skill);
    const key = getAgentSkillReferenceKey(normalized);
    if (!normalized || !key || seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(normalized);
  });

  return result;
}

function mergeAgentSkillReferences(...skillGroups) {
  return normalizeAgentSkillReferences(skillGroups.flatMap((group) => (Array.isArray(group) ? group : [])));
}

function areAgentSkillReferencesEqual(left, right) {
  const leftKeys = normalizeAgentSkillReferences(left)
    .map(getAgentSkillReferenceKey)
    .filter(Boolean)
    .sort();
  const rightKeys = normalizeAgentSkillReferences(right)
    .map(getAgentSkillReferenceKey)
    .filter(Boolean)
    .sort();

  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

function getWorkspaceAgentSkillOptions(snapshot) {
  const scopes = Array.isArray(snapshot?.scopes) ? snapshot.scopes : [];
  return normalizeAgentSkillReferences(scopes.flatMap((scope) => (
    Array.isArray(scope?.skills) ? scope.skills : []
  )));
}

function isImageFile(file) {
  if (!file) {
    return false;
  }

  const mimeType = String(file.type || '').trim().toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  return /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(String(file.name || '').trim());
}

function extractImageFilesFromDataTransfer(dataTransfer) {
  if (!dataTransfer) {
    return [];
  }

  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item?.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file) => file && isImageFile(file));
  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(dataTransfer.files || []).filter((file) => isImageFile(file));
}

function hasImageFilesInDataTransfer(dataTransfer) {
  return extractImageFilesFromDataTransfer(dataTransfer).length > 0;
}

function syncTerminalImeAnchor(term) {
  const textarea = term?.textarea;
  const root = term?.element;
  if (!textarea || !root) {
    return;
  }

  const buffer = term.buffer.active;
  const screenElement = root.querySelector('.xterm-screen');
  if (!(screenElement instanceof HTMLElement)) {
    return;
  }

  const absoluteCursorY = buffer.baseY + buffer.cursorY;
  const viewportTop = buffer.viewportY;
  if (absoluteCursorY < viewportTop || absoluteCursorY >= viewportTop + term.rows) {
    return;
  }

  const cols = Math.max(term.cols || 0, 1);
  const rows = Math.max(term.rows || 0, 1);
  const cellWidth = screenElement.clientWidth / cols;
  const cellHeight = screenElement.clientHeight / rows;
  if (!Number.isFinite(cellWidth) || !Number.isFinite(cellHeight) || cellWidth <= 0 || cellHeight <= 0) {
    return;
  }

  const cursorX = Math.min(Math.max(buffer.cursorX, 0), cols - 1);
  const line = buffer.getLine(absoluteCursorY);
  const width = Math.max(line?.getCell(cursorX, buffer.getNullCell())?.getWidth() || 1, 1);
  const cursorTop = (absoluteCursorY - viewportTop) * cellHeight;
  const cursorLeft = cursorX * cellWidth;

  textarea.style.left = `${cursorLeft}px`;
  textarea.style.top = `${cursorTop}px`;
  textarea.style.width = `${Math.max(cellWidth * width, 1)}px`;
  textarea.style.height = `${Math.max(cellHeight, 1)}px`;
  textarea.style.lineHeight = `${Math.max(cellHeight, 1)}px`;
  textarea.style.zIndex = '-5';
}

function normalizeTerminalCanvasScale(scale) {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function normalizeTerminalMouseEventForScale(event, element, scale) {
  const normalizedScale = normalizeTerminalCanvasScale(scale);
  if (!event || !(element instanceof HTMLElement) || Math.abs(normalizedScale - 1) < 0.001) {
    return event;
  }

  const rect = element.getBoundingClientRect();
  return {
    clientX: rect.left + ((event.clientX ?? rect.left) - rect.left) / normalizedScale,
    clientY: rect.top + ((event.clientY ?? rect.top) - rect.top) / normalizedScale
  };
}

function patchTerminalMouseInteractionsForScale(term, getScale) {
  const core = term?._core;
  const mouseService = core?._mouseService;
  const selectionService = core?._selectionService;

  if (!mouseService) {
    return () => {};
  }

  const originalGetCoords = typeof mouseService.getCoords === 'function'
    ? mouseService.getCoords.bind(mouseService)
    : null;
  const originalGetMouseReportCoords = typeof mouseService.getMouseReportCoords === 'function'
    ? mouseService.getMouseReportCoords.bind(mouseService)
    : null;
  const originalGetMouseEventScrollAmount = typeof selectionService?._getMouseEventScrollAmount === 'function'
    ? selectionService._getMouseEventScrollAmount.bind(selectionService)
    : null;

  if (originalGetCoords) {
    mouseService.getCoords = (event, element, colCount, rowCount, isSelection) => (
      originalGetCoords(
        normalizeTerminalMouseEventForScale(event, element, getScale?.()),
        element,
        colCount,
        rowCount,
        isSelection
      )
    );
  }

  if (originalGetMouseReportCoords) {
    mouseService.getMouseReportCoords = (event, element) => (
      originalGetMouseReportCoords(
        normalizeTerminalMouseEventForScale(event, element, getScale?.()),
        element
      )
    );
  }

  if (originalGetMouseEventScrollAmount) {
    selectionService._getMouseEventScrollAmount = (event) => (
      originalGetMouseEventScrollAmount(
        normalizeTerminalMouseEventForScale(
          event,
          selectionService?._screenElement || term?.element?.querySelector?.('.xterm-screen'),
          getScale?.()
        )
      )
    );
  }

  return () => {
    if (originalGetCoords) {
      mouseService.getCoords = originalGetCoords;
    }
    if (originalGetMouseReportCoords) {
      mouseService.getMouseReportCoords = originalGetMouseReportCoords;
    }
    if (originalGetMouseEventScrollAmount && selectionService) {
      selectionService._getMouseEventScrollAmount = originalGetMouseEventScrollAmount;
    }
  };
}

function focusTerminalForTextInput(term) {
  if (!term) {
    return;
  }

  term.focus();
  window.requestAnimationFrame(() => syncTerminalImeAnchor(term));
}

function normalizeVersionText(value) {
  return String(value || '').trim().replace(/^v/i, '');
}

function formatVersionLabel(value) {
  const normalized = normalizeVersionText(value);
  return normalized ? `v${normalized}` : '--';
}

function normalizeVersionStatus(raw, currentVersion) {
  const fallbackVersion = normalizeVersionText(currentVersion);
  const latestVersion = normalizeVersionText(raw?.latestVersion);

  return {
    checkedAt: Number.isFinite(raw?.checkedAt) ? raw.checkedAt : 0,
    comparison: Number.isFinite(raw?.comparison) ? raw.comparison : 0,
    currentVersion: normalizeVersionText(raw?.currentVersion) || fallbackVersion,
    error: String(raw?.error || '').trim(),
    found: Boolean(raw?.found && latestVersion),
    isOutdated: Boolean(raw?.isOutdated),
    latestDate: String(raw?.latestDate || '').trim(),
    latestTagName: String(raw?.latestTagName || '').trim(),
    latestTitle: String(raw?.latestTitle || '').trim(),
    latestUrl: String(raw?.latestUrl || releasePageUrl).trim() || releasePageUrl,
    latestVersion,
    source: raw?.source || 'github'
  };
}

function getVersionStatusKind(versionState) {
  if (versionState.status === 'loading') {
    return 'checking';
  }

  const status = versionState.data;
  if (versionState.status === 'error' || status?.error) {
    return 'error';
  }

  if (versionState.status === 'ready' && status?.found) {
    if (status.isOutdated) {
      return 'outdated';
    }

    return 'current';
  }

  return 'unknown';
}

function getVersionStatusTip(versionState, versionLabel, t) {
  const status = versionState.data;
  const currentVersion = formatVersionLabel(status?.currentVersion || versionLabel);
  const latestVersion = formatVersionLabel(status?.latestVersion);

  if (versionState.status === 'loading') {
    return t('versionCheckCheckingTip');
  }

  if (versionState.status === 'error' || status?.error) {
    return t('versionCheckFailedTip', { message: status?.error || t('versionCheckUnknownTip') });
  }

  if (versionState.status === 'ready' && status?.found) {
    if (status.isOutdated) {
      return t('versionCheckOutdatedTip', { current: currentVersion, latest: latestVersion });
    }

    if (status.comparison > 0) {
      return t('versionCheckAheadTip', { current: currentVersion, latest: latestVersion });
    }

    return t('versionCheckCurrentTip', { version: currentVersion });
  }

  return versionState.status === 'idle' ? t('versionCheckPendingTip') : t('versionCheckUnknownTip');
}

function formatVersionStatusMessage(versionState, appVersion, t) {
  const status = versionState.data;
  const currentVersion = formatVersionLabel(status?.currentVersion || appVersion);
  const latestVersion = formatVersionLabel(status?.latestVersion);

  if (versionState.status === 'loading') {
    return t('versionCheckChecking');
  }

  if (versionState.status === 'error' || status?.error) {
    return t('versionCheckFailed', { message: status?.error || t('versionCheckUnknownTip') });
  }

  if (versionState.status === 'ready' && status?.found) {
    if (status.isOutdated) {
      return t('versionCheckOutdated', { current: currentVersion, latest: latestVersion });
    }

    if (status.comparison > 0) {
      return t('versionCheckAhead', { current: currentVersion, latest: latestVersion });
    }

    return t('versionCheckCurrent', { version: currentVersion });
  }

  return t('versionCheckUnavailable');
}

function isPanelLive(panel) {
  return panel?.status === 'running' || panel?.status === 'starting';
}

function canPanelReceiveInput(panel) {
  return isPanelLive(panel);
}

function getPanelLastActivityAt(panel) {
  if (Number.isFinite(panel?.lastActivityAt)) {
    return panel.lastActivityAt;
  }

  return Number.isFinite(panel?.createdAt) ? panel.createdAt : 0;
}

function getPanelExecutionState(panel, now = Date.now()) {
  if (isPanelLive(panel)) {
    return now - getPanelLastActivityAt(panel) >= panelIdleThresholdMs
      ? 'idle'
      : 'running';
  }

  if (
    panel?.status === 'completed' ||
    (panel?.status === 'exit' && panel?.exitCode === 0 && !panel?.signal)
  ) {
    return 'completed';
  }

  return 'error';
}

function getExecutionStateLabel(state, t) {
  if (state === 'running') {
    return t('taskRunning');
  }

  if (state === 'idle') {
    return t('taskIdle');
  }

  if (state === 'completed') {
    return t('taskCompleted');
  }

  return t('taskError');
}

function getSessionTagPreset(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return sessionTagPresets.find((tag) => (
    tag.id === normalized ||
    tag.aliases.some((alias) => alias.toLowerCase() === normalized)
  )) || null;
}

function normalizeSessionTag(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const preset = getSessionTagPreset(normalized);
  if (preset) {
    return preset.id;
  }

  return normalized.slice(0, sessionTagMaxLength);
}

function getPanelSessionTag(panel) {
  return normalizeSessionTag(panel?.tag);
}

function getSessionTagLabel(value, t) {
  const tag = normalizeSessionTag(value);
  if (!tag) {
    return t('sessionTagNone');
  }

  const preset = getSessionTagPreset(tag);
  return preset ? t(preset.labelKey) : tag;
}

function getSessionTagTone(value) {
  const tag = normalizeSessionTag(value);
  if (!tag) {
    return 'none';
  }

  const preset = getSessionTagPreset(tag);
  return preset ? preset.id : 'custom';
}

function getSessionTagOrder(value) {
  const tag = normalizeSessionTag(value);
  if (!tag) {
    return sessionTagPresets.length + 1000;
  }

  const presetIndex = sessionTagPresets.findIndex((preset) => preset.id === tag);
  return presetIndex >= 0 ? presetIndex : sessionTagPresets.length + 100;
}

function getAvailableSessionTags(panels) {
  const seen = new Set();
  const customTags = [];

  (Array.isArray(panels) ? panels : []).forEach((panel) => {
    const tag = getPanelSessionTag(panel);
    if (!tag || sessionTagPresetIds.has(tag) || seen.has(tag)) {
      return;
    }

    seen.add(tag);
    customTags.push(tag);
  });

  return customTags.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function isCodexPanel(panel) {
  return getPanelCliProvider(panel)?.id === 'codex';
}

function hasPanelModelTag(panel) {
  const providerId = getPanelCliProvider(panel)?.id;
  return providerId === 'codex' || providerId === 'claude-code';
}

function getPanelQuickModelOptions(panel) {
  const providerId = getPanelCliProvider(panel)?.id;
  if (providerId === 'claude-code') {
    return quickClaudeModelOptions;
  }

  if (providerId === 'codex') {
    return quickModelOptions;
  }

  return [];
}

function getPanelModelSwitchCommand(panel, model) {
  const providerId = getPanelCliProvider(panel)?.id;
  const normalizedModel = String(model || '').trim();
  if (!normalizedModel) {
    return '';
  }

  if (providerId === 'codex' || providerId === 'claude-code') {
    return `/model ${normalizedModel}\r`;
  }

  return '';
}

function hasPanelContextTag(panel) {
  return String(panel?.contextWindowLabel || '').trim().length > 0;
}

function getSessionHeaderGridClass(panel) {
  const hasModel = hasPanelModelTag(panel);
  const hasContext = hasPanelContextTag(panel);

  if (hasModel && hasContext) {
    return 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_auto_auto_auto_28px_28px_28px]';
  }

  if (hasModel || hasContext) {
    return 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_auto_auto_28px_28px_28px]';
  }

  return 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_auto_28px_28px_28px]';
}

function getPanelFallbackTitle(panel, language) {
  return getCliProviderTitleBase(getPanelCliProvider(panel), language);
}

function SessionStatusTag({ count, panel, state, t }) {
  const executionState = state || getPanelExecutionState(panel);
  const label = getExecutionStateLabel(executionState, t);

  return (
    <span className={cn('session-status-tag', `is-${executionState}`)}>
      {count ? `${label} ${count}` : label}
    </span>
  );
}

function getSessionRuntimeElapsed(panel, now) {
  const startedAt = Number.isFinite(panel?.createdAt) ? panel.createdAt : now;
  const endedAt = isPanelLive(panel)
    ? now
    : Number.isFinite(panel?.endedAt) ? panel.endedAt : now;
  return formatElapsedDuration(startedAt, endedAt);
}

function useLiveNow(active, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      setNow(Date.now());
      return undefined;
    }

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);

  return now;
}

function SessionRuntimeTag({ panel, now, t }) {
  const live = isPanelLive(panel);
  const liveNow = useLiveNow(live);
  const elapsed = getSessionRuntimeElapsed(
    panel,
    live ? liveNow : (Number.isFinite(now) ? now : Date.now())
  );

  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center rounded-full border border-border bg-background px-2 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground"
      title={`${t('sessionRuntime')} ${elapsed}`}
    >
      {t('sessionRuntime')} {elapsed}
    </span>
  );
}

function formatSessionStatusQueueTime(timestamp, language) {
  if (!Number.isFinite(timestamp)) {
    return '--:--:--';
  }

  return new Date(timestamp).toLocaleTimeString(language === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function CanvasSessionStatusQueue({
  activeId,
  className,
  commandTargetId,
  language,
  onFocusSession,
  onRefresh,
  panels,
  refreshStamp,
  t
}) {
  const queuePanels = Array.isArray(panels) ? panels : [];
  const hasLivePanels = queuePanels.some((panel) => isPanelLive(panel));
  const liveNow = useLiveNow(hasLivePanels, 1000);
  const statusNow = hasLivePanels
    ? liveNow
    : Number.isFinite(refreshStamp) ? refreshStamp : Date.now();

  if (queuePanels.length === 0) {
    return null;
  }

  const statusCounts = queuePanels.reduce((counts, panel) => {
    const state = getPanelExecutionState(panel, statusNow);
    return {
      ...counts,
      [state]: (counts[state] || 0) + 1
    };
  }, { running: 0, idle: 0, completed: 0, error: 0 });
  const refreshTime = formatSessionStatusQueueTime(statusNow, language);

  return (
    <div
      className={cn('canvas-session-status-queue', className)}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="canvas-session-status-header">
        <div className="canvas-session-status-title">
          <SquareTerminal className="h-4 w-4 text-primary" />
          <span>{t('canvasSessionStatusQueue')}</span>
          <Badge variant="outline" className="canvas-session-status-count">
            {queuePanels.length}
          </Badge>
        </div>
        <IconButton
          label={t('canvasSessionStatusRefresh')}
          variant="ghost"
          className="h-7 w-7"
          onClick={onRefresh}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <div className="canvas-session-status-summary" title={t('canvasSessionStatusUpdatedAt', { time: refreshTime })}>
        {statusCounts.running > 0 && <SessionStatusTag count={statusCounts.running} state="running" t={t} />}
        {statusCounts.idle > 0 && <SessionStatusTag count={statusCounts.idle} state="idle" t={t} />}
        {statusCounts.completed > 0 && <SessionStatusTag count={statusCounts.completed} state="completed" t={t} />}
        {statusCounts.error > 0 && <SessionStatusTag count={statusCounts.error} state="error" t={t} />}
        <span className="canvas-session-status-updated">
          {t('canvasSessionStatusUpdatedAt', { time: refreshTime })}
        </span>
      </div>

      <div className="canvas-session-status-list">
        {queuePanels.map((panel) => {
          const provider = getPanelCliProvider(panel);
          const state = getPanelExecutionState(panel, statusNow);
          const title = panel.title || getPanelFallbackTitle(panel, language);
          const runtime = getSessionRuntimeElapsed(panel, statusNow);
          const pathLabel = panel.cwd || t('defaultDirectory');
          const commandTargeted = panel.id === commandTargetId;

          return (
            <button
              key={panel.id}
              type="button"
              className={cn(
                'canvas-session-status-row',
                activeId === panel.id && 'is-active',
                commandTargeted && 'is-command-target',
                panel.minimized && 'is-minimized'
              )}
              title={`${t('canvasSessionStatusFocus')}: ${title}\n${pathLabel}`}
              onClick={() => onFocusSession?.(panel.id)}
            >
              <span className={cn('terminal-endpoint-dot', `is-${state}`)} aria-hidden="true" />
              <span className="canvas-session-status-copy">
                <span className="canvas-session-status-name-row">
                  <span className="canvas-session-status-name">{title}</span>
                  {panel.minimized && (
                    <span className="canvas-session-status-mini-badge">{t('canvasSessionStatusEndpoint')}</span>
                  )}
                  {commandTargeted && (
                    <span className="canvas-session-status-mini-badge is-target">
                      {t('floatingComposerCurrent')}
                    </span>
                  )}
                </span>
                <span className="canvas-session-status-meta">
                  <CliProviderBadge
                    className="canvas-session-status-provider"
                    language={language}
                    provider={provider}
                  />
                  <span className="canvas-session-status-path">{pathLabel}</span>
                </span>
              </span>
              <span className="canvas-session-status-side">
                <SessionStatusTag state={state} t={t} />
                <span className="canvas-session-status-runtime" title={`${t('sessionRuntime')} ${runtime}`}>
                  {runtime}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatPanelModelLabel(panel, t) {
  const model = String(panel?.codexModel || '').trim();
  return model || t('defaultValue');
}

function SessionModelTag({ panel, t }) {
  if (!hasPanelModelTag(panel)) {
    return null;
  }

  const label = formatPanelModelLabel(panel, t);
  const provider = String(panel?.codexProviderName || '').trim();
  const title = [provider, label].filter(Boolean).join(' / ');

  return (
    <span
      className="inline-flex h-[22px] min-w-0 max-w-[200px] shrink items-center gap-1 rounded-full border border-border bg-background px-2 text-[11px] font-semibold text-foreground"
      title={`${t('model')} ${title}`}
    >
      <span className="shrink-0 text-muted-foreground">{t('model')}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono">{label}</span>
    </span>
  );
}

function SessionContextTag({ panel, t }) {
  const label = String(panel?.contextWindowLabel || '').trim();
  if (!label) {
    return null;
  }

  const exactCount = Number.isFinite(panel?.contextWindowTokens)
    ? ` (${Number(panel.contextWindowTokens).toLocaleString()})`
    : '';

  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2 text-[11px] font-semibold text-foreground"
      title={`${t('sessionContext')} ${label}${exactCount}`}
    >
      <span className="shrink-0 text-muted-foreground">{t('sessionContext')}</span>
      <span className="font-mono">{label}</span>
    </span>
  );
}

function SessionHeaderMetaMenu({
  availableTags,
  onTagChange,
  panel,
  runtimeNow,
  sessionTag,
  t
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const modelAvailable = hasPanelModelTag(panel);
  const contextAvailable = hasPanelContextTag(panel);
  const state = getPanelExecutionState(panel);
  const stateLabel = getExecutionStateLabel(state, t);
  const liveRuntimeNow = useLiveNow(open && isPanelLive(panel));
  const runtime = getSessionRuntimeElapsed(
    panel,
    isPanelLive(panel) ? liveRuntimeNow : runtimeNow
  );
  const contextLabel = String(panel?.contextWindowLabel || '').trim();
  const exactContextCount = Number.isFinite(panel?.contextWindowTokens)
    ? Number(panel.contextWindowTokens).toLocaleString()
    : '';
  const modelLabel = modelAvailable ? formatPanelModelLabel(panel, t) : '';
  const modelProvider = String(panel?.codexProviderName || '').trim();

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') {
      return;
    }

    const width = 276;
    const estimatedHeight = 272;
    const gap = 6;
    const left = Math.min(
      Math.max(8, rect.right - width),
      Math.max(8, window.innerWidth - width - 8)
    );
    const belowTop = rect.bottom + gap;
    const top = belowTop + estimatedHeight > window.innerHeight
      ? Math.max(8, rect.top - estimatedHeight - gap)
      : belowTop;

    setPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    updatePosition();
    const closeOnPointerDown = (event) => {
      if (
        rootRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }

      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const menu = open ? createPortal(
    <div
      ref={menuRef}
      className="session-header-meta-menu"
      role="menu"
      aria-label={t('sessionHeaderMore')}
      style={{ left: position.left, top: position.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="session-header-meta-menu-title">{t('sessionHeaderMore')}</div>
      <div className="session-header-meta-row">
        <span className="session-header-meta-label">{t('sessionTag')}</span>
        <SessionTagControl
          availableTags={availableTags}
          className="session-header-meta-tag"
          value={sessionTag}
          t={t}
          onChange={(nextTag) => onTagChange?.(panel.id, nextTag)}
        />
      </div>
      {modelAvailable && (
        <div className="session-header-meta-row">
          <span className="session-header-meta-label">{t('model')}</span>
          <span className="session-header-meta-value" title={[modelProvider, modelLabel].filter(Boolean).join(' / ')}>
            {modelProvider ? `${modelProvider} / ${modelLabel}` : modelLabel}
          </span>
        </div>
      )}
      {contextAvailable && (
        <div className="session-header-meta-row">
          <span className="session-header-meta-label">{t('sessionContext')}</span>
          <span className="session-header-meta-value" title={exactContextCount || contextLabel}>
            {contextLabel}{exactContextCount ? ` (${exactContextCount})` : ''}
          </span>
        </div>
      )}
      <div className="session-header-meta-row">
        <span className="session-header-meta-label">{t('sessionHeaderShowStatus')}</span>
        <SessionStatusTag panel={panel} state={state} t={t} />
      </div>
      <div className="session-header-meta-row">
        <span className="session-header-meta-label">{t('sessionRuntime')}</span>
        <span className="session-header-meta-value is-mono">{runtime}</span>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={rootRef} className="session-header-meta-root">
      <Button
        ref={buttonRef}
        type="button"
        variant={open ? 'primary' : 'outline'}
        size="icon"
        className="h-6 w-6"
        title={t('sessionHeaderMore')}
        aria-label={t('sessionHeaderMore')}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </Button>
      {menu}
    </div>
  );
}

function SessionTagBadge({ className, tag, t }) {
  const normalizedTag = normalizeSessionTag(tag);
  if (!normalizedTag) {
    return null;
  }

  const label = getSessionTagLabel(normalizedTag, t);

  return (
    <span
      className={cn('session-tag-badge', `is-${getSessionTagTone(normalizedTag)}`, className)}
      title={`${t('sessionTag')} ${label}`}
    >
      <Tags className="h-3 w-3" />
      <span>{label}</span>
    </span>
  );
}

function SessionTagControl({
  availableTags = [],
  className,
  onChange,
  t,
  value
}) {
  const normalizedTag = normalizeSessionTag(value);
  const preset = getSessionTagPreset(normalizedTag);
  const customTags = (Array.isArray(availableTags) ? availableTags : [])
    .map((tag) => normalizeSessionTag(tag))
    .filter((tag, index, tags) => (
      tag &&
      !sessionTagPresetIds.has(tag) &&
      tags.indexOf(tag) === index
    ))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  const customOptions = normalizedTag && !preset && !customTags.includes(normalizedTag)
    ? [normalizedTag, ...customTags]
    : customTags;

  const handleChange = (nextValue) => {
    if (nextValue === sessionTagNoneValue) {
      onChange?.('');
      return;
    }

    if (nextValue === sessionTagCustomValue) {
      const draft = window.prompt(
        t('sessionTagCustomPrompt'),
        normalizedTag && !preset ? normalizedTag : ''
      );
      if (draft === null) {
        return;
      }

      const nextTag = normalizeSessionTag(draft);
      if (nextTag) {
        onChange?.(nextTag);
      }
      return;
    }

    onChange?.(nextValue);
  };

  return (
    <Select
      ariaLabel={t('sessionTag')}
      className={cn('session-tag-select', `is-${getSessionTagTone(normalizedTag)}`, className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onValueChange={handleChange}
      options={[
        { value: sessionTagNoneValue, label: t('sessionTagNone') },
        ...sessionTagPresets.map((tag) => ({
          value: tag.id,
          label: t(tag.labelKey)
        })),
        ...customOptions.map((tag) => ({
          value: tag,
          label: tag
        })),
        { value: sessionTagCustomValue, label: t('sessionTagCustom') }
      ]}
      popupClassName="min-w-[11rem]"
      title={normalizedTag
        ? `${t('sessionTag')} ${getSessionTagLabel(normalizedTag, t)}`
        : t('sessionTagNone')}
      value={normalizedTag || sessionTagNoneValue}
    />
  );
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return {
      cwd: saved.cwd || '',
      theme: saved.theme === 'light' ? 'light' : 'dark',
      language: saved.language === 'en' ? 'en' : 'zh',
      view: normalizeCanvasView(saved.view),
      appZoomFactor: normalizeAppZoomFactor(saved.appZoomFactor),
      sessionHeaderVisibility: normalizeLoadedSessionHeaderVisibility(saved.sessionHeaderVisibility),
      commandDockDispatchMode: normalizeCommandDockDispatchMode(saved.commandDockDispatchMode),
      commandDockShortcuts: normalizeCommandDockShortcutSettings(saved.commandDockShortcuts),
      commandDockPosition: normalizeCommandDockPosition(saved.commandDockPosition),
      commandDockHistory: normalizeCommandDockHistory(saved.commandDockHistory)
    };
  } catch {
    localStorage.removeItem(settingsKey);
    return {
      cwd: '',
      theme: 'dark',
      language: 'zh',
      view: createDefaultView(),
      appZoomFactor: appZoomDefaultFactor,
      sessionHeaderVisibility: normalizeSessionHeaderVisibility(),
      commandDockDispatchMode: 'reuse',
      commandDockShortcuts: normalizeCommandDockShortcutSettings(commandDockDefaultShortcuts),
      commandDockPosition: null,
      commandDockHistory: []
    };
  }
}

function normalizeCommandDockPosition(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const left = Number(value.left);
  const top = Number(value.top);

  return Number.isFinite(left) && Number.isFinite(top) ? { left, top } : null;
}

function formatTime(ms) {
  if (!Number.isFinite(ms)) {
    return '';
  }

  return new Date(ms).toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatBackupLabel(backup) {
  const time = formatTime(backup.createdAt || backup.modifiedAt);
  const size = formatFileSize(backup.size);
  return [time || backup.name, size, backup.name].filter(Boolean).join(' - ');
}

function formatRelativeTime(ms) {
  if (!Number.isFinite(ms)) {
    return '';
  }

  const diff = Math.max(0, Date.now() - ms);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return '刚刚';
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时`;
  }
  return `${Math.floor(diff / day)} 天`;
}

function createLocalId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function encodeLocalFileUrlPath(value) {
  return encodeURI(value).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

function localFilePathToUrl(filePath) {
  const value = String(filePath || '').trim();
  if (!value) {
    return '';
  }
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value) && !/^[a-zA-Z]:[\\/]/.test(value)) {
    return value;
  }

  const normalized = value.replace(/\\/g, '/');
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeLocalFileUrlPath(normalized)}`;
  }
  if (normalized.startsWith('//')) {
    return `file:${encodeLocalFileUrlPath(normalized)}`;
  }
  if (normalized.startsWith('/')) {
    return `file://${encodeLocalFileUrlPath(normalized)}`;
  }

  return encodeLocalFileUrlPath(normalized);
}

const imageGenerationFailedStatuses = new Set([
  'cancelled',
  'canceled',
  'error',
  'failed',
  'rejected',
  'timeout',
  'timed_out'
]);
const imageGenerationHistoryMaxItems = 80;

function normalizeImageGenerationStatus(value, fallback = 'queued') {
  return String(value || fallback).trim().toLowerCase() || fallback;
}

function normalizeImageGenerationTimestamp(value, fallback = Date.now()) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeImageGenerationPayload(value, depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'undefined') {
    return null;
  }

  if (Array.isArray(value)) {
    if (depth >= 6) {
      return [`[Array(${value.length})]`];
    }

    return value.map((entry) => normalizeImageGenerationPayload(entry, depth + 1));
  }

  if (value && typeof value === 'object') {
    if (depth >= 6) {
      return `[Object ${Object.keys(value).length} keys]`;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeImageGenerationPayload(entryValue, depth + 1)])
    );
  }

  return String(value);
}

function normalizeImageGenerationPollEvents(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => {
      if (!event || typeof event !== 'object') {
        return null;
      }

      const parsedIndex = Number.parseInt(event.index, 10);
      return {
        index: Number.isFinite(parsedIndex) && parsedIndex > 0 ? parsedIndex : index + 1,
        receivedAt: normalizeImageGenerationTimestamp(event.receivedAt),
        status: normalizeImageGenerationStatus(event.status, 'running'),
        finishedAt: event.finishedAt || null,
        payload: normalizeImageGenerationPayload(event.payload)
      };
    })
    .filter(Boolean);
}

function createImageGenerationTaskItem(source = {}, prompt = '') {
  const id = String(source.id || '').trim() || createLocalId('image-task');
  const createdAt = Number(source.createdAt) || Date.now();
  return {
    id,
    kind: 'task',
    taskId: String(source.taskId || '').trim(),
    status: normalizeImageGenerationStatus(source.status),
    createdAt,
    updatedAt: Number(source.updatedAt) || createdAt,
    finishedAt: source.finishedAt || null,
    model: String(source.model || '').trim(),
    n: Number.isFinite(Number.parseInt(source.n, 10)) ? Number.parseInt(source.n, 10) : null,
    size: String(source.size || '').trim(),
    upscale: normalizeImageApiUpscale(source.upscale),
    referenceImageCount: Number.isFinite(Number.parseInt(source.referenceImageCount, 10))
      ? Number.parseInt(source.referenceImageCount, 10)
      : 0,
    name: '',
    normalizedPath: '',
    path: '',
    prompt: String(source.prompt || prompt || ''),
    url: '',
    error: String(source.error || '').trim(),
    pollEvents: normalizeImageGenerationPollEvents(source.pollEvents),
    successPayload: normalizeImageGenerationPayload(source.successPayload),
    failurePayload: normalizeImageGenerationPayload(source.failurePayload),
    requestParams: normalizeImageGenerationPayload(source.requestParams),
    requestBody: normalizeImageGenerationPayload(source.requestBody)
  };
}

function normalizeImageGenerationHistoryItem(source = {}, index = 0) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const rawKind = String(source.kind || '').trim().toLowerCase();
  const rawPath = String(source.path || '').trim();
  const rawNormalizedPath = normalizePromptFilePath(source.normalizedPath || rawPath);
  const kind = rawKind === 'task' && !rawPath && !rawNormalizedPath ? 'task' : 'image';
  const status = normalizeImageGenerationStatus(source.status, kind === 'task' ? 'failed' : 'success');

  if (kind === 'task') {
    if (status !== 'success' && !imageGenerationFailedStatuses.has(status)) {
      return null;
    }

    return createImageGenerationTaskItem({
      ...source,
      id: String(source.id || '').trim() || createLocalId(`image-history-task-${index}`),
      status,
      createdAt: normalizeImageGenerationTimestamp(source.createdAt),
      updatedAt: normalizeImageGenerationTimestamp(source.updatedAt, source.createdAt),
      finishedAt: source.finishedAt || source.updatedAt || source.createdAt || null
    }, source.prompt);
  }

  const filePath = rawPath || rawNormalizedPath;
  if (!filePath) {
    return null;
  }

  const createdAt = normalizeImageGenerationTimestamp(source.createdAt);
  const updatedAt = normalizeImageGenerationTimestamp(source.updatedAt, createdAt);
  const normalizedPath = normalizePromptFilePath(source.normalizedPath || filePath);
  const name = String(
    source.name
    || normalizedPath.split('/').filter(Boolean).pop()
    || filePath.split(/[\\/]/).filter(Boolean).pop()
    || ''
  ).trim();
  const count = Number.parseInt(source.n, 10);
  const referenceImageCount = Number.parseInt(source.referenceImageCount, 10);

  return {
    id: String(source.id || '').trim() || createLocalId(`image-history-${index}`),
    kind: 'image',
    taskId: String(source.taskId || '').trim(),
    status: 'success',
    createdAt,
    updatedAt,
    finishedAt: source.finishedAt || null,
    model: String(source.model || '').trim(),
    n: Number.isFinite(count) ? Math.min(4, Math.max(1, count)) : null,
    size: String(source.size || '').trim(),
    upscale: normalizeImageApiUpscale(source.upscale),
    referenceImageCount: Number.isFinite(referenceImageCount) ? Math.max(0, referenceImageCount) : 0,
    name,
    normalizedPath,
    path: filePath,
    prompt: String(source.prompt || ''),
    url: localFilePathToUrl(filePath),
    error: String(source.error || '').trim()
  };
}

function normalizeImageGenerationHistoryItems(items) {
  const normalizedItems = [];
  const seenIds = new Set();

  (Array.isArray(items) ? items : []).forEach((item, index) => {
    const normalized = normalizeImageGenerationHistoryItem(item, index);
    if (!normalized) {
      return;
    }

    if (seenIds.has(normalized.id)) {
      normalized.id = createLocalId(`${normalized.kind || 'image'}-history`);
    }
    seenIds.add(normalized.id);
    normalizedItems.push(normalized);
  });

  return normalizedItems.slice(0, imageGenerationHistoryMaxItems);
}

function isImageGenerationHistoryPersistable(item) {
  const status = normalizeImageGenerationStatus(item?.status, item?.kind === 'image' ? 'success' : 'queued');
  if (item?.kind === 'task') {
    return status === 'success' || imageGenerationFailedStatuses.has(status);
  }

  return Boolean(item?.path || item?.normalizedPath);
}

function serializeImageGenerationHistoryItem(item) {
  if (!isImageGenerationHistoryPersistable(item)) {
    return null;
  }

  return {
    id: String(item.id || '').trim(),
    kind: item.kind === 'task' ? 'task' : 'image',
    taskId: String(item.taskId || '').trim(),
    status: normalizeImageGenerationStatus(item.status, item.kind === 'task' ? 'failed' : 'success'),
    createdAt: normalizeImageGenerationTimestamp(item.createdAt),
    updatedAt: normalizeImageGenerationTimestamp(item.updatedAt, item.createdAt),
    finishedAt: item.finishedAt || null,
    model: String(item.model || '').trim(),
    n: Number.isFinite(Number.parseInt(item.n, 10)) ? Number.parseInt(item.n, 10) : null,
    size: String(item.size || '').trim(),
    upscale: normalizeImageApiUpscale(item.upscale),
    referenceImageCount: Number.isFinite(Number.parseInt(item.referenceImageCount, 10))
      ? Number.parseInt(item.referenceImageCount, 10)
      : 0,
    name: String(item.name || '').trim(),
    normalizedPath: normalizePromptFilePath(item.normalizedPath || item.path),
    path: String(item.path || item.normalizedPath || '').trim(),
    prompt: String(item.prompt || ''),
    error: String(item.error || '').trim(),
    pollEvents: normalizeImageGenerationPollEvents(item.pollEvents),
    successPayload: normalizeImageGenerationPayload(item.successPayload),
    failurePayload: normalizeImageGenerationPayload(item.failurePayload),
    requestParams: normalizeImageGenerationPayload(item.requestParams),
    requestBody: normalizeImageGenerationPayload(item.requestBody)
  };
}

function serializeImageGenerationHistoryItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => serializeImageGenerationHistoryItem(item))
    .filter(Boolean)
    .slice(0, imageGenerationHistoryMaxItems);
}

function createImageGenerationImageItems(images, prompt, source = {}) {
  const generatedAt = Number(source.finishedAt || source.updatedAt) || Date.now();
  const taskId = String(source.taskId || '').trim();
  return (Array.isArray(images) ? images : [])
    .map((image) => {
      const filePath = String(image?.path || '').trim();
      if (!filePath) {
        return null;
      }

      const normalizedPath = normalizePromptFilePath(filePath);
      const name = String(image?.name || normalizedPath.split('/').filter(Boolean).pop() || '').trim();
      return {
        id: createLocalId('generated-image'),
        kind: 'image',
        taskId,
        status: 'success',
        createdAt: generatedAt,
        updatedAt: generatedAt,
        model: String(source.model || '').trim(),
        n: Number.isFinite(Number.parseInt(source.n, 10)) ? Number.parseInt(source.n, 10) : null,
        size: String(source.size || '').trim(),
        upscale: normalizeImageApiUpscale(source.upscale),
        referenceImageCount: Number.isFinite(Number.parseInt(source.referenceImageCount, 10))
          ? Number.parseInt(source.referenceImageCount, 10)
          : 0,
        name,
        normalizedPath,
        path: filePath,
        prompt,
        url: localFilePathToUrl(filePath)
      };
    })
    .filter(Boolean);
}

function createImageGenerationReferenceItem(source = {}) {
  const filePath = String(source?.path || '').trim();
  if (!filePath) {
    return null;
  }

  const normalizedPath = normalizePromptFilePath(filePath);
  const name = String(source?.name || normalizedPath.split('/').filter(Boolean).pop() || '').trim();
  return {
    id: createLocalId('reference-image'),
    name,
    normalizedPath,
    path: filePath,
    size: Number(source?.size) || 0,
    url: localFilePathToUrl(filePath)
  };
}

function isAgentAvatarFile(file) {
  if (!file) {
    return false;
  }

  const mimeType = String(file.type || '').toLowerCase();
  if (mimeType.startsWith('image/')) {
    return true;
  }

  return /\.(?:apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(String(file.name || ''));
}

function normalizeAgentRecord(record, fallbackIndex = 0) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const now = Date.now();
  const id = String(record.id || '').trim() || createLocalId('agent');
  const name = String(record.name || '').trim() || `Agent ${fallbackIndex + 1}`;
  const cliProviderId = getCliProviderById(record.cliProviderId)?.id || defaultCliProviderId;

  return {
    id,
    name,
    instructions: String(record.instructions || ''),
    cliProviderId,
    skills: normalizeAgentSkillReferences(record.skills),
    avatarPath: String(record.avatarPath || ''),
    avatarName: String(record.avatarName || ''),
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : now,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : now
  };
}

function createAgentRecord(name, cliProviderId = defaultCliProviderId) {
  const now = Date.now();
  return {
    id: createLocalId('agent'),
    name: String(name || '').trim() || 'Agent',
    instructions: '',
    cliProviderId: getCliProviderById(cliProviderId)?.id || defaultCliProviderId,
    skills: [],
    avatarPath: '',
    avatarName: '',
    createdAt: now,
    updatedAt: now
  };
}

function normalizeAgents(raw) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.agents) ? raw.agents : [];
  const seenIds = new Set();

  return source
    .map((record, index) => normalizeAgentRecord(record, index))
    .filter(Boolean)
    .map((agent) => {
      if (!seenIds.has(agent.id)) {
        seenIds.add(agent.id);
        return agent;
      }

      const nextAgent = { ...agent, id: createLocalId('agent') };
      seenIds.add(nextAgent.id);
      return nextAgent;
    });
}

function loadAgents() {
  try {
    return normalizeAgents(JSON.parse(localStorage.getItem(agentsKey) || '[]'));
  } catch {
    localStorage.removeItem(agentsKey);
    return [];
  }
}

function buildAgentTaskPrompt(agent, taskDescription) {
  const name = String(agent?.name || 'Agent').trim();
  const instructions = String(agent?.instructions || '').trim();
  const skills = normalizeAgentSkillReferences(agent?.skills);
  const task = String(taskDescription || '').trim();
  const sections = [`You are the saved CLI in One agent "${name}".`];

  if (instructions) {
    sections.push(`Agent instructions:\n${instructions}`);
  }

  if (skills.length > 0) {
    sections.push([
      'Associated skills:',
      'The following skill directories are attached to this agent. When relevant, read and follow the SKILL.md in each directory:',
      ...skills
        .map((skill) => getAgentSkillReferenceDirectoryPath(skill))
        .filter(Boolean)
        .map((directoryPath) => `- ${directoryPath}`)
    ].join('\n'));
  }

  sections.push([
    'Progress tracking:',
    'Start with a concise editable plan and a Markdown task list.',
    'Use "- [ ] task" for pending work, "- [~] task" for active work, and "- [x] task" for completed work when reporting progress.'
  ].join('\n'));

  sections.push(`Task:\n${task}`);
  return sections.join('\n\n');
}

function buildInteractiveCodeReviewTask({ comments, snapshot }) {
  const repositoryRoot = String(snapshot?.repositoryRoot || snapshot?.cwd || '').trim();
  const status = String(snapshot?.status || '').trim();
  const stagedStat = String(snapshot?.stagedStat || '').trim();
  const unstagedStat = String(snapshot?.unstagedStat || '').trim();
  const diffText = String(snapshot?.text || '').trim();
  const sections = [
    'You are receiving batched human code review feedback for the current workspace.',
    [
      'Review objective:',
      'Apply the requested fixes from the human comments below.',
      'Keep the change scoped to the reviewed diff.',
      'Do not revert or overwrite unrelated user changes.',
      'After editing, summarize what changed and list any verification you ran.'
    ].join('\n')
  ];

  if (repositoryRoot) {
    sections.push(`Repository:\n${repositoryRoot}`);
  }

  sections.push(`Human review comments:\n${String(comments || '').trim()}`);

  if (status) {
    sections.push(`Git status:\n${status}`);
  }
  if (stagedStat || unstagedStat) {
    sections.push([
      stagedStat && `Staged diff stat:\n${stagedStat}`,
      unstagedStat && `Unstaged diff stat:\n${unstagedStat}`
    ].filter(Boolean).join('\n\n'));
  }
  if (diffText) {
    sections.push(`Current Git diff:\n\`\`\`diff\n${diffText}\n\`\`\``);
  }
  if (snapshot?.truncated) {
    sections.push('Note: The diff snapshot was truncated. Re-read the local git diff before making edits if more context is needed.');
  }

  return sections.join('\n\n');
}

function normalizeAutopilotScheduleType(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'week') {
    return 'weekly';
  }
  if (normalized === 'custom' || normalized === 'custom-cron') {
    return 'cron';
  }
  return autopilotScheduleTypes.has(normalized) ? normalized : 'daily';
}

function normalizeAutopilotTime(value) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(value || '').trim());
  if (!match) {
    return autopilotDefaultTime;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return autopilotDefaultTime;
  }

  const normalizedHour = Math.min(23, Math.max(0, hour));
  const normalizedMinute = Math.min(59, Math.max(0, minute));
  return `${String(normalizedHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}`;
}

function getAutopilotTimeParts(value) {
  const [hour, minute] = normalizeAutopilotTime(value).split(':').map((part) => Number.parseInt(part, 10));
  return { hour, minute };
}

function normalizeAutopilotWeekday(value) {
  const normalized = String(Number.parseInt(value, 10));
  return autopilotWeekdayIds.includes(normalized) ? normalized : '1';
}

function normalizeAutopilotCronExpression(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || autopilotDefaultCronExpression;
}

function normalizeAutopilotTimestamp(value, fallback = 0) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

function createAutopilotRecord(agentId = '') {
  const now = Date.now();
  return {
    id: createLocalId('autopilot'),
    name: 'Autopilot',
    enabled: false,
    agentId: String(agentId || '').trim(),
    runbook: '',
    scheduleType: 'daily',
    time: autopilotDefaultTime,
    weekday: '1',
    cronExpression: autopilotDefaultCronExpression,
    lastRunAt: 0,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeAutopilotRecord(record, fallbackIndex = 0) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const now = Date.now();
  const id = String(record.id || '').trim() || createLocalId('autopilot');
  const name = String(record.name || '').trim() || `Autopilot ${fallbackIndex + 1}`;
  const scheduleType = normalizeAutopilotScheduleType(record.scheduleType || record.schedule);

  return {
    id,
    name,
    enabled: Boolean(record.enabled),
    agentId: String(record.agentId || '').trim(),
    runbook: String(record.runbook || record.task || ''),
    scheduleType,
    time: normalizeAutopilotTime(record.time || record.runAt),
    weekday: normalizeAutopilotWeekday(record.weekday),
    cronExpression: normalizeAutopilotCronExpression(record.cronExpression || record.cron),
    lastRunAt: normalizeAutopilotTimestamp(record.lastRunAt),
    createdAt: normalizeAutopilotTimestamp(record.createdAt, now),
    updatedAt: normalizeAutopilotTimestamp(record.updatedAt, now)
  };
}

function normalizeAutopilots(raw) {
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.autopilots) ? raw.autopilots : [];
  const seenIds = new Set();

  return source
    .map((record, index) => normalizeAutopilotRecord(record, index))
    .filter(Boolean)
    .map((autopilot) => {
      if (!seenIds.has(autopilot.id)) {
        seenIds.add(autopilot.id);
        return autopilot;
      }

      const nextAutopilot = { ...autopilot, id: createLocalId('autopilot') };
      seenIds.add(nextAutopilot.id);
      return nextAutopilot;
    });
}

function loadAutopilots() {
  try {
    return normalizeAutopilots(JSON.parse(localStorage.getItem(autopilotKey) || '[]'));
  } catch {
    localStorage.removeItem(autopilotKey);
    return [];
  }
}

function buildAutopilotRunbookTask(autopilot) {
  const name = String(autopilot?.name || 'Autopilot').trim();
  const runbook = String(autopilot?.runbook || '').trim();

  return [
    `Autopilot runbook: ${name}`,
    'This task was launched automatically by CLI in One Autopilot.',
    `Runbook:\n${runbook}`
  ].join('\n\n');
}

const cronMonthAliases = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

const cronWeekdayAliases = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
};

function parseCronFieldValue(value, min, max, options = {}) {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = options.aliases || {};
  const aliasValue = Object.prototype.hasOwnProperty.call(aliases, raw) ? aliases[raw] : null;
  const parsed = aliasValue ?? (/^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN);
  const upperBound = options.dayOfWeek ? 7 : max;

  if (!Number.isFinite(parsed) || parsed < min || parsed > upperBound) {
    return null;
  }

  return options.dayOfWeek && parsed === 7 ? 0 : parsed;
}

function expandCronField(field, min, max, options = {}) {
  const raw = String(field || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const wildcardValues = () => new Set(
    Array.from({ length: max - min + 1 }, (_item, index) => min + index)
  );

  if (raw === '*' || raw === '?') {
    return wildcardValues();
  }

  const values = new Set();
  for (const segment of raw.split(',')) {
    const [rangePart, stepPart] = segment.split('/');
    const step = stepPart ? Number.parseInt(stepPart, 10) : 1;
    if (!rangePart || !Number.isFinite(step) || step < 1) {
      return null;
    }

    let start = null;
    let end = null;
    if (rangePart === '*' || rangePart === '?') {
      start = min;
      end = options.dayOfWeek ? 7 : max;
    } else if (rangePart.includes('-')) {
      const [startPart, endPart] = rangePart.split('-');
      start = parseCronFieldValue(startPart, min, max, options);
      end = parseCronFieldValue(endPart, min, max, options);
      if (options.dayOfWeek && end === 0 && String(endPart).trim() === '7') {
        end = 7;
      }
    } else {
      start = parseCronFieldValue(rangePart, min, max, options);
      end = start;
    }

    if (start === null || end === null || start > end) {
      return null;
    }

    for (let value = start; value <= end; value += step) {
      values.add(options.dayOfWeek && value === 7 ? 0 : value);
    }
  }

  return values.size > 0 ? values : null;
}

function parseCronExpression(expression) {
  const fields = String(expression || '').trim().replace(/\s+/g, ' ').split(' ');
  if (fields.length !== 5) {
    return null;
  }

  const minutes = expandCronField(fields[0], 0, 59);
  const hours = expandCronField(fields[1], 0, 23);
  const daysOfMonth = expandCronField(fields[2], 1, 31);
  const months = expandCronField(fields[3], 1, 12, { aliases: cronMonthAliases });
  const daysOfWeek = expandCronField(fields[4], 0, 6, {
    aliases: cronWeekdayAliases,
    dayOfWeek: true
  });

  if (!minutes || !hours || !daysOfMonth || !months || !daysOfWeek) {
    return null;
  }

  return { minutes, hours, daysOfMonth, months, daysOfWeek };
}

function isCronMatch(parsedCron, date) {
  return (
    parsedCron.minutes.has(date.getMinutes()) &&
    parsedCron.hours.has(date.getHours()) &&
    parsedCron.daysOfMonth.has(date.getDate()) &&
    parsedCron.months.has(date.getMonth() + 1) &&
    parsedCron.daysOfWeek.has(date.getDay())
  );
}

function getCronNextRunAt(expression, afterMs) {
  const parsedCron = parseCronExpression(expression);
  if (!parsedCron || !Number.isFinite(afterMs)) {
    return null;
  }

  const candidate = new Date(afterMs + 60000);
  candidate.setSeconds(0, 0);
  const maxMinutes = 366 * 24 * 60;

  for (let index = 0; index < maxMinutes; index += 1) {
    if (isCronMatch(parsedCron, candidate)) {
      return candidate.getTime();
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

function getAutopilotTimedNextRunAt(afterMs, time, predicate, maxDays = 14) {
  if (!Number.isFinite(afterMs)) {
    return null;
  }

  const { hour, minute } = getAutopilotTimeParts(time);
  const baseDate = new Date(afterMs);
  for (let offset = 0; offset <= maxDays; offset += 1) {
    const candidate = new Date(baseDate);
    candidate.setDate(baseDate.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() > afterMs && predicate(candidate)) {
      return candidate.getTime();
    }
  }

  return null;
}

function getAutopilotNextRunAt(autopilot, afterMs = Date.now()) {
  const record = normalizeAutopilotRecord(autopilot);
  if (!record) {
    return null;
  }

  if (record.scheduleType === 'cron') {
    return getCronNextRunAt(record.cronExpression, afterMs);
  }

  if (record.scheduleType === 'weekday') {
    return getAutopilotTimedNextRunAt(
      afterMs,
      record.time,
      (date) => date.getDay() >= 1 && date.getDay() <= 5,
      8
    );
  }

  if (record.scheduleType === 'weekly') {
    const weekday = Number.parseInt(record.weekday, 10);
    return getAutopilotTimedNextRunAt(
      afterMs,
      record.time,
      (date) => date.getDay() === weekday,
      8
    );
  }

  return getAutopilotTimedNextRunAt(afterMs, record.time, () => true, 2);
}

function formatAutopilotDateTime(value, language) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }

  return new Date(timestamp).toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getAutopilotWeekdayLabel(weekday, t) {
  const keyByDay = {
    0: 'weekdaySunday',
    1: 'weekdayMonday',
    2: 'weekdayTuesday',
    3: 'weekdayWednesday',
    4: 'weekdayThursday',
    5: 'weekdayFriday',
    6: 'weekdaySaturday'
  };
  return t(keyByDay[Number.parseInt(weekday, 10)] || 'weekdayMonday');
}

function describeAutopilotSchedule(autopilot, t) {
  const record = normalizeAutopilotRecord(autopilot);
  if (!record) {
    return '';
  }

  if (record.scheduleType === 'cron') {
    return `${t('autopilotScheduleCron')}: ${record.cronExpression}`;
  }

  if (record.scheduleType === 'weekday') {
    return `${t('autopilotScheduleWeekday')} ${record.time}`;
  }

  if (record.scheduleType === 'weekly') {
    return `${t('autopilotScheduleWeekly')} ${getAutopilotWeekdayLabel(record.weekday, t)} ${record.time}`;
  }

  return `${t('autopilotScheduleDaily')} ${record.time}`;
}

function deriveNameFromPath(value) {
  if (!value) {
    return '未命名项目';
  }

  const parts = String(value).split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || value;
}

function normalizeComparablePath(value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/');
  if (!normalized) {
    return '';
  }

  if (normalized === '/') {
    return '/';
  }

  return normalized.replace(/\/+$/, '').toLowerCase();
}

function isPathWithinRoot(candidatePath, rootPath) {
  const normalizedCandidate = normalizeComparablePath(candidatePath);
  const normalizedRoot = normalizeComparablePath(rootPath);
  if (!normalizedCandidate || !normalizedRoot) {
    return false;
  }

  if (normalizedRoot === '/') {
    return normalizedCandidate.startsWith('/');
  }

  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function resolveWorkspaceLaunchContext(activeProject, requestedCwd, fallbackCwd = '') {
  const normalizedRequestedCwd = String(requestedCwd || '').trim();
  const normalizedFallbackCwd = String(fallbackCwd || '').trim();
  const projectId = String(activeProject?.id || '').trim();
  const projectPath = String(activeProject?.path || '').trim();

  if (projectId && projectPath) {
    const projectCwd = normalizedRequestedCwd
      || (isPathWithinRoot(normalizedFallbackCwd, projectPath) ? normalizedFallbackCwd : projectPath);
    if (isPathWithinRoot(projectCwd, projectPath)) {
      return {
        projectId,
        cwd: projectCwd,
        targetType: 'project'
      };
    }
  }

  return {
    projectId: null,
    cwd: normalizedRequestedCwd || normalizedFallbackCwd,
    targetType: 'directory'
  };
}

function createEmptyWorkspace() {
  return {
    sidebarCollapsed: false,
    promptMenuCollapsed: false,
    skillsCollapsed: false,
    activeProjectId: null,
    canvasMode: 'project',
    canvasModeCustomized: false,
    sharedView: createDefaultView(),
    canvasFrames: {},
    canvasTodos: {},
    canvasConnections: {},
    projectViews: {},
    projects: []
  };
}

function normalizeProjectOrder(projects) {
  const pinnedProjects = [];
  const regularProjects = [];

  projects.forEach((project) => {
    if (project?.pinned) {
      pinnedProjects.push(project);
      return;
    }

    regularProjects.push(project);
  });

  return [...pinnedProjects, ...regularProjects];
}

function haveSameProjectOrder(left, right) {
  return left.length === right.length && left.every((project, index) => project.id === right[index]?.id);
}

function moveProjectInSidebarOrder(projects, draggedProjectId, targetProjectId, position = 'before') {
  if (!Array.isArray(projects) || draggedProjectId === targetProjectId) {
    return projects;
  }

  const nextProjects = projects.slice();
  const sourceIndex = nextProjects.findIndex((project) => project.id === draggedProjectId);
  const targetIndex = nextProjects.findIndex((project) => project.id === targetProjectId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return projects;
  }

  const [draggedProject] = nextProjects.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextProjects.findIndex((project) => project.id === targetProjectId);
  if (adjustedTargetIndex < 0) {
    return projects;
  }

  nextProjects.splice(position === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex, 0, draggedProject);
  const normalizedProjects = normalizeProjectOrder(nextProjects);
  return haveSameProjectOrder(normalizedProjects, projects) ? projects : normalizedProjects;
}

function createHistoryProject(historyDir) {
  if (!historyDir) {
    return null;
  }

  return {
    id: historyProjectId,
    name: '.history',
    path: historyDir,
    createdAt: 0,
    updatedAt: 0,
    builtIn: true
  };
}

function findProjectById(projects, historyProject, projectId) {
  if (historyProject?.id === projectId) {
    return historyProject;
  }

  return projects.find((project) => project.id === projectId) || null;
}

function normalizeWorkspace(raw) {
  const fallback = createEmptyWorkspace();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const projects = Array.isArray(raw.projects)
    ? normalizeProjectOrder(raw.projects.map((project) => ({
      id: project.id || createLocalId('project'),
      name: project.name || deriveNameFromPath(project.path),
      pinned: Boolean(project.pinned),
      path: project.path || '',
      createdAt: Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
      updatedAt: Number.isFinite(project.updatedAt) ? project.updatedAt : Date.now()
    })))
    : [];
  const projectViews = raw.projectViews && typeof raw.projectViews === 'object'
    ? Object.fromEntries(Object.entries(raw.projectViews).map(([key, value]) => [key, normalizeCanvasView(value)]))
    : {};
  const canvasFrames = normalizeCanvasFrameMap(raw.canvasFrames);
  const canvasTodos = normalizeCanvasTodoMap(raw.canvasTodos);
  const canvasConnections = normalizeCanvasConnectionMap(raw.canvasConnections);
  const canvasModeCustomized = Boolean(raw.canvasModeCustomized);
  const canvasMode = raw.canvasMode === 'shared'
    ? (canvasModeCustomized ? 'shared' : fallback.canvasMode)
    : (canvasModes.has(raw.canvasMode) ? raw.canvasMode : fallback.canvasMode);
  const activeProjectId = typeof raw.activeProjectId === 'string' && raw.activeProjectId
    ? raw.activeProjectId
    : null;

  return {
    ...fallback,
    sidebarCollapsed: Boolean(raw.sidebarCollapsed),
    promptMenuCollapsed: Boolean(raw.promptMenuCollapsed),
    skillsCollapsed: Boolean(raw.skillsCollapsed),
    activeProjectId,
    canvasMode,
    canvasModeCustomized,
    sharedView: normalizeCanvasView(raw.sharedView),
    canvasFrames,
    canvasTodos,
    canvasConnections,
    projectViews,
    projects
  };
}

function loadWorkspace() {
  try {
    return normalizeWorkspace(JSON.parse(localStorage.getItem(workspaceKey) || '{}'));
  } catch {
    localStorage.removeItem(workspaceKey);
    return createEmptyWorkspace();
  }
}

function createEmptyWorkspaceSkillsSnapshot(rootPath = '') {
  return {
    cwd: String(rootPath || '').trim(),
    scannedAt: 0,
    scopes: workspaceSkillSources.map((source) => ({
      id: source.id,
      label: source.label,
      directoryName: source.directoryName,
      exists: false,
      error: '',
      fileCount: 0,
      files: [],
      path: '',
      truncated: false
    })),
    totalFiles: 0
  };
}

function countWorkspaceTreeNodes(root) {
  const counts = {
    directoryCount: 0,
    fileCount: 0,
    omittedCount: 0,
    truncated: false
  };

  const visit = (node, isRoot = false) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (node.type === 'directory') {
      if (!isRoot) {
        counts.directoryCount += 1;
      }

      if (node.ignored) {
        counts.omittedCount += 1;
        counts.truncated = true;
      }
    } else if (node.type === 'file' || node.type === 'link') {
      counts.fileCount += 1;
    } else if (node.type === 'omitted') {
      counts.omittedCount += Number(node.omittedCount) || 0;
      counts.truncated = true;
    } else if (node.type === 'depth-limit') {
      counts.omittedCount += 1;
      counts.truncated = true;
    }

    if (Array.isArray(node.children)) {
      node.children.forEach((child) => visit(child, false));
    }
  };

  visit(root, true);
  return counts;
}

function mergeWorkspaceTreeNodeChildren(node, targetNodeId, loadedRoot) {
  if (!node || !targetNodeId) {
    return node;
  }

  if (node.id === targetNodeId) {
    return {
      ...node,
      children: Array.isArray(loadedRoot?.children) ? loadedRoot.children : [],
      childrenLoaded: true
    };
  }

  const children = Array.isArray(node.children) ? node.children : [];
  let changed = false;
  const nextChildren = children.map((child) => {
    const nextChild = mergeWorkspaceTreeNodeChildren(child, targetNodeId, loadedRoot);
    if (nextChild !== child) {
      changed = true;
    }
    return nextChild;
  });

  return changed ? { ...node, children: nextChildren } : node;
}

function normalizeWorkspaceTreeRelativePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function joinWorkspaceTreeRelativePath(basePath, childPath) {
  const base = normalizeWorkspaceTreeRelativePath(basePath);
  const child = normalizeWorkspaceTreeRelativePath(childPath);
  return [base, child].filter(Boolean).join('/');
}

function rebaseWorkspaceTreeNodeRelativePaths(node, baseRelativePath) {
  if (!node || typeof node !== 'object') {
    return node;
  }

  const relativePath = normalizeWorkspaceTreeRelativePath(node.relativePath);
  const nextChildren = Array.isArray(node.children)
    ? node.children.map((child) => rebaseWorkspaceTreeNodeRelativePaths(child, baseRelativePath))
    : [];

  return {
    ...node,
    relativePath: relativePath ? joinWorkspaceTreeRelativePath(baseRelativePath, relativePath) : relativePath,
    children: nextChildren
  };
}

function rebaseWorkspaceTreeLoadedRoot(loadedRoot, targetRelativePath) {
  if (!loadedRoot || typeof loadedRoot !== 'object') {
    return loadedRoot;
  }

  return {
    ...loadedRoot,
    children: Array.isArray(loadedRoot.children)
      ? loadedRoot.children.map((child) => rebaseWorkspaceTreeNodeRelativePaths(child, targetRelativePath))
      : []
  };
}

function withWorkspaceTreeCounts(snapshot) {
  if (!snapshot?.root) {
    return snapshot;
  }

  const counts = countWorkspaceTreeNodes(snapshot.root);
  return {
    ...snapshot,
    ...counts
  };
}

function normalizeWorkspaceSkillsSnapshot(snapshot, fallbackRootPath = '') {
  const rootPath = String(snapshot?.cwd || fallbackRootPath || '').trim();
  const scopeMap = new Map(
    (Array.isArray(snapshot?.scopes) ? snapshot.scopes : [])
      .filter((scope) => scope && typeof scope.id === 'string')
      .map((scope) => [scope.id, scope])
  );

  const scopes = workspaceSkillSources.map((source) => {
    const current = scopeMap.get(source.id) || {};
    const files = Array.isArray(current.files)
      ? current.files
        .map((file) => ({
          extension: String(file?.extension || '').trim().toLowerCase(),
          name: String(file?.name || '').trim(),
          path: String(file?.path || '').trim(),
          relativePath: String(file?.relativePath || '').trim()
        }))
        .filter((file) => file.path || file.relativePath || file.name)
      : [];
    const skills = normalizeAgentSkillReferences(
      Array.isArray(current.skills)
        ? current.skills.map((skill) => ({
          ...skill,
          sourceDirectoryName: skill?.sourceDirectoryName || source.directoryName,
          sourceId: skill?.sourceId || source.id,
          sourceScope: skill?.sourceScope || source.scope || 'project'
        }))
        : []
    );

    return {
      id: source.id,
      label: source.label,
      directoryName: source.directoryName,
      exists: Boolean(current.exists),
      error: String(current.error || '').trim(),
      fileCount: Number.isFinite(current.fileCount) ? current.fileCount : files.length,
      files,
      path: String(current.path || '').trim(),
      skillCount: Number.isFinite(current.skillCount) ? current.skillCount : skills.length,
      skills,
      truncated: Boolean(current.truncated)
    };
  });

  return {
    cwd: rootPath,
    scannedAt: Number.isFinite(snapshot?.scannedAt) ? snapshot.scannedAt : 0,
    scopes,
    totalFiles: Number.isFinite(snapshot?.totalFiles)
      ? snapshot.totalFiles
      : scopes.reduce((sum, scope) => sum + scope.fileCount, 0)
  };
}

function IconButton({ label, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" aria-label={label} title={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarCollapseIcon({ collapsed }) {
  return (
    <span className="t-icon-swap sidebar-collapse-icon" data-state={collapsed ? 'b' : 'a'} aria-hidden="true">
      <span className="t-icon" data-icon="a">
        <PanelLeftClose className="h-4 w-4" />
      </span>
      <span className="t-icon" data-icon="b">
        <PanelLeftOpen className="h-4 w-4" />
      </span>
    </span>
  );
}

function CanvasFrame({
  active,
  frame,
  scale,
  t,
  onActivate,
  onDelete,
  onMove,
  onResize,
  onTitleChange,
  onTitleCommit
}) {
  const startDrag = (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate(frame.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: frame.x,
      y: frame.y
    };

    bindPointerSession((moveEvent) => {
      onMove(frame.id, {
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / scale),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / scale)
      });
    });
  };

  const startResize = (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate(frame.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      width: frame.width,
      height: frame.height
    };

    bindPointerSession((moveEvent) => {
      onResize(frame.id, {
        width: Math.round(clamp(start.width + (moveEvent.clientX - start.clientX) / scale, canvasFrameMinWidth, 3200)),
        height: Math.round(clamp(start.height + (moveEvent.clientY - start.clientY) / scale, canvasFrameMinHeight, 2400))
      });
    });
  };

  const handleTitleKeyDown = (event) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      onTitleCommit(frame.id, event.currentTarget.value);
    }
  };

  return (
    <div
      className={cn('canvas-frame', active && 'is-active')}
      style={{
        left: frame.x,
        top: frame.y,
        width: frame.width,
        height: frame.height
      }}
    >
      <div className="canvas-frame-outline" aria-hidden="true" />
      <div className="canvas-frame-header">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="canvas-frame-drag h-7 w-7 text-muted-foreground"
          title={t('moveCanvasFrame')}
          aria-label={t('moveCanvasFrame')}
          onPointerDown={startDrag}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <Input
          className="canvas-frame-title"
          value={frame.title}
          placeholder={t('canvasFrameTitlePlaceholder')}
          aria-label={t('renameCanvasFrame')}
          spellCheck={false}
          onPointerDown={(event) => {
            event.stopPropagation();
            onActivate(frame.id);
          }}
          onClick={(event) => event.stopPropagation()}
          onFocus={() => onActivate(frame.id)}
          onChange={(event) => onTitleChange(frame.id, event.target.value)}
          onBlur={(event) => onTitleCommit(frame.id, event.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="canvas-frame-delete h-7 w-7"
          title={t('deleteCanvasFrame')}
          aria-label={t('deleteCanvasFrame')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(frame.id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        className="canvas-frame-resize"
        title={t('resizeCanvasFrame')}
        aria-hidden="true"
        onPointerDown={startResize}
      />
    </div>
  );
}

function CanvasTodoList({
  active,
  scale,
  t,
  todo,
  onActivate,
  onAddItem,
  onDelete,
  onItemDoneChange,
  onItemRemove,
  onItemTextChange,
  onMove,
  onPlanTextChange,
  onResize,
  onAutoSyncChange,
  onTitleChange,
  onTitleCommit,
  onTogglePinned
}) {
  const [draft, setDraft] = useState('');
  const items = Array.isArray(todo.items) ? todo.items : [];
  const completedCount = items.filter((item) => item.done).length;
  const progressText = items.length > 0
    ? t('canvasTodoProgress', { done: completedCount, total: items.length })
    : t('canvasTodoProgressEmpty');
  const linkedPanelTitle = todo.linkedPanelTitle || todo.agentName || '';
  const linkedPanelLabel = linkedPanelTitle
    ? t('canvasTodoLinkedSession', { name: linkedPanelTitle })
    : '';

  const addDraftItem = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    onAddItem(todo.id, text);
    setDraft('');
  };

  const startDrag = (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate(todo.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: todo.x,
      y: todo.y
    };

    bindPointerSession((moveEvent) => {
      onMove(todo.id, {
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / scale),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / scale)
      });
    });
  };

  const startResize = (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate(todo.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      width: todo.width,
      height: todo.height
    };

    bindPointerSession((moveEvent) => {
      onResize(todo.id, {
        width: Math.round(clamp(start.width + (moveEvent.clientX - start.clientX) / scale, canvasTodoMinWidth, 1600)),
        height: Math.round(clamp(start.height + (moveEvent.clientY - start.clientY) / scale, canvasTodoMinHeight, 1600))
      });
    });
  };

  const handleTitleKeyDown = (event) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      onTitleCommit(todo.id, event.currentTarget.value);
    }
  };

  const handleDraftKeyDown = (event) => {
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      addDraftItem();
    }
  };

  return (
    <section
      className={cn(
        'canvas-todo-panel',
        active && 'is-active',
        todo.pinned && 'is-pinned',
        todo.linkedPanelId && 'is-linked'
      )}
      style={{
        left: todo.x,
        top: todo.y,
        width: todo.width,
        height: todo.height
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate(todo.id);
      }}
    >
      <header className="canvas-todo-header">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="canvas-todo-drag h-7 w-7 text-muted-foreground"
          title={t('moveCanvasTodo')}
          aria-label={t('moveCanvasTodo')}
          onPointerDown={startDrag}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <ListTodo className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <Input
          className="canvas-todo-title"
          value={todo.title}
          placeholder={t('canvasTodoTitlePlaceholder')}
          aria-label={t('renameCanvasTodo')}
          spellCheck={false}
          onChange={(event) => onTitleChange(todo.id, event.target.value)}
          onBlur={(event) => onTitleCommit(todo.id, event.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
        <Button
          type="button"
          variant={todo.pinned ? 'primary' : 'ghost'}
          size="icon"
          className="canvas-todo-pin h-7 w-7"
          title={t(todo.pinned ? 'unpinCanvasTodo' : 'pinCanvasTodo')}
          aria-label={t(todo.pinned ? 'unpinCanvasTodo' : 'pinCanvasTodo')}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePinned(todo.id);
          }}
        >
          <Pin className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="canvas-todo-delete h-7 w-7"
          title={t('deleteCanvasTodo')}
          aria-label={t('deleteCanvasTodo')}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(todo.id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      {(linkedPanelLabel || todo.linkedPanelId) && (
        <div className="canvas-todo-meta-row">
          {linkedPanelLabel && (
            <div className="canvas-todo-linked-session" title={linkedPanelLabel}>
              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{linkedPanelLabel}</span>
            </div>
          )}
          <Button
            type="button"
            variant={todo.autoSync ? 'primary' : 'outline'}
            size="sm"
            className="canvas-todo-sync-button"
            onClick={(event) => {
              event.stopPropagation();
              onAutoSyncChange?.(todo.id, !todo.autoSync);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t(todo.autoSync ? 'canvasTodoAutoSync' : 'canvasTodoManualSync')}
          </Button>
        </div>
      )}

      <div className="canvas-todo-plan-block">
        <div className="canvas-todo-section-title">{t('canvasTodoPlan')}</div>
        <Textarea
          className="canvas-todo-plan-text"
          value={todo.planText || ''}
          placeholder={t('canvasTodoPlanPlaceholder')}
          spellCheck={false}
          onChange={(event) => onPlanTextChange?.(todo.id, event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </div>

      <div className="canvas-todo-add-row">
        <div className="canvas-todo-section-title">
          <span>{t('canvasTodoTasks')}</span>
          <span>{progressText}</span>
        </div>
        <Input
          value={draft}
          placeholder={t('canvasTodoAddPlaceholder')}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleDraftKeyDown}
        />
        <Button
          type="button"
          variant="primary"
          size="icon"
          className="h-9 w-9"
          disabled={!draft.trim()}
          aria-label={t('addCanvasTodo')}
          onClick={(event) => {
            event.stopPropagation();
            addDraftItem();
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="canvas-todo-items" role="list">
        {items.length === 0 ? (
          <div className="canvas-todo-empty">{t('canvasTodoEmpty')}</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={cn('canvas-todo-item', `is-${item.status || 'todo'}`, item.done && 'is-done')}
              role="listitem"
            >
              <input
                type="checkbox"
                checked={item.done}
                aria-label={item.text || t('canvasTodoItemPlaceholder')}
                onChange={(event) => onItemDoneChange(todo.id, item.id, event.target.checked)}
                onKeyDown={(event) => event.stopPropagation()}
              />
              <Input
                className="canvas-todo-item-text"
                value={item.text}
                placeholder={t('canvasTodoItemPlaceholder')}
                spellCheck={false}
                title={item.text || undefined}
                onChange={(event) => onItemTextChange(todo.id, item.id, event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t('deleteCanvasTodo')}
                aria-label={t('deleteCanvasTodo')}
                onClick={(event) => {
                  event.stopPropagation();
                  onItemRemove(todo.id, item.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div
        className="canvas-todo-resize"
        title={t('resizeCanvasTodo')}
        aria-hidden="true"
        onPointerDown={startResize}
      />
    </section>
  );
}

function CanvasContextMenu({
  groupableEndpointCount,
  idleCommandLineCount,
  language,
  launchProviders = [],
  menu,
  t,
  onAddFrame,
  onAddGrid,
  onAddProviderSession,
  onArrange,
  onClose,
  onCollectIdleCommandLines,
  onGroupEndpoints,
  onOpenGridSessionDialog
}) {
  if (!menu) {
    return null;
  }

  const runAction = (action) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
    onClose();
  };
  const groupLabel = groupableEndpointCount > 0
    ? `${t('groupEndpoints')} ${groupableEndpointCount}`
    : t('groupEndpoints');
  const collectIdleLabel = idleCommandLineCount > 0
    ? `${t('collectIdleCmd')} ${idleCommandLineCount}`
    : t('collectIdleCmd');

  return (
    <div
      className="canvas-context-menu"
      role="menu"
      aria-label={t('canvasContextMenu')}
      style={{
        left: menu.left,
        top: menu.top
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {launchProviders.length > 0 && (
        <>
          <div className="canvas-context-menu-label">{t('addCliSession')}</div>
          {launchProviders.map((provider) => {
            const providerLabel = getCliProviderBadgeLabel(provider, language);

            return (
              <button
                key={provider.id}
                type="button"
                className="canvas-context-menu-item"
                role="menuitem"
                onClick={runAction(() => onAddProviderSession(provider.id, menu.canvasPoint))}
              >
                <CliProviderIcon provider={provider} className="canvas-context-menu-icon" />
                <span>{t('addProviderSession', { provider: providerLabel })}</span>
              </button>
            );
          })}
          <button
            type="button"
            className="canvas-context-menu-item"
            role="menuitem"
            onClick={runAction(() => onAddGrid(menu.canvasPoint))}
          >
            <Grid2X2 className="canvas-context-menu-icon" aria-hidden="true" />
            <span>{t('quickGrid2x2')}</span>
          </button>
          <button
            type="button"
            className="canvas-context-menu-item"
            role="menuitem"
            onClick={runAction(onOpenGridSessionDialog)}
          >
            <LayoutGrid className="canvas-context-menu-icon" aria-hidden="true" />
            <span>{t('addSessionGrid')}</span>
          </button>
          <div className="canvas-context-menu-separator" />
        </>
      )}
      <button
        type="button"
        className="canvas-context-menu-item"
        role="menuitem"
        onClick={runAction(() => onAddFrame(menu.canvasPoint))}
      >
        <Plus className="canvas-context-menu-icon" aria-hidden="true" />
        <span>{t('addCanvasFrame')}</span>
      </button>
      <button
        type="button"
        className="canvas-context-menu-item"
        role="menuitem"
        onClick={runAction(onArrange)}
      >
        <LayoutGrid className="canvas-context-menu-icon" aria-hidden="true" />
        <span>{t('arrange')}</span>
      </button>
      <button
        type="button"
        className="canvas-context-menu-item"
        role="menuitem"
        onClick={runAction(onGroupEndpoints)}
      >
        <Grid2X2 className="canvas-context-menu-icon" aria-hidden="true" />
        <span>{groupLabel}</span>
      </button>
      <button
        type="button"
        className="canvas-context-menu-item"
        role="menuitem"
        onClick={runAction(onCollectIdleCommandLines)}
      >
        <Archive className="canvas-context-menu-icon" aria-hidden="true" />
        <span>{collectIdleLabel}</span>
      </button>
    </div>
  );
}

function SessionConnectionPort({
  active = false,
  className,
  panelId,
  side,
  t,
  onPointerDown,
  onClick
}) {
  return (
    <button
      type="button"
      className={cn('terminal-connection-port', `is-${side}`, active && 'is-active', className)}
      title={t('canvasConnectHint')}
      aria-label={t('canvasConnect')}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPointerDown?.(event, panelId);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.(panelId);
      }}
    >
      <span aria-hidden="true" />
    </button>
  );
}

function CanvasConnectionLayer({
  activeConnectionId,
  connections,
  previewConnection,
  t,
  onDeleteConnection,
  onSelectConnection
}) {
  if (connections.length === 0 && !previewConnection) {
    return <svg className="canvas-connection-layer" aria-hidden="true" />;
  }

  return (
    <svg className="canvas-connection-layer" aria-label={t('canvasConnect')}>
      {connections.map((record) => {
        const active = record.connection.id === activeConnectionId;
        const tone = record.tone || canvasConnectionTones[0];
        return (
          <g
            key={record.connection.id}
            className={cn('canvas-connection', active && 'is-active')}
            style={{
              '--connection-color': tone.color,
              '--connection-glow': tone.glow
            }}
          >
            <path
              className="canvas-connection-hit-area"
              d={record.path}
              role="button"
              tabIndex={0}
              aria-label={t('canvasConnect')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelectConnection?.(record.connection.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectConnection?.(record.connection.id);
                }
              }}
            />
            <path className="canvas-connection-path" d={record.path} />
            <circle className="canvas-connection-terminal" cx={record.from.x} cy={record.from.y} r="4.5" />
            <circle className="canvas-connection-terminal" cx={record.to.x} cy={record.to.y} r="4.5" />
            {active && (
              <foreignObject
                className="canvas-connection-action-wrap"
                x={record.midpoint.x - 14}
                y={record.midpoint.y - 14}
                width="28"
                height="28"
              >
                <button
                  type="button"
                  className="canvas-connection-action"
                  title={t('deleteCanvasConnection')}
                  aria-label={t('deleteCanvasConnection')}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteConnection?.(record.connection.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </foreignObject>
            )}
          </g>
        );
      })}
      {previewConnection && (
        <g
          className="canvas-connection is-preview"
          style={{
            '--connection-color': previewConnection.tone?.color || canvasConnectionTones[0].color,
            '--connection-glow': previewConnection.tone?.glow || canvasConnectionTones[0].glow
          }}
        >
          <path className="canvas-connection-path" d={previewConnection.path} />
          <circle className="canvas-connection-terminal" cx={previewConnection.from.x} cy={previewConnection.from.y} r="4.5" />
          <circle className="canvas-connection-terminal" cx={previewConnection.to.x} cy={previewConnection.to.y} r="4.5" />
        </g>
      )}
    </svg>
  );
}

function EndpointGroup({
  group,
  panels,
  runtimeNow,
  scale,
  commandTargetId,
  connectionMode,
  pendingConnectionSourceId,
  dispatchSparkles = {},
  selectedIds,
  t,
  onActivate,
  onConnectionPortClick,
  onConnectionPortPointerDown,
  onExpandPanel,
  onMove,
  onPanelTitleChange,
  onPanelTitleCommit,
  onSelectToggle,
  onUngroup
}) {
  const statusCounts = panels.reduce((counts, panel) => {
    const state = getPanelExecutionState(panel);
    return { ...counts, [state]: (counts[state] || 0) + 1 };
  }, { running: 0, idle: 0, completed: 0, error: 0 });
  const groupHeight = Math.min(460, 58 + panels.length * 42 + 12);

  const startDrag = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onActivate(group.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: group.x,
      y: group.y
    };

    bindPointerSession((moveEvent) => {
      onMove(group.id, {
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / scale),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / scale)
      });
    });
  };

  const handleTitleKeyDown = (event, panelId) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.blur();
      onPanelTitleCommit(panelId, event.currentTarget.value);
    }
  };

  const handleRowClick = (event, panelId) => {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey) {
      onSelectToggle(panelId);
      return;
    }

    onExpandPanel(panelId);
  };

  return (
    <div
      className={cn('endpoint-group', connectionMode && 'is-connection-mode')}
      data-endpoint-group-id={group.id}
      style={{
        left: group.x,
        top: group.y,
        width: group.width,
        height: groupHeight,
        zIndex: group.zIndex
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onActivate(group.id);
      }}
    >
      <div className="endpoint-group-header" title={t('movePanel')} onPointerDown={startDrag}>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" tabIndex={-1}>
          <GripVertical className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{group.title}</div>
          <div className="truncate text-xs text-muted-foreground">{panels.length}</div>
        </div>
        <div className="endpoint-group-statuses">
          {statusCounts.running > 0 && <SessionStatusTag count={statusCounts.running} state="running" t={t} />}
          {statusCounts.idle > 0 && <SessionStatusTag count={statusCounts.idle} state="idle" t={t} />}
          {statusCounts.completed > 0 && <SessionStatusTag count={statusCounts.completed} state="completed" t={t} />}
          {statusCounts.error > 0 && <SessionStatusTag count={statusCounts.error} state="error" t={t} />}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={t('ungroupEndpoints')}
          aria-label={t('ungroupEndpoints')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onUngroup(group.id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="endpoint-group-list">
        {panels.map((panel) => {
          const selected = selectedIds.has(panel.id);
          const commandTargeted = panel.id === commandTargetId;
          const dispatchSparkleKey = dispatchSparkles[panel.id] || '';
          return (
            <div
              key={panel.id}
              className={cn(
                'endpoint-group-row',
                selected && 'is-selected',
                commandTargeted && 'is-command-target',
                pendingConnectionSourceId === panel.id && 'is-connection-source',
                dispatchSparkleKey && 'is-dispatch-sparkling'
              )}
              data-terminal-id={panel.id}
              role="button"
              tabIndex={0}
              onClick={(event) => handleRowClick(event, panel.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onExpandPanel(panel.id);
                }
              }}
            >
              <SessionConnectionPort
                active={pendingConnectionSourceId === panel.id}
                className="endpoint-group-connection-port"
                panelId={panel.id}
                side="left"
                t={t}
                onPointerDown={onConnectionPortPointerDown}
                onClick={onConnectionPortClick}
              />
              <SessionConnectionPort
                active={pendingConnectionSourceId === panel.id}
                className="endpoint-group-connection-port"
                panelId={panel.id}
                side="right"
                t={t}
                onPointerDown={onConnectionPortPointerDown}
                onClick={onConnectionPortClick}
              />
              {dispatchSparkleKey && (
                <span key={dispatchSparkleKey} className="endpoint-group-row-sparkle" aria-hidden="true">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
              )}
              <span className={cn('terminal-endpoint-dot', `is-${getPanelExecutionState(panel)}`)} aria-hidden="true" />
              <Input
                className="endpoint-group-title"
                value={panel.title}
                aria-label={t('renameSession')}
                spellCheck={false}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => onPanelTitleChange(panel.id, event.target.value)}
                onBlur={(event) => onPanelTitleCommit(panel.id, event.target.value)}
                onKeyDown={(event) => handleTitleKeyDown(event, panel.id)}
              />
              <span className="endpoint-group-tag-slot">
                <SessionTagBadge tag={getPanelSessionTag(panel)} t={t} />
              </span>
              <SessionStatusTag panel={panel} t={t} />
              <SessionRuntimeTag panel={panel} now={runtimeNow} t={t} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t('expandSession')}
                aria-label={t('expandSession')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onExpandPanel(panel.id);
                }}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TerminalPanel({
  panel,
  active,
  language,
  runtimeNow,
  scale,
  sessionHeaderVisibility,
  t,
  theme,
  availableSessionTags,
  visible = true,
  selected = false,
  commandTargeted = false,
  connectionMode = false,
  pendingConnectionSourceId = '',
  arrangeAnimation = null,
  dispatchSparkleKey = '',
  onActivate,
  onAgentAttachImages,
  onAgentInsertDiff,
  onAgentOpenFiles,
  onAgentOpenReview,
  onAgentSetQuickTarget,
  onClose,
  onConnectionPortClick,
  onConnectionPortPointerDown,
  onExpand,
  onMinimize,
  onMove,
  onResize,
  onRestart,
  onModelChange,
  onSelectToggle,
  onTagChange,
  onTerminalInput,
  onTitleChange,
  onTitleCommit,
  registerTerminal
}) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const scrollbarTrackRef = useRef(null);
  const terminalScaleRef = useRef(normalizeTerminalCanvasScale(scale));
  const agentImageInputRef = useRef(null);
  const [openMotionState, setOpenMotionState] = useState('opening');
  const [agentDiffLoading, setAgentDiffLoading] = useState(false);
  const [scrollbarTrackHeight, setScrollbarTrackHeight] = useState(0);
  const [scrollbarState, setScrollbarState] = useState({ baseY: 0, rows: 0, viewportY: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const panelProvider = getPanelCliProvider(panel);
  const panelProviderLabel = getCliProviderBadgeLabel(panelProvider, language);
  const sessionTag = getPanelSessionTag(panel);
  const headerVisibility = normalizeSessionHeaderVisibility(sessionHeaderVisibility);
  const showHeaderTag = headerVisibility.tag;
  const showHeaderModel = headerVisibility.model && hasPanelModelTag(panel);
  const showHeaderContext = headerVisibility.context && hasPanelContextTag(panel);
  const showHeaderStatus = headerVisibility.status;
  const showHeaderRuntime = headerVisibility.runtime;
  const hasHeaderDetails = showHeaderTag
    || showHeaderModel
    || showHeaderContext
    || showHeaderStatus
    || showHeaderRuntime;
  const showAgentUtilityBar = Boolean(String(panel.agentId || panel.agentTask || '').trim());
  const arrangeStyle = arrangeAnimation ? {
    '--canvas-arrange-delay': `${arrangeAnimation.delay || 0}ms`,
    '--canvas-arrange-duration': `${canvasArrangeDurationMs}ms`,
    '--canvas-arrange-dx': `${arrangeAnimation.dx || 0}px`,
    '--canvas-arrange-dy': `${arrangeAnimation.dy || 0}px`,
    '--canvas-arrange-scale-x': String(arrangeAnimation.scaleX || 1),
    '--canvas-arrange-scale-y': String(arrangeAnimation.scaleY || 1)
  } : null;

  const syncInputAnchor = useCallback(() => {
    if (termRef.current) {
      syncTerminalImeAnchor(termRef.current);
    }
  }, []);

  const updateScrollbarTrackHeight = useCallback(() => {
    const trackNode = scrollbarTrackRef.current;
    if (!trackNode) {
      return;
    }

    setScrollbarTrackHeight(trackNode.getBoundingClientRect().height);
  }, []);

  const syncScrollbarState = useCallback(() => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    const nextState = {
      baseY: Math.max(term.buffer.active.baseY || 0, 0),
      rows: Math.max(term.rows || 0, 0),
      viewportY: Math.max(term.buffer.active.viewportY || 0, 0)
    };
    setScrollbarState((current) => (
      current.baseY === nextState.baseY &&
      current.rows === nextState.rows &&
      current.viewportY === nextState.viewportY
    ) ? current : nextState);
  }, []);

  useEffect(() => {
    terminalScaleRef.current = normalizeTerminalCanvasScale(scale);
  }, [scale]);

  useEffect(() => {
    setOpenMotionState('opening');
    const frameId = window.requestAnimationFrame(() => setOpenMotionState('open'));
    const timerId = window.setTimeout(() => setOpenMotionState('done'), terminalPanelOpenDurationMs + 80);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [panel.id]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const openAgentImagePicker = useCallback((event) => {
    event?.stopPropagation?.();
    agentImageInputRef.current?.click();
  }, []);

  const handleAgentImageInputChange = useCallback(async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    await onAgentAttachImages?.(panel.id, files);
  }, [onAgentAttachImages, panel.id]);

  const handleAgentDiffClick = useCallback(async (event) => {
    event.stopPropagation();
    if (agentDiffLoading) {
      return;
    }

    setAgentDiffLoading(true);
    try {
      await onAgentInsertDiff?.(panel.id);
    } finally {
      setAgentDiffLoading(false);
    }
  }, [agentDiffLoading, onAgentInsertDiff, panel.id]);

  const openPanelContextMenu = useCallback((event) => {
    if (!visible) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate(panel.id);

    const maxX = Math.max(8, window.innerWidth - terminalContextMenuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - terminalContextMenuEstimatedHeight - 8);
    const term = termRef.current;

    setContextMenu({
      hasSelection: Boolean(term?.hasSelection?.()),
      x: clamp(event.clientX, 8, maxX),
      y: clamp(event.clientY, 8, maxY)
    });
  }, [onActivate, panel.id, visible]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handlePointerDown = () => closeContextMenu();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', closeContextMenu);
      window.removeEventListener('resize', closeContextMenu);
    };
  }, [closeContextMenu, contextMenu]);

  const fitTerminal = useCallback(() => {
    window.requestAnimationFrame(() => {
      const fitAddon = fitAddonRef.current;
      if (!fitAddon || !termRef.current) {
        return;
      }

      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions ? fitAddon.proposeDimensions() : null;
        if (dims && Number.isFinite(dims.cols) && Number.isFinite(dims.rows)) {
          bridge.resizeTerminal(panel.id, dims.cols, dims.rows);
        }
        syncScrollbarState();
        syncInputAnchor();
      } catch {
        // Fitting can race with unmount.
      }
    });
  }, [panel.id, syncInputAnchor, syncScrollbarState]);

  useEffect(() => {
    const trackNode = scrollbarTrackRef.current;
    if (!trackNode) {
      return undefined;
    }

    updateScrollbarTrackHeight();

    if (typeof ResizeObserver !== 'function') {
      return undefined;
    }

    const observer = new ResizeObserver(() => updateScrollbarTrackHeight());
    observer.observe(trackNode);
    return () => observer.disconnect();
  }, [panel.minimized, scrollbarState.baseY, updateScrollbarTrackHeight, visible]);

  useLayoutEffect(() => {
    if (!visible || panel.minimized) {
      return;
    }

    updateScrollbarTrackHeight();
    const frameId = window.requestAnimationFrame(() => updateScrollbarTrackHeight());
    return () => window.cancelAnimationFrame(frameId);
  }, [panel.minimized, scale, updateScrollbarTrackHeight, visible]);

  useEffect(() => {
    const term = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.14,
      letterSpacing: 0,
      scrollback: terminalScrollbackLines,
      theme: terminalThemes[theme],
      windowsMode: true
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    const unpatchTerminalMouseInteractions = patchTerminalMouseInteractionsForScale(
      term,
      () => terminalScaleRef.current
    );

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || event.altKey) {
        return true;
      }

      const key = event.key.toLowerCase();
      const commandModifier = event.ctrlKey || event.metaKey;
      const copyShortcut = (
        commandModifier &&
        key === 'c' &&
        (event.shiftKey || term.hasSelection())
      ) || (event.ctrlKey && key === 'insert');
      const pasteShortcut = (
        commandModifier &&
        key === 'v'
      ) || (event.shiftKey && key === 'insert');

      if (copyShortcut) {
        event.preventDefault();
        event.stopPropagation();
        copyTerminalSelection(term);
        return false;
      }

      if (pasteShortcut) {
        event.preventDefault();
        event.stopPropagation();
        pasteClipboardIntoTerminal(term);
        return false;
      }

      return true;
    });

    const terminalElement = term.element;
    const terminalTextarea = term.textarea;
    const handleCopy = (event) => {
      if (copyTerminalSelection(term)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handlePaste = (event) => {
      const text = event.clipboardData?.getData('text/plain') || readClipboardText();
      if (pasteClipboardIntoTerminal(term, text)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleTextAreaFocus = () => {
      window.requestAnimationFrame(() => syncTerminalImeAnchor(term));
    };

    terminalElement?.addEventListener('copy', handleCopy);
    terminalElement?.addEventListener('paste', handlePaste);
    terminalTextarea?.addEventListener('focus', handleTextAreaFocus);

    const dataDisposable = term.onData((data) => {
      onTerminalInput(panel.id, data);
      bridge.writeTerminal(panel.id, data);
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => bridge.resizeTerminal(panel.id, cols, rows));
    const scrollDisposable = term.onScroll(() => syncScrollbarState());
    const writeParsedDisposable = term.onWriteParsed(() => syncScrollbarState());
    const unregister = registerTerminal(panel.id, { term, fitAddon, fit: fitTerminal });

    term.write(`\x1b[38;5;246m${panel.cwd}\x1b[0m\r\n`);
    fitTerminal();
    window.requestAnimationFrame(() => {
      syncScrollbarState();
      syncTerminalImeAnchor(term);
    });

    return () => {
      unpatchTerminalMouseInteractions();
      terminalElement?.removeEventListener('copy', handleCopy);
      terminalElement?.removeEventListener('paste', handlePaste);
      terminalTextarea?.removeEventListener('focus', handleTextAreaFocus);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      scrollDisposable.dispose();
      writeParsedDisposable.dispose();
      unregister();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fitTerminal, onTerminalInput, panel.cwd, panel.id, registerTerminal, syncScrollbarState]);

  useEffect(() => {
    if (visible && !panel.minimized) {
      fitTerminal();
    }
  }, [fitTerminal, panel.height, panel.minimized, panel.width, visible]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = terminalThemes[theme];
      termRef.current.refresh(0, termRef.current.rows - 1);
    }
  }, [theme]);

  useEffect(() => {
    if (active && !panel.minimized) {
      focusTerminalForTextInput(termRef.current);
    }
  }, [active, panel.minimized]);

  useEffect(() => {
    if (!visible || panel.minimized || !termRef.current) {
      return;
    }

    updateScrollbarTrackHeight();
    termRef.current.refresh(0, termRef.current.rows - 1);
    syncScrollbarState();
    syncInputAnchor();
  }, [panel.minimized, scale, syncInputAnchor, syncScrollbarState, updateScrollbarTrackHeight, visible]);

  const scrollbarMetrics = useMemo(() => {
    const maxViewportY = Math.max(scrollbarState.baseY, 0);
    const visibleRows = Math.max(scrollbarState.rows, 0);
    const scrollable = maxViewportY > 0 && visibleRows > 0 && scrollbarTrackHeight > 0;

    if (!scrollable) {
      return {
        maxViewportY,
        scrollable: maxViewportY > 0 && visibleRows > 0,
        thumbHeight: 0,
        thumbTop: 0
      };
    }

    const totalRows = Math.max(maxViewportY + visibleRows, visibleRows);
    const thumbHeight = Math.max((visibleRows / totalRows) * scrollbarTrackHeight, 24);
    const travel = Math.max(scrollbarTrackHeight - thumbHeight, 0);
    const thumbTop = maxViewportY > 0 ? (scrollbarState.viewportY / maxViewportY) * travel : 0;

    return {
      maxViewportY,
      scrollable: true,
      thumbHeight,
      thumbTop
    };
  }, [scrollbarState, scrollbarTrackHeight]);

  const scrollTerminalToRatio = useCallback((ratio) => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    const maxViewportY = Math.max(term.buffer.active.baseY || 0, 0);
    if (maxViewportY <= 0) {
      return;
    }

    term.scrollToLine(Math.round(clamp(ratio, 0, 1) * maxViewportY));
    syncScrollbarState();
  }, [syncScrollbarState]);

  const startScrollbarDrag = useCallback((event, initialOffset) => {
    if (event.button !== 0 || !scrollbarMetrics.scrollable) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onActivate(panel.id);

    const trackRect = scrollbarTrackRef.current?.getBoundingClientRect();
    if (!trackRect) {
      return;
    }

    const thumbHeight = Math.max(scrollbarMetrics.thumbHeight, 1);
    const travel = Math.max(trackRect.height - thumbHeight, 0);
    const applyPointer = (clientY) => {
      const nextTop = clamp(clientY - trackRect.top - initialOffset, 0, travel);
      scrollTerminalToRatio(travel > 0 ? nextTop / travel : 0);
    };

    applyPointer(event.clientY);

    bindPointerSession((moveEvent) => applyPointer(moveEvent.clientY));
  }, [onActivate, panel.id, scrollTerminalToRatio, scrollbarMetrics]);

  const startScrollbarTrackDrag = useCallback((event) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    startScrollbarDrag(event, scrollbarMetrics.thumbHeight / 2);
  }, [scrollbarMetrics.thumbHeight, startScrollbarDrag]);

  const startScrollbarThumbDrag = useCallback((event) => {
    const thumbRect = event.currentTarget.getBoundingClientRect();
    startScrollbarDrag(event, event.clientY - thumbRect.top);
  }, [startScrollbarDrag]);

  const startDrag = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onActivate(panel.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: panel.x,
      y: panel.y
    };

    bindPointerSession((moveEvent) => {
      onMove(panel.id, {
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / scale),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / scale)
      });
    });
  };

  const startResize = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onActivate(panel.id);

    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      width: panel.width,
      height: panel.height
    };

    bindPointerSession((moveEvent) => {
      onResize(panel.id, {
        width: Math.round(clamp(start.width + (moveEvent.clientX - start.clientX) / scale, 360, 1800)),
        height: Math.round(clamp(start.height + (moveEvent.clientY - start.clientY) / scale, 220, 1200))
      });
    }, () => {
      fitTerminal();
    });
  };

  const handleTitleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const copySelectionFromContextMenu = () => {
    const term = termRef.current;
    if (term) {
      copyTerminalSelection(term, true);
    }
    closeContextMenu();
  };

  const pasteFromContextMenu = () => {
    const term = termRef.current;
    if (term) {
      pasteClipboardIntoTerminal(term);
    }
    closeContextMenu();
  };

  const renameFromContextMenu = () => {
    closeContextMenu();
    const value = window.prompt(t('renameSessionPrompt'), panel.title);
    if (value !== null) {
      onTitleCommit(panel.id, value);
    }
  };

  const switchModelFromContextMenu = (model) => {
    closeContextMenu();
    onModelChange?.(panel.id, model);
  };

  const promptModelFromContextMenu = () => {
    closeContextMenu();
    const current = String(panel.codexModel || '').trim();
    const fallback = current || getPanelQuickModelOptions(panel)[0] || '';
    const value = window.prompt(t('modelPrompt'), fallback);
    if (value !== null) {
      onModelChange?.(panel.id, value);
    }
  };

  const currentModel = String(panel.codexModel || '').trim();
  const modelOptions = getPanelQuickModelOptions(panel);
  const hasCustomCurrentModel = currentModel && !modelOptions.includes(currentModel);
  const canSwitchModel = hasPanelModelTag(panel) && canPanelReceiveInput(panel);
  const contextMenuPortal = contextMenu ? createPortal(
    <div
      className="terminal-context-menu"
      role="menu"
      aria-label={t('sessionContextMenu')}
      style={{
        left: contextMenu.x,
        top: contextMenu.y
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="terminal-context-menu-header">
        <CliProviderIcon provider={panelProvider} className="h-4 w-4" />
        <span className="terminal-context-menu-title">{panel.title}</span>
      </div>
      <button
        type="button"
        className="terminal-context-menu-item"
        role="menuitem"
        disabled={!contextMenu.hasSelection}
        onClick={copySelectionFromContextMenu}
      >
        <ClipboardCopy className="terminal-context-menu-icon" />
        <span>{t('copySelection')}</span>
      </button>
      <button
        type="button"
        className="terminal-context-menu-item"
        role="menuitem"
        onClick={pasteFromContextMenu}
      >
        <ClipboardPaste className="terminal-context-menu-icon" />
        <span>{t('pasteClipboard')}</span>
      </button>
      <button
        type="button"
        className="terminal-context-menu-item"
        role="menuitem"
        onClick={renameFromContextMenu}
      >
        <PencilLine className="terminal-context-menu-icon" />
        <span>{t('renameSession')}</span>
      </button>
      {hasPanelModelTag(panel) && (
        <>
          <div className="terminal-context-menu-separator" />
          <div className="terminal-context-menu-label">
            <BrainCircuit className="terminal-context-menu-icon" />
            <span>{t('switchSessionModel')}</span>
          </div>
          <div className="terminal-context-menu-models">
            {modelOptions.map((model) => {
              const selectedModel = currentModel === model;
              return (
                <button
                  key={model}
                  type="button"
                  className={cn('terminal-context-menu-model', selectedModel && 'is-selected')}
                  disabled={!canSwitchModel || selectedModel}
                  onClick={() => switchModelFromContextMenu(model)}
                >
                  <span>{model}</span>
                  {selectedModel && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
            {hasCustomCurrentModel && (
              <button
                type="button"
                className="terminal-context-menu-model is-selected"
                disabled
              >
                <span>{currentModel}</span>
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="terminal-context-menu-model"
              disabled={!canSwitchModel}
              onClick={promptModelFromContextMenu}
            >
              <span>{t('customModel')}</span>
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <Card
      className={cn(
        'terminal-panel',
        active && !panel.minimized && 'active',
        showAgentUtilityBar && 'is-agent-session',
        panel.minimized && 'is-minimized',
        panel.minimized && selected && 'is-selected',
        commandTargeted && 'is-command-target',
        connectionMode && 'is-connection-mode',
        pendingConnectionSourceId === panel.id && 'is-connection-source',
        arrangeAnimation && 'is-arranging',
        dispatchSparkleKey && 'is-dispatch-sparkling',
        openMotionState !== 'done' && 't-modal',
        openMotionState === 'open' && 'is-open',
        !visible && 'is-hidden'
      )}
      data-terminal-id={panel.id}
      aria-hidden={!visible}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.minimized ? endpointWidth : panel.width,
        height: panel.minimized ? endpointHeight : panel.height,
        zIndex: panel.zIndex,
        ...arrangeStyle
      }}
      onPointerDown={() => {
        if (visible) {
          onActivate(panel.id);
        }
      }}
      onContextMenu={openPanelContextMenu}
    >
      {contextMenuPortal}
      {visible && (
        <>
          <SessionConnectionPort
            active={pendingConnectionSourceId === panel.id}
            panelId={panel.id}
            side="left"
            t={t}
            onPointerDown={onConnectionPortPointerDown}
            onClick={onConnectionPortClick}
          />
          <SessionConnectionPort
            active={pendingConnectionSourceId === panel.id}
            panelId={panel.id}
            side="right"
            t={t}
            onPointerDown={onConnectionPortPointerDown}
            onClick={onConnectionPortClick}
          />
        </>
      )}
      {dispatchSparkleKey && (
        <div key={dispatchSparkleKey} className="terminal-panel-dispatch-sparkle" aria-hidden="true">
          <Sparkles className="terminal-panel-dispatch-sparkle-icon h-4 w-4" />
        </div>
      )}
      {panel.minimized ? (
        <div
          className="terminal-endpoint"
          role="button"
          tabIndex={visible ? 0 : -1}
          title={t('expandSession')}
          onPointerDown={(event) => {
            event.stopPropagation();
            onActivate(panel.id);
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.ctrlKey || event.metaKey) {
              onSelectToggle(panel.id);
              return;
            }
            onExpand(panel.id);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onExpand(panel.id);
            }
          }}
        >
          <SessionTagBadge className="terminal-endpoint-tag" tag={sessionTag} t={t} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            title={t('movePanel')}
            aria-label={t('movePanel')}
            onPointerDown={startDrag}
            onClick={(event) => event.stopPropagation()}
          >
            <CliProviderIcon provider={panelProvider} className="h-4 w-4" />
          </Button>
          <span className={cn('terminal-endpoint-dot', `is-${getPanelExecutionState(panel)}`)} aria-hidden="true" />
          <Input
            className="terminal-endpoint-title"
            value={panel.title}
            aria-label={t('renameSession')}
            spellCheck={false}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => onActivate(panel.id)}
            onChange={(event) => onTitleChange(panel.id, event.target.value)}
            onBlur={(event) => onTitleCommit(panel.id, event.target.value)}
            onKeyDown={handleTitleKeyDown}
          />
          <SessionStatusTag panel={panel} t={t} />
          <SessionRuntimeTag panel={panel} now={runtimeNow} t={t} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t('expandSession')}
            aria-label={t('expandSession')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onExpand(panel.id);
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <CardHeader
          className="terminal-panel-header space-y-0"
          title={t('movePanel')}
          onPointerDown={startDrag}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="terminal-panel-provider h-6 w-6 text-muted-foreground"
            tabIndex={-1}
          >
            <CliProviderIcon provider={panelProvider} className="h-4 w-4" />
          </Button>
          <Input
            className="terminal-panel-title-input h-6 min-w-0 cursor-text border-transparent bg-transparent px-2 text-sm font-semibold shadow-none focus:border-border focus:bg-background focus-visible:ring-0"
            value={panel.title}
            aria-label={t('renameSession')}
            spellCheck={false}
            onPointerDown={(event) => event.stopPropagation()}
            onFocus={() => onActivate(panel.id)}
            onChange={(event) => onTitleChange(panel.id, event.target.value)}
            onBlur={(event) => onTitleCommit(panel.id, event.target.value)}
            onKeyDown={handleTitleKeyDown}
          />
          {hasHeaderDetails && (
            <div className="terminal-panel-header-details">
              {showHeaderTag && (
                <SessionTagControl
                  availableTags={availableSessionTags}
                  value={sessionTag}
                  t={t}
                  onChange={(nextTag) => onTagChange?.(panel.id, nextTag)}
                />
              )}
              {showHeaderModel && <SessionModelTag panel={panel} t={t} />}
              {showHeaderContext && <SessionContextTag panel={panel} t={t} />}
              {showHeaderStatus && <SessionStatusTag panel={panel} t={t} />}
              {showHeaderRuntime && <SessionRuntimeTag panel={panel} now={runtimeNow} t={t} />}
            </div>
          )}
          <div className="terminal-panel-actions">
            <SessionHeaderMetaMenu
              availableTags={availableSessionTags}
              onTagChange={onTagChange}
              panel={panel}
              runtimeNow={runtimeNow}
              sessionTag={sessionTag}
              t={t}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 text-xs font-bold"
              title={t('minimizeSession')}
              aria-label={t('minimizeSession')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onMinimize(panel.id)}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-6 w-6 text-xs font-bold"
              title={t('restart')}
              aria-label={t('restart')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (window.confirm(t('restartConfirm'))) {
                  onRestart(panel.id);
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-6 w-6"
              title={t('close')}
              aria-label={t('close')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                if (window.confirm(t('closeConfirm'))) {
                  onClose(panel.id);
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
      )}
      {showAgentUtilityBar && (
        <div
          className="agent-utility-bar"
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <input
            ref={agentImageInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            multiple
            tabIndex={-1}
            onChange={handleAgentImageInputChange}
          />
          <div className="agent-utility-summary" title={panelProviderLabel}>
            <CliProviderIcon provider={panelProvider} className="h-3.5 w-3.5" />
            <span>{t('agentUtilityBarTitle')}</span>
          </div>
          <div className="agent-utility-actions">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="agent-utility-action"
              title={t('agentUtilityQuickTargetTitle')}
              aria-label={t('agentUtilityQuickTargetTitle')}
              onClick={(event) => {
                event.stopPropagation();
                onAgentSetQuickTarget?.(panel.id);
              }}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              {t('agentUtilityQuickTarget')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="agent-utility-action"
              title={t('agentUtilityAttachImageTitle')}
              aria-label={t('agentUtilityAttachImageTitle')}
              onClick={openAgentImagePicker}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              {t('agentUtilityAttachImage')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="agent-utility-action"
              title={t('agentUtilityFilesTitle')}
              aria-label={t('agentUtilityFilesTitle')}
              onClick={(event) => {
                event.stopPropagation();
                onAgentOpenFiles?.(panel.id);
              }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('agentUtilityFiles')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="agent-utility-action"
              title={t('agentUtilityDiffTitle')}
              aria-label={t('agentUtilityDiffTitle')}
              onClick={handleAgentDiffClick}
              disabled={agentDiffLoading}
            >
              {agentDiffLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitBranch className="h-3.5 w-3.5" />
              )}
              {agentDiffLoading ? t('agentUtilityDiffLoading') : t('agentUtilityDiff')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="agent-utility-action"
              title={t('agentUtilityReviewTitle')}
              aria-label={t('agentUtilityReviewTitle')}
              onClick={(event) => {
                event.stopPropagation();
                onAgentOpenReview?.(panel.id);
              }}
            >
              <FileDiff className="h-3.5 w-3.5" />
              {t('agentUtilityReview')}
            </Button>
          </div>
        </div>
      )}
      <CardContent className="terminal-host p-2" onWheel={(event) => event.stopPropagation()}>
        <div ref={hostRef} className="terminal-host-surface" />
        {!panel.minimized && scrollbarMetrics.scrollable && (
          <div
            ref={scrollbarTrackRef}
            className="terminal-scrollbar"
            aria-hidden="true"
            onPointerDown={startScrollbarTrackDrag}
          >
            <div
              className="terminal-scrollbar-thumb"
              onPointerDown={startScrollbarThumbDrag}
              style={{
                height: `${scrollbarMetrics.thumbHeight}px`,
                transform: `translateY(${scrollbarMetrics.thumbTop}px)`
              }}
            />
          </div>
        )}
      </CardContent>
      {!panel.minimized && (
        <div className="resize-handle" title={t('resize')} onPointerDown={startResize} />
      )}
    </Card>
  );
}

function getConfigFileMeta(fileId) {
  return codexFileMeta[fileId] || codexFileMeta.config;
}

function isCodexConfigFile(fileId) {
  return getConfigFileMeta(fileId).owner === 'codex';
}

function isClaudeConfigFile(fileId) {
  return getConfigFileMeta(fileId).owner === 'claude';
}

function getConfigFileGroup(fileId) {
  return isClaudeConfigFile(fileId) ? 'claudeSettings' : 'codex';
}

function getConfigFileKind(fileId) {
  return getConfigFileMeta(fileId).kind || fileId;
}

function readCliConfigFile(fileId) {
  const kind = getConfigFileKind(fileId);
  return isClaudeConfigFile(fileId)
    ? bridge.readClaudeConfig(kind)
    : bridge.readCodexConfig(kind);
}

function validateCliConfigFile(fileId, content) {
  const kind = getConfigFileKind(fileId);
  return isClaudeConfigFile(fileId)
    ? bridge.validateClaudeConfig(kind, content)
    : bridge.validateCodexConfig(kind, content);
}

function writeCliConfigFile(fileId, content) {
  const kind = getConfigFileKind(fileId);
  return isClaudeConfigFile(fileId)
    ? bridge.writeClaudeConfig(kind, content)
    : bridge.writeCodexConfig(kind, content);
}

function listCliConfigFileBackups(fileId) {
  const kind = getConfigFileKind(fileId);
  return isClaudeConfigFile(fileId)
    ? bridge.listClaudeConfigBackups(kind)
    : bridge.listCodexConfigBackups(kind);
}

function restoreCliConfigFileBackup(fileId, backupName) {
  const kind = getConfigFileKind(fileId);
  return isClaudeConfigFile(fileId)
    ? bridge.restoreClaudeConfigBackup(kind, backupName)
    : bridge.restoreCodexConfigBackup(kind, backupName);
}

function UsageTrackingPanel({
  language,
  loading,
  onClearRecords,
  onRateChange,
  onSaveRates,
  ratesDraft,
  saving,
  status,
  statusTone,
  tracking,
  t
}) {
  const records = Array.isArray(tracking?.records) ? tracking.records : [];
  const rates = normalizeUsageRates(ratesDraft);
  const summary = summarizeUsageRecords(records, rates);
  const providerIds = Array.from(new Set([
    ...cliProviders.map((provider) => provider.id).filter(Boolean),
    ...records.map((record) => record.cliProviderId).filter(Boolean)
  ]));
  const providerSummaries = Object.values(summary.byProvider)
    .sort((a, b) => b.estimatedCost - a.estimatedCost || b.estimatedTokens - a.estimatedTokens);
  const recentRecords = [...records]
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0))
    .slice(0, 5);
  const statusText = loading ? t('loading') : status;

  const getProviderLabel = (providerId) => {
    const provider = getCliProviderById(providerId);
    return provider ? getCliProviderDisplayName(provider, language) : providerId;
  };

  const renderSummaryMetric = (label, value) => (
    <div className="grid min-w-0 gap-1 rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="truncate text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="truncate font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );

  return (
    <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{t('usageTracking')}</div>
          <div className="text-xs text-muted-foreground">{t('usageTrackingDescription')}</div>
          {tracking?.path ? (
            <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={tracking.path}>
              {tracking.path}
            </div>
          ) : null}
        </div>
        <div
          className={cn(
            'min-h-5 text-sm text-muted-foreground',
            statusTone === 'ok' && 'text-emerald-700 dark:text-emerald-200',
            statusTone === 'error' && 'text-red-700 dark:text-red-200'
          )}
        >
          {statusText}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {renderSummaryMetric(t('usageSessions'), formatUsageNumber(summary.sessions))}
        {renderSummaryMetric(t('usageRuntime'), formatElapsedDuration(0, summary.runtimeMs))}
        {renderSummaryMetric(t('usageEstimatedTokens'), formatUsageNumber(summary.estimatedTokens))}
        {renderSummaryMetric(t('usageEstimatedCost'), formatUsageCurrency(summary.estimatedCost))}
        {renderSummaryMetric(t('usageOutput'), formatBytes(summary.transcriptBytes))}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="grid min-w-0 gap-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-muted-foreground">{t('usageRate')}</div>
            <div className="text-[11px] text-muted-foreground">{t('usageRateHint')}</div>
          </div>
          <div className="grid max-h-44 gap-2 overflow-auto pr-1">
            {providerIds.map((providerId) => {
              const provider = getCliProviderById(providerId);
              const rateValue = ratesDraft?.[providerId]?.costPerMillionTokens ?? '';

              return (
                <Label key={providerId} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <CliProviderIcon provider={provider} providerId={providerId} className="h-4 w-4" />
                    <span className="truncate">{getProviderLabel(providerId)}</span>
                  </span>
                  <Input
                    className="h-8 text-right font-mono text-xs"
                    type="number"
                    min="0"
                    step="0.01"
                    value={rateValue}
                    onChange={(event) => onRateChange(providerId, event.target.value)}
                    disabled={saving || loading}
                  />
                </Label>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={onSaveRates} disabled={saving || loading}>
              <Save className="h-3.5 w-3.5" />
              {t('saveUsageRates')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearRecords}
              disabled={saving || loading || records.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('clearUsageRecords')}
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <div className="grid min-w-0 content-start gap-2">
            <div className="text-xs font-semibold text-muted-foreground">{t('usageByCli')}</div>
            {providerSummaries.length > 0 ? providerSummaries.map((item) => (
              <div key={item.providerId} className="grid min-w-0 gap-1 rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-xs font-medium">
                    <CliProviderIcon providerId={item.providerId} className="h-4 w-4" />
                    <span className="truncate">{getProviderLabel(item.providerId)}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatUsageCurrency(item.estimatedCost)}</span>
                </div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {formatUsageNumber(item.sessions)} / {formatUsageNumber(item.estimatedTokens)} tokens / {formatElapsedDuration(0, item.runtimeMs)}
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                {t('usageNoRecords')}
              </div>
            )}
          </div>

          <div className="grid min-w-0 content-start gap-2">
            <div className="text-xs font-semibold text-muted-foreground">{t('usageRecentSessions')}</div>
            {recentRecords.length > 0 ? recentRecords.map((record) => (
              <div key={record.id} className="grid min-w-0 gap-1 rounded-md border border-border bg-background/60 px-3 py-2">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium" title={record.title || record.initialCommand}>
                    {record.title || getProviderLabel(record.cliProviderId)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{formatUsageCurrency(getUsageRecordCost(record, rates))}</span>
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {getProviderLabel(record.cliProviderId)} / {formatUsageNumber(record.estimatedTokens)} tokens / {formatTime(record.endedAt)}
                </div>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                {t('usageNoRecords')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CodexConfigDialog({
  appZoomFactor,
  canvasMode,
  commandDockShortcuts,
  historyProject,
  initialSettingsTab = 'preferences',
  language,
  onAppZoomFactorChange,
  onCanvasModeChange,
  onCommandDockShortcutChange,
  onHistoryProjectOpen,
  onLanguageChange,
  onOpenChange,
  onProfileChanged,
  onSessionHeaderVisibilityChange,
  open,
  sessionHeaderVisibility,
  showToast,
  t
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState(initialSettingsTab || 'preferences');
  const [activeFile, setActiveFile] = useState('config');
  const [lastCodexFile, setLastCodexFile] = useState('config');
  const [pathText, setPathText] = useState('');
  const [value, setValue] = useState('');
  const [lastSavedValue, setLastSavedValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [status, setStatus] = useState('未加载');
  const [statusTone, setStatusTone] = useState('');
  const [saving, setSaving] = useState(false);
  const [backups, setBackups] = useState([]);
  const [selectedBackup, setSelectedBackup] = useState('');
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [profile, setProfile] = useState(createEmptyCodexProfile);
  const [profileDirty, setProfileDirty] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState('');
  const [profileStatusTone, setProfileStatusTone] = useState('');
  const [quickProfiles, setQuickProfiles] = useState([]);
  const [selectedQuickProfileId, setSelectedQuickProfileId] = useState('');
  const [quickProfilesPath, setQuickProfilesPath] = useState('');
  const [quickProfilesLoading, setQuickProfilesLoading] = useState(false);
  const [claudeProfile, setClaudeProfile] = useState(createEmptyClaudeProfile);
  const [claudeProfileDirty, setClaudeProfileDirty] = useState(false);
  const [claudeProfileSaving, setClaudeProfileSaving] = useState(false);
  const [claudeProfileStatus, setClaudeProfileStatus] = useState('');
  const [claudeProfileStatusTone, setClaudeProfileStatusTone] = useState('');
  const [claudeQuickProfiles, setClaudeQuickProfiles] = useState([]);
  const [selectedClaudeQuickProfileId, setSelectedClaudeQuickProfileId] = useState('');
  const [claudeQuickProfilesPath, setClaudeQuickProfilesPath] = useState('');
  const [claudeQuickProfilesLoading, setClaudeQuickProfilesLoading] = useState(false);
  const [imageApiConfig, setImageApiConfig] = useState(createEmptyImageApiConfig);
  const [imageApiDirty, setImageApiDirty] = useState(false);
  const [imageApiSaving, setImageApiSaving] = useState(false);
  const [imageApiStatus, setImageApiStatus] = useState('');
  const [imageApiStatusTone, setImageApiStatusTone] = useState('');
  const [usageTracking, setUsageTracking] = useState(createEmptyUsageTrackingState);
  const [usageRatesDraft, setUsageRatesDraft] = useState({});
  const [usageDirty, setUsageDirty] = useState(false);
  const [usageSaving, setUsageSaving] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageStatus, setUsageStatus] = useState('');
  const [usageStatusTone, setUsageStatusTone] = useState('');
  const validationSeq = useRef(0);
  const validationTimer = useRef(null);
  const editorRef = useRef(null);

  const setStatusMessage = useCallback((message, tone = '') => {
    setStatus(message);
    setStatusTone(tone);
  }, []);

  const setProfileStatusMessage = useCallback((message, tone = '') => {
    setProfileStatus(message);
    setProfileStatusTone(tone);
  }, []);

  const setClaudeProfileStatusMessage = useCallback((message, tone = '') => {
    setClaudeProfileStatus(message);
    setClaudeProfileStatusTone(tone);
  }, []);

  const setImageApiStatusMessage = useCallback((message, tone = '') => {
    setImageApiStatus(message);
    setImageApiStatusTone(tone);
  }, []);

  const setUsageStatusMessage = useCallback((message, tone = '') => {
    setUsageStatus(message);
    setUsageStatusTone(tone);
  }, []);

  const selectedQuickProfile = useMemo(
    () => quickProfiles.find((record) => record.id === selectedQuickProfileId) || null,
    [quickProfiles, selectedQuickProfileId]
  );

  const selectedClaudeQuickProfile = useMemo(
    () => claudeQuickProfiles.find((record) => record.id === selectedClaudeQuickProfileId) || null,
    [claudeQuickProfiles, selectedClaudeQuickProfileId]
  );
  const activeFileGroup = getConfigFileGroup(activeFile);
  const activeCodexFile = isCodexConfigFile(activeFile)
    ? activeFile
    : (lastCodexFile === 'auth' ? 'auth' : 'config');

  useEffect(() => {
    if (open && initialSettingsTab) {
      setActiveSettingsTab(initialSettingsTab);
    }
  }, [initialSettingsTab, open]);

  useEffect(() => {
    if (activeFile === 'auth' || activeFile === 'config') {
      setLastCodexFile(activeFile);
    }
  }, [activeFile]);

  const loadFile = useCallback(async (kind) => {
    setStatusMessage(t('loading'));
    const snapshot = await readCliConfigFile(kind);
    const meta = getConfigFileMeta(kind);
    setPathText(snapshot.path);
    setValue(snapshot.content || '');
    setLastSavedValue(snapshot.content || '');
    setDirty(false);
    setInvalid(false);

    if (snapshot.exists) {
      const modified = formatTime(snapshot.modifiedAt);
      setStatusMessage(modified ? `已加载，修改时间 ${modified}` : '已加载', 'ok');
    } else {
      setStatusMessage(meta.missing);
    }

    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, [setStatusMessage, t]);

  const loadBackups = useCallback(async (kind) => {
    setBackupsLoading(true);
    try {
      const items = await listCliConfigFileBackups(kind);
      setBackups(items);
      setSelectedBackup((current) => (
        items.some((item) => item.name === current) ? current : (items[0]?.name || '')
      ));
      return items;
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const loadQuickProfiles = useCallback(async () => {
    setQuickProfilesLoading(true);
    try {
      const store = await bridge.listCodexQuickProfiles();
      const profiles = Array.isArray(store.profiles) ? store.profiles : [];
      setQuickProfiles(profiles);
      setQuickProfilesPath(store.path || '');
      setSelectedQuickProfileId((current) => (
        profiles.some((record) => record.id === current) ? current : ''
      ));
      return store;
    } finally {
      setQuickProfilesLoading(false);
    }
  }, []);

  const loadClaudeQuickProfiles = useCallback(async () => {
    setClaudeQuickProfilesLoading(true);
    try {
      const store = await bridge.listClaudeQuickProfiles();
      const profiles = Array.isArray(store.profiles) ? store.profiles : [];
      setClaudeQuickProfiles(profiles);
      setClaudeQuickProfilesPath(store.path || '');
      setSelectedClaudeQuickProfileId((current) => (
        profiles.some((record) => record.id === current) ? current : ''
      ));
      return store;
    } finally {
      setClaudeQuickProfilesLoading(false);
    }
  }, []);

  const loadImageApiConfig = useCallback(async () => {
    setImageApiStatusMessage(t('loading'));
    const snapshot = await bridge.readImageApiConfig();
    setImageApiConfig(normalizeImageApiConfig(snapshot));
    setImageApiDirty(false);
    setImageApiStatusMessage(t('imageApiConfigLoaded'), 'ok');
    return snapshot;
  }, [setImageApiStatusMessage, t]);

  const loadUsageTracking = useCallback(async () => {
    setUsageLoading(true);
    setUsageStatusMessage(t('loading'));
    try {
      const snapshot = await bridge.readUsageTracking();
      const normalized = normalizeUsageTrackingState(snapshot);
      setUsageTracking(normalized);
      setUsageRatesDraft(normalized.rates);
      setUsageDirty(false);
      setUsageStatusMessage(t('usageTrackingLoaded'), 'ok');
      return normalized;
    } finally {
      setUsageLoading(false);
    }
  }, [setUsageStatusMessage, t]);

  const loadProfile = useCallback(async () => {
    setProfileStatusMessage(t('loading'));
    const snapshot = await bridge.readCodexProfile();
    setProfile(normalizeCodexProfile(snapshot.profile));
    setSelectedQuickProfileId('');
    setProfileDirty(false);
    setProfileStatusMessage(t('quickConfigLoaded'), 'ok');
    return snapshot;
  }, [setProfileStatusMessage, t]);

  const loadClaudeProfile = useCallback(async () => {
    setClaudeProfileStatusMessage(t('loading'));
    const snapshot = await bridge.readClaudeProfile();
    setClaudeProfile(normalizeClaudeProfile(snapshot.profile));
    setSelectedClaudeQuickProfileId('');
    setClaudeProfileDirty(false);
    setClaudeProfileStatusMessage(t('quickConfigLoaded'), 'ok');
    return snapshot;
  }, [setClaudeProfileStatusMessage, t]);

  const syncProfileState = useCallback(async () => {
    const snapshot = await loadProfile();
    onProfileChanged?.(normalizeCodexProfile(snapshot.profile));
    return snapshot;
  }, [loadProfile, onProfileChanged]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadFile(activeFile).catch((error) => {
      setStatusMessage(error.message, 'error');
      showToast(t('configReadFailed', { message: error.message }));
    });
  }, [activeFile, loadFile, open, setStatusMessage, showToast, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadBackups(activeFile).catch((error) => {
      setBackups([]);
      setSelectedBackup('');
      showToast(t('backupListFailed', { message: error.message }));
    });
  }, [activeFile, loadBackups, open, showToast, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadQuickProfiles().catch((error) => {
      setQuickProfiles([]);
      setSelectedQuickProfileId('');
      setQuickProfilesPath('');
      showToast(t('quickProfileStoreFailed', { message: error.message }));
    });
  }, [loadQuickProfiles, open, showToast, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadClaudeQuickProfiles().catch((error) => {
      setClaudeQuickProfiles([]);
      setSelectedClaudeQuickProfileId('');
      setClaudeQuickProfilesPath('');
      showToast(t('quickProfileStoreFailed', { message: error.message }));
    });
  }, [loadClaudeQuickProfiles, open, showToast, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadImageApiConfig().catch((error) => {
      setImageApiConfig(createEmptyImageApiConfig());
      setImageApiDirty(false);
      setImageApiStatusMessage(error.message, 'error');
      showToast(t('imageApiConfigReadFailed', { message: error.message }));
    });
  }, [loadImageApiConfig, open, setImageApiStatusMessage, showToast, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadUsageTracking().catch((error) => {
      setUsageTracking(createEmptyUsageTrackingState());
      setUsageRatesDraft({});
      setUsageDirty(false);
      setUsageStatusMessage(error.message, 'error');
      showToast(t('usageTrackingReadFailed', { message: error.message }));
    });
  }, [loadUsageTracking, open, setUsageStatusMessage, showToast, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    syncProfileState().catch((error) => {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('codexProfileReadFailed', { message: error.message }));
    });
  }, [open, setProfileStatusMessage, showToast, syncProfileState, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadClaudeProfile().catch((error) => {
      setClaudeProfileStatusMessage(error.message, 'error');
      showToast(t('claudeProfileReadFailed', { message: error.message }));
    });
  }, [loadClaudeProfile, open, setClaudeProfileStatusMessage, showToast, t]);

  useEffect(() => () => window.clearTimeout(validationTimer.current), []);

  const validate = useCallback(async ({ quietWhenValid = false } = {}) => {
    const seq = ++validationSeq.current;
    const meta = getConfigFileMeta(activeFile);
    const result = await validateCliConfigFile(activeFile, value);
    if (seq !== validationSeq.current) {
      return result.valid;
    }

    setInvalid(!result.valid);
    if (!result.valid) {
      setStatusMessage(result.error || meta.invalid, 'error');
    } else if (!quietWhenValid) {
      setStatusMessage(dirty ? `${meta.valid}，有未保存更改` : meta.valid, 'ok');
    }
    return result.valid;
  }, [activeFile, dirty, setStatusMessage, value]);

  const scheduleValidation = useCallback(() => {
    window.clearTimeout(validationTimer.current);
    validationTimer.current = window.setTimeout(() => {
      validate({ quietWhenValid: true }).catch((error) => setStatusMessage(error.message, 'error'));
    }, 500);
  }, [setStatusMessage, validate]);

  const handleValueChange = (nextValue) => {
    setValue(nextValue);
    const nextDirty = nextValue !== lastSavedValue;
    setDirty(nextDirty);
    if (nextDirty) {
      setStatusMessage('有未保存更改');
    }
    scheduleValidation();
  };

  const handleProfileChange = (field, nextValue) => {
    setProfile((current) => ({
      ...current,
      [field]: nextValue
    }));
    setProfileDirty(true);
    setProfileStatusMessage(t('quickConfigDirty'));
  };

  const handleClaudeProfileChange = (field, nextValue) => {
    setClaudeProfile((current) => ({
      ...current,
      [field]: nextValue
    }));
    setClaudeProfileDirty(true);
    setClaudeProfileStatusMessage(t('quickConfigDirty'));
  };

  const handleImageApiConfigChange = (field, nextValue) => {
    setImageApiConfig((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === 'apiKey' && nextValue ? { clearApiKey: false } : {})
    }));
    setImageApiDirty(true);
    setImageApiStatusMessage(t('imageApiConfigDirty'));
  };

  const clearImageApiKey = () => {
    setImageApiConfig((current) => ({
      ...current,
      apiKey: '',
      apiKeySet: false,
      clearApiKey: true,
      configured: false
    }));
    setImageApiDirty(true);
    setImageApiStatusMessage(t('imageApiConfigDirty'));
  };

  const handleUsageRateChange = (providerId, nextValue) => {
    const normalizedProviderId = String(providerId || '').trim();
    if (!normalizedProviderId) {
      return;
    }

    setUsageRatesDraft((current) => ({
      ...current,
      [normalizedProviderId]: {
        ...(current?.[normalizedProviderId] || {}),
        costPerMillionTokens: nextValue
      }
    }));
    setUsageDirty(true);
    setUsageStatusMessage(t('usageTrackingDirty'));
  };

  const saveUsageRates = async () => {
    setUsageSaving(true);
    setUsageStatusMessage(`${t('save')}...`);
    try {
      const snapshot = await bridge.writeUsageRates(usageRatesDraft);
      const normalized = normalizeUsageTrackingState(snapshot);
      setUsageTracking(normalized);
      setUsageRatesDraft(normalized.rates);
      setUsageDirty(false);
      setUsageStatusMessage(t('usageRatesSaved'), 'ok');
      showToast(t('usageRatesSaved'));
    } catch (error) {
      setUsageStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setUsageSaving(false);
    }
  };

  const clearUsageRecords = async () => {
    if (!window.confirm(t('usageClearConfirm'))) {
      return;
    }

    setUsageSaving(true);
    setUsageStatusMessage(`${t('clearUsageRecords')}...`);
    try {
      const snapshot = await bridge.clearUsageRecords();
      const normalized = normalizeUsageTrackingState(snapshot);
      setUsageTracking(normalized);
      setUsageRatesDraft(normalized.rates);
      setUsageDirty(false);
      setUsageStatusMessage(t('usageRecordsCleared'), 'ok');
      showToast(t('usageRecordsCleared'));
    } catch (error) {
      setUsageStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setUsageSaving(false);
    }
  };

  const handleQuickProfileSelect = (nextId) => {
    if (nextId === selectedQuickProfileId) {
      return;
    }

    if (profileDirty && !window.confirm(t('switchQuickProfileDiscardConfirm'))) {
      return;
    }

    if (!nextId) {
      loadProfile().catch((error) => {
        setProfileStatusMessage(error.message, 'error');
        showToast(t('codexProfileReadFailed', { message: error.message }));
      });
      return;
    }

    const record = quickProfiles.find((item) => item.id === nextId);
    if (!record) {
      return;
    }

    setSelectedQuickProfileId(record.id);
    setProfile(normalizeCodexProfile(record.profile));
    setProfileDirty(false);
    setProfileStatusMessage(t('quickProfileSwitched', { name: record.name }), 'ok');
  };

  const promptQuickProfileName = (fallback) => {
    const value = window.prompt(t('quickProfileNamePrompt'), fallback);
    if (value === null) {
      return null;
    }

    const name = value.trim();
    if (!name) {
      showToast(t('quickProfileNameRequired'));
      return null;
    }

    return name;
  };

  const saveQuickProfilePreset = async ({ saveAs = false } = {}) => {
    const existing = saveAs ? null : selectedQuickProfile;
    const name = existing?.name || promptQuickProfileName(deriveQuickProfileName(profile, t('newQuickProfile')));
    if (!name) {
      return;
    }

    setQuickProfilesLoading(true);
    setProfileStatusMessage(`${t('saveQuickProfile')}...`);
    try {
      const store = await bridge.saveCodexQuickProfile({
        id: existing?.id || null,
        name,
        profile
      });
      const profiles = Array.isArray(store.profiles) ? store.profiles : [];
      const savedProfile = store.savedProfile || profiles.find((record) => record.id === store.activeId);

      setQuickProfiles(profiles);
      setQuickProfilesPath(store.path || quickProfilesPath);
      if (savedProfile) {
        setSelectedQuickProfileId(savedProfile.id);
        setProfile(normalizeCodexProfile(savedProfile.profile));
        setProfileStatusMessage(t('quickProfileSaved', { name: savedProfile.name }), 'ok');
        showToast(t('quickProfileSaved', { name: savedProfile.name }));
      } else {
        setProfileStatusMessage(t('quickProfileSaved', { name }), 'ok');
        showToast(t('quickProfileSaved', { name }));
      }
      setProfileDirty(false);
    } catch (error) {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setQuickProfilesLoading(false);
    }
  };

  const deleteQuickProfilePreset = async () => {
    if (!selectedQuickProfile) {
      return;
    }

    if (profileDirty && !window.confirm(t('switchQuickProfileDiscardConfirm'))) {
      return;
    }

    if (!window.confirm(t('deleteQuickProfileConfirm', { name: selectedQuickProfile.name }))) {
      return;
    }

    setQuickProfilesLoading(true);
    setProfileStatusMessage(`${t('deleteQuickProfile')}...`);
    try {
      const store = await bridge.deleteCodexQuickProfile(selectedQuickProfile.id);
      setQuickProfiles(Array.isArray(store.profiles) ? store.profiles : []);
      setQuickProfilesPath(store.path || quickProfilesPath);
      setSelectedQuickProfileId('');
      const snapshot = await bridge.readCodexProfile();
      setProfile(normalizeCodexProfile(snapshot.profile));
      setProfileDirty(false);
      const deletedMessage = t('quickProfileDeleted', { name: selectedQuickProfile.name });
      setProfileStatusMessage(deletedMessage, 'ok');
      showToast(deletedMessage);
    } catch (error) {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setQuickProfilesLoading(false);
    }
  };

  const handleClaudeQuickProfileSelect = (nextId) => {
    if (nextId === selectedClaudeQuickProfileId) {
      return;
    }

    if (claudeProfileDirty && !window.confirm(t('switchQuickProfileDiscardConfirm'))) {
      return;
    }

    if (!nextId) {
      loadClaudeProfile().catch((error) => {
        setClaudeProfileStatusMessage(error.message, 'error');
        showToast(t('claudeProfileReadFailed', { message: error.message }));
      });
      return;
    }

    const record = claudeQuickProfiles.find((item) => item.id === nextId);
    if (!record) {
      return;
    }

    setSelectedClaudeQuickProfileId(record.id);
    setClaudeProfile(normalizeClaudeProfile(record.profile));
    setClaudeProfileDirty(false);
    setClaudeProfileStatusMessage(t('quickProfileSwitched', { name: record.name }), 'ok');
  };

  const saveClaudeQuickProfilePreset = async ({ saveAs = false } = {}) => {
    const existing = saveAs ? null : selectedClaudeQuickProfile;
    const name = existing?.name || promptQuickProfileName(deriveClaudeQuickProfileName(claudeProfile, t('newClaudeQuickProfile')));
    if (!name) {
      return;
    }

    setClaudeQuickProfilesLoading(true);
    setClaudeProfileStatusMessage(`${t('saveQuickProfile')}...`);
    try {
      const store = await bridge.saveClaudeQuickProfile({
        id: existing?.id || null,
        name,
        profile: claudeProfile
      });
      const profiles = Array.isArray(store.profiles) ? store.profiles : [];
      const savedProfile = store.savedProfile || profiles.find((record) => record.id === store.activeId);

      setClaudeQuickProfiles(profiles);
      setClaudeQuickProfilesPath(store.path || claudeQuickProfilesPath);
      if (savedProfile) {
        setSelectedClaudeQuickProfileId(savedProfile.id);
        setClaudeProfile(normalizeClaudeProfile(savedProfile.profile));
        setClaudeProfileStatusMessage(t('quickProfileSaved', { name: savedProfile.name }), 'ok');
        showToast(t('quickProfileSaved', { name: savedProfile.name }));
      } else {
        setClaudeProfileStatusMessage(t('quickProfileSaved', { name }), 'ok');
        showToast(t('quickProfileSaved', { name }));
      }
      setClaudeProfileDirty(false);
    } catch (error) {
      setClaudeProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setClaudeQuickProfilesLoading(false);
    }
  };

  const deleteClaudeQuickProfilePreset = async () => {
    if (!selectedClaudeQuickProfile) {
      return;
    }

    if (claudeProfileDirty && !window.confirm(t('switchQuickProfileDiscardConfirm'))) {
      return;
    }

    if (!window.confirm(t('deleteClaudeQuickProfileConfirm', { name: selectedClaudeQuickProfile.name }))) {
      return;
    }

    setClaudeQuickProfilesLoading(true);
    setClaudeProfileStatusMessage(`${t('deleteQuickProfile')}...`);
    try {
      const store = await bridge.deleteClaudeQuickProfile(selectedClaudeQuickProfile.id);
      setClaudeQuickProfiles(Array.isArray(store.profiles) ? store.profiles : []);
      setClaudeQuickProfilesPath(store.path || claudeQuickProfilesPath);
      setSelectedClaudeQuickProfileId('');
      const snapshot = await bridge.readClaudeProfile();
      setClaudeProfile(normalizeClaudeProfile(snapshot.profile));
      setClaudeProfileDirty(false);
      const deletedMessage = t('quickProfileDeleted', { name: selectedClaudeQuickProfile.name });
      setClaudeProfileStatusMessage(deletedMessage, 'ok');
      showToast(deletedMessage);
    } catch (error) {
      setClaudeProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setClaudeQuickProfilesLoading(false);
    }
  };

  const confirmCloseWithUnsavedChanges = () => {
    if (dirty || profileDirty || claudeProfileDirty || imageApiDirty || usageDirty) {
      const meta = getConfigFileMeta(activeFile);
      const name = dirty
        ? meta.title
        : profileDirty ? t('codexQuickConfig') : claudeProfileDirty ? t('claudeQuickConfig') : imageApiDirty ? t('imageApiConfig') : t('usageTracking');
      if (!window.confirm(t('unsavedCloseConfirm', { name }))) {
        return false;
      }
    }

    return true;
  };

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && !confirmCloseWithUnsavedChanges()) {
      return;
    }

    onOpenChange(nextOpen);
  };

  const openHistoryProject = () => {
    if (!historyProject || !confirmCloseWithUnsavedChanges()) {
      return;
    }

    onOpenChange(false);
    onHistoryProjectOpen?.();
  };

  const switchFile = (nextFile) => {
    if (nextFile === activeFile) {
      return;
    }

    if (dirty && !window.confirm(t('switchDiscardConfirm'))) {
      return;
    }

    if (nextFile === 'auth' || nextFile === 'config') {
      setLastCodexFile(nextFile);
    }
    setActiveFile(nextFile);
  };

  const switchFileGroup = (nextGroup) => {
    if (nextGroup === activeFileGroup) {
      return;
    }

    if (nextGroup === 'claudeSettings') {
      switchFile('claudeSettings');
      return;
    }

    switchFile(lastCodexFile === 'auth' ? 'auth' : 'config');
  };

  const reload = () => {
    if (dirty || profileDirty || claudeProfileDirty || imageApiDirty || usageDirty) {
      const meta = getConfigFileMeta(activeFile);
      const name = dirty
        ? meta.title
        : profileDirty ? t('codexQuickConfig') : claudeProfileDirty ? t('claudeQuickConfig') : imageApiDirty ? t('imageApiConfig') : t('usageTracking');
      if (!window.confirm(t('reloadDiscardConfirm', { name }))) {
        return;
      }
    }
    loadFile(activeFile).catch((error) => {
      setStatusMessage(error.message, 'error');
      showToast(t('reloadFailed', { message: error.message }));
    });
    syncProfileState().catch((error) => {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('codexProfileReadFailed', { message: error.message }));
    });
    loadBackups(activeFile).catch((error) => {
      setBackups([]);
      setSelectedBackup('');
      showToast(t('backupListFailed', { message: error.message }));
    });
    loadQuickProfiles().catch((error) => {
      setQuickProfiles([]);
      setSelectedQuickProfileId('');
      setQuickProfilesPath('');
      showToast(t('quickProfileStoreFailed', { message: error.message }));
    });
    loadClaudeProfile().catch((error) => {
      setClaudeProfileStatusMessage(error.message, 'error');
      showToast(t('claudeProfileReadFailed', { message: error.message }));
    });
    loadClaudeQuickProfiles().catch((error) => {
      setClaudeQuickProfiles([]);
      setSelectedClaudeQuickProfileId('');
      setClaudeQuickProfilesPath('');
      showToast(t('quickProfileStoreFailed', { message: error.message }));
    });
    loadImageApiConfig().catch((error) => {
      setImageApiConfig(createEmptyImageApiConfig());
      setImageApiDirty(false);
      setImageApiStatusMessage(error.message, 'error');
      showToast(t('imageApiConfigReadFailed', { message: error.message }));
    });
    loadUsageTracking().catch((error) => {
      setUsageTracking(createEmptyUsageTrackingState());
      setUsageRatesDraft({});
      setUsageDirty(false);
      setUsageStatusMessage(error.message, 'error');
      showToast(t('usageTrackingReadFailed', { message: error.message }));
    });
  };

  const saveProfile = async () => {
    if (dirty && !isClaudeConfigFile(activeFile) && !window.confirm(t('profileSaveDiscardConfirm'))) {
      return;
    }

    setProfileSaving(true);
    setProfileStatusMessage(`${t('save')}...`);
    try {
      const snapshot = await bridge.writeCodexProfile(profile);
      setProfile(normalizeCodexProfile(snapshot.profile));
      setProfileDirty(false);
      setProfileStatusMessage(t('codexProfileSaved'), 'ok');
      onProfileChanged?.(normalizeCodexProfile(snapshot.profile));
      if (!isClaudeConfigFile(activeFile)) {
        await loadFile(activeFile);
      }
      showToast(t('codexProfileSaved'));
    } catch (error) {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setProfileSaving(false);
    }
  };

  const saveClaudeProfile = async () => {
    if (dirty && isClaudeConfigFile(activeFile) && !window.confirm(t('profileSaveDiscardConfirm'))) {
      return;
    }

    setClaudeProfileSaving(true);
    setClaudeProfileStatusMessage(`${t('save')}...`);
    try {
      const snapshot = await bridge.writeClaudeProfile(claudeProfile);
      setClaudeProfile(normalizeClaudeProfile(snapshot.profile));
      setClaudeProfileDirty(false);
      setClaudeProfileStatusMessage(t('claudeProfileSaved'), 'ok');
      if (isClaudeConfigFile(activeFile)) {
        await loadFile(activeFile);
      }
      showToast(t('claudeProfileSaved'));
    } catch (error) {
      setClaudeProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setClaudeProfileSaving(false);
    }
  };

  const saveImageApiConfig = async () => {
    setImageApiSaving(true);
    setImageApiStatusMessage(`${t('save')}...`);
    try {
      const snapshot = await bridge.writeImageApiConfig(imageApiConfig);
      setImageApiConfig(normalizeImageApiConfig(snapshot));
      setImageApiDirty(false);
      setImageApiStatusMessage(t('imageApiConfigSaved'), 'ok');
      showToast(t('imageApiConfigSaved'));
    } catch (error) {
      setImageApiStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setImageApiSaving(false);
    }
  };

  const save = async () => {
    const meta = getConfigFileMeta(activeFile);
    const valid = await validate();
    if (!valid) {
      showToast(t('invalidNotSaved', { name: meta.invalid }));
      return;
    }

    setSaving(true);
    setStatusMessage(`${t('save')}...`);
    try {
      const snapshot = await writeCliConfigFile(activeFile, value);
      setPathText(snapshot.path);
      setValue(snapshot.content || '');
      setLastSavedValue(snapshot.content || '');
      setDirty(false);
      setInvalid(false);
      const backupNote = snapshot.backupPath ? '，已生成备份' : '';
      setStatusMessage(`已保存${backupNote}`, 'ok');
      showToast(`${meta.saved}${backupNote}。`);
      if (!isClaudeConfigFile(activeFile)) {
        syncProfileState().catch((error) => {
          setProfileStatusMessage(error.message, 'error');
        });
      } else {
        loadClaudeProfile().catch((error) => {
          setClaudeProfileStatusMessage(error.message, 'error');
        });
      }
      loadBackups(activeFile).catch((error) => {
        setBackups([]);
        setSelectedBackup('');
        showToast(t('backupListFailed', { message: error.message }));
      });
    } catch (error) {
      setStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setSaving(false);
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup) {
      return;
    }

    const meta = getConfigFileMeta(activeFile);
    const confirmKey = dirty || profileDirty ? 'restoreBackupDirtyConfirm' : 'restoreBackupConfirm';
    if (!window.confirm(t(confirmKey, { name: meta.title }))) {
      return;
    }

    setRestoring(true);
    setStatusMessage(`${t('restoreBackup')}...`);
    try {
      const snapshot = await restoreCliConfigFileBackup(activeFile, selectedBackup);
      setPathText(snapshot.path);
      setValue(snapshot.content || '');
      setLastSavedValue(snapshot.content || '');
      setDirty(false);
      setInvalid(false);
      const restoredMessage = snapshot.backupPath ? t('restoreBackupSavedWithBackup') : t('restoreBackupSaved');
      setStatusMessage(restoredMessage, 'ok');
      showToast(t('restoreBackupSavedToast', { name: snapshot.restoredFrom?.name || selectedBackup }));
      if (!isClaudeConfigFile(activeFile)) {
        syncProfileState().catch((error) => {
          setProfileStatusMessage(error.message, 'error');
        });
      } else {
        loadClaudeProfile().catch((error) => {
          setClaudeProfileStatusMessage(error.message, 'error');
        });
      }
      loadBackups(activeFile).catch((error) => {
        setBackups([]);
        setSelectedBackup('');
        showToast(t('backupListFailed', { message: error.message }));
      });
    } catch (error) {
      setStatusMessage(error.message, 'error');
      showToast(t('restoreFailed', { message: error.message }));
    } finally {
      setRestoring(false);
    }
  };

  const openFolder = () => {
    const openConfigFolder = isClaudeConfigFile(activeFile)
      ? bridge.openClaudeConfigFolder
      : bridge.openCodexConfigFolder;
    openConfigFolder().catch((error) => showToast(t('openDirFailed', { message: error.message })));
  };

  const openImageApiHelp = () => {
    bridge.openExternalUrl(imageApiHelpUrl).catch((error) => {
      showToast(t('openUrlFailed', { message: error.message }));
    });
  };

  const normalizedCommandDockShortcuts = normalizeCommandDockShortcutSettings(commandDockShortcuts);
  const normalizedSessionHeaderVisibility = normalizeSessionHeaderVisibility(sessionHeaderVisibility);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        id="codexConfigPanel"
        className="left-4 bottom-4 right-auto top-auto grid h-[min(820px,calc(100vh-96px))] max-h-[calc(100vh-96px)] w-[min(980px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0"
      >
        <DialogHeader>
          <DialogTitle id="codexConfigTitle">{t('settings')}</DialogTitle>
          <DialogDescription id="codexConfigPath" title={pathText}>{t('settingsDescription')}</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeSettingsTab}
          onValueChange={setActiveSettingsTab}
          className="settings-tabs grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-3"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger className="shrink-0" value="preferences">{t('preferences')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="imageApi">{t('imageApiConfig')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="usage">{t('usageTracking')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="quickConfig">{t('codexQuickConfig')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="files">{t('configFiles')}</TabsTrigger>
          </TabsList>

          <div className="settings-page-slide" data-settings-page={activeSettingsTab}>
          <TabsContent keepMounted value="preferences" className="settings-page min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
            <div className="grid gap-2">
              <div className="grid gap-1.5">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Languages className="h-4 w-4" />
                  {t('language')}
                </Label>
                <div className="flex gap-2">
                  <Button type="button" variant={language === 'zh' ? 'primary' : 'outline'} onClick={() => onLanguageChange('zh')}>
                    {t('chinese')}
                  </Button>
                  <Button type="button" variant={language === 'en' ? 'primary' : 'outline'} onClick={() => onLanguageChange('en')}>
                    {t('english')}
                  </Button>
                </div>
              </div>
              {historyProject && (
                <div className="grid gap-2 border-t border-border/70 pt-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <Label className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('historyFolder')}</span>
                    </Label>
                    <Button type="button" variant="outline" size="sm" onClick={openHistoryProject}>
                      <FolderOpen className="h-3.5 w-3.5" />
                      {t('openHistoryFolder')}
                    </Button>
                  </div>
                  <div className="truncate rounded-md border border-border bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground" title={historyProject.path}>
                    {historyProject.path || t('historyFolderUnavailable')}
                  </div>
                </div>
              )}
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <LayoutGrid className="h-4 w-4" />
                  {t('canvasMode')}
                </Label>
                <div className="grid gap-2 md:grid-cols-2">
                  <button
                    type="button"
                    className={cn(
                      'grid gap-1 rounded-md border border-border bg-background/70 px-3 py-2 text-left transition-colors',
                      canvasMode === 'project' && 'border-primary bg-primary/5'
                    )}
                    onClick={() => onCanvasModeChange?.('project')}
                  >
                    <span className="text-sm font-medium">{t('canvasModeProject')}</span>
                    <span className="text-xs leading-5 text-muted-foreground">{t('canvasModeProjectTooltip')}</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'grid gap-1 rounded-md border border-border bg-background/70 px-3 py-2 text-left transition-colors',
                      canvasMode === 'shared' && 'border-primary bg-primary/5'
                    )}
                    onClick={() => onCanvasModeChange?.('shared')}
                  >
                    <span className="text-sm font-medium">{t('canvasModeShared')}</span>
                    <span className="text-xs leading-5 text-muted-foreground">{t('canvasModeSharedTooltip')}</span>
                  </button>
                </div>
              </div>
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <Label htmlFor="appZoomSlider" className="flex items-center gap-2 text-sm font-medium">
                    <ZoomIn className="h-4 w-4" />
                    {t('appZoom')}
                  </Label>
                  <Badge variant="outline" className="font-mono text-xs">
                    {formatAppZoomPercent(appZoomFactor)}%
                  </Badge>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <input
                    id="appZoomSlider"
                    type="range"
                    className="h-2 min-w-[180px] flex-1 accent-primary"
                    min={appZoomMinFactor}
                    max={appZoomMaxFactor}
                    step={appZoomStep}
                    value={normalizeAppZoomFactor(appZoomFactor)}
                    aria-label={t('appZoom')}
                    onChange={(event) => onAppZoomFactorChange?.(normalizeAppZoomFactor(event.target.value))}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onAppZoomFactorChange?.(appZoomDefaultFactor)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t('appZoomReset')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appZoomPresetFactors.map((factor) => {
                    const percent = formatAppZoomPercent(factor);
                    const active = Math.abs(normalizeAppZoomFactor(appZoomFactor) - factor) < 0.01;
                    return (
                      <Button
                        key={factor}
                        type="button"
                        size="sm"
                        variant={active ? 'primary' : 'outline'}
                        title={t('appZoomPreset', { percent })}
                        onClick={() => onAppZoomFactorChange?.(factor)}
                      >
                        {percent}%
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <SquareTerminal className="h-4 w-4" />
                  {t('sessionHeaderDisplay')}
                </Label>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
                  {sessionHeaderItemOptions.map((option) => (
                    <Label
                      key={option.id}
                      className="inline-flex min-h-8 items-center gap-2 rounded-md border border-border bg-background/70 px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={normalizedSessionHeaderVisibility[option.id]}
                        onChange={(event) => onSessionHeaderVisibilityChange?.(option.id, event.target.checked)}
                      />
                      <span className="truncate">{t(option.labelKey)}</span>
                    </Label>
                  ))}
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  {t('sessionHeaderDisplayHint')}
                </div>
              </div>
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="h-4 w-4" />
                  {t('commandDockShortcuts')}
                </Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="commandDockSendShortcut" className="text-xs text-muted-foreground">
                      {t('commandDockSendShortcut')}
                    </Label>
                    <Select
                      id="commandDockSendShortcut"
                      onValueChange={(nextValue) => onCommandDockShortcutChange?.('send', nextValue)}
                      options={commandDockShortcutOptions.map((option) => ({
                        value: option.id,
                        label: option.label
                      }))}
                      value={normalizedCommandDockShortcuts.sendShortcut}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="commandDockDispatchShortcut" className="text-xs text-muted-foreground">
                      {t('commandDockDispatchShortcut')}
                    </Label>
                    <Select
                      id="commandDockDispatchShortcut"
                      onValueChange={(nextValue) => onCommandDockShortcutChange?.('dispatch', nextValue)}
                      options={commandDockShortcutOptions.map((option) => ({
                        value: option.id,
                        label: option.label
                      }))}
                      value={normalizedCommandDockShortcuts.dispatchShortcut}
                    />
                  </div>
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  {t('commandDockShortcutHint')}
                </div>
              </div>
            </div>
          </div>
          </TabsContent>

          <TabsContent keepMounted value="imageApi" className="settings-page min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/65 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-[220px] flex-1 leading-5">{t('imageApiHelp')}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 px-2"
              onClick={openImageApiHelp}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('imageApiHelpLink')}
            </Button>
          </div>
          <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t('imageApiConfig')}</div>
              <div
                className={cn(
                  'min-h-5 text-sm text-muted-foreground',
                  imageApiStatusTone === 'ok' && 'text-emerald-700 dark:text-emerald-200',
                  imageApiStatusTone === 'error' && 'text-red-700 dark:text-red-200'
                )}
              >
                {imageApiStatus}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-6">
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('imageApiUrl')}</Label>
                <Input
                  value={imageApiConfig.baseUrl}
                  placeholder={t('baseUrlPlaceholder')}
                  spellCheck={false}
                  onChange={(event) => handleImageApiConfigChange('baseUrl', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('apiKey')}</Label>
                <Input
                  type="password"
                  value={imageApiConfig.apiKey}
                  placeholder={imageApiConfig.apiKeySet ? t('imageApiKeySavedPlaceholder') : t('apiKeyPlaceholder')}
                  spellCheck={false}
                  onChange={(event) => handleImageApiConfigChange('apiKey', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('imageApiModel')}</Label>
                <Input
                  value={imageApiConfig.model}
                  placeholder="gpt-image-2"
                  spellCheck={false}
                  onChange={(event) => handleImageApiConfigChange('model', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('imageApiSize')}</Label>
                <Input
                  value={imageApiConfig.size}
                  placeholder="1024x1024"
                  spellCheck={false}
                  onChange={(event) => handleImageApiConfigChange('size', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-1">
                <Label className="text-xs font-medium text-muted-foreground">{t('imageApiUpscale')}</Label>
                <Input
                  value={imageApiConfig.upscale}
                  list="imageApiUpscaleOptions"
                  placeholder="2k / 4k"
                  spellCheck={false}
                  onChange={(event) => handleImageApiConfigChange('upscale', event.target.value)}
                />
                <datalist id="imageApiUpscaleOptions">
                  <option value="2k" />
                  <option value="4k" />
                </datalist>
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-1">
                <Label className="text-xs font-medium text-muted-foreground">{t('imageApiCount')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="4"
                  value={imageApiConfig.n}
                  onChange={(event) => handleImageApiConfigChange('n', event.target.value)}
                />
              </div>
              <Label className="grid min-w-0 gap-1.5 rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-foreground md:col-span-4">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-primary"
                    checked={Boolean(imageApiConfig.requestEditorEnabled)}
                    onChange={(event) => handleImageApiConfigChange('requestEditorEnabled', event.target.checked)}
                  />
                  <span>{t('imageApiRequestEditor')}</span>
                </span>
                <span className="leading-5 text-muted-foreground">{t('imageApiRequestEditorHint')}</span>
              </Label>
              <div className="flex min-w-0 items-end gap-2 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearImageApiKey}
                  disabled={imageApiSaving || (!imageApiConfig.apiKeySet && !imageApiConfig.apiKey)}
                >
                  <X className="h-4 w-4" />
                  {t('clearApiKey')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={saveImageApiConfig}
                  disabled={imageApiSaving}
                >
                  <Save className="h-4 w-4" />
                  {t('saveImageApiConfig')}
                </Button>
              </div>
            </div>
          </div>
          </div>
          </TabsContent>

          <TabsContent keepMounted value="usage" className="settings-page min-h-0 overflow-y-auto pr-1">
          <UsageTrackingPanel
            language={language}
            loading={usageLoading}
            onClearRecords={clearUsageRecords}
            onRateChange={handleUsageRateChange}
            onSaveRates={saveUsageRates}
            ratesDraft={usageRatesDraft}
            saving={usageSaving}
            status={usageStatus}
            statusTone={usageStatusTone}
            tracking={usageTracking}
            t={t}
          />
          </TabsContent>

          <TabsContent keepMounted value="quickConfig" className="settings-page min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3">
          <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t('codexQuickConfig')}</div>
              <div
                className={cn(
                  'min-h-5 text-sm text-muted-foreground',
                  profileStatusTone === 'ok' && 'text-emerald-700 dark:text-emerald-200',
                  profileStatusTone === 'error' && 'text-red-700 dark:text-red-200'
                )}
              >
                {profileStatus}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="quickProfileSelect" className="text-xs font-medium text-muted-foreground">
                  {t('quickProfile')}
                </Label>
                <Select
                  id="quickProfileSelect"
                  disabled={quickProfilesLoading || profileSaving || restoring}
                  onValueChange={handleQuickProfileSelect}
                  options={[
                    { value: '', label: t('currentCodexProfile') },
                    ...quickProfiles.map((record) => ({
                      value: record.id,
                      label: formatQuickProfileLabel(record)
                    }))
                  ]}
                  title={quickProfilesPath}
                  value={selectedQuickProfileId}
                />
              </div>
              <Button
                type="button"
                onClick={() => saveQuickProfilePreset()}
                disabled={quickProfilesLoading || profileSaving || restoring}
              >
                <Save className="h-4 w-4" />
                {t('saveQuickProfile')}
              </Button>
              <Button
                type="button"
                onClick={() => saveQuickProfilePreset({ saveAs: true })}
                disabled={quickProfilesLoading || profileSaving || restoring}
              >
                <Plus className="h-4 w-4" />
                {t('saveQuickProfileAs')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={deleteQuickProfilePreset}
                disabled={!selectedQuickProfile || quickProfilesLoading || profileSaving || restoring}
              >
                <Trash2 className="h-4 w-4" />
                {t('deleteQuickProfile')}
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-6">
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('providerKey')}</Label>
                <Input
                  value={profile.providerKey}
                  spellCheck={false}
                  onChange={(event) => handleProfileChange('providerKey', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('providerName')}</Label>
                <Input
                  value={profile.providerName}
                  spellCheck={false}
                  onChange={(event) => handleProfileChange('providerName', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('wireApi')}</Label>
                <Select
                  onValueChange={(nextValue) => handleProfileChange('wireApi', nextValue)}
                  options={toSelectOptions(wireApiOptions)}
                  value={profile.wireApi}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('reasoningEffort')}</Label>
                <Select
                  onValueChange={(nextValue) => handleProfileChange('modelReasoningEffort', nextValue)}
                  options={toSelectOptions(reasoningEffortOptions, (option) => option || t('defaultValue'))}
                  value={profile.modelReasoningEffort}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('apiKey')}</Label>
                <Input
                  type="password"
                  value={profile.apiKey}
                  placeholder={t('apiKeyPlaceholder')}
                  spellCheck={false}
                  onChange={(event) => handleProfileChange('apiKey', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('baseUrl')}</Label>
                <Input
                  value={profile.baseUrl}
                  placeholder={t('baseUrlPlaceholder')}
                  spellCheck={false}
                  onChange={(event) => handleProfileChange('baseUrl', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('model')}</Label>
                <Input
                  value={profile.model}
                  placeholder={t('modelPlaceholder')}
                  spellCheck={false}
                  onChange={(event) => handleProfileChange('model', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('approvalPolicy')}</Label>
                <Select
                  onValueChange={(nextValue) => handleProfileChange('approvalPolicy', nextValue)}
                  options={toSelectOptions(approvalPolicyOptions, (option) => option || t('defaultValue'))}
                  value={profile.approvalPolicy}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('sandboxMode')}</Label>
                <Select
                  onValueChange={(nextValue) => handleProfileChange('sandboxMode', nextValue)}
                  options={toSelectOptions(sandboxModeOptions, (option) => option || t('defaultValue'))}
                  value={profile.sandboxMode}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-6">
                <Label className="text-xs font-medium text-muted-foreground">{t('quickModel')}</Label>
                <QuickModelButtons
                  currentModel={profile.model}
                  disabled={quickProfilesLoading || profileSaving || restoring}
                  onSelect={(model) => handleProfileChange('model', model)}
                  t={t}
                />
                <div className="text-xs text-muted-foreground">{t('quickModelHint')}</div>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <Label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={profile.fastMode}
                    onChange={(event) => handleProfileChange('fastMode', event.target.checked)}
                  />
                  {t('fastMode')}
                </Label>
                <Label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={profile.requiresOpenaiAuth}
                    onChange={(event) => handleProfileChange('requiresOpenaiAuth', event.target.checked)}
                  />
                  {t('requiresOpenaiAuth')}
                </Label>
                <Label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={profile.disableResponseStorage}
                    onChange={(event) => handleProfileChange('disableResponseStorage', event.target.checked)}
                  />
                  {t('disableResponseStorage')}
                </Label>
                <Label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={profile.contextWindow1m}
                    onChange={(event) => handleProfileChange('contextWindow1m', event.target.checked)}
                  />
                  {t('contextWindow1m')}
                </Label>
              </div>
              <Button type="button" variant="primary" onClick={saveProfile} disabled={profileSaving || restoring}>
                <Save className="h-4 w-4" />
                {t('applyQuickConfig')}
              </Button>
            </div>
          </div>
          <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">{t('claudeQuickConfig')}</div>
              <div
                className={cn(
                  'min-h-5 text-sm text-muted-foreground',
                  claudeProfileStatusTone === 'ok' && 'text-emerald-700 dark:text-emerald-200',
                  claudeProfileStatusTone === 'error' && 'text-red-700 dark:text-red-200'
                )}
              >
                {claudeProfileStatus}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-end">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="claudeQuickProfileSelect" className="text-xs font-medium text-muted-foreground">
                  {t('quickProfile')}
                </Label>
                <Select
                  id="claudeQuickProfileSelect"
                  disabled={claudeQuickProfilesLoading || claudeProfileSaving || restoring}
                  onValueChange={handleClaudeQuickProfileSelect}
                  options={[
                    { value: '', label: t('currentClaudeProfile') },
                    ...claudeQuickProfiles.map((record) => ({
                      value: record.id,
                      label: formatClaudeQuickProfileLabel(record)
                    }))
                  ]}
                  title={claudeQuickProfilesPath}
                  value={selectedClaudeQuickProfileId}
                />
              </div>
              <Button
                type="button"
                onClick={() => saveClaudeQuickProfilePreset()}
                disabled={claudeQuickProfilesLoading || claudeProfileSaving || restoring}
              >
                <Save className="h-4 w-4" />
                {t('saveQuickProfile')}
              </Button>
              <Button
                type="button"
                onClick={() => saveClaudeQuickProfilePreset({ saveAs: true })}
                disabled={claudeQuickProfilesLoading || claudeProfileSaving || restoring}
              >
                <Plus className="h-4 w-4" />
                {t('saveQuickProfileAs')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={deleteClaudeQuickProfilePreset}
                disabled={!selectedClaudeQuickProfile || claudeQuickProfilesLoading || claudeProfileSaving || restoring}
              >
                <Trash2 className="h-4 w-4" />
                {t('deleteQuickProfile')}
              </Button>
            </div>

            <div className="grid gap-2 md:grid-cols-6">
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('model')}</Label>
                <Input
                  value={claudeProfile.model}
                  placeholder="sonnet"
                  spellCheck={false}
                  onChange={(event) => handleClaudeProfileChange('model', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('claudeEffortLevel')}</Label>
                <Select
                  onValueChange={(nextValue) => handleClaudeProfileChange('effortLevel', nextValue)}
                  options={toSelectOptions(claudeEffortLevelOptions, (option) => option || t('defaultValue'))}
                  value={claudeProfile.effortLevel}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('claudePermissionMode')}</Label>
                <Select
                  onValueChange={(nextValue) => handleClaudeProfileChange('permissionMode', nextValue)}
                  options={toSelectOptions(claudePermissionModeOptions, (option) => option || t('defaultValue'))}
                  value={claudeProfile.permissionMode}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-3">
                <Label className="text-xs font-medium text-muted-foreground">{t('claudeApiKey')}</Label>
                <Input
                  type="password"
                  value={claudeProfile.apiKey}
                  placeholder="sk-ant-..."
                  spellCheck={false}
                  onChange={(event) => handleClaudeProfileChange('apiKey', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-3">
                <Label className="text-xs font-medium text-muted-foreground">{t('claudeBaseUrl')}</Label>
                <Input
                  value={claudeProfile.baseUrl}
                  placeholder="https://api.anthropic.com"
                  spellCheck={false}
                  onChange={(event) => handleClaudeProfileChange('baseUrl', event.target.value)}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-6">
                <Label className="text-xs font-medium text-muted-foreground">{t('claudeQuickModel')}</Label>
                <QuickModelButtons
                  currentModel={claudeProfile.model}
                  disabled={claudeQuickProfilesLoading || claudeProfileSaving || restoring}
                  models={quickClaudeModelOptions}
                  onSelect={(model) => handleClaudeProfileChange('model', model)}
                  t={t}
                />
                <div className="text-xs text-muted-foreground">{t('claudeQuickModelHint')}</div>
              </div>
            </div>

            <div className="flex min-w-0 justify-end">
              <Button type="button" variant="primary" onClick={saveClaudeProfile} disabled={claudeProfileSaving || restoring}>
                <Save className="h-4 w-4" />
                {t('applyQuickConfig')}
              </Button>
            </div>
          </div>
          </div>
          </TabsContent>

          <TabsContent keepMounted value="files" className="settings-page min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2">
          <div className="grid gap-1.5 rounded-md border border-border bg-card/70 p-3">
            <div className="text-sm font-semibold">{t('rawCodexEditor')}</div>
            <div className="text-xs text-muted-foreground">{t('rawCodexEditorDescription')}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground" title={pathText}>
              {pathText || getConfigFileMeta(activeFile).title}
            </div>
          </div>

          <div className="grid gap-2">
            <Tabs value={activeFileGroup} onValueChange={switchFileGroup}>
              <TabsList>
                <TabsTrigger
                  className={cn(activeFileGroup === 'codex' && 'active')}
                  data-config-group="codex"
                  value="codex"
                  onClick={() => switchFileGroup('codex')}
                >
                  {t('codexConfig')}
                </TabsTrigger>
                <TabsTrigger
                  className={cn(activeFile === 'claudeSettings' && 'active')}
                  data-config-file="claudeSettings"
                  value="claudeSettings"
                  onClick={() => switchFileGroup('claudeSettings')}
                >
                  Claude settings.json
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              {activeFileGroup === 'codex' ? (
                <Tabs value={activeCodexFile} onValueChange={switchFile}>
                  <TabsList>
                    <TabsTrigger
                      className={cn(activeCodexFile === 'config' && 'active')}
                      data-codex-file="config"
                      value="config"
                      onClick={() => switchFile('config')}
                    >
                      config.toml
                    </TabsTrigger>
                    <TabsTrigger
                      className={cn(activeCodexFile === 'auth' && 'active')}
                      data-codex-file="auth"
                      value="auth"
                      onClick={() => switchFile('auth')}
                    >
                      auth.json
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : <div />}

              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                <Label htmlFor="codexBackupSelect" className="text-xs font-medium text-muted-foreground">
                  {t('backupHistory')}
                </Label>
                <Select
                  id="codexBackupSelect"
                  className="min-w-[220px] flex-1 md:w-[360px] md:flex-none"
                  disabled={backupsLoading || restoring || backups.length === 0}
                  onValueChange={setSelectedBackup}
                  options={backups.length === 0
                    ? [{ value: '', label: backupsLoading ? t('loading') : t('noBackups') }]
                    : backups.map((backup) => ({
                      value: backup.name,
                      label: formatBackupLabel(backup)
                    }))}
                  value={selectedBackup}
                />
                <Button
                  id="restoreCodexBackup"
                  type="button"
                  onClick={restoreBackup}
                  disabled={!selectedBackup || backupsLoading || restoring || saving}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('restoreBackup')}
                </Button>
              </div>
            </div>
          </div>

          <Textarea
            id="codexConfigEditor"
            className={cn('config-editor h-full min-h-0 font-mono text-[13px]', invalid && 'is-invalid')}
            ref={editorRef}
            spellCheck={false}
            value={value}
            onChange={(event) => handleValueChange(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key.toLowerCase() === 's') {
                event.preventDefault();
                save();
              }
            }}
          />

          <div
            id="codexConfigStatus"
            className={cn(
              'min-h-5 text-sm text-muted-foreground',
              statusTone === 'ok' && 'text-emerald-700 dark:text-emerald-200',
              statusTone === 'error' && 'text-red-700 dark:text-red-200'
            )}
          >
            {status}
          </div>
          </div>
          </TabsContent>
          </div>
        </Tabs>

        {activeSettingsTab === 'files' ? (
        <DialogFooter className="flex-wrap">
          <Button id="reloadCodexConfig" type="button" onClick={reload}>
            <RefreshCw className="h-4 w-4" />
            {t('reload')}
          </Button>
          <Button id="validateCodexConfig" type="button" onClick={() => validate()}>
            <Check className="h-4 w-4" />
            {t('validate')}
          </Button>
          <Button id="openCodexFolder" type="button" onClick={openFolder}>
            <FolderOpen className="h-4 w-4" />
            {t('openFolder')}
          </Button>
          <Button id="saveCodexConfig" type="button" variant="primary" onClick={save} disabled={saving || restoring}>
            <Save className="h-4 w-4" />
            {t('save')}
          </Button>
        </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CliProviderSelectField({
  id,
  language,
  label,
  onChange,
  providerId,
  providers,
  showSummary = true,
  t,
  targetType = 'directory'
}) {
  const selectedCliProvider = resolveSelectableCliProvider(providerId, providers);
  const launchCommand = selectedCliProvider
    ? (
      getCliLaunchCommand(selectedCliProvider, targetType)
      || getCliLaunchCommand(selectedCliProvider, 'project')
      || getCliLaunchCommand(selectedCliProvider, 'directory')
    )
    : '';

  return (
    <div className="grid gap-2">
      {label && (
        <Label htmlFor={id} className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </Label>
      )}
      <Select
        id={id}
        onValueChange={onChange}
        options={providers.map((provider) => {
          const optionCommand = (
            getCliLaunchCommand(provider, targetType)
            || getCliLaunchCommand(provider, 'project')
            || getCliLaunchCommand(provider, 'directory')
          );
          const optionLabel = optionCommand
            ? `${getCliProviderDisplayName(provider, language)} - ${optionCommand}`
            : getCliProviderDisplayName(provider, language);

          return {
            value: provider.id,
            label: optionLabel
          };
        })}
        value={selectedCliProvider?.id || ''}
      />
      {showSummary && selectedCliProvider && (
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <CliProviderBadge language={language} provider={selectedCliProvider} />
          {launchCommand && (
            <span className="truncate font-mono" title={launchCommand}>
              {t('launchCommand')}: {launchCommand}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function NewSessionDialog({
  activeCommandPresetId = '',
  commandPresets = [],
  commandPresetsLoading = false,
  commandPresetsPath = '',
  defaultCwd,
  initialCliProviderId = defaultCliProviderId,
  language,
  onCommandPresetDelete,
  onCommandPresetSave,
  onCommandPresetSelect,
  onOpenChange,
  onSelect,
  open,
  projects,
  showToast,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const selectableProjects = Array.isArray(projects) ? projects : [];
  const selectedInitialCliProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const [selectedCliProviderId, setSelectedCliProviderId] = useState(
    () => selectedInitialCliProviderId
  );
  const [command, setCommand] = useState('');
  const [selectedCommandPresetId, setSelectedCommandPresetId] = useState('');
  const [commandPresetSaving, setCommandPresetSaving] = useState(false);
  const freeWindowDirectory = defaultCwd || t('defaultDirectory');
  const selectedCliProvider = resolveSelectableCliProvider(selectedCliProviderId, selectableCliProviders);
  const commandPresetEnabled = selectedCliProvider?.id === 'shell';
  const providerDescription = getCliProviderDescription(selectedCliProvider, language);
  const launchCommand = selectedCliProvider
    ? (
      getCliLaunchCommand(selectedCliProvider, 'project')
      || getCliLaunchCommand(selectedCliProvider, 'directory')
    )
    : '';
  const normalizedCommand = normalizeCommandPresetCommandInput(command);
  const activeCommandPreset = useMemo(() => (
    commandPresets.find((preset) => preset.id === activeCommandPresetId) || null
  ), [activeCommandPresetId, commandPresets]);
  const selectedCommandPreset = useMemo(() => (
    commandPresets.find((preset) => preset.id === selectedCommandPresetId) || null
  ), [commandPresets, selectedCommandPresetId]);

  useEffect(() => {
    if (open) {
      setSelectedCliProviderId(selectedInitialCliProviderId);
      setSelectedCommandPresetId(activeCommandPreset?.id || '');
      setCommand(activeCommandPreset?.command || '');
    }
  }, [activeCommandPreset, open, selectedInitialCliProviderId]);

  useEffect(() => {
    if (!open || !selectedCommandPresetId) {
      return;
    }

    if (!commandPresets.some((preset) => preset.id === selectedCommandPresetId)) {
      setSelectedCommandPresetId('');
    }
  }, [commandPresets, open, selectedCommandPresetId]);

  useEffect(() => {
    if (!selectedCliProvider || !getCliProviderById(selectedCliProviderId)) {
      setSelectedCliProviderId(selectedInitialCliProviderId);
    }
  }, [selectedCliProvider, selectedCliProviderId, selectedInitialCliProviderId]);

  const selectCommandPreset = useCallback((presetId) => {
    setSelectedCommandPresetId(presetId);
    const preset = commandPresets.find((item) => item.id === presetId) || null;
    setCommand(preset?.command || '');
  }, [commandPresets]);

  const saveCommandPreset = useCallback(async () => {
    if (!normalizedCommand) {
      showToast?.(t('commandPresetCommandRequired'));
      return;
    }

    if (typeof onCommandPresetSave !== 'function') {
      return;
    }

    const fallbackName = deriveCommandPresetTitle(normalizedCommand, t('commandPresetCommand'));
    const name = selectedCommandPreset?.name || fallbackName;

    setCommandPresetSaving(true);
    try {
      const store = await onCommandPresetSave({
        id: selectedCommandPreset?.id || '',
        name,
        command: normalizedCommand
      });
      const savedPreset = store?.savedPreset
        || (Array.isArray(store?.presets)
          ? store.presets.find((preset) => (
            preset.command === normalizedCommand && preset.name === name
          ))
          : null);
      if (savedPreset?.id) {
        setSelectedCommandPresetId(savedPreset.id);
        setCommand(savedPreset.command || normalizedCommand);
      }
      showToast?.(t('commandPresetSaved', { name: savedPreset?.name || name }));
    } catch (error) {
      showToast?.(t('commandPresetSaveFailed', { message: error.message }));
    } finally {
      setCommandPresetSaving(false);
    }
  }, [normalizedCommand, onCommandPresetSave, selectedCommandPreset, showToast, t]);

  const activateCommandPreset = useCallback(async () => {
    if (!selectedCommandPreset || typeof onCommandPresetSelect !== 'function') {
      return;
    }

    setCommandPresetSaving(true);
    try {
      await onCommandPresetSelect(selectedCommandPreset.id);
      showToast?.(t('commandPresetSelected', { name: selectedCommandPreset.name }));
    } catch (error) {
      showToast?.(t('commandPresetSelectFailed', { message: error.message }));
    } finally {
      setCommandPresetSaving(false);
    }
  }, [onCommandPresetSelect, selectedCommandPreset, showToast, t]);

  const deleteCommandPreset = useCallback(async () => {
    if (!selectedCommandPreset || typeof onCommandPresetDelete !== 'function') {
      return;
    }

    if (!window.confirm(t('commandPresetDeleteConfirm', { name: selectedCommandPreset.name }))) {
      return;
    }

    setCommandPresetSaving(true);
    try {
      const deletedName = selectedCommandPreset.name;
      await onCommandPresetDelete(selectedCommandPreset.id);
      setSelectedCommandPresetId('');
      setCommand('');
      showToast?.(t('commandPresetDeleted', { name: deletedName }));
    } catch (error) {
      showToast?.(t('commandPresetDeleteFailed', { message: error.message }));
    } finally {
      setCommandPresetSaving(false);
    }
  }, [onCommandPresetDelete, selectedCommandPreset, showToast, t]);

  const buildSelection = useCallback((selection) => {
    const payload = {
      ...selection,
      cliProviderId: selectedCliProvider.id
    };

    if (commandPresetEnabled) {
      payload.initialCommand = normalizedCommand;
    }

    return payload;
  }, [commandPresetEnabled, normalizedCommand, selectedCliProvider]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="newSessionDialog" className="left-4 right-auto top-4 w-[min(640px,calc(100vw-32px))] p-0">
        <DialogHeader>
          <DialogTitle>{t('newSessionSource')}</DialogTitle>
          <DialogDescription>{t('newSessionSourceDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4">
          <CliProviderSelectField
            id="newSessionCliProvider"
            language={language}
            label={t('cliProvider')}
            onChange={setSelectedCliProviderId}
            providerId={selectedCliProviderId}
            providers={selectableCliProviders}
            showSummary={false}
            targetType="project"
            t={t}
          />

          {selectedCliProvider && (
            <div className="grid gap-2 rounded-md border border-border bg-card/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold">
                  {getCliProviderDisplayName(selectedCliProvider, language)}
                </div>
                <CliProviderBadge language={language} provider={selectedCliProvider} />
              </div>
              {providerDescription && (
                <div className="text-xs text-muted-foreground">{providerDescription}</div>
              )}
              {launchCommand && (
                <div className="truncate font-mono text-[11px] text-muted-foreground" title={launchCommand}>
                  {t('launchCommand')}: {launchCommand}
                </div>
              )}
            </div>
          )}

          {commandPresetEnabled && (
            <div className="grid gap-3 rounded-md border border-border bg-muted/35 p-3">
              <div className="grid gap-2">
                <Label htmlFor="newSessionCommandPresetSelect">{t('commandPreset')}</Label>
                <Select
                  id="newSessionCommandPresetSelect"
                  title={commandPresetsPath}
                  disabled={commandPresetsLoading || commandPresetSaving}
                  onValueChange={selectCommandPreset}
                  options={[
                    { value: '', label: t('commandPresetNone') },
                    ...commandPresets.map((preset) => ({
                      value: preset.id,
                      label: `${preset.name}${preset.id === activeCommandPresetId ? ` (${t('commandPresetDefaultBadge')})` : ''}`
                    }))
                  ]}
                  value={selectedCommandPresetId}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="newSessionCommandPresetCommandInput">{t('commandPresetCommand')}</Label>
                <Textarea
                  id="newSessionCommandPresetCommandInput"
                  className="min-h-[84px] resize-y font-mono text-xs leading-5"
                  spellCheck={false}
                  value={command}
                  placeholder={t('commandPresetPlaceholder')}
                  onChange={(event) => setCommand(event.target.value)}
                />
                <div className="text-xs text-muted-foreground">
                  {t('commandPresetHint')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!normalizedCommand || commandPresetsLoading || commandPresetSaving}
                    onClick={saveCommandPreset}
                  >
                    <Save className="h-4 w-4" />
                    {t('commandPresetSave')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedCommandPreset?.id === activeCommandPresetId ? 'primary' : 'outline'}
                    size="sm"
                    disabled={!selectedCommandPreset || commandPresetsLoading || commandPresetSaving}
                    onClick={activateCommandPreset}
                  >
                    <Check className="h-4 w-4" />
                    {t('commandPresetSetDefault')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!selectedCommandPreset || commandPresetsLoading || commandPresetSaving}
                    onClick={deleteCommandPreset}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('commandPresetDelete')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('cliTarget')}
            </div>

            {selectedCliProvider && cliProviderSupportsTarget(selectedCliProvider, 'directory') && (
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                onClick={() => onSelect(buildSelection({
                  targetType: 'directory'
                }))}
              >
                <SquareTerminal className="h-4 w-4 shrink-0" />
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate font-medium">{t('freeWindow')}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground" title={freeWindowDirectory}>
                    {freeWindowDirectory}
                  </span>
                </span>
              </Button>
            )}

            {selectedCliProvider && cliProviderSupportsTarget(selectedCliProvider, 'project') && selectableProjects.length > 0 && (
              <div className="grid max-h-[min(360px,calc(100vh-360px))] gap-2 overflow-y-auto pr-1">
                {selectableProjects.map((project) => (
                  <Button
                    key={project.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                    onClick={() => onSelect(buildSelection({
                      targetType: 'project',
                      projectId: project.id
                    }))}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0" />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="truncate font-medium">{project.name}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground" title={project.path}>
                        {project.path}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgentAvatar({ agent, className }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = localFilePathToUrl(agent?.avatarPath);

  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground',
        className
      )}
      aria-hidden="true"
    >
      {avatarUrl && !failed ? (
        <img
          className="h-full w-full object-cover"
          src={avatarUrl}
          alt=""
          draggable="false"
          onError={() => setFailed(true)}
        />
      ) : (
        <Bot className="h-1/2 w-1/2" />
      )}
    </span>
  );
}

function AgentsDialog({
  agents,
  initialCliProviderId = defaultCliProviderId,
  language,
  onAgentsChange,
  onOpenChange,
  onRunAgent,
  open,
  skillsState,
  showToast,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const initialProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const avatarInputRef = useRef(null);
  const agentSkillOptions = useMemo(
    () => getWorkspaceAgentSkillOptions(skillsState?.snapshot),
    [skillsState?.snapshot]
  );
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');
  const [draftCliProviderId, setDraftCliProviderId] = useState(initialProviderId);
  const [draftAvatarPath, setDraftAvatarPath] = useState('');
  const [draftAvatarName, setDraftAvatarName] = useState('');
  const [draftSkills, setDraftSkills] = useState([]);
  const [taskDescription, setTaskDescription] = useState('');
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || null;
  const visibleAgentSkillOptions = useMemo(
    () => mergeAgentSkillReferences(agentSkillOptions, draftSkills),
    [agentSkillOptions, draftSkills]
  );
  const selectedAgentSkillKeys = useMemo(
    () => new Set(draftSkills.map(getAgentSkillReferenceKey).filter(Boolean)),
    [draftSkills]
  );
  const scannedAgentSkillKeys = useMemo(
    () => new Set(agentSkillOptions.map(getAgentSkillReferenceKey).filter(Boolean)),
    [agentSkillOptions]
  );
  const draftAgentForAvatar = selectedAgent
    ? { ...selectedAgent, avatarPath: draftAvatarPath, avatarName: draftAvatarName }
    : null;
  const normalizedName = draftName.trim();
  const normalizedTask = trimTrailingLineBreaks(taskDescription).trim();
  const agentSkillsLoading = skillsState?.status === 'loading';
  const dirty = Boolean(selectedAgent) && (
    normalizedName !== selectedAgent.name ||
    draftInstructions !== selectedAgent.instructions ||
    draftCliProviderId !== selectedAgent.cliProviderId ||
    !areAgentSkillReferencesEqual(draftSkills, selectedAgent.skills) ||
    draftAvatarPath !== String(selectedAgent.avatarPath || '') ||
    draftAvatarName !== String(selectedAgent.avatarName || '')
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(agents[0]?.id || '');
    }
  }, [agents, open, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgent) {
      setDraftName('');
      setDraftInstructions('');
      setDraftCliProviderId(initialProviderId);
      setDraftAvatarPath('');
      setDraftAvatarName('');
      setDraftSkills([]);
      return;
    }

    setDraftName(selectedAgent.name);
    setDraftInstructions(selectedAgent.instructions);
    setDraftCliProviderId(getInitialCliProviderId(selectedAgent.cliProviderId, selectableCliProviders));
    setDraftAvatarPath(selectedAgent.avatarPath || '');
    setDraftAvatarName(selectedAgent.avatarName || '');
    setDraftSkills(normalizeAgentSkillReferences(selectedAgent.skills));
  }, [initialProviderId, selectableCliProviders, selectedAgent]);

  const createAgent = useCallback(() => {
    const agent = createAgentRecord(t('newAgent'), initialProviderId);
    onAgentsChange([agent, ...agents]);
    setSelectedAgentId(agent.id);
  }, [agents, initialProviderId, onAgentsChange, t]);

  const saveAgent = useCallback((options = {}) => {
    if (!selectedAgent) {
      showToast(t('agentRequired'));
      return null;
    }

    if (!normalizedName) {
      showToast(t('agentNameRequired'));
      return null;
    }

    const updatedAgent = {
      ...selectedAgent,
      name: normalizedName,
      instructions: draftInstructions,
      cliProviderId: getInitialCliProviderId(draftCliProviderId, selectableCliProviders),
      skills: normalizeAgentSkillReferences(draftSkills),
      avatarPath: draftAvatarPath,
      avatarName: draftAvatarName,
      updatedAt: Date.now()
    };

    onAgentsChange(agents.map((agent) => (agent.id === updatedAgent.id ? updatedAgent : agent)));
    if (!options.silent) {
      showToast(t('agentSaved', { name: updatedAgent.name }));
    }
    return updatedAgent;
  }, [
    agents,
    draftCliProviderId,
    draftAvatarName,
    draftAvatarPath,
    draftInstructions,
    draftSkills,
    normalizedName,
    onAgentsChange,
    selectableCliProviders,
    selectedAgent,
    showToast,
    t
  ]);

  const deleteAgent = useCallback(() => {
    if (!selectedAgent) {
      return;
    }

    if (!window.confirm(t('agentDeleteConfirm', { name: selectedAgent.name }))) {
      return;
    }

    const nextAgents = agents.filter((agent) => agent.id !== selectedAgent.id);
    onAgentsChange(nextAgents);
    setSelectedAgentId(nextAgents[0]?.id || '');
    showToast(t('agentDeleted', { name: selectedAgent.name }));
  }, [agents, onAgentsChange, selectedAgent, showToast, t]);

  const uploadAgentAvatar = useCallback(async (file) => {
    if (!selectedAgent) {
      showToast(t('agentRequired'));
      return;
    }
    if (!isAgentAvatarFile(file)) {
      showToast(t('agentAvatarInvalid'));
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const savedAvatar = await bridge.saveAgentAvatar({
        agentId: selectedAgent.id,
        fileName: file.name,
        mimeType: file.type,
        bytes: new Uint8Array(arrayBuffer)
      });
      setDraftAvatarPath(savedAvatar.path || '');
      setDraftAvatarName(savedAvatar.name || file.name || '');
      showToast(t('agentAvatarSaved'));
    } catch (error) {
      showToast(t('agentAvatarSaveFailed', { message: error.message }));
    }
  }, [selectedAgent, showToast, t]);

  const removeAgentAvatar = useCallback(() => {
    setDraftAvatarPath('');
    setDraftAvatarName('');
  }, []);

  const toggleAgentSkill = useCallback((skill) => {
    const normalizedSkill = normalizeAgentSkillReference(skill);
    const key = getAgentSkillReferenceKey(normalizedSkill);
    if (!normalizedSkill || !key) {
      return;
    }

    setDraftSkills((current) => {
      if (current.some((item) => getAgentSkillReferenceKey(item) === key)) {
        return current.filter((item) => getAgentSkillReferenceKey(item) !== key);
      }

      return normalizeAgentSkillReferences([...current, normalizedSkill]);
    });
  }, []);

  const runAgent = useCallback(() => {
    if (!selectedAgent) {
      showToast(t('agentRequired'));
      return;
    }

    if (!normalizedTask) {
      showToast(t('agentTaskRequired'));
      return;
    }

    const agentToRun = dirty ? saveAgent({ silent: true }) : selectedAgent;
    if (!agentToRun) {
      return;
    }

    onRunAgent(agentToRun, normalizedTask);
    setTaskDescription('');
  }, [dirty, normalizedTask, onRunAgent, saveAgent, selectedAgent, showToast, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="agentsDialog" className="grid h-[min(760px,calc(100vh-96px))] w-[min(980px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)_auto] p-0">
        <DialogHeader>
          <DialogTitle>{t('agentsDialogTitle')}</DialogTitle>
          <DialogDescription>{t('agentsDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)]">
          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-border bg-muted/25">
            <div className="border-b border-border p-3">
              <Button type="button" className="w-full justify-start" size="sm" onClick={createAgent}>
                <Plus className="h-4 w-4" />
                {t('newAgent')}
              </Button>
            </div>
            <div className="min-h-0 overflow-auto p-2">
              {agents.length === 0 && (
                <div className="p-3 text-xs leading-5 text-muted-foreground">{t('agentsEmpty')}</div>
              )}
              {agents.map((agent) => {
                const provider = resolveCliProvider(agent.cliProviderId);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedAgentId === agent.id && 'bg-accent text-accent-foreground'
                    )}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <AgentAvatar agent={agent} className="h-9 w-9" />
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="truncate text-sm font-semibold">{agent.name}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <CliProviderIcon provider={provider} className="h-3.5 w-3.5" />
                        <span className="truncate">{getCliProviderBadgeLabel(provider, language)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-auto p-4">
            {selectedAgent ? (
              <div className="grid content-start gap-4">
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/70 p-3">
                  <AgentAvatar agent={draftAgentForAvatar} className="h-16 w-16" />
                  <div className="grid min-w-[180px] flex-1 gap-1">
                    <div className="text-sm font-semibold">{t('agentAvatar')}</div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      {t('agentAvatarHint')}
                    </div>
                    {draftAvatarName && (
                      <div className="truncate font-mono text-[11px] text-muted-foreground" title={draftAvatarName}>
                        {draftAvatarName}
                      </div>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      event.target.value = '';
                      if (file) {
                        void uploadAgentAvatar(file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {t('uploadAgentAvatar')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!draftAvatarPath}
                    onClick={removeAgentAvatar}
                  >
                    <X className="h-4 w-4" />
                    {t('removeAgentAvatar')}
                  </Button>
                </div>

                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="grid gap-2">
                    <Label htmlFor="agentName">{t('agentName')}</Label>
                    <Input
                      id="agentName"
                      value={draftName}
                      placeholder={t('agentNamePlaceholder')}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  </div>
                  <CliProviderSelectField
                    id="agentCliProvider"
                    language={language}
                    label={t('cliProvider')}
                    onChange={setDraftCliProviderId}
                    providerId={draftCliProviderId}
                    providers={selectableCliProviders}
                    showSummary={false}
                    targetType="project"
                    t={t}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="agentInstructions">{t('agentInstructions')}</Label>
                  <Textarea
                    id="agentInstructions"
                    className="min-h-[220px] resize-y font-mono text-xs leading-5"
                    value={draftInstructions}
                    placeholder={t('agentInstructionsPlaceholder')}
                    onChange={(event) => setDraftInstructions(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="grid min-w-0 gap-1">
                      <Label>{t('agentSkills')}</Label>
                      <div className="text-xs leading-5 text-muted-foreground">{t('agentSkillsHint')}</div>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {t('agentSkillsSelectedCount', { count: draftSkills.length })}
                    </Badge>
                  </div>

                  {agentSkillsLoading && visibleAgentSkillOptions.length === 0 ? (
                    <div className="flex min-h-16 items-center gap-2 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      {t('skillsLoading')}
                    </div>
                  ) : visibleAgentSkillOptions.length > 0 ? (
                    <div className="grid max-h-56 gap-2 overflow-auto rounded-md border border-border bg-background/60 p-2">
                      {visibleAgentSkillOptions.map((skill) => {
                        const skillKey = getAgentSkillReferenceKey(skill);
                        const selected = selectedAgentSkillKeys.has(skillKey);
                        const directoryPath = getAgentSkillReferenceDirectoryPath(skill);
                        const skillName = String(skill.name || skill.slashName || '').trim()
                          || directoryPath.split('/').filter(Boolean).pop()
                          || t('agentSkills');
                        const description = String(skill.description || '').trim();
                        const missing = selected && !scannedAgentSkillKeys.has(skillKey);

                        return (
                          <button
                            key={skillKey || skill.id || skillName}
                            type="button"
                            aria-pressed={selected}
                            className={cn(
                              'flex min-h-16 w-full items-start gap-2 rounded-md border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              selected && 'border-primary/50 bg-primary/5'
                            )}
                            title={directoryPath}
                            onClick={() => toggleAgentSkill(skill)}
                          >
                            <Sparkles className={cn(
                              'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground',
                              selected && 'text-primary'
                            )} />
                            <span className="grid min-w-0 flex-1 gap-1">
                              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-medium">{skillName}</span>
                                {skill.slashName && (
                                  <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px]">
                                    /{skill.slashName}
                                  </Badge>
                                )}
                                {missing && (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                                    {t('agentSkillMissing')}
                                  </Badge>
                                )}
                              </span>
                              <span className="truncate font-mono text-[11px] text-muted-foreground">
                                {directoryPath}
                              </span>
                              {description && (
                                <span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {description}
                                </span>
                              )}
                            </span>
                            {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex min-h-16 items-center rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground">
                      {t('agentSkillsEmpty')}
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="agentTask">{t('agentTask')}</Label>
                  <Textarea
                    id="agentTask"
                    className="min-h-[132px] resize-y"
                    value={taskDescription}
                    placeholder={t('agentTaskPlaceholder')}
                    onChange={(event) => setTaskDescription(event.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                {t('agentsEmpty')}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button type="button" variant="outline" onClick={deleteAgent} disabled={!selectedAgent}>
            <Trash2 className="h-4 w-4" />
            {t('deleteAgent')}
          </Button>
          <Button type="button" variant={dirty ? 'primary' : 'outline'} onClick={() => saveAgent()} disabled={!selectedAgent}>
            <Save className="h-4 w-4" />
            {t('saveAgent')}
          </Button>
          <Button type="button" variant="primary" onClick={runAgent} disabled={!selectedAgent || !normalizedTask}>
            <Play className="h-4 w-4" />
            {t('agentRun')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutopilotDialog({
  agents,
  autopilots,
  language,
  onAutopilotsChange,
  onOpenChange,
  onRunAutopilot,
  open,
  showToast,
  t
}) {
  const [selectedAutopilotId, setSelectedAutopilotId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftAgentId, setDraftAgentId] = useState('');
  const [draftRunbook, setDraftRunbook] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftScheduleType, setDraftScheduleType] = useState('daily');
  const [draftTime, setDraftTime] = useState(autopilotDefaultTime);
  const [draftWeekday, setDraftWeekday] = useState('1');
  const [draftCronExpression, setDraftCronExpression] = useState(autopilotDefaultCronExpression);
  const selectedAutopilot = autopilots.find((autopilot) => autopilot.id === selectedAutopilotId) || null;
  const scheduleOptions = useMemo(() => [
    { value: 'daily', label: t('autopilotScheduleDaily') },
    { value: 'weekday', label: t('autopilotScheduleWeekday') },
    { value: 'weekly', label: t('autopilotScheduleWeekly') },
    { value: 'cron', label: t('autopilotScheduleCron') }
  ], [t]);
  const weekdayOptions = useMemo(() => autopilotWeekdayIds.map((weekday) => ({
    value: weekday,
    label: getAutopilotWeekdayLabel(weekday, t)
  })), [t]);
  const agentOptions = useMemo(() => agents.map((agent) => ({
    value: agent.id,
    label: agent.name
  })), [agents]);
  const selectedAgent = agents.find((agent) => agent.id === draftAgentId) || null;
  const draftSchedule = {
    ...selectedAutopilot,
    name: draftName,
    agentId: draftAgentId,
    runbook: draftRunbook,
    enabled: draftEnabled,
    scheduleType: draftScheduleType,
    time: draftTime,
    weekday: draftWeekday,
    cronExpression: draftCronExpression
  };
  const nextRunAt = selectedAutopilot && draftEnabled
    ? getAutopilotNextRunAt(draftSchedule, Date.now())
    : null;
  const dirty = Boolean(selectedAutopilot) && (
    draftName.trim() !== selectedAutopilot.name ||
    draftAgentId !== selectedAutopilot.agentId ||
    draftRunbook !== selectedAutopilot.runbook ||
    draftEnabled !== selectedAutopilot.enabled ||
    draftScheduleType !== selectedAutopilot.scheduleType ||
    normalizeAutopilotTime(draftTime) !== selectedAutopilot.time ||
    normalizeAutopilotWeekday(draftWeekday) !== selectedAutopilot.weekday ||
    normalizeAutopilotCronExpression(draftCronExpression) !== selectedAutopilot.cronExpression
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (!selectedAutopilotId || !autopilots.some((autopilot) => autopilot.id === selectedAutopilotId)) {
      setSelectedAutopilotId(autopilots[0]?.id || '');
    }
  }, [autopilots, open, selectedAutopilotId]);

  useEffect(() => {
    if (!selectedAutopilot) {
      setDraftName('');
      setDraftAgentId(agents[0]?.id || '');
      setDraftRunbook('');
      setDraftEnabled(false);
      setDraftScheduleType('daily');
      setDraftTime(autopilotDefaultTime);
      setDraftWeekday('1');
      setDraftCronExpression(autopilotDefaultCronExpression);
      return;
    }

    setDraftName(selectedAutopilot.name);
    setDraftAgentId(selectedAutopilot.agentId || agents[0]?.id || '');
    setDraftRunbook(selectedAutopilot.runbook);
    setDraftEnabled(selectedAutopilot.enabled);
    setDraftScheduleType(selectedAutopilot.scheduleType);
    setDraftTime(selectedAutopilot.time);
    setDraftWeekday(selectedAutopilot.weekday);
    setDraftCronExpression(selectedAutopilot.cronExpression);
  }, [agents, selectedAutopilot]);

  const createAutopilot = useCallback(() => {
    const autopilot = createAutopilotRecord(agents[0]?.id || '');
    onAutopilotsChange([autopilot, ...autopilots]);
    setSelectedAutopilotId(autopilot.id);
  }, [agents, autopilots, onAutopilotsChange]);

  const saveAutopilot = useCallback((options = {}) => {
    if (!selectedAutopilot) {
      showToast(t('autopilotRequired'));
      return null;
    }

    const name = draftName.trim() || selectedAutopilot.name || 'Autopilot';
    const runbook = trimTrailingLineBreaks(draftRunbook).trim();
    const agentId = String(draftAgentId || '').trim();
    const scheduleType = normalizeAutopilotScheduleType(draftScheduleType);
    const cronExpression = normalizeAutopilotCronExpression(draftCronExpression);

    if (!agentId || !agents.some((agent) => agent.id === agentId)) {
      showToast(t('autopilotAgentRequired'));
      return null;
    }
    if (!runbook) {
      showToast(t('autopilotRunbookRequired'));
      return null;
    }
    if (scheduleType === 'cron' && !parseCronExpression(cronExpression)) {
      showToast(t('autopilotCronInvalid'));
      return null;
    }

    const updatedAutopilot = normalizeAutopilotRecord({
      ...selectedAutopilot,
      name,
      enabled: draftEnabled,
      agentId,
      runbook,
      scheduleType,
      time: normalizeAutopilotTime(draftTime),
      weekday: normalizeAutopilotWeekday(draftWeekday),
      cronExpression,
      updatedAt: Date.now()
    });

    onAutopilotsChange(autopilots.map((autopilot) => (
      autopilot.id === updatedAutopilot.id ? updatedAutopilot : autopilot
    )));
    if (!options.silent) {
      showToast(t('autopilotSaved', { name: updatedAutopilot.name }));
    }
    return updatedAutopilot;
  }, [
    agents,
    autopilots,
    draftAgentId,
    draftCronExpression,
    draftEnabled,
    draftName,
    draftRunbook,
    draftScheduleType,
    draftTime,
    draftWeekday,
    onAutopilotsChange,
    selectedAutopilot,
    showToast,
    t
  ]);

  const deleteAutopilot = useCallback(() => {
    if (!selectedAutopilot) {
      return;
    }

    if (!window.confirm(t('autopilotDeleteConfirm', { name: selectedAutopilot.name }))) {
      return;
    }

    const nextAutopilots = autopilots.filter((autopilot) => autopilot.id !== selectedAutopilot.id);
    onAutopilotsChange(nextAutopilots);
    setSelectedAutopilotId(nextAutopilots[0]?.id || '');
    showToast(t('autopilotDeleted', { name: selectedAutopilot.name }));
  }, [autopilots, onAutopilotsChange, selectedAutopilot, showToast, t]);

  const runAutopilotNow = useCallback(() => {
    const autopilotToRun = dirty ? saveAutopilot({ silent: true }) : selectedAutopilot;
    if (!autopilotToRun) {
      return;
    }

    onRunAutopilot(autopilotToRun, { manual: true });
  }, [dirty, onRunAutopilot, saveAutopilot, selectedAutopilot]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="autopilotDialog" className="grid h-[min(780px,calc(100vh-96px))] w-[min(1040px,calc(100vw-32px))] grid-rows-[auto_minmax(0,1fr)_auto] p-0">
        <DialogHeader>
          <DialogTitle>{t('autopilotDialogTitle')}</DialogTitle>
          <DialogDescription>{t('autopilotDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)]">
          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-border bg-muted/25">
            <div className="border-b border-border p-3">
              <Button type="button" className="w-full justify-start" size="sm" onClick={createAutopilot}>
                <Plus className="h-4 w-4" />
                {t('newAutopilot')}
              </Button>
            </div>
            <div className="min-h-0 overflow-auto p-2">
              {autopilots.length === 0 && (
                <div className="p-3 text-xs leading-5 text-muted-foreground">{t('autopilotEmpty')}</div>
              )}
              {autopilots.map((autopilot) => {
                const agent = agents.find((item) => item.id === autopilot.agentId);
                const itemNextRunAt = autopilot.enabled ? getAutopilotNextRunAt(autopilot, Date.now()) : null;
                return (
                  <button
                    key={autopilot.id}
                    type="button"
                    className={cn(
                      'grid w-full gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedAutopilotId === autopilot.id && 'bg-accent text-accent-foreground'
                    )}
                    onClick={() => setSelectedAutopilotId(autopilot.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{autopilot.name}</span>
                      <Badge variant={autopilot.enabled ? 'secondary' : 'outline'} className="shrink-0">
                        {autopilot.enabled ? t('taskRunning') : t('taskIdle')}
                      </Badge>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {agent?.name || t('autopilotAgentRequired')}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {itemNextRunAt
                        ? `${t('autopilotNextRun')} ${formatAutopilotDateTime(itemNextRunAt, language)}`
                        : t('autopilotNotScheduled')}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-auto p-4">
            {selectedAutopilot ? (
              <div className="grid content-start gap-4">
                <div className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-card/70 p-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                    <CalendarClock className="h-5 w-5" />
                  </span>
                  <div className="grid min-w-[220px] flex-1 gap-1">
                    <div className="text-sm font-semibold">{describeAutopilotSchedule(draftSchedule, t)}</div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      {selectedAgent?.name || t('autopilotAgentRequired')}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={draftEnabled}
                      onChange={(event) => setDraftEnabled(event.target.checked)}
                    />
                    {t('autopilotEnabled')}
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
                  <div className="grid gap-2">
                    <Label htmlFor="autopilotName">{t('autopilotName')}</Label>
                    <Input
                      id="autopilotName"
                      value={draftName}
                      placeholder={t('autopilotNamePlaceholder')}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="autopilotAgent">{t('autopilotAgent')}</Label>
                    <Select
                      id="autopilotAgent"
                      disabled={agentOptions.length === 0}
                      value={draftAgentId}
                      options={agentOptions}
                      placeholder={t('autopilotAgentRequired')}
                      onValueChange={setDraftAgentId}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[220px_160px_minmax(0,1fr)]">
                  <div className="grid gap-2">
                    <Label htmlFor="autopilotSchedule">{t('autopilotSchedule')}</Label>
                    <Select
                      id="autopilotSchedule"
                      value={draftScheduleType}
                      options={scheduleOptions}
                      onValueChange={(value) => setDraftScheduleType(normalizeAutopilotScheduleType(value))}
                    />
                  </div>

                  {draftScheduleType !== 'cron' && (
                    <div className="grid gap-2">
                      <Label htmlFor="autopilotTime">{t('autopilotTime')}</Label>
                      <Input
                        id="autopilotTime"
                        type="time"
                        value={draftTime}
                        onChange={(event) => setDraftTime(normalizeAutopilotTime(event.target.value))}
                      />
                    </div>
                  )}

                  {draftScheduleType === 'weekly' && (
                    <div className="grid gap-2">
                      <Label htmlFor="autopilotWeekday">{t('autopilotWeekday')}</Label>
                      <Select
                        id="autopilotWeekday"
                        value={draftWeekday}
                        options={weekdayOptions}
                        onValueChange={(value) => setDraftWeekday(normalizeAutopilotWeekday(value))}
                      />
                    </div>
                  )}

                  {draftScheduleType === 'weekday' && (
                    <div className="grid content-end gap-2 text-xs leading-5 text-muted-foreground">
                      {`${getAutopilotWeekdayLabel('1', t)} - ${getAutopilotWeekdayLabel('5', t)}`}
                    </div>
                  )}

                  {draftScheduleType === 'daily' && (
                    <div className="grid content-end gap-2 text-xs leading-5 text-muted-foreground">
                      {t('autopilotScheduleDaily')}
                    </div>
                  )}

                  {draftScheduleType === 'cron' && (
                    <div className="grid gap-2 md:col-span-2">
                      <Label htmlFor="autopilotCron">{t('autopilotCron')}</Label>
                      <Input
                        id="autopilotCron"
                        className="font-mono"
                        value={draftCronExpression}
                        placeholder={t('autopilotCronPlaceholder')}
                        onChange={(event) => setDraftCronExpression(event.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="autopilotRunbook">{t('autopilotRunbook')}</Label>
                  <Textarea
                    id="autopilotRunbook"
                    className="min-h-[260px] resize-y font-mono text-xs leading-5"
                    value={draftRunbook}
                    placeholder={t('autopilotRunbookPlaceholder')}
                    onChange={(event) => setDraftRunbook(event.target.value)}
                  />
                </div>

                <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-medium text-foreground">{t('autopilotLastRun')}: </span>
                    {selectedAutopilot.lastRunAt
                      ? formatAutopilotDateTime(selectedAutopilot.lastRunAt, language)
                      : t('autopilotNeverRun')}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">{t('autopilotNextRun')}: </span>
                    {nextRunAt ? formatAutopilotDateTime(nextRunAt, language) : t('autopilotNotScheduled')}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                {t('autopilotEmpty')}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button type="button" variant="outline" onClick={deleteAutopilot} disabled={!selectedAutopilot}>
            <Trash2 className="h-4 w-4" />
            {t('deleteAutopilot')}
          </Button>
          <Button type="button" variant={dirty ? 'primary' : 'outline'} onClick={() => saveAutopilot()} disabled={!selectedAutopilot}>
            <Save className="h-4 w-4" />
            {t('saveAutopilot')}
          </Button>
          <Button type="button" variant="primary" onClick={runAutopilotNow} disabled={!selectedAutopilot}>
            <Play className="h-4 w-4" />
            {t('autopilotRunNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnimatedTopbarNumber({ className, text }) {
  const value = String(text ?? '');

  return (
    <span
      key={value}
      className={cn('t-digit-group is-animating', className)}
      aria-label={value}
    >
      {[...value].map((character, index) => (
        <span
          key={`${character}-${index}`}
          className="t-digit"
          style={{ '--digit-stagger-index': index }}
          aria-hidden="true"
        >
          {character}
        </span>
      ))}
    </span>
  );
}

function SystemStats({ t }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let canceled = false;

    const refreshStats = () => {
      bridge.getSystemStats().then((nextStats) => {
        if (!canceled) {
          setStats(nextStats);
        }
      }).catch(() => {
        if (!canceled) {
          setStats(null);
        }
      });
    };

    refreshStats();
    const timer = window.setInterval(refreshStats, systemStatsRefreshMs);
    return () => {
      canceled = true;
      window.clearInterval(timer);
    };
  }, []);

  const cpuText = formatUsagePercent(stats?.cpuUsage);
  const memoryText = formatUsagePercent(stats?.memoryUsage);
  const memoryTone = getMemoryUsageAlertTone(stats?.memoryUsage);
  const memoryBlockClassName = cn(
    'flex min-w-[72px] items-center gap-1.5 rounded-md px-1.5 transition-colors',
    memoryTone === 'warning' && 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300',
    memoryTone === 'critical' && 'bg-red-500/10 text-red-700 dark:bg-red-400/12 dark:text-red-200'
  );
  const memoryValueClassName = cn(
    'font-mono tabular-nums text-foreground',
    memoryTone === 'warning' && 'text-amber-700 dark:text-amber-300',
    memoryTone === 'critical' && 'text-red-700 dark:text-red-200'
  );
  const memoryTitle = stats
    ? `${t('memoryUsage')}: ${formatBytes(stats.usedMemory)} / ${formatBytes(stats.totalMemory)}`
    : t('systemStatsUnavailable');

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground"
      aria-label={`${t('cpuUsage')} ${cpuText}, ${t('memoryUsage')} ${memoryText}`}
    >
      <div className="flex min-w-[66px] items-center gap-1.5" title={`${t('cpuUsage')}: ${cpuText}`}>
        <Cpu className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">{t('cpuUsage')}</span>
        <AnimatedTopbarNumber className="font-mono tabular-nums text-foreground" text={cpuText} />
      </div>
      <div className={memoryBlockClassName} title={memoryTitle}>
        <MemoryStick className={cn('h-3.5 w-3.5 text-primary', memoryTone === 'warning' && 'text-amber-700 dark:text-amber-300', memoryTone === 'critical' && 'text-red-700 dark:text-red-200')} />
        <span className="font-medium">{t('memoryUsage')}</span>
        <AnimatedTopbarNumber className={memoryValueClassName} text={memoryText} />
      </div>
    </div>
  );
}

function TopbarSessionStats({ counts, t }) {
  const safeCounts = {
    total: counts?.total || 0,
    running: counts?.running || 0,
    idle: counts?.idle || 0,
    completed: counts?.completed || 0,
    error: counts?.error || 0
  };
  const title = t('topbarSessionStatsTitle', safeCounts);
  const hasRunningSessions = safeCounts.running > 0;

  return (
    <div
      className={cn(
        'flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-xs text-muted-foreground',
        hasRunningSessions && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
      )}
      title={title}
      aria-label={title}
    >
      <SquareTerminal
        className={cn(
          'h-3.5 w-3.5 text-primary',
          hasRunningSessions && 'text-emerald-600 dark:text-emerald-300'
        )}
      />
      <span className="hidden whitespace-nowrap font-medium lg:inline">{t('topbarRunningSessions')}</span>
      <span className="whitespace-nowrap font-medium lg:hidden">{t('taskRunning')}</span>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{safeCounts.running}</span>
    </div>
  );
}

function SidebarThemeControl({ className, compact = false, onThemeChange, t, theme }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const Icon = nextTheme === 'dark' ? Moon : Sun;
  const label = `${t('appearance')}: ${t(nextTheme)}`;

  return (
    <IconButton
      label={label}
      type="button"
      className={cn(className, !compact && 'justify-self-start')}
      onClick={() => onThemeChange(nextTheme)}
    >
      <Icon className="h-4 w-4" />
    </IconButton>
  );
}

function GridSessionDialog({
  initialCliProviderId = defaultCliProviderId,
  language,
  onCreate,
  onOpenChange,
  open,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const selectedInitialCliProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const [count, setCount] = useState('4');
  const [selectedCliProviderId, setSelectedCliProviderId] = useState(
    () => selectedInitialCliProviderId
  );
  const parsedCount = parseGridSessionCount(count);
  const valid = parsedCount !== null;

  useEffect(() => {
    if (open) {
      setCount('4');
      setSelectedCliProviderId(selectedInitialCliProviderId);
    }
  }, [open, selectedInitialCliProviderId]);

  const submit = useCallback(() => {
    if (!valid) {
      return;
    }

    onCreate(parsedCount, {
      cliProviderId: selectedCliProviderId
    });
  }, [onCreate, parsedCount, selectedCliProviderId, valid]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="gridSessionDialog" className="left-4 right-auto top-4 w-[min(420px,calc(100vw-32px))] p-0">
        <DialogHeader>
          <DialogTitle>{t('gridSessionDialogTitle')}</DialogTitle>
          <DialogDescription>{t('gridSessionDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4">
          <CliProviderSelectField
            id="gridSessionCliProvider"
            language={language}
            label={t('cliProvider')}
            onChange={setSelectedCliProviderId}
            providerId={selectedCliProviderId}
            providers={selectableCliProviders}
            targetType="project"
            t={t}
          />

          <div className="grid gap-2">
            <Label htmlFor="gridSessionCount">{t('gridSessionCount')}</Label>
            <Input
              id="gridSessionCount"
              type="number"
              min={gridSessionCountMin}
              max={gridSessionCountMax}
              step={1}
              value={count}
              onChange={(event) => setCount(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <div className={cn('text-xs text-muted-foreground', !valid && 'text-destructive')}>
              {valid
                ? t('gridSessionCountHint', { max: gridSessionCountMax })
                : t('gridSessionInvalid', { max: gridSessionCountMax })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[4, 6, 9, 12].map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={count === String(preset) ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setCount(String(preset))}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!valid}>
            <Grid2X2 className="h-4 w-4" />
            {t('gridSessionCreate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommandLineConfigDialog({
  activeCommandPresetId = '',
  commandPresets = [],
  commandPresetsLoading = false,
  commandPresetsPath = '',
  initialCliProviderId = defaultCliProviderId,
  initialDirectory,
  language,
  onCommandPresetDelete,
  onCommandPresetSave,
  onCommandPresetSelect,
  onCreate,
  onOpenChange,
  open,
  showToast,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['directory']), []);
  const selectedInitialCliProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const [directory, setDirectory] = useState('');
  const [command, setCommand] = useState('');
  const [selectedCommandPresetId, setSelectedCommandPresetId] = useState('');
  const [commandPresetSaving, setCommandPresetSaving] = useState(false);
  const [selectedCliProviderId, setSelectedCliProviderId] = useState(
    () => selectedInitialCliProviderId
  );
  const normalizedDirectory = String(directory || '').trim();
  const normalizedCommand = normalizeCommandPresetCommandInput(command);
  const commandPresetEnabled = selectedCliProviderId === 'shell';
  const activeCommandPreset = useMemo(() => (
    commandPresets.find((preset) => preset.id === activeCommandPresetId) || null
  ), [activeCommandPresetId, commandPresets]);
  const selectedCommandPreset = useMemo(() => (
    commandPresets.find((preset) => preset.id === selectedCommandPresetId) || null
  ), [commandPresets, selectedCommandPresetId]);

  useEffect(() => {
    if (open) {
      setDirectory(String(initialDirectory || ''));
      setSelectedCliProviderId(selectedInitialCliProviderId);
      setSelectedCommandPresetId(activeCommandPreset?.id || '');
      setCommand(activeCommandPreset?.command || '');
    }
  }, [activeCommandPreset, initialDirectory, open, selectedInitialCliProviderId]);

  useEffect(() => {
    if (!open || !selectedCommandPresetId) {
      return;
    }

    if (!commandPresets.some((preset) => preset.id === selectedCommandPresetId)) {
      setSelectedCommandPresetId('');
    }
  }, [commandPresets, open, selectedCommandPresetId]);

  const browseDirectory = useCallback(async () => {
    const selected = await bridge.chooseDirectory();
    if (selected) {
      setDirectory(selected);
    }
  }, []);

  const selectCommandPreset = useCallback((presetId) => {
    setSelectedCommandPresetId(presetId);
    const preset = commandPresets.find((item) => item.id === presetId) || null;
    setCommand(preset?.command || '');
  }, [commandPresets]);

  const saveCommandPreset = useCallback(async () => {
    if (!normalizedCommand) {
      showToast?.(t('commandPresetCommandRequired'));
      return;
    }

    if (typeof onCommandPresetSave !== 'function') {
      return;
    }

    const fallbackName = deriveCommandPresetTitle(normalizedCommand, t('commandPresetCommand'));
    const name = selectedCommandPreset?.name || fallbackName;

    setCommandPresetSaving(true);
    try {
      const store = await onCommandPresetSave({
        id: selectedCommandPreset?.id || '',
        name,
        command: normalizedCommand
      });
      const savedPreset = store?.savedPreset
        || (Array.isArray(store?.presets)
          ? store.presets.find((preset) => (
            preset.command === normalizedCommand && preset.name === name
          ))
          : null);
      if (savedPreset?.id) {
        setSelectedCommandPresetId(savedPreset.id);
        setCommand(savedPreset.command || normalizedCommand);
      }
      showToast?.(t('commandPresetSaved', { name: savedPreset?.name || name }));
    } catch (error) {
      showToast?.(t('commandPresetSaveFailed', { message: error.message }));
    } finally {
      setCommandPresetSaving(false);
    }
  }, [normalizedCommand, onCommandPresetSave, selectedCommandPreset, showToast, t]);

  const activateCommandPreset = useCallback(async () => {
    if (!selectedCommandPreset || typeof onCommandPresetSelect !== 'function') {
      return;
    }

    setCommandPresetSaving(true);
    try {
      await onCommandPresetSelect(selectedCommandPreset.id);
      showToast?.(t('commandPresetSelected', { name: selectedCommandPreset.name }));
    } catch (error) {
      showToast?.(t('commandPresetSelectFailed', { message: error.message }));
    } finally {
      setCommandPresetSaving(false);
    }
  }, [onCommandPresetSelect, selectedCommandPreset, showToast, t]);

  const deleteCommandPreset = useCallback(async () => {
    if (!selectedCommandPreset || typeof onCommandPresetDelete !== 'function') {
      return;
    }

    if (!window.confirm(t('commandPresetDeleteConfirm', { name: selectedCommandPreset.name }))) {
      return;
    }

    setCommandPresetSaving(true);
    try {
      const deletedName = selectedCommandPreset.name;
      await onCommandPresetDelete(selectedCommandPreset.id);
      setSelectedCommandPresetId('');
      setCommand('');
      showToast?.(t('commandPresetDeleted', { name: deletedName }));
    } catch (error) {
      showToast?.(t('commandPresetDeleteFailed', { message: error.message }));
    } finally {
      setCommandPresetSaving(false);
    }
  }, [onCommandPresetDelete, selectedCommandPreset, showToast, t]);

  const submit = useCallback(() => {
    if (!normalizedDirectory) {
      return;
    }

    const payload = {
      cwd: normalizedDirectory,
      cliProviderId: selectedCliProviderId
    };

    if (commandPresetEnabled) {
      payload.initialCommand = normalizedCommand;
    }

    onCreate(payload);
  }, [commandPresetEnabled, normalizedCommand, normalizedDirectory, onCreate, selectedCliProviderId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="commandLineConfigDialog" className="left-4 right-auto top-4 max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto p-0">
        <DialogHeader>
          <DialogTitle>{t('addCommandDialogTitle')}</DialogTitle>
          <DialogDescription>{t('addCommandDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4">
          <CliProviderSelectField
            id="commandLineCliProvider"
            language={language}
            label={t('cliProvider')}
            onChange={setSelectedCliProviderId}
            providerId={selectedCliProviderId}
            providers={selectableCliProviders}
            targetType="directory"
            t={t}
          />

          <div className="grid gap-2">
            <Label htmlFor="commandLineDirectoryInput">{t('directory')}</Label>
            <div className="flex gap-2">
              <Input
                id="commandLineDirectoryInput"
                className="font-mono text-xs"
                spellCheck={false}
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && normalizedDirectory) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={browseDirectory}>
                <FolderOpen className="h-4 w-4" />
                {t('chooseDirectory')}
              </Button>
            </div>
            <div className={cn('text-xs text-muted-foreground', !normalizedDirectory && 'text-destructive')}>
              {normalizedDirectory ? t('addCommandDirectoryHint') : t('dialogPathRequired')}
            </div>
          </div>

          {commandPresetEnabled && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="commandPresetSelect">{t('commandPreset')}</Label>
                <Select
                  id="commandPresetSelect"
                  title={commandPresetsPath}
                  disabled={commandPresetsLoading || commandPresetSaving}
                  onValueChange={selectCommandPreset}
                  options={[
                    { value: '', label: t('commandPresetNone') },
                    ...commandPresets.map((preset) => ({
                      value: preset.id,
                      label: `${preset.name}${preset.id === activeCommandPresetId ? ` (${t('commandPresetDefaultBadge')})` : ''}`
                    }))
                  ]}
                  value={selectedCommandPresetId}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="commandPresetCommandInput">{t('commandPresetCommand')}</Label>
                <Textarea
                  id="commandPresetCommandInput"
                  className="min-h-[84px] resize-y font-mono text-xs leading-5"
                  spellCheck={false}
                  value={command}
                  placeholder={t('commandPresetPlaceholder')}
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && normalizedDirectory) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="text-xs text-muted-foreground">
                  {t('commandPresetHint')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!normalizedCommand || commandPresetsLoading || commandPresetSaving}
                    onClick={saveCommandPreset}
                  >
                    <Save className="h-4 w-4" />
                    {t('commandPresetSave')}
                  </Button>
                  <Button
                    type="button"
                    variant={selectedCommandPreset?.id === activeCommandPresetId ? 'primary' : 'outline'}
                    size="sm"
                    disabled={!selectedCommandPreset || commandPresetsLoading || commandPresetSaving}
                    onClick={activateCommandPreset}
                  >
                    <Check className="h-4 w-4" />
                    {t('commandPresetSetDefault')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!selectedCommandPreset || commandPresetsLoading || commandPresetSaving}
                    onClick={deleteCommandPreset}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('commandPresetDelete')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!normalizedDirectory}>
            <SquareTerminal className="h-4 w-4" />
            {t('addCommandConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectConfigDialog({ onCreate, onOpenChange, open, t }) {
  const [directory, setDirectory] = useState('');
  const [name, setName] = useState('');
  const normalizedDirectory = String(directory || '').trim();
  const normalizedName = String(name || '').trim();

  useEffect(() => {
    if (open) {
      setDirectory('');
      setName('');
    }
  }, [open]);

  const browseDirectory = useCallback(async () => {
    const selected = await bridge.chooseDirectory();
    if (selected) {
      setDirectory(selected);
    }
  }, []);

  const submit = useCallback(() => {
    if (!normalizedDirectory) {
      return;
    }

    onCreate({
      path: normalizedDirectory,
      name: normalizedName
    });
  }, [normalizedDirectory, normalizedName, onCreate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="projectConfigDialog" className="left-4 right-auto top-4 w-[min(560px,calc(100vw-32px))] p-0">
        <DialogHeader>
          <DialogTitle>{t('addProjectDialogTitle')}</DialogTitle>
          <DialogDescription>{t('addProjectDialogDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="projectDirectoryInput">{t('addProjectPath')}</Label>
            <div className="flex gap-2">
              <Input
                id="projectDirectoryInput"
                className="font-mono text-xs"
                spellCheck={false}
                value={directory}
                onChange={(event) => setDirectory(event.target.value)}
              />
              <Button type="button" variant="outline" onClick={browseDirectory}>
                <FolderOpen className="h-4 w-4" />
                {t('chooseDirectory')}
              </Button>
            </div>
            <div className={cn('text-xs text-muted-foreground', !normalizedDirectory && 'text-destructive')}>
              {normalizedDirectory || t('dialogPathRequired')}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="projectNameInput">{t('addProjectName')}</Label>
            <Input
              id="projectNameInput"
              value={name}
              placeholder={normalizedDirectory ? deriveNameFromPath(normalizedDirectory) : t('addProjectNamePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && normalizedDirectory) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!normalizedDirectory}>
            <FolderPlus className="h-4 w-4" />
            {t('addProjectConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleaseInfoCard({
  appVersion,
  changelog,
  changelogLoading = false,
  versionState,
  t,
  detail = false,
  onCheckLatestRelease,
  onOpenLatestRelease,
  onOpenRelease,
  onClose
}) {
  const changelogSections = Array.isArray(changelog?.sections)
    ? changelog.sections.filter((section) => (
      section?.title || (Array.isArray(section?.notes) && section.notes.length > 0)
    ))
    : [];
  const changelogError = String(changelog?.error || '').trim();
  const hasChangelog = Boolean(changelog?.found && changelogSections.length > 0);
  const sourceLabel = changelogLoading
    ? t('loading')
    : changelog?.source === 'local' ? t('changelogSourceLocal') : t('changelogSourceGithub');
  const versionStatusMessage = formatVersionStatusMessage(versionState || { status: 'idle', data: null }, appVersion, t);
  const versionStatus = versionState?.data;
  const versionStatusKind = getVersionStatusKind(versionState || { status: 'idle', data: null });
  const checkingVersion = versionState?.status === 'loading';
  const latestVersionLabel = formatVersionLabel(versionStatus?.latestVersion);
  const canOpenLatestRelease = Boolean(versionStatus?.found && versionStatus.latestUrl);

  return (
    <div className={cn('sidebar-release-card', detail && 'is-detail')}>
      <div className="sidebar-release-header">
        <div className="min-w-0">
          <div className="sidebar-release-kicker">{t('currentVersion')}</div>
          <div className="sidebar-release-version">{formatVersionLabel(appVersion)}</div>
        </div>
        <div className="sidebar-release-actions">
          <Badge
            variant={changelog?.source === 'local' ? 'outline' : 'success'}
            className="sidebar-release-badge"
          >
            {sourceLabel}
          </Badge>
          {onClose && (
            <button
              type="button"
              className="sidebar-release-close"
              aria-label={t('close')}
              title={t('close')}
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('versionCheckTitle')}</div>
        <div
          className={cn(
            'sidebar-release-empty',
            versionStatusKind === 'outdated' && 'is-warning',
            versionStatusKind === 'error' && 'is-error'
          )}
        >
          {versionStatusMessage}
        </div>
        {versionStatus?.found && (
          <div className="sidebar-release-date">
            {t('latestVersion')} {latestVersionLabel}
            {versionStatus.latestDate ? ` · ${versionStatus.latestDate}` : ''}
          </div>
        )}
        <button
          type="button"
          className="sidebar-release-link"
          disabled={checkingVersion}
          onClick={() => onCheckLatestRelease?.()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 shrink-0', checkingVersion && 'animate-spin')} />
          <span className="truncate">{checkingVersion ? t('checkingUpdates') : t('checkUpdates')}</span>
        </button>
        {canOpenLatestRelease && (
          <button
            type="button"
            className="sidebar-release-link"
            onClick={() => onOpenLatestRelease?.(versionStatus.latestUrl)}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('openLatestRelease')}</span>
          </button>
        )}
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('changelogTitle')}</div>
        {changelog?.date && (
          <div className="sidebar-release-date">{changelog.date}</div>
        )}
        {changelog?.url && (
          <button
            type="button"
            className="sidebar-release-link"
            onClick={() => onOpenRelease?.(changelog.url)}
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{t('openRelease')}</span>
          </button>
        )}
        {changelogLoading ? (
          <div className="sidebar-release-empty">{t('changelogLoading')}</div>
        ) : hasChangelog ? (
          <div className="sidebar-release-changelog">
            {changelogSections.map((section, sectionIndex) => (
              <div
                key={`${section.title || 'notes'}-${sectionIndex}`}
                className="sidebar-release-section"
              >
                {section.title && (
                  <div className="sidebar-release-section-title">{section.title}</div>
                )}
                {Array.isArray(section.notes) && section.notes.length > 0 && (
                  <ul className="sidebar-release-notes">
                    {section.notes.map((note, noteIndex) => (
                      <li key={`${note}-${noteIndex}`} className="sidebar-release-note">
                        {note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={cn('sidebar-release-empty', changelogError && 'is-error')}>
            {changelogError
              ? t('changelogReadFailed', { message: changelogError })
              : t('changelogMissing')}
          </div>
        )}
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('localData')}</div>
        <div className="sidebar-release-empty">{t('localDataSummary')}</div>
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('appNetwork')}</div>
        <div className="sidebar-release-empty">{t('appNetworkSummary')}</div>
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('cliNetworkNotice')}</div>
        <div className="sidebar-release-empty">{t('cliNetworkNoticeSummary')}</div>
      </div>
    </div>
  );
}

function ReleaseInfo({
  appVersion,
  t,
  compact = false
}) {
  const [open, setOpen] = useState(false);
  const [changelogState, setChangelogState] = useState({ status: 'idle', data: null });
  const [versionState, setVersionState] = useState({ status: 'idle', data: null });
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const changelogRequestIdRef = useRef(0);
  const versionStatusRequestIdRef = useRef(0);
  const versionLabel = formatVersionLabel(appVersion);
  const versionStatusKind = getVersionStatusKind(versionState);
  const versionTip = getVersionStatusTip(versionState, versionLabel, t);

  const loadVersionStatus = useCallback(async (options = {}) => {
    const version = normalizeVersionText(appVersion);
    const requestId = versionStatusRequestIdRef.current + 1;
    versionStatusRequestIdRef.current = requestId;

    if (!version || typeof bridge.getLatestReleaseStatus !== 'function') {
      setVersionState({ status: 'idle', data: null });
      return;
    }

    setVersionState((current) => ({
      status: 'loading',
      data: current.data
    }));

    try {
      const data = await bridge.getLatestReleaseStatus(version, {
        force: options.force === true
      });
      if (versionStatusRequestIdRef.current === requestId) {
        setVersionState({
          status: 'ready',
          data: normalizeVersionStatus(data, version)
        });
      }
    } catch (error) {
      if (versionStatusRequestIdRef.current === requestId) {
        setVersionState({
          status: 'error',
          data: normalizeVersionStatus({
            currentVersion: version,
            error: error?.message || String(error),
            latestUrl: releasePageUrl
          }, version)
        });
      }
    }
  }, [appVersion]);

  const loadChangelog = useCallback(async () => {
    const version = normalizeVersionText(appVersion);
    const requestId = changelogRequestIdRef.current + 1;
    changelogRequestIdRef.current = requestId;

    if (!version) {
      setChangelogState({
        status: 'ready',
        data: {
          found: false,
          notes: [],
          sections: [],
          source: 'github',
          url: releasePageUrl,
          version: ''
        }
      });
      return;
    }

    setChangelogState((current) => ({
      status: 'loading',
      data: current.data
    }));

    try {
      const data = await bridge.getReleaseChangelog(version);
      if (changelogRequestIdRef.current === requestId) {
        setChangelogState({
          status: 'ready',
          data: {
            found: Boolean(data?.found),
            notes: Array.isArray(data?.notes) ? data.notes : [],
            sections: Array.isArray(data?.sections) ? data.sections : [],
            source: data?.source || 'github',
            url: data?.url || releasePageUrl,
            version: data?.version || version,
            date: data?.date || '',
            error: data?.error || '',
            fallbackReason: data?.fallbackReason || '',
            tagName: data?.tagName || '',
            title: data?.title || ''
          }
        });
      }
    } catch (error) {
      if (changelogRequestIdRef.current === requestId) {
        setChangelogState({
          status: 'error',
          data: {
            error: error?.message || String(error),
            found: false,
            notes: [],
            sections: [],
            source: 'github',
            url: releasePageUrl,
            version
          }
        });
      }
    }
  }, [appVersion]);

  useEffect(() => {
    changelogRequestIdRef.current += 1;
    setChangelogState({ status: 'idle', data: null });
  }, [appVersion]);

  useEffect(() => {
    loadVersionStatus();
    return () => {
      versionStatusRequestIdRef.current += 1;
    };
  }, [loadVersionStatus]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadVersionStatus({ force: true });
  }, [loadVersionStatus, open]);

  useEffect(() => {
    if (open && changelogState.status === 'idle') {
      loadChangelog();
    }
  }, [changelogState.status, loadChangelog, open]);

  const openReleaseUrl = useCallback((url) => {
    const targetUrl = String(url || releasePageUrl).trim() || releasePageUrl;
    bridge.openExternalUrl(targetUrl).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        panelRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={cn('sidebar-version-button', compact && 'compact')}
            title={versionTip}
            aria-label={`${t('currentVersion')} ${versionLabel}. ${versionTip}`}
            aria-controls={open ? 'releaseInfoPanel' : undefined}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <Badge
              variant="outline"
              className={cn(
                'sidebar-version-badge',
                `is-${versionStatusKind}`,
                compact && 'compact'
              )}
            >
              {versionLabel}
            </Badge>
            <span
              className={cn('sidebar-version-status-dot', `is-${versionStatusKind}`)}
              aria-hidden="true"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side={compact ? 'right' : 'top'} className="max-w-[260px] whitespace-normal leading-5">
          {versionTip}
        </TooltipContent>
      </Tooltip>

      {open && (
        <div
          ref={panelRef}
          id="releaseInfoPanel"
          className="sidebar-release-popover"
          role="dialog"
          aria-label={`${t('currentVersion')} ${versionLabel}`}
        >
          <ReleaseInfoCard
            appVersion={appVersion}
            changelog={changelogState.data}
            changelogLoading={changelogState.status === 'loading'}
            versionState={versionState}
            t={t}
            detail
            onCheckLatestRelease={() => loadVersionStatus({ force: true })}
            onOpenLatestRelease={openReleaseUrl}
            onOpenRelease={openReleaseUrl}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}

function WorkspaceSkillsSection({
  collapsed,
  onOpenPath,
  onRefresh,
  onToggleCollapsed,
  rootPath,
  skillsState,
  t
}) {
  const scopes = Array.isArray(skillsState?.snapshot?.scopes) ? skillsState.snapshot.scopes : [];
  const visibleScopes = scopes.filter((scope) => scope.exists || scope.fileCount > 0 || scope.error);
  const loading = skillsState?.status === 'loading';
  const loadError = skillsState?.status === 'error' ? skillsState.error : '';
  const totalFiles = Number.isFinite(skillsState?.snapshot?.totalFiles)
    ? skillsState.snapshot.totalFiles
    : visibleScopes.reduce((sum, scope) => sum + (Number.isFinite(scope.fileCount) ? scope.fileCount : 0), 0);

  return (
    <SidebarSection>
      <div className="sidebar-section-title">
        <button
          type="button"
          className="sidebar-section-toggle"
          title={collapsed ? t('expandSkills') : t('collapseSkills')}
          aria-expanded={!collapsed}
          aria-controls="sidebarSkillsContent"
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">{t('skills')}</span>
          {totalFiles > 0 && (
            <Badge variant="outline" className="sidebar-skill-count">
              {totalFiles}
            </Badge>
          )}
        </button>
        <div className="flex items-center gap-1">
          <IconButton
            label={t('reload')}
            variant="ghost"
            disabled={!rootPath || loading}
            onClick={onRefresh}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </IconButton>
          <IconButton
            label={t('openFolder')}
            variant="ghost"
            disabled={!rootPath}
            onClick={() => onOpenPath(rootPath)}
          >
            <FolderOpen className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {!collapsed && (
        <div id="sidebarSkillsContent" className="grid gap-2">
          <div className="sidebar-skills-root" title={rootPath || undefined}>
            {rootPath || t('skillsHint')}
          </div>

          {loading && (
            <div className="sidebar-empty">
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                {t('skillsLoading')}
              </span>
            </div>
          )}

          {!loading && loadError && (
            <div className="sidebar-release-empty is-error">
              {t('skillsLoadFailed', { message: loadError })}
            </div>
          )}

          {!loading && !loadError && visibleScopes.length === 0 && (
            <div className="sidebar-empty">{t('skillsEmpty')}</div>
          )}

          {!loading && !loadError && visibleScopes.length > 0 && (
            <div className="grid gap-2">
              {visibleScopes.map((scope) => {
                const previewFiles = scope.files.slice(0, workspaceSkillPreviewCount);
                const remainingCount = Math.max(0, scope.fileCount - previewFiles.length);

                return (
                  <div key={scope.id} className="sidebar-skill-group">
                    <div className="sidebar-skill-header">
                      <div className="sidebar-skill-title">
                        <div className="sidebar-skill-label-group">
                          <div className="sidebar-skill-label">{scope.label}</div>
                          <div className="sidebar-skill-folder">{scope.directoryName}</div>
                        </div>
                        <Badge variant="outline" className="sidebar-skill-count">
                          {scope.fileCount}
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px]"
                        onClick={() => onOpenPath(scope.path)}
                      >
                        {t('openFolder')}
                      </Button>
                    </div>

                    {scope.error ? (
                      <div className="sidebar-release-empty is-error">{scope.error}</div>
                    ) : previewFiles.length > 0 ? (
                      <div className="sidebar-skill-files">
                        {previewFiles.map((file) => (
                          <button
                            key={`${scope.id}:${file.relativePath || file.path}`}
                            type="button"
                            className="sidebar-skill-file"
                            title={`${file.relativePath || file.name}\n${file.path}`}
                            onClick={() => onOpenPath(file.path)}
                          >
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="grid min-w-0 gap-0.5">
                              <span className="truncate text-[12px] font-medium">
                                {file.name || file.relativePath}
                              </span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {file.relativePath || file.path}
                              </span>
                            </span>
                          </button>
                        ))}

                        {remainingCount > 0 && (
                          <div className="sidebar-skill-more">
                            {t('skillsMoreFiles', { count: remainingCount })}
                          </div>
                        )}

                        {scope.truncated && (
                          <div className="sidebar-skill-more">{t('skillsTruncated')}</div>
                        )}
                      </div>
                    ) : (
                      <div className="sidebar-skill-empty">{t('skillsScopeEmpty')}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </SidebarSection>
  );
}

function WorkspaceSidebar({
  appVersion,
  activeProject,
  activeSessionId,
  commandTargetId,
  language,
  projectCompletedSessionCounts = new Map(),
  onAddProject,
  onFocusSession,
  onAddSession,
  onDeleteProject,
  onKillAll,
  onOpenCodexConfig,
  onOpenPath,
  onOpenPromptManager,
  onRefreshSkills,
  onReorderProjects,
  onSelectNoProject,
  onSelectProject,
  onThemeChange,
  onToggleProjectPinned,
  onToggleCollapsed,
  onToggleImageGeneration,
  onTogglePromptMenuCollapsed,
  onToggleSkillsCollapsed,
  promptManagerOpen,
  quickPromptCount,
  quickPromptsLoading,
  runtimeNow,
  sessions,
  skillsRootPath,
  skillsState,
  t,
  workspace,
  theme,
  imageGenerationOpen
}) {
  const collapsed = workspace.sidebarCollapsed;
  const promptMenuCollapsed = Boolean(workspace.promptMenuCollapsed);
  const userProjects = workspace.projects;
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [dragTarget, setDragTarget] = useState(null);

  const clearProjectDrag = useCallback(() => {
    setDraggedProjectId(null);
    setDragTarget(null);
  }, []);

  const getProjectDropPosition = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
  }, []);

  const handleProjectDragStart = useCallback((event, projectId) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', projectId);
    setDraggedProjectId(projectId);
    setDragTarget(null);
  }, []);

  const handleProjectDragOver = useCallback((event, projectId) => {
    const draggingId = draggedProjectId || event.dataTransfer.getData('text/plain');
    if (!draggingId || draggingId === projectId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const position = getProjectDropPosition(event);
    setDragTarget((current) => (
      current?.projectId === projectId && current.position === position
        ? current
        : { projectId, position }
    ));
  }, [draggedProjectId, getProjectDropPosition]);

  const handleProjectDrop = useCallback((event, projectId) => {
    const draggingId = draggedProjectId || event.dataTransfer.getData('text/plain');
    if (!draggingId || draggingId === projectId) {
      clearProjectDrag();
      return;
    }

    event.preventDefault();
    onReorderProjects(draggingId, projectId, getProjectDropPosition(event));
    clearProjectDrag();
  }, [clearProjectDrag, draggedProjectId, getProjectDropPosition, onReorderProjects]);

  const handleProjectDragEnd = useCallback(() => {
    clearProjectDrag();
  }, [clearProjectDrag]);

  return (
    <Sidebar collapsed={collapsed}>
      <SidebarHeader className="workspace-sidebar-header">
        <div className="workspace-sidebar-brand">
          <img
            className={cn('brand-logo', collapsed && 'brand-logo-collapsed')}
            src={appLogoUrl}
            alt=""
            aria-hidden="true"
            draggable="false"
          />
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">CLI in One</div>
              <div className="truncate text-xs text-muted-foreground">{t('appSubtitle')}</div>
            </div>
          )}
        </div>
        <IconButton
          label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          className="sidebar-collapse-button"
          onClick={onToggleCollapsed}
        >
          <SidebarCollapseIcon collapsed={collapsed} />
        </IconButton>
      </SidebarHeader>

      {collapsed ? (
        <>
          <IconButton label={t('addSession')} onClick={onAddSession}>
            <MessageSquarePlus className="h-4 w-4" />
          </IconButton>
          <IconButton label={t('addProject')} onClick={onAddProject}>
            <FolderPlus className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={t('imageGeneration')}
            variant={imageGenerationOpen ? 'primary' : 'default'}
            onClick={onToggleImageGeneration}
        >
          <ImagePlus className="h-4 w-4" />
        </IconButton>
        <IconButton
          label={t('promptManagerTitle')}
          variant={promptManagerOpen ? 'primary' : 'default'}
          onClick={onOpenPromptManager}
        >
          <PencilLine className="h-4 w-4" />
        </IconButton>
        <div className="sidebar-rail-spacer" />
        <SidebarThemeControl compact theme={theme} onThemeChange={onThemeChange} t={t} />
        <IconButton label={t('settings')} onClick={onOpenCodexConfig}>
          <Settings2 className="h-4 w-4" />
          </IconButton>
          <ReleaseInfo
            appVersion={appVersion}
            t={t}
            compact
          />
        </>
      ) : (
        <>
      <div className="sidebar-actions">
        <Button className="w-full justify-start" variant="ghost" onClick={onAddSession}>
          <MessageSquarePlus className="h-4 w-4" />
          {t('addSession')}
        </Button>
        <Button className="w-full justify-start" variant="ghost" onClick={onAddProject}>
          <FolderPlus className="h-4 w-4" />
          {t('addProject')}
        </Button>
        <Button
          className="w-full justify-start"
          variant={imageGenerationOpen ? 'primary' : 'ghost'}
          onClick={onToggleImageGeneration}
        >
          <ImagePlus className="h-4 w-4" />
          {t('imageGeneration')}
        </Button>
      </div>

      <SidebarContent>
        <SidebarSection>
          <div className="sidebar-section-title">
            <span>{t('projects')}</span>
            <div className="flex items-center gap-1">
              <IconButton label={t('addProject')} onClick={onAddProject}>
                <FolderPlus className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          {userProjects.length === 0 && (
            <div className="sidebar-empty">{t('projectEmpty')}</div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              className={cn('sidebar-project', !activeProject && 'active')}
              onClick={onSelectNoProject}
            >
              <SquareTerminal className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t('noProject')}</span>
            </button>

            {userProjects.map((project) => {
              const completedCount = projectCompletedSessionCounts.get(project.id) || 0;
              const showCompletedBadge = completedCount > 0 && activeProject?.id !== project.id;
              const completedBadgeLabel = t('completedProjectSessionsBadge', { count: completedCount });

              return (
                <div key={project.id} className="sidebar-project-group">
                  <div
                    className={cn(
                      'sidebar-project-row',
                      draggedProjectId === project.id && 'is-dragging',
                      dragTarget?.projectId === project.id && dragTarget.position === 'before' && 'drag-over-before',
                      dragTarget?.projectId === project.id && dragTarget.position === 'after' && 'drag-over-after'
                    )}
                    title={project.path}
                    onDragOver={(event) => handleProjectDragOver(event, project.id)}
                    onDrop={(event) => handleProjectDrop(event, project.id)}
                  >
                    <button
                      type="button"
                      className="sidebar-project-drag"
                      aria-label={t('dragProject')}
                      title={t('dragProject')}
                      disabled={userProjects.length < 2}
                      draggable={userProjects.length > 1}
                      onDragStart={(event) => handleProjectDragStart(event, project.id)}
                      onDragEnd={handleProjectDragEnd}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={cn('sidebar-project', activeProject?.id === project.id && 'active')}
                      onClick={() => onSelectProject(project.id)}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                      <span
                        className="t-badge project-completed-badge"
                        data-open={showCompletedBadge ? 'true' : 'false'}
                        title={completedBadgeLabel}
                        aria-hidden="true"
                      >
                        <span className="t-badge-dot project-completed-badge-dot">
                          {completedCount > 9 ? '9+' : completedCount}
                        </span>
                      </span>
                    </button>
                    <IconButton
                      label={project.pinned ? t('unpinProject') : t('pinProject')}
                      variant="ghost"
                      className={cn(
                        'sidebar-project-pin h-8 w-8 text-muted-foreground hover:text-foreground',
                        project.pinned && 'is-pinned text-primary'
                      )}
                      onClick={() => onToggleProjectPinned(project.id)}
                    >
                      <Pin className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label={t('deleteProject')}
                      variant="ghost"
                      className="sidebar-project-delete h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteProject(project.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>
        </SidebarSection>

        <SidebarSection>
          <div className="sidebar-section-title">
            <span>{t('sessionList')}</span>
          </div>

          {sessions.length === 0 && (
            <div className="sidebar-empty">{t('sessionListEmpty')}</div>
          )}

          <div className="sidebar-session-list">
            {sessions.map((panel) => {
              const provider = getPanelCliProvider(panel);
              const state = getPanelExecutionState(panel, runtimeNow);
              const title = panel.title || getPanelFallbackTitle(panel, language);
              return (
                <button
                  key={panel.id}
                  type="button"
                  className={cn(
                    'sidebar-session',
                    activeSessionId === panel.id && 'active',
                    commandTargetId === panel.id && 'is-command-target'
                  )}
                  title={panel.cwd || title}
                  onClick={() => onFocusSession(panel.id)}
                >
                  <div className="sidebar-session-title">
                    <span className={cn('terminal-endpoint-dot', `is-${state}`)} aria-hidden="true" />
                    <span className="truncate font-medium">{title}</span>
                  </div>
                  <div className="sidebar-session-badges">
                    <CliProviderBadge language={language} provider={provider} variant="outline" />
                    <SessionStatusTag state={state} t={t} />
                    {commandTargetId === panel.id && (
                      <Badge variant="secondary">{t('floatingComposerCurrent')}</Badge>
                    )}
                  </div>
                  <div className="sidebar-session-path" title={panel.cwd || t('defaultDirectory')}>
                    {panel.cwd || t('defaultDirectory')}
                  </div>
                </button>
              );
            })}
          </div>
        </SidebarSection>

        <SidebarSection>
          <div className="sidebar-section-title">
            <button
              type="button"
              className="sidebar-section-toggle"
              title={t('promptMenu')}
              aria-expanded={!promptMenuCollapsed}
              aria-controls="sidebarPromptContent"
              onClick={onTogglePromptMenuCollapsed}
            >
              {promptMenuCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 truncate">{t('promptMenu')}</span>
              {quickPromptsLoading ? (
                <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : quickPromptCount > 0 ? (
                <Badge variant="outline" className="sidebar-section-count">
                  {quickPromptCount}
                </Badge>
              ) : null}
            </button>
          </div>

          {!promptMenuCollapsed && (
            <div id="sidebarPromptContent" className="grid gap-2">
              <Button
                type="button"
                className="w-full justify-start"
                variant={promptManagerOpen ? 'primary' : 'ghost'}
                onClick={onOpenPromptManager}
              >
                <PencilLine className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-left">{t('promptManagerTitle')}</span>
              </Button>
            </div>
          )}
        </SidebarSection>

        <WorkspaceSkillsSection
          collapsed={Boolean(workspace.skillsCollapsed)}
          onOpenPath={onOpenPath}
          onRefresh={onRefreshSkills}
          onToggleCollapsed={onToggleSkillsCollapsed}
          rootPath={skillsRootPath}
          skillsState={skillsState}
          t={t}
        />
      </SidebarContent>

      <SidebarFooter>
        <div className="sidebar-footer-version">
          <ReleaseInfo
            appVersion={appVersion}
            t={t}
          />
        </div>
        <div className="sidebar-footer-actions">
          <IconButton
            label={t('settings')}
            variant="outline"
            className="sidebar-footer-action"
            onClick={onOpenCodexConfig}
          >
            <Settings2 className="h-4 w-4" />
          </IconButton>
          <SidebarThemeControl
            compact
            className="sidebar-footer-action"
            theme={theme}
            onThemeChange={onThemeChange}
            t={t}
          />
          <IconButton
            label={t('closeAll')}
            variant="destructive"
            className="sidebar-footer-action"
            onClick={onKillAll}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </SidebarFooter>
        </>
      )}
    </Sidebar>
  );
}

export default function App() {
  const initialSettings = useMemo(loadSettings, []);
  const initialWorkspace = useMemo(loadWorkspace, []);
  const initialAgents = useMemo(loadAgents, []);
  const initialAutopilots = useMemo(loadAutopilots, []);
  const initialView = useMemo(() => normalizeCanvasView(initialSettings.view), [initialSettings.view]);
  const [cwd, setCwd] = useState(initialSettings.cwd);
  const [theme, setTheme] = useState(initialSettings.theme);
  const [language, setLanguage] = useState(initialSettings.language);
  const [appZoomFactor, setAppZoomFactor] = useState(initialSettings.appZoomFactor);
  const [sessionHeaderVisibility, setSessionHeaderVisibility] = useState(initialSettings.sessionHeaderVisibility);
  const [view, setView] = useState(initialView);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [agents, setAgents] = useState(initialAgents);
  const [autopilots, setAutopilots] = useState(initialAutopilots);
  const [panels, setPanels] = useState([]);
  const [endpointGroups, setEndpointGroups] = useState([]);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [activeCanvasFrameId, setActiveCanvasFrameId] = useState(null);
  const [activeCanvasTodoId, setActiveCanvasTodoId] = useState(null);
  const [pendingCanvasFrame, setPendingCanvasFrame] = useState(false);
  const [connectionMode, setConnectionMode] = useState(false);
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState('');
  const [canvasConnectionPreview, setCanvasConnectionPreview] = useState(null);
  const [activeCanvasConnectionId, setActiveCanvasConnectionId] = useState(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState(null);
  const [launchCliProviderId, setLaunchCliProviderId] = useState(defaultCliProviderId);
  const [codexOpen, setCodexOpen] = useState(false);
  const [codexInitialTab, setCodexInitialTab] = useState('preferences');
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [gridSessionOpen, setGridSessionOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [autopilotOpen, setAutopilotOpen] = useState(false);
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(false);
  const [sessionReviewOpen, setSessionReviewOpen] = useState(false);
  const [diffReviewOpen, setDiffReviewOpen] = useState(false);
  const [diffReviewCwd, setDiffReviewCwd] = useState('');
  const [promptManagerOpen, setPromptManagerOpen] = useState(false);
  const [imageGenerationOpen, setImageGenerationOpen] = useState(false);
  const [imageGenerationPrompt, setImageGenerationPrompt] = useState('');
  const [imageGenerationResults, setImageGenerationResults] = useState([]);
  const [imageGenerationHistoryLoaded, setImageGenerationHistoryLoaded] = useState(false);
  const [imageGenerationSubmitting, setImageGenerationSubmitting] = useState(false);
  const [imageGenerationConfig, setImageGenerationConfig] = useState(createEmptyImageApiConfig);
  const [imageGenerationConfigLoading, setImageGenerationConfigLoading] = useState(false);
  const [sessionReviewRecords, setSessionReviewRecords] = useState({});
  const [workspaceTreeState, setWorkspaceTreeState] = useState({
    status: 'idle',
    snapshot: null,
    error: '',
    requestedPath: ''
  });
  const [workspaceTreeSelectedNode, setWorkspaceTreeSelectedNode] = useState(null);
  const [workspaceSkillsState, setWorkspaceSkillsState] = useState({
    status: 'idle',
    snapshot: createEmptyWorkspaceSkillsSnapshot(''),
    error: '',
    requestedPath: ''
  });
  const [defaultCwd, setDefaultCwd] = useState('');
  const [historyProject, setHistoryProject] = useState(null);
  const [panelStateRevision, setPanelStateRevision] = useState(0);
  const [appInfo, setAppInfo] = useState({ appVersion: '' });
  const [panning, setPanning] = useState(false);
  const [toast, setToast] = useState('');
  const [commandDockValue, setCommandDockValue] = useState('');
  const [commandDockContextItems, setCommandDockContextItems] = useState([]);
  const [commandDockContextLoading, setCommandDockContextLoading] = useState(false);
  const [commandDockTargetId, setCommandDockTargetId] = useState('');
  const [commandDockCollapsed, setCommandDockCollapsed] = useState(false);
  const [commandDockPosition, setCommandDockPosition] = useState(initialSettings.commandDockPosition);
  const [commandDockHistory, setCommandDockHistory] = useState(initialSettings.commandDockHistory);
  const [commandDockDispatchMode, setCommandDockDispatchMode] = useState(initialSettings.commandDockDispatchMode);
  const [commandDockShortcuts, setCommandDockShortcuts] = useState(initialSettings.commandDockShortcuts);
  const [commandDockTaskDispatching, setCommandDockTaskDispatching] = useState(false);
  const [commandDockDispatchSparkles, setCommandDockDispatchSparkles] = useState({});
  const [canvasStatusRefreshAt, setCanvasStatusRefreshAt] = useState(() => Date.now());
  const [canvasArrangeAnimations, setCanvasArrangeAnimations] = useState({});
  const [canvasArrangeActive, setCanvasArrangeActive] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState([]);
  const [quickPromptsPath, setQuickPromptsPath] = useState('');
  const [quickPromptsLoading, setQuickPromptsLoading] = useState(false);
  const [commandPresets, setCommandPresets] = useState([]);
  const [activeCommandPresetId, setActiveCommandPresetId] = useState('');
  const [commandPresetsPath, setCommandPresetsPath] = useState('');
  const [commandPresetsLoading, setCommandPresetsLoading] = useState(false);
  const [commandDockSkillMention, setCommandDockSkillMention] = useState(createClosedCommandDockSkillMention);
  const viewportRef = useRef(null);
  const commandDockInputRef = useRef(null);
  const commandDockComposingRef = useRef(false);
  const commandDockPendingActionRef = useRef('');
  const commandDockDispatchTasksRef = useRef(null);
  const commandDockDispatchSparkleTimersRef = useRef(new Map());
  const canvasArrangeTimerRef = useRef(null);
  const idleCommandCollectTimerRef = useRef(null);
  const panelActivityQueueRef = useRef(new Map());
  const panelActivityFlushTimer = useRef(null);
  const panelStateTimerRef = useRef(null);
  const sessionReviewRecordsRef = useRef({});
  const sessionReviewFlushTimer = useRef(null);
  const panelExecutionStatesRef = useRef(new Map());
  const terminalInstances = useRef(new Map());
  const terminalInputCommandBuffersRef = useRef(new Map());
  const canvasTodoOutputBuffersRef = useRef(new Map());
  const panelsRef = useRef([]);
  const endpointGroupsRef = useRef([]);
  const workspaceRef = useRef(workspace);
  const historyProjectRef = useRef(historyProject);
  const viewRef = useRef(view);
  const canvasScopeKeyRef = useRef(getWorkspaceCanvasKey(initialWorkspace));
  const activeIdRef = useRef(null);
  const activeCanvasFrameIdRef = useRef(null);
  const activeCanvasTodoIdRef = useRef(null);
  const activeCanvasConnectionIdRef = useRef(null);
  const connectionPortClickSuppressedRef = useRef(false);
  const cwdRef = useRef(cwd);
  const agentsRef = useRef(agents);
  const autopilotsRef = useRef(autopilots);
  const autopilotRunningIdsRef = useRef(new Set());
  const autopilotSchedulerStartedAtRef = useRef(Date.now());
  const activeCommandPresetRef = useRef(null);
  const workspaceTreeRequestIdRef = useRef(0);
  const workspaceSkillsRequestIdRef = useRef(0);
  const nextZIndex = useRef(10);
  const toastTimer = useRef(null);
  const saveSettingsTimer = useRef(null);
  const saveWorkspaceTimer = useRef(null);
  const persistCanvasViewTimer = useRef(null);
  const imageGenerationHistoryLoadStartedRef = useRef(false);
  const imageGenerationHistorySkipNextSaveRef = useRef(false);
  const imageGenerationHistorySaveTimer = useRef(null);
  const imageGenerationHistorySaveErrorShownRef = useRef(false);
  const runtimeNow = Date.now();
  const quickPromptsLoadStartedRef = useRef(false);

  const projectsWithHistory = useMemo(() => {
    if (!historyProject) {
      return workspace.projects;
    }

    return [
      historyProject,
      ...workspace.projects.filter((project) => project.path !== historyProject.path)
    ];
  }, [historyProject, workspace.projects]);
  const activeProject = useMemo(
    () => projectsWithHistory.find((project) => project.id === workspace.activeProjectId) || null,
    [projectsWithHistory, workspace.activeProjectId]
  );
  const currentWorkspacePath = useMemo(
    () => String(cwd || activeProject?.path || '').trim(),
    [activeProject?.path, cwd]
  );
  const sessionLaunchPath = useMemo(
    () => {
      const normalizedCwd = String(cwd || '').trim();
      const projectPath = String(activeProject?.path || '').trim();
      if (projectPath && isPathWithinRoot(normalizedCwd, projectPath)) {
        return normalizedCwd;
      }

      return String(projectPath || normalizedCwd || defaultCwd || '').trim();
    },
    [activeProject?.path, cwd, defaultCwd]
  );
  const skillsRootPath = currentWorkspacePath;
  const shouldPromoteWorkspacePath = useCallback((nextPath, projectId = null) => {
    const normalizedPath = String(nextPath || '').trim();
    if (!normalizedPath) {
      return false;
    }

    if (projectId) {
      return true;
    }

    const normalizedDefaultPath = String(defaultCwd || '').trim();
    if (!normalizedDefaultPath) {
      return true;
    }

    return normalizedPath.toLowerCase() !== normalizedDefaultPath.toLowerCase();
  }, [defaultCwd]);
  const t = useCallback((key, values) => translate(language, key, values), [language]);
  const canvasLaunchProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const activeCommandPreset = useMemo(() => (
    commandPresets.find((preset) => preset.id === activeCommandPresetId) || null
  ), [activeCommandPresetId, commandPresets]);
  const commandDockShortcutLabels = useMemo(() => {
    const normalizedShortcuts = normalizeCommandDockShortcutSettings(commandDockShortcuts);
    return {
      send: getCommandDockShortcutLabel(normalizedShortcuts.sendShortcut),
      dispatch: getCommandDockShortcutLabel(normalizedShortcuts.dispatchShortcut)
    };
  }, [commandDockShortcuts]);
  const closeCanvasContextMenu = useCallback(() => {
    setCanvasContextMenu(null);
  }, []);
  const flashCommandDockDispatchTargets = useCallback((targets) => {
    const ids = [...new Set((Array.isArray(targets) ? targets : [targets])
      .map((target) => String(target?.id || target || '').trim())
      .filter(Boolean))];

    if (ids.length === 0) {
      return;
    }

    const stamp = Date.now().toString(36);
    const timers = commandDockDispatchSparkleTimersRef.current;
    setCommandDockDispatchSparkles((current) => {
      const next = { ...current };
      ids.forEach((id, index) => {
        next[id] = `${stamp}-${index}-${id}`;
      });
      return next;
    });

    ids.forEach((id) => {
      const currentTimer = timers.get(id);
      if (currentTimer) {
        window.clearTimeout(currentTimer);
      }

      const timer = window.setTimeout(() => {
        timers.delete(id);
        setCommandDockDispatchSparkles((current) => {
          if (!current[id]) {
            return current;
          }

          const next = { ...current };
          delete next[id];
          return next;
        });
      }, commandDockDispatchSparkleMs);
      timers.set(id, timer);
    });
  }, []);
  const visiblePanels = useMemo(
    () => panels.filter((panel) => isPanelVisibleInWorkspace(panel, workspace)),
    [panels, workspace.activeProjectId, workspace.canvasMode]
  );
  const availableSessionTags = useMemo(
    () => getAvailableSessionTags(panels),
    [panels]
  );
  const crossProjectSessionCounts = useMemo(
    () => getSessionReviewStatusCounts(panels, runtimeNow, getPanelExecutionState),
    [panelStateRevision, panels]
  );
  const projectCompletedSessionCounts = useMemo(() => {
    const counts = new Map();

    panels.forEach((panel) => {
      const projectId = String(panel?.projectId || '').trim();
      if (!projectId || getPanelExecutionState(panel, runtimeNow) !== 'completed') {
        return;
      }

      counts.set(projectId, (counts.get(projectId) || 0) + 1);
    });

    return counts;
  }, [panels]);
  const visibleCanvasFrames = useMemo(
    () => getWorkspaceCanvasFrames(workspace),
    [workspace]
  );
  const visibleCanvasTodos = useMemo(
    () => getWorkspaceCanvasTodos(workspace),
    [workspace]
  );
  const visibleCanvasConnections = useMemo(
    () => getWorkspaceCanvasConnections(workspace),
    [workspace]
  );
  const visiblePinnedCanvasTodos = useMemo(
    () => visibleCanvasTodos.filter((todo) => todo.pinned),
    [visibleCanvasTodos]
  );
  const visibleUnpinnedCanvasTodos = useMemo(
    () => visibleCanvasTodos.filter((todo) => !todo.pinned),
    [visibleCanvasTodos]
  );
  const visiblePanelIds = useMemo(
    () => new Set(visiblePanels.map((panel) => panel.id)),
    [visiblePanels]
  );
  const visibleEndpointGroups = useMemo(() => {
    const canvasKey = getWorkspaceCanvasKey(workspace);
    return endpointGroups
      .filter((group) => group.canvasKey === canvasKey)
      .map((group) => ({
        group,
        panels: panels.filter((panel) => (
          panel.groupId === group.id &&
          panel.minimized &&
          isPanelVisibleInWorkspace(panel, workspace)
        ))
      }))
      .filter((record) => record.panels.length > 0);
  }, [endpointGroups, panels, workspace]);
  const groupedVisiblePanelIds = useMemo(
    () => new Set(visibleEndpointGroups.flatMap((record) => record.panels.map((panel) => panel.id))),
    [visibleEndpointGroups]
  );
  const visibleConnectionRecords = useMemo(() => {
    const visiblePanelMap = new Map(visiblePanels.map((panel) => [panel.id, panel]));
    return visibleCanvasConnections
      .map((connection) => {
        const fromPanel = visiblePanelMap.get(connection.fromId);
        const toPanel = visiblePanelMap.get(connection.toId);
        if (!fromPanel || !toPanel) {
          return null;
        }

        const fromRect = getPanelCanvasRect(fromPanel, panels, endpointGroups, workspace);
        const toRect = getPanelCanvasRect(toPanel, panels, endpointGroups, workspace);
        if (!fromRect || !toRect) {
          return null;
        }

        return {
          connection,
          ...buildCanvasConnectionPath(fromRect, toRect),
          tone: getCanvasConnectionTone(connection)
        };
      })
      .filter(Boolean);
  }, [endpointGroups, panels, visibleCanvasConnections, visiblePanels, workspace]);
  const previewConnectionRecord = useMemo(() => {
    if (!canvasConnectionPreview?.sourceId || !canvasConnectionPreview?.point) {
      return null;
    }

    const sourcePanel = visiblePanels.find((panel) => panel.id === canvasConnectionPreview.sourceId);
    if (!sourcePanel) {
      return null;
    }

    const sourceRect = getPanelCanvasRect(sourcePanel, panels, endpointGroups, workspace);
    if (!sourceRect) {
      return null;
    }

    return {
      connection: { id: `preview-${canvasConnectionPreview.sourceId}` },
      ...buildCanvasConnectionPath(sourceRect, {
        x: canvasConnectionPreview.point.x,
        y: canvasConnectionPreview.point.y,
        width: 0,
        height: 0
      }),
      tone: getCanvasConnectionTone({ id: `preview-${canvasConnectionPreview.sourceId}` })
    };
  }, [canvasConnectionPreview, endpointGroups, panels, visiblePanels, workspace]);
  const groupableEndpointCount = useMemo(() => {
    const visibleEndpoints = visiblePanels.filter((panel) => panel.minimized);
    const selectedVisibleCount = visibleEndpoints.filter((panel) => selectedEndpointIds.has(panel.id)).length;
    return selectedVisibleCount || visibleEndpoints.length;
  }, [selectedEndpointIds, visiblePanels]);
  const idleCommandLineCount = useMemo(() => (
    visiblePanels.filter((panel) => (
      getPanelExecutionState(panel, runtimeNow) === 'idle'
    )).length
  ), [panelStateRevision, visiblePanels]);
  const commandDockPanels = useMemo(() => {
    const stateRank = {
      running: 0,
      idle: 1,
      completed: 2,
      error: 3
    };

    return [...visiblePanels].sort((left, right) => {
      const leftState = getPanelExecutionState(left, runtimeNow);
      const rightState = getPanelExecutionState(right, runtimeNow);
      if (stateRank[leftState] !== stateRank[rightState]) {
        return stateRank[leftState] - stateRank[rightState];
      }
      if ((left.id === activeId) !== (right.id === activeId)) {
        return left.id === activeId ? -1 : 1;
      }
      if (left.minimized !== right.minimized) {
        return left.minimized ? 1 : -1;
      }
      if ((left.createdAt || 0) !== (right.createdAt || 0)) {
        return (left.createdAt || 0) - (right.createdAt || 0);
      }
      return left.title.localeCompare(right.title, language === 'en' ? 'en-US' : 'zh-CN');
    });
  }, [activeId, language, panelStateRevision, visiblePanels]);
  const liveCommandDockPanels = useMemo(
    () => commandDockPanels.filter((panel) => canPanelReceiveInput(panel)),
    [commandDockPanels]
  );
  const commandDockVisible = visiblePanels.length > 0 && !imageGenerationOpen;
  const commandDockSkillMentionSourceItems = useMemo(
    () => getWorkspaceSkillMentionItems(workspaceSkillsState.snapshot),
    [workspaceSkillsState.snapshot]
  );
  const commandDockSkillMentionItems = useMemo(
    () => filterWorkspaceSkillMentionItems(
      commandDockSkillMentionSourceItems,
      commandDockSkillMention.query
    ),
    [commandDockSkillMention.query, commandDockSkillMentionSourceItems]
  );
  const commandDockSkillMentionLoading = workspaceSkillsState.status === 'loading';

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    autopilotsRef.current = autopilots;
  }, [autopilots]);

  useEffect(() => {
    if (panels.length === 0) {
      panelExecutionStatesRef.current = new Map();
      window.clearTimeout(panelStateTimerRef.current);
      panelStateTimerRef.current = null;
      return undefined;
    }

    window.clearTimeout(panelStateTimerRef.current);
    panelStateTimerRef.current = null;

    const now = Date.now();
    let nextTransitionDelay = Number.POSITIVE_INFINITY;

    panels.forEach((panel) => {
      if (!isPanelLive(panel)) {
        return;
      }

      const delay = getPanelLastActivityAt(panel) + panelIdleThresholdMs - now;
      if (delay > 0) {
        nextTransitionDelay = Math.min(nextTransitionDelay, delay);
      }
    });

    if (!Number.isFinite(nextTransitionDelay)) {
      return undefined;
    }

    panelStateTimerRef.current = window.setTimeout(() => {
      panelStateTimerRef.current = null;
      setPanelStateRevision((current) => current + 1);
    }, Math.max(80, Math.ceil(nextTransitionDelay) + 40));

    return () => {
      window.clearTimeout(panelStateTimerRef.current);
      panelStateTimerRef.current = null;
    };
  }, [panelStateRevision, panels]);

  useEffect(() => {
    endpointGroupsRef.current = endpointGroups;
  }, [endpointGroups]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    historyProjectRef.current = historyProject;
  }, [historyProject]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    activeCanvasFrameIdRef.current = activeCanvasFrameId;
  }, [activeCanvasFrameId]);

  useEffect(() => {
    activeCanvasTodoIdRef.current = activeCanvasTodoId;
  }, [activeCanvasTodoId]);

  useEffect(() => {
    activeCanvasConnectionIdRef.current = activeCanvasConnectionId;
  }, [activeCanvasConnectionId]);

  useEffect(() => {
    if (!connectionMode && canvasConnectionPreview) {
      setCanvasConnectionPreview(null);
    }
  }, [canvasConnectionPreview, connectionMode]);

  useEffect(() => {
    if (!pendingConnectionSourceId && canvasConnectionPreview) {
      setCanvasConnectionPreview(null);
    }
  }, [canvasConnectionPreview, pendingConnectionSourceId]);

  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  useEffect(() => {
    activeCommandPresetRef.current = activeCommandPreset;
  }, [activeCommandPreset]);

  useEffect(() => {
    if (
      historyProject &&
      workspace.activeProjectId === historyProjectId &&
      cwd !== historyProject.path &&
      (!cwd || cwd === defaultCwd)
    ) {
      setCwd(historyProject.path);
    }
  }, [cwd, defaultCwd, historyProject, workspace.activeProjectId]);

  useEffect(() => {
    if (activeId && !visiblePanelIds.has(activeId)) {
      setActiveId(null);
    }
  }, [activeId, visiblePanelIds]);

  useEffect(() => {
    if (activeCanvasFrameId && !visibleCanvasFrames.some((frame) => frame.id === activeCanvasFrameId)) {
      setActiveCanvasFrameId(null);
    }
  }, [activeCanvasFrameId, visibleCanvasFrames]);

  useEffect(() => {
    if (activeCanvasTodoId && !visibleCanvasTodos.some((todo) => todo.id === activeCanvasTodoId)) {
      setActiveCanvasTodoId(null);
    }
  }, [activeCanvasTodoId, visibleCanvasTodos]);

  useEffect(() => {
    if (activeCanvasConnectionId && !visibleConnectionRecords.some((record) => record.connection.id === activeCanvasConnectionId)) {
      setActiveCanvasConnectionId(null);
    }
  }, [activeCanvasConnectionId, visibleConnectionRecords]);

  useEffect(() => {
    setPendingCanvasFrame(false);
    setPendingConnectionSourceId('');
    setActiveCanvasConnectionId(null);
  }, [workspace.activeProjectId, workspace.canvasMode]);

  useEffect(() => {
    setWorkspaceTreeSelectedNode(null);
  }, [currentWorkspacePath]);

  useEffect(() => {
    if (workspaceTreeOpen) {
      return;
    }

    workspaceTreeRequestIdRef.current += 1;
    setWorkspaceTreeSelectedNode(null);
    setWorkspaceTreeState((current) => {
      if (current.status === 'idle' && !current.snapshot && !current.error && !current.requestedPath) {
        return current;
      }

      return {
        status: 'idle',
        snapshot: null,
        error: '',
        requestedPath: ''
      };
    });
  }, [workspaceTreeOpen]);

  useEffect(() => {
    const activeGroupIds = new Set(panels.filter((panel) => panel.groupId).map((panel) => panel.groupId));
    setEndpointGroups((current) => {
      const next = current.filter((group) => activeGroupIds.has(group.id));
      return next.length === current.length ? current : next;
    });
  }, [panels]);

  useEffect(() => {
    const validEndpointIds = new Set(visiblePanels.filter((panel) => panel.minimized).map((panel) => panel.id));
    setSelectedEndpointIds((current) => {
      const next = new Set([...current].filter((id) => validEndpointIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) {
        return current;
      }
      return next;
    });
  }, [visiblePanels]);

  useEffect(() => {
    setCommandDockTargetId((current) => {
      if (commandDockPanels.length === 0) {
        return '';
      }

      const currentPanel = commandDockPanels.find((panel) => panel.id === current);
      if (currentPanel) {
        return current;
      }

      const activePanel = commandDockPanels.find((panel) => panel.id === activeId);
      return activePanel?.id || liveCommandDockPanels[0]?.id || commandDockPanels[0]?.id || '';
    });
  }, [activeId, commandDockPanels, liveCommandDockPanels]);

  useEffect(() => {
    setCommandDockSkillMention((current) => {
      if (!current.open) {
        return current;
      }

      const selectedIndex = commandDockSkillMentionItems.length > 0
        ? clamp(current.selectedIndex, 0, commandDockSkillMentionItems.length - 1)
        : 0;

      return selectedIndex === current.selectedIndex
        ? current
        : { ...current, selectedIndex };
    });
  }, [commandDockSkillMentionItems.length]);

  useEffect(() => {
    if (commandDockVisible && !commandDockCollapsed) {
      return;
    }

    setCommandDockSkillMention((current) => (
      current.open ? createClosedCommandDockSkillMention() : current
    ));
  }, [commandDockCollapsed, commandDockVisible]);

  useEffect(() => {
    setCommandDockSkillMention((current) => (
      current.open ? createClosedCommandDockSkillMention() : current
    ));
  }, [skillsRootPath]);

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => {
    const previousStates = panelExecutionStatesRef.current;
    const nextStates = new Map();
    let idlePanel = null;

    panels.forEach((panel) => {
      const state = getPanelExecutionState(panel, runtimeNow);
      nextStates.set(panel.id, state);
      if (!idlePanel && isPanelLive(panel) && state === 'idle' && previousStates.get(panel.id) === 'running') {
        idlePanel = panel;
      }
    });

    panelExecutionStatesRef.current = nextStates;

    if (idlePanel) {
      showToast(t('sessionIdleToast', {
        name: idlePanel.title || getPanelFallbackTitle(idlePanel, language)
      }));
    }
  }, [language, panelStateRevision, panels, showToast, t]);

  useEffect(() => {
    if (!imageGenerationOpen || imageGenerationHistoryLoadStartedRef.current) {
      return undefined;
    }

    imageGenerationHistoryLoadStartedRef.current = true;
    if (typeof bridge.listImageGenerationHistory !== 'function') {
      setImageGenerationHistoryLoaded(true);
      return undefined;
    }

    bridge.listImageGenerationHistory().then((store) => {
      imageGenerationHistorySkipNextSaveRef.current = true;
      setImageGenerationResults(normalizeImageGenerationHistoryItems(store?.items));
      setImageGenerationHistoryLoaded(true);
    }).catch((error) => {
      imageGenerationHistorySkipNextSaveRef.current = true;
      setImageGenerationHistoryLoaded(true);
      showToast(t('imageGenerationHistoryLoadFailed', { message: error.message }));
    });
  }, [imageGenerationOpen, showToast, t]);

  useEffect(() => {
    if (!imageGenerationHistoryLoaded || typeof bridge.writeImageGenerationHistory !== 'function') {
      return undefined;
    }

    if (imageGenerationHistorySkipNextSaveRef.current) {
      imageGenerationHistorySkipNextSaveRef.current = false;
      return undefined;
    }

    const items = serializeImageGenerationHistoryItems(imageGenerationResults);
    window.clearTimeout(imageGenerationHistorySaveTimer.current);
    imageGenerationHistorySaveTimer.current = window.setTimeout(() => {
      bridge.writeImageGenerationHistory({ items }).then(() => {
        imageGenerationHistorySaveErrorShownRef.current = false;
      }).catch((error) => {
        if (!imageGenerationHistorySaveErrorShownRef.current) {
          showToast(t('imageGenerationHistorySaveFailed', { message: error.message }));
        }
        imageGenerationHistorySaveErrorShownRef.current = true;
      });
    }, 250);

    return () => {
      window.clearTimeout(imageGenerationHistorySaveTimer.current);
    };
  }, [imageGenerationHistoryLoaded, imageGenerationResults, showToast, t]);

  const loadImageGenerationConfig = useCallback(async () => {
    setImageGenerationConfigLoading(true);
    try {
      const snapshot = await bridge.readImageApiConfig();
      const normalized = normalizeImageApiConfig(snapshot);
      setImageGenerationConfig(normalized);
      return normalized;
    } catch (error) {
      setImageGenerationConfig(createEmptyImageApiConfig());
      showToast(t('imageApiConfigReadFailed', { message: error.message }));
      return null;
    } finally {
      setImageGenerationConfigLoading(false);
    }
  }, [showToast, t]);

  const applyQuickPromptStore = useCallback((store = {}) => {
    quickPromptsLoadStartedRef.current = true;
    setQuickPrompts(Array.isArray(store.prompts) ? store.prompts : []);
    setQuickPromptsPath(store.path || '');
    return store;
  }, []);

  const loadQuickPrompts = useCallback(async () => {
    quickPromptsLoadStartedRef.current = true;
    setQuickPromptsLoading(true);
    try {
      const store = await bridge.listQuickPrompts();
      return applyQuickPromptStore(store);
    } finally {
      setQuickPromptsLoading(false);
    }
  }, [applyQuickPromptStore]);

  const saveQuickPromptRecord = useCallback(async (payload = {}) => {
    quickPromptsLoadStartedRef.current = true;
    setQuickPromptsLoading(true);
    try {
      const store = await bridge.saveQuickPrompt(payload || {});
      return applyQuickPromptStore(store);
    } finally {
      setQuickPromptsLoading(false);
    }
  }, [applyQuickPromptStore]);

  const deleteQuickPromptRecord = useCallback(async (id) => {
    quickPromptsLoadStartedRef.current = true;
    setQuickPromptsLoading(true);
    try {
      const store = await bridge.deleteQuickPrompt(id);
      return applyQuickPromptStore(store);
    } finally {
      setQuickPromptsLoading(false);
    }
  }, [applyQuickPromptStore]);

  const applyCommandPresetStore = useCallback((store = {}) => {
    setCommandPresets(Array.isArray(store.presets) ? store.presets : []);
    setActiveCommandPresetId(store.activeId || '');
    setCommandPresetsPath(store.path || '');
    return store;
  }, []);

  const loadCommandPresets = useCallback(async () => {
    setCommandPresetsLoading(true);
    try {
      const store = await bridge.listCommandPresets();
      return applyCommandPresetStore(store);
    } finally {
      setCommandPresetsLoading(false);
    }
  }, [applyCommandPresetStore]);

  useEffect(() => {
    if (!commandDockVisible || quickPromptsLoadStartedRef.current) {
      return;
    }

    quickPromptsLoadStartedRef.current = true;
    loadQuickPrompts().catch((error) => {
      setQuickPrompts([]);
      setQuickPromptsPath('');
      showToast(t('quickPromptLoadFailed', { message: error.message }));
    });
  }, [commandDockVisible, loadQuickPrompts, showToast, t]);

  useEffect(() => {
    loadCommandPresets().catch((error) => {
      setCommandPresets([]);
      setActiveCommandPresetId('');
      setCommandPresetsPath('');
      showToast(t('commandPresetLoadFailed', { message: error.message }));
    });
  }, [loadCommandPresets, showToast, t]);

  useEffect(() => {
    if (!imageGenerationOpen) {
      return;
    }

    void loadImageGenerationConfig();
  }, [imageGenerationOpen, loadImageGenerationConfig]);

  const loadWorkspaceTree = useCallback(async (targetPath) => {
    const requestedPath = String(targetPath || '').trim();

    if (!requestedPath) {
      const message = t('workspaceTreeUnavailable');
      setWorkspaceTreeState({
        status: 'error',
        snapshot: null,
        error: message,
        requestedPath: ''
      });
      showToast(message);
      return null;
    }

    const requestId = workspaceTreeRequestIdRef.current + 1;
    workspaceTreeRequestIdRef.current = requestId;

    setWorkspaceTreeState((current) => ({
      status: 'loading',
      snapshot: current.snapshot?.cwd === requestedPath ? current.snapshot : null,
      error: '',
      requestedPath
    }));

    try {
      const snapshot = await bridge.readWorkspaceTree({ cwd: requestedPath, lazy: true });
      if (workspaceTreeRequestIdRef.current !== requestId) {
        return null;
      }

      setWorkspaceTreeState({
        status: 'ready',
        snapshot,
        error: '',
        requestedPath: snapshot.cwd
      });
      return snapshot;
    } catch (error) {
      if (workspaceTreeRequestIdRef.current !== requestId) {
        return null;
      }

      const message = error?.message || String(error);
      setWorkspaceTreeState({
        status: 'error',
        snapshot: null,
        error: message,
        requestedPath
      });
      showToast(t('workspaceTreeFailed', { message }));
      return null;
    }
  }, [showToast, t]);

  const loadWorkspaceTreeNodeChildren = useCallback(async (node) => {
    const targetPath = String(node?.path || '').trim();
    const targetNodeId = String(node?.id || targetPath).trim();

    if (!targetPath || !targetNodeId || node?.type !== 'directory' || node?.ignored || node?.link) {
      return null;
    }

    try {
      const snapshot = await bridge.readWorkspaceTree({ cwd: targetPath, lazy: true });
      const loadedRoot = rebaseWorkspaceTreeLoadedRoot(snapshot?.root || null, node?.relativePath || '');

      setWorkspaceTreeState((current) => {
        if (!current.snapshot?.root) {
          return current;
        }

        const nextRoot = mergeWorkspaceTreeNodeChildren(current.snapshot.root, targetNodeId, loadedRoot);
        if (nextRoot === current.snapshot.root) {
          return current;
        }

        return {
          ...current,
          status: 'ready',
          error: '',
          snapshot: withWorkspaceTreeCounts({
            ...current.snapshot,
            root: nextRoot
          })
        };
      });

      return snapshot;
    } catch (error) {
      const message = error?.message || String(error);
      showToast(t('workspaceTreeFailed', { message }));
      throw error;
    }
  }, [showToast, t]);

  const openWorkspaceTree = useCallback(() => {
    setWorkspaceTreeOpen(true);
    setSessionReviewOpen(false);
    setImageGenerationOpen(false);
    void loadWorkspaceTree(currentWorkspacePath);
  }, [currentWorkspacePath, loadWorkspaceTree]);

  const refreshWorkspaceTree = useCallback(() => {
    void loadWorkspaceTree(currentWorkspacePath);
  }, [currentWorkspacePath, loadWorkspaceTree]);

  useEffect(() => {
    if (!workspaceTreeOpen || !currentWorkspacePath) {
      return;
    }

    const loadedPath = String(workspaceTreeState.snapshot?.cwd || workspaceTreeState.requestedPath || '').trim();
    if (workspaceTreeState.status === 'idle' || loadedPath !== currentWorkspacePath) {
      void loadWorkspaceTree(currentWorkspacePath);
    }
  }, [
    currentWorkspacePath,
    loadWorkspaceTree,
    workspaceTreeOpen,
    workspaceTreeState.requestedPath,
    workspaceTreeState.snapshot?.cwd,
    workspaceTreeState.status
  ]);

  const copyWorkspaceTree = useCallback(async () => {
    const requestedPath = String(
      workspaceTreeState.snapshot?.cwd || workspaceTreeState.requestedPath || currentWorkspacePath || ''
    ).trim();
    if (!requestedPath || workspaceTreeState.status === 'loading') {
      return;
    }

    try {
      const snapshot = await bridge.readWorkspaceTree({
        cwd: requestedPath,
        includeRoot: false,
        includeText: true
      });
      if (!snapshot?.text) {
        return;
      }

      const copied = writeClipboardText(`${snapshot.cwd}\n\n${snapshot.text}`);
      if (copied) {
        showToast(t('workspaceTreeCopied'));
      }
    } catch (error) {
      const message = error?.message || String(error);
      showToast(t('workspaceTreeFailed', { message }));
    }
  }, [
    currentWorkspacePath,
    showToast,
    t,
    workspaceTreeState.requestedPath,
    workspaceTreeState.snapshot?.cwd,
    workspaceTreeState.status
  ]);

  const selectWorkspaceTreeNode = useCallback((node) => {
    const nextPath = getWorkspaceTreeInsertPath(node, normalizePromptFilePath);
    if (!nextPath) {
      setWorkspaceTreeSelectedNode(null);
      return;
    }

    setWorkspaceTreeSelectedNode({
      id: node.id,
      path: nextPath
    });
  }, []);

  const loadWorkspaceSkills = useCallback(async (targetPath, options = {}) => {
    const requestedPath = String(targetPath || '').trim();
    const quiet = Boolean(options.quiet);
    const deferred = Boolean(options.deferred);

    if (!requestedPath) {
      setWorkspaceSkillsState({
        status: 'idle',
        snapshot: createEmptyWorkspaceSkillsSnapshot(''),
        error: '',
        requestedPath: ''
      });
      return null;
    }

    const requestId = workspaceSkillsRequestIdRef.current + 1;
    workspaceSkillsRequestIdRef.current = requestId;

    setWorkspaceSkillsState((current) => ({
      status: 'loading',
      snapshot: current.requestedPath === requestedPath
        ? current.snapshot
        : createEmptyWorkspaceSkillsSnapshot(requestedPath),
      error: '',
      requestedPath
    }));

    try {
      if (deferred) {
        await new Promise((resolve) => window.setTimeout(resolve, workspaceSkillsInitialLoadDelayMs));
        if (workspaceSkillsRequestIdRef.current !== requestId) {
          return null;
        }
      }

      const snapshot = normalizeWorkspaceSkillsSnapshot(
        await bridge.readWorkspaceSkills({ cwd: requestedPath }),
        requestedPath
      );
      if (workspaceSkillsRequestIdRef.current !== requestId) {
        return null;
      }

      startTransition(() => {
        setWorkspaceSkillsState({
          status: 'ready',
          snapshot,
          error: '',
          requestedPath: snapshot.cwd || requestedPath
        });
      });
      return snapshot;
    } catch (error) {
      if (workspaceSkillsRequestIdRef.current !== requestId) {
        return null;
      }

      const message = error?.message || String(error);
      setWorkspaceSkillsState({
        status: 'error',
        snapshot: createEmptyWorkspaceSkillsSnapshot(requestedPath),
        error: message,
        requestedPath
      });
      if (!quiet) {
        showToast(t('skillsLoadFailed', { message }));
      }
      return null;
    }
  }, [showToast, t]);

  const refreshWorkspaceSkills = useCallback(() => {
    void loadWorkspaceSkills(skillsRootPath);
  }, [loadWorkspaceSkills, skillsRootPath]);

  const openWorkspacePath = useCallback((targetPath) => {
    const normalizedPath = String(targetPath || '').trim();
    if (!normalizedPath) {
      return;
    }

    bridge.openWorkspacePath(normalizedPath).catch((error) => {
      showToast(t('openPathFailed', { message: error.message }));
    });
  }, [showToast, t]);

  const openCodexSettings = useCallback((tab = 'preferences') => {
    const nextTab = typeof tab === 'string' && tab ? tab : 'preferences';
    setCodexInitialTab(nextTab);
    setCodexOpen(true);
  }, []);

  const openPromptManager = useCallback(() => {
    setPromptManagerOpen(true);
  }, []);

  useEffect(() => {
    void loadWorkspaceSkills(skillsRootPath, { quiet: true, deferred: true });
  }, [loadWorkspaceSkills, skillsRootPath]);

  const flushPanelActivity = useCallback(() => {
    panelActivityFlushTimer.current = null;
    if (panelActivityQueueRef.current.size === 0) {
      return;
    }

    const pending = new Map(panelActivityQueueRef.current);
    panelActivityQueueRef.current.clear();
    setPanels((current) => {
      let changed = false;
      const next = current.map((panel) => {
        const timestamp = pending.get(panel.id);
        if (!Number.isFinite(timestamp)) {
          return panel;
        }

        if (timestamp <= getPanelLastActivityAt(panel)) {
          return panel;
        }

        changed = true;
        return {
          ...panel,
          lastActivityAt: timestamp
        };
      });
      return changed ? next : current;
    });
  }, []);

  const touchPanelActivity = useCallback((id, timestamp = Date.now()) => {
    if (!id) {
      return;
    }

    const nextTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
    const previous = panelActivityQueueRef.current.get(id);
    if (!Number.isFinite(previous) || nextTimestamp > previous) {
      panelActivityQueueRef.current.set(id, nextTimestamp);
    }

    if (panelActivityFlushTimer.current !== null) {
      return;
    }

    panelActivityFlushTimer.current = window.setTimeout(() => {
      flushPanelActivity();
    }, panelActivityFlushMs);
  }, [flushPanelActivity]);

  const refreshCanvasSessionStatusQueue = useCallback(() => {
    flushPanelActivity();
    setPanelStateRevision((current) => current + 1);
    setCanvasStatusRefreshAt(Date.now());
  }, [flushPanelActivity]);

  const promotePanelToDetectedAgent = useCallback((id, command) => {
    const provider = detectCliProviderByCommand(command);
    if (!isAgentCliProvider(provider)) {
      return false;
    }

    const targetPanel = panelsRef.current.find((panel) => panel.id === id);
    const currentProvider = getPanelCliProvider(targetPanel);
    if (!targetPanel || currentProvider?.id === provider.id || isAgentCliProvider(currentProvider)) {
      return false;
    }

    setPanels((current) => current.map((panel) => (
      panel.id === id
        ? {
            ...panel,
            cliProviderId: provider.id,
            initialCommand: panel.initialCommand || command
          }
        : panel
    )));

    if (typeof bridge.updateTerminalMeta === 'function') {
      bridge.updateTerminalMeta(id, {
        cliProviderId: provider.id,
        initialCommand: command
      }).catch(() => {});
    }

    return true;
  }, []);

  const handleTerminalInput = useCallback((id, data) => {
    touchPanelActivity(id);
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return;
    }

    const currentBuffer = terminalInputCommandBuffersRef.current.get(normalizedId) || '';
    const { buffer, commands } = collectSubmittedTerminalCommands(currentBuffer, data);
    if (buffer) {
      terminalInputCommandBuffersRef.current.set(normalizedId, buffer);
    } else {
      terminalInputCommandBuffersRef.current.delete(normalizedId);
    }

    commands.forEach((command) => promotePanelToDetectedAgent(normalizedId, command));
  }, [promotePanelToDetectedAgent, touchPanelActivity]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => () => window.clearTimeout(panelActivityFlushTimer.current), []);
  useEffect(() => () => window.clearTimeout(panelStateTimerRef.current), []);
  useEffect(() => () => window.clearTimeout(sessionReviewFlushTimer.current), []);
  useEffect(() => () => {
    commandDockDispatchSparkleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    commandDockDispatchSparkleTimersRef.current.clear();
  }, []);
  useEffect(() => () => window.clearTimeout(canvasArrangeTimerRef.current), []);
  useEffect(() => () => window.clearTimeout(idleCommandCollectTimerRef.current), []);

  const closeCommandDockSkillMention = useCallback(() => {
    setCommandDockSkillMention((current) => (
      current.open ? createClosedCommandDockSkillMention() : current
    ));
  }, []);

  const updateCommandDockSkillMention = useCallback((element = commandDockInputRef.current, valueOverride) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      closeCommandDockSkillMention();
      return;
    }

    const value = typeof valueOverride === 'string' ? valueOverride : element.value;
    const selectionStart = Number.isFinite(element.selectionStart) ? element.selectionStart : value.length;
    const selectionEnd = Number.isFinite(element.selectionEnd) ? element.selectionEnd : selectionStart;

    if (selectionStart !== selectionEnd) {
      closeCommandDockSkillMention();
      return;
    }

    const trigger = getCommandDockSkillMentionTrigger(value, selectionStart);
    if (!trigger) {
      closeCommandDockSkillMention();
      return;
    }

    const position = getTextareaCaretPopupPosition(element, selectionStart);
    setCommandDockSkillMention((current) => {
      const sameQuery = current.open
        && current.triggerIndex === trigger.triggerIndex
        && current.query === trigger.query;

      return {
        open: true,
        query: trigger.query,
        triggerIndex: trigger.triggerIndex,
        caretIndex: selectionStart,
        selectedIndex: sameQuery ? current.selectedIndex : 0,
        position
      };
    });
  }, [closeCommandDockSkillMention]);

  const resizeCommandDockInput = useCallback((element = commandDockInputRef.current) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      return;
    }

    element.style.height = '0px';
    const nextHeight = Math.min(Math.max(element.scrollHeight, 108), 260);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > 260 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeCommandDockInput();
  }, [commandDockValue, resizeCommandDockInput]);

  useEffect(() => {
    if (!commandDockVisible || commandDockCollapsed) {
      return;
    }

    window.requestAnimationFrame(() => resizeCommandDockInput());
  }, [commandDockCollapsed, commandDockVisible, resizeCommandDockInput]);

  const handleCommandDockInputChange = useCallback((event) => {
    setCommandDockValue(event.target.value);
    resizeCommandDockInput(event.target);
    updateCommandDockSkillMention(event.target);
  }, [resizeCommandDockInput, updateCommandDockSkillMention]);

  const handleCommandDockInputSelect = useCallback((event) => {
    updateCommandDockSkillMention(event.target);
  }, [updateCommandDockSkillMention]);

  const handleCommandDockInputScroll = useCallback((event) => {
    updateCommandDockSkillMention(event.target);
  }, [updateCommandDockSkillMention]);

  const selectCommandDockTarget = useCallback((id) => {
    setCommandDockTargetId(id);
    window.requestAnimationFrame(() => commandDockInputRef.current?.focus());
  }, []);

  const changeCommandDockDispatchMode = useCallback((mode) => {
    setCommandDockDispatchMode(normalizeCommandDockDispatchMode(mode));
    window.requestAnimationFrame(() => commandDockInputRef.current?.focus());
  }, []);

  const changeCommandDockShortcut = useCallback((action, value) => {
    setCommandDockShortcuts((current) => (
      updateCommandDockShortcutSetting(current, action, value)
    ));
  }, []);

  const changeSessionHeaderVisibility = useCallback((itemId, visible) => {
    setSessionHeaderVisibility((current) => (
      updateSessionHeaderVisibilitySetting(current, itemId, visible)
    ));
  }, []);

  const expandCommandDock = useCallback(() => {
    if (!commandDockCollapsed) {
      return;
    }

    setCommandDockCollapsed(false);
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      commandDockInputRef.current?.focus();
    });
  }, [commandDockCollapsed, resizeCommandDockInput]);

  const toggleCommandDockCollapsed = useCallback(() => {
    if (commandDockCollapsed) {
      expandCommandDock();
      return;
    }

    setCommandDockCollapsed(true);
  }, [commandDockCollapsed, expandCommandDock]);

  const insertTextIntoCommandDock = useCallback((text) => {
    const normalizedText = String(text || '');
    if (!normalizedText) {
      return;
    }

    closeCommandDockSkillMention();
    const element = commandDockInputRef.current;
    const currentValue = typeof element?.value === 'string' ? element.value : commandDockValue;
    const selectionStart = typeof element?.selectionStart === 'number' ? element.selectionStart : currentValue.length;
    const selectionEnd = typeof element?.selectionEnd === 'number' ? element.selectionEnd : currentValue.length;
    const before = currentValue.slice(0, selectionStart);
    const after = currentValue.slice(selectionEnd);
    const prefix = before && !/[\s(（\n]$/.test(before) ? '\n' : '';
    const suffix = after && !/^[\s)\]）\n]/.test(after) ? '\n' : '';
    const insertion = `${prefix}${normalizedText}${suffix}`;
    const nextValue = `${before}${insertion}${after}`;
    const caret = before.length + insertion.length;

    setCommandDockValue(nextValue);
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      commandDockInputRef.current?.focus();
      commandDockInputRef.current?.setSelectionRange(caret, caret);
    });
  }, [closeCommandDockSkillMention, commandDockValue, resizeCommandDockInput]);

  const addCommandDockContextItems = useCallback((items) => {
    const normalizedItems = normalizeCommandDockContextItems(Array.isArray(items) ? items : [items]);
    if (normalizedItems.length === 0) {
      return false;
    }

    closeCommandDockSkillMention();
    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }

    setCommandDockContextItems((current) => (
      normalizeCommandDockContextItems([...current, ...normalizedItems])
    ));
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      commandDockInputRef.current?.focus();
    });
    return true;
  }, [closeCommandDockSkillMention, commandDockCollapsed, resizeCommandDockInput]);

  const removeCommandDockContextItem = useCallback((id) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return;
    }

    setCommandDockContextItems((current) => current.filter((item) => item.id !== normalizedId));
    window.requestAnimationFrame(() => resizeCommandDockInput());
  }, [resizeCommandDockInput]);

  const clearCommandDockContextItems = useCallback(() => {
    setCommandDockContextItems([]);
    window.requestAnimationFrame(() => resizeCommandDockInput());
  }, [resizeCommandDockInput]);

  const getSelectedTerminalContext = useCallback(() => {
    const prioritizedIds = [
      activeIdRef.current,
      commandDockTargetId,
      ...panelsRef.current.map((panel) => panel.id)
    ].filter(Boolean);
    const seen = new Set();

    for (const panelId of prioritizedIds) {
      if (seen.has(panelId)) {
        continue;
      }
      seen.add(panelId);

      const instance = terminalInstances.current.get(panelId);
      const selection = instance?.term?.hasSelection?.()
        ? String(instance.term.getSelection?.() || '').trim()
        : '';
      if (!selection) {
        continue;
      }

      const panel = panelsRef.current.find((item) => item.id === panelId) || null;
      return {
        panel,
        text: selection
      };
    }

    return null;
  }, [commandDockTargetId]);

  const addTerminalSelectionToCommandDockContext = useCallback(() => {
    const selection = getSelectedTerminalContext();
    if (!selection?.text) {
      showToast(t('floatingComposerContextNoTerminalSelection'));
      return false;
    }

    const panelTitle = selection.panel?.title || t('sessionFallbackTitle');
    addCommandDockContextItems(createCommandDockContextItem('terminal-selection', {
      content: selection.text,
      maxChars: commandDockTerminalContextMaxChars,
      panelId: selection.panel?.id,
      panelTitle,
      title: panelTitle
    }));
    showToast(t('floatingComposerContextAdded', { name: panelTitle }));
    return true;
  }, [addCommandDockContextItems, getSelectedTerminalContext, showToast, t]);

  const addLatestOutputToCommandDockContext = useCallback(() => {
    const targetPanel = commandDockPanels.find((panel) => panel.id === commandDockTargetId)
      || commandDockPanels.find((panel) => panel.id === activeIdRef.current)
      || commandDockPanels[0]
      || null;

    if (!targetPanel) {
      showToast(t('floatingComposerUnavailable'));
      return false;
    }

    const record = sessionReviewRecordsRef.current[targetPanel.id] || null;
    const rawText = String(record?.text || '');
    const latestText = rawText.length > commandDockTerminalContextMaxChars
      ? rawText.slice(-commandDockTerminalContextMaxChars)
      : rawText;
    const previewText = getSessionReviewPreviewText({ text: latestText }, 80) || latestText.trim();
    if (!previewText) {
      showToast(t('sessionReviewNoOutput'));
      return false;
    }

    addCommandDockContextItems(createCommandDockContextItem('terminal-output', {
      content: previewText,
      maxChars: commandDockTerminalContextMaxChars,
      panelId: targetPanel.id,
      panelTitle: targetPanel.title,
      title: targetPanel.title,
      truncated: rawText.length > commandDockTerminalContextMaxChars
    }));
    showToast(t('floatingComposerContextAdded', { name: targetPanel.title }));
    return true;
  }, [addCommandDockContextItems, commandDockPanels, commandDockTargetId, showToast, t]);

  const addSelectedTextToCommandDockContext = useCallback(() => {
    const activeElement = document.activeElement;
    let text = '';

    if (
      (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) &&
      typeof activeElement.selectionStart === 'number' &&
      typeof activeElement.selectionEnd === 'number' &&
      activeElement.selectionStart !== activeElement.selectionEnd
    ) {
      text = String(activeElement.value || '').slice(activeElement.selectionStart, activeElement.selectionEnd);
    }

    if (!text.trim()) {
      text = String(window.getSelection?.().toString() || '');
    }

    if (!text.trim()) {
      text = readClipboardText();
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      showToast(t('floatingComposerContextNoSelectedText'));
      return false;
    }

    addCommandDockContextItems(createCommandDockContextItem('text', {
      content: normalizedText,
      title: t('floatingComposerContextSelectedText')
    }));
    showToast(t('floatingComposerContextAdded', { name: t('floatingComposerContextSelectedText') }));
    return true;
  }, [addCommandDockContextItems, showToast, t]);

  const addUrlToCommandDockContext = useCallback(() => {
    if (commandDockContextLoading) {
      return false;
    }

    const clipboardText = readClipboardText().trim();
    const suggestedUrl = /^https?:\/\//i.test(clipboardText) ? clipboardText : '';
    const requestedUrl = window.prompt(t('floatingComposerUrlPrompt'), suggestedUrl);
    if (!requestedUrl || !requestedUrl.trim()) {
      return false;
    }

    const run = async () => {
      setCommandDockContextLoading(true);
      try {
        const context = await bridge.fetchAgentContextUrl({ url: requestedUrl.trim() });
        const title = String(context.title || context.url || requestedUrl).trim();
        addCommandDockContextItems(createCommandDockContextItem('url', {
          content: context.content,
          subtitle: context.contentType,
          title,
          truncated: context.truncated,
          url: context.url || requestedUrl.trim()
        }));
        showToast(t('floatingComposerContextAdded', { name: title }));
        return true;
      } catch (error) {
        showToast(t('floatingComposerContextAddFailed', { message: error.message }));
        return false;
      } finally {
        setCommandDockContextLoading(false);
      }
    };

    void run();
    return true;
  }, [addCommandDockContextItems, commandDockContextLoading, showToast, t]);

  const rememberCommandDockHistory = useCallback((value) => {
    setCommandDockHistory((current) => addCommandDockHistoryEntry(current, value));
  }, []);

  const selectCommandDockHistory = useCallback((value) => {
    const nextValue = trimTrailingLineBreaks(value);
    if (!String(nextValue || '').trim()) {
      return false;
    }

    closeCommandDockSkillMention();
    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }

    setCommandDockValue(nextValue);
    window.requestAnimationFrame(() => {
      const input = commandDockInputRef.current;
      const caret = String(nextValue).length;
      resizeCommandDockInput(input);
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
    return true;
  }, [closeCommandDockSkillMention, commandDockCollapsed, resizeCommandDockInput]);

  const saveCommandDockPrompt = useCallback(async () => {
    if (quickPromptsLoading) {
      return false;
    }

    const prompt = trimTrailingLineBreaks(commandDockInputRef.current?.value ?? commandDockValue);
    if (!String(prompt || '').trim()) {
      showToast(t('quickPromptContentRequired'));
      return false;
    }

    const title = deriveQuickPromptTitle(prompt, t('quickPromptDefaultName'));

    try {
      const store = await saveQuickPromptRecord({ title, prompt });
      const prompts = Array.isArray(store.prompts) ? store.prompts : [];
      const savedPrompt = store.savedPrompt || prompts.find((record) => record.title === title);

      showToast(t('quickPromptSaved', { name: savedPrompt?.title || title }));
      return true;
    } catch (error) {
      showToast(t('quickPromptSaveFailed', { message: error.message }));
      return false;
    }
  }, [commandDockValue, quickPromptsLoading, saveQuickPromptRecord, showToast, t]);

  const insertQuickPromptIntoCommandDock = useCallback((record) => {
    const prompt = String(record?.prompt || '').trim();
    if (!prompt) {
      return false;
    }

    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }

    insertTextIntoCommandDock(prompt);
    const title = String(record?.title || '').trim()
      || deriveQuickPromptTitle(prompt, t('quickPromptDefaultName'));
    showToast(t('quickPromptInserted', { name: title }));
    return true;
  }, [commandDockCollapsed, insertTextIntoCommandDock, showToast, t]);

  const deleteCommandDockPrompt = useCallback(async (record) => {
    if (quickPromptsLoading) {
      return false;
    }

    const promptId = String(record?.id || '').trim();
    if (!promptId) {
      return false;
    }

    const title = String(record?.title || '').trim()
      || deriveQuickPromptTitle(record?.prompt, t('quickPromptDefaultName'));
    if (!window.confirm(t('quickPromptDeleteConfirm', { name: title }))) {
      return false;
    }

    try {
      const store = await deleteQuickPromptRecord(promptId);
      showToast(t('quickPromptDeleted', { name: store.deletedPrompt?.title || title }));
      return true;
    } catch (error) {
      showToast(t('quickPromptDeleteFailed', { message: error.message }));
      return false;
    }
  }, [deleteQuickPromptRecord, quickPromptsLoading, showToast, t]);

  const saveCommandPreset = useCallback(async (payload) => {
    setCommandPresetsLoading(true);
    try {
      const store = await bridge.saveCommandPreset(payload || {});
      return applyCommandPresetStore(store);
    } finally {
      setCommandPresetsLoading(false);
    }
  }, [applyCommandPresetStore]);

  const selectCommandPreset = useCallback(async (id) => {
    setCommandPresetsLoading(true);
    try {
      const store = await bridge.selectCommandPreset(id);
      return applyCommandPresetStore(store);
    } finally {
      setCommandPresetsLoading(false);
    }
  }, [applyCommandPresetStore]);

  const deleteCommandPreset = useCallback(async (id) => {
    setCommandPresetsLoading(true);
    try {
      const store = await bridge.deleteCommandPreset(id);
      return applyCommandPresetStore(store);
    } finally {
      setCommandPresetsLoading(false);
    }
  }, [applyCommandPresetStore]);

  const insertCommandDockSkillMention = useCallback((item) => {
    const insertPath = String(item?.insertPath || '').trim();
    if (!insertPath) {
      return false;
    }

    const element = commandDockInputRef.current;
    const currentValue = typeof element?.value === 'string' ? element.value : commandDockValue;
    const selectionStart = typeof element?.selectionStart === 'number'
      ? element.selectionStart
      : commandDockSkillMention.caretIndex;
    const trigger = getCommandDockSkillMentionTrigger(currentValue, selectionStart);
    const triggerIndex = trigger?.triggerIndex ?? commandDockSkillMention.triggerIndex;
    const caretIndex = trigger ? selectionStart : commandDockSkillMention.caretIndex;

    if (!Number.isFinite(triggerIndex) || triggerIndex < 0 || caretIndex < triggerIndex) {
      return false;
    }

    const before = currentValue.slice(0, triggerIndex);
    const after = currentValue.slice(caretIndex);
    const insertion = `@${insertPath}`;
    const suffix = after && /^\s/.test(after) ? '' : ' ';
    const nextValue = `${before}${insertion}${suffix}${after}`;
    const caret = before.length + insertion.length + suffix.length;

    setCommandDockValue(nextValue);
    closeCommandDockSkillMention();
    showToast(t('floatingComposerSkillInserted', { path: insertPath }));
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      commandDockInputRef.current?.focus();
      commandDockInputRef.current?.setSelectionRange(caret, caret);
    });
    return true;
  }, [
    closeCommandDockSkillMention,
    commandDockSkillMention.caretIndex,
    commandDockSkillMention.triggerIndex,
    commandDockValue,
    resizeCommandDockInput,
    showToast,
    t
  ]);

  const addWorkspaceFileContextFromPath = useCallback((targetPath) => {
    const normalizedPath = String(targetPath || '').trim();
    if (!normalizedPath || !currentWorkspacePath || commandDockContextLoading) {
      return false;
    }

    const run = async () => {
      setCommandDockContextLoading(true);
      try {
        const fileContext = await bridge.readAgentContextFile({
          cwd: currentWorkspacePath,
          path: normalizedPath
        });
        const contextPath = normalizePromptFilePath(fileContext.relativePath || normalizedPath);
        const title = contextPath || fileContext.name || normalizedPath;
        addCommandDockContextItems(createCommandDockContextItem('file', {
          content: fileContext.content,
          path: contextPath,
          title,
          truncated: fileContext.truncated
        }));
        showToast(t('floatingComposerContextAdded', { name: title }));
        return true;
      } catch (error) {
        showToast(t('floatingComposerContextAddFailed', { message: error.message }));
        return false;
      } finally {
        setCommandDockContextLoading(false);
      }
    };

    void run();
    return true;
  }, [
    addCommandDockContextItems,
    commandDockContextLoading,
    currentWorkspacePath,
    showToast,
    t
  ]);

  const insertWorkspaceTreePathIntoCommandDock = useCallback((targetPath) => {
    const normalizedPath = String(targetPath || '').trim();
    if (!normalizedPath || !commandDockVisible) {
      return false;
    }

    return addWorkspaceFileContextFromPath(normalizedPath);
  }, [addWorkspaceFileContextFromPath, commandDockVisible]);

  const insertSelectedWorkspaceTreePath = useCallback(() => {
    insertWorkspaceTreePathIntoCommandDock(workspaceTreeSelectedNode?.path);
  }, [insertWorkspaceTreePathIntoCommandDock, workspaceTreeSelectedNode?.path]);

  const handleWorkspaceTreeNodeInsert = useCallback((node) => {
    const nextPath = getWorkspaceTreeInsertPath(node, normalizePromptFilePath);
    if (!nextPath) {
      return;
    }

    selectWorkspaceTreeNode(node);
    insertWorkspaceTreePathIntoCommandDock(nextPath);
  }, [insertWorkspaceTreePathIntoCommandDock, selectWorkspaceTreeNode]);

  const saveCommandDockImages = useCallback(async (files) => {
    const imageFiles = Array.isArray(files) ? files.filter((file) => isImageFile(file)) : [];
    if (imageFiles.length === 0) {
      return false;
    }

    try {
      const contextItems = [];
      for (const file of imageFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const savedImage = await bridge.saveCommandDockImage({
          fileName: file.name,
          mimeType: file.type,
          bytes: new Uint8Array(arrayBuffer)
        });
        const imagePath = normalizePromptFilePath(savedImage.path);
        contextItems.push(createCommandDockContextItem('image', {
          path: imagePath,
          title: savedImage.name || getCommandDockContextPathName(imagePath, t('floatingComposerContextImage'))
        }));
      }

      addCommandDockContextItems(contextItems);
      showToast(t('floatingComposerImagesAdded', { count: contextItems.length }));
      return true;
    } catch (error) {
      showToast(t('floatingComposerImageSaveFailed', { message: error.message }));
      return false;
    }
  }, [addCommandDockContextItems, showToast, t]);

  const saveImageGenerationReferenceImages = useCallback(async (files) => {
    const imageFiles = Array.isArray(files) ? files.filter((file) => isImageFile(file)) : [];
    if (imageFiles.length === 0) {
      return [];
    }

    try {
      const references = [];
      for (const file of imageFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const savedImage = await bridge.saveCommandDockImage({
          fileName: file.name,
          mimeType: file.type,
          bytes: new Uint8Array(arrayBuffer)
        });
        const reference = createImageGenerationReferenceItem(savedImage);
        if (reference) {
          references.push(reference);
        }
      }

      if (references.length > 0) {
        showToast(t('imageGenerationReferenceAdded', { count: references.length }));
      }
      return references;
    } catch (error) {
      showToast(t('imageGenerationReferenceSaveFailed', { message: error.message }));
      return [];
    }
  }, [showToast, t]);

  const handleCommandDockPaste = useCallback((event) => {
    const imageFiles = extractImageFilesFromDataTransfer(event.clipboardData);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void saveCommandDockImages(imageFiles);
  }, [saveCommandDockImages]);

  const handleCommandDockDragOver = useCallback((event) => {
    if (!hasImageFilesInDataTransfer(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleCommandDockDrop = useCallback((event) => {
    const imageFiles = extractImageFilesFromDataTransfer(event.dataTransfer);
    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void saveCommandDockImages(imageFiles);
  }, [saveCommandDockImages]);

  const generateImageFromCanvas = useCallback(async (payload) => {
    if (imageGenerationSubmitting) {
      return false;
    }

    const options = payload && typeof payload === 'object'
      ? payload
      : { prompt: payload };
    const prompt = trimTrailingLineBreaks(options.prompt ?? imageGenerationPrompt);
    if (!prompt.trim()) {
      return false;
    }

    const model = String(options.model || '').trim();
    const size = String(options.size || '').trim();
    const upscale = normalizeImageApiUpscale(options.upscale);
    const count = Number.parseInt(options.n, 10);
    const n = Number.isFinite(count) ? Math.min(4, Math.max(1, count)) : undefined;
    const referenceImageUrls = Array.isArray(options.referenceImageUrls)
      ? options.referenceImageUrls.map((url) => String(url || '').trim()).filter(Boolean)
      : [];
    const requestParams = options.requestParams && typeof options.requestParams === 'object'
      ? normalizeImageGenerationPayload(options.requestParams)
      : null;
    const requestBody = options.requestBody && typeof options.requestBody === 'object'
      ? normalizeImageGenerationPayload(options.requestBody)
      : null;
    const taskId = createLocalId('image-task');
    const pendingTask = createImageGenerationTaskItem({
      id: taskId,
      prompt,
      model,
      n,
      size,
      upscale,
      referenceImageCount: referenceImageUrls.length,
      requestParams,
      requestBody,
      status: 'submitting',
      createdAt: Date.now()
    });

    setImageGenerationResults((current) => [pendingTask, ...current].slice(0, 40));
    setImageGenerationSubmitting(true);
    try {
      const task = await bridge.generateImage({
        prompt,
        clientTaskId: taskId,
        ...(model ? { model } : {}),
        ...(size ? { size } : {}),
        ...(upscale ? { upscale } : {}),
        ...(n ? { n } : {}),
        ...(referenceImageUrls.length > 0 ? { referenceImageUrls } : {}),
        ...(requestParams ? { requestParams } : {}),
        ...(requestBody ? { requestBody } : {})
      });
      setImageGenerationResults((current) => current.map((item) => (
        item.id === taskId
          ? {
              ...item,
              ...createImageGenerationTaskItem(task, prompt),
              id: taskId
            }
          : item
      )));
      showToast(t('imageGenerationTaskSubmitted'));
      return true;
    } catch (error) {
      const message = error?.message || t('imageGenerationUnknownError');
      setImageGenerationResults((current) => current.map((item) => (
        item.id === taskId
          ? {
              ...item,
              status: 'failed',
              updatedAt: Date.now(),
              finishedAt: Date.now(),
              error: message
            }
          : item
      )));
      if (typeof bridge.onImageGenerationTaskUpdate !== 'function') {
        showToast(t('imageGenerationFailed', { message }));
      }
      return false;
    } finally {
      setImageGenerationSubmitting(false);
    }
  }, [
    imageGenerationSubmitting,
    imageGenerationPrompt,
    showToast,
    t
  ]);

  useEffect(() => {
    if (typeof bridge.onImageGenerationTaskUpdate !== 'function') {
      return undefined;
    }

    return bridge.onImageGenerationTaskUpdate((update) => {
      const id = String(update?.id || '').trim();
      if (!id) {
        return;
      }

      const status = normalizeImageGenerationStatus(update?.status);
      const prompt = String(update?.prompt || '').trim();

      if (status === 'success') {
        const images = createImageGenerationImageItems(update?.images, prompt, update);
        const successTask = createImageGenerationTaskItem({
          ...update,
          status: 'success',
          error: ''
        }, prompt);
        const remoteTaskId = String(successTask.taskId || '').trim();
        setImageGenerationResults((current) => {
          const nextItems = current.filter((item) => {
            if (item.id === id) {
              return false;
            }

            if (remoteTaskId && item.taskId === remoteTaskId && item.kind === 'image') {
              return false;
            }

            return true;
          });
          return [successTask, ...images, ...nextItems].slice(0, 40);
        });

        if (images.length > 0) {
          showToast(t('imageGenerationGenerated', { count: images.length }));
        } else {
          showToast(t('imageGenerationFailed', { message: t('imageGenerationNoLocalPath') }));
        }
        return;
      }

      if (imageGenerationFailedStatuses.has(status)) {
        const message = String(update?.error || '').trim() || t('imageGenerationUnknownError');
        const failedTask = createImageGenerationTaskItem({
          ...update,
          status: 'failed',
          error: message
        }, prompt);

        setImageGenerationResults((current) => {
          const found = current.some((item) => item.id === id);
          const nextItems = found
            ? current.map((item) => (item.id === id ? { ...item, ...failedTask, id } : item))
            : [failedTask, ...current];
          return nextItems.slice(0, 40);
        });
        showToast(t('imageGenerationFailed', { message }));
        return;
      }

      setImageGenerationResults((current) => current.map((item) => (
        item.id === id
          ? {
              ...item,
              ...createImageGenerationTaskItem(update, prompt || item.prompt),
              id
            }
          : item
      )));
    });
  }, [showToast, t]);

  const copyImageGenerationReference = useCallback((item) => {
    const normalizedPath = normalizePromptFilePath(item?.path || item?.normalizedPath);
    if (!normalizedPath) {
      return false;
    }

    const reference = t('floatingComposerImageReference', { path: normalizedPath });
    if (writeClipboardText(reference)) {
      showToast(t('imageGenerationCopied'));
      return true;
    }
    return false;
  }, [showToast, t]);

  const openImageGenerationFile = useCallback((item) => {
    openWorkspacePath(item?.path || item?.normalizedPath);
  }, [openWorkspacePath]);

  const clearImageGenerationResults = useCallback(() => {
    setImageGenerationResults([]);
    if (typeof bridge.clearImageGenerationHistory === 'function') {
      bridge.clearImageGenerationHistory().catch((error) => {
        showToast(t('imageGenerationHistorySaveFailed', { message: error.message }));
      });
    }
  }, [showToast, t]);

  const submitTerminalTextPayload = useCallback((panelId, value) => {
    const text = String(value || '');
    if (!text) {
      return false;
    }

    const instance = terminalInstances.current.get(panelId);
    const payload = normalizeTerminalInputPayload(text, {
      bracketedPasteMode: Boolean(instance?.term?.modes?.bracketedPasteMode)
    });
    if (!payload) {
      return false;
    }

    bridge.writeTerminal(panelId, payload);
    return true;
  }, []);

  const submitCommandDockPayload = useCallback((panelId, value) => (
    submitTerminalTextPayload(panelId, value)
  ), [submitTerminalTextPayload]);

  const focusCommandDockTerminal = useCallback((target) => {
    const targetId = String((typeof target === 'string' ? target : target?.id) || '').trim();
    if (!targetId) {
      return;
    }

    let attempts = 0;
    const focus = () => {
      const panel = panelsRef.current.find((item) => item.id === targetId) || target;
      if (panel?.minimized) {
        return;
      }

      const instance = terminalInstances.current.get(targetId);
      if (instance?.term) {
        instance?.fit?.();
        focusTerminalForTextInput(instance.term);
        return;
      }

      attempts += 1;
      if (attempts < 4) {
        window.setTimeout(focus, 60);
      }
    };

    window.requestAnimationFrame(focus);
  }, []);

  const getCommandDockTargetRect = useCallback((panel) => {
    if (!panel) {
      return null;
    }

    if (panel.minimized) {
      const group = panel.groupId
        ? endpointGroupsRef.current.find((item) => item.id === panel.groupId)
        : null;

      if (group && group.canvasKey === getWorkspaceCanvasKey(workspaceRef.current)) {
        const groupX = Number.isFinite(group.x) ? group.x : 0;
        const groupY = Number.isFinite(group.y) ? group.y : 0;
        const groupWidth = Number.isFinite(group.width) ? group.width : endpointWidth + 28;
        const members = panelsRef.current.filter((item) => (
          item.groupId === group.id &&
          item.minimized &&
          isPanelVisibleInWorkspace(item, workspaceRef.current)
        ));
        const index = Math.max(0, members.findIndex((item) => item.id === panel.id));

        return {
          x: groupX + 14,
          y: groupY + 58 + index * 42,
          width: Math.max(groupWidth - 28, endpointWidth),
          height: 36
        };
      }

      return {
        x: Number.isFinite(panel.x) ? panel.x : 0,
        y: Number.isFinite(panel.y) ? panel.y : 0,
        width: endpointWidth,
        height: endpointHeight
      };
    }

    return {
      x: Number.isFinite(panel.x) ? panel.x : 0,
      y: Number.isFinite(panel.y) ? panel.y : 0,
      width: Number.isFinite(panel.width) ? panel.width : 640,
      height: Number.isFinite(panel.height) ? panel.height : 380
    };
  }, []);

  const centerCanvasOnCommandDockTarget = useCallback((target) => {
    const panel = typeof target === 'string'
      ? panelsRef.current.find((item) => item.id === target)
      : target;

    if (!panel || !isPanelVisibleInWorkspace(panel, workspaceRef.current)) {
      return false;
    }

    const targetRect = getCommandDockTargetRect(panel);
    const viewportRect = viewportRef.current?.getBoundingClientRect();
    if (!targetRect || !viewportRect) {
      return false;
    }

    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2
    };

    setView((current) => {
      const scale = Number.isFinite(current?.scale) ? clamp(current.scale, 0.35, 2.5) : 1;
      const currentX = Number.isFinite(current?.x) ? current.x : 0;
      const currentY = Number.isFinite(current?.y) ? current.y : 0;
      const nextView = {
        scale,
        x: Math.round(viewportRect.width / 2 - targetCenter.x * scale),
        y: Math.round(viewportRect.height / 2 - targetCenter.y * scale)
      };

      return current && currentX === nextView.x && currentY === nextView.y && scale === nextView.scale
        ? current
        : nextView;
    });

    nextZIndex.current += 1;
    setActiveId(panel.id);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);

    const targetGroup = panel.minimized && panel.groupId
      ? endpointGroupsRef.current.find((group) => (
        group.id === panel.groupId &&
        group.canvasKey === getWorkspaceCanvasKey(workspaceRef.current)
      ))
      : null;

    if (targetGroup) {
      setEndpointGroups((current) => current.map((group) => (
        group.id === targetGroup.id ? { ...group, zIndex: nextZIndex.current } : group
      )));
    } else {
      setPanels((current) => current.map((item) => (
        item.id === panel.id ? { ...item, zIndex: nextZIndex.current } : item
      )));
    }

    return true;
  }, [getCommandDockTargetRect]);

  const prepareAgentUtilityTarget = useCallback((panelId, options = {}) => {
    const panel = panelsRef.current.find((item) => item.id === panelId);
    if (!panel) {
      showToast(t('agentUtilityPanelMissing'));
      return null;
    }

    setCommandDockTargetId(panel.id);
    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }
    if (imageGenerationOpen) {
      setImageGenerationOpen(false);
    }
    if (!options.quiet) {
      showToast(t('agentUtilityTargetReady', { name: panel.title }));
    }

    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      if (options.focus !== false) {
        commandDockInputRef.current?.focus();
      }
    });
    return panel;
  }, [commandDockCollapsed, imageGenerationOpen, resizeCommandDockInput, showToast, t]);

  const attachAgentImagesToCommandDock = useCallback((panelId, files) => {
    const panel = prepareAgentUtilityTarget(panelId, { quiet: true });
    if (!panel) {
      return false;
    }

    return saveCommandDockImages(files);
  }, [prepareAgentUtilityTarget, saveCommandDockImages]);

  const openAgentWorkspaceFiles = useCallback((panelId) => {
    const panel = prepareAgentUtilityTarget(panelId, { quiet: true });
    if (!panel) {
      return false;
    }

    const targetPath = String(panel.cwd || currentWorkspacePath || '').trim();
    setWorkspaceTreeOpen(true);
    setSessionReviewOpen(false);
    setImageGenerationOpen(false);
    if (
      targetPath
      && targetPath !== cwdRef.current
      && shouldPromoteWorkspacePath(targetPath, panel.projectId)
    ) {
      setCwd(targetPath);
    }
    void loadWorkspaceTree(targetPath);
    return true;
  }, [currentWorkspacePath, loadWorkspaceTree, prepareAgentUtilityTarget, shouldPromoteWorkspacePath]);

  const insertAgentDiffContext = useCallback(async (panelId) => {
    const panel = prepareAgentUtilityTarget(panelId, { quiet: true });
    if (!panel) {
      return false;
    }

    const targetPath = String(panel.cwd || currentWorkspacePath || '').trim();
    try {
      const snapshot = await bridge.readWorkspaceDiff({ cwd: targetPath });
      const diffText = String(snapshot?.text || '').trim();
      if (!diffText) {
        showToast(t('agentUtilityDiffEmpty'));
        return false;
      }

      const diffPath = normalizePromptFilePath(snapshot.repositoryRoot || targetPath);
      const header = t('agentUtilityDiffContextHeader', { path: diffPath });
      insertTextIntoCommandDock(`${header}\n\n\`\`\`\`diff\n${diffText}\n\`\`\`\``);
      showToast(t('agentUtilityDiffInserted'));
      return true;
    } catch (error) {
      showToast(t('agentUtilityDiffFailed', { message: error?.message || String(error) }));
      return false;
    }
  }, [currentWorkspacePath, insertTextIntoCommandDock, prepareAgentUtilityTarget, showToast, t]);

  const openDiffReviewForPath = useCallback((targetPath = '') => {
    const normalizedPath = String(targetPath || currentWorkspacePath || '').trim();
    if (!normalizedPath) {
      showToast(t('diffReviewNoWorkspace'));
      return false;
    }

    setDiffReviewCwd(normalizedPath);
    setWorkspaceTreeOpen(false);
    setSessionReviewOpen(false);
    setPromptManagerOpen(false);
    setImageGenerationOpen(false);
    setDiffReviewOpen(true);
    return true;
  }, [currentWorkspacePath, showToast, t]);

  const openAgentDiffReview = useCallback((panelId) => {
    const panel = prepareAgentUtilityTarget(panelId, { focus: false, quiet: true });
    if (!panel) {
      return false;
    }

    const targetPath = String(panel.cwd || currentWorkspacePath || '').trim();
    centerCanvasOnCommandDockTarget(panel);
    return openDiffReviewForPath(targetPath);
  }, [centerCanvasOnCommandDockTarget, currentWorkspacePath, openDiffReviewForPath, prepareAgentUtilityTarget]);

  const sendCommandDockInput = useCallback((options = {}) => {
    const targetPanel = commandDockPanels.find((panel) => panel.id === commandDockTargetId);
    if (!canPanelReceiveInput(targetPanel)) {
      return false;
    }

    const hasExplicitValue = options
      && typeof options === 'object'
      && !options.nativeEvent
      && Object.prototype.hasOwnProperty.call(options, 'value');
    const rawValue = hasExplicitValue
      ? options.value
      : commandDockInputRef.current?.value ?? commandDockValue;
    const shouldTrimTrailingBreaks = !options || options.trimTrailingLineBreaks !== false;
    const nextValue = shouldTrimTrailingBreaks ? trimTrailingLineBreaks(rawValue) : rawValue;
    const contextItems = normalizeCommandDockContextItems(commandDockContextItems);
    if (!String(nextValue || '').trim() && contextItems.length === 0) {
      return false;
    }

    const payloadValue = buildCommandDockContextPayload(nextValue, contextItems);
    if (!String(payloadValue || '').trim()) {
      return false;
    }

    touchPanelActivity(targetPanel.id);
    submitCommandDockPayload(targetPanel.id, payloadValue);
    flashCommandDockDispatchTargets(targetPanel.id);
    centerCanvasOnCommandDockTarget(targetPanel);
    rememberCommandDockHistory(formatCommandDockContextHistoryEntry(nextValue, contextItems));
    setCommandDockValue('');
    setCommandDockContextItems([]);
    closeCommandDockSkillMention();
    showToast(t('floatingComposerSent', { name: targetPanel.title }));
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
    });
    focusCommandDockTerminal(targetPanel);
    return true;
  }, [centerCanvasOnCommandDockTarget, closeCommandDockSkillMention, commandDockContextItems, commandDockPanels, commandDockTargetId, commandDockValue, flashCommandDockDispatchTargets, focusCommandDockTerminal, rememberCommandDockHistory, resizeCommandDockInput, showToast, submitCommandDockPayload, t, touchPanelActivity]);

  const handleCommandDockCompositionStart = useCallback(() => {
    commandDockComposingRef.current = true;
  }, []);

  const handleCommandDockCompositionEnd = useCallback((event) => {
    commandDockComposingRef.current = false;
    const pendingAction = commandDockPendingActionRef.current;
    if (!pendingAction) {
      updateCommandDockSkillMention(event.target);
      return;
    }

    commandDockPendingActionRef.current = '';
    const committedValue = trimTrailingLineBreaks(commandDockInputRef.current?.value || '');
    setCommandDockValue(committedValue);
    window.requestAnimationFrame(() => {
      if (pendingAction === 'dispatch') {
        commandDockDispatchTasksRef.current?.({ value: committedValue });
      } else {
        sendCommandDockInput({
          value: committedValue
        });
      }
    });
  }, [sendCommandDockInput, updateCommandDockSkillMention]);

  const handleCommandDockKeyDown = useCallback((event) => {
    const isComposing = commandDockComposingRef.current
      || event.nativeEvent?.isComposing
      || event.keyCode === 229
      || event.which === 229;

    if (!isComposing && commandDockSkillMention.open) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCommandDockSkillMention((current) => ({
          ...current,
          selectedIndex: commandDockSkillMentionItems.length > 0
            ? (current.selectedIndex + 1) % commandDockSkillMentionItems.length
            : 0
        }));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCommandDockSkillMention((current) => ({
          ...current,
          selectedIndex: commandDockSkillMentionItems.length > 0
            ? (current.selectedIndex - 1 + commandDockSkillMentionItems.length) % commandDockSkillMentionItems.length
            : 0
        }));
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeCommandDockSkillMention();
        return;
      }

      if (
        (event.key === 'Tab' || isCommandDockShortcutMatch(event, 'enter')) &&
        commandDockSkillMentionItems.length > 0
      ) {
        event.preventDefault();
        const selectedItem = commandDockSkillMentionItems[
          clamp(commandDockSkillMention.selectedIndex || 0, 0, commandDockSkillMentionItems.length - 1)
        ];
        insertCommandDockSkillMention(selectedItem);
        return;
      }
    }

    const normalizedShortcuts = normalizeCommandDockShortcutSettings(commandDockShortcuts);
    const shortcutAction = isCommandDockShortcutMatch(event, normalizedShortcuts.sendShortcut)
      ? 'send'
      : isCommandDockShortcutMatch(event, normalizedShortcuts.dispatchShortcut) ? 'dispatch' : '';

    if (!shortcutAction) {
      return;
    }

    if (isComposing) {
      commandDockPendingActionRef.current = shortcutAction;
      return;
    }

    commandDockPendingActionRef.current = '';
    event.preventDefault();
    if (shortcutAction === 'dispatch') {
      commandDockDispatchTasksRef.current?.();
    } else {
      sendCommandDockInput();
    }
  }, [
    closeCommandDockSkillMention,
    commandDockShortcuts,
    commandDockSkillMention.open,
    commandDockSkillMention.selectedIndex,
    commandDockSkillMentionItems,
    insertCommandDockSkillMention,
    sendCommandDockInput
  ]);

  const commitWorkspace = useCallback((updater) => {
    const currentCanvasKey = canvasScopeKeyRef.current;
    const currentWithView = withWorkspaceCanvasView(workspaceRef.current, currentCanvasKey, viewRef.current);
    const nextWorkspace = updater(currentWithView);
    const nextCanvasKey = getWorkspaceCanvasKey(nextWorkspace);

    workspaceRef.current = nextWorkspace;
    canvasScopeKeyRef.current = nextCanvasKey;
    setWorkspace(nextWorkspace);

    if (nextCanvasKey !== currentCanvasKey) {
      setView(getWorkspaceCanvasView(nextWorkspace));
    }

    return nextWorkspace;
  }, []);

  const updateCanvasFramesForKey = useCallback((canvasKey, updater) => {
    commitWorkspace((currentWorkspace) => {
      const currentFrames = getWorkspaceCanvasFrames(currentWorkspace, canvasKey);
      const nextFrames = updater(currentFrames);
      return withWorkspaceCanvasFrames(currentWorkspace, canvasKey, nextFrames);
    });
  }, [commitWorkspace]);

  const updateCanvasTodosForKey = useCallback((canvasKey, updater) => {
    commitWorkspace((currentWorkspace) => {
      const currentTodos = getWorkspaceCanvasTodos(currentWorkspace, canvasKey);
      const nextTodos = updater(currentTodos);
      return withWorkspaceCanvasTodos(currentWorkspace, canvasKey, nextTodos);
    });
  }, [commitWorkspace]);

  const updateCanvasTodosForLinkedPanel = useCallback((panelId, updater) => {
    const normalizedPanelId = String(panelId || '').trim();
    if (!normalizedPanelId || typeof updater !== 'function') {
      return;
    }

    commitWorkspace((currentWorkspace) => {
      const entries = Object.entries(currentWorkspace.canvasTodos || {});
      if (entries.length === 0) {
        return currentWorkspace;
      }

      let changed = false;
      const nextCanvasTodos = { ...(currentWorkspace.canvasTodos || {}) };
      entries.forEach(([canvasKey, todos]) => {
        const currentTodos = Array.isArray(todos) ? todos : [];
        const nextTodos = currentTodos.map((todo) => (
          todo.linkedPanelId === normalizedPanelId
            ? normalizeCanvasTodo(updater(todo) || todo)
            : todo
        ));
        if (!sameCanvasTodoList(currentTodos, nextTodos)) {
          changed = true;
          nextCanvasTodos[canvasKey] = nextTodos;
        }
      });

      return changed ? { ...currentWorkspace, canvasTodos: nextCanvasTodos } : currentWorkspace;
    });
  }, [commitWorkspace]);

  const updateCanvasConnectionsForKey = useCallback((canvasKey, updater) => {
    commitWorkspace((currentWorkspace) => {
      const currentConnections = getWorkspaceCanvasConnections(currentWorkspace, canvasKey);
      const nextConnections = updater(currentConnections);
      return withWorkspaceCanvasConnections(currentWorkspace, canvasKey, nextConnections);
    });
  }, [commitWorkspace]);

  useEffect(() => {
    let canceled = false;

    bridge.getAppInfo().then((info) => {
      if (canceled) {
        return;
      }

      setAppInfo(info);
      setDefaultCwd(info.homeDir || '');
      setHistoryProject(createHistoryProject(info.historyDir));
      if (!info.ptyEnabled) {
        showToast(t('ptyFallback'));
      }
    }).catch((error) => {
      if (!canceled) {
        showToast(error.message);
      }
    });

    return () => {
      canceled = true;
    };
  }, [showToast, t]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    window.clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = window.setTimeout(() => {
      localStorage.setItem(settingsKey, JSON.stringify({
        cwd,
        theme,
        language,
        appZoomFactor: normalizeAppZoomFactor(appZoomFactor),
        sessionHeaderVisibility: normalizeSessionHeaderVisibility(sessionHeaderVisibility),
        view,
        commandDockDispatchMode,
        commandDockShortcuts: normalizeCommandDockShortcutSettings(commandDockShortcuts),
        commandDockPosition,
        commandDockHistory
      }));
    }, 180);
  }, [appZoomFactor, commandDockDispatchMode, commandDockHistory, commandDockPosition, commandDockShortcuts, cwd, language, sessionHeaderVisibility, theme, view]);

  useEffect(() => () => window.clearTimeout(saveSettingsTimer.current), []);

  useEffect(() => {
    window.clearTimeout(saveWorkspaceTimer.current);
    saveWorkspaceTimer.current = window.setTimeout(() => {
      localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    }, 220);
  }, [workspace]);

  useEffect(() => () => window.clearTimeout(saveWorkspaceTimer.current), []);

  useEffect(() => {
    localStorage.setItem(agentsKey, JSON.stringify(agents));
  }, [agents]);

  useEffect(() => {
    localStorage.setItem(autopilotKey, JSON.stringify(autopilots));
  }, [autopilots]);

  useEffect(() => {
    window.clearTimeout(persistCanvasViewTimer.current);
    persistCanvasViewTimer.current = window.setTimeout(() => {
      const nextWorkspace = withWorkspaceCanvasView(
        workspaceRef.current,
        canvasScopeKeyRef.current,
        viewRef.current
      );

      if (nextWorkspace !== workspaceRef.current) {
        workspaceRef.current = nextWorkspace;
        setWorkspace(nextWorkspace);
      }
    }, 180);
  }, [view]);

  useEffect(() => () => window.clearTimeout(persistCanvasViewTimer.current), []);

  const registerTerminal = useCallback((id, instance) => {
    terminalInstances.current.set(id, instance);
    return () => terminalInstances.current.delete(id);
  }, []);

  const focusTerminalInstance = useCallback((id) => {
    const instance = terminalInstances.current.get(id);
    if (!instance?.term) {
      return;
    }

    focusTerminalForTextInput(instance.term);
  }, []);

  const refitTerminalInstances = useCallback(() => {
    const fitAll = () => {
      terminalInstances.current.forEach((instance) => {
        try {
          instance?.fit?.();
        } catch {
          // A terminal can unmount while Electron is applying page zoom.
        }
      });
    };

    window.requestAnimationFrame(() => {
      fitAll();
      window.setTimeout(fitAll, 120);
    });
  }, []);

  useEffect(() => {
    let canceled = false;
    const zoomFactor = normalizeAppZoomFactor(appZoomFactor);

    bridge.setAppZoomFactor(zoomFactor)
      .then(() => {
        if (!canceled) {
          refitTerminalInstances();
        }
      })
      .catch((error) => {
        if (!canceled) {
          showToast(t('appZoomApplyFailed', { message: error.message }));
        }
      });

    return () => {
      canceled = true;
    };
  }, [appZoomFactor, refitTerminalInstances, showToast, t]);

  const flushSessionReviewRecords = useCallback(() => {
    sessionReviewFlushTimer.current = null;
    setSessionReviewRecords({ ...sessionReviewRecordsRef.current });
  }, []);

  const scheduleSessionReviewFlush = useCallback(() => {
    if (sessionReviewFlushTimer.current !== null) {
      return;
    }

    sessionReviewFlushTimer.current = window.setTimeout(() => {
      flushSessionReviewRecords();
    }, sessionReviewFlushMs);
  }, [flushSessionReviewRecords]);

  const appendSessionReviewRecord = useCallback((id, data, timestamp = Date.now()) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return;
    }

    const currentRecord = sessionReviewRecordsRef.current[normalizedId] || null;
    const nextRecord = appendSessionReviewOutput(currentRecord, data, timestamp);
    if (nextRecord === currentRecord) {
      return;
    }

    sessionReviewRecordsRef.current = {
      ...sessionReviewRecordsRef.current,
      [normalizedId]: nextRecord
    };
    scheduleSessionReviewFlush();
  }, [scheduleSessionReviewFlush]);

  useEffect(() => {
    const panelIds = new Set(panels.map((panel) => panel.id));
    const currentRecords = sessionReviewRecordsRef.current;
    const nextRecords = {};
    let changed = false;

    terminalInputCommandBuffersRef.current.forEach((_value, id) => {
      if (!panelIds.has(id)) {
        terminalInputCommandBuffersRef.current.delete(id);
      }
    });
    canvasTodoOutputBuffersRef.current.forEach((_value, id) => {
      if (!panelIds.has(id)) {
        canvasTodoOutputBuffersRef.current.delete(id);
      }
    });

    Object.entries(currentRecords).forEach(([id, record]) => {
      if (panelIds.has(id)) {
        nextRecords[id] = record;
        return;
      }

      changed = true;
    });

    if (changed) {
      sessionReviewRecordsRef.current = nextRecords;
      setSessionReviewRecords(nextRecords);
    }
  }, [panels]);

  const syncCanvasTodoProgressFromOutput = useCallback((id, data) => {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) {
      return;
    }

    const normalizedData = normalizeCanvasTodoOutputText(data);
    if (!normalizedData) {
      return;
    }

    const previousBuffer = canvasTodoOutputBuffersRef.current.get(normalizedId) || '';
    const combined = `${previousBuffer}${normalizedData}`;
    const lastBreakIndex = combined.lastIndexOf('\n');
    if (lastBreakIndex < 0) {
      canvasTodoOutputBuffersRef.current.set(normalizedId, combined.slice(-canvasTodoOutputCarryMaxChars));
      return;
    }

    const readyText = combined.slice(0, lastBreakIndex + 1);
    const carry = combined.slice(lastBreakIndex + 1).slice(-canvasTodoOutputCarryMaxChars);
    if (carry) {
      canvasTodoOutputBuffersRef.current.set(normalizedId, carry);
    } else {
      canvasTodoOutputBuffersRef.current.delete(normalizedId);
    }

    const extracted = extractCanvasTodoProgressFromOutput(readyText);
    if (extracted.tasks.length === 0 && !extracted.planText) {
      return;
    }

    const timestamp = Date.now();
    updateCanvasTodosForLinkedPanel(normalizedId, (todo) => (
      todo.autoSync
        ? mergeCanvasTodoExtractedProgress(todo, extracted, timestamp)
        : todo
    ));
  }, [updateCanvasTodosForLinkedPanel]);

  useEffect(() => {
    const offData = bridge.onTerminalData(({ id, data }) => {
      touchPanelActivity(id);
      appendSessionReviewRecord(id, data);
      syncCanvasTodoProgressFromOutput(id, data);
      terminalInstances.current.get(id)?.term.write(data);
    });

    const offExit = bridge.onTerminalExit(({ id, exitCode, signal }) => {
      const instance = terminalInstances.current.get(id);
      const label = exitCode === null || typeof exitCode === 'undefined'
        ? signal || 'closed'
        : `code ${exitCode}`;
      instance?.term.write(`\r\n\x1b[38;5;246m[process exited: ${label}]\x1b[0m\r\n`);
      appendSessionReviewRecord(id, `\n[process exited: ${label}]\n`);
      setPanels((current) => current.map((panel) => (
        panel.id === id
          ? {
              ...panel,
              exitCode,
              endedAt: Date.now(),
              signal: signal || null,
              status: exitCode === 0 && !signal ? 'completed' : 'error'
            }
          : panel
      )));
    });

    return () => {
      offData();
      offExit();
    };
  }, [appendSessionReviewRecord, syncCanvasTodoProgressFromOutput, touchPanelActivity]);

  const getViewportRect = useCallback(() => viewportRef.current.getBoundingClientRect(), []);

  const viewportCenterOnCanvas = useCallback(() => {
    const rect = getViewportRect();
    return {
      x: (rect.width / 2 - view.x) / view.scale,
      y: (rect.height / 2 - view.y) / view.scale
    };
  }, [getViewportRect, view]);

  const clientPointToCanvas = useCallback((clientX, clientY, canvasView = viewRef.current) => {
    const rect = getViewportRect();
    return {
      x: (clientX - rect.left - canvasView.x) / canvasView.scale,
      y: (clientY - rect.top - canvasView.y) / canvasView.scale
    };
  }, [getViewportRect]);

  const buildCanvasFrameBounds = useCallback((anchor, point) => {
    const deltaX = point.x - anchor.x;
    const deltaY = point.y - anchor.y;
    const width = Math.max(Math.abs(deltaX), canvasFrameMinWidth);
    const height = Math.max(Math.abs(deltaY), canvasFrameMinHeight);
    return {
      x: Math.round(deltaX >= 0 ? anchor.x : anchor.x - width),
      y: Math.round(deltaY >= 0 ? anchor.y : anchor.y - height),
      width: Math.round(width),
      height: Math.round(height)
    };
  }, []);

  const getCenteredTerminalSlot = useCallback((targetWorkspace, width = 640, height = 380) => {
    const targetView = getWorkspaceCanvasView(targetWorkspace, viewRef.current);
    const rect = getViewportRect();
    return {
      width,
      height,
      x: (rect.width / 2 - targetView.x) / targetView.scale - width / 2,
      y: (rect.height / 2 - targetView.y) / targetView.scale - height / 2
    };
  }, [getViewportRect]);

  const getVisiblePanels = useCallback((
    records = panelsRef.current,
    currentWorkspace = workspaceRef.current
  ) => records.filter((panel) => isPanelVisibleInWorkspace(panel, currentWorkspace)), []);

  const activatePanel = useCallback((id) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    nextZIndex.current += 1;
    setActiveId(id);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setActiveCanvasConnectionId(null);
    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, zIndex: nextZIndex.current } : panel
    )));
    if (!panel?.minimized) {
      window.requestAnimationFrame(() => focusTerminalInstance(id));
    }
  }, [focusTerminalInstance]);

  const activateCanvasFrame = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasFrameId(id);
    setActiveCanvasTodoId(null);
    setActiveId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasFramesForKey(canvasKey, (currentFrames) => {
      const index = currentFrames.findIndex((frame) => frame.id === id);
      if (index < 0 || index === currentFrames.length - 1) {
        return currentFrames;
      }

      const nextFrames = [...currentFrames];
      const [frame] = nextFrames.splice(index, 1);
      nextFrames.push(frame);
      return nextFrames;
    });
  }, [updateCanvasFramesForKey]);

  const updateCanvasFrame = useCallback((id, patch) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasFrameId(id);
    setActiveCanvasTodoId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasFramesForKey(canvasKey, (currentFrames) => currentFrames.map((frame) => (
      frame.id === id ? normalizeCanvasFrame({ ...frame, ...patch }) : frame
    )));
  }, [updateCanvasFramesForKey]);

  const commitCanvasFrameTitle = useCallback((id, title) => {
    const nextTitle = String(title || '').trim() || t('canvasFrameDefaultTitle');
    updateCanvasFrame(id, { title: nextTitle });
  }, [t, updateCanvasFrame]);

  const deleteCanvasFrame = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasFrameId((current) => (current === id ? null : current));
    updateCanvasFramesForKey(canvasKey, (currentFrames) => currentFrames.filter((frame) => frame.id !== id));
  }, [updateCanvasFramesForKey]);

  const createCanvasFrameAtPoint = useCallback((point) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    const frameId = createLocalId('canvas-frame');
    const frame = normalizeCanvasFrame({
      id: frameId,
      title: t('canvasFrameDefaultTitle'),
      x: Math.round(point?.x || 0),
      y: Math.round(point?.y || 0),
      width: canvasFrameDefaultWidth,
      height: canvasFrameDefaultHeight
    });

    setPendingCanvasFrame(false);
    setActiveId(null);
    setActiveCanvasTodoId(null);
    setActiveCanvasFrameId(frameId);
    setActiveCanvasConnectionId(null);
    updateCanvasFramesForKey(canvasKey, (currentFrames) => [...currentFrames, frame]);
  }, [t, updateCanvasFramesForKey]);

  const activateCanvasTodo = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
    setActiveId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasTodosForKey(canvasKey, (currentTodos) => {
      const index = currentTodos.findIndex((todo) => todo.id === id);
      if (index < 0 || index === currentTodos.length - 1) {
        return currentTodos;
      }

      const nextTodos = [...currentTodos];
      const [todo] = nextTodos.splice(index, 1);
      nextTodos.push(todo);
      return nextTodos;
    });
  }, [updateCanvasTodosForKey]);

  const updateCanvasTodo = useCallback((id, patch) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasTodosForKey(canvasKey, (currentTodos) => currentTodos.map((todo) => (
      todo.id === id ? normalizeCanvasTodo({ ...todo, ...patch }) : todo
    )));
  }, [updateCanvasTodosForKey]);

  const moveCanvasTodo = useCallback((id, patch) => {
    updateCanvasTodo(id, {
      ...patch,
      followPanel: false
    });
  }, [updateCanvasTodo]);

  const updateCanvasTodoItems = useCallback((id, updater) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasTodosForKey(canvasKey, (currentTodos) => currentTodos.map((todo) => {
      if (todo.id !== id) {
        return todo;
      }

      const nextItems = typeof updater === 'function' ? updater(todo.items || []) : todo.items || [];
      return normalizeCanvasTodo({
        ...todo,
        items: nextItems
      });
    }));
  }, [updateCanvasTodosForKey]);

  const addCanvasTodo = useCallback(() => {
    const center = viewportCenterOnCanvas();
    const todoId = createLocalId('canvas-todo');
    const todo = {
      id: todoId,
      title: t('canvasTodoDefaultTitle'),
      pinned: true,
      x: Math.round(center.x - canvasTodoDefaultWidth / 2),
      y: Math.round(center.y - canvasTodoDefaultHeight / 2),
      width: canvasTodoDefaultWidth,
      height: canvasTodoDefaultHeight,
      items: []
    };

    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(todoId);
    setActiveCanvasFrameId(null);
    setActiveId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasTodosForKey(canvasKey, (currentTodos) => [...currentTodos, todo]);
    showToast(t('canvasTodoAdded'));
  }, [showToast, t, updateCanvasTodosForKey, viewportCenterOnCanvas]);

  const commitCanvasTodoTitle = useCallback((id, title) => {
    const nextTitle = String(title || '').trim() || t('canvasTodoDefaultTitle');
    updateCanvasTodo(id, { title: nextTitle });
  }, [t, updateCanvasTodo]);

  const updateCanvasTodoPlanText = useCallback((id, planText) => {
    updateCanvasTodo(id, { planText: normalizeCanvasTodoPlanText(planText) });
  }, [updateCanvasTodo]);

  const toggleCanvasTodoAutoSync = useCallback((id, autoSync) => {
    updateCanvasTodo(id, { autoSync: Boolean(autoSync) });
  }, [updateCanvasTodo]);

  const toggleCanvasTodoPinned = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
    setActiveCanvasConnectionId(null);
    updateCanvasTodosForKey(canvasKey, (currentTodos) => currentTodos.map((todo) => (
      todo.id === id ? normalizeCanvasTodo({ ...todo, pinned: !todo.pinned }) : todo
    )));
  }, [updateCanvasTodosForKey]);

  const deleteCanvasTodo = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId((current) => (current === id ? null : current));
    updateCanvasTodosForKey(canvasKey, (currentTodos) => currentTodos.filter((todo) => todo.id !== id));
  }, [updateCanvasTodosForKey]);

  const addCanvasTodoItem = useCallback((todoId, text) => {
    const trimmedText = String(text || '').trim();
    if (!trimmedText) {
      return;
    }

    const now = Date.now();
    updateCanvasTodoItems(todoId, (items) => [
      ...items,
      {
        id: createLocalId('canvas-todo-item'),
        text: trimmedText,
        status: 'todo',
        done: false,
        source: 'manual',
        createdAt: now,
        updatedAt: now
      }
    ]);
  }, [updateCanvasTodoItems]);

  const updateCanvasTodoItemDone = useCallback((todoId, itemId, done) => {
    const now = Date.now();
    const nextStatus = done ? 'done' : 'todo';
    updateCanvasTodoItems(todoId, (items) => items.map((item) => (
      item.id === itemId
        ? { ...item, status: nextStatus, done: Boolean(done), source: item.source || 'manual', updatedAt: now }
        : item
    )));
  }, [updateCanvasTodoItems]);

  const updateCanvasTodoItemText = useCallback((todoId, itemId, text) => {
    const now = Date.now();
    updateCanvasTodoItems(todoId, (items) => items.map((item) => (
      item.id === itemId
        ? { ...item, text: String(text || ''), source: item.source || 'manual', updatedAt: now }
        : item
    )));
  }, [updateCanvasTodoItems]);

  const removeCanvasTodoItem = useCallback((todoId, itemId) => {
    updateCanvasTodoItems(todoId, (items) => items.filter((item) => item.id !== itemId));
  }, [updateCanvasTodoItems]);

  const selectCanvasConnection = useCallback((id) => {
    setActiveCanvasConnectionId(id);
    setActiveId(null);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
  }, []);

  const deleteCanvasConnection = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    updateCanvasConnectionsForKey(canvasKey, (currentConnections) => (
      currentConnections.filter((connection) => connection.id !== id)
    ));
    setActiveCanvasConnectionId((current) => (current === id ? null : current));
    showToast(t('canvasConnectionRemoved'));
  }, [showToast, t, updateCanvasConnectionsForKey]);

  const connectCanvasSessions = useCallback((fromId, toId) => {
    const sourceId = String(fromId || '').trim();
    const targetId = String(toId || '').trim();
    if (!sourceId || !targetId || sourceId === targetId) {
      setPendingConnectionSourceId('');
      showToast(t('canvasConnectionCancel'));
      return;
    }

    const currentWorkspace = workspaceRef.current;
    const canvasKey = getWorkspaceCanvasKey(currentWorkspace);
    const currentConnections = getWorkspaceCanvasConnections(currentWorkspace, canvasKey);
    const pairKey = getCanvasConnectionPairKey(sourceId, targetId);
    const existingConnection = currentConnections.find((connection) => (
      getCanvasConnectionPairKey(connection.fromId, connection.toId) === pairKey
    ));

    if (existingConnection) {
      updateCanvasConnectionsForKey(canvasKey, (connections) => (
        connections.filter((connection) => connection.id !== existingConnection.id)
      ));
      setActiveCanvasConnectionId(null);
      showToast(t('canvasConnectionRemoved'));
      return;
    }

    const nextConnection = {
      id: createLocalId('canvas-connection'),
      fromId: sourceId,
      toId: targetId,
      createdAt: Date.now()
    };
    updateCanvasConnectionsForKey(canvasKey, (connections) => [...connections, nextConnection]);
    setActiveCanvasConnectionId(nextConnection.id);
    setActiveId(null);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    showToast(t('canvasConnectionCreated'));
  }, [showToast, t, updateCanvasConnectionsForKey]);

  const handleSessionConnectionPortClick = useCallback((panelId) => {
    if (connectionPortClickSuppressedRef.current) {
      return;
    }

    const normalizedPanelId = String(panelId || '').trim();
    const panel = panelsRef.current.find((item) => item.id === normalizedPanelId);
    if (!panel || !isPanelVisibleInWorkspace(panel, workspaceRef.current)) {
      return;
    }

    setPendingCanvasFrame(false);
    setConnectionMode(true);
    setActiveCanvasConnectionId(null);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setActiveId(panel.id);

    if (!pendingConnectionSourceId) {
      setPendingConnectionSourceId(panel.id);
      showToast(t('canvasConnectionStart'));
      return;
    }

    if (pendingConnectionSourceId === panel.id) {
      setPendingConnectionSourceId('');
      showToast(t('canvasConnectionCancel'));
      return;
    }

    connectCanvasSessions(pendingConnectionSourceId, panel.id);
    setPendingConnectionSourceId('');
  }, [connectCanvasSessions, pendingConnectionSourceId, showToast, t]);

  const handleSessionConnectionPortPointerDown = useCallback((event, panelId) => {
    if (event.button !== 0) {
      return;
    }

    const normalizedPanelId = String(panelId || '').trim();
    const panel = panelsRef.current.find((item) => item.id === normalizedPanelId);
    if (!panel || !isPanelVisibleInWorkspace(panel, workspaceRef.current)) {
      return;
    }

    const startClientX = event.clientX;
    const startClientY = event.clientY;
    let dragging = false;

    bindPointerSession((moveEvent) => {
      const distance = Math.hypot(moveEvent.clientX - startClientX, moveEvent.clientY - startClientY);
      if (!dragging && distance >= connectionPortDragThreshold) {
        dragging = true;
        connectionPortClickSuppressedRef.current = true;
        setPendingCanvasFrame(false);
        setConnectionMode(true);
        setActiveCanvasConnectionId(null);
        setActiveCanvasFrameId(null);
        setActiveCanvasTodoId(null);
        setActiveId(panel.id);
        setPendingConnectionSourceId(panel.id);
        if (pendingConnectionSourceId !== panel.id) {
          showToast(t('canvasConnectionStart'));
        }
      }

      if (!dragging) {
        return;
      }

      setCanvasConnectionPreview({
        sourceId: panel.id,
        point: clientPointToCanvas(moveEvent.clientX, moveEvent.clientY)
      });
    }, (endEvent) => {
      if (!dragging) {
        return;
      }

      setCanvasConnectionPreview(null);
      window.setTimeout(() => {
        connectionPortClickSuppressedRef.current = false;
      }, 0);

      const targetId = getPanelIdFromEventTarget(endEvent?.target);
      if (targetId && targetId !== panel.id) {
        connectCanvasSessions(panel.id, targetId);
        setPendingConnectionSourceId('');
        return;
      }

      setPendingConnectionSourceId(panel.id);
    });
  }, [clientPointToCanvas, connectCanvasSessions, pendingConnectionSourceId, showToast, t]);

  const toggleCanvasConnectionMode = useCallback(() => {
    const nextMode = !connectionMode;
    setConnectionMode(nextMode);
    if (nextMode) {
      setPendingCanvasFrame(false);
      showToast(t('canvasConnectHint'));
      return;
    }

    setCanvasConnectionPreview(null);
    setPendingConnectionSourceId('');
  }, [connectionMode, showToast, t]);

  const createTerminal = useCallback(async (slot = {}) => {
    const center = viewportCenterOnCanvas();
    const width = Number.isFinite(slot.width) ? slot.width : 640;
    const height = Number.isFinite(slot.height) ? slot.height : 380;
    const x = Number.isFinite(slot.x) ? slot.x : center.x - width / 2;
    const y = Number.isFinite(slot.y) ? slot.y : center.y - height / 2;
    const projectId = Object.prototype.hasOwnProperty.call(slot, 'projectId')
      ? slot.projectId || null
      : null;
    const terminalCwd = Object.prototype.hasOwnProperty.call(slot, 'cwd')
      ? slot.cwd
      : cwdRef.current;
    const hasExplicitInitialCommand = Object.prototype.hasOwnProperty.call(slot, 'initialCommand');
    const cliProvider = resolveCliProvider(slot.cliProviderId, slot.initialCommand);
    const cliProviderId = cliProvider?.id || defaultCliProviderId;
    const targetType = slot.targetType === 'project'
      ? 'project'
      : (projectId ? 'project' : 'directory');
    const launchCommand = getCliLaunchCommand(cliProvider, targetType);
    const presetInitialCommand = !hasExplicitInitialCommand && slot.useCommandPreset === true && cliProviderId === 'shell'
      ? normalizeCommandPresetCommandInput(activeCommandPresetRef.current?.command)
      : '';
    const initialCommand = hasExplicitInitialCommand
      ? slot.initialCommand
      : (launchCommand || presetInitialCommand);
    const title = slot.title || `${getCliProviderTitleBase(cliProvider, language)} ${getVisiblePanels().length + 1}`;

    const meta = await bridge.createTerminal({
      title,
      cwd: terminalCwd,
      cols: 100,
      rows: 28,
      initialCommand,
      cliProviderId
    });

    nextZIndex.current += 1;
    const resolvedCliProvider = resolveCliProvider(meta.cliProviderId || cliProviderId, meta.initialCommand || initialCommand);
    const panel = {
      id: meta.id,
      projectId,
      title: meta.title,
      cwd: meta.cwd,
      backend: meta.backend,
      cliProviderId: resolvedCliProvider?.id || cliProviderId,
      codexSession: Boolean(meta.codexSession || resolvedCliProvider?.id === 'codex'),
      codexModel: meta.codexModel || '',
      codexProviderName: meta.codexProviderName || '',
      contextWindowTokens: Number.isFinite(meta.contextWindowTokens) ? meta.contextWindowTokens : null,
      contextWindowLabel: meta.contextWindowLabel || '',
      initialCommand: meta.initialCommand,
      agentId: String(slot.agentId || '').trim(),
      agentName: String(slot.agentName || '').trim(),
      agentTask: String(slot.agentTask || '').trim(),
      createdAt: Number.isFinite(meta.createdAt) ? meta.createdAt : Date.now(),
      lastActivityAt: Number.isFinite(meta.createdAt) ? meta.createdAt : Date.now(),
      x,
      y,
      width,
      height,
      zIndex: nextZIndex.current,
      minimized: false,
      groupId: null,
      status: 'running',
      tag: normalizeSessionTag(slot.tag)
    };

    setPanels((current) => [...current, panel]);
    setActiveId(meta.id);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setActiveCanvasConnectionId(null);
    window.requestAnimationFrame(() => focusTerminalInstance(meta.id));
    return panel;
  }, [focusTerminalInstance, getVisiblePanels, language, viewportCenterOnCanvas]);

  const createAgentPlanTodoForPanel = useCallback((panel, agent, taskDescription) => {
    if (!panel?.id) {
      return null;
    }

    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    const todoId = createLocalId('canvas-todo');
    const agentName = String(agent?.name || panel.title || 'Agent').trim();
    const task = String(taskDescription || '').trim();
    const todo = normalizeCanvasTodo({
      id: todoId,
      title: t('agentPlanTodoTitle', { name: agentName }),
      pinned: false,
      linkedPanelId: panel.id,
      linkedPanelTitle: panel.title || agentName,
      source: 'agent',
      agentId: String(agent?.id || '').trim(),
      agentName,
      autoSync: true,
      followPanel: true,
      x: Math.round((Number.isFinite(panel.x) ? panel.x : 0) + (Number.isFinite(panel.width) ? panel.width : 640) + agentPlanTodoGap),
      y: Math.round(Number.isFinite(panel.y) ? panel.y : 0),
      width: agentPlanTodoDefaultWidth,
      height: agentPlanTodoDefaultHeight,
      planText: task ? `Task:\n${task}` : '',
      items: []
    });

    updateCanvasTodosForKey(canvasKey, (currentTodos) => [...currentTodos, todo]);
    return todo;
  }, [t, updateCanvasTodosForKey]);

  const getCurrentSessionLaunchContext = useCallback((requestedCwd = '') => {
    const fallbackCwd = String(cwdRef.current || '').trim()
      || defaultCwd
      || '';

    return resolveWorkspaceLaunchContext(activeProject, requestedCwd, fallbackCwd);
  }, [activeProject, defaultCwd]);

  const runAgentTask = useCallback((agent, taskDescription, options = {}) => {
    const normalizedAgent = normalizeAgentRecord(agent);
    const task = String(taskDescription || '').trim();
    if (!normalizedAgent) {
      showToast(t('agentRequired'));
      return Promise.resolve(false);
    }
    if (!task) {
      showToast(t('agentTaskRequired'));
      return Promise.resolve(false);
    }

    const run = async () => {
      const cliProvider = resolveCliProvider(normalizedAgent.cliProviderId || launchCliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;
      const launchContext = getCurrentSessionLaunchContext(options.cwd);
      const prompt = buildAgentTaskPrompt(normalizedAgent, task);

      if (
        launchContext.cwd
        && launchContext.cwd !== cwdRef.current
        && shouldPromoteWorkspacePath(launchContext.cwd, launchContext.projectId)
      ) {
        setCwd(launchContext.cwd);
      }

      setLaunchCliProviderId(cliProviderId);
      const panel = await createTerminal({
        ...getCenteredTerminalSlot(workspaceRef.current, 700, 420),
        ...launchContext,
        title: normalizedAgent.name,
        cliProviderId,
        agentId: normalizedAgent.id,
        agentName: normalizedAgent.name,
        agentTask: task
      });
      createAgentPlanTodoForPanel(panel, normalizedAgent, task);

      window.setTimeout(() => {
        touchPanelActivity(panel.id);
        submitTerminalTextPayload(panel.id, prompt);
      }, agentTaskSubmitDelayMs);

      if (options.showStartedToast !== false) {
        showToast(t('agentStarted', { name: normalizedAgent.name }));
      }
      return true;
    };

    return run().catch((error) => {
      showToast(error.message);
      return false;
    });
  }, [
    createTerminal,
    createAgentPlanTodoForPanel,
    getCenteredTerminalSlot,
    getCurrentSessionLaunchContext,
    launchCliProviderId,
    shouldPromoteWorkspacePath,
    showToast,
    submitTerminalTextPayload,
    t,
    touchPanelActivity
  ]);

  const submitDiffReview = useCallback(async ({ agent, comments, snapshot }) => {
    const task = buildInteractiveCodeReviewTask({ comments, snapshot });
    const reviewCwd = String(snapshot?.repositoryRoot || snapshot?.cwd || diffReviewCwd || currentWorkspacePath || '').trim();
    setDiffReviewOpen(false);

    const started = await runAgentTask(agent, task, {
      cwd: reviewCwd,
      showStartedToast: false
    });

    if (started) {
      showToast(t('diffReviewQueued', { name: agent?.name || agent?.id || 'Agent' }));
    }
  }, [currentWorkspacePath, diffReviewCwd, runAgentTask, showToast, t]);

  const runAutopilot = useCallback(async (autopilot, options = {}) => {
    const normalizedAutopilot = normalizeAutopilotRecord(autopilot);
    if (!normalizedAutopilot) {
      showToast(t('autopilotRequired'));
      return false;
    }
    if (autopilotRunningIdsRef.current.has(normalizedAutopilot.id)) {
      return false;
    }

    const agent = agentsRef.current.find((item) => item.id === normalizedAutopilot.agentId) || null;
    if (!agent) {
      showToast(t('autopilotMissingAgent', { name: normalizedAutopilot.name }));
      return false;
    }
    if (!String(normalizedAutopilot.runbook || '').trim()) {
      showToast(t('autopilotRunbookRequired'));
      return false;
    }

    autopilotRunningIdsRef.current.add(normalizedAutopilot.id);
    try {
      const started = await runAgentTask(agent, buildAutopilotRunbookTask(normalizedAutopilot), {
        showStartedToast: false
      });
      if (!started) {
        return false;
      }

      const now = Date.now();
      setAutopilots((current) => current.map((record) => (
        record.id === normalizedAutopilot.id
          ? { ...record, lastRunAt: now }
          : record
      )));
      showToast(t('autopilotStarted', { name: normalizedAutopilot.name }));
      return true;
    } finally {
      autopilotRunningIdsRef.current.delete(normalizedAutopilot.id);
    }
  }, [runAgentTask, showToast, t]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const schedulerStartedAt = autopilotSchedulerStartedAtRef.current;

      for (const autopilot of autopilotsRef.current) {
        const record = normalizeAutopilotRecord(autopilot);
        if (!record?.enabled || autopilotRunningIdsRef.current.has(record.id)) {
          continue;
        }

        const baseline = Math.max(
          record.lastRunAt || 0,
          record.createdAt || 0,
          record.updatedAt || 0,
          schedulerStartedAt
        );
        const nextRunAt = getAutopilotNextRunAt(record, baseline);
        if (nextRunAt && nextRunAt <= now) {
          void runAutopilot(record, { scheduled: true });
        }
      }
    };

    const timer = window.setInterval(tick, autopilotSchedulerIntervalMs);
    return () => window.clearInterval(timer);
  }, [runAutopilot]);

  const dispatchCommandDockTasks = useCallback((options = {}) => {
    if (commandDockTaskDispatching) {
      return false;
    }

    const hasExplicitValue = options
      && typeof options === 'object'
      && !options.nativeEvent
      && Object.prototype.hasOwnProperty.call(options, 'value');
    const rawTasksValue = trimTrailingLineBreaks(
      hasExplicitValue ? options.value : commandDockInputRef.current?.value ?? commandDockValue
    );
    const tasks = parseCommandDockDispatchTasks(rawTasksValue);
    if (tasks.length === 0) {
      showToast(t('floatingComposerDispatchEmpty'));
      return false;
    }

    const run = async () => {
      setCommandDockTaskDispatching(true);
      closeCommandDockSkillMention();

      try {
        const dispatchRuntimeNow = Date.now();
        const targetPanel = commandDockPanels.find((panel) => panel.id === commandDockTargetId)
          || commandDockPanels[0]
          || null;
        const cliProviderId = targetPanel?.cliProviderId || launchCliProviderId;
        const cliProvider = resolveCliProvider(cliProviderId);
        const launchContext = getCurrentSessionLaunchContext();
        const baseSlot = getCenteredTerminalSlot(workspaceRef.current, 700, 420);
        const shouldReuseDispatchTargets = commandDockDispatchMode === 'reuse';
        const idlePanels = shouldReuseDispatchTargets
          ? commandDockPanels.filter((panel) => (
            canPanelReceiveInput(panel) &&
            getPanelExecutionState(panel, dispatchRuntimeNow) === 'idle'
          ))
          : [];
        let reused = 0;
        let created = 0;
        const dispatchTargets = [];

        const submitTaskToPanel = (panel, task, delay = 0) => {
          const submit = () => {
            touchPanelActivity(panel.id);
            submitTerminalTextPayload(panel.id, task);
            flashCommandDockDispatchTargets(panel.id);
          };

          if (delay > 0) {
            window.setTimeout(submit, delay);
            return;
          }

          submit();
        };

        for (const task of tasks) {
          const idlePanel = shouldReuseDispatchTargets ? idlePanels.shift() : null;
          if (idlePanel) {
            dispatchTargets.push(idlePanel);
            submitTaskToPanel(idlePanel, task);
            reused += 1;
            continue;
          }

          const newPanel = await createTerminal({
            ...baseSlot,
            ...launchContext,
            x: Math.round(baseSlot.x + created * 34),
            y: Math.round(baseSlot.y + created * 34),
            title: formatCommandDockTaskTitle(
              task,
              `${getCliProviderTitleBase(cliProvider, language)} ${created + 1}`
            ),
            cliProviderId
          });
          created += 1;
          dispatchTargets.push(newPanel);
          submitTaskToPanel(newPanel, task, commandDockTaskSubmitDelayMs);
        }

        centerCanvasOnCommandDockTarget(dispatchTargets[0]);
        rememberCommandDockHistory(rawTasksValue);
        setCommandDockValue('');
        const dispatchDoneMessage = t('floatingComposerDispatchDone', {
          count: tasks.length,
          reused,
          created,
          targets: formatDispatchTargetList(dispatchTargets, language)
        });
        showToast(reused > 0
          ? `${dispatchDoneMessage} ${t('floatingComposerDispatchReuseEnterHint')}`
          : dispatchDoneMessage);
        window.requestAnimationFrame(() => {
          resizeCommandDockInput();
        });
        focusCommandDockTerminal(dispatchTargets[0]);
        return true;
      } catch (error) {
        showToast(t('floatingComposerDispatchFailed', { message: error.message }));
        return false;
      } finally {
        setCommandDockTaskDispatching(false);
      }
    };

    void run();
    return true;
  }, [
    closeCommandDockSkillMention,
    centerCanvasOnCommandDockTarget,
    commandDockDispatchMode,
    commandDockPanels,
    commandDockTargetId,
    commandDockTaskDispatching,
    commandDockValue,
    createTerminal,
    flashCommandDockDispatchTargets,
    focusCommandDockTerminal,
    getCenteredTerminalSlot,
    getCurrentSessionLaunchContext,
    language,
    launchCliProviderId,
    rememberCommandDockHistory,
    resizeCommandDockInput,
    showToast,
    submitTerminalTextPayload,
    t,
    touchPanelActivity
  ]);
  commandDockDispatchTasksRef.current = dispatchCommandDockTasks;

  const createWorkspaceCommandLineFromConfig = useCallback((config = {}) => {
    const run = async () => {
      const requestedCwd = String(config.cwd || '').trim();
      const launchContext = getCurrentSessionLaunchContext(requestedCwd);
      const nextCwd = requestedCwd || launchContext.cwd;
      const cliProvider = resolveCliProvider(config.cliProviderId || launchCliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;
      const hasExplicitInitialCommand = Object.prototype.hasOwnProperty.call(config, 'initialCommand');
      const terminalSlot = {
        projectId: Object.prototype.hasOwnProperty.call(config, 'projectId')
          ? config.projectId
          : launchContext.projectId,
        cwd: nextCwd,
        cliProviderId,
        targetType: launchContext.targetType,
        useCommandPreset: true
      };

      if (hasExplicitInitialCommand) {
        terminalSlot.initialCommand = normalizeCommandPresetCommandInput(config.initialCommand);
      }

      setLaunchCliProviderId(cliProviderId);

      await createTerminal(terminalSlot);
    };

    run().catch((error) => showToast(error.message));
  }, [createTerminal, getCurrentSessionLaunchContext, launchCliProviderId, showToast]);

  const createWorkspaceCommandLine = useCallback((cliProviderId) => {
    const nextCliProviderId = typeof cliProviderId === 'string' ? cliProviderId : 'shell';
    createWorkspaceCommandLineFromConfig(
      { cliProviderId: nextCliProviderId }
    );
  }, [createWorkspaceCommandLineFromConfig]);

  const closeTerminal = useCallback(async (id) => {
    try {
      await bridge.killTerminal(id);
    } catch {
      // It may already be gone.
    }

    setPanels((current) => current.filter((panel) => panel.id !== id));
    commitWorkspace((currentWorkspace) => withoutWorkspaceCanvasConnectionsForSession(currentWorkspace, id));
    setSelectedEndpointIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (activeIdRef.current === id) {
      setActiveId(null);
    }
    setPendingConnectionSourceId((current) => (current === id ? '' : current));
    setActiveCanvasConnectionId(null);
  }, [commitWorkspace]);

  const restartTerminal = useCallback(async (id) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    if (!panel) {
      return;
    }

    await closeTerminal(id);
    await createTerminal({
      title: panel.title,
      projectId: null,
      cwd: panel.cwd,
      cliProviderId: panel.cliProviderId,
      initialCommand: Object.prototype.hasOwnProperty.call(panel, 'initialCommand')
        ? panel.initialCommand
        : getCliLaunchCommand(getPanelCliProvider(panel), 'directory'),
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      tag: getPanelSessionTag(panel)
    });
  }, [closeTerminal, createTerminal]);

  const updatePanel = useCallback((id, patch) => {
    const previousPanel = panelsRef.current.find((panel) => panel.id === id);
    const nextX = Number.isFinite(patch?.x) ? patch.x : previousPanel?.x;
    const nextY = Number.isFinite(patch?.y) ? patch.y : previousPanel?.y;
    const nextWidth = Number.isFinite(patch?.width) ? patch.width : previousPanel?.width;
    const deltaTodoX = Number.isFinite(previousPanel?.x) && Number.isFinite(nextX)
      ? nextX - previousPanel.x
      : 0;
    const deltaTodoY = Number.isFinite(previousPanel?.y) && Number.isFinite(nextY)
      ? nextY - previousPanel.y
      : 0;
    const deltaWidth = Number.isFinite(previousPanel?.width) && Number.isFinite(nextWidth)
      ? nextWidth - previousPanel.width
      : 0;

    if (deltaTodoX || deltaTodoY || deltaWidth) {
      updateCanvasTodosForLinkedPanel(id, (todo) => (
        todo.followPanel
          ? normalizeCanvasTodo({
              ...todo,
              x: Math.round(todo.x + deltaTodoX + deltaWidth),
              y: Math.round(todo.y + deltaTodoY)
            })
          : todo
      ));
    }

    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, ...patch } : panel
    )));
  }, [updateCanvasTodosForLinkedPanel]);

  const updateTerminalMeta = useCallback((id, patch) => {
    if (typeof bridge.updateTerminalMeta !== 'function') {
      return;
    }

    bridge.updateTerminalMeta(id, patch).catch(() => {
      // The renderer state is authoritative for live UI; stale backend sessions are ignored.
    });
  }, []);

  const changePanelTag = useCallback((id, tag) => {
    updatePanel(id, { tag: normalizeSessionTag(tag) });
  }, [updatePanel]);

  const toggleEndpointSelection = useCallback((id) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    if (!panel?.minimized || !isPanelVisibleInWorkspace(panel, workspaceRef.current)) {
      return;
    }

    setSelectedEndpointIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const minimizePanel = useCallback((id) => {
    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, minimized: true } : panel
    )));
    if (activeIdRef.current === id) {
      setActiveId(null);
    }
  }, []);

  const expandPanel = useCallback((id) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    const storedGroup = panel?.groupId
      ? endpointGroupsRef.current.find((item) => item.id === panel.groupId)
      : null;
    const group = storedGroup?.canvasKey === getWorkspaceCanvasKey(workspaceRef.current) ? storedGroup : null;
    const groupMembers = group
      ? panelsRef.current.filter((item) => item.groupId === group.id && item.minimized)
      : [];
    const groupIndex = Math.max(0, groupMembers.findIndex((item) => item.id === id));
    const placement = group
      ? {
          x: Math.round(group.x + group.width + 24),
          y: Math.round(group.y + groupIndex * 36)
        }
      : {};

    nextZIndex.current += 1;
    setActiveId(id);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setActiveCanvasConnectionId(null);
    setPanels((current) => current.map((panel) => (
      panel.id === id
        ? {
            ...panel,
            ...placement,
            groupId: null,
            minimized: false,
            zIndex: nextZIndex.current
          }
        : panel
    )));
    setSelectedEndpointIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    window.requestAnimationFrame(() => {
      const instance = terminalInstances.current.get(id);
      instance?.fit?.();
      focusTerminalInstance(id);
    });
  }, [focusTerminalInstance]);

  const commitPanelTitle = useCallback((id, title) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    const nextTitle = title.trim() || getPanelFallbackTitle(panel, language);
    updatePanel(id, { title: nextTitle });
    updateTerminalMeta(id, { title: nextTitle });
  }, [language, updatePanel, updateTerminalMeta]);

  const switchPanelModel = useCallback((id, value) => {
    const model = String(value || '').trim();
    if (!model) {
      showToast(t('modelRequired'));
      return;
    }

    const panel = panelsRef.current.find((item) => item.id === id);
    const command = getPanelModelSwitchCommand(panel, model);
    if (!panel || !command || !canPanelReceiveInput(panel)) {
      showToast(t('modelSwitchUnavailable'));
      return;
    }

    bridge.writeTerminal(id, command);
    touchPanelActivity(id);
    updatePanel(id, { codexModel: model });
    updateTerminalMeta(id, { codexModel: model });
    showToast(t('modelSwitched', { model }));
  }, [showToast, t, touchPanelActivity, updatePanel, updateTerminalMeta]);

  const activateEndpointGroup = useCallback((id) => {
    nextZIndex.current += 1;
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setActiveCanvasConnectionId(null);
    setEndpointGroups((current) => current.map((group) => (
      group.id === id ? { ...group, zIndex: nextZIndex.current } : group
    )));
  }, []);

  const updateEndpointGroup = useCallback((id, patch) => {
    setEndpointGroups((current) => current.map((group) => (
      group.id === id ? { ...group, ...patch } : group
    )));
  }, []);

  const ungroupEndpointGroup = useCallback((id) => {
    const group = endpointGroupsRef.current.find((item) => item.id === id);
    if (!group) {
      return;
    }

    const members = panelsRef.current.filter((panel) => panel.groupId === id && panel.minimized);
    setPanels((current) => current.map((panel) => {
      const index = members.findIndex((member) => member.id === panel.id);
      if (index < 0) {
        return panel;
      }

      return {
        ...panel,
        groupId: null,
        x: Math.round(group.x + 12),
        y: Math.round(group.y + 52 + index * (endpointHeight + 8))
      };
    }));
    setEndpointGroups((current) => current.filter((item) => item.id !== id));
  }, []);

  const getEndpointVisualRect = useCallback((panel) => {
    const group = panel.groupId
      ? endpointGroupsRef.current.find((item) => item.id === panel.groupId)
      : null;

    if (group && group.canvasKey === getWorkspaceCanvasKey(workspaceRef.current)) {
      const members = panelsRef.current.filter((item) => (
        item.groupId === group.id &&
        item.minimized &&
        isPanelVisibleInWorkspace(item, workspaceRef.current)
      ));
      const index = Math.max(0, members.findIndex((item) => item.id === panel.id));
      return {
        x: group.x + 14,
        y: group.y + 58 + index * 42,
        width: group.width - 28,
        height: 36
      };
    }

    return {
      x: panel.x,
      y: panel.y,
      width: endpointWidth,
      height: endpointHeight
    };
  }, []);

  const groupEndpoints = useCallback(() => {
    const currentWorkspace = workspaceRef.current;
    const currentPanels = panelsRef.current;
    const visibleEndpoints = currentPanels.filter((panel) => (
      panel.minimized &&
      isPanelVisibleInWorkspace(panel, currentWorkspace)
    ));
    const selectedEndpoints = visibleEndpoints.filter((panel) => selectedEndpointIds.has(panel.id));
    const candidates = selectedEndpoints.length > 0 ? selectedEndpoints : visibleEndpoints;

    if (candidates.length < 2) {
      showToast(t('groupEndpointsUnavailable'));
      return;
    }

    const rects = candidates.map((panel) => getEndpointVisualRect(panel));
    const minX = Math.min(...rects.map((rect) => rect.x));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
    const groupId = createLocalId('endpoint-group');
    const memberIds = new Set(candidates.map((panel) => panel.id));
    const nextGroup = {
      id: groupId,
      title: `${t('endpointGroup')} ${endpointGroupsRef.current.length + 1}`,
      canvasKey: getWorkspaceCanvasKey(currentWorkspace),
      x: Math.round(minX - 12),
      y: Math.round(minY - 48),
      width: Math.round(clamp(maxX - minX + 24, 340, 520)),
      zIndex: nextZIndex.current + 1
    };

    nextZIndex.current += 1;
    setPanels((current) => current.map((panel) => (
      memberIds.has(panel.id)
        ? { ...panel, groupId, minimized: true }
        : panel
    )));
    setEndpointGroups((current) => {
      const remainingGroups = current.filter((group) => (
        currentPanels.some((panel) => panel.groupId === group.id && !memberIds.has(panel.id))
      ));
      return [...remainingGroups, nextGroup];
    });
    setSelectedEndpointIds(new Set());
  }, [getEndpointVisualRect, selectedEndpointIds, showToast, t]);

  const startCanvasArrangeAnimation = useCallback((records, positions) => {
    const animations = {};
    const orderedRecords = [...records].sort((left, right) => (
      (left.y - right.y) || (left.x - right.x) || left.title.localeCompare(right.title)
    ));
    const orderIndex = new Map(orderedRecords.map((panel, index) => [panel.id, index]));

    records.forEach((panel) => {
      const nextLayout = positions.get(panel.id);
      if (!nextLayout || (panel.groupId && panel.minimized)) {
        return;
      }

      const fromRect = {
        x: panel.x,
        y: panel.y,
        width: panel.minimized ? endpointWidth : panel.width,
        height: panel.minimized ? endpointHeight : panel.height
      };
      const toRect = {
        x: nextLayout.x,
        y: nextLayout.y,
        width: panel.minimized ? endpointWidth : nextLayout.width,
        height: panel.minimized ? endpointHeight : nextLayout.height
      };
      const dx = Math.round(fromRect.x - toRect.x);
      const dy = Math.round(fromRect.y - toRect.y);
      const scaleX = toRect.width > 0 ? clamp(fromRect.width / toRect.width, 0.25, 4) : 1;
      const scaleY = toRect.height > 0 ? clamp(fromRect.height / toRect.height, 0.25, 4) : 1;
      const changed = Math.abs(dx) > 0
        || Math.abs(dy) > 0
        || Math.abs(scaleX - 1) > 0.01
        || Math.abs(scaleY - 1) > 0.01;

      if (!changed) {
        return;
      }

      animations[panel.id] = {
        dx,
        dy,
        scaleX: Number(scaleX.toFixed(4)),
        scaleY: Number(scaleY.toFixed(4)),
        delay: Math.min((orderIndex.get(panel.id) || 0) * 24, canvasArrangeMaxStaggerMs)
      };
    });

    window.clearTimeout(canvasArrangeTimerRef.current);

    if (Object.keys(animations).length === 0) {
      setCanvasArrangeAnimations({});
      setCanvasArrangeActive(false);
      return;
    }

    const longestDelay = Math.max(...Object.values(animations).map((item) => item.delay || 0));
    setCanvasArrangeAnimations(animations);
    setCanvasArrangeActive(true);
    canvasArrangeTimerRef.current = window.setTimeout(() => {
      setCanvasArrangeAnimations({});
      setCanvasArrangeActive(false);
      canvasArrangeTimerRef.current = null;
    }, canvasArrangeDurationMs + longestDelay + 160);
  }, []);

  const collectIdleCommandLines = useCallback(() => {
    const currentWorkspace = workspaceRef.current;
    const canvasKey = getWorkspaceCanvasKey(currentWorkspace);
    const currentPanels = panelsRef.current;
    const now = Date.now();
    const eligiblePanels = currentPanels.filter((panel) => (
      isPanelVisibleInWorkspace(panel, currentWorkspace) &&
      getPanelExecutionState(panel, now) === 'idle'
    ));

    if (eligiblePanels.length === 0) {
      showToast(t('collectIdleCmdUnavailable'));
      return;
    }

    const getCollectVisualRect = (panel) => {
      if (panel.minimized) {
        return getEndpointVisualRect(panel);
      }

      return {
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height
      };
    };
    const visualRects = new Map(eligiblePanels.map((panel) => [panel.id, getCollectVisualRect(panel)]));
    const locale = language === 'en' ? 'en-US' : 'zh-CN';
    const candidates = [...eligiblePanels].sort((left, right) => {
      const leftRect = visualRects.get(left.id) || getCollectVisualRect(left);
      const rightRect = visualRects.get(right.id) || getCollectVisualRect(right);
      return (leftRect.y - rightRect.y) ||
        (leftRect.x - rightRect.x) ||
        ((left.createdAt || 0) - (right.createdAt || 0)) ||
        String(left.title || '').localeCompare(String(right.title || ''), locale);
    });
    const memberIds = new Set(candidates.map((panel) => panel.id));
    const currentGroup = endpointGroupsRef.current.find((group) => (
      group.canvasKey === canvasKey && group.kind === idleCommandLineGroupKind
    ));
    const groupId = currentGroup?.id || createLocalId('endpoint-group');

    if (
      currentGroup &&
      candidates.every((panel) => panel.minimized && panel.groupId === currentGroup.id)
    ) {
      nextZIndex.current += 1;
      setEndpointGroups((current) => current.map((group) => (
        group.id === currentGroup.id ? { ...group, zIndex: nextZIndex.current } : group
      )));
      showToast(t('collectIdleCmdDone', { count: candidates.length }));
      return;
    }

    const existingTargetMembers = currentGroup
      ? currentPanels.filter((panel) => (
          panel.groupId === currentGroup.id &&
          panel.minimized &&
          !memberIds.has(panel.id) &&
          isPanelVisibleInWorkspace(panel, currentWorkspace)
        ))
      : [];
    const groupWidth = Math.round(clamp(currentGroup?.width || idleCommandLineGroupWidth, 340, 520));
    const finalMemberCount = existingTargetMembers.length + candidates.length;
    const groupHeight = Math.min(460, 58 + finalMemberCount * 42 + 12);
    const center = viewportCenterOnCanvas();
    const groupX = Math.round(Number.isFinite(currentGroup?.x)
      ? currentGroup.x
      : center.x - groupWidth / 2);
    const groupY = Math.round(Number.isFinite(currentGroup?.y)
      ? currentGroup.y
      : center.y - groupHeight / 2);
    const targetPositions = new Map(candidates.map((panel, index) => [panel.id, {
      x: groupX + 14,
      y: groupY + 58 + (existingTargetMembers.length + index) * 42,
      width: endpointWidth,
      height: endpointHeight
    }]));
    const orderIndex = new Map(candidates.map((panel, index) => [panel.id, index]));
    const animationRecords = candidates.map((panel) => {
      const rect = visualRects.get(panel.id) || getCollectVisualRect(panel);
      return {
        ...panel,
        groupId: null,
        x: Math.round(rect.x),
        y: Math.round(rect.y)
      };
    });
    const animationRecordById = new Map(animationRecords.map((record) => [record.id, record]));
    const groupZIndex = nextZIndex.current + 1;
    const panelZIndexBase = groupZIndex + 1;
    const nextGroup = {
      ...(currentGroup || {}),
      id: groupId,
      kind: idleCommandLineGroupKind,
      title: currentGroup?.title || t('idleCmdGroup'),
      canvasKey,
      x: groupX,
      y: groupY,
      width: groupWidth,
      zIndex: groupZIndex
    };

    nextZIndex.current += candidates.length + 1;
    window.clearTimeout(idleCommandCollectTimerRef.current);
    setActiveId((current) => (memberIds.has(current) ? null : current));
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setSelectedEndpointIds((current) => {
      if (![...memberIds].some((id) => current.has(id))) {
        return current;
      }

      const next = new Set(current);
      memberIds.forEach((id) => next.delete(id));
      return next;
    });
    setEndpointGroups((current) => current.filter((group) => (
      group.id === groupId ||
      currentPanels.some((panel) => panel.groupId === group.id && !memberIds.has(panel.id))
    )));
    setPanels((current) => current.map((panel) => {
      if (!memberIds.has(panel.id)) {
        return panel;
      }

      const record = animationRecordById.get(panel.id);
      return {
        ...panel,
        groupId: null,
        x: record?.x ?? panel.x,
        y: record?.y ?? panel.y,
        zIndex: panelZIndexBase + (orderIndex.get(panel.id) || 0)
      };
    }));

    window.requestAnimationFrame(() => {
      startCanvasArrangeAnimation(animationRecords, targetPositions);
      setPanels((current) => current.map((panel) => {
        const position = targetPositions.get(panel.id);
        if (!position) {
          return panel;
        }

        return {
          ...panel,
          groupId: null,
          minimized: true,
          x: position.x,
          y: position.y,
          zIndex: panelZIndexBase + (orderIndex.get(panel.id) || 0)
        };
      }));

      const longestDelay = Math.min(Math.max(candidates.length - 1, 0) * 24, canvasArrangeMaxStaggerMs);
      idleCommandCollectTimerRef.current = window.setTimeout(() => {
        setPanels((current) => current.map((panel) => (
          memberIds.has(panel.id)
            ? { ...panel, groupId, minimized: true }
            : panel
        )));
        setEndpointGroups((current) => [
          ...current.filter((group) => group.id !== groupId),
          nextGroup
        ]);
        showToast(t('collectIdleCmdDone', { count: candidates.length }));
        idleCommandCollectTimerRef.current = null;
      }, canvasArrangeDurationMs + longestDelay + 180);
    });
  }, [getEndpointVisualRect, language, showToast, startCanvasArrangeAnimation, t, viewportCenterOnCanvas]);

  const exportTerminal = useCallback(async (id, directory) => {
    try {
      const result = await bridge.exportTerminal(id, directory ? { directory } : {});
      showToast(t('sessionExported', { path: result.path }));
    } catch (error) {
      showToast(t('exportSessionFailed', { message: error.message }));
    }
  }, [showToast, t]);

  const exportTerminalCustom = useCallback(async (id) => {
    try {
      const directory = await bridge.chooseTerminalExportDirectory();
      if (!directory) {
        return;
      }

      await exportTerminal(id, directory);
    } catch (error) {
      showToast(t('exportSessionFailed', { message: error.message }));
    }
  }, [exportTerminal, showToast, t]);

  const toggleImageGeneration = useCallback(() => {
    setImageGenerationOpen((current) => {
      const next = !current;
      if (next) {
        setWorkspaceTreeOpen(false);
        setSessionReviewOpen(false);
      }
      return next;
    });
  }, []);

  const openImageGenerationSettings = useCallback(() => {
    openCodexSettings('imageApi');
  }, [openCodexSettings]);

  const toggleSessionReview = useCallback(() => {
    setSessionReviewOpen((current) => {
      const next = !current;
      if (next) {
        setWorkspaceTreeOpen(false);
        setImageGenerationOpen(false);
      }
      return next;
    });
  }, []);

  const focusSessionFromReview = useCallback((id) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    if (!panel) {
      return;
    }

    if (
      panel.cwd
      && panel.cwd !== cwdRef.current
      && shouldPromoteWorkspacePath(panel.cwd, panel.projectId)
    ) {
      setCwd(panel.cwd);
    }

    if (panel.minimized) {
      expandPanel(id);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          centerCanvasOnCommandDockTarget(id);
        });
      });
      return;
    }

    activatePanel(id);
    centerCanvasOnCommandDockTarget(id);
  }, [activatePanel, centerCanvasOnCommandDockTarget, expandPanel, shouldPromoteWorkspacePath]);

  const setCommandTargetFromReview = useCallback((id) => {
    setCommandDockTargetId(id);
    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }
    window.requestAnimationFrame(() => commandDockInputRef.current?.focus());
  }, [commandDockCollapsed]);

  const copySessionReviewSummary = useCallback(() => {
    const summaryRuntimeNow = Date.now();
    const text = buildSessionReviewSummaryText({
      panels: commandDockPanels,
      records: sessionReviewRecordsRef.current,
      runtimeNow: summaryRuntimeNow,
      language,
      t,
      getPanelProviderLabel: (panel, activeLanguage) => (
        getCliProviderBadgeLabel(getPanelCliProvider(panel), activeLanguage)
      ),
      getPanelState: getPanelExecutionState,
      getStateLabel: getExecutionStateLabel
    });
    if (writeClipboardText(text)) {
      showToast(t('sessionReviewCopied'));
    }
  }, [commandDockPanels, language, showToast, t]);

  const copySessionReviewRecord = useCallback((id) => {
    const summaryRuntimeNow = Date.now();
    const panel = commandDockPanels.find((item) => item.id === id)
      || panelsRef.current.find((item) => item.id === id);
    if (!panel) {
      return;
    }

    const text = buildSessionReviewSummaryText({
      panels: [panel],
      records: sessionReviewRecordsRef.current,
      runtimeNow: summaryRuntimeNow,
      language,
      t,
      getPanelProviderLabel: (item, activeLanguage) => (
        getCliProviderBadgeLabel(getPanelCliProvider(item), activeLanguage)
      ),
      getPanelState: getPanelExecutionState,
      getStateLabel: getExecutionStateLabel
    });
    if (writeClipboardText(text)) {
      showToast(t('sessionReviewCopied'));
    }
  }, [commandDockPanels, language, showToast, t]);

  const exportSessionReviewPanels = useCallback(async () => {
    let count = 0;
    try {
      for (const panel of commandDockPanels) {
        await bridge.exportTerminal(panel.id, {});
        count += 1;
      }
      showToast(t('sessionReviewExportedAll', { count }));
    } catch (error) {
      showToast(t('sessionReviewExportAllFailed', { message: error.message }));
    }
  }, [commandDockPanels, showToast, t]);

  const arrangeGrid = useCallback(() => {
    const records = getVisiblePanels();
    if (records.length === 0) {
      return;
    }

    const cols = Math.ceil(Math.sqrt(records.length));
    const width = 620;
    const height = 360;
    const gap = 28;
    const totalWidth = cols * width + (cols - 1) * gap;
    const rows = Math.ceil(records.length / cols);
    const totalHeight = rows * height + (rows - 1) * gap;
    const center = viewportCenterOnCanvas();
    const startX = Math.round(center.x - totalWidth / 2);
    const startY = Math.round(center.y - totalHeight / 2);
    const positions = new Map(records.map((panel, index) => [panel.id, {
      x: startX + (index % cols) * (width + gap),
      y: startY + Math.floor(index / cols) * (height + gap),
      width,
      height
    }]));

    startCanvasArrangeAnimation(records, positions);
    setPanels((current) => current.map((panel) => ({
      ...panel,
      ...(positions.get(panel.id) || {})
    })));
  }, [getVisiblePanels, startCanvasArrangeAnimation, viewportCenterOnCanvas]);

  const arrangeByTag = useCallback(() => {
    const records = getVisiblePanels()
      .filter((panel) => !(panel.groupId && panel.minimized));
    if (records.length === 0) {
      return;
    }

    if (!records.some((panel) => getPanelSessionTag(panel))) {
      showToast(t('arrangeByTagEmpty'));
    }

    const locale = language === 'en' ? 'en-US' : 'zh-CN';
    const groups = new Map();
    records.forEach((panel) => {
      const tag = getPanelSessionTag(panel);
      const key = tag || '';
      groups.set(key, [...(groups.get(key) || []), panel]);
    });

    const orderedTags = [...groups.keys()].sort((left, right) => {
      const rankDelta = getSessionTagOrder(left) - getSessionTagOrder(right);
      if (rankDelta !== 0) {
        return rankDelta;
      }

      return getSessionTagLabel(left, t).localeCompare(getSessionTagLabel(right, t), locale);
    });

    const width = 620;
    const height = 360;
    const gap = 28;
    const sectionGap = 68;
    const sections = orderedTags.map((tag) => {
      const items = [...(groups.get(tag) || [])].sort((left, right) => (
        (left.createdAt || 0) - (right.createdAt || 0) ||
        String(left.title || '').localeCompare(String(right.title || ''), locale)
      ));
      const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(items.length))));
      const rows = Math.ceil(items.length / columns);
      return {
        tag,
        items,
        columns,
        rows,
        width: columns * width + (columns - 1) * gap,
        height: rows * height + (rows - 1) * gap
      };
    });
    const totalWidth = sections.reduce((sum, section, index) => (
      sum + section.width + (index > 0 ? sectionGap : 0)
    ), 0);
    const totalHeight = Math.max(...sections.map((section) => section.height), height);
    const center = viewportCenterOnCanvas();
    const startX = Math.round(center.x - totalWidth / 2);
    const startY = Math.round(center.y - totalHeight / 2);
    const positions = new Map();
    let cursorX = startX;

    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        cursorX += sectionGap;
      }

      section.items.forEach((panel, index) => {
        positions.set(panel.id, {
          x: cursorX + (index % section.columns) * (width + gap),
          y: startY + Math.floor(index / section.columns) * (height + gap),
          width,
          height
        });
      });
      cursorX += section.width;
    });

    startCanvasArrangeAnimation(records, positions);
    setPanels((current) => current.map((panel) => ({
      ...panel,
      ...(positions.get(panel.id) || {})
    })));
  }, [getVisiblePanels, language, showToast, startCanvasArrangeAnimation, t, viewportCenterOnCanvas]);

  const createSessionGrid = useCallback(async (count = 4, config = {}) => {
    const sessionCount = parseGridSessionCount(count);
    if (!sessionCount) {
      return;
    }

    const cliProvider = resolveCliProvider(config.cliProviderId || launchCliProviderId);
    const cliProviderId = cliProvider?.id || defaultCliProviderId;
    const launchContext = getCurrentSessionLaunchContext();
    const canvasPoint = config?.canvasPoint;
    const center = canvasPoint
      && Number.isFinite(canvasPoint.x)
      && Number.isFinite(canvasPoint.y)
      ? canvasPoint
      : viewportCenterOnCanvas();
    const width = 620;
    const height = 340;
    const gap = 28;
    const cols = Math.ceil(Math.sqrt(sessionCount));
    const rows = Math.ceil(sessionCount / cols);
    const totalWidth = cols * width + (cols - 1) * gap;
    const totalHeight = rows * height + (rows - 1) * gap;
    const startX = Math.round(center.x - totalWidth / 2);
    const startY = Math.round(center.y - totalHeight / 2);

    setLaunchCliProviderId(cliProviderId);
    if (
      launchContext.cwd
      && launchContext.cwd !== cwdRef.current
      && shouldPromoteWorkspacePath(launchContext.cwd, launchContext.projectId)
    ) {
      setCwd(launchContext.cwd);
    }

    for (let index = 0; index < sessionCount; index += 1) {
      await createTerminal({
        ...launchContext,
        x: startX + (index % cols) * (width + gap),
        y: startY + Math.floor(index / cols) * (height + gap),
        width,
        height,
        cliProviderId,
        useCommandPreset: cliProviderId === 'shell'
      });
    }
  }, [createTerminal, getCurrentSessionLaunchContext, launchCliProviderId, shouldPromoteWorkspacePath, viewportCenterOnCanvas]);

  const addGrid = useCallback((config) => {
    const gridConfig = typeof config === 'string'
      ? { cliProviderId: config }
      : (config && !config.nativeEvent ? config : {});
    createSessionGrid(4, gridConfig)
      .catch((error) => showToast(error.message));
  }, [createSessionGrid, showToast]);

  const openGridSessionDialog = useCallback((cliProviderId) => {
    if (typeof cliProviderId === 'string') {
      const cliProvider = resolveCliProvider(cliProviderId);
      if (cliProvider?.id) {
        setLaunchCliProviderId(cliProvider.id);
      }
    }
    setGridSessionOpen(true);
  }, []);

  const createCustomSessionGrid = useCallback((count, config = {}) => {
    setGridSessionOpen(false);
    createSessionGrid(count, config).catch((error) => showToast(error.message));
  }, [createSessionGrid, showToast]);

  const openNewSessionPicker = useCallback((cliProviderId) => {
    if (typeof cliProviderId === 'string') {
      const cliProvider = resolveCliProvider(cliProviderId);
      if (cliProvider?.id) {
        setLaunchCliProviderId(cliProvider.id);
      }
    }
    setNewSessionOpen(true);
  }, []);

  const openCommandLineDialog = useCallback(() => {
    setCommandDialogOpen(true);
  }, []);

  const openProjectDialog = useCallback(() => {
    setProjectDialogOpen(true);
  }, []);

  const createCommandLineFromDialog = useCallback((config) => {
    setCommandDialogOpen(false);
    createWorkspaceCommandLineFromConfig(config || {});
  }, [createWorkspaceCommandLineFromConfig]);

  const createWorkspaceSession = useCallback((event, config = {}) => {
    if (event?.altKey) {
      openNewSessionPicker();
      return;
    }

    const run = async () => {
      const launchContext = getCurrentSessionLaunchContext();
      const cliProvider = resolveCliProvider(config.cliProviderId || launchCliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;

      if (!launchContext.projectId && !launchContext.cwd) {
        openNewSessionPicker();
        return;
      }

      if (
        launchContext.cwd
        && launchContext.cwd !== cwdRef.current
        && shouldPromoteWorkspacePath(launchContext.cwd, launchContext.projectId)
      ) {
        setCwd(launchContext.cwd);
      }

      const canvasPoint = config?.canvasPoint;
      const terminalSlot = canvasPoint
        && Number.isFinite(canvasPoint.x)
        && Number.isFinite(canvasPoint.y)
        ? {
            width: 640,
            height: 380,
            x: Math.round(canvasPoint.x),
            y: Math.round(canvasPoint.y)
          }
        : getCenteredTerminalSlot(workspaceRef.current);

      const panel = await createTerminal({
        ...terminalSlot,
        ...launchContext,
        cliProviderId,
        useCommandPreset: cliProviderId === 'shell'
      });
      if (config.selectCommandTarget) {
        setCommandDockTargetId(panel.id);
      }
      setLaunchCliProviderId(cliProviderId);
    };

    run().catch((error) => showToast(error.message));
  }, [createTerminal, getCenteredTerminalSlot, getCurrentSessionLaunchContext, launchCliProviderId, openNewSessionPicker, shouldPromoteWorkspacePath, showToast]);

  const createSessionFromSelection = useCallback((selection) => {
    setNewSessionOpen(false);

    const run = async () => {
      const cliProvider = resolveCliProvider(selection?.cliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;
      const hasExplicitInitialCommand = Object.prototype.hasOwnProperty.call(selection || {}, 'initialCommand');
      const terminalPresetConfig = {
        useCommandPreset: cliProviderId === 'shell'
      };
      if (cliProviderId === 'shell' && hasExplicitInitialCommand) {
        terminalPresetConfig.initialCommand = normalizeCommandPresetCommandInput(selection.initialCommand);
      }
      setLaunchCliProviderId(cliProviderId);

      if (selection?.targetType === 'project') {
        const project = findProjectById(workspaceRef.current.projects, historyProjectRef.current, selection.projectId);
        if (!project) {
          return;
        }

        const nextWorkspace = commitWorkspace((currentWorkspace) => ({
          ...currentWorkspace,
          activeProjectId: project.id
        }));
        setCwd(project.path);
        await createTerminal({
          ...getCenteredTerminalSlot(nextWorkspace),
          projectId: project.id,
          cwd: project.path,
          cliProviderId,
          targetType: 'project',
          ...terminalPresetConfig
        });
        return;
      }

      const sessionCwd = String(cwdRef.current || defaultCwd || '').trim();
      const nextWorkspace = commitWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        activeProjectId: null
      }));
      if (shouldPromoteWorkspacePath(sessionCwd, null)) {
        setCwd(sessionCwd);
      }
      await createTerminal({
        ...getCenteredTerminalSlot(nextWorkspace),
        projectId: null,
        cwd: sessionCwd,
        cliProviderId,
        targetType: 'directory',
        ...terminalPresetConfig
      });
    };

    run().catch((error) => showToast(error.message));
  }, [commitWorkspace, createTerminal, defaultCwd, getCenteredTerminalSlot, shouldPromoteWorkspacePath, showToast]);

  const killAll = useCallback(async () => {
    if (panelsRef.current.length === 0 || !window.confirm(t('closeAllConfirm'))) {
      return;
    }

    await bridge.killAllTerminals();
    setPanels([]);
    setEndpointGroups([]);
    setSelectedEndpointIds(new Set());
    setActiveId(null);
    setPendingConnectionSourceId('');
    setActiveCanvasConnectionId(null);
    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, canvasConnections: {} }));
  }, [commitWorkspace, t]);

  const createProjectFromDialog = useCallback(async (config = {}) => {
    setProjectDialogOpen(false);
    const selected = String(config.path || '').trim();
    if (!selected) {
      return;
    }

    setImageGenerationOpen(false);
    const now = Date.now();
    const requestedName = String(config.name || '').trim();
    const historyProjectItem = historyProjectRef.current;
    if (historyProjectItem && historyProjectItem.path.toLowerCase() === selected.toLowerCase()) {
      commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, activeProjectId: historyProjectItem.id }));
      setCwd(historyProjectItem.path);
      showToast(t('switchedExistingProject', { name: historyProjectItem.name }));
      return;
    }

    const existing = workspaceRef.current.projects.find((project) => project.path.toLowerCase() === selected.toLowerCase());
    if (existing) {
      commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, activeProjectId: existing.id }));
      setCwd(existing.path);
      showToast(t('switchedExistingProject', { name: existing.name }));
      return;
    }

    const project = {
      id: createLocalId('project'),
      name: requestedName || deriveNameFromPath(selected),
      pinned: false,
      path: selected,
      createdAt: now,
      updatedAt: now
    };

    commitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      activeProjectId: project.id,
      projects: normalizeProjectOrder([project, ...currentWorkspace.projects])
    }));
    setCwd(project.path);
    showToast(t('addedProject', { name: project.name }));
  }, [commitWorkspace, showToast, t]);

  const selectProject = useCallback((projectId) => {
    const project = findProjectById(workspaceRef.current.projects, historyProjectRef.current, projectId);
    if (!project) {
      return;
    }
    setImageGenerationOpen(false);
    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, activeProjectId: project.id }));
    setCwd(project.path);
    showToast(t('switchedProject', { name: project.name }));
  }, [commitWorkspace, showToast, t]);

  const selectNoProject = useCallback(() => {
    setImageGenerationOpen(false);
    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, activeProjectId: null }));
    setCwd('');
    showToast(t('switchedProject', { name: t('noProject') }));
  }, [commitWorkspace, showToast, t]);

  const changeCanvasMode = useCallback((mode) => {
    if (!canvasModes.has(mode) || mode === workspaceRef.current.canvasMode) {
      return;
    }

    setImageGenerationOpen(false);
    commitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      canvasMode: mode,
      canvasModeCustomized: true
    }));
    showToast(t(mode === 'shared' ? 'switchedCanvasModeShared' : 'switchedCanvasModeProject'));
  }, [commitWorkspace, showToast, t]);

  const toggleProjectPinned = useCallback((projectId) => {
    commitWorkspace((currentWorkspace) => {
      const projectIndex = currentWorkspace.projects.findIndex((item) => item.id === projectId);
      if (projectIndex < 0) {
        return currentWorkspace;
      }

      const nextProjects = currentWorkspace.projects.slice();
      const [project] = nextProjects.splice(projectIndex, 1);
      const nextPinned = !project.pinned;
      const updatedProject = { ...project, pinned: nextPinned, updatedAt: Date.now() };

      if (nextPinned) {
        nextProjects.unshift(updatedProject);
      } else {
        const insertIndex = nextProjects.findIndex((item) => !item.pinned);
        nextProjects.splice(insertIndex < 0 ? nextProjects.length : insertIndex, 0, updatedProject);
      }

      return {
        ...currentWorkspace,
        projects: normalizeProjectOrder(nextProjects)
      };
    });
  }, [commitWorkspace]);

  const reorderProjects = useCallback((draggedProjectId, targetProjectId, position = 'before') => {
    commitWorkspace((currentWorkspace) => {
      const nextProjects = moveProjectInSidebarOrder(
        currentWorkspace.projects,
        draggedProjectId,
        targetProjectId,
        position
      );

      return nextProjects === currentWorkspace.projects
        ? currentWorkspace
        : { ...currentWorkspace, projects: nextProjects };
    });
  }, [commitWorkspace]);

  const deleteProject = useCallback((projectId) => {
    if (projectId === historyProjectId) {
      return;
    }

    const currentWorkspace = workspaceRef.current;
    const projectIndex = currentWorkspace.projects.findIndex((item) => item.id === projectId);
    if (projectIndex < 0) {
      return;
    }

    const project = currentWorkspace.projects[projectIndex];
    if (!window.confirm(t('deleteProjectConfirm', { name: project.name }))) {
      return;
    }

    const projects = currentWorkspace.projects.filter((item) => item.id !== projectId);
    const removingActiveProject = currentWorkspace.activeProjectId === projectId;
    const nextActiveProject = removingActiveProject
      ? projects[projectIndex] || projects[projectIndex - 1] || null
      : projects.find((item) => item.id === currentWorkspace.activeProjectId) || null;

    commitWorkspace((workspaceWithView) => {
      const { [projectId]: _removedView, ...projectViews } = workspaceWithView.projectViews;
      const { [projectId]: _removedFrames, ...canvasFrames } = workspaceWithView.canvasFrames || {};
      const { [projectId]: _removedTodos, ...canvasTodos } = workspaceWithView.canvasTodos || {};
      return {
        ...workspaceWithView,
        activeProjectId: nextActiveProject?.id || null,
        canvasFrames,
        canvasTodos,
        projectViews,
        projects
      };
    });
    setPanels((current) => current.map((panel) => (
      panel.projectId === projectId ? { ...panel, projectId: null } : panel
    )));

    if (removingActiveProject) {
      setCwd(nextActiveProject?.path || '');
    }

    showToast(t('deletedProject', { name: project.name }));
  }, [commitWorkspace, showToast, t]);

  const zoomAt = useCallback((clientX, clientY, nextScale) => {
    const rect = getViewportRect();
    setView((current) => {
      const before = {
        x: (clientX - rect.left - current.x) / current.scale,
        y: (clientY - rect.top - current.y) / current.scale
      };
      const scale = clamp(nextScale, 0.35, 2.5);
      return {
        scale,
        x: clientX - rect.left - before.x * scale,
        y: clientY - rect.top - before.y * scale
      };
    });
  }, [getViewportRect]);

  const zoomViewportCenter = useCallback((nextScale) => {
    const rect = getViewportRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextScale);
  }, [getViewportRect, zoomAt]);

  const openCanvasContextMenu = useCallback((event) => {
    if (
      closestElement(event.target, '.terminal-panel') ||
      closestElement(event.target, '.endpoint-group') ||
      closestElement(event.target, '.canvas-frame-header') ||
      closestElement(event.target, '.canvas-todo-panel') ||
      closestElement(event.target, '.canvas-tools') ||
      closestElement(event.target, '.canvas-arrange-tool') ||
      closestElement(event.target, '.canvas-context-menu')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const rect = getViewportRect();
    const rawLeft = event.clientX - rect.left;
    const rawTop = event.clientY - rect.top;
    const maxLeft = Math.max(8, rect.width - canvasContextMenuWidth - 8);
    const maxTop = Math.max(8, rect.height - canvasContextMenuHeight - 8);

    setPendingCanvasFrame(false);
    setCanvasContextMenu({
      left: Math.round(clamp(rawLeft, 8, maxLeft)),
      top: Math.round(clamp(rawTop, 8, maxTop)),
      canvasPoint: clientPointToCanvas(event.clientX, event.clientY)
    });
  }, [clientPointToCanvas, getViewportRect]);

  const startViewportPan = (event) => {
    if (event.button === 0) {
      closeCanvasContextMenu();
    }

    if (
      event.button !== 0 ||
      closestElement(event.target, '.terminal-panel') ||
      closestElement(event.target, '.endpoint-group') ||
      closestElement(event.target, '.canvas-todo-panel')
    ) {
      return;
    }

    if (pendingCanvasFrame) {
      event.preventDefault();
      setActiveId(null);
      setActiveCanvasTodoId(null);
      setActiveCanvasConnectionId(null);

      const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
      const anchor = clientPointToCanvas(event.clientX, event.clientY);
      const frameId = createLocalId('canvas-frame');
      const initialFrame = {
        id: frameId,
        title: t('canvasFrameDefaultTitle'),
        ...buildCanvasFrameBounds(anchor, anchor)
      };

      setActiveCanvasFrameId(frameId);
      updateCanvasFramesForKey(canvasKey, (currentFrames) => [...currentFrames, initialFrame]);

      bindPointerSession((moveEvent) => {
        const point = clientPointToCanvas(moveEvent.clientX, moveEvent.clientY);
        updateCanvasFramesForKey(canvasKey, (currentFrames) => currentFrames.map((frame) => (
          frame.id === frameId
            ? {
                ...frame,
                ...buildCanvasFrameBounds(anchor, point)
              }
            : frame
        )));
      }, () => {
        setPendingCanvasFrame(false);
      });
      return;
    }

    event.preventDefault();
    setPanning(true);
    setActiveCanvasFrameId(null);
    setActiveCanvasTodoId(null);
    setActiveCanvasConnectionId(null);
    const start = {
      clientX: event.clientX,
      clientY: event.clientY,
      x: view.x,
      y: view.y
    };

    bindPointerSession((moveEvent) => {
      setView((current) => ({
        ...current,
        x: start.x + moveEvent.clientX - start.clientX,
        y: start.y + moveEvent.clientY - start.clientY
      }));
    }, () => {
      setPanning(false);
    });
  };

  const handleWheel = (event) => {
    closeCanvasContextMenu();

    if (
      closestElement(event.target, '.terminal-panel') ||
      closestElement(event.target, '.endpoint-group') ||
      closestElement(event.target, '.canvas-todo-panel')
    ) {
      return;
    }

    event.preventDefault();
    if (event.ctrlKey) {
      zoomAt(event.clientX, event.clientY, view.scale * (event.deltaY > 0 ? 0.92 : 1.08));
      return;
    }

    setView((current) => ({
      ...current,
      x: current.x - event.deltaX,
      y: current.y - event.deltaY
    }));
  };

  const toggleSidebar = useCallback(() => {
    commitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      sidebarCollapsed: !currentWorkspace.sidebarCollapsed
    }));
  }, [commitWorkspace]);

  const toggleSkillsCollapsed = useCallback(() => {
    commitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      skillsCollapsed: !currentWorkspace.skillsCollapsed
    }));
  }, [commitWorkspace]);

  const togglePromptMenuCollapsed = useCallback(() => {
    commitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      promptMenuCollapsed: !currentWorkspace.promptMenuCollapsed
    }));
  }, [commitWorkspace]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const editable = event.target instanceof HTMLElement && (
        event.target.matches('input, textarea, select') ||
        event.target.isContentEditable
      );

      if (event.key === 'Escape' && canvasContextMenu) {
        event.preventDefault();
        closeCanvasContextMenu();
        return;
      }

      if (event.key === 'Escape' && pendingCanvasFrame) {
        event.preventDefault();
        setPendingCanvasFrame(false);
        return;
      }

      if (event.key === 'Escape' && (pendingConnectionSourceId || connectionMode)) {
        event.preventDefault();
        setPendingConnectionSourceId('');
        if (!pendingConnectionSourceId) {
          setConnectionMode(false);
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        if (event.shiftKey) {
          createWorkspaceCommandLine();
        } else if (event.altKey) {
          openNewSessionPicker();
        } else {
          createWorkspaceSession();
        }
      }

      if (event.ctrlKey && event.key === '0') {
        event.preventDefault();
        setView(createDefaultView());
      }

      const activePanel = panelsRef.current.find((panel) => panel.id === activeIdRef.current);
      if (
        event.key === 'Delete' &&
        activeCanvasConnectionIdRef.current &&
        !editable &&
        !closestElement(event.target, '.terminal-host')
      ) {
        deleteCanvasConnection(activeCanvasConnectionIdRef.current);
        return;
      }

      if (
        event.key === 'Delete' &&
        activeCanvasTodoIdRef.current &&
        !editable &&
        !closestElement(event.target, '.terminal-host')
      ) {
        deleteCanvasTodo(activeCanvasTodoIdRef.current);
        return;
      }

      if (
        event.key === 'Delete' &&
        activeCanvasFrameIdRef.current &&
        !editable &&
        !closestElement(event.target, '.terminal-host')
      ) {
        deleteCanvasFrame(activeCanvasFrameIdRef.current);
        return;
      }

      if (
        event.key === 'Delete' &&
        activeIdRef.current &&
        activePanel &&
        isPanelVisibleInWorkspace(activePanel, workspaceRef.current) &&
        !editable &&
        !closestElement(event.target, '.terminal-host')
      ) {
        closeTerminal(activeIdRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    canvasContextMenu,
    connectionMode,
    closeTerminal,
    closeCanvasContextMenu,
    createWorkspaceCommandLine,
    createWorkspaceSession,
    deleteCanvasConnection,
    deleteCanvasFrame,
    deleteCanvasTodo,
    openNewSessionPicker,
    pendingCanvasFrame,
    pendingConnectionSourceId
  ]);

  const minorGrid = 48 * view.scale;
  const majorGrid = minorGrid * 4;
  const activePanel = visiblePanels.find((panel) => panel.id === activeId) || null;
  const activeTitle = activePanel?.title || activeProject?.name || t('freeSessionWorkspace');
  const activePath = activePanel?.cwd || activeProject?.path || currentWorkspacePath || t('defaultDirectory');
  const currentZoomPercent = Math.round(view.scale * 100);
  const currentZoomPresetScale = zoomPresetScales.find((scale) => Math.abs(view.scale - scale) < 0.01);
  const zoomSelectValue = currentZoomPresetScale ? String(currentZoomPresetScale) : 'current';

  return (
    <TooltipProvider>
      <div className={cn('app-shell', workspace.sidebarCollapsed && 'sidebar-is-collapsed')}>
        <WorkspaceSidebar
          appVersion={appInfo.appVersion}
          activeProject={activeProject}
          activeSessionId={activeId}
          commandTargetId={commandDockTargetId}
          language={language}
          projectCompletedSessionCounts={projectCompletedSessionCounts}
          onAddProject={openProjectDialog}
          onFocusSession={focusSessionFromReview}
          theme={theme}
          onAddSession={openNewSessionPicker}
          onDeleteProject={deleteProject}
          onKillAll={killAll}
          onToggleImageGeneration={toggleImageGeneration}
          onOpenPath={openWorkspacePath}
          onOpenCodexConfig={openCodexSettings}
          onOpenPromptManager={openPromptManager}
          onRefreshSkills={refreshWorkspaceSkills}
          onReorderProjects={reorderProjects}
          onSelectNoProject={selectNoProject}
          onSelectProject={selectProject}
          onThemeChange={setTheme}
          onToggleProjectPinned={toggleProjectPinned}
          onTogglePromptMenuCollapsed={togglePromptMenuCollapsed}
          onToggleSkillsCollapsed={toggleSkillsCollapsed}
          promptManagerOpen={promptManagerOpen}
          quickPromptCount={quickPrompts.length}
          quickPromptsLoading={quickPromptsLoading}
          runtimeNow={runtimeNow}
          sessions={commandDockPanels}
          skillsRootPath={skillsRootPath}
          skillsState={workspaceSkillsState}
          t={t}
          workspace={workspace}
          imageGenerationOpen={imageGenerationOpen}
          onToggleCollapsed={toggleSidebar}
        />

        <div className="main-shell">
          <header className="topbar">
            <div className="min-w-[160px] max-w-[260px]">
              <div className="truncate text-sm font-semibold">{activeTitle}</div>
              <div className="truncate text-xs text-muted-foreground">
                {activePath}
              </div>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <TopbarSessionStats counts={crossProjectSessionCounts} t={t} />

            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setAgentsOpen(true)}>
                <Bot className="h-4 w-4" />
                {t('agents')}
              </Button>
              <Button
                type="button"
                variant={diffReviewOpen ? 'primary' : 'outline'}
                onClick={() => openDiffReviewForPath(currentWorkspacePath)}
                disabled={!currentWorkspacePath}
              >
                <FileDiff className="h-4 w-4" />
                {t('diffReview')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setAutopilotOpen(true)}>
                <CalendarClock className="h-4 w-4" />
                {t('autopilot')}
              </Button>
            </div>

            <Separator orientation="vertical" className="ml-auto h-8" />

            <div className="flex shrink-0 items-center gap-1.5">
              <IconButton id="zoomOut" label={t('zoomOut')} onClick={() => {
                zoomViewportCenter(view.scale / 1.16);
              }}>
                <Minus className="h-4 w-4" />
              </IconButton>
              <Select
                id="zoomPreset"
                ariaLabel={t('zoomLevel')}
                className="h-9 w-[96px] shrink-0 px-2 font-medium tabular-nums"
                onValueChange={(nextValue) => {
                  const nextScale = Number(nextValue);
                  if (Number.isFinite(nextScale)) {
                    zoomViewportCenter(nextScale);
                  }
                }}
                options={[
                  ...(!currentZoomPresetScale ? [{ value: 'current', label: `${currentZoomPercent}%` }] : []),
                  ...zoomPresetScales.map((scale) => ({
                    value: String(scale),
                    label: `${Math.round(scale * 100)}%`
                  }))
                ]}
                title={t('zoomLevel')}
                value={zoomSelectValue}
                valueClassName="tabular-nums"
              />
              <IconButton id="zoomIn" label={t('zoomIn')} onClick={() => {
                zoomViewportCenter(view.scale * 1.16);
              }}>
                <ZoomIn className="h-4 w-4" />
              </IconButton>
              <IconButton id="resetView" label={t('resetView')} onClick={() => setView(createDefaultView())}>
                <RotateCcw className="h-4 w-4" />
              </IconButton>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <SystemStats t={t} />
          </header>

          <main
            ref={viewportRef}
            id="viewport"
            className={cn(
              'viewport',
              panning && 'is-panning',
              pendingCanvasFrame && 'is-creating-frame',
              connectionMode && 'is-connection-mode',
              pendingConnectionSourceId && 'is-connecting-session',
              canvasArrangeActive && 'is-arranging-canvas'
            )}
            tabIndex={0}
            style={{
              backgroundSize: `${majorGrid}px ${majorGrid}px, ${majorGrid}px ${majorGrid}px, ${minorGrid}px ${minorGrid}px, ${minorGrid}px ${minorGrid}px`,
              backgroundPosition: `${view.x}px ${view.y}px`
            }}
            onPointerDown={startViewportPan}
            onContextMenu={openCanvasContextMenu}
            onWheel={handleWheel}
          >
            <div
              className="canvas-tools"
              onPointerDown={(event) => {
                event.stopPropagation();
                closeCanvasContextMenu();
              }}
            >
              <Button
                id="addCanvasFrame"
                variant={pendingCanvasFrame ? 'default' : 'outline'}
                onClick={() => {
                  setPendingCanvasFrame((current) => {
                    const next = !current;
                    if (next) {
                      setConnectionMode(false);
                      setPendingConnectionSourceId('');
                      setActiveCanvasConnectionId(null);
                      showToast(t('canvasFrameHint'));
                    }
                    return next;
                  });
                }}
              >
                <Plus className="h-4 w-4" />
                {pendingCanvasFrame ? t('addCanvasFrameArmed') : t('addCanvasFrame')}
              </Button>
              <Button
                id="connectCanvasSessions"
                variant={connectionMode ? 'default' : 'outline'}
                onClick={toggleCanvasConnectionMode}
              >
                <GitBranch className="h-4 w-4" />
                {connectionMode ? t('canvasConnectArmed') : t('canvasConnect')}
              </Button>
              <Button id="addCanvasTodo" variant="outline" onClick={addCanvasTodo}>
                <ListTodo className="h-4 w-4" />
                {t('addCanvasTodo')}
              </Button>
              <Button id="groupEndpoints" onClick={groupEndpoints} disabled={groupableEndpointCount < 2}>
                <Grid2X2 className="h-4 w-4" />
                {groupableEndpointCount > 0 ? `${t('groupEndpoints')} ${groupableEndpointCount}` : t('groupEndpoints')}
              </Button>
              <Button
                id="collectIdleCmd"
                variant="outline"
                onClick={collectIdleCommandLines}
                disabled={idleCommandLineCount === 0}
              >
                <Archive className="h-4 w-4" />
                {idleCommandLineCount > 0 ? `${t('collectIdleCmd')} ${idleCommandLineCount}` : t('collectIdleCmd')}
              </Button>
            </div>
            <div
              className="canvas-arrange-tool"
              onPointerDown={(event) => {
                event.stopPropagation();
                closeCanvasContextMenu();
              }}
            >
              <Button id="arrangeGrid" onClick={arrangeGrid}>
                <LayoutGrid className="h-4 w-4" />
                {t('arrange')}
              </Button>
              <Button id="arrangeByTag" variant="outline" onClick={arrangeByTag}>
                <Tags className="h-4 w-4" />
                {t('arrangeByTag')}
              </Button>
            </div>
            <CanvasContextMenu
              groupableEndpointCount={groupableEndpointCount}
              idleCommandLineCount={idleCommandLineCount}
              language={language}
              launchProviders={canvasLaunchProviders}
              menu={canvasContextMenu}
              t={t}
              onAddFrame={createCanvasFrameAtPoint}
              onAddGrid={(canvasPoint) => addGrid({ canvasPoint })}
              onAddProviderSession={(cliProviderId, canvasPoint) => createWorkspaceSession(null, {
                cliProviderId,
                canvasPoint,
                selectCommandTarget: true
              })}
              onArrange={arrangeGrid}
              onClose={closeCanvasContextMenu}
              onCollectIdleCommandLines={collectIdleCommandLines}
              onGroupEndpoints={groupEndpoints}
              onOpenGridSessionDialog={openGridSessionDialog}
            />
            <div
              id="stage"
              className="stage"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              <div className="canvas-frame-layer">
                {visibleCanvasFrames.map((frame) => (
                  <CanvasFrame
                    key={frame.id}
                    active={frame.id === activeCanvasFrameId}
                    frame={frame}
                    scale={view.scale}
                    t={t}
                    onActivate={activateCanvasFrame}
                    onDelete={deleteCanvasFrame}
                    onMove={updateCanvasFrame}
                    onResize={updateCanvasFrame}
                    onTitleChange={(id, title) => updateCanvasFrame(id, { title })}
                    onTitleCommit={commitCanvasFrameTitle}
                  />
                ))}
              </div>
              <div className="canvas-todo-layer">
                {visibleUnpinnedCanvasTodos.map((todo) => (
                  <CanvasTodoList
                    key={todo.id}
                    active={todo.id === activeCanvasTodoId}
                    todo={todo}
                    scale={view.scale}
                    t={t}
                    onActivate={activateCanvasTodo}
                    onAddItem={addCanvasTodoItem}
                    onDelete={deleteCanvasTodo}
                    onItemDoneChange={updateCanvasTodoItemDone}
                    onItemRemove={removeCanvasTodoItem}
                    onItemTextChange={updateCanvasTodoItemText}
                    onMove={moveCanvasTodo}
                    onPlanTextChange={updateCanvasTodoPlanText}
                    onResize={updateCanvasTodo}
                    onAutoSyncChange={toggleCanvasTodoAutoSync}
                    onTitleChange={(id, title) => updateCanvasTodo(id, { title })}
                    onTitleCommit={commitCanvasTodoTitle}
                    onTogglePinned={toggleCanvasTodoPinned}
                  />
                ))}
              </div>
              <CanvasConnectionLayer
                activeConnectionId={activeCanvasConnectionId}
                connections={visibleConnectionRecords}
                previewConnection={previewConnectionRecord}
                t={t}
                onDeleteConnection={deleteCanvasConnection}
                onSelectConnection={selectCanvasConnection}
              />
              <div className="canvas-session-layer">
              {visibleEndpointGroups.map(({ group, panels: groupPanels }) => (
                <EndpointGroup
                  key={group.id}
                  group={group}
                  panels={groupPanels}
                  runtimeNow={runtimeNow}
                  scale={view.scale}
                  commandTargetId={commandDockTargetId}
                  connectionMode={connectionMode}
                  pendingConnectionSourceId={pendingConnectionSourceId}
                  dispatchSparkles={commandDockDispatchSparkles}
                  selectedIds={selectedEndpointIds}
                  t={t}
                  onActivate={activateEndpointGroup}
                  onConnectionPortClick={handleSessionConnectionPortClick}
                  onConnectionPortPointerDown={handleSessionConnectionPortPointerDown}
                  onExpandPanel={expandPanel}
                  onMove={updateEndpointGroup}
                  onPanelTitleChange={(id, title) => updatePanel(id, { title })}
                  onPanelTitleCommit={commitPanelTitle}
                  onSelectToggle={toggleEndpointSelection}
                  onUngroup={ungroupEndpointGroup}
                />
              ))}
              {panels.map((panel) => {
                const visible = visiblePanelIds.has(panel.id) && !groupedVisiblePanelIds.has(panel.id);
                return (
                <TerminalPanel
                  key={panel.id}
                  panel={panel}
                  active={visible && panel.id === activeId}
                  language={language}
                  runtimeNow={runtimeNow}
                  scale={view.scale}
                  sessionHeaderVisibility={sessionHeaderVisibility}
                  t={t}
                  theme={theme}
                  visible={visible}
                  selected={selectedEndpointIds.has(panel.id)}
                  commandTargeted={panel.id === commandDockTargetId}
                  connectionMode={connectionMode}
                  pendingConnectionSourceId={pendingConnectionSourceId}
                  arrangeAnimation={canvasArrangeAnimations[panel.id] || null}
                  availableSessionTags={availableSessionTags}
                  dispatchSparkleKey={commandDockDispatchSparkles[panel.id] || ''}
                  onActivate={activatePanel}
                  onClose={closeTerminal}
                  onConnectionPortClick={handleSessionConnectionPortClick}
                  onConnectionPortPointerDown={handleSessionConnectionPortPointerDown}
                  onExpand={expandPanel}
                  onAgentAttachImages={attachAgentImagesToCommandDock}
                  onAgentInsertDiff={insertAgentDiffContext}
                  onAgentOpenFiles={openAgentWorkspaceFiles}
                  onAgentOpenReview={openAgentDiffReview}
                  onAgentSetQuickTarget={prepareAgentUtilityTarget}
                  onMinimize={minimizePanel}
                  onMove={updatePanel}
                  onResize={updatePanel}
                  onRestart={restartTerminal}
                  onModelChange={switchPanelModel}
                  onSelectToggle={toggleEndpointSelection}
                  onTagChange={changePanelTag}
                  onTerminalInput={handleTerminalInput}
                  onTitleChange={(id, title) => updatePanel(id, { title })}
                  onTitleCommit={commitPanelTitle}
                  registerTerminal={registerTerminal}
                />
                );
              })}
              </div>
              <div className="canvas-todo-layer is-pinned-layer">
                {visiblePinnedCanvasTodos.map((todo) => (
                  <CanvasTodoList
                    key={todo.id}
                    active={todo.id === activeCanvasTodoId}
                    todo={todo}
                    scale={view.scale}
                    t={t}
                    onActivate={activateCanvasTodo}
                    onAddItem={addCanvasTodoItem}
                    onDelete={deleteCanvasTodo}
                    onItemDoneChange={updateCanvasTodoItemDone}
                    onItemRemove={removeCanvasTodoItem}
                    onItemTextChange={updateCanvasTodoItemText}
                    onMove={moveCanvasTodo}
                    onPlanTextChange={updateCanvasTodoPlanText}
                    onResize={updateCanvasTodo}
                    onAutoSyncChange={toggleCanvasTodoAutoSync}
                    onTitleChange={(id, title) => updateCanvasTodo(id, { title })}
                    onTitleCommit={commitCanvasTodoTitle}
                    onTogglePinned={toggleCanvasTodoPinned}
                  />
                ))}
              </div>
            </div>

            <CanvasSessionStatusQueue
              activeId={activeId}
              className={cn(
                commandDockVisible && !commandDockPosition && (
                  commandDockCollapsed ? 'is-above-collapsed-dock' : 'is-above-expanded-dock'
                )
              )}
              commandTargetId={commandDockTargetId}
              language={language}
              onFocusSession={focusSessionFromReview}
              onRefresh={refreshCanvasSessionStatusQueue}
              panels={commandDockPanels}
              refreshStamp={canvasStatusRefreshAt}
              t={t}
            />

            {visiblePanels.length === 0 && visibleCanvasFrames.length === 0 && visibleCanvasTodos.length === 0 && (
              <Card id="emptyState" className="pointer-events-none absolute left-1/2 top-1/2 w-[min(420px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 border-border/70 bg-card/80 text-center shadow-2xl backdrop-blur">
                <CardContent className="p-5">
                  <div className="flex items-center justify-center gap-2 text-xl font-bold text-foreground">
                    <SquareTerminal className="h-6 w-6 text-primary" />
                    {t('startEmpty')}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {t('startHint')}
                  </div>
                </CardContent>
              </Card>
            )}
          </main>

          <WorkspaceTreeSidebar
            canInsertToComposer={commandDockVisible}
            currentPath={currentWorkspacePath}
            normalizeInsertPath={normalizePromptFilePath}
            onClose={() => setWorkspaceTreeOpen(false)}
            onCopy={copyWorkspaceTree}
            onInsertNode={handleWorkspaceTreeNodeInsert}
            onInsertSelected={insertSelectedWorkspaceTreePath}
            onLoadNodeChildren={loadWorkspaceTreeNodeChildren}
            onOpen={openWorkspaceTree}
            onRefresh={refreshWorkspaceTree}
            onSelectNode={selectWorkspaceTreeNode}
            open={workspaceTreeOpen}
            selectedNodeId={workspaceTreeSelectedNode?.id || ''}
            selectedPath={workspaceTreeSelectedNode?.path || ''}
            state={workspaceTreeState}
            t={t}
          />
          <SessionReviewModal
            activeId={activeId}
            commandTargetId={commandDockTargetId}
            getPanelState={getPanelExecutionState}
            language={language}
            onClose={() => setSessionReviewOpen(false)}
            onCopyAll={copySessionReviewSummary}
            onCopySession={copySessionReviewRecord}
            onExportAll={exportSessionReviewPanels}
            onExportSession={exportTerminal}
            onFocusSession={focusSessionFromReview}
            onSetCommandTarget={setCommandTargetFromReview}
            open={sessionReviewOpen}
            panels={commandDockPanels}
            records={sessionReviewRecords}
            renderProviderBadge={(panel) => (
              <CliProviderBadge
                className="px-2 py-0 text-[11px]"
                language={language}
                provider={getPanelCliProvider(panel)}
              />
            )}
            renderRuntimeTag={(panel) => (
              <SessionRuntimeTag panel={panel} now={runtimeNow} t={t} />
            )}
            renderStatusTag={(panel, state) => (
              <SessionStatusTag panel={panel} state={state} t={t} />
            )}
            runtimeNow={runtimeNow}
            t={t}
          />
          <DiffReviewModal
            agents={agents}
            cwd={diffReviewCwd || currentWorkspacePath}
            language={language}
            onClose={() => setDiffReviewOpen(false)}
            onOpenAgents={() => {
              setDiffReviewOpen(false);
              setAgentsOpen(true);
            }}
            onSubmitReview={submitDiffReview}
            open={diffReviewOpen}
            t={t}
          />
          {imageGenerationOpen && (
            <ImageGenerationCanvasPage
              config={imageGenerationConfig}
              configLoading={imageGenerationConfigLoading}
              generating={imageGenerationSubmitting}
              onClear={clearImageGenerationResults}
              onClose={() => setImageGenerationOpen(false)}
              onCopyReference={copyImageGenerationReference}
              onGenerate={generateImageFromCanvas}
              onOpenFile={openImageGenerationFile}
              onOpenSettings={openImageGenerationSettings}
              onPromptChange={setImageGenerationPrompt}
              onReferenceImagesAdd={saveImageGenerationReferenceImages}
              prompt={imageGenerationPrompt}
              results={imageGenerationResults}
              t={t}
            />
          )}
        </div>
      </div>

      {commandDockVisible && (
        <FloatingCommandDock
          activeId={activeId}
          canPanelReceiveInput={canPanelReceiveInput}
          collapsed={commandDockCollapsed}
          commandHistory={commandDockHistory}
          contextItems={commandDockContextItems}
          contextLoading={commandDockContextLoading}
          dispatchMode={commandDockDispatchMode}
          dispatchShortcutLabel={commandDockShortcutLabels.dispatch}
          dispatchingTasks={commandDockTaskDispatching}
          getExecutionStateLabel={getExecutionStateLabel}
          getPanelExecutionState={getPanelExecutionState}
          getPanelProviderLabel={(panel) => (
            getCliProviderBadgeLabel(getPanelCliProvider(panel), language)
          )}
          getQuickPromptTitle={(record) => (
            deriveQuickPromptTitle(record.prompt, t('quickPromptDefaultName'))
          )}
          inputRef={commandDockInputRef}
          message={commandDockValue}
          position={commandDockPosition}
          quickPrompts={quickPrompts}
          quickPromptsLoading={quickPromptsLoading}
          quickPromptsPath={quickPromptsPath}
          renderProviderBadge={(panel) => (
            <CliProviderBadge
              className="shrink-0 px-2 py-0 text-[11px]"
              language={language}
              provider={getPanelCliProvider(panel)}
            />
          )}
          sendShortcutLabel={commandDockShortcutLabels.send}
          onDispatchTasks={dispatchCommandDockTasks}
          onDispatchModeChange={changeCommandDockDispatchMode}
          onExport={exportTerminal}
          onExportCustom={exportTerminalCustom}
          onHistorySelect={selectCommandDockHistory}
          onAddLatestOutputContext={addLatestOutputToCommandDockContext}
          onAddSelectedTextContext={addSelectedTextToCommandDockContext}
          onAddTerminalSelectionContext={addTerminalSelectionToCommandDockContext}
          onAddUrlContext={addUrlToCommandDockContext}
          onClearContext={clearCommandDockContextItems}
          onInputChange={handleCommandDockInputChange}
          onInputCompositionEnd={handleCommandDockCompositionEnd}
          onInputCompositionStart={handleCommandDockCompositionStart}
          onInputDragOver={handleCommandDockDragOver}
          onInputKeyDown={handleCommandDockKeyDown}
          onInputDrop={handleCommandDockDrop}
          onInputPaste={handleCommandDockPaste}
          onInputScroll={handleCommandDockInputScroll}
          onInputSelect={handleCommandDockInputSelect}
          onPositionChange={setCommandDockPosition}
          onOpenWorkspaceTree={openWorkspaceTree}
          onQuickPromptDelete={deleteCommandDockPrompt}
          onQuickPromptSave={saveCommandDockPrompt}
          onQuickPromptSelect={insertQuickPromptIntoCommandDock}
          onRemoveContextItem={removeCommandDockContextItem}
          onSend={sendCommandDockInput}
          onSkillMentionSelect={insertCommandDockSkillMention}
          onToggleCollapsed={toggleCommandDockCollapsed}
          onToggleSessionReview={toggleSessionReview}
          onTargetChange={selectCommandDockTarget}
          panels={commandDockPanels}
          skillMention={commandDockSkillMention}
          skillMentionHasAnyItems={commandDockSkillMentionSourceItems.length > 0}
          skillMentionItems={commandDockSkillMentionItems}
          skillMentionLoading={commandDockSkillMentionLoading}
          sessionReviewOpen={sessionReviewOpen}
          targetId={commandDockTargetId}
          t={t}
        />
      )}

      <PromptManagementDialog
        loading={quickPromptsLoading}
        onDelete={deleteQuickPromptRecord}
        onOpenChange={setPromptManagerOpen}
        onReload={loadQuickPrompts}
        onSave={saveQuickPromptRecord}
        open={promptManagerOpen}
        prompts={quickPrompts}
        promptsPath={quickPromptsPath}
        showToast={showToast}
        t={t}
      />

      <CodexConfigDialog
        appZoomFactor={appZoomFactor}
        canvasMode={workspace.canvasMode}
        commandDockShortcuts={commandDockShortcuts}
        historyProject={historyProject}
        initialSettingsTab={codexInitialTab}
        language={language}
        onAppZoomFactorChange={(factor) => setAppZoomFactor(normalizeAppZoomFactor(factor))}
        onCanvasModeChange={changeCanvasMode}
        onCommandDockShortcutChange={changeCommandDockShortcut}
        onHistoryProjectOpen={() => selectProject(historyProjectId)}
        onLanguageChange={setLanguage}
        onOpenChange={setCodexOpen}
        onSessionHeaderVisibilityChange={changeSessionHeaderVisibility}
        open={codexOpen}
        sessionHeaderVisibility={sessionHeaderVisibility}
        showToast={showToast}
        t={t}
      />

      <NewSessionDialog
        activeCommandPresetId={activeCommandPresetId}
        commandPresets={commandPresets}
        commandPresetsLoading={commandPresetsLoading}
        commandPresetsPath={commandPresetsPath}
        defaultCwd={sessionLaunchPath}
        initialCliProviderId={launchCliProviderId}
        language={language}
        onCommandPresetDelete={deleteCommandPreset}
        onCommandPresetSave={saveCommandPreset}
        onCommandPresetSelect={selectCommandPreset}
        onOpenChange={setNewSessionOpen}
        onSelect={createSessionFromSelection}
        open={newSessionOpen}
        projects={projectsWithHistory}
        showToast={showToast}
        t={t}
      />

      <AgentsDialog
        agents={agents}
        initialCliProviderId={launchCliProviderId}
        language={language}
        onAgentsChange={setAgents}
        onOpenChange={setAgentsOpen}
        onRunAgent={runAgentTask}
        open={agentsOpen}
        showToast={showToast}
        skillsState={workspaceSkillsState}
        t={t}
      />

      <AutopilotDialog
        agents={agents}
        autopilots={autopilots}
        language={language}
        onAutopilotsChange={setAutopilots}
        onOpenChange={setAutopilotOpen}
        onRunAutopilot={runAutopilot}
        open={autopilotOpen}
        showToast={showToast}
        t={t}
      />

      <CommandLineConfigDialog
        activeCommandPresetId={activeCommandPresetId}
        commandPresets={commandPresets}
        commandPresetsLoading={commandPresetsLoading}
        commandPresetsPath={commandPresetsPath}
        initialCliProviderId="shell"
        initialDirectory={sessionLaunchPath}
        language={language}
        onCommandPresetDelete={deleteCommandPreset}
        onCommandPresetSave={saveCommandPreset}
        onCommandPresetSelect={selectCommandPreset}
        onCreate={createCommandLineFromDialog}
        onOpenChange={setCommandDialogOpen}
        open={commandDialogOpen}
        showToast={showToast}
        t={t}
      />

      <ProjectConfigDialog
        onCreate={createProjectFromDialog}
        onOpenChange={setProjectDialogOpen}
        open={projectDialogOpen}
        t={t}
      />

      <GridSessionDialog
        initialCliProviderId={launchCliProviderId}
        language={language}
        onCreate={createCustomSessionGrid}
        onOpenChange={setGridSessionOpen}
        open={gridSessionOpen}
        t={t}
      />

      {toast && (
        <Card
          id="toast"
          className={cn(
            'toast',
            commandDockVisible && (commandDockCollapsed ? 'is-lifted-compact' : 'is-lifted')
          )}
        >
          <CardContent className="p-0">{toast}</CardContent>
        </Card>
      )}
    </TooltipProvider>
  );
}
