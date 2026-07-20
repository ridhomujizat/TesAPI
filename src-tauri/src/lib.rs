mod db;
#[cfg(test)]
mod db_tests;
mod git_commands;
mod git_commit;
mod git_conflict;
mod git_sync;
#[cfg(test)]
mod git_sync_tests;
mod git_transport;
mod http;
mod registry_commands;
mod storage;
mod storage_collections;
mod windows;
mod workspace;
mod workspace_io;
mod workspace_watch;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // libgit2 timeout options are process-global and must be set before Tauri starts threads.
    unsafe {
        git2::opts::set_server_connect_timeout_in_milliseconds(10_000)
            .expect("failed to configure git connect timeout");
        git2::opts::set_server_timeout_in_milliseconds(10_000)
            .expect("failed to configure git server timeout");
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let registry = db::initialize(app.handle()).map_err(std::io::Error::other)?;
            app.manage(registry);
            app.manage(windows::WindowWorkspaceState::default());
            app.manage(workspace_io::WorkspaceQueueState::default());
            app.manage(workspace_watch::WorkspaceWatchState::default());
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
            git_commands::git_commit_workspace_file,
            git_commands::git_commit_workspace_paths,
            git_commands::git_pull_workspace,
            git_commands::git_is_workspace_path_tracked,
            git_commands::git_environment_history_is_sanitized,
            git_commands::git_workspace_conflicts,
            git_commands::git_resolve_workspace_conflict,
            git_commands::git_set_identity,
            http::send_request,
            storage::ensure_dirs,
            storage::read_json,
            storage::atomic_write_json,
            storage::append_line,
            storage::read_last_lines,
            storage::list_dir,
            storage_collections::list_collection_summaries,
            storage::delete_file,
            storage::quarantine_file,
            workspace_io::workspace_read_file,
            workspace_io::workspace_write_file,
            workspace_io::workspace_delete_file,
            workspace_io::workspace_append_line,
            workspace_io::workspace_flush,
            workspace_watch::watch_workspace,
            workspace::prepare_workspace_gitignore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
