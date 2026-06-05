//! Hermes Agent adapter — peer of Claude / Codex / Gemini / OpenCode /
//! OpenClaw. Verified on 2026-06-05 against `hermes --help`,
//! `hermes chat --help`, and `hermes version` on a real install
//! (Hermes Agent v0.10.0, Python 3.13.12).
//!
//! `hermes chat` is the entry point for a single agent turn. The two
//! flags that matter for our use case are:
//!   - `-q, --query <text>` : non-interactive, single-query mode.
//!                             The CLI runs the turn to completion and
//!                             exits; we do not need to feed stdin.
//!   - `-Q, --quiet`        : programmatic output mode. Suppresses the
//!                             banner, spinner, and tool previews so the
//!                             stdout we read is (a) the `session_id:`
//!                             line and (b) the final response, with
//!                             no live TTY noise in between.
//!
//! The wire format is plain text — there is no stream-json variant
//! yet. The first chunk emitted on stdout is `session_id: <id>`, then
//! an empty line, then the final response (or, on failure, a friendly
//! `🔐 ... 401 — authentication failed.` block). The frontend
//! `parseStreamChunk` already has a generic plain-text fallback, so
//! each line gets rendered as part of the assistant message; we
//! deliberately do not try to strip the `session_id:` line on the
//! backend (filtering belongs in the chat transcript, not in the
//! adapter, since other consumers may want to recover the id).
//!
//! `--pass-session-id` would inject the id into the system prompt;
//! not enabled today because IntentLoom already keys conversations by
//! its own `conversation_id` and passes the full prompt per call.

use super::AgentAdapter;
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};
use std::process::Stdio;
use tokio::process::Command;

pub struct HermesAdapter;

impl AgentAdapter for HermesAdapter {
    fn id(&self) -> &'static str {
        "hermes"
    }
    fn display_name(&self) -> &'static str {
        "Hermes"
    }
    fn binary(&self) -> &'static str {
        "hermes"
    }
    fn description(&self) -> &'static str {
        "本地多 provider 统一 agent(支持 20+ 推理后端)"
    }

    fn build_stream_command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("chat")
            .arg("-q")
            .arg(prompt)
            .arg("-Q")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }

    fn auth_state(&self) -> AuthState {
        // Hermes stores pooled credentials in
        // `~/.hermes/auth.json` under the `credential_pool` key. The
        // `auth.login` subcommand can also complete an OAuth dance for
        // any of the 20+ providers Hermes supports; if the pool is
        // empty we report `Unknown` rather than `LoggedOut` because
        // there is no single "login" command — it is `hermes login
        // <provider>` — and we don't want to prescribe a specific
        // provider here.
        let probe = evaluate_probe(&AuthProbe::JsonPath {
            path: home_path(".hermes/auth.json"),
            dotted_path: "credential_pool",
        });
        if probe.status == AuthStatus::LoggedIn {
            return probe;
        }
        AuthState::unknown_with_hint("运行 `hermes login <provider>` 登录(20+ provider 可选)")
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_expected_metadata() {
        let a = HermesAdapter;
        assert_eq!(a.id(), "hermes");
        assert_eq!(a.binary(), "hermes");
        assert!(a.supports_streaming());
        assert!(!a.description().is_empty());
    }

    #[test]
    fn build_stream_command_matches_verified_flags() {
        // Verified against `hermes chat --help` on 2026-06-05.
        let cmd = HermesAdapter.build_stream_command("hi");
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "hermes");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["chat", "-q", "hi", "-Q"]);
    }
}
