use std::{
    fs,
    io::{ErrorKind, Read},
    path::Path,
    process::{Command, Stdio},
    sync::{atomic::AtomicBool, Arc},
    thread,
    time::{Duration, Instant},
};

use git2::{build::CheckoutBuilder, Oid, Repository};

const NETWORK_TIMEOUT: Duration = Duration::from_secs(10);

fn run_git(repo: &Repository, args: &[&str], cancel: Option<&AtomicBool>) -> Result<(), String> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Git workspace has no working directory".to_string())?;
    let mut child = Command::new("git")
        .arg("-C")
        .arg(workdir)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o ConnectTimeout=10",
        )
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not run the system Git CLI: {error}"))?;
    let started = Instant::now();
    loop {
        if cancel.is_some_and(|flag| flag.load(std::sync::atomic::Ordering::Relaxed))
            || started.elapsed() >= NETWORK_TIMEOUT
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Git network operation timed out or was cancelled".into());
        }
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stderr.take() {
                pipe.read_to_string(&mut stderr)
                    .map_err(|error| error.to_string())?;
            }
            if status.success() {
                return Ok(());
            }
            let detail = stderr.trim();
            return Err(if detail.is_empty() {
                format!("Git CLI exited with {status}")
            } else {
                detail.to_owned()
            });
        }
        thread::sleep(Duration::from_millis(25));
    }
}

pub fn clone_repo(remote: &str, branch: &str, path: &Path) -> Result<Repository, String> {
    let repo = init_repo(path, branch, Some(remote))?;
    if let Some(target) = fetch(&repo, branch, Arc::new(AtomicBool::new(false)))? {
        repo.reference(
            &format!("refs/heads/{branch}"),
            target,
            true,
            "tesapi: initialize cloned branch",
        )
        .map_err(|error| error.message().to_owned())?;
        repo.set_head(&format!("refs/heads/{branch}"))
            .map_err(|error| error.message().to_owned())?;
        let commit = repo
            .find_commit(target)
            .map_err(|error| error.message().to_owned())?;
        repo.checkout_tree(commit.as_object(), Some(CheckoutBuilder::new().force()))
            .map_err(|error| error.message().to_owned())?;
    }
    Ok(repo)
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
    if repo.find_remote("origin").is_err() {
        return Ok(None);
    }
    match fs::remove_file(repo.path().join("FETCH_HEAD")) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    run_git(
        repo,
        &[
            "fetch",
            "--quiet",
            "--prune",
            "origin",
            "+refs/heads/*:refs/remotes/origin/*",
        ],
        Some(cancel.as_ref()),
    )?;
    match repo.find_reference(&format!("refs/remotes/origin/{branch}")) {
        Ok(reference) => reference
            .peel_to_commit()
            .map(|commit| Some(commit.id()))
            .map_err(|error| error.message().to_owned()),
        Err(error) if error.code() == git2::ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error.message().to_owned()),
    }
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
    let refspec = format!("refs/heads/{branch}:refs/heads/{branch}");
    run_git(repo, &["push", "--quiet", "origin", &refspec], None)
}

pub fn test_remote(repo: &Repository, url: Option<&str>) -> Result<(), String> {
    let configured = repo
        .find_remote("origin")
        .ok()
        .and_then(|remote| remote.url().map(str::to_owned));
    let target = url
        .filter(|value| !value.trim().is_empty())
        .map(str::trim)
        .or(configured.as_deref())
        .ok_or_else(|| "No origin remote is configured".to_string())?;
    run_git(repo, &["ls-remote", "--heads", target], None)
}
