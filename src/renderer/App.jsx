import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  BrainCircuit,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardPaste,
  Cpu,
  ExternalLink,
  FolderOpen,
  FolderPlus,
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
import { FloatingCommandDock } from '@/components/FloatingCommandDock';
import { ImageGenerationCanvasPage } from '@/components/ImageGenerationCanvasPage';
import { SessionReviewModal } from '@/components/SessionReviewModal';
import { WorkspaceTreeSidebar } from '@/components/WorkspaceTreeSidebar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
const endpointWidth = 300;
const endpointHeight = 44;
const canvasFrameMinWidth = 220;
const canvasFrameMinHeight = 140;
const canvasFrameDefaultWidth = 360;
const canvasFrameDefaultHeight = 200;
const canvasContextMenuWidth = 220;
const canvasContextMenuHeight = 136;
const canvasTodoMinWidth = 280;
const canvasTodoMinHeight = 240;
const canvasTodoDefaultWidth = 340;
const canvasTodoDefaultHeight = 420;
const terminalContextMenuWidth = 280;
const terminalContextMenuEstimatedHeight = 360;
const zoomPresetScales = [0.5, 1, 1.5, 2];
const systemStatsRefreshMs = 2000;
const memoryUsageWarningThreshold = 0.85;
const memoryUsageCriticalThreshold = 0.95;
const panelIdleThresholdMs = 12000;
const panelActivityFlushMs = 120;
const agentTaskSubmitDelayMs = 1800;
const commandDockTaskSubmitDelayMs = 1800;
const commandDockDispatchSparkleMs = 5200;
const commandDockHistoryLimit = 10;
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
const canvasArrangeDurationMs = 760;
const canvasArrangeMaxStaggerMs = 180;
const formSelectClassName = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function normalizeCommandDockDispatchMode(value) {
  return value === 'new' ? 'new' : 'reuse';
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
  size: '1024x1024'
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
    codexConfig: 'Codex 配置',
    projects: '项目',
    projectEmpty: '选择一个目录后会在这里管理项目。',
    canvasMode: '画布模式',
    canvasModeShared: '共享',
    canvasModeProject: '按项目',
    canvasModeProjectTooltip: '每个项目保留独立画布，只显示当前项目关联的会话和说明框。',
    canvasModeSharedTooltip: '所有项目共用同一个画布，方便跨项目同时查看和整理会话。',
    sharedWorkspace: '共享工作区',
    settings: '设置',
    closeAll: '全部关闭',
    closeAllConfirm: '确认关闭全部会话？所有当前运行状态会被中断。',
    workspace: '工作区',
    noProject: '不绑定项目',
    launchMenu: '新增',
    launchMenuAria: '新增会话菜单',
    launchAtCurrentWorkspace: '当前工作区',
    launchChooseTarget: '选择目录或项目',
    launchCurrentDirectory: '当前目录',
    launchFourSessions: '4 个会话',
    launchCustomCount: '自定义数量',
    addSession: '新增会话',
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
    newSessionSourceDescription: '先选择要启动的 CLI，再选择项目或默认目录。',
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
    startHint: '从新增菜单选择 CLI 后，可在当前工作区创建单个或批量会话。',
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
    addCanvasFrame: '说明框',
    addCanvasFrameArmed: '拖拽画框',
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
    groupEndpoints: '分组端点',
    ungroupEndpoints: '取消分组',
    endpointGroup: '端点组',
    groupEndpointsUnavailable: '至少需要两个已收起端点。',
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
    floatingComposerHint: '{sendShortcut} 发送，{dispatchShortcut} 分发任务，Shift+Enter 换行，粘贴或拖拽图片会保存到程序目录的 .files',
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
    sessionRuntime: '运行',
    sessionContext: '上下文',
    exportSession: '导出会话',
    exportSessionCustom: '导出到指定目录',
    sessionExported: '已导出：{path}',
    exportSessionFailed: '导出失败：{message}',
    historyFolder: '历史记录',
    restart: '重启',
    close: '关闭',
    restartConfirm: '确认重启这个会话？当前运行状态会被中断。',
    closeConfirm: '确认关闭这个会话？当前运行状态会被中断。',
    resize: '调整大小',
    preferences: '偏好',
    appearance: '外观',
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
    imageApiCount: '数量',
    imageApiKeySavedPlaceholder: '已保存，留空保持不变',
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
    skillsHint: '自动识别当前工作区里的 .cursor、.claude、.agent、.github。',
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
    appNetworkSummary: '点击版本号时会请求 GitHub Releases；使用图像 API 时会连接你配置的服务；应用不做云同步。',
    cliNetworkNotice: 'CLI 说明',
    cliNetworkNoticeSummary: '终端里运行的 Codex、Claude Code、Cursor 或其他命令是否联网，取决于这些工具自身的行为和配置。',
    modelUnset: '未设置模型',
    modelSwitched: '模型已切换为 {model}',
    modelSwitchFailed: '切换模型失败：{message}',
    backupHistory: '历史备份',
    noBackups: '暂无备份',
    restoreBackup: '恢复备份',
    settingsDescription: '应用偏好、Codex 和 Claude Code 配置文件。',
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
    workspaceTreeInsertToComposer: '插入到快捷发送',
    workspaceTreeSelectFileHint: '选中文件后，可把路径插入到底部快捷发送',
    workspaceTreeSelectedFile: '已选：{path}',
    workspaceTreePathInserted: '已插入文件路径：{path}',
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
    codexConfig: 'Codex config',
    projects: 'Projects',
    projectEmpty: 'Choose a folder to manage projects here.',
    canvasMode: 'Canvas mode',
    canvasModeShared: 'Shared',
    canvasModeProject: 'Per project',
    canvasModeProjectTooltip: 'Each project keeps its own canvas and only shows sessions and frames linked to the active project.',
    canvasModeSharedTooltip: 'All projects share one canvas, useful for viewing and arranging sessions across projects.',
    sharedWorkspace: 'Shared workspace',
    settings: 'Settings',
    closeAll: 'Close all',
    closeAllConfirm: 'Close all sessions? Their current running state will be interrupted.',
    workspace: 'Workspace',
    noProject: 'No project',
    launchMenu: 'New',
    launchMenuAria: 'New session menu',
    launchAtCurrentWorkspace: 'Current workspace',
    launchChooseTarget: 'Choose directory or project',
    launchCurrentDirectory: 'Current directory',
    launchFourSessions: '4 sessions',
    launchCustomCount: 'Custom count',
    addSession: 'New session',
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
    newSessionSourceDescription: 'Choose a CLI first, then pick a project or the default directory.',
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
    startHint: 'Use the New menu to choose a CLI and create single or batch sessions in the current workspace.',
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
    addCanvasFrame: 'Frame',
    addCanvasFrameArmed: 'Draw frame',
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
    groupEndpoints: 'Group endpoints',
    ungroupEndpoints: 'Ungroup endpoints',
    endpointGroup: 'Endpoint group',
    groupEndpointsUnavailable: 'At least two minimized endpoints are required.',
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
    floatingComposerHint: '{sendShortcut} to send, {dispatchShortcut} to dispatch tasks, Shift+Enter for newline, paste or drop images to save them into the app .files folder',
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
    sessionRuntime: 'Run',
    sessionContext: 'Context',
    exportSession: 'Export session',
    exportSessionCustom: 'Export to folder',
    sessionExported: 'Exported: {path}',
    exportSessionFailed: 'Export failed: {message}',
    historyFolder: 'History',
    restart: 'Restart',
    close: 'Close',
    restartConfirm: 'Restart this session? Its current running state will be interrupted.',
    closeConfirm: 'Close this session? Its current running state will be interrupted.',
    resize: 'Resize',
    preferences: 'Preferences',
    appearance: 'Appearance',
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
    imageApiCount: 'Count',
    imageApiKeySavedPlaceholder: 'Saved; leave blank to keep it',
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
    skillsHint: 'Auto-detects .cursor, .claude, .agent, and .github in the current workspace.',
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
    appNetworkSummary: 'Clicking the version requests GitHub Releases; using Image API connects to your configured service; the app does not sync data to any cloud service.',
    cliNetworkNotice: 'CLI notice',
    cliNetworkNoticeSummary: 'Whether Codex, Claude Code, Cursor, or any other command inside the terminal connects to a network depends on that tool itself.',
    modelUnset: 'Model not set',
    modelSwitched: 'Model switched to {model}',
    modelSwitchFailed: 'Failed to switch model: {message}',
    backupHistory: 'Backups',
    noBackups: 'No backups',
    restoreBackup: 'Restore',
    settingsDescription: 'App preferences, Codex config files, and Claude Code config files.',
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
    workspaceTreeInsertToComposer: 'Insert into quick send',
    workspaceTreeSelectFileHint: 'Select a file to insert its path into quick send.',
    workspaceTreeSelectedFile: 'Selected: {path}',
    workspaceTreePathInserted: 'Inserted file path: {path}',
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
    size: String(raw?.size || imageApiConfigDefaults.size).trim() || imageApiConfigDefaults.size
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

  const finish = () => {
    if (!active) {
      return;
    }

    active = false;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', finish);
    document.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
    onPointerEnd?.();
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

function normalizeCanvasTodoItem(item, index = 0) {
  const now = Date.now();
  return {
    id: item?.id || createLocalId('canvas-todo-item'),
    text: typeof item?.text === 'string' ? item.text : '',
    done: Boolean(item?.done),
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
    left.done === right.done &&
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

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
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

function SessionRuntimeTag({ panel, now, t }) {
  const startedAt = Number.isFinite(panel?.createdAt) ? panel.createdAt : now;
  const endedAt = isPanelLive(panel)
    ? now
    : Number.isFinite(panel?.endedAt) ? panel.endedAt : now;
  const elapsed = formatElapsedDuration(startedAt, endedAt);

  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center rounded-full border border-border bg-background px-2 font-mono text-[11px] font-semibold tabular-nums text-muted-foreground"
      title={`${t('sessionRuntime')} ${elapsed}`}
    >
      {t('sessionRuntime')} {elapsed}
    </span>
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

  const handleChange = (event) => {
    const nextValue = event.target.value;
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
    <select
      className={cn('session-tag-select', `is-${getSessionTagTone(normalizedTag)}`, className)}
      value={normalizedTag || sessionTagNoneValue}
      title={normalizedTag
        ? `${t('sessionTag')} ${getSessionTagLabel(normalizedTag, t)}`
        : t('sessionTagNone')}
      aria-label={t('sessionTag')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onChange={handleChange}
    >
      <option value={sessionTagNoneValue}>{t('sessionTagNone')}</option>
      {sessionTagPresets.map((tag) => (
        <option key={tag.id} value={tag.id}>{t(tag.labelKey)}</option>
      ))}
      {customOptions.map((tag) => (
        <option key={tag} value={tag}>{tag}</option>
      ))}
      <option value={sessionTagCustomValue}>{t('sessionTagCustom')}</option>
    </select>
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
    referenceImageCount: Number.isFinite(Number.parseInt(source.referenceImageCount, 10))
      ? Number.parseInt(source.referenceImageCount, 10)
      : 0,
    name: '',
    normalizedPath: '',
    path: '',
    prompt: String(source.prompt || prompt || ''),
    url: '',
    error: String(source.error || '').trim()
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
    if (!imageGenerationFailedStatuses.has(status)) {
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
    return imageGenerationFailedStatuses.has(status);
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
    referenceImageCount: Number.isFinite(Number.parseInt(item.referenceImageCount, 10))
      ? Number.parseInt(item.referenceImageCount, 10)
      : 0,
    name: String(item.name || '').trim(),
    normalizedPath: normalizePromptFilePath(item.normalizedPath || item.path),
    path: String(item.path || item.normalizedPath || '').trim(),
    prompt: String(item.prompt || ''),
    error: String(item.error || '').trim()
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
  const task = String(taskDescription || '').trim();
  const sections = [`You are the saved CLI in One agent "${name}".`];

  if (instructions) {
    sections.push(`Agent instructions:\n${instructions}`);
  }

  sections.push(`Task:\n${task}`);
  return sections.join('\n\n');
}

function deriveNameFromPath(value) {
  if (!value) {
    return '未命名项目';
  }

  const parts = String(value).split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || value;
}

function createEmptyWorkspace() {
  return {
    sidebarCollapsed: false,
    skillsCollapsed: false,
    activeProjectId: null,
    canvasMode: 'project',
    sharedView: createDefaultView(),
    canvasFrames: {},
    canvasTodos: {},
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
  const activeProjectId = raw.activeProjectId === historyProjectId || projects.some((project) => project.id === raw.activeProjectId)
    ? raw.activeProjectId
    : null;
  const projectViews = raw.projectViews && typeof raw.projectViews === 'object'
    ? Object.fromEntries(Object.entries(raw.projectViews).map(([key, value]) => [key, normalizeCanvasView(value)]))
    : {};
  const canvasFrames = normalizeCanvasFrameMap(raw.canvasFrames);
  const canvasTodos = normalizeCanvasTodoMap(raw.canvasTodos);

  return {
    ...fallback,
    sidebarCollapsed: Boolean(raw.sidebarCollapsed),
    skillsCollapsed: Boolean(raw.skillsCollapsed),
    activeProjectId,
    canvasMode: canvasModes.has(raw.canvasMode) ? raw.canvasMode : fallback.canvasMode,
    sharedView: normalizeCanvasView(raw.sharedView),
    canvasFrames,
    canvasTodos,
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

    return {
      id: source.id,
      label: source.label,
      directoryName: source.directoryName,
      exists: Boolean(current.exists),
      error: String(current.error || '').trim(),
      fileCount: Number.isFinite(current.fileCount) ? current.fileCount : files.length,
      files,
      path: String(current.path || '').trim(),
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
  onResize,
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
      className={cn('canvas-todo-panel', active && 'is-active', todo.pinned && 'is-pinned')}
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

      <div className="canvas-todo-progress">{progressText}</div>

      <div className="canvas-todo-add-row">
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
              className={cn('canvas-todo-item', item.done && 'is-done')}
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
  menu,
  t,
  onAddFrame,
  onArrange,
  onClose,
  onGroupEndpoints
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
    </div>
  );
}

function EndpointGroup({
  group,
  panels,
  runtimeNow,
  scale,
  commandTargetId,
  dispatchSparkles = {},
  selectedIds,
  t,
  onActivate,
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
      className="endpoint-group"
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
                dispatchSparkleKey && 'is-dispatch-sparkling'
              )}
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
  runtimeNow,
  scale,
  t,
  theme,
  availableSessionTags,
  visible = true,
  selected = false,
  commandTargeted = false,
  arrangeAnimation = null,
  dispatchSparkleKey = '',
  onActivate,
  onClose,
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
  const [scrollbarTrackHeight, setScrollbarTrackHeight] = useState(0);
  const [scrollbarState, setScrollbarState] = useState({ baseY: 0, rows: 0, viewportY: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const panelProvider = getPanelCliProvider(panel);
  const sessionTag = getPanelSessionTag(panel);
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

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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
      return;
    }

    const updateTrackHeight = () => {
      setScrollbarTrackHeight(trackNode.getBoundingClientRect().height);
    };

    updateTrackHeight();

    if (typeof ResizeObserver !== 'function') {
      return undefined;
    }

    const observer = new ResizeObserver(() => updateTrackHeight());
    observer.observe(trackNode);
    return () => observer.disconnect();
  }, [panel.minimized, scrollbarState.baseY, visible]);

  useEffect(() => {
    const term = new Terminal({
      allowTransparency: false,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.14,
      letterSpacing: 0,
      scrollback: 8000,
      theme: terminalThemes[theme],
      windowsMode: true
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(hostRef.current);
    termRef.current = term;
    fitAddonRef.current = fitAddon;

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
      onTerminalInput(panel.id);
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

    fitTerminal();
    termRef.current.refresh(0, termRef.current.rows - 1);
    syncScrollbarState();
    syncInputAnchor();
  }, [fitTerminal, panel.minimized, syncInputAnchor, syncScrollbarState, visible]);

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
        panel.minimized && 'is-minimized',
        panel.minimized && selected && 'is-selected',
        commandTargeted && 'is-command-target',
        arrangeAnimation && 'is-arranging',
        dispatchSparkleKey && 'is-dispatch-sparkling',
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
          className={cn(
            'grid h-9 flex-none cursor-grab items-center gap-1.5 space-y-0 border-b border-[var(--panel-header-border)] bg-[var(--panel-header)] px-1.5 py-1 active:cursor-grabbing',
            getSessionHeaderGridClass(panel)
          )}
          title={t('movePanel')}
          onPointerDown={startDrag}
        >
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" tabIndex={-1}>
            <CliProviderIcon provider={panelProvider} className="h-4 w-4" />
          </Button>
          <Input
            className="h-6 min-w-0 cursor-text border-transparent bg-transparent px-2 text-sm font-semibold shadow-none focus:border-border focus:bg-background focus-visible:ring-0"
            value={panel.title}
            aria-label={t('renameSession')}
            spellCheck={false}
            onPointerDown={(event) => event.stopPropagation()}
            onFocus={() => onActivate(panel.id)}
            onChange={(event) => onTitleChange(panel.id, event.target.value)}
            onBlur={(event) => onTitleCommit(panel.id, event.target.value)}
            onKeyDown={handleTitleKeyDown}
          />
          <SessionTagControl
            availableTags={availableSessionTags}
            value={sessionTag}
            t={t}
            onChange={(nextTag) => onTagChange?.(panel.id, nextTag)}
          />
          <SessionModelTag panel={panel} t={t} />
          <SessionContextTag panel={panel} t={t} />
          <SessionStatusTag panel={panel} t={t} />
          <SessionRuntimeTag panel={panel} now={runtimeNow} t={t} />
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
        </CardHeader>
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

function isClaudeConfigFile(fileId) {
  return getConfigFileMeta(fileId).owner === 'claude';
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
  commandDockShortcuts,
  initialSettingsTab = 'preferences',
  language,
  onCommandDockShortcutChange,
  onLanguageChange,
  onOpenChange,
  onProfileChanged,
  open,
  showToast,
  t
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState(initialSettingsTab || 'preferences');
  const [activeFile, setActiveFile] = useState('config');
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

  useEffect(() => {
    if (open && initialSettingsTab) {
      setActiveSettingsTab(initialSettingsTab);
    }
  }, [initialSettingsTab, open]);

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

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && (dirty || profileDirty || claudeProfileDirty || imageApiDirty || usageDirty)) {
      const meta = getConfigFileMeta(activeFile);
      const name = dirty
        ? meta.title
        : profileDirty ? t('codexQuickConfig') : claudeProfileDirty ? t('claudeQuickConfig') : imageApiDirty ? t('imageApiConfig') : t('usageTracking');
      if (!window.confirm(t('unsavedCloseConfirm', { name }))) {
        return;
      }
    }

    onOpenChange(nextOpen);
  };

  const switchFile = (nextFile) => {
    if (nextFile === activeFile) {
      return;
    }

    if (dirty && !window.confirm(t('switchDiscardConfirm'))) {
      return;
    }

    setActiveFile(nextFile);
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

  const selectClassName = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
  const normalizedCommandDockShortcuts = normalizeCommandDockShortcutSettings(commandDockShortcuts);

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
          className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-3"
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger className="shrink-0" value="preferences">{t('preferences')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="imageApi">{t('imageApiConfig')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="usage">{t('usageTracking')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="quickConfig">{t('codexQuickConfig')}</TabsTrigger>
            <TabsTrigger className="shrink-0" value="files">{t('configFiles')}</TabsTrigger>
          </TabsList>

          <TabsContent value="preferences" className="min-h-0 overflow-y-auto pr-1">
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
                    <select
                      id="commandDockSendShortcut"
                      className={selectClassName}
                      value={normalizedCommandDockShortcuts.sendShortcut}
                      onChange={(event) => onCommandDockShortcutChange?.('send', event.target.value)}
                    >
                      {commandDockShortcutOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="commandDockDispatchShortcut" className="text-xs text-muted-foreground">
                      {t('commandDockDispatchShortcut')}
                    </Label>
                    <select
                      id="commandDockDispatchShortcut"
                      className={selectClassName}
                      value={normalizedCommandDockShortcuts.dispatchShortcut}
                      onChange={(event) => onCommandDockShortcutChange?.('dispatch', event.target.value)}
                    >
                      {commandDockShortcutOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-xs leading-5 text-muted-foreground">
                  {t('commandDockShortcutHint')}
                </div>
              </div>
            </div>
          </div>
          </TabsContent>

          <TabsContent value="imageApi" className="min-h-0 overflow-y-auto pr-1">
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
                <Label className="text-xs font-medium text-muted-foreground">{t('imageApiCount')}</Label>
                <Input
                  type="number"
                  min="1"
                  max="4"
                  value={imageApiConfig.n}
                  onChange={(event) => handleImageApiConfigChange('n', event.target.value)}
                />
              </div>
              <div className="flex min-w-0 items-end gap-2 md:col-span-3">
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

          <TabsContent value="usage" className="min-h-0 overflow-y-auto pr-1">
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

          <TabsContent value="quickConfig" className="min-h-0 overflow-y-auto pr-1">
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
                <select
                  id="quickProfileSelect"
                  className={selectClassName}
                  value={selectedQuickProfileId}
                  title={quickProfilesPath}
                  onChange={(event) => handleQuickProfileSelect(event.target.value)}
                  disabled={quickProfilesLoading || profileSaving || restoring}
                >
                  <option value="">{t('currentCodexProfile')}</option>
                  {quickProfiles.map((record) => (
                    <option key={record.id} value={record.id}>{formatQuickProfileLabel(record)}</option>
                  ))}
                </select>
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
                <select
                  className={selectClassName}
                  value={profile.wireApi}
                  onChange={(event) => handleProfileChange('wireApi', event.target.value)}
                >
                  {wireApiOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('reasoningEffort')}</Label>
                <select
                  className={selectClassName}
                  value={profile.modelReasoningEffort}
                  onChange={(event) => handleProfileChange('modelReasoningEffort', event.target.value)}
                >
                  {reasoningEffortOptions.map((option) => (
                    <option key={option || 'default'} value={option}>{option || t('defaultValue')}</option>
                  ))}
                </select>
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
                <select
                  className={selectClassName}
                  value={profile.approvalPolicy}
                  onChange={(event) => handleProfileChange('approvalPolicy', event.target.value)}
                >
                  {approvalPolicyOptions.map((option) => (
                    <option key={option || 'default'} value={option}>{option || t('defaultValue')}</option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('sandboxMode')}</Label>
                <select
                  className={selectClassName}
                  value={profile.sandboxMode}
                  onChange={(event) => handleProfileChange('sandboxMode', event.target.value)}
                >
                  {sandboxModeOptions.map((option) => (
                    <option key={option || 'default'} value={option}>{option || t('defaultValue')}</option>
                  ))}
                </select>
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
                <select
                  id="claudeQuickProfileSelect"
                  className={selectClassName}
                  value={selectedClaudeQuickProfileId}
                  title={claudeQuickProfilesPath}
                  onChange={(event) => handleClaudeQuickProfileSelect(event.target.value)}
                  disabled={claudeQuickProfilesLoading || claudeProfileSaving || restoring}
                >
                  <option value="">{t('currentClaudeProfile')}</option>
                  {claudeQuickProfiles.map((record) => (
                    <option key={record.id} value={record.id}>{formatClaudeQuickProfileLabel(record)}</option>
                  ))}
                </select>
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
                <select
                  className={selectClassName}
                  value={claudeProfile.effortLevel}
                  onChange={(event) => handleClaudeProfileChange('effortLevel', event.target.value)}
                >
                  {claudeEffortLevelOptions.map((option) => (
                    <option key={option || 'default'} value={option}>{option || t('defaultValue')}</option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label className="text-xs font-medium text-muted-foreground">{t('claudePermissionMode')}</Label>
                <select
                  className={selectClassName}
                  value={claudeProfile.permissionMode}
                  onChange={(event) => handleClaudeProfileChange('permissionMode', event.target.value)}
                >
                  {claudePermissionModeOptions.map((option) => (
                    <option key={option || 'default'} value={option}>{option || t('defaultValue')}</option>
                  ))}
                </select>
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

          <TabsContent value="files" className="min-h-0 overflow-hidden">
          <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2">
          <div className="grid gap-1.5 rounded-md border border-border bg-card/70 p-3">
            <div className="text-sm font-semibold">{t('rawCodexEditor')}</div>
            <div className="text-xs text-muted-foreground">{t('rawCodexEditorDescription')}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground" title={pathText}>
              {pathText || getConfigFileMeta(activeFile).title}
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <Tabs value={activeFile} onValueChange={switchFile}>
              <TabsList>
                <TabsTrigger className={cn(activeFile === 'auth' && 'active')} data-codex-file="auth" value="auth" onClick={() => switchFile('auth')}>
                  auth.json
                </TabsTrigger>
                <TabsTrigger className={cn(activeFile === 'config' && 'active')} data-codex-file="config" value="config" onClick={() => switchFile('config')}>
                  config.toml
                </TabsTrigger>
                <TabsTrigger className={cn(activeFile === 'claudeSettings' && 'active')} data-config-file="claudeSettings" value="claudeSettings" onClick={() => switchFile('claudeSettings')}>
                  Claude settings.json
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <Label htmlFor="codexBackupSelect" className="text-xs font-medium text-muted-foreground">
                {t('backupHistory')}
              </Label>
              <select
                id="codexBackupSelect"
                className={cn(selectClassName, 'min-w-[220px] flex-1 md:w-[360px] md:flex-none')}
                value={selectedBackup}
                onChange={(event) => setSelectedBackup(event.target.value)}
                disabled={backupsLoading || restoring || backups.length === 0}
              >
                {backups.length === 0 ? (
                  <option value="">{backupsLoading ? t('loading') : t('noBackups')}</option>
                ) : backups.map((backup) => (
                  <option key={backup.name} value={backup.name}>{formatBackupLabel(backup)}</option>
                ))}
              </select>
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
      <select
        id={id}
        className={formSelectClassName}
        value={selectedCliProvider?.id || ''}
        onChange={(event) => onChange(event.target.value)}
      >
        {providers.map((provider) => {
          const optionCommand = (
            getCliLaunchCommand(provider, targetType)
            || getCliLaunchCommand(provider, 'project')
            || getCliLaunchCommand(provider, 'directory')
          );
          const optionLabel = optionCommand
            ? `${getCliProviderDisplayName(provider, language)} - ${optionCommand}`
            : getCliProviderDisplayName(provider, language);

          return (
            <option key={provider.id} value={provider.id}>
              {optionLabel}
            </option>
          );
        })}
      </select>
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
  defaultCwd,
  initialCliProviderId = defaultCliProviderId,
  language,
  onOpenChange,
  onSelect,
  open,
  projects,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const selectedInitialCliProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const [selectedCliProviderId, setSelectedCliProviderId] = useState(
    () => selectedInitialCliProviderId
  );
  const freeWindowDirectory = defaultCwd || t('defaultDirectory');
  const selectedCliProvider = resolveSelectableCliProvider(selectedCliProviderId, selectableCliProviders);
  const providerDescription = getCliProviderDescription(selectedCliProvider, language);
  const launchCommand = selectedCliProvider
    ? (
      getCliLaunchCommand(selectedCliProvider, 'project')
      || getCliLaunchCommand(selectedCliProvider, 'directory')
    )
    : '';

  useEffect(() => {
    if (open) {
      setSelectedCliProviderId(selectedInitialCliProviderId);
    }
  }, [open, selectedInitialCliProviderId]);

  useEffect(() => {
    if (!selectedCliProvider || !getCliProviderById(selectedCliProviderId)) {
      setSelectedCliProviderId(selectedInitialCliProviderId);
    }
  }, [selectedCliProvider, selectedCliProviderId, selectedInitialCliProviderId]);

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

          <div className="grid gap-2">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {t('cliTarget')}
            </div>

            {selectedCliProvider && cliProviderSupportsTarget(selectedCliProvider, 'directory') && (
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                onClick={() => onSelect({
                  cliProviderId: selectedCliProvider.id,
                  targetType: 'directory'
                })}
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

            {selectedCliProvider && cliProviderSupportsTarget(selectedCliProvider, 'project') && projects.length > 0 && (
              <div className="grid max-h-[min(360px,calc(100vh-360px))] gap-2 overflow-y-auto pr-1">
                {projects.map((project) => (
                  <Button
                    key={project.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                    onClick={() => onSelect({
                      cliProviderId: selectedCliProvider.id,
                      targetType: 'project',
                      projectId: project.id
                    })}
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
  showToast,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const initialProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const avatarInputRef = useRef(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');
  const [draftCliProviderId, setDraftCliProviderId] = useState(initialProviderId);
  const [draftAvatarPath, setDraftAvatarPath] = useState('');
  const [draftAvatarName, setDraftAvatarName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || null;
  const draftAgentForAvatar = selectedAgent
    ? { ...selectedAgent, avatarPath: draftAvatarPath, avatarName: draftAvatarName }
    : null;
  const normalizedName = draftName.trim();
  const normalizedTask = trimTrailingLineBreaks(taskDescription).trim();
  const dirty = Boolean(selectedAgent) && (
    normalizedName !== selectedAgent.name ||
    draftInstructions !== selectedAgent.instructions ||
    draftCliProviderId !== selectedAgent.cliProviderId ||
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
      return;
    }

    setDraftName(selectedAgent.name);
    setDraftInstructions(selectedAgent.instructions);
    setDraftCliProviderId(getInitialCliProviderId(selectedAgent.cliProviderId, selectableCliProviders));
    setDraftAvatarPath(selectedAgent.avatarPath || '');
    setDraftAvatarName(selectedAgent.avatarName || '');
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

function TopbarLaunchMenu({
  cliProviderId,
  language,
  onAddCommandLine,
  onAddGrid,
  onAddSession,
  onCliProviderChange,
  onOpenGridSessionDialog,
  onOpenSessionPicker,
  t
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['project', 'directory']), []);
  const selectedCliProviderId = getInitialCliProviderId(cliProviderId, selectableCliProviders);
  const selectedCliProvider = resolveSelectableCliProvider(selectedCliProviderId, selectableCliProviders);
  const selectedLabel = selectedCliProvider
    ? getCliProviderBadgeLabel(selectedCliProvider, language)
    : t('cliProvider');

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const closeOnPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const runAction = useCallback((handler, providerId = selectedCliProviderId) => {
    setOpen(false);
    handler(providerId);
  }, [selectedCliProviderId]);

  return (
    <div className="launch-menu" ref={rootRef}>
      <Button
        id="launchMenuButton"
        type="button"
        variant="primary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('launchMenuAria')}
        onClick={() => setOpen((current) => !current)}
      >
        <Plus className="h-4 w-4" />
        {t('launchMenu')}
        <span className="launch-menu-button-provider">
          {selectedLabel}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </Button>

      {open && (
        <div className="launch-menu-panel" role="menu" aria-label={t('launchMenuAria')}>
          <CliProviderSelectField
            id="topbarLaunchCliProvider"
            language={language}
            label={t('cliProvider')}
            onChange={onCliProviderChange}
            providerId={selectedCliProviderId}
            providers={selectableCliProviders}
            targetType="project"
            t={t}
          />

          <div className="launch-menu-divider" />

          <div className="launch-menu-actions">
            <button
              type="button"
              className="launch-menu-item"
              role="menuitem"
              onClick={() => runAction(onAddSession)}
            >
              <MessageSquarePlus className="launch-menu-item-icon" />
              <span className="launch-menu-item-copy">
                <span className="launch-menu-item-title">{t('addSession')}</span>
                <span className="launch-menu-item-subtitle">{t('launchAtCurrentWorkspace')}</span>
              </span>
            </button>
            <button
              type="button"
              className="launch-menu-item"
              role="menuitem"
              onClick={() => runAction(onOpenSessionPicker)}
            >
              <FolderOpen className="launch-menu-item-icon" />
              <span className="launch-menu-item-copy">
                <span className="launch-menu-item-title">{t('newSessionSource')}</span>
                <span className="launch-menu-item-subtitle">{t('launchChooseTarget')}</span>
              </span>
            </button>
            <button
              type="button"
              className="launch-menu-item"
              role="menuitem"
              onClick={() => runAction(onAddCommandLine, 'shell')}
            >
              <SquareTerminal className="launch-menu-item-icon" />
              <span className="launch-menu-item-copy">
                <span className="launch-menu-item-title">{t('addCommandLine')}</span>
                <span className="launch-menu-item-subtitle">{t('launchCurrentDirectory')}</span>
              </span>
            </button>
            <button
              type="button"
              className="launch-menu-item"
              role="menuitem"
              onClick={() => runAction(onAddGrid)}
            >
              <Grid2X2 className="launch-menu-item-icon" />
              <span className="launch-menu-item-copy">
                <span className="launch-menu-item-title">{t('quickGrid2x2')}</span>
                <span className="launch-menu-item-subtitle">{t('launchFourSessions')}</span>
              </span>
            </button>
            <button
              type="button"
              className="launch-menu-item"
              role="menuitem"
              onClick={() => runAction(onOpenGridSessionDialog)}
            >
              <LayoutGrid className="launch-menu-item-icon" />
              <span className="launch-menu-item-copy">
                <span className="launch-menu-item-title">{t('addSessionGrid')}</span>
                <span className="launch-menu-item-subtitle">{t('launchCustomCount')}</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemStats({ stats, t }) {
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
        <span className="font-mono tabular-nums text-foreground">{cpuText}</span>
      </div>
      <div className={memoryBlockClassName} title={memoryTitle}>
        <MemoryStick className={cn('h-3.5 w-3.5 text-primary', memoryTone === 'warning' && 'text-amber-700 dark:text-amber-300', memoryTone === 'critical' && 'text-red-700 dark:text-red-200')} />
        <span className="font-medium">{t('memoryUsage')}</span>
        <span className={memoryValueClassName}>{memoryText}</span>
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
    const requestedName = window.prompt(
      t('commandPresetNamePrompt'),
      selectedCommandPreset?.name || fallbackName
    );
    if (requestedName === null) {
      return;
    }

    const name = requestedName.trim();
    if (!name) {
      showToast?.(t('commandPresetNameRequired'));
      return;
    }

    setCommandPresetSaving(true);
    try {
      const store = await onCommandPresetSave({
        id: selectedCommandPreset?.id || '',
        name,
        command: normalizedCommand
      });
      const savedPreset = store?.savedPreset || null;
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
                <select
                  id="commandPresetSelect"
                  className={formSelectClassName}
                  value={selectedCommandPresetId}
                  title={commandPresetsPath}
                  disabled={commandPresetsLoading || commandPresetSaving}
                  onChange={(event) => selectCommandPreset(event.target.value)}
                >
                  <option value="">{t('commandPresetNone')}</option>
                  {commandPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                      {preset.id === activeCommandPresetId ? ` (${t('commandPresetDefaultBadge')})` : ''}
                    </option>
                  ))}
                </select>
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
  t,
  detail = false,
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
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const changelogRequestIdRef = useRef(0);
  const versionLabel = formatVersionLabel(appVersion);

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
      <button
        ref={triggerRef}
        type="button"
        className={cn('sidebar-version-button', compact && 'compact')}
        title={`${t('currentVersion')} ${versionLabel}`}
        aria-label={`${t('currentVersion')} ${versionLabel}`}
        aria-controls={open ? 'releaseInfoPanel' : undefined}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Badge variant="outline" className={cn('sidebar-version-badge', compact && 'compact')}>
          {versionLabel}
        </Badge>
      </button>

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
            t={t}
            detail
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
            <div className="sidebar-empty">{t('loading')}</div>
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
  workspace,
  activeProject,
  historyProject,
  theme,
  onAddProject,
  onAddCommandLine,
  onCanvasModeChange,
  onKillAll,
  onAddSession,
  onToggleImageGeneration,
  onOpenPath,
  onOpenCodexConfig,
  onRefreshSkills,
  onDeleteProject,
  onReorderProjects,
  onSelectNoProject,
  onSelectProject,
  onThemeChange,
  onToggleProjectPinned,
  onToggleSkillsCollapsed,
  skillsRootPath,
  skillsState,
  t,
  imageGenerationOpen,
  onToggleCollapsed
}) {
  const collapsed = workspace.sidebarCollapsed;
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

  if (collapsed) {
    return (
      <Sidebar collapsed>
        <img className="brand-logo brand-logo-collapsed" src={appLogoUrl} alt="" aria-hidden="true" draggable="false" />
        <IconButton label={t('expandSidebar')} onClick={onToggleCollapsed}>
          <PanelLeftOpen className="h-4 w-4" />
        </IconButton>
        <IconButton label={t('addSession')} onClick={onAddSession}>
          <MessageSquarePlus className="h-4 w-4" />
        </IconButton>
        <IconButton label={t('addCommandLine')} onClick={onAddCommandLine}>
          <SquareTerminal className="h-4 w-4" />
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
        <div className="sidebar-rail-spacer" />
        {historyProject && (
          <IconButton
            label={t('historyFolder')}
            variant={activeProject?.id === historyProject.id ? 'primary' : 'default'}
            onClick={() => onSelectProject(historyProject.id)}
          >
            <FolderOpen className="h-4 w-4" />
          </IconButton>
        )}
        <SidebarThemeControl compact theme={theme} onThemeChange={onThemeChange} t={t} />
        <IconButton label={t('settings')} onClick={onOpenCodexConfig}>
          <Settings2 className="h-4 w-4" />
        </IconButton>
        <ReleaseInfo
          appVersion={appVersion}
          t={t}
          compact
        />
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex min-w-0 items-center gap-2.5">
          <img className="brand-logo" src={appLogoUrl} alt="" aria-hidden="true" draggable="false" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">CLI in One</div>
            <div className="truncate text-xs text-muted-foreground">{t('appSubtitle')}</div>
          </div>
        </div>
        <IconButton label={t('collapseSidebar')} onClick={onToggleCollapsed}>
          <PanelLeftClose className="h-4 w-4" />
        </IconButton>
      </SidebarHeader>

      <div className="sidebar-actions">
        <Button className="w-full justify-start" variant="ghost" onClick={onAddSession}>
          <MessageSquarePlus className="h-4 w-4" />
          {t('addSession')}
        </Button>
        <Button className="w-full justify-start" variant="ghost" onClick={onAddCommandLine}>
          <SquareTerminal className="h-4 w-4" />
          {t('addCommandLine')}
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
            <span>{t('canvasMode')}</span>
          </div>
          <fieldset className="sidebar-radio-group" aria-label={t('canvasMode')}>
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  className={cn('sidebar-radio-option', workspace.canvasMode === 'project' && 'is-selected')}
                  htmlFor="canvasModeProjectRadio"
                >
                  <input
                    id="canvasModeProjectRadio"
                    className="sidebar-radio-input"
                    type="radio"
                    name="sidebarCanvasMode"
                    value="project"
                    checked={workspace.canvasMode === 'project'}
                    onChange={() => onCanvasModeChange('project')}
                  />
                  <span>{t('canvasModeProject')}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] whitespace-normal leading-5">
                {t('canvasModeProjectTooltip')}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  className={cn('sidebar-radio-option', workspace.canvasMode === 'shared' && 'is-selected')}
                  htmlFor="canvasModeSharedRadio"
                >
                  <input
                    id="canvasModeSharedRadio"
                    className="sidebar-radio-input"
                    type="radio"
                    name="sidebarCanvasMode"
                    value="shared"
                    checked={workspace.canvasMode === 'shared'}
                    onChange={() => onCanvasModeChange('shared')}
                  />
                  <span>{t('canvasModeShared')}</span>
                </label>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] whitespace-normal leading-5">
                {t('canvasModeSharedTooltip')}
              </TooltipContent>
            </Tooltip>
          </fieldset>
        </SidebarSection>

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

            {userProjects.map((project) => (
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
            ))}
          </div>
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
        {historyProject && (
          <div className="sidebar-footer-history">
            <button
              type="button"
              className={cn('sidebar-history top-level', activeProject?.id === historyProject.id && 'active')}
              title={historyProject.path}
              onClick={() => onSelectProject(historyProject.id)}
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t('historyFolder')}</span>
            </button>
          </div>
        )}
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
    </Sidebar>
  );
}

export default function App() {
  const initialSettings = useMemo(loadSettings, []);
  const initialWorkspace = useMemo(loadWorkspace, []);
  const initialAgents = useMemo(loadAgents, []);
  const initialView = useMemo(() => normalizeCanvasView(initialSettings.view), [initialSettings.view]);
  const [cwd, setCwd] = useState(initialSettings.cwd);
  const [theme, setTheme] = useState(initialSettings.theme);
  const [language, setLanguage] = useState(initialSettings.language);
  const [view, setView] = useState(initialView);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [agents, setAgents] = useState(initialAgents);
  const [panels, setPanels] = useState([]);
  const [endpointGroups, setEndpointGroups] = useState([]);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [activeCanvasFrameId, setActiveCanvasFrameId] = useState(null);
  const [activeCanvasTodoId, setActiveCanvasTodoId] = useState(null);
  const [pendingCanvasFrame, setPendingCanvasFrame] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState(null);
  const [launchCliProviderId, setLaunchCliProviderId] = useState(defaultCliProviderId);
  const [codexOpen, setCodexOpen] = useState(false);
  const [codexInitialTab, setCodexInitialTab] = useState('preferences');
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [gridSessionOpen, setGridSessionOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(false);
  const [sessionReviewOpen, setSessionReviewOpen] = useState(false);
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
  const [systemStats, setSystemStats] = useState(null);
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  const [appInfo, setAppInfo] = useState({ appVersion: '' });
  const [codexProfileState, setCodexProfileState] = useState(createEmptyCodexProfile);
  const [codexProfileLoading, setCodexProfileLoading] = useState(true);
  const [panning, setPanning] = useState(false);
  const [toast, setToast] = useState('');
  const [commandDockValue, setCommandDockValue] = useState('');
  const [commandDockTargetId, setCommandDockTargetId] = useState('');
  const [commandDockCollapsed, setCommandDockCollapsed] = useState(false);
  const [commandDockPosition, setCommandDockPosition] = useState(initialSettings.commandDockPosition);
  const [commandDockHistory, setCommandDockHistory] = useState(initialSettings.commandDockHistory);
  const [commandDockDispatchMode, setCommandDockDispatchMode] = useState(initialSettings.commandDockDispatchMode);
  const [commandDockShortcuts, setCommandDockShortcuts] = useState(initialSettings.commandDockShortcuts);
  const [commandDockTaskDispatching, setCommandDockTaskDispatching] = useState(false);
  const [commandDockDispatchSparkles, setCommandDockDispatchSparkles] = useState({});
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
  const panelActivityQueueRef = useRef(new Map());
  const panelActivityFlushTimer = useRef(null);
  const sessionReviewRecordsRef = useRef({});
  const sessionReviewFlushTimer = useRef(null);
  const panelExecutionStatesRef = useRef(new Map());
  const terminalInstances = useRef(new Map());
  const panelsRef = useRef([]);
  const endpointGroupsRef = useRef([]);
  const workspaceRef = useRef(workspace);
  const historyProjectRef = useRef(historyProject);
  const viewRef = useRef(view);
  const canvasScopeKeyRef = useRef(getWorkspaceCanvasKey(initialWorkspace));
  const activeIdRef = useRef(null);
  const activeCanvasFrameIdRef = useRef(null);
  const activeCanvasTodoIdRef = useRef(null);
  const cwdRef = useRef(cwd);
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
    () => String(cwd || activeProject?.path || defaultCwd || '').trim(),
    [activeProject?.path, cwd, defaultCwd]
  );
  const skillsRootPath = currentWorkspacePath;
  const t = useCallback((key, values) => translate(language, key, values), [language]);
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
    [panels, runtimeNow]
  );
  const visibleCanvasFrames = useMemo(
    () => getWorkspaceCanvasFrames(workspace),
    [workspace]
  );
  const visibleCanvasTodos = useMemo(
    () => getWorkspaceCanvasTodos(workspace),
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
  const groupableEndpointCount = useMemo(() => {
    const visibleEndpoints = visiblePanels.filter((panel) => panel.minimized);
    const selectedVisibleCount = visibleEndpoints.filter((panel) => selectedEndpointIds.has(panel.id)).length;
    return selectedVisibleCount || visibleEndpoints.length;
  }, [selectedEndpointIds, visiblePanels]);
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
  }, [activeId, language, runtimeNow, visiblePanels]);
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
    if (panels.length === 0) {
      panelExecutionStatesRef.current = new Map();
      return undefined;
    }

    setRuntimeNow(Date.now());
    const timer = window.setInterval(() => setRuntimeNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [panels.length]);

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
    setPendingCanvasFrame(false);
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
  }, [language, panels, runtimeNow, showToast, t]);

  useEffect(() => {
    if (imageGenerationHistoryLoadStartedRef.current) {
      return undefined;
    }

    imageGenerationHistoryLoadStartedRef.current = true;
    if (typeof bridge.listImageGenerationHistory !== 'function') {
      setImageGenerationHistoryLoaded(true);
      return undefined;
    }

    let canceled = false;
    bridge.listImageGenerationHistory().then((store) => {
      if (canceled) {
        return;
      }

      imageGenerationHistorySkipNextSaveRef.current = true;
      setImageGenerationResults(normalizeImageGenerationHistoryItems(store?.items));
      setImageGenerationHistoryLoaded(true);
    }).catch((error) => {
      if (canceled) {
        return;
      }

      imageGenerationHistorySkipNextSaveRef.current = true;
      setImageGenerationHistoryLoaded(true);
      showToast(t('imageGenerationHistoryLoadFailed', { message: error.message }));
    });

    return () => {
      canceled = true;
    };
  }, [showToast, t]);

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

  const loadQuickPrompts = useCallback(async () => {
    setQuickPromptsLoading(true);
    try {
      const store = await bridge.listQuickPrompts();
      setQuickPrompts(Array.isArray(store.prompts) ? store.prompts : []);
      setQuickPromptsPath(store.path || '');
      return store;
    } finally {
      setQuickPromptsLoading(false);
    }
  }, []);

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
    loadQuickPrompts().catch((error) => {
      setQuickPrompts([]);
      setQuickPromptsPath('');
      showToast(t('quickPromptLoadFailed', { message: error.message }));
    });
  }, [loadQuickPrompts, showToast, t]);

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
      const snapshot = await bridge.readWorkspaceTree({ cwd: requestedPath });
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
      const snapshot = normalizeWorkspaceSkillsSnapshot(
        await bridge.readWorkspaceSkills({ cwd: requestedPath }),
        requestedPath
      );
      if (workspaceSkillsRequestIdRef.current !== requestId) {
        return null;
      }

      setWorkspaceSkillsState({
        status: 'ready',
        snapshot,
        error: '',
        requestedPath: snapshot.cwd || requestedPath
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

  useEffect(() => {
    void loadWorkspaceSkills(skillsRootPath, { quiet: true });
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
    setRuntimeNow(Date.now());
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

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => () => window.clearTimeout(panelActivityFlushTimer.current), []);
  useEffect(() => () => window.clearTimeout(sessionReviewFlushTimer.current), []);
  useEffect(() => () => {
    commandDockDispatchSparkleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    commandDockDispatchSparkleTimersRef.current.clear();
  }, []);
  useEffect(() => () => window.clearTimeout(canvasArrangeTimerRef.current), []);

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

  const promptQuickPromptName = useCallback((fallback) => {
    const value = window.prompt(t('quickPromptNamePrompt'), fallback);
    if (value === null) {
      return null;
    }

    const name = value.trim();
    if (!name) {
      showToast(t('quickPromptNameRequired'));
      return null;
    }

    return name;
  }, [showToast, t]);

  const saveCommandDockPrompt = useCallback(async () => {
    if (quickPromptsLoading) {
      return false;
    }

    const prompt = trimTrailingLineBreaks(commandDockInputRef.current?.value ?? commandDockValue);
    if (!String(prompt || '').trim()) {
      showToast(t('quickPromptContentRequired'));
      return false;
    }

    const title = promptQuickPromptName(deriveQuickPromptTitle(prompt, t('quickPromptDefaultName')));
    if (!title) {
      return false;
    }

    setQuickPromptsLoading(true);
    try {
      const store = await bridge.saveQuickPrompt({ title, prompt });
      const prompts = Array.isArray(store.prompts) ? store.prompts : [];
      const savedPrompt = store.savedPrompt || prompts.find((record) => record.title === title);

      setQuickPrompts(prompts);
      setQuickPromptsPath((current) => store.path || current);
      showToast(t('quickPromptSaved', { name: savedPrompt?.title || title }));
      return true;
    } catch (error) {
      showToast(t('quickPromptSaveFailed', { message: error.message }));
      return false;
    } finally {
      setQuickPromptsLoading(false);
    }
  }, [commandDockValue, promptQuickPromptName, quickPromptsLoading, showToast, t]);

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

    setQuickPromptsLoading(true);
    try {
      const store = await bridge.deleteQuickPrompt(promptId);
      setQuickPrompts(Array.isArray(store.prompts) ? store.prompts : []);
      setQuickPromptsPath((current) => store.path || current);
      showToast(t('quickPromptDeleted', { name: store.deletedPrompt?.title || title }));
      return true;
    } catch (error) {
      showToast(t('quickPromptDeleteFailed', { message: error.message }));
      return false;
    } finally {
      setQuickPromptsLoading(false);
    }
  }, [quickPromptsLoading, showToast, t]);

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

  const insertWorkspaceTreePathIntoCommandDock = useCallback((targetPath) => {
    const normalizedPath = String(targetPath || '').trim();
    if (!normalizedPath || !commandDockVisible) {
      return false;
    }

    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }

    insertTextIntoCommandDock(normalizedPath);
    showToast(t('workspaceTreePathInserted', { path: normalizedPath }));
    return true;
  }, [commandDockCollapsed, commandDockVisible, insertTextIntoCommandDock, showToast, t]);

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
      const references = [];
      for (const file of imageFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const savedImage = await bridge.saveCommandDockImage({
          fileName: file.name,
          mimeType: file.type,
          bytes: new Uint8Array(arrayBuffer)
        });
        references.push(t('floatingComposerImageReference', {
          path: normalizePromptFilePath(savedImage.path)
        }));
      }

      insertTextIntoCommandDock(references.join('\n'));
      showToast(t('floatingComposerImagesAdded', { count: references.length }));
      return true;
    } catch (error) {
      showToast(t('floatingComposerImageSaveFailed', { message: error.message }));
      return false;
    }
  }, [insertTextIntoCommandDock, showToast, t]);

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
    const count = Number.parseInt(options.n, 10);
    const n = Number.isFinite(count) ? Math.min(4, Math.max(1, count)) : undefined;
    const referenceImageUrls = Array.isArray(options.referenceImageUrls)
      ? options.referenceImageUrls.map((url) => String(url || '').trim()).filter(Boolean)
      : [];
    const taskId = createLocalId('image-task');
    const pendingTask = createImageGenerationTaskItem({
      id: taskId,
      prompt,
      model,
      n,
      size,
      referenceImageCount: referenceImageUrls.length,
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
        ...(n ? { n } : {}),
        ...(referenceImageUrls.length > 0 ? { referenceImageUrls } : {})
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
      showToast(t('imageGenerationFailed', { message }));
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
        setImageGenerationResults((current) => {
          const withoutTask = current.filter((item) => item.id !== id);
          return images.length > 0
            ? [...images, ...withoutTask].slice(0, 40)
            : withoutTask;
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
    if (!String(nextValue || '').trim()) {
      return false;
    }

    touchPanelActivity(targetPanel.id);
    submitCommandDockPayload(targetPanel.id, nextValue);
    flashCommandDockDispatchTargets(targetPanel.id);
    centerCanvasOnCommandDockTarget(targetPanel);
    rememberCommandDockHistory(nextValue);
    setCommandDockValue('');
    closeCommandDockSkillMention();
    showToast(t('floatingComposerSent', { name: targetPanel.title }));
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      commandDockInputRef.current?.focus();
    });
    return true;
  }, [centerCanvasOnCommandDockTarget, closeCommandDockSkillMention, commandDockPanels, commandDockTargetId, commandDockValue, flashCommandDockDispatchTargets, rememberCommandDockHistory, resizeCommandDockInput, showToast, submitCommandDockPayload, t, touchPanelActivity]);

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

  const loadCodexProfile = useCallback(async ({ quiet = false } = {}) => {
    try {
      const snapshot = await bridge.readCodexProfile();
      const normalizedProfile = normalizeCodexProfile(snapshot.profile);
      setCodexProfileState(normalizedProfile);
      return normalizedProfile;
    } catch (error) {
      if (!quiet) {
        showToast(t('codexProfileReadFailed', { message: error.message }));
      }
      throw error;
    } finally {
      setCodexProfileLoading(false);
    }
  }, [showToast, t]);

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

  useEffect(() => {
    bridge.getAppInfo().then((info) => {
      setAppInfo(info);
      setDefaultCwd(info.homeDir || '');
      setHistoryProject(createHistoryProject(info.historyDir));
      if (!cwdRef.current) {
        setCwd(activeProject?.path || info.homeDir || '');
      }
      if (!info.ptyEnabled) {
        showToast(t('ptyFallback'));
      }
    }).catch((error) => {
      showToast(error.message);
    });
  }, [activeProject?.path, showToast, t]);

  useEffect(() => {
    loadCodexProfile({ quiet: true }).catch(() => {});
  }, [loadCodexProfile]);

  useEffect(() => {
    let canceled = false;

    const refreshStats = () => {
      bridge.getSystemStats().then((stats) => {
        if (!canceled) {
          setSystemStats(stats);
        }
      }).catch(() => {
        if (!canceled) {
          setSystemStats(null);
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
        view,
        commandDockDispatchMode,
        commandDockShortcuts: normalizeCommandDockShortcutSettings(commandDockShortcuts),
        commandDockPosition,
        commandDockHistory
      }));
    }, 180);
  }, [commandDockDispatchMode, commandDockHistory, commandDockPosition, commandDockShortcuts, cwd, language, theme, view]);

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

  useEffect(() => {
    const offData = bridge.onTerminalData(({ id, data }) => {
      touchPanelActivity(id);
      appendSessionReviewRecord(id, data);
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
  }, [appendSessionReviewRecord, touchPanelActivity]);

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
    updateCanvasFramesForKey(canvasKey, (currentFrames) => [...currentFrames, frame]);
  }, [t, updateCanvasFramesForKey]);

  const activateCanvasTodo = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
    setActiveId(null);
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
    updateCanvasTodosForKey(canvasKey, (currentTodos) => currentTodos.map((todo) => (
      todo.id === id ? normalizeCanvasTodo({ ...todo, ...patch }) : todo
    )));
  }, [updateCanvasTodosForKey]);

  const updateCanvasTodoItems = useCallback((id, updater) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
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
    updateCanvasTodosForKey(canvasKey, (currentTodos) => [...currentTodos, todo]);
    showToast(t('canvasTodoAdded'));
  }, [showToast, t, updateCanvasTodosForKey, viewportCenterOnCanvas]);

  const commitCanvasTodoTitle = useCallback((id, title) => {
    const nextTitle = String(title || '').trim() || t('canvasTodoDefaultTitle');
    updateCanvasTodo(id, { title: nextTitle });
  }, [t, updateCanvasTodo]);

  const toggleCanvasTodoPinned = useCallback((id) => {
    const canvasKey = getWorkspaceCanvasKey(workspaceRef.current);
    setActiveCanvasTodoId(id);
    setActiveCanvasFrameId(null);
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
        done: false,
        createdAt: now,
        updatedAt: now
      }
    ]);
  }, [updateCanvasTodoItems]);

  const updateCanvasTodoItemDone = useCallback((todoId, itemId, done) => {
    const now = Date.now();
    updateCanvasTodoItems(todoId, (items) => items.map((item) => (
      item.id === itemId
        ? { ...item, done: Boolean(done), updatedAt: now }
        : item
    )));
  }, [updateCanvasTodoItems]);

  const updateCanvasTodoItemText = useCallback((todoId, itemId, text) => {
    const now = Date.now();
    updateCanvasTodoItems(todoId, (items) => items.map((item) => (
      item.id === itemId
        ? { ...item, text: String(text || ''), updatedAt: now }
        : item
    )));
  }, [updateCanvasTodoItems]);

  const removeCanvasTodoItem = useCallback((todoId, itemId) => {
    updateCanvasTodoItems(todoId, (items) => items.filter((item) => item.id !== itemId));
  }, [updateCanvasTodoItems]);

  const createTerminal = useCallback(async (slot = {}) => {
    const center = viewportCenterOnCanvas();
    const width = Number.isFinite(slot.width) ? slot.width : 640;
    const height = Number.isFinite(slot.height) ? slot.height : 380;
    const x = Number.isFinite(slot.x) ? slot.x : center.x - width / 2;
    const y = Number.isFinite(slot.y) ? slot.y : center.y - height / 2;
    const projectId = Object.prototype.hasOwnProperty.call(slot, 'projectId')
      ? slot.projectId || null
      : workspaceRef.current.activeProjectId || null;
    const terminalCwd = Object.prototype.hasOwnProperty.call(slot, 'cwd')
      ? slot.cwd
      : cwdRef.current;
    const cliProvider = resolveCliProvider(slot.cliProviderId, slot.initialCommand);
    const cliProviderId = cliProvider?.id || defaultCliProviderId;
    const targetType = slot.targetType === 'directory' ? 'directory' : 'project';
    const initialCommand = Object.prototype.hasOwnProperty.call(slot, 'initialCommand')
      ? slot.initialCommand
      : getCliLaunchCommand(cliProvider, targetType);
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
    window.requestAnimationFrame(() => focusTerminalInstance(meta.id));
    return panel;
  }, [focusTerminalInstance, getVisiblePanels, language, viewportCenterOnCanvas]);

  const getCurrentSessionLaunchContext = useCallback(() => {
    const projectId = workspaceRef.current.activeProjectId || null;
    const project = findProjectById(
      workspaceRef.current.projects,
      historyProjectRef.current,
      projectId
    );
    const sessionCwd = String(cwdRef.current || '').trim()
      || project?.path
      || defaultCwd
      || '';

    return {
      projectId,
      cwd: sessionCwd,
      targetType: projectId ? 'project' : 'directory'
    };
  }, [defaultCwd]);

  const runAgentTask = useCallback((agent, taskDescription) => {
    const normalizedAgent = normalizeAgentRecord(agent);
    const task = String(taskDescription || '').trim();
    if (!normalizedAgent) {
      showToast(t('agentRequired'));
      return;
    }
    if (!task) {
      showToast(t('agentTaskRequired'));
      return;
    }

    const run = async () => {
      const cliProvider = resolveCliProvider(normalizedAgent.cliProviderId || launchCliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;
      const launchContext = getCurrentSessionLaunchContext();
      const prompt = buildAgentTaskPrompt(normalizedAgent, task);

      if (launchContext.cwd && launchContext.cwd !== cwdRef.current) {
        setCwd(launchContext.cwd);
      }

      setLaunchCliProviderId(cliProviderId);
      const panel = await createTerminal({
        ...getCenteredTerminalSlot(workspaceRef.current, 700, 420),
        ...launchContext,
        title: normalizedAgent.name,
        cliProviderId
      });

      window.setTimeout(() => {
        touchPanelActivity(panel.id);
        submitTerminalTextPayload(panel.id, prompt);
      }, agentTaskSubmitDelayMs);

      showToast(t('agentStarted', { name: normalizedAgent.name }));
    };

    run().catch((error) => showToast(error.message));
  }, [
    createTerminal,
    getCenteredTerminalSlot,
    getCurrentSessionLaunchContext,
    launchCliProviderId,
    showToast,
    submitTerminalTextPayload,
    t,
    touchPanelActivity
  ]);

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
            getPanelExecutionState(panel, runtimeNow) === 'idle'
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
          commandDockInputRef.current?.focus();
        });
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
    getCenteredTerminalSlot,
    getCurrentSessionLaunchContext,
    language,
    launchCliProviderId,
    rememberCommandDockHistory,
    resizeCommandDockInput,
    runtimeNow,
    showToast,
    submitTerminalTextPayload,
    t,
    touchPanelActivity
  ]);
  commandDockDispatchTasksRef.current = dispatchCommandDockTasks;

  const createWorkspaceCommandLineFromConfig = useCallback((config = {}) => {
    const run = async () => {
      const launchContext = getCurrentSessionLaunchContext();
      const nextCwd = String(config.cwd || '').trim() || launchContext.cwd;
      const cliProvider = resolveCliProvider(config.cliProviderId || launchCliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;
      const hasExplicitInitialCommand = Object.prototype.hasOwnProperty.call(config, 'initialCommand');
      const presetInitialCommand = cliProviderId === 'shell'
        ? normalizeCommandPresetCommandInput(activeCommandPresetRef.current?.command)
        : '';
      const terminalSlot = {
        projectId: Object.prototype.hasOwnProperty.call(config, 'projectId')
          ? config.projectId
          : launchContext.projectId,
        cwd: nextCwd,
        cliProviderId,
        targetType: 'directory'
      };

      if (hasExplicitInitialCommand) {
        terminalSlot.initialCommand = normalizeCommandPresetCommandInput(config.initialCommand);
      } else if (presetInitialCommand) {
        terminalSlot.initialCommand = presetInitialCommand;
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
  }, []);

  const restartTerminal = useCallback(async (id) => {
    const panel = panelsRef.current.find((item) => item.id === id);
    if (!panel) {
      return;
    }

    await closeTerminal(id);
    await createTerminal({
      title: panel.title,
      projectId: panel.projectId || null,
      cwd: panel.cwd,
      cliProviderId: panel.cliProviderId,
      initialCommand: Object.prototype.hasOwnProperty.call(panel, 'initialCommand')
        ? panel.initialCommand
        : getCliLaunchCommand(getPanelCliProvider(panel), panel.projectId ? 'project' : 'directory'),
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      tag: getPanelSessionTag(panel)
    });
  }, [closeTerminal, createTerminal]);

  const updatePanel = useCallback((id, patch) => {
    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, ...patch } : panel
    )));
  }, []);

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

    if (panel.minimized) {
      expandPanel(id);
      return;
    }

    activatePanel(id);
  }, [activatePanel, expandPanel]);

  const setCommandTargetFromReview = useCallback((id) => {
    setCommandDockTargetId(id);
    if (commandDockCollapsed) {
      setCommandDockCollapsed(false);
    }
    window.requestAnimationFrame(() => commandDockInputRef.current?.focus());
  }, [commandDockCollapsed]);

  const copySessionReviewSummary = useCallback(() => {
    const text = buildSessionReviewSummaryText({
      panels: commandDockPanels,
      records: sessionReviewRecordsRef.current,
      runtimeNow,
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
  }, [commandDockPanels, language, runtimeNow, showToast, t]);

  const copySessionReviewRecord = useCallback((id) => {
    const panel = commandDockPanels.find((item) => item.id === id)
      || panelsRef.current.find((item) => item.id === id);
    if (!panel) {
      return;
    }

    const text = buildSessionReviewSummaryText({
      panels: [panel],
      records: sessionReviewRecordsRef.current,
      runtimeNow,
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
  }, [commandDockPanels, language, runtimeNow, showToast, t]);

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
    const center = viewportCenterOnCanvas();
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
    if (launchContext.cwd && launchContext.cwd !== cwdRef.current) {
      setCwd(launchContext.cwd);
    }

    for (let index = 0; index < sessionCount; index += 1) {
      await createTerminal({
        ...launchContext,
        x: startX + (index % cols) * (width + gap),
        y: startY + Math.floor(index / cols) * (height + gap),
        width,
        height,
        cliProviderId
      });
    }
  }, [createTerminal, getCurrentSessionLaunchContext, launchCliProviderId, viewportCenterOnCanvas]);

  const addGrid = useCallback((cliProviderId) => {
    createSessionGrid(4, typeof cliProviderId === 'string' ? { cliProviderId } : {})
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

      if (launchContext.cwd && launchContext.cwd !== cwdRef.current) {
        setCwd(launchContext.cwd);
      }

      await createTerminal({
        ...getCenteredTerminalSlot(workspaceRef.current),
        ...launchContext,
        cliProviderId
      });
      setLaunchCliProviderId(cliProviderId);
    };

    run().catch((error) => showToast(error.message));
  }, [createTerminal, getCenteredTerminalSlot, getCurrentSessionLaunchContext, launchCliProviderId, openNewSessionPicker, showToast]);

  const createSessionFromSelection = useCallback((selection) => {
    setNewSessionOpen(false);

    const run = async () => {
      const cliProvider = resolveCliProvider(selection?.cliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;
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
          targetType: 'project'
        });
        return;
      }

      const sessionCwd = defaultCwd || '';
      const nextWorkspace = commitWorkspace((currentWorkspace) => ({
        ...currentWorkspace,
        activeProjectId: null
      }));
      setCwd(sessionCwd);
      await createTerminal({
        ...getCenteredTerminalSlot(nextWorkspace),
        projectId: null,
        cwd: sessionCwd,
        cliProviderId,
        targetType: 'directory'
      });
    };

    run().catch((error) => showToast(error.message));
  }, [commitWorkspace, createTerminal, defaultCwd, getCenteredTerminalSlot, showToast]);

  const killAll = useCallback(async () => {
    if (panelsRef.current.length === 0 || !window.confirm(t('closeAllConfirm'))) {
      return;
    }

    await bridge.killAllTerminals();
    setPanels([]);
    setEndpointGroups([]);
    setSelectedEndpointIds(new Set());
    setActiveId(null);
  }, [t]);

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
    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, canvasMode: mode }));
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
    closeTerminal,
    closeCanvasContextMenu,
    createWorkspaceCommandLine,
    createWorkspaceSession,
    deleteCanvasFrame,
    deleteCanvasTodo,
    openNewSessionPicker,
    pendingCanvasFrame
  ]);

  const minorGrid = 48 * view.scale;
  const majorGrid = minorGrid * 4;
  const activeTitle = workspace.canvasMode === 'shared'
    ? t('sharedWorkspace')
    : activeProject ? `${activeProject.name} ${t('workspace')}` : t('noProject');
  const currentZoomPercent = Math.round(view.scale * 100);
  const currentZoomPresetScale = zoomPresetScales.find((scale) => Math.abs(view.scale - scale) < 0.01);
  const zoomSelectValue = currentZoomPresetScale ? String(currentZoomPresetScale) : 'current';

  return (
    <TooltipProvider>
      <div className={cn('app-shell', workspace.sidebarCollapsed && 'sidebar-is-collapsed')}>
        <WorkspaceSidebar
          appVersion={appInfo.appVersion}
          workspace={workspace}
          activeProject={activeProject}
          historyProject={historyProject}
          theme={theme}
          onAddProject={openProjectDialog}
          onAddCommandLine={openCommandLineDialog}
          onAddSession={openNewSessionPicker}
          onCanvasModeChange={changeCanvasMode}
          onKillAll={killAll}
          onToggleImageGeneration={toggleImageGeneration}
          onOpenPath={openWorkspacePath}
          onOpenCodexConfig={openCodexSettings}
          onRefreshSkills={refreshWorkspaceSkills}
          onDeleteProject={deleteProject}
          onReorderProjects={reorderProjects}
          onSelectNoProject={selectNoProject}
          onSelectProject={selectProject}
          onThemeChange={setTheme}
          onToggleProjectPinned={toggleProjectPinned}
          onToggleSkillsCollapsed={toggleSkillsCollapsed}
          skillsRootPath={skillsRootPath}
          skillsState={workspaceSkillsState}
          t={t}
          imageGenerationOpen={imageGenerationOpen}
          onToggleCollapsed={toggleSidebar}
        />

        <div className="main-shell">
          <header className="topbar">
            <div className="min-w-[160px] max-w-[260px]">
              <div className="truncate text-sm font-semibold">{activeTitle}</div>
              <div className="truncate text-xs text-muted-foreground">
                {activeProject ? activeProject.path : (cwd || t('noProject'))}
              </div>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <TopbarSessionStats counts={crossProjectSessionCounts} t={t} />

            <div className="flex shrink-0 items-center gap-2">
              <TopbarLaunchMenu
                cliProviderId={launchCliProviderId}
                language={language}
                onAddCommandLine={createWorkspaceCommandLine}
                onAddGrid={addGrid}
                onAddSession={(cliProviderId) => createWorkspaceSession(null, { cliProviderId })}
                onCliProviderChange={setLaunchCliProviderId}
                onOpenGridSessionDialog={openGridSessionDialog}
                onOpenSessionPicker={openNewSessionPicker}
                t={t}
              />
              <Button type="button" variant="outline" onClick={() => setAgentsOpen(true)}>
                <Bot className="h-4 w-4" />
                {t('agents')}
              </Button>
            </div>

            <Separator orientation="vertical" className="ml-auto h-8" />

            <div className="flex shrink-0 items-center gap-1.5">
              <IconButton id="zoomOut" label={t('zoomOut')} onClick={() => {
                zoomViewportCenter(view.scale / 1.16);
              }}>
                <Minus className="h-4 w-4" />
              </IconButton>
              <select
                id="zoomPreset"
                className="h-9 w-[88px] shrink-0 rounded-md border border-border bg-background px-2 text-sm font-medium tabular-nums text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={zoomSelectValue}
                title={t('zoomLevel')}
                aria-label={t('zoomLevel')}
                onChange={(event) => {
                  const nextScale = Number(event.target.value);
                  if (Number.isFinite(nextScale)) {
                    zoomViewportCenter(nextScale);
                  }
                }}
              >
                {!currentZoomPresetScale && (
                  <option value="current">{currentZoomPercent}%</option>
                )}
                {zoomPresetScales.map((scale) => {
                  const percent = Math.round(scale * 100);

                  return (
                    <option
                      key={scale}
                      value={String(scale)}
                    >
                      {percent}%
                    </option>
                  );
                })}
              </select>
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

            <SystemStats stats={systemStats} t={t} />
          </header>

          <main
            ref={viewportRef}
            id="viewport"
            className={cn(
              'viewport',
              panning && 'is-panning',
              pendingCanvasFrame && 'is-creating-frame',
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
                      showToast(t('canvasFrameHint'));
                    }
                    return next;
                  });
                }}
              >
                <Plus className="h-4 w-4" />
                {pendingCanvasFrame ? t('addCanvasFrameArmed') : t('addCanvasFrame')}
              </Button>
              <Button id="addCanvasTodo" variant="outline" onClick={addCanvasTodo}>
                <ListTodo className="h-4 w-4" />
                {t('addCanvasTodo')}
              </Button>
              <Button id="groupEndpoints" onClick={groupEndpoints} disabled={groupableEndpointCount < 2}>
                <Grid2X2 className="h-4 w-4" />
                {groupableEndpointCount > 0 ? `${t('groupEndpoints')} ${groupableEndpointCount}` : t('groupEndpoints')}
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
              menu={canvasContextMenu}
              t={t}
              onAddFrame={createCanvasFrameAtPoint}
              onArrange={arrangeGrid}
              onClose={closeCanvasContextMenu}
              onGroupEndpoints={groupEndpoints}
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
                    onMove={updateCanvasTodo}
                    onResize={updateCanvasTodo}
                    onTitleChange={(id, title) => updateCanvasTodo(id, { title })}
                    onTitleCommit={commitCanvasTodoTitle}
                    onTogglePinned={toggleCanvasTodoPinned}
                  />
                ))}
              </div>
              <div className="canvas-session-layer">
              {visibleEndpointGroups.map(({ group, panels: groupPanels }) => (
                <EndpointGroup
                  key={group.id}
                  group={group}
                  panels={groupPanels}
                  runtimeNow={runtimeNow}
                  scale={view.scale}
                  commandTargetId={commandDockTargetId}
                  dispatchSparkles={commandDockDispatchSparkles}
                  selectedIds={selectedEndpointIds}
                  t={t}
                  onActivate={activateEndpointGroup}
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
                  runtimeNow={runtimeNow}
                  scale={view.scale}
                  t={t}
                  theme={theme}
                  visible={visible}
                  selected={selectedEndpointIds.has(panel.id)}
                  commandTargeted={panel.id === commandDockTargetId}
                  arrangeAnimation={canvasArrangeAnimations[panel.id] || null}
                  availableSessionTags={availableSessionTags}
                  dispatchSparkleKey={commandDockDispatchSparkles[panel.id] || ''}
                  onActivate={activatePanel}
                  onClose={closeTerminal}
                  onExpand={expandPanel}
                  onMinimize={minimizePanel}
                  onMove={updatePanel}
                  onResize={updatePanel}
                  onRestart={restartTerminal}
                  onModelChange={switchPanelModel}
                  onSelectToggle={toggleEndpointSelection}
                  onTagChange={changePanelTag}
                  onTerminalInput={touchPanelActivity}
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
                    onMove={updateCanvasTodo}
                    onResize={updateCanvasTodo}
                    onTitleChange={(id, title) => updateCanvasTodo(id, { title })}
                    onTitleCommit={commitCanvasTodoTitle}
                    onTogglePinned={toggleCanvasTodoPinned}
                  />
                ))}
              </div>
            </div>

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
          onQuickPromptDelete={deleteCommandDockPrompt}
          onQuickPromptSave={saveCommandDockPrompt}
          onQuickPromptSelect={insertQuickPromptIntoCommandDock}
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

      <CodexConfigDialog
        commandDockShortcuts={commandDockShortcuts}
        initialSettingsTab={codexInitialTab}
        language={language}
        onCommandDockShortcutChange={changeCommandDockShortcut}
        onLanguageChange={setLanguage}
        onOpenChange={setCodexOpen}
        onProfileChanged={setCodexProfileState}
        open={codexOpen}
        showToast={showToast}
        t={t}
      />

      <NewSessionDialog
        defaultCwd={defaultCwd}
        initialCliProviderId={launchCliProviderId}
        language={language}
        onOpenChange={setNewSessionOpen}
        onSelect={createSessionFromSelection}
        open={newSessionOpen}
        projects={projectsWithHistory}
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
        t={t}
      />

      <CommandLineConfigDialog
        activeCommandPresetId={activeCommandPresetId}
        commandPresets={commandPresets}
        commandPresetsLoading={commandPresetsLoading}
        commandPresetsPath={commandPresetsPath}
        initialCliProviderId="shell"
        initialDirectory={currentWorkspacePath}
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
