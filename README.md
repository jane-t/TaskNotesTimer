# TaskNotes Timer — Desktop Overlay (v2)

A lightweight, highly-visible desktop timer overlay for the **Obsidian TaskNotes** plugin.
Sits on top of all your windows, shows a live elapsed timer, and controls TaskNotes time
tracking via its HTTP API.

**v2 is built with [Tauri](https://tauri.app)** — it uses the operating system's native
webview instead of bundling a browser engine, so the installers are ~3 MB instead of
~100 MB. The previous Electron implementation is preserved under [`legacy/`](legacy/).

<img width="242" height="220" alt="image" src="https://github.com/user-attachments/assets/6dce9e66-409e-48e1-8540-fd42edf0daee" />

---

## What it looks like

- Dark floating widget (227×200px) that stays above all windows
- Large green monospace clock that counts up while timing
- Pulsing dot + green glow when a timer is running
- Drop-down to pick any open/in-progress task
- START / STOP controls
- Syncs with TaskNotes — if you start/stop inside Obsidian the overlay updates automatically
- System-tray menu (Show/Hide, Settings, Quit) and a single-instance lock
- Self-hosted fonts — no network calls beyond the local TaskNotes API

---

## Prerequisites

1. **Obsidian** with the **TaskNotes** plugin installed
2. Enable the TaskNotes HTTP API: Obsidian → Settings → TaskNotes → Integrations → HTTP API → **Enable** (default port **8080**)
3. For development: **Node.js** (v18+) and the **Rust** toolchain (https://rustup.rs)

---

## Develop / build

```bash
npm install          # install the Tauri CLI
npm run dev          # run in development with hot reload
npm run build        # produce a release bundle for the current platform
```

Build output lands in `src-tauri/target/release/bundle/` (`.dmg` on macOS, `.exe` NSIS
installer on Windows).

CI (`.github/workflows/build.yml`) builds macOS + Windows on a version tag (`v*`) or a
manual dispatch, and uploads the installers as artifacts.

---

## Settings

Click the **⚙** button (or the tray → Settings) to open Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| API Port | 8080 | Must match TaskNotes HTTP API port |
| API Token | (blank) | Required by current TaskNotes — copy it from TaskNotes → Integrations → HTTP API |
| Screen Position | Top Right | Where the overlay appears |
| Always on Top | On | Float above all other windows |
| Opacity | 95% | How transparent the widget is |
| Poll Interval | 3000ms | How often to check for external timer changes |

Use **Test Connection** to verify the API is reachable before saving.

---

## How it works

- The overlay polls `GET /api/time/active` to detect timers started inside Obsidian
- START calls `POST /api/tasks/:id/time/start`; STOP calls `POST /api/tasks/:id/time/stop`
- The task list comes from `POST /api/tasks/query` (open + in-progress tasks)
- All HTTP goes through the Rust core, pinned to IPv4 `127.0.0.1` to avoid `localhost`
  resolving to IPv6 `::1`

Because it uses TaskNotes' own API, all session data is written directly to your vault's
YAML frontmatter — exactly the same as using TaskNotes itself.

---

## Architecture

- **`src/`** — frontend (plain HTML/CSS/JS): `index.html` (timer), `settings.html`, and
  their scripts/styles; self-hosted fonts under `src/fonts/`
- **`src-tauri/`** — Rust core: window management, tray, single-instance, settings
  persistence, and the `api_request` HTTP proxy
- **`legacy/`** — the original Electron app, kept as a fallback

---

## Troubleshooting

**"Cannot connect to TaskNotes API"** — make sure Obsidian is running, the HTTP API is
enabled, and the port matches (default 8080).

**macOS "app can't be opened because it's from an unidentified developer"** — right-click
the app → Open → Open, or run `xattr -cr "/Applications/TaskNotes Timer.app"`.

**Windows SmartScreen "Windows protected your PC"** — the installer is unsigned; click
**More info → Run anyway**. Requires the Edge WebView2 runtime (preinstalled on Win 10/11).
