use std::fs;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::storage;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    id: String,
    name: String,
    request_count: usize,
    folder_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummaryRecord {
    file_name: String,
    summary: Option<CollectionSummary>,
}

fn count_tree(nodes: &[Value]) -> (usize, usize) {
    nodes.iter().fold((0, 0), |(requests, folders), node| {
        if node.get("type").and_then(Value::as_str) == Some("folder") {
            let (child_requests, child_folders) = node
                .get("children")
                .and_then(Value::as_array)
                .map(|children| count_tree(children))
                .unwrap_or_default();
            (requests + child_requests, folders + child_folders + 1)
        } else {
            (requests + 1, folders)
        }
    })
}

fn summarize_collection(contents: &str) -> Option<CollectionSummary> {
    let value: Value = serde_json::from_str(contents).ok()?;
    let root = value.get("root")?.as_array()?;
    let (request_count, folder_count) = count_tree(root);
    Some(CollectionSummary {
        id: value.get("id")?.as_str()?.to_owned(),
        name: value.get("name")?.as_str()?.to_owned(),
        request_count,
        folder_count,
    })
}

#[tauri::command]
pub fn list_collection_summaries(
    app: AppHandle,
    path: String,
) -> Result<Vec<CollectionSummaryRecord>, String> {
    let directory = storage::resolve(&app, &path)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut records = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let Some(file_name) = entry.file_name().into_string().ok() else {
            continue;
        };
        if !file_name.ends_with(".json") {
            continue;
        }
        let summary = fs::read_to_string(entry.path())
            .ok()
            .and_then(|contents| summarize_collection(&contents));
        records.push(CollectionSummaryRecord { file_name, summary });
    }
    records.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::summarize_collection;

    #[test]
    fn summarizes_nested_collection() {
        let summary = summarize_collection(
            r#"{"id":"c","name":"API","root":[{"type":"folder","children":[{"type":"request"}]}]}"#,
        )
        .unwrap();
        assert_eq!(
            (summary.id, summary.request_count, summary.folder_count),
            ("c".into(), 1, 1)
        );
    }
}
