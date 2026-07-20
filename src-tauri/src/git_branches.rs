use git2::{build::CheckoutBuilder, BranchType, Repository};
use serde::Serialize;

use crate::git_transport;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchInfo {
    pub name: String,
    pub current: bool,
}

pub fn list(repo: &Repository) -> Result<Vec<GitBranchInfo>, String> {
    let current = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned));
    let mut branches = repo
        .branches(Some(BranchType::Local))
        .map_err(|error| error.message().to_owned())?
        .filter_map(Result::ok)
        .filter_map(|(branch, _)| branch.name().ok().flatten().map(str::to_owned))
        .map(|name| GitBranchInfo {
            current: current.as_deref() == Some(name.as_str()),
            name,
        })
        .collect::<Vec<_>>();
    branches.sort_by(|left, right| {
        right
            .current
            .cmp(&left.current)
            .then(left.name.cmp(&right.name))
    });
    Ok(branches)
}

pub fn checkout(repo: &Repository, name: &str) -> Result<(), String> {
    let reference = format!("refs/heads/{name}");
    let object = repo
        .revparse_single(&reference)
        .map_err(|error| error.message().to_owned())?;
    repo.checkout_tree(&object, Some(CheckoutBuilder::new().force()))
        .map_err(|error| error.message().to_owned())?;
    repo.set_head(&reference)
        .map_err(|error| error.message().to_owned())
}

pub fn create(repo: &Repository, name: &str, checkout_branch: bool) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Branch name is required".into());
    }
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| error.message().to_owned())?;
    repo.branch(name, &head, false)
        .map_err(|error| error.message().to_owned())?;
    if checkout_branch {
        checkout(repo, name)?;
    }
    Ok(())
}

pub fn rename(repo: &Repository, name: &str, next_name: &str) -> Result<(), String> {
    let mut branch = repo
        .find_branch(name, BranchType::Local)
        .map_err(|error| error.message().to_owned())?;
    branch
        .rename(next_name.trim(), false)
        .map_err(|error| error.message().to_owned())?;
    Ok(())
}

pub fn delete(repo: &Repository, name: &str) -> Result<(), String> {
    if repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .as_deref()
        == Some(name)
    {
        return Err("The current branch cannot be deleted".into());
    }
    repo.find_branch(name, BranchType::Local)
        .map_err(|error| error.message().to_owned())?
        .delete()
        .map_err(|error| error.message().to_owned())
}

pub fn remote_url(repo: &Repository) -> Option<String> {
    repo.find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(str::to_owned))
}

pub fn set_remote(repo: &Repository, url: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        if repo.find_remote("origin").is_ok() {
            repo.remote_delete("origin")
                .map_err(|error| error.message().to_owned())?;
        }
        return Ok(());
    }
    if repo.find_remote("origin").is_ok() {
        repo.remote_set_url("origin", url)
            .map_err(|error| error.message().to_owned())?;
    } else {
        repo.remote("origin", url)
            .map_err(|error| error.message().to_owned())?;
    }
    Ok(())
}

pub fn test_remote(repo: &Repository, url: Option<&str>) -> Result<(), String> {
    git_transport::test_remote(repo, url)
}
