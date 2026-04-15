use crate::db;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: i64,
    pub title: String,
    pub file_path: String,
    pub created_at: String,
}

#[command]
pub fn list_sessions() -> Result<Vec<Session>, String> {
    let conn = db::get_connection();
    let mut stmt = conn
        .prepare("SELECT id, title, file_path, created_at FROM sessions ORDER BY created_at DESC")
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

    Ok(sessions)
}

#[command]
pub fn create_session(title: String, file_path: String) -> Result<Session, String> {
    let conn = db::get_connection();

    conn.execute(
        "INSERT INTO sessions (title, file_path) VALUES (?1, ?2)",
        [&title, &file_path],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Session {
        id,
        title,
        file_path,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[command]
pub fn get_session(id: i64) -> Result<Option<Session>, String> {
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
        .ok();

    Ok(session)
}
