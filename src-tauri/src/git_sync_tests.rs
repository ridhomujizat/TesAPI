use std::{
    fs,
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{git_commit, git_conflict, git_sync, git_transport};

fn temp(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "tesapi-collab-{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}

fn seed(remote: &Path) -> (PathBuf, PathBuf) {
    let seed = remote.with_extension("seed");
    fs::create_dir_all(&seed).unwrap();
    let repo = git_transport::init_repo(&seed, "main", Some(remote.to_str().unwrap())).unwrap();
    fs::write(seed.join("workspace.json"), "{\"name\":\"base\"}\n").unwrap();
    fs::write(seed.join("environments.json"), "{\"environments\":[] }\n").unwrap();
    git_commit::commit_all(&repo, "initial").unwrap();
    git_transport::push(&repo).unwrap();
    (seed, repo.path().to_path_buf())
}

#[test]
fn empty_remote_is_initialized_by_first_sync() {
    let root = temp("empty-remote");
    let remote = root.join("remote.git");
    let client = root.join("client");
    fs::create_dir_all(&root).unwrap();
    git2::Repository::init_bare(&remote).unwrap();
    let repo = git_transport::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();
    fs::write(client.join("workspace.json"), "{\"name\":\"local\"}\n").unwrap();
    git_commit::commit_all(&repo, "initial").unwrap();

    let result =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();

    assert_eq!(result.state, "synced");
    assert!(git2::Repository::open_bare(&remote)
        .unwrap()
        .find_reference("refs/heads/main")
        .is_ok());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn corrupt_fetch_head_is_replaced_before_fetch() {
    let root = temp("fetch-head");
    let remote = root.join("remote.git");
    fs::create_dir_all(&root).unwrap();
    git2::Repository::init_bare(&remote).unwrap();
    seed(&remote);
    let client = root.join("client");
    let repo = git_transport::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();
    fs::write(repo.path().join("FETCH_HEAD"), "broken ref contents\n").unwrap();

    let result =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();

    assert_eq!(result.state, "synced");
    let _ = fs::remove_dir_all(root);
}

#[test]
fn different_files_merge_and_push() {
    let root = temp("files");
    let remote = root.join("remote.git");
    fs::create_dir_all(&root).unwrap();
    git2::Repository::init_bare(&remote).unwrap();
    let (seed, _) = seed(&remote);
    let client = root.join("client");
    git_transport::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();

    fs::write(seed.join("workspace.json"), "{\"name\":\"remote\"}\n").unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&seed).unwrap(),
        &["workspace.json"],
        "remote",
    )
    .unwrap();
    git_transport::push(&git2::Repository::open(&seed).unwrap()).unwrap();

    fs::write(client.join("collections.json"), "client-only\n").unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&client).unwrap(),
        &["collections.json"],
        "client",
    )
    .unwrap();
    let result =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(result.state, "synced");
    assert_eq!(
        fs::read_to_string(client.join("workspace.json")).unwrap(),
        "{\"name\":\"remote\"}\n"
    );
    assert_eq!(
        fs::read_to_string(client.join("collections.json")).unwrap(),
        "client-only\n"
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn same_file_conflict_resolves_with_merge_parent() {
    let root = temp("conflict");
    let remote = root.join("remote.git");
    fs::create_dir_all(&root).unwrap();
    git2::Repository::init_bare(&remote).unwrap();
    let (seed, _) = seed(&remote);
    let client = root.join("client");
    git_transport::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();

    fs::write(
        seed.join("environments.json"),
        "{\"environments\":[{\"name\":\"remote\"}]}\n",
    )
    .unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&seed).unwrap(),
        &["environments.json"],
        "remote",
    )
    .unwrap();
    git_transport::push(&git2::Repository::open(&seed).unwrap()).unwrap();

    fs::write(
        client.join("environments.json"),
        "{\"environments\":[{\"name\":\"mine\"}]}\n",
    )
    .unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&client).unwrap(),
        &["environments.json"],
        "mine",
    )
    .unwrap();
    let result =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(result.state, "conflicted");
    assert!(client.join(".tesapi-conflict.json").exists());
    assert!(client.join("environments.json.theirs.json").exists());
    assert!(!git2::Repository::open(&client)
        .unwrap()
        .index()
        .unwrap()
        .has_conflicts());

    assert!(git_conflict::resolve(
        &git2::Repository::open(&client).unwrap(),
        "environments.json",
        "mine"
    )
    .unwrap());
    git_transport::push(&git2::Repository::open(&client).unwrap()).unwrap();
    assert!(!client.join(".tesapi-conflict.json").exists());
    let second =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();
    assert_eq!(second.state, "synced");
    let client_repo = git2::Repository::open(&client).unwrap();
    let commit = client_repo.head().unwrap().peel_to_commit().unwrap();
    assert_eq!(commit.parent_count(), 2);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn delete_vs_edit_conflict_can_keep_local_deletion() {
    let root = temp("delete-vs-edit");
    let remote = root.join("remote.git");
    fs::create_dir_all(&root).unwrap();
    git2::Repository::init_bare(&remote).unwrap();
    let (seed, _) = seed(&remote);
    let client = root.join("client");
    git_transport::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();

    fs::write(seed.join("environments.json"), "{\"remote\":true}\n").unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&seed).unwrap(),
        &["environments.json"],
        "remote edit",
    )
    .unwrap();
    git_transport::push(&git2::Repository::open(&seed).unwrap()).unwrap();
    fs::remove_file(client.join("environments.json")).unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&client).unwrap(),
        &["environments.json"],
        "local delete",
    )
    .unwrap();

    let result =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();
    let manifest = git_conflict::load(&client).unwrap().unwrap();
    assert_eq!(result.state, "conflicted");
    assert_eq!(manifest.files[0].kind, "delete-vs-edit");
    assert!(!manifest.files[0].stages.ours && manifest.files[0].stages.theirs);
    assert!(git_conflict::resolve(
        &git2::Repository::open(&client).unwrap(),
        "environments.json",
        "mine"
    )
    .unwrap());
    assert!(!client.join("environments.json").exists());
    git_transport::push(&git2::Repository::open(&client).unwrap()).unwrap();
    assert_eq!(
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false)))
            .unwrap()
            .state,
        "synced"
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn edit_vs_delete_conflict_can_accept_remote_deletion() {
    let root = temp("edit-vs-delete");
    let remote = root.join("remote.git");
    fs::create_dir_all(&root).unwrap();
    git2::Repository::init_bare(&remote).unwrap();
    let (seed, _) = seed(&remote);
    let client = root.join("client");
    git_transport::clone_repo(remote.to_str().unwrap(), "main", &client).unwrap();

    fs::remove_file(seed.join("environments.json")).unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&seed).unwrap(),
        &["environments.json"],
        "remote delete",
    )
    .unwrap();
    git_transport::push(&git2::Repository::open(&seed).unwrap()).unwrap();
    fs::write(client.join("environments.json"), "{\"mine\":true}\n").unwrap();
    git_commit::commit_paths(
        &git2::Repository::open(&client).unwrap(),
        &["environments.json"],
        "local edit",
    )
    .unwrap();

    let result =
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false))).unwrap();
    let manifest = git_conflict::load(&client).unwrap().unwrap();
    assert_eq!(result.state, "conflicted");
    assert_eq!(manifest.files[0].kind, "edit-vs-delete");
    assert!(manifest.files[0].stages.ours && !manifest.files[0].stages.theirs);
    assert!(git_conflict::resolve(
        &git2::Repository::open(&client).unwrap(),
        "environments.json",
        "theirs"
    )
    .unwrap());
    assert!(!client.join("environments.json").exists());
    git_transport::push(&git2::Repository::open(&client).unwrap()).unwrap();
    assert_eq!(
        git_sync::sync_workspace(&client, "main", Arc::new(AtomicBool::new(false)))
            .unwrap()
            .state,
        "synced"
    );
    let _ = fs::remove_dir_all(root);
}
