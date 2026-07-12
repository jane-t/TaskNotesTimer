use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewWindow};

// ── Settings ────────────────────────────────────────────────────────────────
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    api_port: u16,
    api_token: String,
    always_on_top: bool,
    opacity: f64,
    position: String,
    poll_interval: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            api_port: 8080,
            api_token: String::new(),
            always_on_top: true,
            opacity: 0.95,
            position: "top-right".into(),
            poll_interval: 3000,
        }
    }
}

struct SettingsState(Mutex<AppSettings>);

fn settings_path(app: &AppHandle) -> std::path::PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}

fn load_settings_from_disk(app: &AppHandle) -> AppSettings {
    let path = settings_path(app);
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<AppSettings>(&text) {
            return parsed;
        }
    }
    AppSettings::default()
}

fn persist_settings(app: &AppHandle, settings: &AppSettings) {
    if let Ok(text) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(settings_path(app), text);
    }
}

// ── Commands ────────────────────────────────────────────────────────────────
#[tauri::command]
fn get_settings(state: State<'_, SettingsState>) -> AppSettings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, SettingsState>,
    settings: AppSettings,
) -> AppSettings {
    {
        let mut guard = state.0.lock().unwrap();
        *guard = settings.clone();
    }
    persist_settings(&app, &settings);

    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_always_on_top(settings.always_on_top);
        let _ = position_window(&win, &settings.position);
        // Opacity is applied in the renderer (CSS on the widget container).
        let _ = win.emit("settings-updated", &settings);
    }
    settings
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    spawn_settings_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Proxy an HTTP request to the TaskNotes API on 127.0.0.1. Pinned to IPv4 to
/// avoid the localhost -> ::1 resolution problem. Port/token come from saved
/// settings unless explicitly overridden (used by the Test Connection button).
#[tauri::command]
async fn api_request(
    state: State<'_, SettingsState>,
    method: String,
    path: String,
    body: Option<Value>,
    port: Option<u16>,
    token: Option<String>,
) -> Result<Value, String> {
    let (cfg_port, cfg_token) = {
        let s = state.0.lock().unwrap();
        (s.api_port, s.api_token.clone())
    };
    let port = port.unwrap_or(cfg_port);
    let token = token.unwrap_or(cfg_token);

    let url = format!("http://127.0.0.1:{}{}", port, path);
    let client = reqwest::Client::new();

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };
    req = req.header("Content-Type", "application/json");
    if !token.is_empty() {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    if let Some(b) = body {
        req = req.json(&b);
    }

    let resp = req
        .timeout(Duration::from_secs(8))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    resp.json::<Value>().await.map_err(|e| e.to_string())
}

// ── Windows ───────────────────────────────────────────────────────────────────
fn spawn_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show()?;
        win.set_focus()?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("TaskNotes Timer — Settings")
    .inner_size(460.0, 560.0)
    .resizable(true)
    .build()?;
    Ok(())
}

/// Position the overlay in one of five corners/edges of the current monitor.
fn position_window(win: &WebviewWindow, position: &str) -> tauri::Result<()> {
    if let Some(monitor) = win.current_monitor()? {
        let mon = monitor.size();
        let wsize = win.outer_size()?;
        let margin = (16.0 * monitor.scale_factor()) as i32;
        let mw = mon.width as i32;
        let mh = mon.height as i32;
        let ww = wsize.width as i32;
        let wh = wsize.height as i32;

        let (x, y) = match position {
            "top-left" => (margin, margin),
            "top-center" => ((mw - ww) / 2, margin),
            "bottom-right" => (mw - ww - margin, mh - wh - margin),
            "bottom-left" => (margin, mh - wh - margin),
            _ => (mw - ww - margin, margin), // top-right (default)
        };
        win.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

// ── Tray ──────────────────────────────────────────────────────────────────────
fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show/Hide Timer", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &settings, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("TaskNotes Timer")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(w) = app.get_webview_window("main") {
                    if w.is_visible().unwrap_or(true) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
            "settings" => {
                let _ = spawn_settings_window(app);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

// ── Entry point ────────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .setup(|app| {
            let handle = app.handle().clone();
            let settings = load_settings_from_disk(&handle);

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_always_on_top(settings.always_on_top);
                let _ = position_window(&win, &settings.position);
            }

            app.manage(SettingsState(Mutex::new(settings)));
            build_tray(&handle)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            open_settings,
            quit_app,
            api_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
