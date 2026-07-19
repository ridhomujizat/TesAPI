use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::git_sync;

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
        fs::write(
            root.join(".gitignore"),
            "history.ndjson\nhistory.ndjson.bak\nsession.json\nsession.json.bak\n",
        )
        .map_err(|error| error.to_string())?;
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
