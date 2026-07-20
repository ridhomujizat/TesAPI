use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{mpsc, Mutex},
    time::Duration,
};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{Emitter, WebviewWindow};

struct WatchHandle {
    _watcher: RecommendedWatcher,
}

#[derive(Default)]
pub struct WorkspaceWatchState(Mutex<HashMap<String, WatchHandle>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFilesChanged {
    paths: Vec<String>,
}

fn relative_path(root: &Path, path: &Path) -> Option<String> {
    if path.is_dir() {
        return None;
    }
    let relative = path
        .strip_prefix(root)
        .ok()?
        .to_string_lossy()
        .replace('\\', "/");
    if relative == ".git"
        || relative.starts_with(".git/")
        || relative == "history.ndjson"
        || relative.starts_with("history.ndjson.")
        || relative == "session.json"
        || relative.starts_with("session.json.")
        || relative.ends_with(".local.json")
        || relative.ends_with(".bak")
        || relative.contains(".corrupt-")
    {
        return None;
    }
    // Directory removal events no longer have an on-disk path; ignore those
    // extensionless paths while retaining the workspace's `.gitignore` file.
    if Path::new(&relative).extension().is_none() && relative != ".gitignore" {
        return None;
    }
    Some(relative)
}

fn event_paths(root: &Path, event: Event) -> Vec<String> {
    event
        .paths
        .iter()
        .filter_map(|path| relative_path(root, path))
        .collect()
}

#[tauri::command]
pub fn watch_workspace(
    window: WebviewWindow,
    root_path: String,
    state: tauri::State<'_, WorkspaceWatchState>,
) -> Result<(), String> {
    let root = PathBuf::from(root_path);
    let (sender, receiver) = mpsc::channel::<Vec<String>>();
    let callback_root = root.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result| {
            if let Ok(event) = result {
                let paths = event_paths(&callback_root, event);
                if !paths.is_empty() {
                    let _ = sender.send(paths);
                }
            }
        },
        Config::default(),
    )
    .map_err(|error| error.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    let event_window = window.clone();
    std::thread::spawn(move || {
        while let Ok(first) = receiver.recv() {
            let mut paths = first.into_iter().collect::<HashSet<_>>();
            while let Ok(next) = receiver.recv_timeout(Duration::from_millis(300)) {
                paths.extend(next);
            }
            let mut paths = paths.into_iter().collect::<Vec<_>>();
            paths.sort();
            let _ = event_window.emit("workspace-files-changed", WorkspaceFilesChanged { paths });
        }
    });

    state
        .0
        .lock()
        .map_err(|_| "Workspace watcher lock poisoned".to_string())?
        .insert(window.label().to_owned(), WatchHandle { _watcher: watcher });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::relative_path;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn ignores_directory_and_extensionless_events() {
        let root = std::env::temp_dir().join(format!(
            "tesapi-watch-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("collections")).unwrap();
        assert!(relative_path(&root, &root.join("collections")).is_none());
        assert!(relative_path(&root, &root.join("removed-folder")).is_none());
        assert_eq!(
            relative_path(&root, &root.join(".gitignore")).as_deref(),
            Some(".gitignore")
        );
        let _ = fs::remove_dir_all(root);
    }
}
