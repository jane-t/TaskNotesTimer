const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');

let mainWindow = null;
let tray = null;
let settingsWindow = null;

// Default settings
let appSettings = {
  apiPort: 8080,
  apiToken: '',
  alwaysOnTop: true,
  opacity: 0.95,
  position: 'top-right',
  showTaskList: true,
  pollInterval: 3000,
};

function loadSettings() {
  try {
    const fs = require('fs');
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      appSettings = { ...appSettings, ...saved };
    }
  } catch (e) {}
}

function saveSettings(settings) {
  try {
    const fs = require('fs');
    appSettings = { ...appSettings, ...settings };
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2));
  } catch (e) {}
}

function getWindowPosition() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const winWidth = 340;
  const winHeight = 180;
  const margin = 16;

  const positions = {
    'top-right':    { x: width - winWidth - margin,  y: margin },
    'top-left':     { x: margin,                      y: margin },
    'bottom-right': { x: width - winWidth - margin,  y: height - winHeight - margin },
    'bottom-left':  { x: margin,                      y: height - winHeight - margin },
    'top-center':   { x: Math.round((width - winWidth) / 2), y: margin },
  };
  return positions[appSettings.position] || positions['top-right'];
}

function createMainWindow() {
  const pos = getWindowPosition();

  mainWindow = new BrowserWindow({
    width: 340,
    height: 260,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: appSettings.alwaysOnTop,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.setOpacity(appSettings.opacity);
  mainWindow.loadFile(path.join(__dirname, 'timer.html'));
  // Add this line:
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
  // Allow dragging
  mainWindow.setIgnoreMouseEvents(false);
}

function createTray() {
  // Create a simple tray icon programmatically
  const { nativeImage } = require('electron');
  const icon = nativeImage.createEmpty();
  // Use a fallback empty icon — will show as generic on some platforms
  tray = new Tray(icon);
  tray.setToolTip('TaskNotes Timer');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide Timer', click: () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    }},
    { label: 'Settings', click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 500,
    title: 'TaskNotes Timer — Settings',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ─── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-settings', () => appSettings);

ipcMain.handle('save-settings', (_, settings) => {
  saveSettings(settings);
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(appSettings.alwaysOnTop);
    mainWindow.setOpacity(appSettings.opacity);
    const pos = getWindowPosition();
    mainWindow.setPosition(pos.x, pos.y);
    mainWindow.webContents.send('settings-updated', appSettings);
  }
  return appSettings;
});

ipcMain.handle('open-settings', () => openSettings());

ipcMain.handle('api-request', async (_, { method, path: apiPath, body }) => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: appSettings.apiPort,
      path: apiPath,
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(appSettings.apiToken ? { 'Authorization': `Bearer ${appSettings.apiToken}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(data) }); }
        catch (e) { resolve({ ok: false, error: 'Invalid JSON' }); }
      });
    });

    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
});

ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('hide-window', () => mainWindow?.hide());

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  loadSettings();
  createMainWindow();
  // createTray(); // Tray needs a real icon file; skip for now
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
