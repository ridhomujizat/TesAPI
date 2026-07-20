use std::{fs, path::Path};

use git2::{build::CheckoutBuilder, Repository, ResetType, Status, StatusOptions};

pub fn discard(repo: &Repository, paths: &[String]) -> Result<(), String> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    let mut options = StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo
        .statuses(Some(&mut options))
        .map_err(|error| error.message().to_owned())?;
    for relative in paths {
        let untracked = statuses.iter().any(|entry| {
            entry.path() == Some(relative.as_str()) && entry.status().contains(Status::WT_NEW)
        });
        if untracked {
            let path = workdir.join(relative);
            if path.is_dir() {
                fs::remove_dir_all(path).map_err(|error| error.to_string())?;
            } else if path.exists() {
                fs::remove_file(path).map_err(|error| error.to_string())?;
            }
            continue;
        }
        let mut checkout = CheckoutBuilder::new();
        checkout.force().path(relative);
        repo.checkout_head(Some(&mut checkout))
            .map_err(|error| error.message().to_owned())?;
    }
    Ok(())
}

pub fn reset_hard(repo: &Repository) -> Result<(), String> {
    let head = repo
        .head()
        .and_then(|head| head.peel_to_commit())
        .map_err(|error| error.message().to_owned())?;
    let untracked = untracked_paths(repo)?;
    repo.reset(head.as_object(), ResetType::Hard, None)
        .map_err(|error| error.message().to_owned())?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    for relative in untracked {
        let path = workdir.join(relative);
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn untracked_paths(repo: &Repository) -> Result<Vec<String>, String> {
    let mut options = StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    Ok(repo
        .statuses(Some(&mut options))
        .map_err(|error| error.message().to_owned())?
        .iter()
        .filter(|entry| entry.status().contains(Status::WT_NEW))
        .filter_map(|entry| entry.path().map(str::to_owned))
        .filter(|path| {
            !Path::new(path)
                .components()
                .any(|part| part.as_os_str() == ".git")
        })
        .collect())
}
