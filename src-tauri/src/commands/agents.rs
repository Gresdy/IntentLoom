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
}

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
    let candidates: Vec<(&str, &str, &str, &str)> = vec![
        ("claude", "claude", "Claude Code", "Anthropic 出品的代码助手 CLI"),
        ("gemini", "gemini", "Gemini CLI", "Google Gemini 命令行客户端"),
        ("codex", "codex", "Codex", "OpenAI Codex CLI"),
        ("opencode", "opencode", "OpenCode", "开源 AI 编程助手"),
        ("openclaw", "openclaw", "OpenClaw", "OpenClaw 自定义代理"),
    ];

    let mut agents = Vec::new();
    for (id, bin, display, desc) in candidates {
        let path = which(bin);
        agents.push(AgentInfo {
            id: id.to_string(),
            name: bin.to_string(),
            display_name: display.to_string(),
            available: path.is_some(),
            path,
            version: None,
            supports_streaming: true,
            description: desc.to_string(),
        });
    }
    Ok(agents)
}

static CURRENT_AGENT_IDX: AtomicUsize = AtomicUsize::new(0);

#[command]
pub async fn switch_agent(agent_id: String) -> Result<String, String> {
    let agents = list_agents().await?;
    let idx = agents.iter().position(|a| a.id == agent_id);
    match idx {
        Some(i) => {
            CURRENT_AGENT_IDX.store(i, Ordering::SeqCst);
            Ok(agent_id)
        }
        None => Err(format!("Unknown agent: {agent_id}")),
    }
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
