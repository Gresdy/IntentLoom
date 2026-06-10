//! Claude Code adapter — the reference implementation. Protocol
//! **verified** against `claude --help` on a real install (2026-06-08,
//! Claude Code v2.1.143).
//!
//! `claude --help` exposes:
//!   * `-p, --print` + `--output-format stream-json` + `--verbose` —
//!     non-interactive per-event JSON line stream (the front-end
//!     `parseStreamChunk` consumes each line as one event).
//!     `--output-format stream-json` requires `--verbose`; without
//!     it Claude falls back to a single-result JSON dump.
//!   * `--permission-mode <default|plan|acceptEdits|dontAsk|bypassPermissions>`
//!     — controls how file-editing / shell tools are approved. We honor
//!     `StreamOptions::mode` and emit the flag verbatim; `"default"` is a
//!     no-op the CLI accepts, so the frontend is free to send the
//!     resolved default through unchanged.
//!   * `--effort <low|medium|high|xhigh|max>` — maps to
//!     `StreamOptions::reasoning`.

use super::AgentAdapter;
use super::StreamOptions;
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};
use std::process::Stdio;
use tokio::process::Command;

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

    fn build_stream_command(&self, prompt: &str, opts: &StreamOptions) -> Command {
        // Verified against `claude --help` on 2026-06-08
        // against Claude Code v2.1.143. The non-interactive
        // streaming shape is:
        //
        //   claude -p "<prompt>" \
        //         --output-format stream-json \
        //         --verbose
        //
        // `--output-format stream-json` requires `--verbose`
        // (without it Claude falls back to a single-result
        // JSON dump, NOT the per-event line stream the
        // front-end `parseStreamChunk` expects). Permission
        // and effort flags stay verbatim from the earlier
        // verification pass — those names did not change.
        //
        // We deliberately do NOT pass `--include-partial-messages`
        // because the front-end `parseStreamChunk` already
        // handles the full-message-per-line shape; partial
        // deltas would just add round-trip overhead. A future
        // Phase can opt into deltas if the UI needs to paint
        // text before the model finishes the block.
        let mut cmd = Command::new(self.binary());
        cmd.arg("-p")
            .arg(prompt)
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // `--permission-mode <default|plan|acceptEdits|dontAsk|bypassPermissions>`
        if let Some(mode) = opts.mode.as_deref() {
            if !mode.is_empty() {
                cmd.arg("--permission-mode").arg(mode);
            }
        }
        // `--effort <low|medium|high|xhigh|max>`
        if let Some(effort) = opts.reasoning.as_deref() {
            if !effort.is_empty() {
                cmd.arg("--effort").arg(effort);
            }
        }
        cmd
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
        // Verified against `claude --help` on 2026-06-08 against
        // Claude Code v2.1.143. The non-interactive streaming
        // invocation is `-p <prompt> --output-format stream-json
        // --verbose`; without `--verbose` Claude refuses to emit
        // per-event lines and falls back to a single JSON result.
        let cmd = ClaudeAdapter.build_stream_command("hello", &StreamOptions::default());
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "claude");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(
            args,
            vec!["-p", "hello", "--output-format", "stream-json", "--verbose"]
        );
    }

    #[test]
    fn build_stream_command_emits_permission_mode_flag() {
        let opts = StreamOptions {
            mode: Some("plan".to_string()),
            reasoning: None,
            ..StreamOptions::default()
        };
        let cmd = ClaudeAdapter.build_stream_command("hi", &opts);
        let args: Vec<&str> = cmd
            .as_std()
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert!(args.contains(&"--permission-mode"), "missing flag in {args:?}");
        assert!(args.contains(&"plan"), "missing value in {args:?}");
        // Prompt is somewhere in argv (not necessarily last when options
        // are present, since the mode flag is appended after the base).
        assert!(args.contains(&"hi"), "prompt missing in {args:?}");
    }

    #[test]
    fn build_stream_command_emits_effort_flag() {
        let opts = StreamOptions {
            mode: None,
            reasoning: Some("xhigh".to_string()),
            ..StreamOptions::default()
        };
        let cmd = ClaudeAdapter.build_stream_command("hi", &opts);
        let args: Vec<&str> = cmd
            .as_std()
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert!(args.contains(&"--effort"), "missing flag in {args:?}");
        assert!(args.contains(&"xhigh"), "missing value in {args:?}");
    }

    #[test]
    fn build_stream_command_emits_both_flags() {
        let opts = StreamOptions {
            mode: Some("bypassPermissions".to_string()),
            reasoning: Some("max".to_string()),
            ..StreamOptions::default()
        };
        let cmd = ClaudeAdapter.build_stream_command("hi", &opts);
        let args: Vec<&str> = cmd
            .as_std()
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        // Both flag pairs present, in mode→reasoning order.
        let mode_idx = args.iter().position(|a| *a == "--permission-mode").unwrap();
        let effort_idx = args.iter().position(|a| *a == "--effort").unwrap();
        assert_eq!(args[mode_idx + 1], "bypassPermissions");
        assert_eq!(args[effort_idx + 1], "max");
    }
}
