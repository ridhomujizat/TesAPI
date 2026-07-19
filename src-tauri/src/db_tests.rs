use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::Connection;

use crate::db::{configure, migrate_json};

fn temp(name: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "tesapi-phase5-{name}-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ))
}

#[test]
fn migrates_legacy_registry_once_and_sets_version() {
    let root = temp("migration");
    fs::create_dir_all(root.join("workspaces/one")).unwrap();
    fs::write(root.join("workspaces.json"), r#"{"activeWorkspaceId":"one","workspaces":[{"id":"one","name":"Legacy","storage":{"type":"local"}}]}"#).unwrap();
    let connection = Connection::open(root.join("app.db")).unwrap();
    configure(&connection).unwrap();
    migrate_json(&connection, &root).unwrap();
    migrate_json(&connection, &root).unwrap();
    assert_eq!(
        connection
            .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert_eq!(
        connection
            .query_row("SELECT COUNT(*) FROM workspaces", [], |row| row
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
    assert!(root.join("workspaces.json.migrated").exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn two_connections_write_with_wal() {
    let root = temp("wal");
    fs::create_dir_all(&root).unwrap();
    let path = root.join("app.db");
    let one = Connection::open(&path).unwrap();
    let two = Connection::open(&path).unwrap();
    configure(&one).unwrap();
    configure(&two).unwrap();
    one.execute("INSERT INTO settings VALUES ('one','1')", [])
        .unwrap();
    two.execute("INSERT INTO settings VALUES ('two','2')", [])
        .unwrap();
    assert_eq!(
        one.query_row("SELECT COUNT(*) FROM settings", [], |row| row
            .get::<_, i64>(0))
            .unwrap(),
        2
    );
    let _ = fs::remove_dir_all(root);
}
