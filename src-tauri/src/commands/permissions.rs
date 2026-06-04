use crate::db::get_connection;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDecision {
    pub id: String,
    pub approved: bool,
    pub remember: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingPermission {
    pub id: String,
    pub tool: String,
    pub args: String,
    pub created_at: String,
}

#[command]
pub async fn approve_permission(id: String, remember: Option<bool>) -> Result<PermissionDecision, String> {
    let conn = get_connection();
    conn.execute("DELETE FROM pending_permissions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(PermissionDecision {
        id,
        approved: true,
        remember: remember.unwrap_or(false),
    })
}

#[command]
pub async fn deny_permission(id: String) -> Result<PermissionDecision, String> {
    let conn = get_connection();
    conn.execute("DELETE FROM pending_permissions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(PermissionDecision {
        id,
        approved: false,
        remember: false,
    })
}

#[command]
pub async fn list_pending_permissions() -> Result<Vec<PendingPermission>, String> {
    let conn = get_connection();
    let mut stmt = conn
        .prepare("SELECT id, tool, args, created_at FROM pending_permissions ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PendingPermission {
                id: row.get(0)?,
                tool: row.get(1)?,
                args: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[command]
pub async fn request_permission(tool: String, args: String) -> Result<String, String> {
    let id = format!(
        "perm-{}-{:x}",
        chrono::Utc::now().timestamp_millis(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0)
    );
    let conn = get_connection();
    conn.execute(
        "INSERT INTO pending_permissions (id, tool, args) VALUES (?1, ?2, ?3)",
        params![id, tool, args],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}
