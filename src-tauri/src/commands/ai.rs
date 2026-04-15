use tauri::command;

#[command]
pub async fn call_ai(cli: String, prompt: String) -> Result<String, String> {
    let binary = match cli.as_str() {
        "claude-code" => "claude",
        "gemini" => "gemini",
        "codex" => "codex",
        "opencode" => "opencode",
        "openclaw" => "openclaw",
        _ => return Err(format!("Unknown AI CLI: {}", cli)),
    };

    let output = tokio::process::Command::new(binary)
        .arg("--print-format-json")
        .arg("--prompt")
        .arg(&prompt)
        .output()
        .await
        .map_err(|e| format!("Failed to execute {}: {}", binary, e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("AI CLI error: {}", stderr))
    }
}
