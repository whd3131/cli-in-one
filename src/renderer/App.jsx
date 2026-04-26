import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  Check,
  Cpu,
  Download,
  ExternalLink,
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

const bridge = window.cliBridge;
const settingsKey = 'cli-in-one.settings.v3';
const workspaceKey = 'cli-in-one.workspace.v1';
const appLogoUrl = `${import.meta.env.BASE_URL}logo.webp`;
const releasesUrl = 'https://github.com/whd3131/cli-in-one/releases';
const canvasModes = new Set(['shared', 'project']);
const sharedCanvasKey = '__shared__';
const noProjectCanvasKey = '__no_project__';
const historyProjectId = '__history__';
const endpointWidth = 300;
const endpointHeight = 44;
const systemStatsRefreshMs = 2000;

function createDefaultView() {
  return { x: 80, y: 80, scale: 1 };
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
    addSession: '新增会话',
    newSessionSource: '选择会话目录',
    newSessionSourceDescription: '项目目录启动 Codex，自由窗口启动 cmd。',
    freeWindow: '自由窗口',
    defaultDirectory: '默认目录',
    directory: '目录',
    chooseDirectory: '选择目录',
    zoomOut: '缩小',
    zoomIn: '放大',
    arrange: '整理',
    cpuUsage: 'CPU',
    memoryUsage: '内存',
    systemStatsUnavailable: '系统状态不可用',
    runningModePipe: '管道模式',
    runtimeStarting: '启动中',
    session: '会话',
    sessionFallbackTitle: '会话',
    startEmpty: '新增会话开始',
    startHint: '可从项目目录启动 Codex，或创建自由 cmd 会话。',
    movePanel: '移动会话',
    minimizeSession: '缩成端点',
    expandSession: '展开会话',
    renameSession: '修改会话名称',
    groupEndpoints: '分组端点',
    ungroupEndpoints: '取消分组',
    endpointGroup: '端点组',
    groupEndpointsUnavailable: '至少需要两个已收起端点。',
    taskRunning: '进行中',
    taskCompleted: '已完成',
    taskError: '异常',
    sessionRuntime: '运行',
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
    validate: '校验',
    openFolder: '打开目录',
    save: '保存',
    loading: '加载中',
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
    addSession: 'New session',
    newSessionSource: 'Choose session directory',
    newSessionSourceDescription: 'Project folders start Codex; free windows start cmd.',
    freeWindow: 'Free window',
    defaultDirectory: 'Default directory',
    directory: 'Directory',
    chooseDirectory: 'Choose directory',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    arrange: 'Arrange',
    cpuUsage: 'CPU',
    memoryUsage: 'Memory',
    systemStatsUnavailable: 'System stats unavailable',
    runningModePipe: 'Pipe mode',
    runtimeStarting: 'Starting',
    session: 'Session',
    sessionFallbackTitle: 'Session',
    startEmpty: 'Start a new session',
    startHint: 'Start Codex from a project folder, or create a free cmd session.',
    movePanel: 'Move session',
    minimizeSession: 'Minimize to endpoint',
    expandSession: 'Expand session',
    renameSession: 'Rename session',
    groupEndpoints: 'Group endpoints',
    ungroupEndpoints: 'Ungroup endpoints',
    endpointGroup: 'Endpoint group',
    groupEndpointsUnavailable: 'At least two minimized endpoints are required.',
    taskRunning: 'Running',
    taskCompleted: 'Completed',
    taskError: 'Error',
    sessionRuntime: 'Run',
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
    validate: 'Validate',
    openFolder: 'Open folder',
    save: 'Save',
    loading: 'Loading',
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

function getPanelExecutionState(panel) {
  if (panel?.status === 'running' || panel?.status === 'starting') {
    return 'running';
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

  if (state === 'completed') {
    return t('taskCompleted');
  }

  return t('taskError');
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
  const endedAt = getPanelExecutionState(panel) === 'running'
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
  if (!panel?.codexSession) {
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

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    return {
      cwd: saved.cwd || '',
      theme: saved.theme === 'dark' ? 'dark' : 'light',
      language: saved.language === 'en' ? 'en' : 'zh',
      view: normalizeCanvasView(saved.view)
    };
  } catch {
    localStorage.removeItem(settingsKey);
    return { cwd: '', theme: 'light', language: 'zh', view: createDefaultView() };
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
  }, { running: 0, completed: 0, error: 0 });
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

    const onPointerMove = (moveEvent) => {
      onMove(group.id, {
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / scale),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / scale)
      });
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
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
          return (
            <div
              key={panel.id}
              className={cn('endpoint-group-row', selected && 'is-selected')}
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
  onActivate,
  onClose,
  onExport,
  onExportCustom,
  onExpand,
  onMinimize,
  onMove,
  onResize,
  onRestart,
  onSelectToggle,
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

    const dataDisposable = term.onData((data) => bridge.writeTerminal(panel.id, data));
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
  }, [fitTerminal, onActivate, panel.cwd, panel.id, registerTerminal, syncScrollbarState]);

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

    const onPointerMove = (moveEvent) => applyPointer(moveEvent.clientY);
    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
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

    const onPointerMove = (moveEvent) => {
      onMove(panel.id, {
        x: Math.round(start.x + (moveEvent.clientX - start.clientX) / scale),
        y: Math.round(start.y + (moveEvent.clientY - start.clientY) / scale)
      });
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
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

    const onPointerMove = (moveEvent) => {
      onResize(panel.id, {
        width: Math.round(clamp(start.width + (moveEvent.clientX - start.clientX) / scale, 360, 1800)),
        height: Math.round(clamp(start.height + (moveEvent.clientY - start.clientY) / scale, 220, 1200))
      });
    };

    const onPointerUp = () => {
      fitTerminal();
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
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
            <GripVertical className="h-4 w-4" />
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
            panel.codexSession
              ? 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_auto_28px_28px_28px_28px_28px]'
              : 'grid-cols-[28px_minmax(70px,1fr)_auto_auto_28px_28px_28px_28px_28px]'
          )}
          title={t('movePanel')}
          onPointerDown={startDrag}
        >
          <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" tabIndex={-1}>
            <GripVertical className="h-4 w-4" />
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
          <SessionStatusTag panel={panel} t={t} />
          <SessionRuntimeTag panel={panel} now={runtimeNow} t={t} />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6 text-xs font-bold"
            title={t('exportSession')}
            aria-label={t('exportSession')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onExport(panel.id)}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-6 w-6 text-xs font-bold"
            title={t('exportSessionCustom')}
            aria-label={t('exportSessionCustom')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onExportCustom(panel.id)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
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

function CodexConfigDialog({ language, onLanguageChange, onOpenChange, onProfileChanged, onThemeChange, open, showToast, t, theme }) {
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
            <div className="grid gap-2 md:grid-cols-2">
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
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">{t('appearance')}</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={theme === 'light' ? 'primary' : 'outline'} onClick={() => onThemeChange('light')}>
                    <Sun className="h-4 w-4" />
                    {t('light')}
                  </Button>
                  <Button type="button" variant={theme === 'dark' ? 'primary' : 'outline'} onClick={() => onThemeChange('dark')}>
                    <Moon className="h-4 w-4" />
                    {t('dark')}
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

function NewSessionDialog({ defaultCwd, onOpenChange, onSelect, open, projects, t }) {
  const freeWindowDirectory = defaultCwd || t('defaultDirectory');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="newSessionDialog" className="w-[min(560px,calc(100vw-32px))] p-0">
        <DialogHeader>
          <DialogTitle>{t('newSessionSource')}</DialogTitle>
          <DialogDescription>{t('newSessionSourceDescription')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 p-4">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
            onClick={() => onSelect({ type: 'free' })}
          >
            <SquareTerminal className="h-4 w-4 shrink-0" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="truncate font-medium">{t('freeWindow')}</span>
              <span className="truncate text-xs font-normal text-muted-foreground" title={freeWindowDirectory}>
                {freeWindowDirectory}
              </span>
            </span>
          </Button>

          {projects.length > 0 && (
            <div className="grid max-h-[min(420px,calc(100vh-270px))] gap-2 overflow-y-auto pr-1">
              {projects.map((project) => (
                <Button
                  key={project.id}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
                  onClick={() => onSelect({ type: 'project', projectId: project.id })}
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
      </DialogContent>
    </Dialog>
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

function WorkspaceSidebar({
  appVersion,
  workspace,
  activeProject,
  historyProject,
  language,
  onAddProject,
  onCanvasModeChange,
  onKillAll,
  onAddSession,
  onOpenReleases,
  onOpenCodexConfig,
  onRefreshRelease,
  onDeleteProject,
  onSelectNoProject,
  onSelectProject,
  releaseState,
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
        <IconButton label={t('addProject')} onClick={onAddProject}>
          <FolderPlus className="h-4 w-4" />
        </IconButton>
        <div className="sidebar-rail-spacer" />
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
      </SidebarContent>

      <SidebarFooter>
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
  const [codexOpen, setCodexOpen] = useState(false);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState('');
  const [historyProject, setHistoryProject] = useState(null);
  const [systemStats, setSystemStats] = useState(null);
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  const [appInfo, setAppInfo] = useState({ appVersion: '' });
  const [codexProfileState, setCodexProfileState] = useState(createEmptyCodexProfile);
  const [codexProfileLoading, setCodexProfileLoading] = useState(true);
  const [modelSwitching, setModelSwitching] = useState('');
  const [releaseState, setReleaseState] = useState({ status: 'idle', release: null, error: '' });
  const [panning, setPanning] = useState(false);
  const [toast, setToast] = useState('');
  const viewportRef = useRef(null);
  const terminalInstances = useRef(new Map());
  const panelsRef = useRef([]);
  const endpointGroupsRef = useRef([]);
  const workspaceRef = useRef(workspace);
  const historyProjectRef = useRef(historyProject);
  const viewRef = useRef(view);
  const canvasScopeKeyRef = useRef(getWorkspaceCanvasKey(initialWorkspace));
  const activeIdRef = useRef(null);
  const cwdRef = useRef(cwd);
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

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

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

  const switchCodexModel = useCallback(async (nextModel) => {
    const normalizedModel = String(nextModel || '').trim();
    if (!normalizedModel || normalizedModel === String(codexProfileState.model || '').trim()) {
      return;
    }

    setModelSwitching(normalizedModel);
    try {
      const snapshot = await bridge.writeCodexProfile({
        ...codexProfileState,
        model: normalizedModel
      });
      const normalizedProfile = normalizeCodexProfile(snapshot.profile);
      setCodexProfileState(normalizedProfile);
      showToast(t('modelSwitched', { model: normalizedProfile.model || normalizedModel }));
    } catch (error) {
      showToast(t('modelSwitchFailed', { message: error.message }));
    } finally {
      setModelSwitching('');
    }
  }, [codexProfileState, showToast, t]);

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
  }, []);

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
    const title = slot.title || `${t('session')} ${getVisiblePanels().length + 1}`;
    const x = Number.isFinite(slot.x) ? slot.x : center.x - width / 2;
    const y = Number.isFinite(slot.y) ? slot.y : center.y - height / 2;
    const projectId = Object.prototype.hasOwnProperty.call(slot, 'projectId')
      ? slot.projectId || null
      : workspaceRef.current.activeProjectId || null;
    const terminalCwd = Object.prototype.hasOwnProperty.call(slot, 'cwd')
      ? slot.cwd
      : cwdRef.current;
    const initialCommand = Object.prototype.hasOwnProperty.call(slot, 'initialCommand')
      ? slot.initialCommand
      : 'codex';

    const meta = await bridge.createTerminal({
      title,
      cwd: terminalCwd,
      cols: 100,
      rows: 28,
      initialCommand
    });

    nextZIndex.current += 1;
    const panel = {
      id: meta.id,
      projectId,
      title: meta.title,
      cwd: meta.cwd,
      backend: meta.backend,
      codexSession: Boolean(meta.codexSession),
      codexModel: meta.codexModel || '',
      codexProviderName: meta.codexProviderName || '',
      initialCommand: meta.initialCommand,
      createdAt: Number.isFinite(meta.createdAt) ? meta.createdAt : Date.now(),
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
  }, [focusTerminalInstance, getVisiblePanels, t, viewportCenterOnCanvas]);

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
      initialCommand: Object.prototype.hasOwnProperty.call(panel, 'initialCommand') ? panel.initialCommand : 'codex',
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
    const nextTitle = title.trim() || t('sessionFallbackTitle');
    updatePanel(id, { title: nextTitle });
  }, [t, updatePanel]);

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

  const addGrid = useCallback(async () => {
    const center = viewportCenterOnCanvas();
    const width = 620;
    const height = 340;
    const gap = 28;
    const baseNumber = getVisiblePanels().length;
    const startX = Math.round(center.x - width - gap / 2);
    const startY = Math.round(center.y - height - gap / 2);
    const slots = [
      { x: startX, y: startY },
      { x: startX + width + gap, y: startY },
      { x: startX, y: startY + height + gap },
      { x: startX + width + gap, y: startY + height + gap }
    ];

    for (const [index, slot] of slots.entries()) {
      await createTerminal({
        ...slot,
        width,
        height,
        title: `${t('session')} ${baseNumber + index + 1}`
      });
    }
  }, [createTerminal, getVisiblePanels, t, viewportCenterOnCanvas]);

  const openNewSessionDialog = useCallback(() => {
    setNewSessionOpen(true);
  }, []);

  const createSessionFromSelection = useCallback((selection) => {
    setNewSessionOpen(false);

    const run = async () => {
      if (selection?.type === 'project') {
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
          initialCommand: 'codex'
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
        initialCommand: ''
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

  const chooseDirectory = useCallback(async () => {
    const selected = await bridge.chooseDirectory();
    if (selected) {
      setCwd(selected);
    }
  }, []);

  const addProject = useCallback(async () => {
    const selected = await bridge.chooseDirectory();
    if (!selected) {
      return;
    }

    const now = Date.now();
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
      name: deriveNameFromPath(selected),
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

    const onPointerMove = (moveEvent) => {
      setView((current) => ({
        ...current,
        x: start.x + moveEvent.clientX - start.clientX,
        y: start.y + moveEvent.clientY - start.clientY
      }));
    };

    const onPointerUp = () => {
      setPanning(false);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
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

  useEffect(() => {
    const onKeyDown = (event) => {
      const editable = event.target instanceof HTMLElement && (
        event.target.matches('input, textarea, select') ||
        event.target.isContentEditable
      );

      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        openNewSessionDialog();
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
  }, [closeTerminal, openNewSessionDialog]);

  const minorGrid = 48 * view.scale;
  const majorGrid = minorGrid * 4;
  const currentCodexModel = String(codexProfileState.model || '').trim();
  const activeTitle = workspace.canvasMode === 'shared'
    ? t('sharedWorkspace')
    : activeProject ? `${activeProject.name} ${t('workspace')}` : t('noProject');

  return (
    <TooltipProvider>
      <div className={cn('app-shell', workspace.sidebarCollapsed && 'sidebar-is-collapsed')}>
        <WorkspaceSidebar
          appVersion={appInfo.appVersion}
          workspace={workspace}
          activeProject={activeProject}
          historyProject={historyProject}
          language={language}
          onAddProject={addProject}
          onAddSession={openNewSessionDialog}
          onCanvasModeChange={changeCanvasMode}
          onKillAll={killAll}
          onOpenReleases={openReleases}
          onOpenCodexConfig={() => setCodexOpen(true)}
          onRefreshRelease={() => loadLatestRelease(true)}
          onDeleteProject={deleteProject}
          onSelectNoProject={selectNoProject}
          onSelectProject={selectProject}
          releaseState={releaseState}
          t={t}
          onToggleCollapsed={toggleSidebar}
        />

        <div className="main-shell">
          <header className="topbar">
            <div className="min-w-[160px] max-w-[260px]">
              <div className="truncate text-sm font-semibold">{activeTitle}</div>
              <div className="truncate text-xs text-muted-foreground">
                {activeProject ? activeProject.path : t('noProject')}
              </div>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div className="flex shrink-0 items-center gap-2">
              <Button id="addTerminal" variant="primary" onClick={openNewSessionDialog}>
                <Plus className="h-4 w-4" />
                {t('addSession')}
              </Button>
              <Button id="addGrid" onClick={addGrid}>
                <Grid2X2 className="h-4 w-4" />
                2x2
              </Button>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div
              className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2"
              title={currentCodexModel || t('modelUnset')}
            >
              <Label className="shrink-0 text-sm text-muted-foreground">
                {t('quickModel')}
              </Label>
              <QuickModelButtons
                className="flex-nowrap"
                currentModel={currentCodexModel}
                disabled={codexOpen || codexProfileLoading || Boolean(modelSwitching)}
                onSelect={switchCodexModel}
                t={t}
              />
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div className="flex h-10 min-w-[250px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2 pl-3">
              <Label htmlFor="cwdInput" className="shrink-0 text-sm text-muted-foreground">
                {t('directory')}
              </Label>
              <Input
                id="cwdInput"
                className="h-8 min-w-[70px] border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0"
                value={cwd}
                spellCheck={false}
                onChange={(event) => setCwd(event.target.value)}
              />
              <IconButton id="browseDir" label={t('chooseDirectory')} onClick={chooseDirectory}>
                <FolderOpen className="h-4 w-4" />
              </IconButton>
            </div>

            <Separator orientation="vertical" className="h-8" />

            <div className="flex shrink-0 items-center gap-1.5">
              <IconButton id="zoomOut" label={t('zoomOut')} onClick={() => {
                const rect = getViewportRect();
                zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale / 1.16);
              }}>
                <Minus className="h-4 w-4" />
              </IconButton>
              <Button id="resetView" onClick={() => setView(createDefaultView())}>
                <RotateCcw className="h-4 w-4" />
                {Math.round(view.scale * 100)}%
              </Button>
              <IconButton id="zoomIn" label={t('zoomIn')} onClick={() => {
                const rect = getViewportRect();
                zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale * 1.16);
              }}>
                <ZoomIn className="h-4 w-4" />
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
                  onActivate={activatePanel}
                  onClose={closeTerminal}
                  onExport={(id) => exportTerminal(id)}
                  onExportCustom={exportTerminalCustom}
                  onExpand={expandPanel}
                  onMinimize={minimizePanel}
                  onMove={updatePanel}
                  onResize={updatePanel}
                  onRestart={restartTerminal}
                  onSelectToggle={toggleEndpointSelection}
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
        </div>
      </div>

      <CodexConfigDialog
        language={language}
        onLanguageChange={setLanguage}
        onOpenChange={setCodexOpen}
        onProfileChanged={setCodexProfileState}
        onThemeChange={setTheme}
        open={codexOpen}
        showToast={showToast}
        t={t}
        theme={theme}
      />

      <NewSessionDialog
        defaultCwd={defaultCwd}
        onOpenChange={setNewSessionOpen}
        onSelect={createSessionFromSelection}
        open={newSessionOpen}
        projects={projectsWithHistory}
        t={t}
      />

      {toast && (
        <Card id="toast" className="toast">
          <CardContent className="p-0">{toast}</CardContent>
        </Card>
      )}
    </TooltipProvider>
  );
}
