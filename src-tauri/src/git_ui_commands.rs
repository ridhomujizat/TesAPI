use git2::Repository;
use tauri::State;

use crate::{
    git_branches::{self, GitBranchInfo},
    git_commands::{queued, queued_git},
    git_commit,
    git_history::{self, GitLogEntry},
    git_status::{self, GitFileSource, GitWorkspaceStatus},
    git_transport, git_worktree,
    workspace_io::WorkspaceQueueState,
};

fn open(root: &std::path::Path) -> Result<Repository, String> {
    Repository::open(root).map_err(|error| error.message().to_owned())
}

#[tauri::command]
pub async fn git_workspace_status(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<GitWorkspaceStatus, String> {
    queued(root_path, state, |root| git_status::status(&open(root)?)).await
}

#[tauri::command]
pub async fn git_read_workspace_source(
    root_path: String,
    relative_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<GitFileSource, String> {
    queued(root_path, state, move |root| {
        git_status::read_source(&open(root)?, &relative_path)
    })
    .await
}

#[tauri::command]
pub async fn git_commit_workspace_selection(
    root_path: String,
    relative_paths: Vec<String>,
    message: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<bool, String> {
    queued_git(root_path, state, move |root, _cancel| {
        let refs = relative_paths
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        if message.trim().is_empty() {
            return Err("Commit message is required".into());
        }
        git_commit::commit_selection(&open(root)?, &refs, message.trim())
    })
    .await
}

#[tauri::command]
pub async fn git_push_workspace(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, |root, _cancel| {
        git_transport::push(&open(root)?)
    })
    .await
}

#[tauri::command]
pub async fn git_workspace_log(
    root_path: String,
    limit: usize,
    state: State<'_, WorkspaceQueueState>,
) -> Result<Vec<GitLogEntry>, String> {
    queued(root_path, state, move |root| {
        git_history::log(&open(root)?, limit)
    })
    .await
}

#[tauri::command]
pub async fn git_workspace_branches(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<Vec<GitBranchInfo>, String> {
    queued(root_path, state, |root| git_branches::list(&open(root)?)).await
}

#[tauri::command]
pub async fn git_checkout_workspace_branch(
    root_path: String,
    branch: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_branches::checkout(&open(root)?, &branch)
    })
    .await
}

#[tauri::command]
pub async fn git_create_workspace_branch(
    root_path: String,
    branch: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_branches::create(&open(root)?, &branch, true)
    })
    .await
}

#[tauri::command]
pub async fn git_rename_workspace_branch(
    root_path: String,
    branch: String,
    next_branch: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_branches::rename(&open(root)?, &branch, &next_branch)
    })
    .await
}

#[tauri::command]
pub async fn git_delete_workspace_branch(
    root_path: String,
    branch: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_branches::delete(&open(root)?, &branch)
    })
    .await
}

#[tauri::command]
pub async fn git_discard_workspace_paths(
    root_path: String,
    relative_paths: Vec<String>,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_worktree::discard(&open(root)?, &relative_paths)
    })
    .await
}

#[tauri::command]
pub async fn git_reset_workspace_hard(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, |root, _cancel| {
        git_worktree::reset_hard(&open(root)?)
    })
    .await
}

#[tauri::command]
pub async fn git_workspace_remote(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<Option<String>, String> {
    queued(root_path, state, |root| {
        Ok(git_branches::remote_url(&open(root)?))
    })
    .await
}

#[tauri::command]
pub async fn git_set_workspace_remote(
    root_path: String,
    url: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_branches::set_remote(&open(root)?, &url)
    })
    .await
}

#[tauri::command]
pub async fn git_test_workspace_remote(
    root_path: String,
    url: Option<String>,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_branches::test_remote(&open(root)?, url.as_deref())
    })
    .await
}
