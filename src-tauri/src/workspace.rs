use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::git_sync;

const GITIGNORE_ENTRIES: &[&str] = &[
    "*.local.json",
    "history.ndjson*",
    "session.json*",
    "*.bak",
    "*.corrupt-*",
    "*.migrated",
    "*.theirs.json",
    "*.base.json",
    ".tesapi-conflict.json",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub sync_type: String,
    pub git_remote: Option<String>,
    pub git_branch: Option<String>,
}

pub fn descriptor_path(root: &Path) -> PathBuf {
    root.join("workspace.json")
}

pub fn read_descriptor(root: &Path) -> Result<WorkspaceFile, String> {
    let contents = fs::read_to_string(descriptor_path(root))
        .map_err(|_| "Location is not an existing TesAPI workspace.".to_string())?;
    if let Ok(descriptor) = serde_json::from_str(&contents) {
        return Ok(descriptor);
    }
    let legacy: Value = serde_json::from_str(&contents)
        .map_err(|_| "The existing workspace descriptor is invalid.".to_string())?;
    let storage = legacy.get("storage").cloned().unwrap_or(Value::Null);
    let sync_type = if storage
        .get("git")
        .and_then(|git| git.get("enabled"))
        .and_then(Value::as_bool)
        == Some(true)
    {
        "git"
    } else {
        storage
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("local")
    };
    Ok(WorkspaceFile {
        schema_version: 1,
        id: legacy
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .into(),
        name: legacy
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("My Workspace")
            .into(),
        sync_type: sync_type.into(),
        git_remote: None,
        git_branch: (sync_type == "git").then(|| "main".into()),
    })
}

pub fn write_descriptor(root: &Path, descriptor: &WorkspaceFile) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let contents = format!(
        "{}\n",
        serde_json::to_string_pretty(descriptor).map_err(|error| error.to_string())?
    );
    crate::storage::atomic_write_at(&descriptor_path(root), &contents)
}

pub fn merge_gitignore(root: &Path) -> Result<(), String> {
    let path = root.join(".gitignore");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let missing = GITIGNORE_ENTRIES
        .iter()
        .filter(|entry| !existing.lines().any(|line| line.trim() == **entry))
        .copied()
        .collect::<Vec<_>>();
    if missing.is_empty() {
        return Ok(());
    }
    let mut contents = existing;
    if !contents.is_empty() && !contents.ends_with('\n') {
        contents.push('\n');
    }
    if !contents.is_empty() {
        contents.push('\n');
    }
    contents.push_str("# TesAPI machine-local state\n");
    contents.push_str(&missing.join("\n"));
    contents.push('\n');
    crate::storage::atomic_write_at(&path, &contents)
}

#[cfg(test)]
mod tests {
    use super::merge_gitignore;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn merge_gitignore_preserves_custom_entries() {
        let root = std::env::temp_dir().join(format!(
            "tesapi-ignore-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join(".gitignore");
        fs::write(&path, "# team\ncustom.tmp\n").unwrap();
        merge_gitignore(&root).unwrap();
        let contents = fs::read_to_string(&path).unwrap();
        assert!(contents.contains("custom.tmp"));
        assert!(contents.contains("*.local.json"));
        let before = contents.clone();
        merge_gitignore(&root).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), before);
        let _ = fs::remove_dir_all(root);
    }
}

#[tauri::command]
pub async fn prepare_workspace_gitignore(
    root_path: String,
    state: tauri::State<'_, crate::workspace_io::WorkspaceQueueState>,
) -> Result<(), String> {
    let root = PathBuf::from(root_path);
    let lock = state.lock_for(&root)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Workspace queue lock poisoned".to_string())?;
        merge_gitignore(&root)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn is_empty(path: &Path) -> Result<bool, String> {
    Ok(!path.exists()
        || fs::read_dir(path)
            .map_err(|error| error.to_string())?
            .next()
            .is_none())
}

pub fn create_folder(mut descriptor: WorkspaceFile, root: &Path) -> Result<WorkspaceFile, String> {
    if let Some(parent) = root.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let attaching = root.exists() && !is_empty(root)?;
    if attaching {
        let existing = read_descriptor(root)?;
        if existing.schema_version > 1 {
            return Ok(existing);
        }
        if !existing.id.is_empty() {
            descriptor.id = existing.id;
        }
    } else if descriptor.sync_type == "git"
        && descriptor
            .git_remote
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        git_sync::clone_repo(
            descriptor.git_remote.as_deref().unwrap(),
            descriptor.git_branch.as_deref().unwrap_or("main"),
            root,
        )?;
    }

    fs::create_dir_all(root.join("collections")).map_err(|error| error.to_string())?;
    write_descriptor(root, &descriptor)?;
    let environments = root.join("environments.json");
    if !environments.exists() {
        crate::storage::atomic_write_at(&environments, "{\n  \"schemaVersion\": 1,\n  \"activeEnvironmentId\": null,\n  \"environments\": []\n}\n")?;
    }

    if descriptor.sync_type == "git" {
        merge_gitignore(root)?;
        let repo = match git2::Repository::open(root) {
            Ok(repo) => repo,
            Err(_) => git_sync::init_repo(
                root,
                descriptor.git_branch.as_deref().unwrap_or("main"),
                descriptor.git_remote.as_deref(),
            )?,
        };
        git_sync::commit_all(&repo, "tesapi: initialize workspace")?;
    }
    Ok(descriptor)
}
