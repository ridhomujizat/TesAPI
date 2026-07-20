use std::{
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};

use git2::{build::CheckoutBuilder, Oid, Repository};
use serde::Serialize;

use crate::{
    git_commit,
    git_conflict::{self, ConflictManifest},
    git_transport,
};

pub use crate::git_commit::commit_all;
pub use crate::git_transport::{clone_repo, init_repo};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub(crate) state: &'static str,
    pub(crate) conflicts: Vec<String>,
}

impl SyncResult {
    fn synced() -> Self {
        Self {
            state: "synced",
            conflicts: Vec::new(),
        }
    }
    fn paused() -> Self {
        Self {
            state: "paused",
            conflicts: Vec::new(),
        }
    }
    fn conflicted(manifest: &ConflictManifest) -> Self {
        Self {
            state: "conflicted",
            conflicts: manifest
                .files
                .iter()
                .map(|file| file.path.clone())
                .collect(),
        }
    }
}

fn fast_forward(repo: &Repository, branch: &str, target: Oid) -> Result<(), String> {
    let commit = repo
        .find_commit(target)
        .map_err(|error| error.message().to_owned())?;
    repo.checkout_tree(commit.as_object(), Some(CheckoutBuilder::new().safe()))
        .map_err(|error| error.message().to_owned())?;
    let reference_name = format!("refs/heads/{branch}");
    match repo.find_reference(&reference_name) {
        Ok(mut reference) => {
            reference
                .set_target(target, "tesapi: fast-forward sync")
                .map_err(|error| error.message().to_owned())?;
        }
        Err(_) => {
            repo.reference(&reference_name, target, true, "tesapi: create branch")
                .map_err(|error| error.message().to_owned())?;
        }
    }
    repo.set_head(&reference_name)
        .map_err(|error| error.message().to_owned())
}

fn merge(
    repo: &Repository,
    branch: &str,
    local_oid: Oid,
    remote_oid: Oid,
) -> Result<Option<ConflictManifest>, String> {
    let local = repo
        .find_commit(local_oid)
        .map_err(|error| error.message().to_owned())?;
    let remote = repo
        .find_commit(remote_oid)
        .map_err(|error| error.message().to_owned())?;
    let base_oid = repo
        .merge_base(local_oid, remote_oid)
        .map_err(|error| error.message().to_owned())?;
    let mut index = repo
        .merge_commits(&local, &remote, None)
        .map_err(|error| error.message().to_owned())?;
    if index.has_conflicts() {
        return git_conflict::preserve(repo, &index, local_oid, remote_oid, base_oid, branch)
            .map(Some);
    }
    let tree_id = index
        .write_tree_to(repo)
        .map_err(|error| error.message().to_owned())?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|error| error.message().to_owned())?;
    repo.checkout_tree(tree.as_object(), Some(CheckoutBuilder::new().safe()))
        .map_err(|error| error.message().to_owned())?;
    git_commit::merge_commit(
        repo,
        tree_id,
        local_oid,
        remote_oid,
        "tesapi: merge workspace changes",
    )?;
    Ok(None)
}

pub fn sync_workspace(
    root: &Path,
    branch: &str,
    cancel: Arc<AtomicBool>,
) -> Result<SyncResult, String> {
    let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
    if let Some(manifest) = git_conflict::cleanup_if_integrated(&repo)? {
        return Ok(SyncResult::conflicted(&manifest));
    }
    git_commit::commit_tesapi_dirty(&repo, "tesapi: local changes before sync")?;
    if repo.find_remote("origin").is_err() {
        return Ok(SyncResult::synced());
    }

    for attempt in 0..3 {
        let Some(remote_oid) = git_transport::fetch(&repo, branch, cancel.clone())? else {
            git_transport::push(&repo)?;
            return Ok(SyncResult::synced());
        };
        let local_oid = repo
            .head()
            .and_then(|head| head.peel_to_commit())
            .map_err(|error| error.message().to_owned())?
            .id();
        if local_oid == remote_oid
            || repo
                .graph_descendant_of(local_oid, remote_oid)
                .map_err(|error| error.message().to_owned())?
        {
            match git_transport::push(&repo) {
                Ok(()) => return Ok(SyncResult::synced()),
                Err(error) if attempt < 2 && error.to_lowercase().contains("non-fast-forward") => {
                    continue
                }
                Err(error) => return Err(error),
            }
        }
        if repo
            .graph_descendant_of(remote_oid, local_oid)
            .map_err(|error| error.message().to_owned())?
        {
            fast_forward(&repo, branch, remote_oid)?;
            return Ok(SyncResult::synced());
        }
        if let Some(manifest) = merge(&repo, branch, local_oid, remote_oid)? {
            return Ok(SyncResult::conflicted(&manifest));
        }
        match git_transport::push(&repo) {
            Ok(()) => return Ok(SyncResult::synced()),
            Err(error) if attempt < 2 && error.to_lowercase().contains("non-fast-forward") => {
                continue
            }
            Err(error) => return Err(error),
        }
    }
    Ok(SyncResult::paused())
}
