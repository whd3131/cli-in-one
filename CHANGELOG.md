# Changelog

## [1.2.1](https://github.com/whd3131/cli-in-one/compare/v1.2.0...v1.2.1) (2026-04-28)

This patch release tightens project-scoped workspace behavior. It keeps saved project focus, per-project canvas defaults, and terminal launch context aligned so project sessions no longer drift back into shared or directory-only state after reloads or new launches.


### Improvements

* move the canvas mode toggle into the Codex preferences dialog so the workspace behavior setting lives with the rest of the persistent app controls instead of occupying sidebar space
* keep workspace command-line launches aligned with the active project root when the requested working directory is still inside that project, so project-aware launch commands continue to use the correct target type and working directory


### Bug Fixes

* restore per-project canvas mode as the default for newly created workspaces, while only preserving shared-canvas behavior for workspaces that explicitly switched to it before saving
* preserve the saved `activeProjectId` when workspace state is reloaded, which keeps project-specific canvas state and project-scoped launches from silently falling back to the no-project view
* stop free-session and workspace command launches from drifting into plain directory mode when their effective working directory should remain attached to the active project


## [1.2.0](https://github.com/whd3131/cli-in-one/compare/v1.1.0...v1.2.0) (2026-04-28)


### Features

* add tolerant Claude Code `settings.json` parsing so the quick-profile reader can load JSON5-style files that contain comments, trailing commas, BOM markers, single-quoted strings, or unquoted property names
* add safer terminal shell resolution on macOS and Linux by validating the `SHELL` environment variable first, then falling back through known-good shells instead of assuming the configured path exists
* add a pipe-mode fallback when `node-pty` fails to spawn a terminal, and surface the fallback reason directly inside the affected terminal session so startup failures stay debuggable


### Improvements

* cap in-memory terminal transcript buffers at 2 MiB while keeping total transcript byte accounting, then include an explicit truncation note when exporting or reviewing sessions whose earliest output was trimmed
* reduce renderer-wide timer churn by moving runtime and system-stat refresh work closer to the components that need it, and by scheduling panel idle-state refreshes around real transition times instead of forcing a full app tick every second
* defer workspace skill scans, image-generation history hydration, and Quick Send prompt loading until the related UI is actually visible, and show an explicit skill-scan loading state while the workspace probe is running
* refresh GitHub latest-version status again when the release popover is opened so the visible update state can bypass the short-lived cache and reflect the newest release more reliably
* refine free-session launch path behavior so dialogs, sidebar focus actions, agent launches, and batch session creation reuse the effective current workspace path without unnecessarily promoting the default home directory into active workspace state
* slim packaged releases by limiting bundled static assets to the files the app actually opens and excluding unneeded `node-pty` sources, scripts, headers, and non-target prebuilds from the Electron package
* move renderer-only libraries such as React, xterm, Base UI, and styling helpers into `devDependencies`, keeping runtime dependencies focused on what the packaged main process actually needs


### Bug Fixes

* fix `claude-config:read-profile` failures on machines whose local Claude configuration is valid for Claude Code but not strict JSON
* make the Electron smoke test resilient when the host shell path is missing, stale, or non-executable, which avoids false-negative release verification failures on some macOS and Linux runners
* prevent session creation from hard-failing when `node-pty` initialization breaks for a given shell, allowing the app to continue with the pipe backend instead of aborting the launch flow
* keep session review summaries, idle-session reuse checks, and runtime badges based on fresh timestamps captured at action time rather than stale global timer state


### Internal

* add shared JSON object parsing helpers with optional JSON5 support, plus transcript-trimming utilities and shell-resolution helpers used by both the app runtime and smoke-test verification

## [1.1.0](https://github.com/whd3131/cli-in-one/compare/v1.0.0...v1.1.0) (2026-04-28)


### Features

* add a free-session launch flow that starts new terminals from the current working directory instead of binding them to the active project, and reuse that directory when launching agent tasks or restarting sessions
* add a current-session list in the sidebar with provider badges, runtime status, command-target highlighting, and one-click focus that restores minimized sessions and recenters the canvas
* add GitHub latest-version checks in the release panel with semantic version comparison, cached lookups, status badges, and a direct link to the newest published release
* add image generation output-quality controls for default, 2K, and 4K requests, then persist the selected upscale value through the Electron image API bridge
* add grouped local image history with prompt titles, timestamps, thumbnails, file actions, and reuse-as-reference shortcuts so recent generations stay accessible outside the canvas
* add persisted image task diagnostics including task IDs, poll history, sanitized success payloads, and failure payload capture for debugging remote generation jobs
* add drag-to-connect canvas wiring with a live preview path so users can create panel connections in a single pointer gesture


### Improvements

* move saved Quick Send prompts into a compact selector in the dock header, keep prompt deletion nearby, and rebalance the footer toolbar so target switching stays usable in tighter widths
* update the top bar workspace title and path to reflect the active session or current directory, which makes the free-session workflow clearer even when no project is selected
* keep image task records in the local history while limiting the canvas to pending and failed task cards, and only auto-arrange result cards that have not been manually repositioned
* redesign the sidebar session cards, version badges, command dock footer, image history panels, and connection preview styling for denser scanning and better small-screen behavior
* replace the Radix-based UI primitives with Base UI equivalents for buttons, dialogs, tooltips, tabs, selects, radios, inputs, and separators to simplify custom rendering and styling consistency


### Bug Fixes

* restore accurate xterm mouse coordinates, selection, mouse reporting, and scroll behavior when the workspace canvas is zoomed or scaled
* prevent connection-port clicks from firing after a drag gesture and clear preview state when connection mode is canceled or exits
* surface image API dispatch failures immediately, preserve failure payloads even before a remote task ID exists, and truncate oversized payload data before saving it to local state
* keep session focus, command targeting, and current-directory state aligned when opening sessions from the sidebar, restoring minimized sessions, or relaunching an existing panel


### Internal

* add shared helpers for Base UI render props and image API payload sanitization, plus release-version comparison utilities for GitHub latest-release checks

## [1.0.0](https://github.com/whd3131/cli-in-one/compare/v0.9.0...v1.0.0) (2026-04-28)


### Features

* add persistent app-wide zoom controls with slider, preset buttons, reset action, startup restore, and Electron-side zoom clamping
* add visual canvas connections between sessions and endpoint groups, including connection mode, colored dashed paths, selection, deletion, duplicate-toggle behavior, and per-canvas persistence
* add right-click canvas actions for creating Codex, Claude, CMD, Copilot, Droid, and other configured CLI sessions directly at the clicked location
* add an idle CMD collection action that gathers idle sessions into a dedicated endpoint group with arranged placement and animation
* add configurable session CMD header visibility so tag, model, context, status, and runtime fields can stay visible or move into a compact info menu


### Improvements

* redesign terminal panel headers for a denser CMD-focused layout with clearer action grouping and a session info overflow menu
* move the Quick Send target selector into the dock footer to keep the command composer focused while preserving searchable target selection
* refine the light theme, topbar, canvas grid, panel shadows, endpoint groups, and command dock surfaces for a cleaner workspace
* expand the canvas context menu with provider-specific session actions, labeled groups, separators, and scroll-safe sizing near viewport edges
* make connection ports available on full panels and endpoint rows, with Escape handling for canceling connection mode
* preserve app zoom and session header display preferences alongside the existing workspace UI settings


### Bug Fixes

* remove stale canvas connections when sessions are closed or all sessions are killed
* avoid duplicate canvas connection records between the same pair of sessions
* keep connection records normalized when loading older workspace data

## [0.9.0](https://github.com/whd3131/cli-in-one/compare/v0.8.0...v0.9.0) (2026-04-27)


### Features

* add project-local `.cli-in-one/skills` discovery and auto-create the skills folder when needed
* apply saved shell command presets when launching shell sessions from the canvas, projects, directories, and grid launch flows


### Improvements

* save Quick Send prompts with derived names instead of interrupting the flow with a name prompt
* keep the Quick Send target picker usable near screen edges by opening above or below the dock based on available space
* label the Quick Send prompt bar so saved prompts are easier to identify

## [0.8.0](https://github.com/whd3131/cli-in-one/compare/v0.7.0...v0.8.0) (2026-04-27)


### Features

* add Copilot and Droid CLI providers with bundled icons
* add saved CMD startup command presets
* add draggable Quick Send placement, send history, target search, shortcut settings, and dispatch modes
* add canvas Todo lists, canvas context menu actions, session tags, and tag-based arrangement
* add image generation reference images and persisted generation history
* move session review into a modal opened from Quick Send


### Bug Fixes

* tighten workspace tree limits and skipped-directory handling
* keep terminal metadata in sync after renames and model changes

## [0.7.0](https://github.com/whd3131/cli-in-one/compare/v0.6.0...v0.7.0) (2026-04-26)


### Features

* add saved Agents with reusable instructions, avatars, and default CLI selection
* add Claude Code provider support and editable Claude settings
* add quick prompt saving, task dispatch, and workspace file mentions to Quick Send
* add image generation canvas with local result management and helper tool frames
* add session review and workspace tree sidebars


### Bug Fixes

* move image helper tool embeds into a browser-opened local HTML page


### Documentation

* update README for Agents, Claude Code, Quick Send prompts, and local storage paths

## [0.6.0](https://github.com/whd3131/cli-in-one/compare/v0.5.0...v0.6.0) (2026-04-26)


### Features

* add draggable canvas annotation frames for workflow notes
* add project pinning and drag reordering in the sidebar
* add collapsible quick send behavior and memory warning states in runtime stats
* replace release lookups with a local-only version and safety panel


### Documentation

* expand README for local-only behavior, annotation frames, and sidebar project controls

## [0.5.0](https://github.com/whd3131/cli-in-one/compare/v0.4.0...v0.5.0) (2026-04-26)


### Features

* add multi-provider workspace sessions and command dock
* add workspace tree, skill discovery, and image attachment support
* add README sample workspace image

## [0.4.0](https://github.com/whd3131/cli-in-one/compare/v0.3.0...v0.4.0) (2026-04-26)


### Features

* expand terminal workspace controls ([58a7a60](https://github.com/whd3131/cli-in-one/commit/58a7a60636e79effa8cc50394e49e56aad729224))

## [0.3.0](https://github.com/whd3131/cli-in-one/compare/v0.2.0...v0.3.0) (2026-04-26)


### Features

* add project sidebar and mac packaging ([fed91de](https://github.com/whd3131/cli-in-one/commit/fed91de7b83e62d3b8aaa4f5b10c91478cfc82e5))
* use project-only canvas workspaces ([d17905a](https://github.com/whd3131/cli-in-one/commit/d17905aabb010064f1ea368e62b45beb46d962f0))


### Bug Fixes

* refine workspace session controls ([9d67534](https://github.com/whd3131/cli-in-one/commit/9d67534293be1d4d50f3925ac2a3470c293ba0ad))

## [0.2.0](https://github.com/whd3131/cli-in-one/compare/v0.1.0...v0.2.0) (2026-04-26)


### Features

* initial cli-in-one app ([c18e21f](https://github.com/whd3131/cli-in-one/commit/c18e21fed540c0682246750dd385a48476a9bc19))
