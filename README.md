<p align="center">
  <img src="static/banner.png" alt="CLI in One banner">
</p>

# CLI in One

<p align="center">
  Run multiple Codex and shell sessions side by side on one infinite canvas.
</p>

<p align="center">
  <a href="#en">English</a> | <a href="#zh">简体中文</a>
</p>

<p align="center">
  <img src="static/sample1.png" alt="CLI in One sample workspace">
</p>

<a id="en"></a>

## English

### Overview

CLI in One is a local Electron desktop app for people who use Codex in the terminal and want a better multi-session workspace. Instead of juggling separate terminal windows, you can open multiple sessions inside a single infinite canvas, attach them to local projects, and keep different tasks visible at the same time.

A project session starts `codex` in the selected directory. A free window starts your local shell without pre-running Codex. This makes the app useful both for Codex-heavy workflows and for the supporting commands around them.

#### Why it exists

If you run several terminal-based tools at once (especially [OpenAI Codex CLI](https://github.com/openai/codex) sessions), the usual options are: many overlapping OS windows, or a full-screen terminal multiplexer where you only see one stream at a time. CLI in One is built for a **visual, spatial layout**: terminals behave like panels you can place, group, and resize on an infinite surface so you can **compare output side by side** and still pan or zoom the whole board when the canvas grows.

#### How it fits your workflow

- **Local first**: the app is a window around your own shell and `PATH`; it does not replace or host Codex in the cloud.
- **Project-aware**: per-folder sessions map cleanly to “this repo / branch / experiment” while keeping a global canvas.
- **Codex config close by**: quick toggles and direct edits to `~/.codex/auth.json` and `~/.codex/config.toml` reduce context switches out of the workspace.
- **Resilient terminal stack**: on Windows, ConPTY plus `node-pty` (with a safe fallback) keeps the experience close to a native terminal for interactive CLIs.

**Repository:** [github.com/whd3131/cli-in-one](https://github.com/whd3131/cli-in-one) · **License:** MIT

### What It Is For

- Run several Codex sessions in parallel for different repos, branches, or tasks.
- Compare outputs side by side while debugging, reviewing, or generating code.
- Keep plain CMD or shell windows next to Codex sessions for build, git, and one-off commands.
- Organize project-specific canvases so each local repo has its own workspace.
- Edit `~/.codex/auth.json` and `~/.codex/config.toml` without leaving the app.
- Export transcripts when you want a saved text record of a session.

### Key Features

- Infinite canvas with pan, zoom, drag, resize, minimize, endpoint grouping, and one-click grid arrangement.
- Project-aware session launcher. `New session` opens a chooser for Codex, Cursor, or CMD, then starts in the selected project or directory.
- Plain local shell sessions for ad-hoc work.
- xterm.js renderer with `node-pty` and Windows ConPTY when available, plus a pipe fallback if the native module is unavailable.
- Built-in Codex quick config editor for model, provider, auth, approval policy, sandbox mode, wire API, and common toggles.
- Raw file editor for `~/.codex/auth.json` and `~/.codex/config.toml`, with validation, backups, and atomic writes.
- Session transcript export to `.txt`.
- Local project shortcuts, canvas layout, theme, and language persistence.
- English and Chinese UI, plus light and dark themes.
- Latest GitHub release panel and simple system status widgets.

### Tech Stack

- Electron
- React + Vite
- Tailwind CSS
- xterm.js
- node-pty

### Requirements

- Node.js `>=22`
- npm
- `codex` available in your `PATH` if you want project sessions to auto-start Codex
- Windows users: Visual Studio Build Tools are recommended if `node-pty` needs to compile

### Quick Start

```powershell
cd cli-in-one
npm install
npm start
```

`npm start` builds the renderer into `dist/renderer` and then launches Electron.

For renderer-only development:

```powershell
npm run dev:renderer
```

### How To Use

1. Start the app and add one or more local project folders from the sidebar.
2. Click `New session` and choose Codex, Cursor, or CMD, then pick the current directory or a saved project.
3. Click `New CMD` when you want a normal shell immediately, without the session picker.
4. Arrange the workspace by dragging panel headers to move terminals, dragging the lower-right corner to resize, using the mouse wheel to pan, using `Ctrl + mouse wheel` to zoom, and clicking `Arrange` to place visible sessions into a grid.
5. Open `Settings` to switch language and theme, manage Codex quick presets, and edit `~/.codex/auth.json` or `~/.codex/config.toml`.
6. Use the session actions to restart, close, minimize, or export a transcript.

### Data, Files, and Safety

- App preferences and workspace state are stored locally in browser storage.
- Terminal output stays in memory until you export it.
- Exported transcripts go to `.history/` by default. In development that folder is under the project directory; in packaged builds it is next to the app executable.
- Saved Codex quick presets are written to `codex-quick-profiles.json` next to the app.
- `auth.json` must be valid JSON and `config.toml` must be valid TOML before the app writes them.
- Existing Codex config files are backed up as `*.bak-*` before replacement.
- Writes are done through a temp file in the same directory and then renamed atomically.
- If `node-pty` is unavailable, the app still starts in pipe mode.

### Build and Package

```powershell
npm run build
npm run smoke
npm run pack
npm run dist
npm run dist:win
npm run dist:mac
```

- `npm run smoke` checks that Electron and `node-pty` can create a terminal correctly.
- `npm run pack` creates an unpacked Electron app for local inspection.
- `npm run dist` builds release artifacts for the current platform.
- `npm run dist:win` creates Windows NSIS and portable builds in `release/`.
- `npm run dist:mac` creates macOS DMG and ZIP artifacts when run on macOS.

### Release Workflow

This repository is set up for GitHub release automation with Conventional Commits and Release Please. See [docs/RELEASE.md](docs/RELEASE.md) for the full release process and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance.

<a id="zh"></a>

## 简体中文

### 项目简介

CLI in One 是一个本地 Electron 桌面应用，面向习惯在终端里使用 Codex 的用户。它把多个会话放到同一个无限画布里，让你不用来回切换一堆终端窗口，也能同时观察不同任务、不同项目和不同输出。

在项目会话里，应用会在目标目录自动启动 `codex`。在自由窗口里，应用只启动本地 shell，不会预先执行 Codex。这样它既适合多 Codex 会话并行，也适合把构建、Git、排障命令放在旁边一起工作。

#### 设计动机

当你需要同时跑多路基于终端的工作流（尤其是 [OpenAI Codex CLI](https://github.com/openai/codex)）时，常见做法要么是堆满重叠的系统终端窗口，要么用全屏类终端多路复用器但一次只能**聚焦**一个面板。CLI in One 的定位是**空间化布局**：终端像可拖拽、可分组、可缩放的「卡片」铺在无限画布上，你可以**并排对照多路输出**，需要时再平移、缩放整幅工作区，而不是在内存里记「第几个 tab 是哪一个任务」。

#### 如何融入你的日常流程

- **本地优先**：应用只是把你本机的 shell 和 `PATH` 装进一个窗口，不在云端代跑或托管 Codex。
- **以项目为锚**：按目录/项目起会话，和「这个仓库、这条分支、这次试验」的划分天然一致。
- **配置抬手即达**：快捷项与对 `~/.codex/auth.json`、`~/.codex/config.toml` 的直编，减少反复跳出工作区去改配置。
- **终端体验扎实**：在 Windows 上优先走 ConPTY + `node-pty`（不可用时回退到 pipe 模式），尽量贴近本机交互式 CLI 的观感。

**仓库：** [github.com/whd3131/cli-in-one](https://github.com/whd3131/cli-in-one) · **许可：** MIT

### 用途

- 针对不同仓库、分支或任务，同时运行多个 Codex 会话。
- 在调试、审查、生成代码时并排比较不同会话输出。
- 在 Codex 会话旁边保留普通 CMD 或 shell 窗口，执行构建、Git 和临时命令。
- 按项目维护独立画布，让每个本地项目都有自己的工作区布局。
- 不离开应用，直接编辑 `~/.codex/auth.json` 和 `~/.codex/config.toml`。
- 在需要落盘保存时，导出终端会话文本记录。

### 核心功能

- 无限画布，支持平移、缩放、拖拽、调整大小、最小化为端点、端点分组和一键网格整理。
- 面向项目的会话启动器。点击 `新增会话` 后可选择 Codex、Cursor 或 CMD，再选择项目或目录启动。
- 普通本地 shell 会话，适合临时命令或辅助操作。
- 基于 xterm.js 渲染终端；可用时使用 `node-pty` 和 Windows ConPTY，不可用时自动回退到 pipe 模式。
- 内置 Codex 快捷配置编辑，可管理 model、provider、auth、approval policy、sandbox mode、wire API 等常用项。
- 内置原始文件编辑，可直接修改 `~/.codex/auth.json` 和 `~/.codex/config.toml`，并带校验、备份和原子写入。
- 支持将会话记录导出为 `.txt`。
- 本地保存项目快捷入口、画布布局、主题和语言偏好。
- 支持中英文界面，以及浅色和深色主题。
- 内置 GitHub 最新版本信息和基础系统状态显示。

### 技术栈

- Electron
- React + Vite
- Tailwind CSS
- xterm.js
- node-pty

### 环境要求

- Node.js `>=22`
- npm
- 如果希望项目会话自动启动 Codex，需要保证 `codex` 已在 `PATH` 中可用
- Windows 下如果 `node-pty` 编译失败，建议安装 Visual Studio Build Tools

### 快速开始

```powershell
cd cli-in-one
npm install
npm start
```

`npm start` 会先构建前端到 `dist/renderer`，然后启动 Electron。

如果只想调试前端渲染层：

```powershell
npm run dev:renderer
```

### 如何使用

1. 启动应用后，在侧边栏添加一个或多个本地项目目录。
2. 点击 `新增会话` 后选择 Codex、Cursor 或 CMD，再选择当前目录或已保存项目。
3. 点击 `新增 CMD` 可以直接新建普通 shell，而不经过会话选择器。
4. 在画布上整理终端。拖动面板标题栏可移动终端，拖动右下角可调整大小，鼠标滚轮可平移，`Ctrl + 鼠标滚轮` 可缩放，点击 `整理` 可将当前可见终端自动排成网格。
5. 打开 `设置` 可切换语言和主题，管理 Codex 快捷配置，并直接编辑 `~/.codex/auth.json` 或 `~/.codex/config.toml`。
6. 使用会话操作按钮可重启、关闭、最小化或导出会话记录。

### 数据、文件与安全性

- 应用偏好和工作区状态保存在本地浏览器存储中。
- 终端输出默认只保留在内存里，只有导出时才会写入文件。
- 会话导出默认写入 `.history/`。开发环境下位于项目目录中；打包后位于应用可执行文件旁边。
- Codex 快捷配置方案会保存到应用旁边的 `codex-quick-profiles.json`。
- 写入前会校验 `auth.json` 的 JSON 格式和 `config.toml` 的 TOML 格式。
- 覆盖 Codex 配置前，会先生成 `*.bak-*` 备份。
- 最终写入通过同目录临时文件加原子重命名完成。
- 如果 `node-pty` 不可用，应用仍可在 pipe 模式下启动。

### 构建与打包

```powershell
npm run build
npm run smoke
npm run pack
npm run dist
npm run dist:win
npm run dist:mac
```

- `npm run smoke` 用来检查 Electron 和 `node-pty` 是否能正常创建终端。
- `npm run pack` 生成未打包安装器的 Electron 目录产物，便于本地检查。
- `npm run dist` 为当前平台构建发布产物。
- `npm run dist:win` 在 `release/` 下生成 Windows NSIS 安装包和便携版。
- `npm run dist:mac` 在 macOS 上生成 DMG 和 ZIP 产物。

### 发布流程

仓库已经配置好基于 Conventional Commits 和 Release Please 的 GitHub 自动发布流程。完整说明见 [docs/RELEASE.md](docs/RELEASE.md)，贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)。
