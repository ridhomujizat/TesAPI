use std::{collections::HashMap, sync::Mutex};

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Default)]
pub struct WindowWorkspaceState(pub Mutex<HashMap<String, String>>);

fn label_for(id: &str) -> String {
    let safe = id
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() {
                value
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("workspace-{safe}")
}

#[tauri::command]
pub fn register_workspace_window(
    window: WebviewWindow,
    workspace_id: String,
    state: State<'_, WindowWorkspaceState>,
) -> Result<(), String> {
    let mut windows = state
        .0
        .lock()
        .map_err(|_| "Window registry lock poisoned".to_string())?;
    windows.retain(|_, label| label != window.label());
    windows.insert(workspace_id, window.label().to_owned());
    Ok(())
}

#[tauri::command]
pub fn set_workspace_window_title(
    window: WebviewWindow,
    workspace_name: String,
) -> Result<(), String> {
    window
        .set_title(&format!("TesAPI — {workspace_name}"))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_workspace_window(
    app: AppHandle,
    workspace_id: String,
    workspace_name: String,
    state: State<'_, WindowWorkspaceState>,
) -> Result<(), String> {
    let mut windows = state
        .0
        .lock()
        .map_err(|_| "Window registry lock poisoned".to_string())?;
    if let Some(label) = windows.get(&workspace_id).cloned() {
        if let Some(window) = app.get_webview_window(&label) {
            window.show().map_err(|error| error.to_string())?;
            return window.set_focus().map_err(|error| error.to_string());
        }
        windows.remove(&workspace_id);
    }
    let label = label_for(&workspace_id);
    if let Some(window) = app.get_webview_window(&label) {
        windows.insert(workspace_id, label);
        window.show().map_err(|error| error.to_string())?;
        return window.set_focus().map_err(|error| error.to_string());
    }
    let url = WebviewUrl::App(format!("index.html?workspaceId={workspace_id}").into());
    WebviewWindowBuilder::new(&app, &label, url)
        .title(format!("TesAPI — {workspace_name}"))
        .inner_size(1280.0, 820.0)
        .min_inner_size(900.0, 600.0)
        .build()
        .map_err(|error| error.to_string())?;
    windows.insert(workspace_id, label);
    Ok(())
}
