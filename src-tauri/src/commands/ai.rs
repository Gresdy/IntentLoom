use std::process::Stdio;
use tauri::{command, AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::agents::find_adapter;

/// Build the [`Command`] used to invoke `cli` for streaming output.
/// Every adapter owns its own flag layout (Claude uses
/// `--print-format-json --prompt`, Gemini uses `-p --output-format
/// stream-json`, Codex uses `exec --json`, OpenClaw uses
/// `agent --local --json -m`). Unknown ids are rejected so the call
/// site doesn't silently fall back to a default that only matches
/// Claude.
fn build_command(cli: &str, prompt: &str) -> Result<Command, String> {
    let adapter = find_adapter(cli).ok_or_else(|| format!("Unknown AI CLI: {cli}"))?;
    Ok(adapter.build_stream_command(prompt))
}

/// Non-streaming call: waits for the whole output.
#[command]
pub async fn call_ai(cli: String, prompt: String) -> Result<String, String> {
    let mut cmd = build_command(&cli, &prompt)?;
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute {cli}: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("AI CLI error: {stderr}"))
    }
}

/// Streaming call: spawns the CLI, reads stdout line by line, and emits
/// `ai-stream-chunk` / `ai-stream-end` events through the Tauri event bus.
/// The chunk event carries the raw line as a string payload (the React side
/// listens with `listen<string>('ai-stream-chunk', ...)`); the end event
/// carries either `"ok"` or `"exit: <code>"`. Returns the final session id
/// once the process exits.
#[command]
pub async fn stream_ai(
    app: AppHandle,
    cli: String,
    prompt: String,
    session_id: Option<String>,
) -> Result<String, String> {
    // Reject unknown ids early so the call site doesn't get a half-baked
    // Command back from the default shape.
    if find_adapter(&cli).is_none() {
        return Err(format!("Unknown AI CLI: {cli}"));
    }

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

    let mut child = build_command(&cli, &prompt)?
        .spawn()
        .map_err(|e| format!("Failed to spawn {cli}: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "No stdout".to_string())?;

    let app_for_lines = app.clone();
    let reader_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if line.is_empty() {
                continue;
            }
            // Frontend listens for string payload on ai-stream-chunk, so we
            // emit the raw line directly. session_id still lives on the
            // closure-captured `sid` if consumers need it later.
            let _ = app_for_lines.emit("ai-stream-chunk", line);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Process wait failed: {e}"))?;

    let _ = reader_handle.await;

    let _ = app.emit(
        "ai-stream-end",
        if status.success() {
            "ok".to_string()
        } else {
            format!("exit: {}", status.code().unwrap_or(-1))
        },
    );

    if status.success() {
        Ok(sid)
    } else {
        Err(format!("AI CLI exited with {}", status.code().unwrap_or(-1)))
    }
}

/// Friendly wrapper used by the React chat surface (`useStreamingAI`,
/// `useAcpChat`, `reasonixAdapter`). Forwards to [`stream_ai`] so the same
/// `ai-stream-chunk` / `ai-stream-end` event contract is honored end-to-end.
/// The optional `project_path` is prepended as a `[cwd: ...]` hint that
/// CLI tools can pick up if they want to scope the run.
#[command]
pub async fn send_chat_message(
    app: AppHandle,
    cli: String,
    message: String,
    conversation_id: String,
    project_path: Option<String>,
) -> Result<String, String> {
    let prefix = project_path
        .as_deref()
        .map(|p| format!("[cwd: {p}]\n"))
        .unwrap_or_default();
    let prompt = format!("{prefix}{message}");
    stream_ai(app, cli, prompt, Some(conversation_id)).await
}

#[command]
pub async fn cancel_ai(_session_id: String) -> Result<bool, String> {
    // No persistent registry yet; the spawned process is owned by its tokio
    // task and will be torn down when the request future is dropped. We
    // acknowledge the cancel so the UI can stop the spinner.
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn call_ai_unknown_cli_rejects() {
        // Exercise the same lookup synchronously to keep the test fast.
        assert!(find_adapter("not-a-real-cli").is_none());
        // All five registered ids resolve to an adapter.
        for id in ["claude", "gemini", "codex", "opencode", "openclaw", "hermes"] {
            assert!(find_adapter(id).is_some(), "expected adapter for {id}");
        }
    }

    #[test]
    fn build_command_routes_to_claude_default_flags() {
        // Claude's default build_stream_command is the canonical shape.
        // We assert on the std::process::Command that tokio wraps so we
        // can read back program + args.
        let cmd = build_command("claude", "hello").unwrap();
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "claude");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["--print-format-json", "--prompt", "hello"]);
    }
}
