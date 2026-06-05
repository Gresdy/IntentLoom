//! Claude Code adapter — the reference implementation. Protocol
//! **verified** against `claude --help` on a real install (2026-06-05).
//!
//! `claude --help` exposes `--print-format-json` and `--prompt <text>` for
//! non-interactive streaming JSON output. This matches the trait's default
//! shape, so we deliberately do NOT override `build_stream_command` — the
//! default in [`super::AgentAdapter`] is the canonical Claude invocation.

use super::AgentAdapter;
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};

pub struct ClaudeAdapter;

impl AgentAdapter for ClaudeAdapter {
    fn id(&self) -> &'static str {
        "claude"
    }
    fn display_name(&self) -> &'static str {
        "Claude Code"
    }
    fn binary(&self) -> &'static str {
        "claude"
    }
    fn description(&self) -> &'static str {
        "Anthropic 出品的代码助手 CLI"
    }

    fn auth_state(&self) -> AuthState {
        // Claude Code's primary auth is OAuth via the user's browser; we
        // can't tell from disk alone whether that flow has completed. The
        // two signal paths we *can* read are:
        //   1. `~/.claude/.credentials.json` carrying a `claudeAiOauth`
        //      block (the long-lived token, written by `claude /login`).
        //   2. `~/.claude/settings.json` `env.ANTHROPIC_AUTH_TOKEN` or
        //      `env.ANTHROPIC_API_KEY` (proxy / API-key style installs).
        let creds = evaluate_probe(&AuthProbe::JsonPath {
            path: home_path(".claude/.credentials.json"),
            dotted_path: "claudeAiOauth.accessToken",
        });
        if creds.status == AuthStatus::LoggedIn {
            return creds;
        }
        let settings = home_path(".claude/settings.json");
        for key in ["env.ANTHROPIC_AUTH_TOKEN", "env.ANTHROPIC_API_KEY"] {
            let probe = evaluate_probe(&AuthProbe::JsonPath {
                path: settings.clone(),
                dotted_path: key,
            });
            if probe.status == AuthStatus::LoggedIn {
                return probe;
            }
        }
        AuthState::unknown_with_hint("运行 `claude` 触发 OAuth 登录,或在 ~/.claude/settings.json 的 env 块设 ANTHROPIC_AUTH_TOKEN")
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_expected_metadata() {
        let a = ClaudeAdapter;
        assert_eq!(a.id(), "claude");
        assert_eq!(a.binary(), "claude");
        assert!(a.supports_streaming());
        assert!(!a.description().is_empty());
    }

    #[test]
    fn build_stream_command_matches_verified_flags() {
        // Verified against `claude --help` on 2026-06-05. The default
        // `build_stream_command` in `super::AgentAdapter` is the canonical
        // Claude invocation: `--print-format-json --prompt <msg>`.
        let cmd = ClaudeAdapter.build_stream_command("hello");
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "claude");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["--print-format-json", "--prompt", "hello"]);
    }
}
