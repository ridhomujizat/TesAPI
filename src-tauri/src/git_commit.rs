use std::path::Path;

use git2::{IndexAddOption, Repository, Signature};

use crate::git_transport;

const TESAPI_PATHS: &[&str] = &[
    "workspace.json",
    "environments.json",
    ".gitignore",
    "collections/**",
];

fn signature(repo: &Repository) -> Result<Signature<'_>, git2::Error> {
    repo.signature()
        .or_else(|_| Signature::now("TesAPI", "tesapi@local"))
}

pub fn commit_all(repo: &Repository, message: &str) -> Result<bool, String> {
    commit_paths(repo, TESAPI_PATHS, message)
}

pub fn commit_paths(repo: &Repository, paths: &[&str], message: &str) -> Result<bool, String> {
    let mut index = repo.index().map_err(|error| error.message().to_owned())?;
    index
        .add_all(paths.iter().copied(), IndexAddOption::DEFAULT, None)
        .map_err(|error| error.message().to_owned())?;
    index
        .update_all(paths.iter().copied(), None)
        .map_err(|error| error.message().to_owned())?;
    index.write().map_err(|error| error.message().to_owned())?;
    commit_index(repo, &mut index, message)
}

pub fn commit_tesapi_dirty(repo: &Repository, message: &str) -> Result<bool, String> {
    commit_paths(repo, TESAPI_PATHS, message)
}

pub fn commit_relative_paths(repo: &Repository, paths: &[String]) -> Result<bool, String> {
    let refs = paths.iter().map(String::as_str).collect::<Vec<_>>();
    let message = if refs.len() == 1 {
        format!("tesapi: update {}", refs[0])
    } else {
        format!("tesapi: update {} files", refs.len())
    };
    let changed = commit_paths(repo, &refs, &message)?;
    if changed && repo.find_remote("origin").is_ok() {
        git_transport::push(repo)?;
    }
    Ok(changed)
}

pub fn commit_file(root: &Path, relative: &str) -> Result<bool, String> {
    let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
    commit_relative_paths(&repo, &[relative.to_owned()])
}

pub fn commit_index(
    repo: &Repository,
    index: &mut git2::Index,
    message: &str,
) -> Result<bool, String> {
    let tree_id = index
        .write_tree()
        .map_err(|error| error.message().to_owned())?;
    if repo
        .head()
        .ok()
        .and_then(|head| head.peel_to_commit().ok())
        .is_some_and(|parent| parent.tree_id() == tree_id)
    {
        return Ok(false);
    }
    let tree = repo
        .find_tree(tree_id)
        .map_err(|error| error.message().to_owned())?;
    let signature = signature(repo).map_err(|error| error.message().to_owned())?;
    let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    let parents = parent.as_ref().map(|value| vec![value]).unwrap_or_default();
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &parents,
    )
    .map_err(|error| error.message().to_owned())?;
    Ok(true)
}

pub fn merge_commit(
    repo: &Repository,
    tree_id: git2::Oid,
    first: git2::Oid,
    second: git2::Oid,
    message: &str,
) -> Result<git2::Oid, String> {
    let tree = repo
        .find_tree(tree_id)
        .map_err(|error| error.message().to_owned())?;
    let first = repo
        .find_commit(first)
        .map_err(|error| error.message().to_owned())?;
    let second = repo
        .find_commit(second)
        .map_err(|error| error.message().to_owned())?;
    let signature = signature(repo).map_err(|error| error.message().to_owned())?;
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &[&first, &second],
    )
    .map_err(|error| error.message().to_owned())
}
