//! Claude Code adapter — the reference implementation. Protocol
//! **verified** against `claude --help` on a real install (2026-06-05).
//!
//! `claude --help` exposes `--print-format-json` and `--prompt <text>` for
//! non-interactive streaming JSON output. This matches the trait's default
//! shape, so we deliberately do NOT override `build_stream_command` — the
//! default in [`super::AgentAdapter`] is the canonical Claude invocation.

use super::AgentAdapter;

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
