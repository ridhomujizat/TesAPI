mod db;
#[cfg(test)]
mod db_tests;
mod git_sync;
mod http;
mod registry_commands;
mod storage;
mod windows;
mod workspace;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let registry = db::initialize(app.handle()).map_err(std::io::Error::other)?;
            app.manage(registry);
            app.manage(windows::WindowWorkspaceState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            registry_commands::registry_list_workspaces,
            registry_commands::registry_get_workspace,
            registry_commands::registry_get_setting,
            registry_commands::registry_set_setting,
            registry_commands::registry_touch_workspace,
            registry_commands::registry_create_workspace,
            registry_commands::registry_rename_workspace,
            registry_commands::registry_default_workspace_path,
            windows::register_workspace_window,
            windows::set_workspace_window_title,
            windows::open_workspace_window,
            git_sync::git_commit_workspace_file,
            git_sync::git_pull_workspace,
            http::send_request,
            storage::ensure_dirs,
            storage::read_json,
            storage::atomic_write_json,
            storage::append_line,
            storage::read_last_lines,
            storage::list_dir,
            storage::list_collection_summaries,
            storage::delete_file,
            storage::quarantine_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
