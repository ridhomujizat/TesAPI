use std::{fs, path::Path};

use git2::{Repository, Status, StatusOptions};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkspaceStatus {
    pub branch: String,
    pub ahead: usize,
    pub behind: usize,
    pub has_remote: bool,
    pub files: Vec<GitFileStatus>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileSource {
    pub before: Option<String>,
    pub after: Option<String>,
}

fn is_sidecar(path: &str) -> bool {
    path.ends_with(".base.json")
        || path.ends_with(".theirs.json")
        || path == ".tesapi-conflict.json"
        || path.ends_with("/.tesapi-conflict.json")
}

fn file_status(status: Status) -> &'static str {
    if status.intersects(Status::WT_DELETED | Status::INDEX_DELETED) {
        "deleted"
    } else if status.intersects(Status::WT_NEW | Status::INDEX_NEW) {
        "added"
    } else {
        "modified"
    }
}

pub fn status(repo: &Repository) -> Result<GitWorkspaceStatus, String> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);
    let mut files = repo
        .statuses(Some(&mut options))
        .map_err(|error| error.message().to_owned())?
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.to_owned();
            (!is_sidecar(&path)).then(|| GitFileStatus {
                path,
                status: file_status(entry.status()),
            })
        })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));

    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .unwrap_or_else(|| "main".into());
    let (ahead, behind) = ahead_behind(repo).unwrap_or((0, 0));
    Ok(GitWorkspaceStatus {
        branch,
        ahead,
        behind,
        has_remote: repo.find_remote("origin").is_ok(),
        files,
    })
}

pub fn read_source(repo: &Repository, relative_path: &str) -> Result<GitFileSource, String> {
    let before = repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_tree().ok())
        .and_then(|tree| tree.get_path(Path::new(relative_path)).ok())
        .and_then(|entry| repo.find_blob(entry.id()).ok())
        .map(|blob| String::from_utf8_lossy(blob.content()).into_owned());
    let after = repo
        .workdir()
        .map(|root| root.join(relative_path))
        .filter(|path| path.is_file())
        .map(fs::read_to_string)
        .transpose()
        .map_err(|error| error.to_string())?;
    Ok(GitFileSource { before, after })
}

fn ahead_behind(repo: &Repository) -> Result<(usize, usize), String> {
    let local = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| error.message().to_owned())?;
    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .ok_or_else(|| "HEAD is detached".to_string())?;
    let remote = repo
        .find_reference(&format!("refs/remotes/origin/{branch}"))
        .and_then(|reference| reference.peel_to_commit())
        .map_err(|error| error.message().to_owned())?;
    repo.graph_ahead_behind(local.id(), remote.id())
        .map_err(|error| error.message().to_owned())
}

#[cfg(test)]
mod tests {
    use super::file_status;
    use git2::Status;

    #[test]
    fn maps_worktree_statuses() {
        assert_eq!(file_status(Status::WT_NEW), "added");
        assert_eq!(file_status(Status::WT_DELETED), "deleted");
        assert_eq!(file_status(Status::WT_MODIFIED), "modified");
    }
}
