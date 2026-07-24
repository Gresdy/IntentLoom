use crate::db;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::command;

// Frontend `Prompt` (src/stores/usePromptsStore.ts) is camelCase so the
// JSON payload round-trips without manual mapping. Fields default to
// empty / false / empty when the corresponding DB column is missing or
// null, which lets the older `prompts` schema (id / name / content /
// created_at only) keep working while the migration is applied on the
// next start.

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: i64,
    pub name: String,
    pub content: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
}

fn row_to_prompt(row: &rusqlite::Row) -> rusqlite::Result<Prompt> {
    let enabled_int: i64 = row.get::<_, i64>("enabled").unwrap_or(0);
    Ok(Prompt {
        id: row.get("id")?,
        name: row.get("name")?,
        content: row.get("content")?,
        description: row.get::<_, String>("description").unwrap_or_default(),
        enabled: enabled_int != 0,
        created_at: row
            .get::<_, String>("created_at")
            .unwrap_or_else(|_| chrono::Utc::now().to_rfc3339()),
        updated_at: row.get::<_, Option<String>>("updated_at")?,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptInput {
    pub name: String,
    pub content: String,
    #[serde(default)]
    pub description: String,
}

// Wrap every synchronous rusqlite op in `spawn_blocking` so the IPC
// main thread is never blocked by a long DB write — same pattern as the
// experts / sessions commands.

#[command]
pub async fn get_prompts() -> Result<Vec<Prompt>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let conn = db::get_connection();
        let mut stmt = conn
            .prepare(
                "SELECT id, name, content, description, enabled, created_at, updated_at \
                 FROM prompts ORDER BY id DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], row_to_prompt)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        Ok::<_, String>(rows)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn create_prompt(prompt: PromptInput) -> Result<Prompt, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let name = prompt.name;
    let content = prompt.content;
    let description = prompt.description;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::get_connection();
        conn.execute(
            "INSERT INTO prompts (name, content, description, enabled, created_at, updated_at) \
             VALUES (?1, ?2, ?3, 0, ?4, ?4)",
            params![name, content, description, now],
        )
        .map_err(|e| e.to_string())?;
        let id = conn.last_insert_rowid();
        fetch_prompt_with_conn(&conn, id)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn update_prompt(id: i64, prompt: PromptInput) -> Result<Prompt, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let name = prompt.name;
    let content = prompt.content;
    let description = prompt.description;
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::get_connection();
        let updated = conn
            .execute(
                "UPDATE prompts SET name = ?1, content = ?2, description = ?3, updated_at = ?4 \
                 WHERE id = ?5",
                params![name, content, description, now, id],
            )
            .map_err(|e| e.to_string())?;
        if updated == 0 {
            return Err(format!("Prompt not found: {id}"));
        }
        fetch_prompt_with_conn(&conn, id)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn delete_prompt(id: i64) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::get_connection();
        let n = conn
            .execute("DELETE FROM prompts WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn enable_prompt(id: i64) -> Result<bool, String> {
    let now = chrono::Utc::now().to_rfc3339();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::get_connection();
        // Disable all others first so only one prompt is active at a time
        // (matches the existing UI affordance of "currently enabled").
        conn.execute(
            "UPDATE prompts SET enabled = 0, updated_at = ?1 WHERE enabled = 1",
            params![now],
        )
        .map_err(|e| e.to_string())?;
        let n = conn
            .execute(
                "UPDATE prompts SET enabled = 1, updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

#[command]
pub async fn disable_all_prompts() -> Result<bool, String> {
    let now = chrono::Utc::now().to_rfc3339();
    tauri::async_runtime::spawn_blocking(move || {
        let conn = db::get_connection();
        let n = conn
            .execute(
                "UPDATE prompts SET enabled = 0, updated_at = ?1 WHERE enabled = 1",
                params![now],
            )
            .map_err(|e| e.to_string())?;
        Ok(n > 0)
    })
    .await
    .map_err(|e| format!("join error: {e}"))?
}

fn fetch_prompt_with_conn(conn: &Connection, id: i64) -> Result<Prompt, String> {
    conn.query_row(
        "SELECT id, name, content, description, enabled, created_at, updated_at \
         FROM prompts WHERE id = ?1",
        params![id],
        row_to_prompt,
    )
    .optional()
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Prompt not found: {id}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetch_after_write_reuses_existing_connection() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE prompts (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, content TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL, updated_at TEXT
            );",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO prompts (name, content, created_at) VALUES (?1, ?2, ?3)",
            params!["Explain", "Explain clearly", "2026-07-23T00:00:00Z"],
        )
        .unwrap();
        let id = conn.last_insert_rowid();

        let prompt = fetch_prompt_with_conn(&conn, id).unwrap();
        assert_eq!(prompt.name, "Explain");
    }
}
