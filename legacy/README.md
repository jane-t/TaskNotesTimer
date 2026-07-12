# TaskNotes Timer — Desktop Overlay

A highly-visible desktop timer overlay for the **Obsidian TaskNotes** plugin.
Sits on top of all your windows, shows a live elapsed timer, and controls TaskNotes time tracking via its HTTP API.

---

## What it looks like

- Dark floating widget (227×200px) that stays above all windows
- Large green monospace clock that counts up while timing
- Pulsing dot + green glow when a timer is running
- Drop-down to pick any open/in-progress task
- START / STOP controls
- Syncs with TaskNotes — if you start/stop inside Obsidian the overlay updates automatically
- Single instance only — launching again focuses the existing widget
- The **✕** button quits the app

---

## Prerequisites

1. **Obsidian** with the **TaskNotes** plugin installed
2. Enable the TaskNotes HTTP API:
   - Obsidian → Settings → TaskNotes → Integrations → HTTP API → **Enable**
   - Note the port (default: **8080**)
3. **Node.js** (v18+) — https://nodejs.org

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run the app
npm start
```

The overlay appears in the top-right corner of your primary screen.

---

## Building a standalone app

### macOS (.dmg)
```bash
npm run build:mac
# Output: dist/TaskNotes Timer.dmg
```

### Windows (.exe installer + portable)
```bash
npm run build:win
# Output: dist/TaskNotes Timer Setup.exe  AND  dist/TaskNotes Timer.exe
```

### Both platforms
```bash
npm run build
```

---

## Settings

Click the **⚙** button on the overlay to open Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| API Port | 8080 | Must match TaskNotes HTTP API port |
| API Token | (blank) | Only needed if you set one in TaskNotes |
| Screen Position | Top Right | Where the overlay appears |
| Always on Top | On | Float above all other windows |
| Opacity | 95% | How transparent the window is |
| Poll Interval | 3000ms | How often to check for external timer changes |

Use **Test Connection** to verify the API is reachable before saving.

---

## How it works

- The overlay polls `GET /api/time/active` every few seconds to detect timers started inside Obsidian
- START calls `POST /api/tasks/:id/time/start`
- STOP calls `POST /api/tasks/:id/time/stop`
- The task list is loaded from `POST /api/tasks/query` (open + in-progress tasks)

Because it uses TaskNotes' own API, all session data is written directly to your vault's YAML frontmatter — exactly the same as using TaskNotes itself.

---

## Troubleshooting

**"Cannot connect to TaskNotes API"**
- Make sure Obsidian is running
- Make sure TaskNotes HTTP API is enabled (Settings → TaskNotes → Integrations)
- Check the port matches (default 8080)
- Check no firewall is blocking localhost connections

**Timer shows 00:00:00 even though it's running**
- Click ⚙ → Test Connection to verify the API responds
- The overlay polls every 3 seconds; wait a moment after starting from Obsidian

**On macOS: "app can't be opened because it's from an unidentified developer"**
- Right-click the app → Open → Open anyway
- Or: `xattr -cr "/Applications/TaskNotes Timer.app"`

---

## Tech stack

- [Electron](https://electronjs.org) — cross-platform desktop shell
- Pure HTML/CSS/JS — no frontend framework needed
- TaskNotes HTTP API — all task data stays in your vault
