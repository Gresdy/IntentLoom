// Gemini CLI adapter.
//
// PROTOCOL VERIFIED on 2026-06-05 against `gemini --help` on a real install.
// `gemini --help` shows:
//   - `-p, --prompt <text>`  : non-interactive (headless) mode with the
//                              given prompt appended to stdin input.
//   - `--output-format <text|json|stream-json>` : "stream-json" is the
//                              streaming output we want for our event bus.
// We pass the prompt as `-p` (not `--print-format-json`) and request
// stream-json explicitly. Streaming JSON normalization is still funnelled
// through `commands::ai::stream_ai` and `src/lib/streamChunkParser.ts` on
// the frontend; once the wire format is parsed on a real run, the
// per-adapter `AgentEvent` mapping will land here.

use super::AgentAdapter;
use super::AuthState;
use std::process::Stdio;
use tokio::process::Command;

pub struct GeminiAdapter;

impl AgentAdapter for GeminiAdapter {
    fn id(&self) -> &'static str {
        "gemini"
    }
    fn display_name(&self) -> &'static str {
        "Gemini CLI"
    }
    fn binary(&self) -> &'static str {
        "gemini"
    }
    fn description(&self) -> &'static str {
        "Google Gemini command-line client"
    }

    fn build_stream_command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("-p")
            .arg(prompt)
            .arg("--output-format")
            .arg("stream-json")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }

    fn auth_state(&self) -> AuthState {
        // Gemini CLI takes its API key from `GEMINI_API_KEY` (canonical)
        // or `GOOGLE_API_KEY` (legacy / Vertex env-var alias). Either
        // non-empty value authenticates the binary.
        for name in ["GEMINI_API_KEY", "GOOGLE_API_KEY"] {
            if let Ok(v) = std::env::var(name) {
                if !v.is_empty() {
                    return AuthState::logged_in();
                }
            }
        }
        AuthState::logged_out("设置环境变量 GEMINI_API_KEY 或 GOOGLE_API_KEY")
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_expected_metadata() {
        let a = GeminiAdapter;
        assert_eq!(a.id(), "gemini");
        assert_eq!(a.binary(), "gemini");
        assert!(a.supports_streaming());
    }

    #[test]
    fn build_stream_command_matches_verified_flags() {
        // Verified against `gemini --help` on 2026-06-05.
        let cmd = GeminiAdapter.build_stream_command("hello");
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "gemini");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["-p", "hello", "--output-format", "stream-json"]);
    }
}
