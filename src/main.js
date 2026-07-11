const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
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
  const winWidth = 227;
  const winHeight = 200;
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
    width: 227,
    height: 200,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: appSettings.alwaysOnTop,
    skipTaskbar: true,
    resizable: false,
    focusable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setOpacity(appSettings.opacity);
  mainWindow.loadFile(path.join(__dirname, 'timer.html'));
  // Add this line:
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
  // Allow dragging
  mainWindow.setIgnoreMouseEvents(false);
}

function openSettings() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 500,
    title: 'TaskNotes Timer — Settings',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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
      // Pin to IPv4 explicitly. Using 'localhost' can resolve to IPv6 ::1
      // first, which the TaskNotes API (bound to 127.0.0.1) does not answer —
      // and worse, another process on ::1 could intercept the request.
      hostname: '127.0.0.1',
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
    // Generous timeout, comfortably above the poll interval, so a single slow
    // response on a busy/slow machine isn't counted as a connection failure.
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
});

ipcMain.handle('quit-app', () => app.quit());
ipcMain.handle('hide-window', () => app.quit());

// ─── App lifecycle ────────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadSettings();
    createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
