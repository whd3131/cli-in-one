import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import {
  Check,
  FolderOpen,
  GripVertical,
  Grid2X2,
  LayoutGrid,
  Minus,
  Moon,
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
const settingsKey = 'cli-in-one.settings.v2';

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || '{}');
    const preferredTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return {
      cwd: saved.cwd || '',
      theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : preferredTheme,
      view: saved.view && Number.isFinite(saved.view.x) && Number.isFinite(saved.view.y) && Number.isFinite(saved.view.scale)
        ? { x: saved.view.x, y: saved.view.y, scale: clamp(saved.view.scale, 0.35, 2.5) }
        : { x: 80, y: 80, scale: 1 }
    };
  } catch {
    localStorage.removeItem(settingsKey);
    const preferredTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return { cwd: '', theme: preferredTheme, view: { x: 80, y: 80, scale: 1 } };
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

function TerminalPanel({
  panel,
  active,
  scale,
  theme,
  onActivate,
  onClose,
  onMove,
  onResize,
  onRestart,
  onTitleChange,
  registerTerminal
}) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);

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
      } catch {
        // Fitting can race with unmount.
      }
    });
  }, [panel.id]);

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

    const dataDisposable = term.onData((data) => bridge.writeTerminal(panel.id, data));
    const resizeDisposable = term.onResize(({ cols, rows }) => bridge.resizeTerminal(panel.id, cols, rows));
    const unregister = registerTerminal(panel.id, { term, fitAddon, fit: fitTerminal });

    term.write(`\x1b[38;5;246m${panel.cwd}\x1b[0m\r\n`);
    fitTerminal();

    return () => {
      dataDisposable.dispose();
      resizeDisposable.dispose();
      unregister();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fitTerminal, panel.cwd, panel.id, registerTerminal]);

  useEffect(() => {
    fitTerminal();
  }, [fitTerminal, panel.width, panel.height]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = terminalThemes[theme];
      termRef.current.refresh(0, termRef.current.rows - 1);
    }
  }, [theme]);

  useEffect(() => {
    if (active) {
      termRef.current?.focus();
    }
  }, [active]);

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

  return (
    <Card
      className={cn('terminal-panel', active && 'active')}
      data-terminal-id={panel.id}
      style={{
        left: panel.x,
        top: panel.y,
        width: panel.width,
        height: panel.height,
        zIndex: panel.zIndex
      }}
      onPointerDown={() => onActivate(panel.id)}
    >
      <CardHeader className="grid h-9 flex-none grid-cols-[28px_minmax(70px,1fr)_auto_28px_28px] items-center gap-1.5 space-y-0 border-b border-[var(--panel-header-border)] bg-[var(--panel-header)] px-1.5 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 cursor-grab text-muted-foreground"
          title="移动"
          aria-label="移动终端"
          onPointerDown={startDrag}
        >
          <GripVertical className="h-4 w-4" />
        </Button>
        <Input
          className="h-6 min-w-0 border-transparent bg-transparent px-2 text-sm font-semibold shadow-none focus:border-border focus:bg-background focus-visible:ring-0"
          value={panel.title}
          spellCheck={false}
          onChange={(event) => onTitleChange(panel.id, event.target.value)}
        />
        <Badge
          variant={panel.status === 'exit' ? 'destructive' : 'success'}
          className="h-[22px] font-mono text-[11px]"
        >
          {panel.status === 'exit' ? 'exit' : 'cmd'}
        </Badge>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-6 w-6 text-xs font-bold"
          title="重启"
          aria-label="重启终端"
          onClick={() => onRestart(panel.id)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-6 w-6"
          title="关闭"
          aria-label="关闭终端"
          onClick={() => onClose(panel.id)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent ref={hostRef} className="terminal-host p-2" />
      <div className="resize-handle" title="调整大小" onPointerDown={startResize} />
    </Card>
  );
}

function CodexConfigDialog({ open, onOpenChange, showToast }) {
  const [activeFile, setActiveFile] = useState('auth');
  const [pathText, setPathText] = useState('');
  const [value, setValue] = useState('');
  const [lastSavedValue, setLastSavedValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [status, setStatus] = useState('未加载');
  const [statusTone, setStatusTone] = useState('');
  const [saving, setSaving] = useState(false);
  const validationSeq = useRef(0);
  const validationTimer = useRef(null);

  const setStatusMessage = useCallback((message, tone = '') => {
    setStatus(message);
    setStatusTone(tone);
  }, []);

  const loadFile = useCallback(async (kind) => {
    setStatusMessage('加载中');
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
  }, [setStatusMessage]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadFile(activeFile).catch((error) => {
      setStatusMessage(error.message, 'error');
      showToast(`读取 Codex 配置失败：${error.message}`);
    });
  }, [activeFile, loadFile, open, setStatusMessage, showToast]);

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

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen && dirty && !window.confirm(`${codexFileMeta[activeFile].title} 还没有保存，确认关闭？`)) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const switchFile = (nextFile) => {
    if (nextFile === activeFile) {
      return;
    }

    if (dirty && !window.confirm('切换文件会丢弃当前未保存更改，确认切换？')) {
      return;
    }

    setActiveFile(nextFile);
  };

  const reload = () => {
    if (dirty && !window.confirm(`重新加载 ${codexFileMeta[activeFile].title} 会丢弃未保存更改，确认刷新？`)) {
      return;
    }
    loadFile(activeFile).catch((error) => {
      setStatusMessage(error.message, 'error');
      showToast(`刷新失败：${error.message}`);
    });
  };

  const save = async () => {
    const valid = await validate();
    if (!valid) {
      showToast(`${codexFileMeta[activeFile].invalid}，未保存。`);
      return;
    }

    setSaving(true);
    setStatusMessage('保存中');
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
    } catch (error) {
      setStatusMessage(error.message, 'error');
      showToast(`保存失败：${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const openFolder = () => {
    bridge.openCodexConfigFolder().catch((error) => showToast(`打开目录失败：${error.message}`));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent id="codexConfigPanel" className="grid h-[calc(100vh-100px)] grid-rows-[auto_1fr_auto] p-0">
        <DialogHeader>
          <DialogTitle id="codexConfigTitle">{codexFileMeta[activeFile].title}</DialogTitle>
          <DialogDescription id="codexConfigPath" title={pathText}>{pathText}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 grid-rows-[auto_1fr_auto] gap-2 p-3">
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

          <Textarea
            id="codexConfigEditor"
            className={cn('config-editor h-full font-mono text-[13px]', invalid && 'is-invalid')}
            spellCheck={false}
            value={value}
            onChange={(event) => handleValueChange(event.target.value)}
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
            刷新
          </Button>
          <Button id="validateCodexConfig" type="button" onClick={() => validate()}>
            <Check className="h-4 w-4" />
            校验
          </Button>
          <Button id="openCodexFolder" type="button" onClick={openFolder}>
            <FolderOpen className="h-4 w-4" />
            打开目录
          </Button>
          <Button id="saveCodexConfig" type="button" variant="primary" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const initialSettings = useMemo(loadSettings, []);
  const [appInfo, setAppInfo] = useState(null);
  const [cwd, setCwd] = useState(initialSettings.cwd);
  const [theme, setTheme] = useState(initialSettings.theme);
  const [view, setView] = useState(initialSettings.view);
  const [panels, setPanels] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [panning, setPanning] = useState(false);
  const [toast, setToast] = useState('');
  const viewportRef = useRef(null);
  const terminalInstances = useRef(new Map());
  const panelsRef = useRef([]);
  const activeIdRef = useRef(null);
  const nextZIndex = useRef(10);
  const toastTimer = useRef(null);
  const saveSettingsTimer = useRef(null);

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const showToast = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    bridge.getAppInfo().then((info) => {
      setAppInfo(info);
      if (!cwd) {
        setCwd(info.homeDir || '');
      }
      if (!info.ptyEnabled) {
        showToast('当前使用管道模式；安装 node-pty 成功后会自动切换到 ConPTY。');
      }
    }).catch((error) => {
      showToast(error.message);
    });
  }, [cwd, showToast]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    window.clearTimeout(saveSettingsTimer.current);
    saveSettingsTimer.current = window.setTimeout(() => {
      localStorage.setItem(settingsKey, JSON.stringify({ cwd, theme, view }));
    }, 180);
  }, [cwd, theme, view]);

  useEffect(() => () => window.clearTimeout(saveSettingsTimer.current), []);

  const registerTerminal = useCallback((id, instance) => {
    terminalInstances.current.set(id, instance);
    return () => terminalInstances.current.delete(id);
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
        panel.id === id ? { ...panel, status: 'exit' } : panel
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

  const activatePanel = useCallback((id) => {
    nextZIndex.current += 1;
    setActiveId(id);
    setPanels((current) => current.map((panel) => (
      panel.id === id ? { ...panel, zIndex: nextZIndex.current } : panel
    )));
    window.requestAnimationFrame(() => terminalInstances.current.get(id)?.term.focus());
  }, []);

  const createTerminal = useCallback(async (slot = {}) => {
    const center = viewportCenterOnCanvas();
    const width = Number.isFinite(slot.width) ? slot.width : 640;
    const height = Number.isFinite(slot.height) ? slot.height : 380;
    const title = slot.title || `cmd ${panelsRef.current.length + 1}`;
    const x = Number.isFinite(slot.x) ? slot.x : center.x - width / 2;
    const y = Number.isFinite(slot.y) ? slot.y : center.y - height / 2;
    const meta = await bridge.createTerminal({
      title,
      cwd: slot.cwd || cwd,
      cols: 100,
      rows: 28
    });

    nextZIndex.current += 1;
    const panel = {
      id: meta.id,
      title: meta.title,
      cwd: meta.cwd,
      backend: meta.backend,
      x,
      y,
      width,
      height,
      zIndex: nextZIndex.current,
      status: 'running'
    };

    setPanels((current) => [...current, panel]);
    setActiveId(meta.id);
    window.requestAnimationFrame(() => terminalInstances.current.get(meta.id)?.term.focus());
    return panel;
  }, [cwd, viewportCenterOnCanvas]);

  const closeTerminal = useCallback(async (id) => {
    try {
      await bridge.killTerminal(id);
    } catch {
      // It may already be gone.
    }

    setPanels((current) => current.filter((panel) => panel.id !== id));
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
      cwd: panel.cwd,
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

  const arrangeGrid = useCallback(() => {
    const records = panelsRef.current;
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

    setPanels((current) => current.map((panel, index) => ({
      ...panel,
      x: startX + (index % cols) * (width + gap),
      y: startY + Math.floor(index / cols) * (height + gap),
      width,
      height
    })));
  }, [viewportCenterOnCanvas]);

  const addGrid = useCallback(async () => {
    const center = viewportCenterOnCanvas();
    const width = 620;
    const height = 340;
    const gap = 28;
    const baseNumber = panelsRef.current.length;
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
        title: `cmd ${baseNumber + index + 1}`
      });
    }
  }, [createTerminal, viewportCenterOnCanvas]);

  const killAll = useCallback(async () => {
    await bridge.killAllTerminals();
    setPanels([]);
    setActiveId(null);
  }, []);

  const chooseDirectory = useCallback(async () => {
    const selected = await bridge.chooseDirectory();
    if (selected) {
      setCwd(selected);
    }
  }, []);

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
    if (event.button !== 0 || closestElement(event.target, '.terminal-panel')) {
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

  useEffect(() => {
    const onKeyDown = (event) => {
      const editable = event.target instanceof HTMLElement && (
        event.target.matches('input, textarea, select') ||
        event.target.isContentEditable
      );

      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        createTerminal().catch((error) => showToast(error.message));
      }

      if (event.ctrlKey && event.key === '0') {
        event.preventDefault();
        setView({ x: 80, y: 80, scale: 1 });
      }

      if (event.key === 'Delete' && activeIdRef.current && !editable && !closestElement(event.target, '.terminal-host')) {
        closeTerminal(activeIdRef.current);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeTerminal, createTerminal, showToast]);

  const minorGrid = 48 * view.scale;
  const majorGrid = minorGrid * 4;

  return (
    <TooltipProvider>
      <div className="app-shell">
        <header className="topbar">
          <div className="flex min-w-[148px] items-center gap-2.5 font-bold tracking-normal">
            <span className="brand-mark" />
            <span>CLI in One</span>
          </div>

          <IconButton
            id="toggleTheme"
            label={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconButton>

          <Separator orientation="vertical" className="h-8" />

          <div className="flex shrink-0 items-center gap-2">
            <Button id="addTerminal" variant="primary" onClick={() => createTerminal().catch((error) => showToast(error.message))}>
              <Plus className="h-4 w-4" />
              CMD
            </Button>
            <Button id="addGrid" onClick={addGrid}>
              <Grid2X2 className="h-4 w-4" />
              2x2
            </Button>
          </div>

          <Separator orientation="vertical" className="h-8" />

          <div className="flex h-10 min-w-[270px] flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2 pl-3">
            <Label htmlFor="cwdInput" className="shrink-0 text-sm text-muted-foreground">
              目录
            </Label>
            <Input
              id="cwdInput"
              className="h-8 min-w-[70px] border-0 bg-transparent px-1 font-mono text-xs shadow-none focus-visible:ring-0"
              value={cwd}
              spellCheck={false}
              onChange={(event) => setCwd(event.target.value)}
            />
            <IconButton id="browseDir" label="选择目录" onClick={chooseDirectory}>
              <FolderOpen className="h-4 w-4" />
            </IconButton>
          </div>

          <Separator orientation="vertical" className="h-8" />

          <div className="flex shrink-0 items-center gap-1.5">
            <IconButton id="zoomOut" label="缩小" onClick={() => {
              const rect = getViewportRect();
              zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale / 1.16);
            }}>
              <Minus className="h-4 w-4" />
            </IconButton>
            <Button id="resetView" onClick={() => setView({ x: 80, y: 80, scale: 1 })}>
              <RotateCcw className="h-4 w-4" />
              {Math.round(view.scale * 100)}%
            </Button>
            <IconButton id="zoomIn" label="放大" onClick={() => {
              const rect = getViewportRect();
              zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.scale * 1.16);
            }}>
              <ZoomIn className="h-4 w-4" />
            </IconButton>
          </div>

          <Separator orientation="vertical" className="h-8" />

          <div className="flex shrink-0 items-center gap-2">
            <Button id="arrangeGrid" onClick={arrangeGrid}>
              <LayoutGrid className="h-4 w-4" />
              整理
            </Button>
            <Button id="openCodexConfig" onClick={() => setCodexOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Codex
            </Button>
            <Button id="killAll" variant="destructive" onClick={killAll}>
              <Trash2 className="h-4 w-4" />
              全部关闭
            </Button>
          </div>

          <Badge
            id="runtimeStatus"
            variant={appInfo?.ptyEnabled ? 'success' : 'outline'}
            className="runtime-status min-w-[128px] justify-center truncate font-normal"
            title={appInfo?.ptyError || appInfo?.defaultShell || ''}
          >
            {appInfo ? (appInfo.ptyEnabled ? 'ConPTY 已启用' : '管道模式') : '启动中'}
          </Badge>
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
          <div
            id="stage"
            className="stage"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
          >
            {panels.map((panel) => (
              <TerminalPanel
                key={panel.id}
                panel={panel}
                active={panel.id === activeId}
                scale={view.scale}
                theme={theme}
                onActivate={activatePanel}
                onClose={closeTerminal}
                onMove={updatePanel}
                onResize={updatePanel}
                onRestart={restartTerminal}
                onTitleChange={(id, title) => updatePanel(id, { title: title.trim() || 'cmd' })}
                registerTerminal={registerTerminal}
              />
            ))}
          </div>

          {panels.length === 0 && (
            <Card id="emptyState" className="pointer-events-none absolute left-1/2 top-1/2 w-[min(380px,calc(100%-48px))] -translate-x-1/2 -translate-y-1/2 border-border/70 bg-card/72 text-center shadow-2xl backdrop-blur">
              <CardContent className="p-5">
                <div className="flex items-center justify-center gap-2 text-xl font-bold text-foreground">
                  <SquareTerminal className="h-6 w-6 text-emerald-300" />
                  添加 CMD 开始
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      <CodexConfigDialog open={codexOpen} onOpenChange={setCodexOpen} showToast={showToast} />

      {toast && (
        <Card id="toast" className="toast">
          <CardContent className="p-0">{toast}</CardContent>
        </Card>
      )}
    </TooltipProvider>
  );
}
