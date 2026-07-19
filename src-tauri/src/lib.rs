mod http;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            http::send_request,
            storage::ensure_dirs,
            storage::read_json,
            storage::atomic_write_json,
            storage::append_line,
            storage::read_last_lines,
            storage::list_dir,
            storage::list_collection_summaries,
            storage::delete_file,
            storage::quarantine_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
