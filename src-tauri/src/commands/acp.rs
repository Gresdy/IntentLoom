use crate::db::get_connection;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::command;

static ACP_SEQ: AtomicUsize = AtomicUsize::new(1);

fn next_session_id() -> String {
    let n = ACP_SEQ.fetch_add(1, Ordering::SeqCst);
    format!(
        "acp-{}-{:x}",
        n,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0)
    )
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpConnectRequest {
    pub provider: String,
    pub workspace: String,
    pub cli_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpConnectResponse {
    pub session_id: String,
    pub success: bool,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AcpSession {
    pub session_id: String,
    pub provider: String,
    pub workspace: String,
    pub cli_path: Option<String>,
    pub created_at: String,
}

#[command]
pub async fn acp_connect(request: AcpConnectRequest) -> Result<AcpConnectResponse, String> {
    let session_id = next_session_id();
    let conn = get_connection();
    conn.execute(
        "INSERT INTO acp_sessions (session_id, provider, workspace, cli_path) VALUES (?1, ?2, ?3, ?4)",
        params![session_id, request.provider, request.workspace, request.cli_path],
    )
    .map_err(|e| e.to_string())?;
    Ok(AcpConnectResponse {
        session_id,
        success: true,
        message: format!("Connected to {} in {}", request.provider, request.workspace),
    })
}

#[command]
pub async fn acp_disconnect(session_id: Option<String>) -> Result<bool, String> {
    let conn = get_connection();
    let removed = match session_id {
        Some(sid) => conn
            .execute("DELETE FROM acp_sessions WHERE session_id = ?1", params![sid])
            .map(|n| n > 0)
            .unwrap_or(false),
        None => conn
            .execute("DELETE FROM acp_sessions", [])
            .map(|n| n > 0)
            .unwrap_or(false),
    };
    Ok(removed)
}

#[command]
pub async fn acp_send_prompt(_session_id: String, _prompt: String) -> Result<String, String> {
    Ok("ack".to_string())
}

#[command]
pub async fn acp_list_sessions() -> Result<Vec<AcpSession>, String> {
    let conn = get_connection();
    let mut stmt = conn
        .prepare("SELECT session_id, provider, workspace, cli_path, created_at FROM acp_sessions ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AcpSession {
                session_id: row.get(0)?,
                provider: row.get(1)?,
                workspace: row.get(2)?,
                cli_path: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
