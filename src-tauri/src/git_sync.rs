use std::path::Path;

use git2::{
    build::CheckoutBuilder, Cred, FetchOptions, IndexAddOption, PushOptions, RemoteCallbacks,
    Repository, Signature,
};

fn callbacks() -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|url, username, _allowed| {
        let config = git2::Config::open_default()?;
        Cred::credential_helper(&config, url, username)
            .or_else(|_| Cred::ssh_key_from_agent(username.unwrap_or("git")))
            .or_else(|_| Cred::default())
    });
    callbacks
}

fn signature(repo: &Repository) -> Result<Signature<'_>, git2::Error> {
    repo.signature()
        .or_else(|_| Signature::now("TesAPI", "tesapi@local"))
}

pub fn clone_repo(remote: &str, branch: &str, path: &Path) -> Result<Repository, String> {
    let mut fetch = FetchOptions::new();
    fetch.remote_callbacks(callbacks());
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
    let head = format!("refs/heads/{branch}");
    repo.set_head(&head)
        .map_err(|error| error.message().to_owned())?;
    Ok(repo)
}

pub fn commit_all(repo: &Repository, message: &str) -> Result<bool, String> {
    let mut index = repo.index().map_err(|error| error.message().to_owned())?;
    index
        .add_all(["*"], IndexAddOption::DEFAULT, None)
        .map_err(|error| error.message().to_owned())?;
    index.write().map_err(|error| error.message().to_owned())?;
    commit_index(repo, &mut index, message)
}

pub fn commit_file(root: &Path, relative: &str) -> Result<bool, String> {
    let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
    let mut index = repo.index().map_err(|error| error.message().to_owned())?;
    if root.join(relative).exists() {
        index
            .add_path(Path::new(relative))
            .map_err(|error| error.message().to_owned())?;
    } else {
        index
            .remove_path(Path::new(relative))
            .map_err(|error| error.message().to_owned())?;
    }
    index.write().map_err(|error| error.message().to_owned())?;
    let changed = commit_index(&repo, &mut index, &format!("tesapi: update {relative}"))?;
    if changed && repo.find_remote("origin").is_ok() {
        push(&repo)?;
    }
    Ok(changed)
}

fn commit_index(repo: &Repository, index: &mut git2::Index, message: &str) -> Result<bool, String> {
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

fn push(repo: &Repository) -> Result<(), String> {
    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_owned))
        .unwrap_or_else(|| "main".into());
    let mut remote = repo
        .find_remote("origin")
        .map_err(|error| error.message().to_owned())?;
    let mut options = PushOptions::new();
    options.remote_callbacks(callbacks());
    remote
        .push(
            &[format!("refs/heads/{branch}:refs/heads/{branch}")],
            Some(&mut options),
        )
        .map_err(|error| error.message().to_owned())
}

pub fn pull_fast_forward(root: &Path, branch: &str) -> Result<(), String> {
    let repo = Repository::open(root).map_err(|error| error.message().to_owned())?;
    let mut remote = match repo.find_remote("origin") {
        Ok(remote) => remote,
        Err(_) => return Ok(()),
    };
    let mut options = FetchOptions::new();
    options.remote_callbacks(callbacks());
    remote
        .fetch(&[branch], Some(&mut options), None)
        .map_err(|error| error.message().to_owned())?;
    let fetch_head = repo
        .find_reference("FETCH_HEAD")
        .map_err(|error| error.message().to_owned())?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(|error| error.message().to_owned())?;
    let (analysis, _) = repo
        .merge_analysis(&[&fetch_commit])
        .map_err(|error| error.message().to_owned())?;
    if analysis.is_up_to_date() {
        return Ok(());
    }
    if !analysis.is_fast_forward() {
        return Err(
            "Git pull needs manual conflict resolution; local files were kept unchanged.".into(),
        );
    }
    let target = repo
        .find_commit(fetch_commit.id())
        .map_err(|error| error.message().to_owned())?;
    repo.checkout_tree(target.as_object(), Some(CheckoutBuilder::new().safe()))
        .map_err(|_| {
            "Git pull found local file changes; local files were kept unchanged.".to_string()
        })?;
    let reference_name = format!("refs/heads/{branch}");
    match repo.find_reference(&reference_name) {
        Ok(mut reference) => {
            reference
                .set_target(fetch_commit.id(), "tesapi: fast-forward pull")
                .map_err(|error| error.message().to_owned())?;
        }
        Err(_) => {
            repo.reference(
                &reference_name,
                fetch_commit.id(),
                true,
                "tesapi: create branch",
            )
            .map_err(|error| error.message().to_owned())?;
        }
    }
    repo.set_head(&reference_name)
        .map_err(|error| error.message().to_owned())?;
    Ok(())
}

#[tauri::command]
pub async fn git_commit_workspace_file(
    root_path: String,
    relative_path: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || commit_file(Path::new(&root_path), &relative_path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn git_pull_workspace(root_path: String, branch: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || pull_fast_forward(Path::new(&root_path), &branch))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{commit_all, commit_file, init_repo, pull_fast_forward};
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "tesapi-git-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn init_and_commit_file() {
        let root = temp("commit");
        fs::create_dir_all(&root).unwrap();
        let repo = init_repo(&root, "main", None).unwrap();
        fs::write(root.join("collections.json"), "one").unwrap();
        assert!(commit_all(&repo, "initial").unwrap());
        fs::write(root.join("collections.json"), "two").unwrap();
        assert!(commit_file(&root, "collections.json").unwrap());
        assert_eq!(
            repo.head()
                .unwrap()
                .peel_to_commit()
                .unwrap()
                .message()
                .unwrap(),
            "tesapi: update collections.json"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pull_fast_forward_updates_local_files() {
        let root = temp("pull");
        let remote = root.join("remote.git");
        let seed = root.join("seed");
        let client = root.join("client");
        fs::create_dir_all(&root).unwrap();
        git2::Repository::init_bare(&remote).unwrap();
        let seed_repo = init_repo(&seed, "main", Some(remote.to_str().unwrap())).unwrap();
        fs::write(seed.join("environments.json"), "one").unwrap();
        commit_all(&seed_repo, "initial").unwrap();
        super::push(&seed_repo).unwrap();
        super::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();
        fs::write(seed.join("environments.json"), "two").unwrap();
        commit_file(&seed, "environments.json").unwrap();
        pull_fast_forward(&client, "main").unwrap();
        assert_eq!(
            fs::read_to_string(client.join("environments.json")).unwrap(),
            "two"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn pull_keeps_local_on_divergence() {
        let root = temp("diverge");
        let remote = root.join("remote.git");
        let seed = root.join("seed");
        let client = root.join("client");
        fs::create_dir_all(&root).unwrap();
        git2::Repository::init_bare(&remote).unwrap();
        let seed_repo = init_repo(&seed, "main", Some(remote.to_str().unwrap())).unwrap();
        fs::write(seed.join("workspace.json"), "base").unwrap();
        commit_all(&seed_repo, "initial").unwrap();
        super::push(&seed_repo).unwrap();
        let client_repo = super::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();
        fs::write(client.join("workspace.json"), "local").unwrap();
        commit_all(&client_repo, "local edit").unwrap();
        fs::write(seed.join("workspace.json"), "remote").unwrap();
        commit_file(&seed, "workspace.json").unwrap();
        assert!(pull_fast_forward(&client, "main")
            .unwrap_err()
            .contains("manual"));
        assert_eq!(
            fs::read_to_string(client.join("workspace.json")).unwrap(),
            "local"
        );
        let _ = fs::remove_dir_all(root);
    }
}
