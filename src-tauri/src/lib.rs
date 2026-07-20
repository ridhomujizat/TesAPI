mod db;
#[cfg(test)]
mod db_tests;
mod git_branches;
mod git_commands;
mod git_commit;
mod git_conflict;
mod git_history;
mod git_status;
mod git_sync;
#[cfg(test)]
mod git_sync_tests;
mod git_transport;
mod git_ui_commands;
mod git_worktree;
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
            registry_commands::registry_delete_workspace,
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
            git_ui_commands::git_workspace_status,
            git_ui_commands::git_read_workspace_source,
            git_ui_commands::git_commit_workspace_selection,
            git_ui_commands::git_push_workspace,
            git_ui_commands::git_workspace_log,
            git_ui_commands::git_workspace_branches,
            git_ui_commands::git_checkout_workspace_branch,
            git_ui_commands::git_create_workspace_branch,
            git_ui_commands::git_rename_workspace_branch,
            git_ui_commands::git_delete_workspace_branch,
            git_ui_commands::git_discard_workspace_paths,
            git_ui_commands::git_reset_workspace_hard,
            git_ui_commands::git_workspace_remote,
            git_ui_commands::git_set_workspace_remote,
            git_ui_commands::git_test_workspace_remote,
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
