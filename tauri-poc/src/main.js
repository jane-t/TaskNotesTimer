// Tauri PoC renderer. Privileged work goes through the Rust `api_request`
// command; window controls use the Tauri window API. Settings are kept in
// localStorage for this proof-of-concept (no settings window yet).

const { invoke } = window.__TAURI__.core;
const { getCurrentWindow } = window.__TAURI__.window;

// ── Settings ────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { apiPort: 8080, apiToken: '', pollInterval: 3000 };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('tnt-settings') || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  running: false,
  activeTaskId: null,
  activeTaskTitle: '',
  startTime: null,
  sessionElapsed: 0,
  tasks: [],
  settings: loadSettings(),
};

let timerInterval = null;
let pollTimer     = null;

// Tolerate transient poll failures before showing the disconnect banner.
let pollFailCount = 0;
const POLL_FAIL_THRESHOLD = 3;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const app        = document.getElementById('app');
const display    = document.getElementById('timer-display');
const taskName   = document.getElementById('task-name');
const taskSelect = document.getElementById('task-select');
const btnStart   = document.getElementById('btn-start');
const btnStop    = document.getElementById('btn-stop');
const statusText = document.getElementById('statusbar');
const connError  = document.getElementById('conn-error');
const mainUi     = document.getElementById('main-ui');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  try {
    const data = await invoke('api_request', {
      method,
      path,
      body: body ?? null,
      port: state.settings.apiPort ?? 8080,
      token: state.settings.apiToken ?? '',
    });
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function setConnected(ok) {
  connError.classList.toggle('visible', !ok);
  mainUi.style.display = ok ? 'flex' : 'none';
  mainUi.style.flexDirection = 'column';
}

// ── Extract active sessions from API response ─────────────────────────────────
function extractSessions(data) {
  if (!data) return [];
  if (Array.isArray(data.activeSessions)) return data.activeSessions;
  return [];
}
function sessionTaskId(s)    { return s?.task?.id    ?? null; }
function sessionTaskTitle(s) { return s?.task?.title ?? null; }
function sessionStartTime(s) { return s?.session?.startTime ? new Date(s.session.startTime).getTime() : Date.now(); }
function sessionElapsed(s)   { return (s?.session?.elapsedMinutes ?? 0) * 60; }

// ── Timer tick ────────────────────────────────────────────────────────────────
function startLocalTick() {
  stopLocalTick();
  timerInterval = setInterval(() => {
    if (!state.startTime) return;
    const elapsed = state.sessionElapsed + Math.floor((Date.now() - state.startTime) / 1000);
    display.textContent = fmtTime(elapsed);
  }, 500);
}
function stopLocalTick() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ── API polling ───────────────────────────────────────────────────────────────
async function pollActiveTimer() {
  const res = await api('GET', '/api/time/active');

  if (!res.ok) {
    if (++pollFailCount >= POLL_FAIL_THRESHOLD) setConnected(false);
    return;
  }
  pollFailCount = 0;
  setConnected(true);

  const sessions = extractSessions(res.data?.data);
  const active = state.activeTaskId
    ? sessions.find(s => sessionTaskId(s) === state.activeTaskId) ?? sessions[0] ?? null
    : sessions[0] ?? null;

  if (active) {
    const taskId = sessionTaskId(active);
    if (!state.running || state.activeTaskId !== taskId) {
      state.running = true;
      state.activeTaskId = taskId;
      state.activeTaskTitle = sessionTaskTitle(active) || taskId;
      state.startTime = sessionStartTime(active);
      state.sessionElapsed = sessionElapsed(active);
      applyRunningUI();
      startLocalTick();
    }
  } else {
    if (state.running) stopTimer(false);
  }
}

async function loadTasks() {
  const res = await api('POST', '/api/tasks/query', {
    type: "group",
    id: "root",
    conjunction: "and",
    children: [
      { type: "condition", id: "not-archived",  property: "archived",           operator: "is-not-checked" },
      { type: "condition", id: "not-completed", property: "status.isCompleted", operator: "is-not-checked" },
      { type: "condition", id: "in-progress",   property: "status",             operator: "is", value: "in-progress" }
    ],
    sortKey: "due",
    sortDirection: "asc",
    groupKey: "none"
  });

  if (!res.ok || !res.data?.data?.tasks) {
    statusText.textContent = 'Failed to load tasks';
    return;
  }

  state.tasks = res.data.data.tasks;

  const prev = taskSelect.value;
  taskSelect.innerHTML = '<option value="">— Select a task —</option>';
  state.tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id || t.path;
    opt.textContent = t.title || t.id;
    taskSelect.appendChild(opt);
  });
  if (prev) taskSelect.value = prev;

  statusText.textContent = `${state.tasks.length} tasks loaded`;
}

// ── UI updates ────────────────────────────────────────────────────────────────
function applyRunningUI() {
  app.classList.add('running');
  taskName.textContent = state.activeTaskTitle || state.activeTaskId || 'Unknown task';
  taskName.classList.remove('idle');
  btnStart.disabled = true;
  btnStop.disabled = false;
  statusText.textContent = 'Timer running…';
}

function applyIdleUI() {
  app.classList.remove('running');
  taskName.textContent = 'No active timer';
  taskName.classList.add('idle');
  display.textContent = '00:00:00';
  btnStart.disabled = false;
  btnStop.disabled = true;
  statusText.textContent = 'Idle';
}

// ── Controls ──────────────────────────────────────────────────────────────────
async function startTimer() {
  const taskId = taskSelect.value;
  if (!taskId) { statusText.textContent = 'Select a task first'; return; }

  statusText.textContent = 'Starting…';
  btnStart.disabled = true;

  const activeRes = await api('GET', '/api/time/active');
  const sessions = extractSessions(activeRes?.data?.data);
  for (const session of sessions) {
    const id = sessionTaskId(session);
    if (id) await api('POST', `/api/tasks/${encodeURIComponent(id)}/time/stop`);
  }

  const res = await api('POST', `/api/tasks/${encodeURIComponent(taskId)}/time/start`);
  if (!res.ok || !res.data?.success) {
    const errMsg = res.data?.error || res.error || '?';
    statusText.textContent = 'Failed: ' + errMsg;
    btnStart.disabled = false;
    return;
  }

  const task = state.tasks.find(t => (t.id || t.path) === taskId);
  state.running = true;
  state.activeTaskId = taskId;
  state.activeTaskTitle = task?.title || taskId;
  state.startTime = Date.now();
  state.sessionElapsed = 0;

  applyRunningUI();
  startLocalTick();
}

async function stopTimer(sendApi = true) {
  stopLocalTick();

  if (sendApi && state.activeTaskId) {
    statusText.textContent = 'Stopping…';
    await api('POST', `/api/tasks/${encodeURIComponent(state.activeTaskId)}/time/stop`);
  }

  state.running = false;
  state.activeTaskId = null;
  state.startTime = null;
  state.sessionElapsed = 0;
  applyIdleUI();
}

// ── Event listeners ───────────────────────────────────────────────────────────
btnStart.addEventListener('click', startTimer);
btnStop.addEventListener('click', () => stopTimer(true));

document.getElementById('btn-settings').addEventListener('click', () => {
  // PoC: no settings window yet. Prompt for port so connection can be tested.
  const port = window.prompt('TaskNotes API port', String(state.settings.apiPort));
  if (port) {
    state.settings.apiPort = parseInt(port, 10) || 8080;
    localStorage.setItem('tnt-settings', JSON.stringify(state.settings));
  }
});

document.getElementById('btn-close').addEventListener('click', () => {
  getCurrentWindow().close();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  await loadTasks();
  await pollActiveTimer();
  pollTimer = setInterval(pollActiveTimer, state.settings.pollInterval || 3000);
  setInterval(loadTasks, 30000);
}

init();
