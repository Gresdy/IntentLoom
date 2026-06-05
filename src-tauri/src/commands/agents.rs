use crate::agents;
use crate::agents::AuthState;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::command;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub supports_streaming: bool,
    pub description: String,
    /// Per-adapter auth state (logged in / logged out / unknown / not
    /// required). The hint is surfaced next to the chip in the Agents
    /// panel and tells the user what command to run when credentials
    /// are missing.
    pub auth: AuthState,
}

#[allow(dead_code)]
fn which(bin: &str) -> Option<String> {
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = std::path::Path::new(dir).join(bin);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

#[command]
pub async fn list_agents() -> Result<Vec<AgentInfo>, String> {
    let adapters = agents::all_adapters();
    let mut out = Vec::with_capacity(adapters.len());
    for a in adapters {
        let path = if a.check_available() {
            agents::which(a.binary())
        } else {
            None
        };
        out.push(AgentInfo {
            id: a.id().to_string(),
            name: a.binary().to_string(),
            display_name: a.display_name().to_string(),
            available: path.is_some(),
            path,
            version: a.version(),
            supports_streaming: a.supports_streaming(),
            description: a.description().to_string(),
            auth: a.auth_state(),
        });
    }
    Ok(out)
}

static CURRENT_AGENT_IDX: AtomicUsize = AtomicUsize::new(0);

/// Deprecated no-op kept for backwards compatibility with the old
/// `invoke("switch_agent", { agentId })` callers. The active route is
/// decided on the frontend via `useModelStore.currentApp` and passed to
/// `send_chat_message` as the `cli` parameter on every request. This
/// command is safe to call but no longer affects which CLI runs.
#[command]
pub async fn switch_agent(agent_id: String) -> Result<String, String> {
    tracing::warn!(
        agent_id = %agent_id,
        "switch_agent is deprecated; route is decided by cli param on send_chat_message"
    );
    Ok(agent_id)
}

#[command]
pub async fn current_agent() -> Result<String, String> {
    let agents = list_agents().await?;
    let idx = CURRENT_AGENT_IDX.load(Ordering::SeqCst);
    Ok(agents
        .get(idx)
        .map(|a| a.id.clone())
        .unwrap_or_else(|| "claude".to_string()))
}
