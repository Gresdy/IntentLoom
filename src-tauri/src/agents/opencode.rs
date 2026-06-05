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
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};

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

    fn auth_state(&self) -> AuthState {
        // OpenCode stores provider config in
        // `~/.config/opencode/opencode.json`; the `provider` key, when
        // present and non-empty, means the user has wired at least one
        // inference provider. We cannot tell from this single file
        // whether OAuth providers (e.g. copilot-acp) have a live token,
        // so the fallback is `Unknown` rather than `LoggedOut`.
        let probe = evaluate_probe(&AuthProbe::JsonPath {
            path: home_path(".config/opencode/opencode.json"),
            dotted_path: "provider",
        });
        if probe.status == AuthStatus::LoggedIn {
            return probe;
        }
        AuthState::unknown_with_hint("首次运行 `opencode` 时按提示配置 provider")
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
