// Settings window renderer. Reads/writes the Rust-managed settings state.

const { invoke } = window.__TAURI__.core;

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await invoke('get_settings');
  $('apiPort').value = s.apiPort ?? 8080;
  $('apiToken').value = s.apiToken ?? '';
  $('position').value = s.position ?? 'top-right';
  $('alwaysOnTop').checked = s.alwaysOnTop ?? true;
  $('opacity').value = Math.round((s.opacity ?? 0.95) * 100);
  $('opacityVal').textContent = Math.round((s.opacity ?? 0.95) * 100) + '%';
  $('pollInterval').value = s.pollInterval ?? 3000;
}

$('opacity').addEventListener('input', (e) => {
  $('opacityVal').textContent = e.target.value + '%';
});

$('btn-save').addEventListener('click', async () => {
  const settings = {
    apiPort: parseInt($('apiPort').value, 10) || 8080,
    apiToken: $('apiToken').value.trim(),
    position: $('position').value,
    alwaysOnTop: $('alwaysOnTop').checked,
    opacity: parseInt($('opacity').value, 10) / 100,
    pollInterval: parseInt($('pollInterval').value, 10) || 3000,
  };
  await invoke('save_settings', { settings });
  const msg = $('status-msg');
  msg.textContent = '✓ Saved!';
  setTimeout(() => (msg.textContent = ''), 2000);
});

$('btn-test').addEventListener('click', async () => {
  const port = parseInt($('apiPort').value, 10) || 8080;
  const token = $('apiToken').value.trim();
  const result = $('test-result');
  result.style.color = '#6b7280';
  result.textContent = 'Testing…';

  try {
    const data = await invoke('api_request', {
      method: 'GET',
      path: '/api/health',
      body: null,
      port,
      token,
    });
    if (data && data.success) {
      result.style.color = '#00e5a0';
      result.textContent = '✓ Connected to TaskNotes API';
    } else {
      result.style.color = '#ff6b6b';
      result.textContent = '✗ Unexpected response from API';
    }
  } catch (e) {
    result.style.color = '#ff6b6b';
    result.textContent = '✗ ' + String(e);
  }
});

load();
