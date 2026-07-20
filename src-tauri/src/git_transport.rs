use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use git2::{Cred, FetchOptions, Oid, PushOptions, RemoteCallbacks, Repository};

fn callbacks(cancel: Option<Arc<AtomicBool>>) -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|url, username, _allowed| {
        let config = git2::Config::open_default()?;
        Cred::credential_helper(&config, url, username)
            .or_else(|_| Cred::ssh_key_from_agent(username.unwrap_or("git")))
            .or_else(|_| Cred::default())
    });
    if let Some(cancel) = cancel {
        let progress_cancel = cancel.clone();
        callbacks.transfer_progress(move |_| !progress_cancel.load(Ordering::Relaxed));
        callbacks.sideband_progress(move |_| !cancel.load(Ordering::Relaxed));
    }
    callbacks
}

pub fn clone_repo(remote: &str, branch: &str, path: &Path) -> Result<Repository, String> {
    let mut fetch = FetchOptions::new();
    fetch.remote_callbacks(callbacks(None));
    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch).branch(branch);
    builder
        .clone(remote, path)
        .map_err(|error| error.message().to_owned())
}

pub fn init_repo(path: &Path, branch: &str, remote: Option<&str>) -> Result<Repository, String> {
    let repo = Repository::init(path).map_err(|error| error.message().to_owned())?;
    if let Some(url) = remote.filter(|value| !value.trim().is_empty()) {
        repo.remote("origin", url)
            .map_err(|error| error.message().to_owned())?;
    }
    repo.set_head(&format!("refs/heads/{branch}"))
        .map_err(|error| error.message().to_owned())?;
    Ok(repo)
}

pub fn fetch(
    repo: &Repository,
    branch: &str,
    cancel: Arc<AtomicBool>,
) -> Result<Option<Oid>, String> {
    let mut remote = match repo.find_remote("origin") {
        Ok(remote) => remote,
        Err(_) => return Ok(None),
    };
    let mut options = FetchOptions::new();
    options.remote_callbacks(callbacks(Some(cancel)));
    remote
        .fetch(&[branch], Some(&mut options), None)
        .map_err(|error| error.message().to_owned())?;
    let reference = repo
        .find_reference("FETCH_HEAD")
        .map_err(|error| error.message().to_owned())?;
    let commit = repo
        .reference_to_annotated_commit(&reference)
        .map_err(|error| error.message().to_owned())?;
    Ok(Some(commit.id()))
}

pub fn push(repo: &Repository) -> Result<(), String> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    if workdir.join("secret-review.local.json").exists() {
        return Err(
            "Git push is blocked until leaked environment credentials are reviewed.".into(),
        );
    }
    if workdir.join(".tesapi-conflict.json").exists() {
        return Err("Git push is blocked until workspace conflicts are resolved.".into());
    }
    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .unwrap_or_else(|| "main".into());
    let rejection = Arc::new(Mutex::new(None::<String>));
    let callback_rejection = rejection.clone();
    let mut remote_callbacks = callbacks(None);
    remote_callbacks.push_update_reference(move |_, status| {
        if let Some(status) = status {
            *callback_rejection
                .lock()
                .expect("push rejection lock poisoned") = Some(status.to_owned());
        }
        Ok(())
    });
    let mut options = PushOptions::new();
    options.remote_callbacks(remote_callbacks);
    let result = remote_push(repo, &branch, &mut options);
    if let Some(status) = rejection
        .lock()
        .map_err(|_| "Push rejection lock poisoned".to_string())?
        .take()
    {
        return Err(status);
    }
    result
}

fn remote_push(
    repo: &Repository,
    branch: &str,
    options: &mut PushOptions<'_>,
) -> Result<(), String> {
    let mut remote = repo
        .find_remote("origin")
        .map_err(|error| error.message().to_owned())?;
    remote
        .push(
            &[format!("refs/heads/{branch}:refs/heads/{branch}")],
            Some(options),
        )
        .map_err(|error| error.message().to_owned())
}
