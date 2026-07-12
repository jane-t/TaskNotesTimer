# TaskNotes Timer — Version History

A desktop timer overlay for the Obsidian **TaskNotes** plugin. It floats above all
windows, shows a live elapsed timer, and drives TaskNotes time tracking through its
local HTTP API.

| Version | Date | Platform | Headline |
|---------|------|----------|----------|
| [2.0.0](#v200--lightweight-tauri-rebuild) | 2026-07-12 | Tauri | Rebuilt on Tauri — ~97% smaller installers |
| [1.0.4](#v104--connection-stability-on-slower-machines) | 2026-07-11 | Electron | Tolerate transient connection blips |
| [1.0.3](#v103--ipv4-connection-fix) | 2026-07-11 | Electron | Fix `localhost`/IPv6 connection failure |
| [1.0.2](#v102--security-hardening) | 2026-06-14 | Electron | Electron security hardening + cleanup |
| [1.0.1](#v101--early-electron) | 2026-05-28 | Electron | Early Electron build (tag only) |
| [1.0.0](#v100--initial-release) | 2026-05-28 | Electron | Initial release (tag only) |

> Installers are published on the [GitHub Releases page](https://github.com/jane-t/TaskNotesTimer/releases)
> from **v1.0.2** onward. Both macOS (`.dmg`) and Windows (`.exe`) builds are unsigned.

---

## v2.0.0 — Lightweight Tauri rebuild
**2026-07-12 · [Release](https://github.com/jane-t/TaskNotesTimer/releases/tag/v2.0.0)**

Major release. The app was rebuilt on **[Tauri](https://tauri.app)**, which uses the
operating system's native webview instead of bundling a full Chromium + Node runtime.

- **~97% smaller installers**: **3.4 MB** (macOS) / **2.3 MB** (Windows), down from ~100 MB.
- Same overlay UI and workflow, with feature parity plus polish:
  - Settings window (port, token, position, opacity, always-on-top, poll interval) with
    Test Connection, backed by Rust-managed settings persisted to disk.
  - System-tray menu (Show/Hide, Settings, Quit) and a single-instance lock.
  - Self-hosted JetBrains Mono + Inter fonts — no network calls beyond the local API; strict CSP.
  - IPv4-pinned API connection and transient-failure tolerance carried over from v1.
- **Repo restructure**: Tauri app promoted to the root (`src/` frontend, `src-tauri/` Rust);
  the original Electron implementation preserved under `legacy/` as a fallback.
- CI reworked to build macOS + Windows via Tauri on a version tag or manual dispatch.

**Architecture**: plain HTML/CSS/JS frontend over a small Rust core (window management, tray,
single-instance, settings persistence, and the `api_request` HTTP proxy).

---

## v1.0.4 — Connection stability on slower machines
**2026-07-11 · [Release](https://github.com/jane-t/TaskNotesTimer/releases/tag/v1.0.4)** · Electron

Fixed the "Cannot connect" banner flashing and self-recovering on slower machines, even
with Obsidian running.

- Require **3 consecutive** failed polls before showing the disconnect banner; recover on
  the first success, keeping the last-good UI visible during brief hiccups.
- Raised the per-request timeout **3 s → 8 s**, comfortably above the poll interval, so a
  single slow response is not counted as a failure.

---

## v1.0.3 — IPv4 connection fix
**2026-07-11 · [Release](https://github.com/jane-t/TaskNotesTimer/releases/tag/v1.0.3)** · Electron

Fixed the widget failing to connect while `127.0.0.1` worked fine in a browser.

- Connect to TaskNotes over **`127.0.0.1`** instead of `localhost`. On macOS `localhost`
  can resolve to IPv6 `::1` first; since the TaskNotes API binds only to IPv4, the request
  could hit nothing — or an unrelated process squatting on `::1`. The hostname is now
  pinned to IPv4.

---

## v1.0.2 — Security hardening
**2026-06-14 · [Release](https://github.com/jane-t/TaskNotesTimer/releases/tag/v1.0.2)** · Electron

A batch of security and maintenance work:

- **Context isolation**: disabled `nodeIntegration`, enabled `contextIsolation`, and routed
  all privileged calls through a minimal `contextBridge` preload (`window.electronAPI`).
- Added a **Content-Security-Policy** to both renderer pages.
- Extracted inline CSS into separate stylesheet files.
- Resized the widget to 227×200, added a single-instance lock and quit-on-close, and
  filtered the task query to in-progress tasks.
- Repo hygiene: stopped tracking `.DS_Store`, committed the lockfile.

---

## v1.0.1 — Early Electron
**2026-05-28** · Electron · _tag only, no published installer_

Early iteration of the Electron app (packaging tweaks).

---

## v1.0.0 — Initial release
**2026-05-28** · Electron · _tag only, no published installer_

First version: an Electron overlay widget that polls `GET /api/time/active`, lists
open/in-progress tasks via `POST /api/tasks/query`, and starts/stops timers through the
TaskNotes HTTP API — writing all session data straight to the vault's YAML frontmatter.

---

## Notes

- **Platforms**: v2.0.0 macOS builds are Apple Silicon (`aarch64`); Windows builds are x64
  and require the Edge WebView2 runtime (preinstalled on Windows 10/11).
- **Signing**: all builds are currently unsigned. macOS: right-click → Open on first launch
  (or `xattr -cr`). Windows: SmartScreen → More info → Run anyway.
- **Legacy**: the Electron app (v1.x) remains under `legacy/` and its releases stay available.
