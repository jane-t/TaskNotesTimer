use std::time::Duration;
use serde_json::Value;
use tauri::{Manager, PhysicalPosition, WebviewWindow};

/// Proxy an HTTP request to the TaskNotes API running on 127.0.0.1.
/// Pinned to IPv4 to avoid the localhost -> ::1 resolution problem, and adds
/// the optional bearer token. Returns the parsed JSON body on success.
#[tauri::command]
async fn api_request(
    method: String,
    path: String,
    body: Option<Value>,
    port: u16,
    token: Option<String>,
) -> Result<Value, String> {
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let client = reqwest::Client::new();

    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };
    req = req.header("Content-Type", "application/json");

    if let Some(t) = token {
        if !t.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", t));
        }
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

/// Place the overlay in the top-right corner of the current monitor.
fn position_top_right(win: &WebviewWindow) -> tauri::Result<()> {
    if let Some(monitor) = win.current_monitor()? {
        let mon = monitor.size();
        let wsize = win.outer_size()?;
        let margin = (16.0 * monitor.scale_factor()) as i32;
        let x = mon.width as i32 - wsize.width as i32 - margin;
        let y = margin;
        win.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = position_top_right(&win);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![api_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
