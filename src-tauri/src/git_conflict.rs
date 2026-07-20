use std::{
    fs,
    path::{Path, PathBuf},
};

use git2::{ErrorCode, Index, IndexConflict, Oid, Repository};
use serde::{Deserialize, Serialize};

use crate::{git_commit, storage};

const MANIFEST_NAME: &str = ".tesapi-conflict.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictManifest {
    pub local_oid: String,
    pub remote_oid: String,
    pub base_oid: String,
    pub branch: String,
    pub files: Vec<ConflictFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub kind: String,
    pub stages: ConflictStages,
    #[serde(default)]
    pub resolved: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictStages {
    pub base: bool,
    pub ours: bool,
    pub theirs: bool,
}

fn manifest_path(root: &Path) -> PathBuf {
    root.join(MANIFEST_NAME)
}
fn sidecar_path(root: &Path, relative: &str, side: &str) -> PathBuf {
    root.join(format!("{relative}.{side}.json"))
}

fn conflict_path(conflict: &IndexConflict) -> Result<String, String> {
    let entry = conflict
        .our
        .as_ref()
        .or(conflict.their.as_ref())
        .or(conflict.ancestor.as_ref())
        .ok_or_else(|| "Git conflict has no path".to_string())?;
    String::from_utf8(entry.path.clone()).map_err(|error| error.to_string())
}

fn write_stage(
    repo: &Repository,
    root: &Path,
    relative: &str,
    side: &str,
    oid: Oid,
) -> Result<(), String> {
    let blob = repo
        .find_blob(oid)
        .map_err(|error| error.message().to_owned())?;
    let contents = String::from_utf8_lossy(blob.content());
    storage::atomic_write_at(&sidecar_path(root, relative, side), &contents)
}

fn kind(stages: &ConflictStages) -> &'static str {
    match (stages.ours, stages.theirs) {
        (true, true) => "edit-edit",
        (false, true) => "delete-vs-edit",
        (true, false) => "edit-vs-delete",
        (false, false) => "delete-vs-delete",
    }
}

pub fn preserve(
    repo: &Repository,
    index: &Index,
    local_oid: Oid,
    remote_oid: Oid,
    base_oid: Oid,
    branch: &str,
) -> Result<ConflictManifest, String> {
    let root = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    let mut files = Vec::new();
    for conflict in index
        .conflicts()
        .map_err(|error| error.message().to_owned())?
    {
        let conflict = conflict.map_err(|error| error.message().to_owned())?;
        let path = conflict_path(&conflict)?;
        let stages = ConflictStages {
            base: conflict.ancestor.is_some(),
            ours: conflict.our.is_some(),
            theirs: conflict.their.is_some(),
        };
        if let Some(entry) = conflict.ancestor {
            write_stage(repo, root, &path, "base", entry.id)?;
        }
        if let Some(entry) = conflict.their {
            write_stage(repo, root, &path, "theirs", entry.id)?;
        }
        files.push(ConflictFile {
            path,
            kind: kind(&stages).into(),
            stages,
            resolved: false,
        });
    }
    let manifest = ConflictManifest {
        local_oid: local_oid.to_string(),
        remote_oid: remote_oid.to_string(),
        base_oid: base_oid.to_string(),
        branch: branch.into(),
        files,
    };
    write_manifest(root, &manifest)?;
    Ok(manifest)
}

pub fn load(root: &Path) -> Result<Option<ConflictManifest>, String> {
    let path = manifest_path(root);
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map(Some)
            .map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

pub fn cleanup_if_integrated(repo: &Repository) -> Result<Option<ConflictManifest>, String> {
    let root = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    let Some(manifest) = load(root)? else {
        return Ok(None);
    };
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| error.message().to_owned())?
        .id();
    let remote = Oid::from_str(&manifest.remote_oid).map_err(|error| error.message().to_owned())?;
    if head == remote
        || repo
            .graph_descendant_of(head, remote)
            .map_err(|error| error.message().to_owned())?
    {
        cleanup(root, &manifest)?;
        return Ok(None);
    }
    Ok(Some(manifest))
}

pub fn resolve(repo: &Repository, path: &str, choice: &str) -> Result<bool, String> {
    let root = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    let mut manifest = load(root)?.ok_or_else(|| "No workspace conflict is active".to_string())?;
    if !manifest_is_current(repo, &manifest)? {
        cleanup(root, &manifest)?;
        return Err("Conflict state was outdated; TesAPI cleared it so sync can run again.".into());
    }
    let file = manifest
        .files
        .iter_mut()
        .find(|file| file.path == path)
        .ok_or_else(|| "Conflict file not found".to_string())?;
    if choice == "theirs" {
        if file.stages.theirs {
            fs::copy(sidecar_path(root, path, "theirs"), root.join(path))
                .map_err(|error| error.to_string())?;
        } else if root.join(path).exists() {
            fs::remove_file(root.join(path)).map_err(|error| error.to_string())?;
        }
    } else if choice != "mine" {
        return Err("Conflict choice must be mine or theirs".into());
    }
    file.resolved = true;
    remove_sidecars(root, path)?;
    if manifest.files.iter().any(|file| !file.resolved) {
        write_manifest(root, &manifest)?;
        return Ok(false);
    }
    finish_merge(repo, &manifest)?;
    cleanup(root, &manifest)?;
    Ok(true)
}

fn finish_merge(repo: &Repository, manifest: &ConflictManifest) -> Result<(), String> {
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| error.message().to_owned())?;
    let local = Oid::from_str(&manifest.local_oid).map_err(|error| error.message().to_owned())?;
    let remote = Oid::from_str(&manifest.remote_oid).map_err(|error| error.message().to_owned())?;
    let current_branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .unwrap_or_default();
    let descends = head.id() == local
        || repo
            .graph_descendant_of(head.id(), local)
            .map_err(|error| error.message().to_owned())?;
    if !descends || current_branch != manifest.branch {
        return Err("Conflict state is outdated; sync again from the current branch.".into());
    }
    let mut index = repo.index().map_err(|error| error.message().to_owned())?;
    index
        .read_tree(&head.tree().map_err(|error| error.message().to_owned())?)
        .map_err(|error| error.message().to_owned())?;
    for file in &manifest.files {
        let path = Path::new(&file.path);
        if repo.workdir().is_some_and(|root| root.join(path).exists()) {
            index
                .add_path(path)
                .map_err(|error| error.message().to_owned())?;
        } else if let Err(error) = index.remove_path(path) {
            if error.code() != ErrorCode::NotFound {
                return Err(error.message().to_owned());
            }
        }
    }
    let tree_id = index
        .write_tree_to(repo)
        .map_err(|error| error.message().to_owned())?;
    git_commit::merge_commit(
        repo,
        tree_id,
        head.id(),
        remote,
        "tesapi: resolve sync conflict",
    )?;
    Ok(())
}

fn manifest_is_current(repo: &Repository, manifest: &ConflictManifest) -> Result<bool, String> {
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| error.message().to_owned())?;
    let local = Oid::from_str(&manifest.local_oid).map_err(|error| error.message().to_owned())?;
    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .unwrap_or_default();
    Ok(branch == manifest.branch
        && (head.id() == local
            || repo
                .graph_descendant_of(head.id(), local)
                .map_err(|error| error.message().to_owned())?))
}

fn write_manifest(root: &Path, manifest: &ConflictManifest) -> Result<(), String> {
    let contents = format!(
        "{}\n",
        serde_json::to_string_pretty(manifest).map_err(|error| error.to_string())?
    );
    storage::atomic_write_at(&manifest_path(root), &contents)
}

fn cleanup(root: &Path, manifest: &ConflictManifest) -> Result<(), String> {
    for file in &manifest.files {
        remove_sidecars(root, &file.path)?;
    }
    match fs::remove_file(manifest_path(root)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn remove_sidecars(root: &Path, path: &str) -> Result<(), String> {
    for side in ["base", "theirs"] {
        match fs::remove_file(sidecar_path(root, path, side)) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
