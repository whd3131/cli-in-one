# CLI in One

Electron app for watching multiple Codex-powered terminal sessions inside one infinite-canvas workspace.

The renderer is built with React, Vite, Tailwind CSS, and shadcn/ui-style local components.

## Run

```powershell
cd C:\Users\Dorian\project\cli-in-one
npm install
npm start
```

`npm start` builds the React renderer into `dist/renderer` and then starts Electron.

For renderer-only development:

```powershell
npm run dev:renderer
```

## Build

```powershell
npm run build
npm run pack
npm run dist:win
npm run dist:mac
```

`npm run pack` creates an unpacked Electron app for local inspection. `npm run dist:win` creates Windows release artifacts in `release/`. `npm run dist:mac` creates macOS artifacts when run on macOS.

## What it does

- Creates independent terminal sessions and pre-fills `codex` for new sessions.
- Renders each session with xterm.js.
- Uses `node-pty`/Windows ConPTY when available, with a pipe fallback if the native module cannot load.
- Lets you pan and zoom the canvas, drag terminals around, resize panels, arrange them into a grid, and close or restart sessions.
- Lets you manage local projects as working-directory shortcuts. Projects are stored locally in browser storage; conversation history files are not written.
- Lets you freely edit `~/.codex/auth.json` and `~/.codex/config.toml` from inside the app, with JSON/TOML validation, timestamped backups, and atomic writes.

## Controls

- `新增会话`: create one terminal session.
- `2x2`: create four terminals at once.
- `整理`: arrange open terminals into a grid around the current viewport center.
- `Ctrl + mouse wheel`: zoom the canvas.
- Mouse wheel: pan the canvas.
- Drag the panel header: move a terminal.
- Drag the lower-right corner: resize a terminal.
- `设置`: switch language/theme and open the `~/.codex/auth.json` / `~/.codex/config.toml` editor.

## Notes

`node-pty` is a native dependency. If `npm install` cannot build it, the app still starts in pipe mode, but full terminal behavior is better after installing the Visual Studio Build Tools workload for native Node modules.

The Codex config editor follows the safer part of CC Switch's design: empty TOML is allowed for `config.toml`, invalid JSON/TOML is rejected before writing, the existing file is backed up as `*.bak-*`, and the final save replaces the file through a temporary file in the same directory.

## Release Automation

This repository is ready for GitHub open-source publishing:

- `CI` runs on pull requests and pushes to `main`.
- `Release` uses Release Please to create version/changelog pull requests from Conventional Commits.
- Merging the Release Please pull request creates a GitHub Release and uploads Windows installer artifacts.
- The same release workflow also builds macOS DMG/ZIP artifacts on `macos-latest`.
- `Release Artifacts` can rebuild and upload files for an existing tag.
- Dependabot checks npm and GitHub Actions dependencies weekly.

Version bumps are controlled by commit messages:

- `fix: ...` -> patch release.
- `feat: ...` -> minor release.
- `feat!: ...` or `BREAKING CHANGE: ...` -> major release.

See `docs/RELEASE.md` for the full release process.
