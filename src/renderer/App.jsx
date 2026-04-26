import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Grid2X2,
  Languages,
  LayoutGrid,
  Maximize2,
  MessageSquarePlus,
  MemoryStick,
  Minus,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SquareTerminal,
  Sun,
  Trash2,
  X,
  ZoomIn
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarSection } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import cliProviderRegistry from '../shared/cli-providers.json';
import codexIconSvg from '../../static/codex-color.svg?raw';
import cursorIconSvg from '../../static/cursor.svg?raw';

const bridge = window.cliBridge;
const settingsKey = 'cli-in-one.settings.v3';
const workspaceKey = 'cli-in-one.workspace.v1';
const appLogoUrl = `${import.meta.env.BASE_URL}logo.webp`;
const releasesUrl = 'https://github.com/whd3131/cli-in-one/releases';
const cliProviderIconMarkup = {
  codex: codexIconSvg,
  'cursor-agent': cursorIconSvg
};
const canvasModes = new Set(['shared', 'project']);
const sharedCanvasKey = '__shared__';
const noProjectCanvasKey = '__no_project__';
const historyProjectId = '__history__';
const endpointWidth = 300;
const endpointHeight = 44;
const zoomPresetScales = [0.5, 1, 1.5, 2];
const systemStatsRefreshMs = 2000;
const panelIdleThresholdMs = 12000;
const panelActivityFlushMs = 120;
const formSelectClassName = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function createDefaultView() {
  return { x: 80, y: 80, scale: 1 };
}

const cliProviders = Array.isArray(cliProviderRegistry) ? cliProviderRegistry : [];
const sessionLauncherProviderOrder = ['codex', 'cursor-agent', 'shell'];
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
    title: 'Codex auth.json',
    valid: 'JSON 有效',
    invalid: 'JSON 格式错误',
    missing: '文件不存在，保存有效 JSON 后创建',
    saved: 'Codex auth.json 已保存'
  },
  config: {
    title: 'Codex config.toml',
    valid: 'TOML 有效',
    invalid: 'TOML 格式错误',
    missing: '文件不存在，保存后创建',
    saved: 'Codex config.toml 已保存'
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

const approvalPolicyOptions = ['', 'untrusted', 'on-request', 'never'];
const sandboxModeOptions = ['', 'read-only', 'workspace-write', 'danger-full-access'];
const reasoningEffortOptions = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const wireApiOptions = ['responses', 'chat'];
const quickModelOptions = ['gpt-5.5', 'gpt-5.4'];
const workspaceSkillPreviewCount = 6;
const workspaceSkillSources = [
  { id: 'cursor', directoryName: '.cursor', label: 'Cursor' },
  { id: 'claude', directoryName: '.claude', label: 'Claude' },
  { id: 'agent', directoryName: '.agent', label: 'Agent' },
  { id: 'github', directoryName: '.github', label: 'GitHub' }
];
const gridSessionCountMin = 1;
const gridSessionCountMax = 24;

const messages = {
  zh: {
    appSubtitle: '本地项目与会话',
    expandSidebar: '展开侧边栏',
    collapseSidebar: '收起侧边栏',
    addProject: '新增项目',
    deleteProject: '删除项目',
    codexConfig: 'Codex 配置',
    projects: '项目',
    projectEmpty: '选择一个目录后会在这里管理项目。',
    canvasMode: '画布模式',
    canvasModeShared: '共享',
    canvasModeProject: '按项目',
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
    zoomOut: '缩小',
    zoomIn: '放大',
    zoomLevel: '缩放比例',
    zoomPreset: '缩放到 {percent}%',
    resetView: '重置视图',
    arrange: '整理',
    cpuUsage: 'CPU',
    memoryUsage: '内存',
    systemStatsUnavailable: '系统状态不可用',
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
    groupEndpoints: '分组端点',
    ungroupEndpoints: '取消分组',
    endpointGroup: '端点组',
    groupEndpointsUnavailable: '至少需要两个已收起端点。',
    taskRunning: '进行中',
    taskIdle: '闲置',
    taskCompleted: '已完成',
    taskError: '异常',
    floatingComposerTitle: '快捷发送',
    floatingComposerSubtitle: '发送到：{name}',
    floatingComposerTarget: '目标会话',
    floatingComposerUnavailable: '当前画布没有可接收输入的会话。',
    floatingComposerPlaceholder: '输入内容后发送到 {name}',
    floatingComposerHint: 'Enter 发送，Shift+Enter 换行，粘贴或拖拽图片会保存到 .files',
    floatingComposerCurrent: '当前',
    floatingComposerSend: '发送',
    floatingComposerSent: '已发送到 {name}',
    floatingComposerImageReference: '图片({path})',
    floatingComposerImagesAdded: '已添加 {count} 张图片',
    floatingComposerImageMissingDir: '未找到可保存图片的目录。',
    floatingComposerImageSaveFailed: '图片保存失败：{message}',
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
    saveQuickProfile: '保存方案',
    saveQuickProfileAs: '另存为',
    deleteQuickProfile: '删除方案',
    quickModel: '快速模型',
    quickModelHint: '点击按钮可快速填入常用模型，也可以继续手动输入自定义模型。',
    rawCodexEditor: '原始文件编辑',
    rawCodexEditorDescription: '这里可以直接修改并保存当前文件内容；快捷配置只是常用字段的便捷入口。',
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
    currentVersion: '当前版本',
    modelUnset: '未设置模型',
    modelSwitched: '模型已切换为 {model}',
    modelSwitchFailed: '切换模型失败：{message}',
    latestRelease: '最新发布',
    updateContent: '更新内容',
    checkingUpdates: '检查更新中',
    releaseUnavailable: '暂未获取更新内容',
    openReleases: '查看发布',
    refreshRelease: '刷新更新内容',
    upToDate: '已是最新',
    updateAvailable: '可更新',
    backupHistory: '历史备份',
    noBackups: '暂无备份',
    restoreBackup: '恢复备份',
    settingsDescription: '应用偏好和 Codex 配置文件。',
    switchedProject: '当前项目：{name}',
    addedProject: '已新增项目：{name}',
    switchedExistingProject: '已切换到项目：{name}',
    deletedProject: '已删除项目：{name}',
    switchedCanvasModeShared: '已切换到共享画布',
    switchedCanvasModeProject: '已切换到按项目画布',
    deleteProjectConfirm: '确认删除项目“{name}”？这只会从侧边栏移除项目，不会删除本地文件。',
    ptyFallback: '当前使用管道模式；安装 node-pty 成功后会自动切换到 ConPTY。',
    codexReadFailed: '读取 Codex 配置失败：{message}',
    codexProfileReadFailed: '读取 Codex 快捷配置失败：{message}',
    codexProfileSaved: 'Codex 快捷配置已保存。',
    reloadFailed: '刷新失败：{message}',
    saveFailed: '保存失败：{message}',
    backupListFailed: '读取备份失败：{message}',
    restoreFailed: '恢复失败：{message}',
    quickProfileStoreFailed: '读取快捷配置方案失败：{message}',
    openDirFailed: '打开目录失败：{message}',
    invalidNotSaved: '{name}，未保存。',
    unsavedCloseConfirm: '{name} 还没有保存，确认关闭？',
    switchDiscardConfirm: '切换文件会丢弃当前未保存更改，确认切换？',
    switchQuickProfileDiscardConfirm: '切换配置方案会丢弃当前快捷配置未保存更改，确认切换？',
    deleteQuickProfileConfirm: '确认删除配置方案“{name}”？这不会修改当前 Codex 配置文件。',
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
    quickProfileNamePrompt: '输入配置方案名称',
    quickProfileNameRequired: '配置方案名称不能为空。',
    quickProfileSaved: '配置方案已保存：{name}',
    quickProfileDeleted: '配置方案已删除：{name}',
    quickProfileSwitched: '已载入配置方案：{name}',
    workspaceTreeTitle: '当前工作区文件树',
    workspaceTreeDescription: '查看当前目录结构，已自动跳过 .git、node_modules 等大型目录。',
    workspaceTreeSummary: '{directories} 个目录，{files} 个文件',
    workspaceTreeSummaryWithOmitted: '{directories} 个目录，{files} 个文件，省略 {omitted} 项',
    workspaceTreeLoading: '正在读取文件树…',
    workspaceTreeUnavailable: '当前没有可查看的工作区目录。',
    workspaceTreeFailed: '读取文件树失败：{message}',
    workspaceTreeCopied: '文件树已复制到剪贴板。',
    workspaceTreeNoData: '还没有读取文件树。',
    workspaceTreeEmpty: '这个目录目前是空的。',
    workspaceTreeIgnored: '已跳过',
    workspaceTreeLink: '链接',
    workspaceTreeDepthLimit: '已达到深度限制',
    workspaceTreeOmitted: '省略 {count} 项',
    workspaceTreeUnreadable: '无法读取：{message}',
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
    codexConfig: 'Codex config',
    projects: 'Projects',
    projectEmpty: 'Choose a folder to manage projects here.',
    canvasMode: 'Canvas mode',
    canvasModeShared: 'Shared',
    canvasModeProject: 'Per project',
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
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoomLevel: 'Zoom level',
    zoomPreset: 'Zoom to {percent}%',
    resetView: 'Reset view',
    arrange: 'Arrange',
    cpuUsage: 'CPU',
    memoryUsage: 'Memory',
    systemStatsUnavailable: 'System stats unavailable',
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
    groupEndpoints: 'Group endpoints',
    ungroupEndpoints: 'Ungroup endpoints',
    endpointGroup: 'Endpoint group',
    groupEndpointsUnavailable: 'At least two minimized endpoints are required.',
    taskRunning: 'Running',
    taskIdle: 'Idle',
    taskCompleted: 'Completed',
    taskError: 'Error',
    floatingComposerTitle: 'Quick send',
    floatingComposerSubtitle: 'Send to: {name}',
    floatingComposerTarget: 'Target session',
    floatingComposerUnavailable: 'No live session on this canvas can receive input.',
    floatingComposerPlaceholder: 'Type here and send to {name}',
    floatingComposerHint: 'Enter to send, Shift+Enter for newline, paste or drop images to save them into .files',
    floatingComposerCurrent: 'Current',
    floatingComposerSend: 'Send',
    floatingComposerSent: 'Sent to {name}',
    floatingComposerImageReference: 'image({path})',
    floatingComposerImagesAdded: 'Added {count} image(s)',
    floatingComposerImageMissingDir: 'No directory is available for saving images.',
    floatingComposerImageSaveFailed: 'Failed to save image: {message}',
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
    saveQuickProfile: 'Save preset',
    saveQuickProfileAs: 'Save as',
    deleteQuickProfile: 'Delete preset',
    quickModel: 'Quick model',
    quickModelHint: 'Use the buttons to fill common models quickly, or keep typing a custom model manually.',
    rawCodexEditor: 'Raw file editor',
    rawCodexEditorDescription: 'Edit and save the current file directly here. Quick config is only a shortcut for common fields.',
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
    currentVersion: 'Current version',
    modelUnset: 'Model not set',
    modelSwitched: 'Model switched to {model}',
    modelSwitchFailed: 'Failed to switch model: {message}',
    latestRelease: 'Latest release',
    updateContent: 'Changes',
    checkingUpdates: 'Checking updates',
    releaseUnavailable: 'Release notes unavailable',
    openReleases: 'Open releases',
    refreshRelease: 'Refresh release notes',
    upToDate: 'Up to date',
    updateAvailable: 'Update available',
    backupHistory: 'Backups',
    noBackups: 'No backups',
    restoreBackup: 'Restore',
    settingsDescription: 'App preferences and Codex config files.',
    switchedProject: 'Current project: {name}',
    addedProject: 'Added project: {name}',
    switchedExistingProject: 'Switched to project: {name}',
    deletedProject: 'Deleted project: {name}',
    switchedCanvasModeShared: 'Switched to shared canvas',
    switchedCanvasModeProject: 'Switched to per-project canvas',
    deleteProjectConfirm: 'Delete project "{name}"? This only removes it from the sidebar and will not delete local files.',
    ptyFallback: 'Pipe mode is active. Install node-pty successfully to use ConPTY.',
    codexReadFailed: 'Failed to read Codex config: {message}',
    codexProfileReadFailed: 'Failed to read Codex quick config: {message}',
    codexProfileSaved: 'Codex quick config saved.',
    reloadFailed: 'Reload failed: {message}',
    saveFailed: 'Save failed: {message}',
    backupListFailed: 'Failed to read backups: {message}',
    restoreFailed: 'Restore failed: {message}',
    quickProfileStoreFailed: 'Failed to read quick presets: {message}',
    openDirFailed: 'Open folder failed: {message}',
    invalidNotSaved: '{name}, not saved.',
    unsavedCloseConfirm: '{name} has unsaved changes. Close anyway?',
    switchDiscardConfirm: 'Switching files will discard unsaved changes. Continue?',
    switchQuickProfileDiscardConfirm: 'Switching presets will discard unsaved quick config changes. Continue?',
    deleteQuickProfileConfirm: 'Delete preset "{name}"? This will not modify current Codex config files.',
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
    quickProfileNamePrompt: 'Enter preset name',
    quickProfileNameRequired: 'Preset name is required.',
    quickProfileSaved: 'Preset saved: {name}',
    quickProfileDeleted: 'Preset deleted: {name}',
    quickProfileSwitched: 'Loaded preset: {name}',
    workspaceTreeTitle: 'Current workspace file tree',
    workspaceTreeDescription: 'View the current directory structure. Large folders like .git and node_modules are skipped automatically.',
    workspaceTreeSummary: '{directories} directories, {files} files',
    workspaceTreeSummaryWithOmitted: '{directories} directories, {files} files, {omitted} omitted',
    workspaceTreeLoading: 'Loading file tree…',
    workspaceTreeUnavailable: 'There is no workspace directory to inspect.',
    workspaceTreeFailed: 'Failed to read file tree: {message}',
    workspaceTreeCopied: 'File tree copied to clipboard.',
    workspaceTreeNoData: 'File tree has not been loaded yet.',
    workspaceTreeEmpty: 'This directory is currently empty.',
    workspaceTreeIgnored: 'Skipped',
    workspaceTreeLink: 'Link',
    workspaceTreeDepthLimit: 'Depth limit reached',
    workspaceTreeOmitted: '{count} omitted',
    workspaceTreeUnreadable: 'Unreadable: {message}',
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

function deriveQuickProfileName(profile, fallback) {
  const normalized = normalizeCodexProfile(profile);
  const parts = [normalized.providerName, normalized.model]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.join(' / ') || fallback;
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

function QuickModelButtons({ className, currentModel, disabled = false, onSelect, t }) {
  const normalizedModel = String(currentModel || '').trim();
  const hasQuickModel = quickModelOptions.includes(normalizedModel);

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
      {quickModelOptions.map((model) => (
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

function formatWorkspaceTreeSummary(snapshot, t) {
  if (!snapshot) {
    return '';
  }

  if (!snapshot.directoryCount && !snapshot.fileCount) {
    return t('workspaceTreeEmpty');
  }

  if (snapshot.omittedCount > 0) {
    return t('workspaceTreeSummaryWithOmitted', {
      directories: snapshot.directoryCount,
      files: snapshot.fileCount,
      omitted: snapshot.omittedCount
    });
  }

  return t('workspaceTreeSummary', {
    directories: snapshot.directoryCount,
    files: snapshot.fileCount
  });
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

function normalizeTerminalInputPayload(value) {
  const normalized = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized) {
    return '';
  }

  const payload = normalized.replace(/\n/g, '\r');
  return payload.endsWith('\r') ? payload : `${payload}\r`;
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

function normalizePromptFilePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
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

function compareVersions(left, right) {
  const parse = (value) => normalizeVersionText(value)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length, 3);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

function stripReleaseMarkdown(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#+\s*/g, '')
    .trim();
}

function getReleaseSummaryLines(body, limit = 5) {
  if (!body) {
    return [];
  }

  const lines = [];
  for (const rawLine of String(body).split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (
      !trimmed ||
      /^#+\s*\[?v?\d/i.test(trimmed) ||
      /^full changelog/i.test(trimmed) ||
      /^contributors/i.test(trimmed)
    ) {
      continue;
    }

    const line = stripReleaseMarkdown(trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, ''));
    if (line) {
      lines.push(line);
    }

    if (lines.length >= limit) {
      break;
    }
  }

  return lines;
}

function formatReleaseDate(value, language) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }

  return new Date(timestamp).toLocaleDateString(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
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

function isCodexPanel(panel) {
  return getPanelCliProvider(panel)?.id === 'codex';
}

function hasPanelModelTag(panel) {
  return isCodexPanel(panel);
}

function hasPanelContextTag(panel) {
  return String(panel?.contextWindowLabel || '').trim().length > 0;
}

function getSessionHeaderGridClass(panel) {
  const hasModel = hasPanelModelTag(panel);
  const hasContext = hasPanelContextTag(panel);

  if (hasModel && hasContext) {
    return 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_auto_auto_28px_28px_28px]';
  }

  if (hasModel || hasContext) {
    return 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_auto_28px_28px_28px]';
  }

  return 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_28px_28px_28px]';
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

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return {
      cwd: saved.cwd || '',
      theme: saved.theme === 'light' ? 'light' : 'dark',
      language: saved.language === 'en' ? 'en' : 'zh',
      view: normalizeCanvasView(saved.view)
    };
  } catch {
    localStorage.removeItem(settingsKey);
    return { cwd: '', theme: 'dark', language: 'zh', view: createDefaultView() };
  }
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
    projectViews: {},
    projects: []
  };
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
    ? raw.projects.map((project) => ({
      id: project.id || createLocalId('project'),
      name: project.name || deriveNameFromPath(project.path),
      path: project.path || '',
      createdAt: Number.isFinite(project.createdAt) ? project.createdAt : Date.now(),
      updatedAt: Number.isFinite(project.updatedAt) ? project.updatedAt : Date.now()
    }))
    : [];
  const activeProjectId = raw.activeProjectId === historyProjectId || projects.some((project) => project.id === raw.activeProjectId)
    ? raw.activeProjectId
    : null;
  const projectViews = raw.projectViews && typeof raw.projectViews === 'object'
    ? Object.fromEntries(Object.entries(raw.projectViews).map(([key, value]) => [key, normalizeCanvasView(value)]))
    : {};

  return {
    ...fallback,
    sidebarCollapsed: Boolean(raw.sidebarCollapsed),
    skillsCollapsed: Boolean(raw.skillsCollapsed),
    activeProjectId,
    canvasMode: canvasModes.has(raw.canvasMode) ? raw.canvasMode : fallback.canvasMode,
    sharedView: normalizeCanvasView(raw.sharedView),
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

function EndpointGroup({
  group,
  panels,
  runtimeNow,
  scale,
  commandTargetId,
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
          return (
            <div
              key={panel.id}
              className={cn(
                'endpoint-group-row',
                selected && 'is-selected',
                commandTargeted && 'is-command-target'
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
  visible = true,
  selected = false,
  commandTargeted = false,
  onActivate,
  onClose,
  onExpand,
  onMinimize,
  onMove,
  onResize,
  onRestart,
  onSelectToggle,
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
  const panelProvider = getPanelCliProvider(panel);

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

    const hostNode = hostRef.current;
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
    const handleContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onActivate(panel.id);

      if (term.hasSelection()) {
        copyTerminalSelection(term, true);
      } else {
        pasteClipboardIntoTerminal(term);
      }
    };
    const handleTextAreaFocus = () => {
      window.requestAnimationFrame(() => syncTerminalImeAnchor(term));
    };

    terminalElement?.addEventListener('copy', handleCopy);
    terminalElement?.addEventListener('paste', handlePaste);
    hostNode?.addEventListener('contextmenu', handleContextMenu);
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
      hostNode?.removeEventListener('contextmenu', handleContextMenu);
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
  }, [fitTerminal, onActivate, onTerminalInput, panel.cwd, panel.id, registerTerminal, syncScrollbarState]);

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

  return (
    <Card
      className={cn(
        'terminal-panel',
        active && !panel.minimized && 'active',
        panel.minimized && 'is-minimized',
        panel.minimized && selected && 'is-selected',
        commandTargeted && 'is-command-target',
        !visible && 'is-hidden'
      )}
      data-terminal-id={panel.id}
      aria-hidden={!visible}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.minimized ? endpointWidth : panel.width,
        height: panel.minimized ? endpointHeight : panel.height,
        zIndex: panel.zIndex
      }}
      onPointerDown={() => {
        if (visible) {
          onActivate(panel.id);
        }
      }}
    >
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

function CodexConfigDialog({ language, onLanguageChange, onOpenChange, onProfileChanged, open, showToast, t }) {
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

  const selectedQuickProfile = useMemo(
    () => quickProfiles.find((record) => record.id === selectedQuickProfileId) || null,
    [quickProfiles, selectedQuickProfileId]
  );

  const loadFile = useCallback(async (kind) => {
    setStatusMessage(t('loading'));
    const snapshot = await bridge.readCodexConfig(kind);
    setPathText(snapshot.path);
    setValue(snapshot.content || '');
    setLastSavedValue(snapshot.content || '');
    setDirty(false);
    setInvalid(false);

    if (snapshot.exists) {
      const modified = formatTime(snapshot.modifiedAt);
      setStatusMessage(modified ? `已加载，修改时间 ${modified}` : '已加载', 'ok');
    } else {
      setStatusMessage(codexFileMeta[kind].missing);
    }

    window.requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, [setStatusMessage, t]);

  const loadBackups = useCallback(async (kind) => {
    setBackupsLoading(true);
    try {
      const items = await bridge.listCodexConfigBackups(kind);
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

  const loadProfile = useCallback(async () => {
    setProfileStatusMessage(t('loading'));
    const snapshot = await bridge.readCodexProfile();
    setProfile(normalizeCodexProfile(snapshot.profile));
    setSelectedQuickProfileId('');
    setProfileDirty(false);
    setProfileStatusMessage(t('quickConfigLoaded'), 'ok');
    return snapshot;
  }, [setProfileStatusMessage, t]);

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
      showToast(t('codexReadFailed', { message: error.message }));
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

    syncProfileState().catch((error) => {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('codexProfileReadFailed', { message: error.message }));
    });
  }, [open, setProfileStatusMessage, showToast, syncProfileState, t]);

  useEffect(() => () => window.clearTimeout(validationTimer.current), []);

  const validate = useCallback(async ({ quietWhenValid = false } = {}) => {
    const seq = ++validationSeq.current;
    const result = await bridge.validateCodexConfig(activeFile, value);
    if (seq !== validationSeq.current) {
      return result.valid;
    }

    setInvalid(!result.valid);
    if (!result.valid) {
      setStatusMessage(result.error || codexFileMeta[activeFile].invalid, 'error');
    } else if (!quietWhenValid) {
      setStatusMessage(dirty ? `${codexFileMeta[activeFile].valid}，有未保存更改` : codexFileMeta[activeFile].valid, 'ok');
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

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && (dirty || profileDirty)) {
      const name = dirty ? codexFileMeta[activeFile].title : t('codexQuickConfig');
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
    if (dirty || profileDirty) {
      const name = dirty ? codexFileMeta[activeFile].title : t('codexQuickConfig');
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
  };

  const saveProfile = async () => {
    if (dirty && !window.confirm(t('profileSaveDiscardConfirm'))) {
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
      await loadFile(activeFile);
      showToast(t('codexProfileSaved'));
    } catch (error) {
      setProfileStatusMessage(error.message, 'error');
      showToast(t('saveFailed', { message: error.message }));
    } finally {
      setProfileSaving(false);
    }
  };

  const save = async () => {
    const valid = await validate();
    if (!valid) {
      showToast(t('invalidNotSaved', { name: codexFileMeta[activeFile].invalid }));
      return;
    }

    setSaving(true);
    setStatusMessage(`${t('save')}...`);
    try {
      const snapshot = await bridge.writeCodexConfig(activeFile, value);
      setPathText(snapshot.path);
      setValue(snapshot.content || '');
      setLastSavedValue(snapshot.content || '');
      setDirty(false);
      setInvalid(false);
      const backupNote = snapshot.backupPath ? '，已生成备份' : '';
      setStatusMessage(`已保存${backupNote}`, 'ok');
      showToast(`${codexFileMeta[activeFile].saved}${backupNote}。`);
      syncProfileState().catch((error) => {
        setProfileStatusMessage(error.message, 'error');
      });
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

    const confirmKey = dirty || profileDirty ? 'restoreBackupDirtyConfirm' : 'restoreBackupConfirm';
    if (!window.confirm(t(confirmKey, { name: codexFileMeta[activeFile].title }))) {
      return;
    }

    setRestoring(true);
    setStatusMessage(`${t('restoreBackup')}...`);
    try {
      const snapshot = await bridge.restoreCodexConfigBackup(activeFile, selectedBackup);
      setPathText(snapshot.path);
      setValue(snapshot.content || '');
      setLastSavedValue(snapshot.content || '');
      setDirty(false);
      setInvalid(false);
      const restoredMessage = snapshot.backupPath ? t('restoreBackupSavedWithBackup') : t('restoreBackupSaved');
      setStatusMessage(restoredMessage, 'ok');
      showToast(t('restoreBackupSavedToast', { name: snapshot.restoredFrom?.name || selectedBackup }));
      syncProfileState().catch((error) => {
        setProfileStatusMessage(error.message, 'error');
      });
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
    bridge.openCodexConfigFolder().catch((error) => showToast(t('openDirFailed', { message: error.message })));
  };

  const selectClassName = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id="codexConfigPanel" className="grid h-[calc(100vh-100px)] w-[min(980px,calc(100vw-32px))] grid-rows-[auto_1fr_auto] p-0">
        <DialogHeader>
          <DialogTitle id="codexConfigTitle">{t('settings')}</DialogTitle>
          <DialogDescription id="codexConfigPath" title={pathText}>{t('settingsDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)_auto] gap-2 p-3">
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
            </div>
          </div>

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

          <div className="grid gap-1.5 rounded-md border border-border bg-card/70 p-3">
            <div className="text-sm font-semibold">{t('rawCodexEditor')}</div>
            <div className="text-xs text-muted-foreground">{t('rawCodexEditorDescription')}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground" title={pathText}>
              {pathText || codexFileMeta[activeFile].title}
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
            className={cn('config-editor h-full font-mono text-[13px]', invalid && 'is-invalid')}
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

        <DialogFooter>
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
      <DialogContent id="newSessionDialog" className="w-[min(640px,calc(100vw-32px))] p-0">
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

  const runAction = useCallback((handler) => {
    setOpen(false);
    handler(selectedCliProviderId);
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
              onClick={() => runAction(onAddCommandLine)}
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
      <div className="flex min-w-[72px] items-center gap-1.5" title={memoryTitle}>
        <MemoryStick className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium">{t('memoryUsage')}</span>
        <span className="font-mono tabular-nums text-foreground">{memoryText}</span>
      </div>
    </div>
  );
}

function SidebarThemeControl({ compact = false, onThemeChange, t, theme }) {
  const options = [
    { value: 'light', label: t('light'), Icon: Sun },
    { value: 'dark', label: t('dark'), Icon: Moon }
  ];

  if (compact) {
    return (
      <div
        className="grid gap-1 rounded-lg border border-border bg-card/70 p-1"
        role="group"
        aria-label={t('appearance')}
      >
        {options.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            size="icon"
            variant={theme === value ? 'primary' : 'ghost'}
            className="h-8 w-8"
            title={label}
            aria-label={label}
            onClick={() => onThemeChange(value)}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/70 p-2">
      <div className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {t('appearance')}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ value, label, Icon }) => (
          <Button
            key={value}
            type="button"
            variant={theme === value ? 'primary' : 'outline'}
            className="w-full justify-center"
            onClick={() => onThemeChange(value)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </div>
    </div>
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
      <DialogContent id="gridSessionDialog" className="w-[min(420px,calc(100vw-32px))] p-0">
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

function getWorkspaceTreeNodeLabel(node, t) {
  if (!node) {
    return '';
  }

  if (node.type === 'omitted') {
    return t('workspaceTreeOmitted', { count: node.omittedCount || 0 });
  }

  if (node.type === 'depth-limit') {
    return t('workspaceTreeDepthLimit');
  }

  if (node.type === 'unreadable') {
    return t('workspaceTreeUnreadable', { message: node.message || 'error' });
  }

  return node.name || node.relativePath || node.path || '';
}

function WorkspaceTreeNode({ depth = 0, expandedIds, node, onToggle, t }) {
  const children = Array.isArray(node?.children) ? node.children : [];
  const directory = node?.type === 'directory';
  const notice = node?.type === 'omitted' || node?.type === 'depth-limit' || node?.type === 'unreadable';
  const canExpand = directory && children.length > 0;
  const expanded = canExpand && expandedIds.has(node.id);
  const label = getWorkspaceTreeNodeLabel(node, t);
  const title = [node?.relativePath || label, node?.path].filter(Boolean).join('\n');
  const rowClassName = cn(
    'workspace-tree-row',
    directory && 'is-directory',
    notice && 'is-notice',
    node?.type === 'unreadable' && 'is-error'
  );
  const rowStyle = { '--tree-indent': `${depth * 14}px` };
  const fileIcon = node?.type === 'link' ? ExternalLink : File;
  const TreeIcon = directory ? (expanded ? FolderOpen : Folder) : fileIcon;
  const rowChildren = (
    <>
      <span className="workspace-tree-expander" aria-hidden="true">
        {canExpand ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
        ) : null}
      </span>
      <TreeIcon className="workspace-tree-node-icon h-3.5 w-3.5" />
      <span className="workspace-tree-node-name">{label}</span>
      {node?.ignored && <span className="workspace-tree-node-tag">{t('workspaceTreeIgnored')}</span>}
      {node?.link && <span className="workspace-tree-node-tag">{t('workspaceTreeLink')}</span>}
    </>
  );

  return (
    <li role="treeitem" aria-expanded={canExpand ? expanded : undefined} aria-level={depth + 1}>
      {canExpand ? (
        <button
          type="button"
          className={rowClassName}
          style={rowStyle}
          title={title || undefined}
          onClick={() => onToggle(node.id)}
        >
          {rowChildren}
        </button>
      ) : (
        <div className={rowClassName} style={rowStyle} title={title || undefined}>
          {rowChildren}
        </div>
      )}

      {canExpand && expanded && (
        <ul className="workspace-tree-children" role="group">
          {children.map((child) => (
            <WorkspaceTreeNode
              key={child.id || `${node.id}:${child.name}`}
              depth={depth + 1}
              expandedIds={expandedIds}
              node={child}
              onToggle={onToggle}
              t={t}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function WorkspaceTreeView({ root, t }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  useEffect(() => {
    setExpandedIds(root?.id ? new Set([root.id]) : new Set());
  }, [root?.id]);

  const toggleNode = useCallback((nodeId) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  if (!root) {
    return null;
  }

  return (
    <ul className="workspace-tree-list" role="tree">
      <WorkspaceTreeNode
        expandedIds={expandedIds}
        node={root}
        onToggle={toggleNode}
        t={t}
      />
    </ul>
  );
}

function WorkspaceTreeContent({ state, t }) {
  const snapshot = state.snapshot;
  const root = snapshot?.root || null;

  if (state.status === 'loading' && !root) {
    return (
      <div className="workspace-tree-placeholder">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>{t('workspaceTreeLoading')}</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="workspace-tree-placeholder is-error">
        {state.error || t('workspaceTreeNoData')}
      </div>
    );
  }

  if (!root) {
    return (
      <div className="workspace-tree-placeholder">
        {t('workspaceTreeNoData')}
      </div>
    );
  }

  return <WorkspaceTreeView root={root} t={t} />;
}

function WorkspaceTreeSidebar({
  currentPath,
  onClose,
  onCopy,
  onOpen,
  onRefresh,
  open,
  state,
  t
}) {
  const snapshot = state.snapshot;
  const currentTreePath = snapshot?.cwd || state.requestedPath || currentPath || '';
  const summary = state.status === 'error'
    ? state.error || t('workspaceTreeNoData')
    : formatWorkspaceTreeSummary(snapshot, t);
  const loading = state.status === 'loading';

  return (
    <aside className={cn('workspace-tree-sidebar', open && 'is-open')} aria-label={t('workspaceTreeTitle')}>
      {!open && (
        <div className="workspace-tree-rail">
          <IconButton
            id="openWorkspaceTree"
            label={t('workspaceTreeOpen')}
            disabled={!currentPath}
            onClick={onOpen}
          >
            <PanelRightOpen className="h-4 w-4" />
          </IconButton>
        </div>
      )}

      {open && (
        <section className="workspace-tree-panel">
          <header className="workspace-tree-panel-header">
            <div className="min-w-0">
              <div className="workspace-tree-panel-title">
                <FolderOpen className="h-4 w-4 text-primary" />
                <span>{t('workspaceTree')}</span>
              </div>
              <div className="workspace-tree-path" title={currentTreePath || undefined}>
                {currentTreePath || t('workspaceTreeUnavailable')}
              </div>
            </div>
            <IconButton label={t('workspaceTreeClose')} variant="ghost" onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </IconButton>
          </header>

          <div className="workspace-tree-panel-meta">
            <div className={cn('workspace-tree-summary', state.status === 'error' && 'is-error')}>
              {loading ? t('workspaceTreeLoading') : (summary || t('workspaceTreeNoData'))}
            </div>
            <div className="workspace-tree-actions">
              <IconButton
                label={t('reload')}
                variant="ghost"
                disabled={!currentPath || loading}
                onClick={onRefresh}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </IconButton>
              <IconButton
                label={t('copy')}
                variant="ghost"
                disabled={!snapshot?.text}
                onClick={onCopy}
              >
                <Copy className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          <div className="workspace-tree-panel-body">
            <WorkspaceTreeContent state={state} t={t} />
          </div>
        </section>
      )}
    </aside>
  );
}

function CommandLineConfigDialog({
  initialCliProviderId = defaultCliProviderId,
  initialDirectory,
  language,
  onCreate,
  onOpenChange,
  open,
  t
}) {
  const selectableCliProviders = useMemo(() => getSelectableCliProviders(['directory']), []);
  const selectedInitialCliProviderId = getInitialCliProviderId(initialCliProviderId, selectableCliProviders);
  const [directory, setDirectory] = useState('');
  const [selectedCliProviderId, setSelectedCliProviderId] = useState(
    () => selectedInitialCliProviderId
  );
  const normalizedDirectory = String(directory || '').trim();

  useEffect(() => {
    if (open) {
      setDirectory(String(initialDirectory || ''));
      setSelectedCliProviderId(selectedInitialCliProviderId);
    }
  }, [initialDirectory, open, selectedInitialCliProviderId]);

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
      cwd: normalizedDirectory,
      cliProviderId: selectedCliProviderId
    });
  }, [normalizedDirectory, onCreate, selectedCliProviderId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="commandLineConfigDialog" className="w-[min(520px,calc(100vw-32px))] p-0">
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
      <DialogContent id="projectConfigDialog" className="w-[min(560px,calc(100vw-32px))] p-0">
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
  language,
  onOpenReleases,
  onRefreshRelease,
  releaseState = { status: 'idle', release: null, error: '' },
  t,
  detail = false
}) {
  const release = releaseState.release;
  const releaseTitle = release?.name || release?.tagName || t('latestRelease');
  const releaseVersion = release?.tagName || release?.name || '';
  const releaseDate = formatReleaseDate(release?.publishedAt, language);
  const summaryLines = getReleaseSummaryLines(release?.body);
  const hasRelease = Boolean(release);
  const checking = releaseState.status === 'loading';
  const hasUpdate = hasRelease && appVersion && compareVersions(releaseVersion, appVersion) > 0;
  const releaseStatus = checking
    ? t('checkingUpdates')
    : hasRelease ? (hasUpdate ? t('updateAvailable') : t('upToDate')) : t('releaseUnavailable');

  return (
    <div className={cn('sidebar-release-card', detail && 'is-detail')}>
      <div className="sidebar-release-header">
        <div className="min-w-0">
          <div className="sidebar-release-kicker">{t('currentVersion')}</div>
          <div className="sidebar-release-version">{formatVersionLabel(appVersion)}</div>
        </div>
        <Badge variant={hasUpdate ? 'success' : 'outline'} className="sidebar-release-badge">
          {releaseStatus}
        </Badge>
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('latestRelease')}</div>
        <button
          type="button"
          className="sidebar-release-link"
          onClick={() => onOpenReleases(release?.htmlUrl || releasesUrl)}
        >
          <span className="min-w-0 truncate">{hasRelease ? releaseTitle : t('releaseUnavailable')}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </button>
        {releaseDate && <div className="sidebar-release-date">{releaseDate}</div>}
      </div>

      <div className="sidebar-release-block">
        <div className="sidebar-release-kicker">{t('updateContent')}</div>
        {summaryLines.length > 0 ? (
          <ul className="sidebar-release-notes">
            {summaryLines.map((line, index) => (
              <li key={`${index}-${line}`} className="sidebar-release-note">{line}</li>
            ))}
          </ul>
        ) : (
          <div className={cn('sidebar-release-empty', releaseState.error && 'is-error')}>
            {releaseState.error || (checking ? t('checkingUpdates') : t('releaseUnavailable'))}
          </div>
        )}
      </div>

      <div className="sidebar-release-actions">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={t('refreshRelease')}
          aria-label={t('refreshRelease')}
          onClick={() => onRefreshRelease()}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-7 min-w-0 flex-1 justify-start px-2 text-xs"
          onClick={() => onOpenReleases(release?.htmlUrl || releasesUrl)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t('openReleases')}
        </Button>
      </div>
    </div>
  );
}

function ReleaseInfo({
  appVersion,
  language,
  onOpenReleases,
  onRefreshRelease,
  releaseState = { status: 'idle', release: null, error: '' },
  t,
  compact = false
}) {
  const [open, setOpen] = useState(false);
  const versionLabel = formatVersionLabel(appVersion);

  return (
    <>
      <button
        type="button"
        className={cn('sidebar-version-button', compact && 'compact')}
        title={`${t('currentVersion')} ${versionLabel}`}
        aria-label={`${t('currentVersion')} ${versionLabel}`}
        onClick={() => setOpen(true)}
      >
        <Badge variant="outline" className={cn('sidebar-version-badge', compact && 'compact')}>
          {versionLabel}
        </Badge>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent id="releaseInfoDialog" className="w-[min(640px,calc(100vw-32px))] p-0">
          <DialogHeader>
            <DialogTitle className="font-mono">{versionLabel}</DialogTitle>
            <DialogDescription>{t('currentVersion')}</DialogDescription>
          </DialogHeader>
          <div className="p-4">
            <ReleaseInfoCard
              appVersion={appVersion}
              language={language}
              onOpenReleases={onOpenReleases}
              onRefreshRelease={onRefreshRelease}
              releaseState={releaseState}
              t={t}
              detail
            />
          </div>
        </DialogContent>
      </Dialog>
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

function FloatingCommandDock({
  activeId,
  inputRef,
  language,
  message,
  onExport,
  onExportCustom,
  onInputChange,
  onInputCompositionEnd,
  onInputCompositionStart,
  onInputDragOver,
  onInputKeyDown,
  onInputDrop,
  onInputPaste,
  onSend,
  onTargetChange,
  panels,
  targetId,
  t
}) {
  const targetPanel = panels.find((panel) => panel.id === targetId) || null;
  const targetReady = canPanelReceiveInput(targetPanel);
  const canExport = Boolean(targetPanel);
  const canSend = Boolean(targetReady && String(message || '').trim());
  const targetSummary = targetPanel
    ? t('floatingComposerSubtitle', { name: targetPanel.title })
    : t('floatingComposerUnavailable');

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-[7000] w-[calc(100%-20px)] max-w-[980px] -translate-x-1/2 md:bottom-[18px] md:w-[calc(100%-32px)]">
      <Card
        className="pointer-events-auto shadow-lg"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onDragOver={onInputDragOver}
        onDrop={onInputDrop}
      >
        <CardHeader className="gap-2 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex flex-1 items-center gap-2">
              <CardTitle className="shrink-0 text-sm">{t('floatingComposerTitle')}</CardTitle>
              <CardDescription className="truncate text-xs" title={targetPanel?.cwd || undefined}>
                {targetSummary}
              </CardDescription>
            </div>
            {targetPanel && (
              <CliProviderBadge
                className="shrink-0 px-2 py-0 text-[11px]"
                language={language}
                provider={getPanelCliProvider(targetPanel)}
              />
            )}
          </div>
          <div
            className="flex max-h-32 flex-wrap gap-2 overflow-x-hidden overflow-y-auto pr-1"
            role="group"
            aria-label={t('floatingComposerTarget')}
          >
            {panels.map((panel) => {
              const executionState = getPanelExecutionState(panel);
              const sendDisabled = !canPanelReceiveInput(panel);
              const current = panel.id === activeId;
              const targeted = panel.id === targetId;
              const providerLabel = getCliProviderBadgeLabel(getPanelCliProvider(panel), language);
              const summary = [
                panel.title,
                providerLabel,
                getExecutionStateLabel(executionState, t),
                current ? t('floatingComposerCurrent') : ''
              ].filter(Boolean).join(', ');

              return (
                <Button
                  key={panel.id}
                  type="button"
                  variant={targeted ? 'primary' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-8 min-w-0 max-w-full basis-[220px] justify-start gap-1.5 px-2.5 text-[11px]',
                    current && !targeted && 'border-primary/35',
                    sendDisabled && 'opacity-60'
                  )}
                  aria-pressed={targeted}
                  title={`${summary}\n${panel.cwd}`}
                  onClick={() => onTargetChange(panel.id)}
                >
                  <span className={cn('shrink-0 terminal-endpoint-dot', `is-${executionState}`)} />
                  <span className={cn(
                    'min-w-0 truncate whitespace-nowrap',
                    targeted ? 'text-primary-foreground' : 'text-foreground'
                  )}>
                    {summary}
                  </span>
                </Button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="grid gap-2 px-3 pb-3 pt-0">
          <div className="relative">
            <Textarea
              ref={inputRef}
              rows={1}
              spellCheck={false}
              value={message}
              placeholder={targetPanel
                ? t('floatingComposerPlaceholder', { name: targetPanel.title })
                : t('floatingComposerUnavailable')}
              className="min-h-[108px] max-h-[260px] resize-none pb-12 pr-24 font-mono text-sm leading-6"
              onChange={onInputChange}
              onCompositionEnd={onInputCompositionEnd}
              onCompositionStart={onInputCompositionStart}
              onDragOver={onInputDragOver}
              onDrop={onInputDrop}
              onKeyDown={onInputKeyDown}
              onPaste={onInputPaste}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="absolute bottom-2 right-2 h-8 px-3 shadow-sm"
              onClick={onSend}
              disabled={!canSend}
            >
              {t('floatingComposerSend')}
            </Button>
          </div>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={targetPanel?.cwd || undefined}>
            {targetPanel?.cwd
              ? `${targetPanel.cwd} · ${t('floatingComposerHint')}`
              : t('floatingComposerUnavailable')}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2"
              title={t('exportSession')}
              aria-label={t('exportSession')}
              onClick={() => canExport && onExport(targetPanel.id)}
              disabled={!canExport}
            >
              <Download className="h-3.5 w-3.5" />
              {t('exportSession')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2"
              title={t('exportSessionCustom')}
              aria-label={t('exportSessionCustom')}
              onClick={() => canExport && onExportCustom(targetPanel.id)}
              disabled={!canExport}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('exportSessionCustom')}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function WorkspaceSidebar({
  appVersion,
  workspace,
  activeProject,
  historyProject,
  language,
  theme,
  onAddProject,
  onAddCommandLine,
  onCanvasModeChange,
  onKillAll,
  onAddSession,
  onOpenPath,
  onOpenReleases,
  onOpenCodexConfig,
  onRefreshSkills,
  onRefreshRelease,
  onDeleteProject,
  onSelectNoProject,
  onSelectProject,
  onThemeChange,
  onToggleSkillsCollapsed,
  releaseState,
  skillsRootPath,
  skillsState,
  t,
  onToggleCollapsed
}) {
  const collapsed = workspace.sidebarCollapsed;
  const userProjects = workspace.projects;

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
        <div className="sidebar-rail-spacer" />
        <SidebarThemeControl compact theme={theme} onThemeChange={onThemeChange} t={t} />
        <IconButton label={t('settings')} onClick={onOpenCodexConfig}>
          <Settings2 className="h-4 w-4" />
        </IconButton>
        <ReleaseInfo
          appVersion={appVersion}
          language={language}
          onOpenReleases={onOpenReleases}
          onRefreshRelease={onRefreshRelease}
          releaseState={releaseState}
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
      </div>

      <SidebarContent>
        <SidebarSection>
          <div className="sidebar-section-title">
            <span>{t('canvasMode')}</span>
          </div>
          <Tabs value={workspace.canvasMode} onValueChange={onCanvasModeChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger className="px-2 text-xs" value="project">
                {t('canvasModeProject')}
              </TabsTrigger>
              <TabsTrigger className="px-2 text-xs" value="shared">
                {t('canvasModeShared')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
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

          {userProjects.length === 0 && !historyProject && (
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

            {historyProject && (
              <button
                type="button"
                className={cn('sidebar-history top-level', activeProject?.id === historyProject.id && 'active')}
                title={historyProject.path}
                onClick={() => onSelectProject(historyProject.id)}
              >
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">{t('historyFolder')}</span>
              </button>
            )}

            {userProjects.map((project) => (
              <div key={project.id} className="sidebar-project-group">
                <div className="sidebar-project-row" title={project.path}>
                  <button
                    type="button"
                    className={cn('sidebar-project', activeProject?.id === project.id && 'active')}
                    onClick={() => onSelectProject(project.id)}
                  >
                    <FolderOpen className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                  </button>
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
        <SidebarThemeControl theme={theme} onThemeChange={onThemeChange} t={t} />
        <ReleaseInfo
          appVersion={appVersion}
          language={language}
          onOpenReleases={onOpenReleases}
          onRefreshRelease={onRefreshRelease}
          releaseState={releaseState}
          t={t}
        />
        <Button className="w-full justify-start" variant="destructive" onClick={onKillAll}>
          <Trash2 className="h-4 w-4" />
          {t('closeAll')}
        </Button>
        <Button className="w-full justify-start" variant="ghost" onClick={onOpenCodexConfig}>
          <Settings2 className="h-4 w-4" />
          {t('settings')}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function App() {
  const initialSettings = useMemo(loadSettings, []);
  const initialWorkspace = useMemo(loadWorkspace, []);
  const initialView = useMemo(() => normalizeCanvasView(initialSettings.view), [initialSettings.view]);
  const [cwd, setCwd] = useState(initialSettings.cwd);
  const [theme, setTheme] = useState(initialSettings.theme);
  const [language, setLanguage] = useState(initialSettings.language);
  const [view, setView] = useState(initialView);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [panels, setPanels] = useState([]);
  const [endpointGroups, setEndpointGroups] = useState([]);
  const [selectedEndpointIds, setSelectedEndpointIds] = useState(() => new Set());
  const [activeId, setActiveId] = useState(null);
  const [launchCliProviderId, setLaunchCliProviderId] = useState(defaultCliProviderId);
  const [codexOpen, setCodexOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [gridSessionOpen, setGridSessionOpen] = useState(false);
  const [workspaceTreeOpen, setWorkspaceTreeOpen] = useState(false);
  const [workspaceTreeState, setWorkspaceTreeState] = useState({
    status: 'idle',
    snapshot: null,
    error: '',
    requestedPath: ''
  });
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
  const [releaseState, setReleaseState] = useState({ status: 'idle', release: null, error: '' });
  const [panning, setPanning] = useState(false);
  const [toast, setToast] = useState('');
  const [commandDockValue, setCommandDockValue] = useState('');
  const [commandDockTargetId, setCommandDockTargetId] = useState('');
  const viewportRef = useRef(null);
  const commandDockInputRef = useRef(null);
  const commandDockComposingRef = useRef(false);
  const commandDockPendingSubmitRef = useRef(false);
  const panelActivityQueueRef = useRef(new Map());
  const panelActivityFlushTimer = useRef(null);
  const terminalInstances = useRef(new Map());
  const panelsRef = useRef([]);
  const endpointGroupsRef = useRef([]);
  const workspaceRef = useRef(workspace);
  const historyProjectRef = useRef(historyProject);
  const viewRef = useRef(view);
  const canvasScopeKeyRef = useRef(getWorkspaceCanvasKey(initialWorkspace));
  const activeIdRef = useRef(null);
  const cwdRef = useRef(cwd);
  const workspaceTreeRequestIdRef = useRef(0);
  const workspaceSkillsRequestIdRef = useRef(0);
  const nextZIndex = useRef(10);
  const toastTimer = useRef(null);
  const saveSettingsTimer = useRef(null);
  const saveWorkspaceTimer = useRef(null);
  const persistCanvasViewTimer = useRef(null);

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
  const visiblePanels = useMemo(
    () => panels.filter((panel) => isPanelVisibleInWorkspace(panel, workspace)),
    [panels, workspace.activeProjectId, workspace.canvasMode]
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
  const commandDockVisible = visiblePanels.length > 0;

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  useEffect(() => {
    if (panels.length === 0) {
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
    cwdRef.current = cwd;
  }, [cwd]);

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

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

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

  const copyWorkspaceTree = useCallback(() => {
    const snapshot = workspaceTreeState.snapshot;
    if (!snapshot?.text) {
      return;
    }

    const copied = writeClipboardText(`${snapshot.cwd}\n\n${snapshot.text}`);
    if (copied) {
      showToast(t('workspaceTreeCopied'));
    }
  }, [showToast, t, workspaceTreeState.snapshot]);

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

  const handleCommandDockInputChange = useCallback((event) => {
    setCommandDockValue(event.target.value);
    resizeCommandDockInput(event.target);
  }, [resizeCommandDockInput]);

  const selectCommandDockTarget = useCallback((id) => {
    setCommandDockTargetId(id);
    window.requestAnimationFrame(() => commandDockInputRef.current?.focus());
  }, []);

  const insertTextIntoCommandDock = useCallback((text) => {
    const normalizedText = String(text || '');
    if (!normalizedText) {
      return;
    }

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
  }, [commandDockValue, resizeCommandDockInput]);

  const saveCommandDockImages = useCallback(async (files) => {
    const imageFiles = Array.isArray(files) ? files.filter((file) => isImageFile(file)) : [];
    if (imageFiles.length === 0) {
      return false;
    }

    const targetPanel = commandDockPanels.find((panel) => panel.id === commandDockTargetId)
      || panelsRef.current.find((panel) => panel.id === commandDockTargetId)
      || panelsRef.current.find((panel) => panel.id === activeIdRef.current)
      || null;
    const assetCwd = String(targetPanel?.cwd || cwdRef.current || defaultCwd || '').trim();
    if (!assetCwd) {
      showToast(t('floatingComposerImageMissingDir'));
      return false;
    }

    try {
      const references = [];
      for (const file of imageFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const savedImage = await bridge.saveCommandDockImage({
          cwd: assetCwd,
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
  }, [commandDockPanels, commandDockTargetId, defaultCwd, insertTextIntoCommandDock, showToast, t]);

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

  const submitCommandDockPayload = useCallback((panelId, value) => {
    const text = String(value || '');
    if (!text) {
      return false;
    }

    const instance = terminalInstances.current.get(panelId);
    if (instance?.term) {
      // Route quick-send through xterm so CLIs that enable bracketed paste
      // receive a real paste event, then submit with a separate Enter.
      instance.term.paste(text);
      instance.term.input('\r', false);
      return true;
    }

    bridge.writeTerminal(panelId, normalizeTerminalInputPayload(text));
    return true;
  }, []);

  const sendCommandDockInput = useCallback((options = {}) => {
    const targetPanel = commandDockPanels.find((panel) => panel.id === commandDockTargetId);
    if (!canPanelReceiveInput(targetPanel)) {
      return false;
    }

    const hasExplicitValue = Object.prototype.hasOwnProperty.call(options, 'value');
    const rawValue = hasExplicitValue
      ? options.value
      : commandDockInputRef.current?.value ?? commandDockValue;
    const shouldTrimTrailingBreaks = options.trimTrailingLineBreaks !== false;
    const nextValue = shouldTrimTrailingBreaks ? trimTrailingLineBreaks(rawValue) : rawValue;
    if (!String(nextValue || '').trim()) {
      return false;
    }

    touchPanelActivity(targetPanel.id);
    submitCommandDockPayload(targetPanel.id, nextValue);
    setCommandDockValue('');
    showToast(t('floatingComposerSent', { name: targetPanel.title }));
    window.requestAnimationFrame(() => {
      resizeCommandDockInput();
      commandDockInputRef.current?.focus();
    });
    return true;
  }, [commandDockPanels, commandDockTargetId, commandDockValue, resizeCommandDockInput, showToast, submitCommandDockPayload, t, touchPanelActivity]);

  const handleCommandDockCompositionStart = useCallback(() => {
    commandDockComposingRef.current = true;
  }, []);

  const handleCommandDockCompositionEnd = useCallback(() => {
    commandDockComposingRef.current = false;
    if (!commandDockPendingSubmitRef.current) {
      return;
    }

    commandDockPendingSubmitRef.current = false;
    const committedValue = trimTrailingLineBreaks(commandDockInputRef.current?.value || '');
    setCommandDockValue(committedValue);
    window.requestAnimationFrame(() => {
      sendCommandDockInput({
        value: committedValue
      });
    });
  }, [sendCommandDockInput]);

  const handleCommandDockKeyDown = useCallback((event) => {
    if (!isCommandDockSubmitKey(event) || event.shiftKey) {
      return;
    }

    const isComposing = commandDockComposingRef.current
      || event.nativeEvent?.isComposing
      || event.keyCode === 229
      || event.which === 229;
    if (isComposing) {
      commandDockPendingSubmitRef.current = true;
      return;
    }

    commandDockPendingSubmitRef.current = false;
    event.preventDefault();
    sendCommandDockInput();
  }, [sendCommandDockInput]);

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

  const loadLatestRelease = useCallback((force = false) => {
    setReleaseState((current) => ({ ...current, status: 'loading', error: '' }));
    bridge.getLatestRelease({ force }).then((snapshot) => {
      setReleaseState({
        status: 'loaded',
        release: snapshot?.release || null,
        error: ''
      });
    }).catch((error) => {
      setReleaseState((current) => ({
        ...current,
        status: 'error',
        error: error.message
      }));
    });
  }, []);

  const openReleases = useCallback((url = releasesUrl) => {
    bridge.openExternal(url || releasesUrl).catch((error) => showToast(error.message));
  }, [showToast]);

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
    loadLatestRelease(false);
  }, [loadLatestRelease]);

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
      localStorage.setItem(settingsKey, JSON.stringify({ cwd, theme, language, view }));
    }, 180);
  }, [cwd, language, theme, view]);

  useEffect(() => () => window.clearTimeout(saveSettingsTimer.current), []);

  useEffect(() => {
    window.clearTimeout(saveWorkspaceTimer.current);
    saveWorkspaceTimer.current = window.setTimeout(() => {
      localStorage.setItem(workspaceKey, JSON.stringify(workspace));
    }, 220);
  }, [workspace]);

  useEffect(() => () => window.clearTimeout(saveWorkspaceTimer.current), []);

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

  useEffect(() => {
    const offData = bridge.onTerminalData(({ id, data }) => {
      touchPanelActivity(id);
      terminalInstances.current.get(id)?.term.write(data);
    });

    const offExit = bridge.onTerminalExit(({ id, exitCode, signal }) => {
      const instance = terminalInstances.current.get(id);
      const label = exitCode === null || typeof exitCode === 'undefined'
        ? signal || 'closed'
        : `code ${exitCode}`;
      instance?.term.write(`\r\n\x1b[38;5;246m[process exited: ${label}]\x1b[0m\r\n`);
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
  }, [touchPanelActivity]);

  const getViewportRect = useCallback(() => viewportRef.current.getBoundingClientRect(), []);

  const viewportCenterOnCanvas = useCallback(() => {
    const rect = getViewportRect();
    return {
      x: (rect.width / 2 - view.x) / view.scale,
      y: (rect.height / 2 - view.y) / view.scale
    };
  }, [getViewportRect, view]);

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
    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, zIndex: nextZIndex.current } : panel
    )));
    if (!panel?.minimized) {
      window.requestAnimationFrame(() => focusTerminalInstance(id));
    }
  }, [focusTerminalInstance]);

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
      status: 'running'
    };

    setPanels((current) => [...current, panel]);
    setActiveId(meta.id);
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

  const createWorkspaceCommandLineFromConfig = useCallback((config = {}) => {
    const run = async () => {
      const launchContext = getCurrentSessionLaunchContext();
      const nextCwd = String(config.cwd || '').trim() || launchContext.cwd;
      const cliProvider = resolveCliProvider(config.cliProviderId || launchCliProviderId);
      const cliProviderId = cliProvider?.id || defaultCliProviderId;

      setLaunchCliProviderId(cliProviderId);

      await createTerminal({
        projectId: Object.prototype.hasOwnProperty.call(config, 'projectId')
          ? config.projectId
          : launchContext.projectId,
        cwd: nextCwd,
        cliProviderId,
        targetType: 'directory'
      });
    };

    run().catch((error) => showToast(error.message));
  }, [createTerminal, getCurrentSessionLaunchContext, launchCliProviderId, showToast]);

  const createWorkspaceCommandLine = useCallback((cliProviderId) => {
    createWorkspaceCommandLineFromConfig(
      typeof cliProviderId === 'string' ? { cliProviderId } : {}
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
      height: panel.height
    });
  }, [closeTerminal, createTerminal]);

  const updatePanel = useCallback((id, patch) => {
    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, ...patch } : panel
    )));
  }, []);

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
  }, [language, updatePanel]);

  const activateEndpointGroup = useCallback((id) => {
    nextZIndex.current += 1;
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

    setPanels((current) => current.map((panel) => ({
      ...panel,
      ...(positions.get(panel.id) || {})
    })));
  }, [getVisiblePanels, viewportCenterOnCanvas]);

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
      path: selected,
      createdAt: now,
      updatedAt: now
    };

    commitWorkspace((currentWorkspace) => ({
      ...currentWorkspace,
      activeProjectId: project.id,
      projects: [project, ...currentWorkspace.projects]
    }));
    setCwd(project.path);
    showToast(t('addedProject', { name: project.name }));
  }, [commitWorkspace, showToast, t]);

  const selectProject = useCallback((projectId) => {
    const project = findProjectById(workspaceRef.current.projects, historyProjectRef.current, projectId);
    if (!project) {
      return;
    }
    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, activeProjectId: project.id }));
    setCwd(project.path);
    showToast(t('switchedProject', { name: project.name }));
  }, [commitWorkspace, showToast, t]);

  const selectNoProject = useCallback(() => {
    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, activeProjectId: null }));
    setCwd('');
    showToast(t('switchedProject', { name: t('noProject') }));
  }, [commitWorkspace, showToast, t]);

  const changeCanvasMode = useCallback((mode) => {
    if (!canvasModes.has(mode) || mode === workspaceRef.current.canvasMode) {
      return;
    }

    commitWorkspace((currentWorkspace) => ({ ...currentWorkspace, canvasMode: mode }));
    showToast(t(mode === 'shared' ? 'switchedCanvasModeShared' : 'switchedCanvasModeProject'));
  }, [commitWorkspace, showToast, t]);

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
      return {
        ...workspaceWithView,
        activeProjectId: nextActiveProject?.id || null,
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

  const startViewportPan = (event) => {
    if (
      event.button !== 0 ||
      closestElement(event.target, '.terminal-panel') ||
      closestElement(event.target, '.endpoint-group')
    ) {
      return;
    }

    event.preventDefault();
    setPanning(true);
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
    if (
      closestElement(event.target, '.terminal-panel') ||
      closestElement(event.target, '.endpoint-group')
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
  }, [closeTerminal, createWorkspaceCommandLine, createWorkspaceSession, openNewSessionPicker]);

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
          language={language}
          theme={theme}
          onAddProject={openProjectDialog}
          onAddCommandLine={openCommandLineDialog}
          onAddSession={openNewSessionPicker}
          onCanvasModeChange={changeCanvasMode}
          onKillAll={killAll}
          onOpenPath={openWorkspacePath}
          onOpenReleases={openReleases}
          onOpenCodexConfig={() => setCodexOpen(true)}
          onRefreshSkills={refreshWorkspaceSkills}
          onRefreshRelease={() => loadLatestRelease(true)}
          onDeleteProject={deleteProject}
          onSelectNoProject={selectNoProject}
          onSelectProject={selectProject}
          onThemeChange={setTheme}
          onToggleSkillsCollapsed={toggleSkillsCollapsed}
          releaseState={releaseState}
          skillsRootPath={skillsRootPath}
          skillsState={workspaceSkillsState}
          t={t}
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
            className={cn('viewport', panning && 'is-panning')}
            tabIndex={0}
            style={{
              backgroundSize: `${majorGrid}px ${majorGrid}px, ${majorGrid}px ${majorGrid}px, ${minorGrid}px ${minorGrid}px, ${minorGrid}px ${minorGrid}px`,
              backgroundPosition: `${view.x}px ${view.y}px`
            }}
            onPointerDown={startViewportPan}
            onWheel={handleWheel}
          >
            <div className="canvas-tools">
              <Button id="groupEndpoints" onClick={groupEndpoints} disabled={groupableEndpointCount < 2}>
                <Grid2X2 className="h-4 w-4" />
                {groupableEndpointCount > 0 ? `${t('groupEndpoints')} ${groupableEndpointCount}` : t('groupEndpoints')}
              </Button>
              <Button id="arrangeGrid" onClick={arrangeGrid}>
                <LayoutGrid className="h-4 w-4" />
                {t('arrange')}
              </Button>
            </div>
            <div
              id="stage"
              className="stage"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            >
              {visibleEndpointGroups.map(({ group, panels: groupPanels }) => (
                <EndpointGroup
                  key={group.id}
                  group={group}
                  panels={groupPanels}
                  runtimeNow={runtimeNow}
                  scale={view.scale}
                  commandTargetId={commandDockTargetId}
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
                  onActivate={activatePanel}
                  onClose={closeTerminal}
                  onExpand={expandPanel}
                  onMinimize={minimizePanel}
                  onMove={updatePanel}
                  onResize={updatePanel}
                  onRestart={restartTerminal}
                  onSelectToggle={toggleEndpointSelection}
                  onTerminalInput={touchPanelActivity}
                  onTitleChange={(id, title) => updatePanel(id, { title })}
                  onTitleCommit={commitPanelTitle}
                  registerTerminal={registerTerminal}
                />
                );
              })}
            </div>

            {visiblePanels.length === 0 && (
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
            currentPath={currentWorkspacePath}
            onClose={() => setWorkspaceTreeOpen(false)}
            onCopy={copyWorkspaceTree}
            onOpen={openWorkspaceTree}
            onRefresh={refreshWorkspaceTree}
            open={workspaceTreeOpen}
            state={workspaceTreeState}
            t={t}
          />
        </div>
      </div>

      {commandDockVisible && (
        <FloatingCommandDock
          activeId={activeId}
          inputRef={commandDockInputRef}
          language={language}
          message={commandDockValue}
          onExport={exportTerminal}
          onExportCustom={exportTerminalCustom}
          onInputChange={handleCommandDockInputChange}
          onInputCompositionEnd={handleCommandDockCompositionEnd}
          onInputCompositionStart={handleCommandDockCompositionStart}
          onInputDragOver={handleCommandDockDragOver}
          onInputKeyDown={handleCommandDockKeyDown}
          onInputDrop={handleCommandDockDrop}
          onInputPaste={handleCommandDockPaste}
          onSend={sendCommandDockInput}
          onTargetChange={selectCommandDockTarget}
          panels={commandDockPanels}
          targetId={commandDockTargetId}
          t={t}
        />
      )}

      <CodexConfigDialog
        language={language}
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

      <CommandLineConfigDialog
        initialCliProviderId={launchCliProviderId}
        initialDirectory={currentWorkspacePath}
        language={language}
        onCreate={createCommandLineFromDialog}
        onOpenChange={setCommandDialogOpen}
        open={commandDialogOpen}
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
        <Card id="toast" className={cn('toast', commandDockVisible && 'is-lifted')}>
          <CardContent className="p-0">{toast}</CardContent>
        </Card>
      )}
    </TooltipProvider>
  );
}
