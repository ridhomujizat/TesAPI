use std::{
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
};

use git2::Repository;
use tauri::State;

use crate::{
    git_commit,
    git_conflict::{self, ConflictManifest},
    git_sync::{self, SyncResult},
    git_transport,
    workspace_io::WorkspaceQueueState,
};

#[tauri::command]
pub async fn git_commit_workspace_file(
    root_path: String,
    relative_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<bool, String> {
    queued_git(root_path, state, move |root, _cancel| {
        git_commit::commit_file(root, &relative_path)
    })
    .await
}

#[tauri::command]
pub async fn git_commit_workspace_paths(
    root_path: String,
    relative_paths: Vec<String>,
    state: State<'_, WorkspaceQueueState>,
) -> Result<bool, String> {
    queued_git(root_path, state, move |root, _cancel| {
        let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
        git_commit::commit_relative_paths(&repo, &relative_paths)
    })
    .await
}

#[tauri::command]
pub async fn git_pull_workspace(
    root_path: String,
    branch: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<SyncResult, String> {
    queued_git(root_path, state, move |root, cancel| {
        git_sync::sync_workspace(root, &branch, cancel)
    })
    .await
}

#[tauri::command]
pub async fn git_workspace_conflicts(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<Option<ConflictManifest>, String> {
    queued(root_path, state, |root| {
        let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
        git_conflict::cleanup_if_integrated(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_resolve_workspace_conflict(
    root_path: String,
    path: String,
    choice: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<bool, String> {
    queued_git(root_path, state, move |root, _cancel| {
        let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
        let complete = git_conflict::resolve(&repo, &path, &choice)?;
        if complete {
            git_transport::push(&repo)?;
        }
        Ok(complete)
    })
    .await
}

#[tauri::command]
pub async fn git_is_workspace_path_tracked(
    root_path: String,
    relative_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<bool, String> {
    queued(root_path, state, move |root| {
        let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
        let index = repo.index().map_err(|error| error.message().to_owned())?;
        Ok(index.get_path(Path::new(&relative_path), 0).is_some())
    })
    .await
}

#[tauri::command]
pub async fn git_environment_history_is_sanitized(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<bool, String> {
    queued(root_path, state, environment_history_is_sanitized).await
}

#[tauri::command]
pub async fn git_set_identity(
    root_path: String,
    name: String,
    email: String,
    state: State<'_, WorkspaceQueueState>,
) -> Result<(), String> {
    queued(root_path, state, move |root| {
        if name.trim().is_empty() || email.trim().is_empty() {
            return Err("Git name and email are required".into());
        }
        let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
        let mut config = repo.config().map_err(|error| error.message().to_owned())?;
        config
            .set_str("user.name", name.trim())
            .map_err(|error| error.message().to_owned())?;
        config
            .set_str("user.email", email.trim())
            .map_err(|error| error.message().to_owned())?;
        Ok(())
    })
    .await
}

async fn queued<T, F>(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
    operation: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Path) -> Result<T, String> + Send + 'static,
{
    let root = PathBuf::from(root_path);
    let lock = state.lock_for(&root)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Workspace queue lock poisoned".to_string())?;
        operation(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

async fn queued_git<T, F>(
    root_path: String,
    state: State<'_, WorkspaceQueueState>,
    operation: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&Path, Arc<AtomicBool>) -> Result<T, String> + Send + 'static,
{
    let root = PathBuf::from(root_path);
    let lock = state.lock_for(&root)?;
    let cancellations = state.git_cancellations();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Workspace queue lock poisoned".to_string())?;
        let cancel = Arc::new(AtomicBool::new(false));
        cancellations
            .lock()
            .map_err(|_| "Workspace cancellation registry lock poisoned".to_string())?
            .insert(root.clone(), cancel.clone());
        let result = operation(&root, cancel);
        cancellations
            .lock()
            .map_err(|_| "Workspace cancellation registry lock poisoned".to_string())?
            .remove(&root);
        result
    })
    .await
    .map_err(|error| error.to_string())?
}

fn environment_history_is_sanitized(root: &Path) -> Result<bool, String> {
    let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
    let mut walk = repo.revwalk().map_err(|error| error.message().to_owned())?;
    for reference in repo
        .references()
        .map_err(|error| error.message().to_owned())?
    {
        if let Some(oid) = reference
            .map_err(|error| error.message().to_owned())?
            .target()
        {
            let _ = walk.push(oid);
        }
    }
    for oid in walk {
        let commit = repo
            .find_commit(oid.map_err(|error| error.message().to_owned())?)
            .map_err(|error| error.message().to_owned())?;
        let tree = commit.tree().map_err(|error| error.message().to_owned())?;
        let Ok(entry) = tree.get_path(Path::new("environments.json")) else {
            continue;
        };
        let blob = repo
            .find_blob(entry.id())
            .map_err(|error| error.message().to_owned())?;
        let Ok(value) = serde_json::from_slice::<serde_json::Value>(blob.content()) else {
            continue;
        };
        let leaked = value
            .get("environments")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .flat_map(|environment| {
                environment
                    .get("variables")
                    .and_then(serde_json::Value::as_array)
                    .into_iter()
                    .flatten()
            })
            .any(|variable| {
                variable
                    .get("value")
                    .and_then(serde_json::Value::as_str)
                    .is_some_and(|value| !value.is_empty())
            });
        if leaked {
            return Ok(false);
        }
    }
    Ok(true)
}
