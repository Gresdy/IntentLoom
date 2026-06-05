// OpenCode CLI adapter.
//
// PROTOCOL UNVERIFIED — the `opencode` binary is not installed on this
// machine, so `which opencode` fails and the TopBar gates the tab as
// "unavailable". When a user does install it, the default
// `build_stream_command` (Claude shape) will be used as a placeholder,
// which we expect to fail. Until the real flag layout is captured here,
// the adapter stays honest: binary presence is checked, but invocation
// is not promised.

use super::AgentAdapter;

pub struct OpenCodeAdapter;

impl AgentAdapter for OpenCodeAdapter {
    fn id(&self) -> &'static str {
        "opencode"
    }
    fn display_name(&self) -> &'static str {
        "OpenCode"
    }
    fn binary(&self) -> &'static str {
        "opencode"
    }
    fn description(&self) -> &'static str {
        "Open-source AI coding assistant"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_expected_metadata() {
        let a = OpenCodeAdapter;
        assert_eq!(a.id(), "opencode");
        assert_eq!(a.binary(), "opencode");
        assert!(a.supports_streaming());
    }

    #[test]
    fn build_stream_command_falls_back_to_default_until_verified() {
        // Intentionally inherits the Claude-shape default. If a user
        // installs opencode and clicks the tab, the call will fail in
        // the way the README's "关键诚实声明 §五-1" promises: protocol
        // is unverified, do not pretend otherwise.
        let cmd = OpenCodeAdapter.build_stream_command("hello");
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "opencode");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["--print-format-json", "--prompt", "hello"]);
    }
}
