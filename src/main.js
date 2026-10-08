// Timer window renderer. Privileged work goes through Rust commands; settings
// live in the Rust-managed state (shared with the settings window).

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  running: false,
  activeTaskId: null,
  activeTaskTitle: '',
  startTime: null,
  sessionElapsed: 0,
  tasks: [],
  settings: { apiPort: 8080, apiToken: '', opacity: 0.95, pollInterval: 3000 },
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
const connHint   = document.getElementById('conn-error-hint');
const mainUi     = document.getElementById('main-ui');

// ── Helpers ───────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  try {
    const data = await invoke('api_request', { method, path, body: body ?? null });
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

const CONN_HINT_DEFAULT = connHint.textContent;
const CONN_HINT_AUTH    = 'API token missing or wrong — copy it from TaskNotes → Integrations → HTTP API into ⚙ Settings';

function setConnected(ok, error = '') {
  connHint.textContent = /HTTP 401/.test(error) ? CONN_HINT_AUTH : CONN_HINT_DEFAULT;
  connError.classList.toggle('visible', !ok);
  mainUi.style.display = ok ? 'flex' : 'none';
  mainUi.style.flexDirection = 'column';
}

function applyOpacity() {
  app.style.opacity = String(state.settings.opacity ?? 0.95);
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
    // Auth failures aren't transient — report them straight away.
    if (++pollFailCount >= POLL_FAIL_THRESHOLD || /HTTP 401/.test(res.error)) {
      setConnected(false, res.error);
    }
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

function restartPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(pollActiveTimer, state.settings.pollInterval || 3000);
}

// ── Event listeners ───────────────────────────────────────────────────────────
btnStart.addEventListener('click', startTimer);
btnStop.addEventListener('click', () => stopTimer(true));
document.getElementById('btn-settings').addEventListener('click', () => invoke('open_settings'));
document.getElementById('btn-close').addEventListener('click', () => invoke('quit_app'));

listen('settings-updated', (event) => {
  state.settings = event.payload;
  applyOpacity();
  restartPolling();
  // Port/token may have changed — refresh now rather than waiting 30s.
  loadTasks();
  pollActiveTimer();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function init() {
  state.settings = await invoke('get_settings');
  applyOpacity();

  await loadTasks();
  await pollActiveTimer();

  restartPolling();
  setInterval(loadTasks, 30000);
}

init();
