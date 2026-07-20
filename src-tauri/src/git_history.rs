use std::path::Path;

use git2::{Delta, DiffOptions, Repository, Sort};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub oid: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub paths: Vec<String>,
}

pub fn log(repo: &Repository, limit: usize) -> Result<Vec<GitLogEntry>, String> {
    let mut walk = repo.revwalk().map_err(|error| error.message().to_owned())?;
    if repo.head().is_err() {
        return Ok(Vec::new());
    }
    walk.push_head()
        .map_err(|error| error.message().to_owned())?;
    walk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL)
        .map_err(|error| error.message().to_owned())?;
    walk.take(limit.min(50))
        .map(|oid| {
            let commit = repo
                .find_commit(oid.map_err(|error| error.message().to_owned())?)
                .map_err(|error| error.message().to_owned())?;
            let tree = commit.tree().map_err(|error| error.message().to_owned())?;
            let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());
            let mut options = DiffOptions::new();
            let diff = repo
                .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut options))
                .map_err(|error| error.message().to_owned())?;
            let mut paths = diff
                .deltas()
                .filter_map(|delta| match delta.status() {
                    Delta::Deleted => delta.old_file().path(),
                    _ => delta.new_file().path().or_else(|| delta.old_file().path()),
                })
                .map(Path::to_string_lossy)
                .map(|path| path.into_owned())
                .collect::<Vec<_>>();
            paths.sort();
            paths.dedup();
            let author = commit.author();
            Ok(GitLogEntry {
                oid: commit.id().to_string(),
                message: commit.summary().unwrap_or("Untitled commit").to_owned(),
                author: author.name().unwrap_or("Unknown").to_owned(),
                email: author.email().unwrap_or_default().to_owned(),
                timestamp: commit.time().seconds(),
                paths,
            })
        })
        .collect()
}
