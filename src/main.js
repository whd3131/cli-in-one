const { app, BrowserWindow, dialog, ipcMain, shell: electronShell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TOML = require('@iarna/toml');

let pty = null;
let ptyLoadError = null;

try {
  pty = require('node-pty');
} catch (error) {
  ptyLoadError = error;
}

const sessions = new Map();
let mainWindow = null;

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

function getCodexConfigDir() {
  return path.join(os.homedir(), '.codex');
}

function getCodexConfigPath() {
  return path.join(getCodexConfigDir(), 'config.toml');
}

function getCodexAuthPath() {
  return path.join(getCodexConfigDir(), 'auth.json');
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
    return os.homedir();
  }

  const resolved = path.resolve(cwd);
  try {
    if (fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  } catch {
    return os.homedir();
  }

  return os.homedir();
}

function sendToRenderer(webContents, channel, payload) {
  if (webContents && !webContents.isDestroyed()) {
    webContents.send(channel, payload);
  }
}

function createTerminalSession(webContents, options = {}) {
  const id = crypto.randomUUID();
  const cols = clampNumber(options.cols, 20, 500, 100);
  const rows = clampNumber(options.rows, 5, 200, 28);
  const cwd = resolveCwd(options.cwd);
  const shell = getDefaultShell();
  const args = Array.isArray(options.args) ? options.args : getDefaultShellArgs();
  const initialCommand = typeof options.initialCommand === 'string' && options.initialCommand.trim()
    ? options.initialCommand.trim()
    : '';
  const title = typeof options.title === 'string' && options.title.trim()
    ? options.title.trim()
    : `会话 ${sessions.size + 1}`;

  const meta = {
    id,
    title,
    cwd,
    shell,
    backend: pty ? 'conpty' : 'pipe',
    initialCommand,
    createdAt: Date.now()
  };

  if (pty) {
    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color'
      }
    });

    proc.onData((data) => {
      sendToRenderer(webContents, 'terminal:data', { id, data });
    });

    proc.onExit(({ exitCode, signal }) => {
      sessions.delete(id);
      sendToRenderer(webContents, 'terminal:exit', {
        id,
        exitCode,
        signal: signal || null
      });
    });

    sessions.set(id, {
      ...meta,
      process: proc
    });
  } else {
    const proc = spawn(shell, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (buffer) => {
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data: buffer.toString('utf8')
      });
    });

    proc.stderr.on('data', (buffer) => {
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data: buffer.toString('utf8')
      });
    });

    proc.on('error', (error) => {
      sendToRenderer(webContents, 'terminal:data', {
        id,
        data: `\r\n[cli-in-one] failed to start ${shell}: ${error.message}\r\n`
      });
    });

    proc.on('exit', (exitCode, signal) => {
      sessions.delete(id);
      sendToRenderer(webContents, 'terminal:exit', {
        id,
        exitCode,
        signal: signal || null
      });
    });

    sessions.set(id, {
      ...meta,
      process: proc
    });
  }

  if (initialCommand) {
    setTimeout(() => {
      const session = sessions.get(id);
      if (session) {
        writeToSessionProcess(session, `${initialCommand}\r`);
      }
    }, process.platform === 'win32' ? 450 : 300);
  }

  return meta;
}

function writeToSessionProcess(session, data) {
  if (!session || typeof data !== 'string') {
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
    session.process.kill();
  } catch {
    return false;
  } finally {
    sessions.delete(id);
  }

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

async function writeCodexFileText(kind, content) {
  const file = getCodexEditableFile(kind);
  file.validate(content);
  const configDir = getCodexConfigDir();
  const tempPath = path.join(configDir, `${file.name}.${process.pid}.${Date.now()}.tmp`);
  let backupPath = null;

  await fs.promises.mkdir(configDir, { recursive: true });

  try {
    const oldContent = await fs.promises.readFile(file.path);
    backupPath = path.join(configDir, `${file.name}.bak-${formatBackupTimestamp()}`);
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1024,
    minHeight: 680,
    title: 'CLI in One',
    backgroundColor: '#101114',
    autoHideMenuBar: true,
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

app.whenReady().then(() => {
  ipcMain.handle('app:info', () => ({
    appVersion: app.getVersion(),
    defaultShell: getDefaultShell(),
    homeDir: os.homedir(),
    ptyEnabled: Boolean(pty),
    ptyError: ptyLoadError ? ptyLoadError.message : null,
    platform: process.platform
  }));

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

  ipcMain.on('terminal:write', (_event, payload) => {
    const session = sessions.get(payload && payload.id);
    if (!session || typeof payload.data !== 'string') {
      return;
    }

    writeToSessionProcess(session, payload.data);
  });

  ipcMain.on('terminal:resize', (_event, payload) => {
    const session = sessions.get(payload && payload.id);
    if (!session || session.backend !== 'conpty') {
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
