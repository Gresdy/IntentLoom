// OpenCode CLI adapter.
//
// PROTOCOL PARTIALLY VERIFIED — the `opencode` binary is not installed
// on this machine so the TopBar gates the tab as "unavailable" until
// the user installs it. The flag layout below mirrors the Claude shape
// as a placeholder. We emit `-m <model>` so the composer's model
// dropdown selection survives a future real-install verification.

use super::AgentAdapter;
use super::StreamOptions;
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};
use std::process::Stdio;
use tokio::process::Command;

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

    fn build_stream_command(&self, prompt: &str, opts: &StreamOptions) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("-p")
            .arg(prompt)
            .arg("--output-format")
            .arg("stream-json")
            .arg("--verbose")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // `-m <MODEL>` is the common shape across the registry.
        if let Some(model) = opts.model.as_deref() {
            if !model.is_empty() {
                cmd.arg("-m").arg(model);
            }
        }
        cmd
    }

    fn auth_state(&self) -> AuthState {
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
    use crate::agents::StreamOptions;

    #[test]
    fn has_expected_metadata() {
        let a = OpenCodeAdapter;
        assert_eq!(a.id(), "opencode");
        assert_eq!(a.binary(), "opencode");
        assert!(a.supports_streaming());
    }

    #[test]
    fn build_stream_command_uses_placeholder_shape() {
        let cmd = OpenCodeAdapter.build_stream_command("hello", &StreamOptions::default());
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "opencode");
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
    fn build_stream_command_passes_model_when_set() {
        let mut opts = StreamOptions::default();
        opts.model = Some("qwen-2.5-coder".to_string());
        let cmd = OpenCodeAdapter.build_stream_command("hi", &opts);
        let std_cmd = cmd.as_std();
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(
            args,
            vec!["-p", "hi", "--output-format", "stream-json", "--verbose", "-m", "qwen-2.5-coder"]
        );
    }
}
