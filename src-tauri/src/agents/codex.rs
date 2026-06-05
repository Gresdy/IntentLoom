// Codex CLI adapter.
//
// PROTOCOL VERIFIED on 2026-06-05 against `codex --help` and
// `codex exec --help` on a real install (codex-cli 0.136.0-alpha.2).
// `codex` is a multi-command CLI; non-interactive streaming JSON runs
// through the `exec` subcommand. Relevant flags from `codex exec --help`:
//   - `exec [PROMPT]`            : non-interactive entry point.
//   - `--json`                   : "Print events to stdout as JSONL".
//   - `-m, --model <MODEL>`      : optional model override.
// We pass `exec --json <prompt>`; the resulting stdout is line-delimited
// JSON events that the existing `ai-stream-chunk` pipeline can hand to
// `src/lib/streamChunkParser.ts` (it already understands the generic
// `{type: "..."}` shape; we will need to verify Codex's exact field
// names on a real run before adding an `AgentEvent` mapping here).

use super::AgentAdapter;
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};
use std::process::Stdio;
use tokio::process::Command;

pub struct CodexAdapter;

impl AgentAdapter for CodexAdapter {
    fn id(&self) -> &'static str {
        "codex"
    }
    fn display_name(&self) -> &'static str {
        "Codex"
    }
    fn binary(&self) -> &'static str {
        "codex"
    }
    fn description(&self) -> &'static str {
        "OpenAI Codex CLI"
    }

    fn build_stream_command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("exec")
            .arg("--json")
            .arg(prompt)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }

    fn auth_state(&self) -> AuthState {
        // Codex CLI ships its credential in `~/.codex/auth.json` as
        // `{"OPENAI_API_KEY": "..."}`. The literal value `PROXY_MANAGED`
        // is a sentinel that means "the proxy is providing auth" — it
        // still counts as logged_in because the proxy is real auth from
        // Codex's POV.
        let probe = evaluate_probe(&AuthProbe::ApiKeyFile {
            path: home_path(".codex/auth.json"),
            key: "OPENAI_API_KEY",
            sentinel_values: &["PROXY_MANAGED"],
        });
        match probe.status {
            AuthStatus::LoggedIn => probe,
            // The probe returns Unknown when the file is missing; that
            // is a logged_out condition for our purposes, not unknown.
            AuthStatus::Unknown => {
                AuthState::logged_out("在 ~/.codex/auth.json 设置 OPENAI_API_KEY")
            }
            _ => probe,
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_expected_metadata() {
        let a = CodexAdapter;
        assert_eq!(a.id(), "codex");
        assert_eq!(a.binary(), "codex");
        assert!(a.supports_streaming());
    }

    #[test]
    fn build_stream_command_matches_verified_flags() {
        // Verified against `codex exec --help` on 2026-06-05.
        let cmd = CodexAdapter.build_stream_command("hello");
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "codex");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["exec", "--json", "hello"]);
    }
}
