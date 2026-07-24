use crate::db;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: i64,
    pub title: String,
    pub file_path: String,
    pub created_at: String,
}

// All three handlers used to be `pub fn` (synchronous). Tauri runs sync
// commands on the main thread, so a busy / hung `db::get_connection()`
// lock would freeze the entire UI — that's why clicking 会话管理
// spun forever and then the whole app stalled. Wrapping the synchronous
// rusqlite work inside `tauri::async_runtime::spawn_blocking` keeps the
// DB op off the IPC thread and lets the panel paint its loading state.
#[command]
pub async fn list_sessions() -> Result<Vec<Session>, String> {
    tauri::async_runtime::spawn_blocking(|| {
    let conn = db::get_connection();
    let mut stmt = conn
            .prepare(
                "SELECT id, title, file_path, created_at FROM sessions ORDER BY created_at DESC",
            )
        .map_err(|e| e.to_string())?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

        Ok::<_, String>(sessions)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn create_session(title: String, file_path: String) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let conn = db::get_connection();

    conn.execute(
        "INSERT INTO sessions (title, file_path) VALUES (?1, ?2)",
        [&title, &file_path],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

        Ok::<_, String>(Session {
        id,
        title,
        file_path,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn get_session(id: i64) -> Result<Option<Session>, String> {
    tauri::async_runtime::spawn_blocking(move || {
    let conn = db::get_connection();
    let mut stmt = conn
        .prepare("SELECT id, title, file_path, created_at FROM sessions WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let session = stmt
        .query_row([id], |row| {
            Ok(Session {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
            .optional()
            .map_err(|error| error.to_string())?;

        Ok::<_, String>(session)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}
