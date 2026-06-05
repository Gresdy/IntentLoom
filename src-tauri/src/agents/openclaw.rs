// OpenClaw CLI adapter.
//
// PROTOCOL PARTIALLY VERIFIED on 2026-06-05 against `openclaw --help` and
// `openclaw agent --help` on a real install (OpenClaw 2026.3.2). The
// `openclaw agent` subcommand is the entry point for running an agent
// turn, with relevant flags:
//   - `--local`        : run the embedded agent locally (skips the
//                         Gateway, requires model provider API keys in
//                         the shell — fine for our local-first stance).
//   - `--json`         : "Output result as JSON".
//   - `-m, --message <text>` : message body for the agent.
// We pass `agent --local --json -m <prompt>`. The wire format is NOT yet
// streamed (we get a single JSON blob at end-of-turn), so the Loom
// "live events" surface will see a single end-of-stream chunk until a
// future revision adds real per-event streaming. The `stream-json`
// parser on the frontend already handles a generic JSON payload so the
// chat transcript still renders.

use super::AgentAdapter;
use std::process::Stdio;
use tokio::process::Command;

pub struct OpenClawAdapter;

impl AgentAdapter for OpenClawAdapter {
    fn id(&self) -> &'static str {
        "openclaw"
    }
    fn display_name(&self) -> &'static str {
        "OpenClaw"
    }
    fn binary(&self) -> &'static str {
        "openclaw"
    }
    fn description(&self) -> &'static str {
        "OpenClaw custom agent"
    }

    fn build_stream_command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("agent")
            .arg("--local")
            .arg("--json")
            .arg("-m")
            .arg(prompt)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_expected_metadata() {
        let a = OpenClawAdapter;
        assert_eq!(a.id(), "openclaw");
        assert_eq!(a.binary(), "openclaw");
        assert!(a.supports_streaming());
    }

    #[test]
    fn build_stream_command_matches_verified_flags() {
        // Verified against `openclaw agent --help` on 2026-06-05.
        let cmd = OpenClawAdapter.build_stream_command("hello");
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "openclaw");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["agent", "--local", "--json", "-m", "hello"]);
    }
}
