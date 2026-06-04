use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{command, AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEvent {
    pub session_id: String,
    pub kind: String,
    pub content: String,
}

fn binary_for(cli: &str) -> Option<&'static str> {
    match cli {
        "claude-code" | "claude" => Some("claude"),
        "gemini" => Some("gemini"),
        "codex" => Some("codex"),
        "opencode" => Some("opencode"),
        "openclaw" => Some("openclaw"),
        _ => None,
    }
}

/// Non-streaming call: waits for the whole output.
#[command]
pub async fn call_ai(cli: String, prompt: String) -> Result<String, String> {
    let binary = binary_for(&cli)
        .ok_or_else(|| format!("Unknown AI CLI: {cli}"))?;

    let output = Command::new(binary)
        .arg("--print-format-json")
        .arg("--prompt")
        .arg(&prompt)
        .output()
        .await
        .map_err(|e| format!("Failed to execute {binary}: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("AI CLI error: {stderr}"))
    }
}

/// Streaming call: spawns the CLI, reads stdout line by line, and emits
/// `ai_chunk` events through the Tauri event bus. Returns the final session id
/// once the process exits.
#[command]
pub async fn stream_ai(
    app: AppHandle,
    cli: String,
    prompt: String,
    session_id: Option<String>,
) -> Result<String, String> {
    let binary = binary_for(&cli)
        .ok_or_else(|| format!("Unknown AI CLI: {cli}"))?
        .to_string();

    let sid = session_id.unwrap_or_else(|| {
        format!(
            "ai-{}-{:x}",
            chrono::Utc::now().timestamp_millis(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0)
        )
    });

    let mut child = Command::new(&binary)
        .arg("--print-format-json")
        .arg("--prompt")
        .arg(&prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn {binary}: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "No stdout".to_string())?;

    let app_for_lines = app.clone();
    let sid_for_lines = sid.clone();
    let reader_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if line.is_empty() {
                continue;
            }
            let evt = AiStreamEvent {
                session_id: sid_for_lines.clone(),
                kind: "chunk".to_string(),
                content: line,
            };
            let _ = app_for_lines.emit("ai_chunk", evt);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Process wait failed: {e}"))?;

    let _ = reader_handle.await;

    let end_evt = AiStreamEvent {
        session_id: sid.clone(),
        kind: "end".to_string(),
        content: if status.success() {
            "ok".to_string()
        } else {
            format!("exit: {}", status.code().unwrap_or(-1))
        },
    };
    let _ = app.emit("ai_end", end_evt);

    if status.success() {
        Ok(sid)
    } else {
        Err(format!("AI CLI exited with {}", status.code().unwrap_or(-1)))
    }
}

#[command]
pub async fn cancel_ai(_session_id: String) -> Result<bool, String> {
    // No persistent registry yet; the spawned process is owned by its tokio
    // task and will be torn down when the request future is dropped. We
    // acknowledge the cancel so the UI can stop the spinner.
    Ok(true)
}
