use std::{
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, Write},
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

fn storage_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("tesapi"))
        .map_err(|error| error.to_string())
}

pub(crate) fn resolve(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    if path
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Storage path must stay inside TesAPI app data".into());
    }
    Ok(storage_root(app)?.join(path))
}

fn sync_parent(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn atomic_write_at(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Storage file has no parent directory")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let tmp = path.with_extension(format!(
        "{}tmp",
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| format!("{value}."))
            .unwrap_or_default()
    ));
    let backup = path.with_extension(format!(
        "{}bak",
        path.extension()
            .and_then(|value| value.to_str())
            .map(|value| format!("{value}."))
            .unwrap_or_default()
    ));

    let mut file = File::create(&tmp).map_err(|error| error.to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;

    if path.exists() {
        fs::copy(path, &backup).map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "windows")]
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|error| error.to_string())?;
    sync_parent(path)
}

#[tauri::command]
pub fn ensure_dirs(app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    for relative in paths {
        fs::create_dir_all(resolve(&app, &relative)?).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_json(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let path = resolve(&app, &path)?;
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn atomic_write_json(app: AppHandle, path: String, contents: String) -> Result<(), String> {
    atomic_write_at(&resolve(&app, &path)?, &contents)
}

#[tauri::command]
pub fn append_line(app: AppHandle, path: String, line: String) -> Result<(), String> {
    let path = resolve(&app, &path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{line}").map_err(|error| error.to_string())?;
    file.sync_data().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_last_lines(app: AppHandle, path: String, count: usize) -> Result<Vec<String>, String> {
    let path = resolve(&app, &path)?;
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut lines: Vec<String> = BufReader::new(file)
        .lines()
        .collect::<Result<_, _>>()
        .map_err(|error| error.to_string())?;
    if lines.len() > count {
        lines.drain(0..lines.len() - count);
    }
    Ok(lines)
}

#[tauri::command]
pub fn list_dir(app: AppHandle, path: String) -> Result<Vec<String>, String> {
    let path = resolve(&app, &path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut names = fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect::<Vec<_>>();
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn delete_file(app: AppHandle, path: String) -> Result<(), String> {
    let path = resolve(&app, &path)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    quarantined_path: String,
    backup: Option<String>,
}

#[tauri::command]
pub fn quarantine_file(app: AppHandle, path: String) -> Result<RecoveryResult, String> {
    let target = resolve(&app, &path)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let quarantine = PathBuf::from(format!("{}.corrupt-{timestamp}", target.display()));
    if target.exists() {
        fs::rename(&target, &quarantine).map_err(|error| error.to_string())?;
    }
    let backup_path = target.with_extension(format!(
        "{}bak",
        target
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!("{value}."))
            .unwrap_or_default()
    ));
    let backup = fs::read_to_string(backup_path).ok();
    Ok(RecoveryResult {
        quarantined_path: quarantine.to_string_lossy().into_owned(),
        backup,
    })
}

#[cfg(test)]
mod tests {
    use super::atomic_write_at;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_dir(name: &str) -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("tesapi-{name}-{stamp}"))
    }

    #[test]
    fn atomic_write_keeps_backup_and_ignores_stale_tmp() {
        let dir = test_dir("atomic");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("collection.json");
        fs::write(&path, "old").unwrap();
        fs::write(dir.join("collection.json.tmp"), "partial").unwrap();

        atomic_write_at(&path, "new").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(
            fs::read_to_string(dir.join("collection.json.bak")).unwrap(),
            "old"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
