// OpenClaw CLI adapter.
//
// PROTOCOL PARTIALLY VERIFIED on 2026-06-08 against `openclaw --help`,
// `openclaw agent --help`, and a real `openclaw agent --local --json -m
// "..."` invocation on OpenClaw 2026.3.2. The `openclaw agent`
// subcommand is the entry point for running an agent turn, with
// relevant flags:
//   - `--local`        : run the embedded agent locally (skips the
//                         Gateway, requires model provider API keys in
//                         the shell — fine for our local-first stance).
//   - `--json`         : "Output result as JSON".
//   - `-m, --message <text>` : message body for the agent.
//
// HEADLESS LIMITATION (verified 2026-06-08): even with `--local` and
// `--json`, OpenClaw refuses to run a turn without one of
// `--to <E.164>`, `--session-id`, or `--agent` to pick a session:
//
//   $ openclaw agent --local --json -m "hi"
//   Error: Pass --to <E.164>, --session-id, or --agent to choose a session
//
// IntentLoom has no way to know which session the user wants (the
// E.164 number, the persisted session id, the named agent — none of
// these have a single canonical answer per machine), so the
// `setup_status` override below reports the adapter as
// `Misconfigured` whenever the binary resolves and auth is in
// place, with a hint pointing at the three flags the user needs to
// pick from. The Agents panel already renders a `Misconfigured` row
// as a small warning with the message inline (no CTA), so the
// contract holds end-to-end: the tab is visually available, the
// transcript path will not silently spin.
//
// The flag shape itself is correct: we do not want a future reader
// to "fix" this adapter by adding one of the session flags without
// also wiring a UI affordance that asks the user for the value.

use super::AgentAdapter;
use super::StreamOptions;
use super::{AuthState, AuthStatus, AuthProbe, evaluate_probe, home_path};
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

    fn build_stream_command(&self, prompt: &str, _opts: &StreamOptions) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("agent")
            .arg("--local")
            .arg("--json")
            .arg("-m")
            .arg(prompt)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        // The headless CLI refuses to run without one of
        // `--to` / `--session-id` / `--agent`. The user
        // picks one in the composer (see
        // `OpenClawSession`); we emit the corresponding
        // flag and its value verbatim. If the user has
        // NOT picked a session yet (`is_set() == false`),
        // we deliberately leave the flag off so the CLI
        // surfaces its own "Pass --to <E.164>,
        // --session-id, or --agent" error — and the
        // friendlySendError pipeline turns that into the
        // same "Pass --to/--session-id/--agent to choose
        // a session" hint the user sees in the Agents
        // panel. We do NOT invent a default value
        // (e.g. "--agent default"): the CLI has no such
        // concept and a guessed value would fail with a
        // different, less helpful error.
        if let Some(session) = _opts.openclaw_session.as_ref() {
            if let Some(to) = session.to.as_deref().filter(|s| !s.is_empty()) {
                cmd.arg("--to").arg(to);
            } else if let Some(sid) = session.session_id.as_deref().filter(|s| !s.is_empty()) {
                cmd.arg("--session-id").arg(sid);
            } else if let Some(agent) = session.agent.as_deref().filter(|s| !s.is_empty()) {
                cmd.arg("--agent").arg(agent);
            }
        }
        cmd
    }

    fn setup_status(&self) -> super::SetupState {
        // The headless limitation is documented in the adapter
        // header. When the binary is installed AND auth is in
        // place, we still cannot pick a session for the user
        // (E.164 / session-id / agent-id are user-specific
        // choices, not things the chat composer can guess), so
        // the honest answer is "installed and authed, but the
        // protocol has no default session — configure one in
        // `openclaw` first, or pick a session before sending".
        // The default impl would mark this as `Ready` and the
        // Agents panel would render a green chip — lying.
        if !self.check_available() {
            // Defer to the default install CTA.
            return super::SetupState::needs_install_url(
                "未检测到可执行文件",
                "https://github.com/openclaw/openclaw",
            );
        }
        match self.auth_state().status {
            super::AuthStatus::LoggedIn | super::AuthStatus::NotRequired => {
                super::SetupState::misconfigured(
                    "已安装且已登录,但 headless 模式需要指定 --to / --session-id / --agent,先在终端跑 openclaw agent 配置好",
                )
            }
            // Auth missing or unknown — let the default
            // needs_login CTA take over so the panel renders
            // the standard login hint.
            _ => super::SetupState::needs_login(
                "已安装,但尚未登录",
                self.binary().to_string(),
            ),
        }
    }

    fn auth_state(&self) -> AuthState {
        // OpenClaw writes its `auth.profiles` map to
        // `~/.openclaw/openclaw.json`; any non-empty profile entry
        // (e.g. `minimax-cn:default`) means at least one provider is
        // wired. The `wizard.lastRunAt` marker is a softer signal that
        // we intentionally do not check — the user can have completed
        // the wizard without settling on a profile.
        let probe = evaluate_probe(&AuthProbe::JsonPath {
            path: home_path(".openclaw/openclaw.json"),
            dotted_path: "auth.profiles",
        });
        if probe.status == AuthStatus::LoggedIn {
            return probe;
        }
        AuthState::logged_out("运行 `openclaw onboard` 选择 provider")
    }
}


#[cfg(test)]
mod tests {
    use crate::agents::OpenClawSession;

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
        let cmd = OpenClawAdapter.build_stream_command("hello", &StreamOptions::default());
        let std_cmd = cmd.as_std();
        assert_eq!(std_cmd.get_program(), "openclaw");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        assert_eq!(args, vec!["agent", "--local", "--json", "-m", "hello"]);
    }

    // -- session flag plumbing --
    //
    // The headless CLI requires exactly one of `--to`,
    // `--session-id`, or `--agent`. The adapter emits the
    // flag that matches whatever the composer forwarded
    // in `StreamOptions.openclaw_session`. An unset session
    // emits no flag (the CLI then surfaces its own
    // "Pass --to/--session-id/--agent" error which the
    // friendlySendError pipeline translates for the UI).
    // Picking more than one would be a UI bug, so the
    // adapter takes them in priority order (to > sid >
    // agent) and ignores the rest.

    fn args_of(cmd: &Command) -> Vec<String> {
        cmd.as_std()
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg").to_string())
            .collect()
    }

    #[test]
    fn build_stream_command_emits_to_flag_for_phone_session() {
        let opts = StreamOptions {
            openclaw_session: Some(OpenClawSession {
                to: Some("+15555550123".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let cmd = OpenClawAdapter.build_stream_command("hi", &opts);
        let args = args_of(&cmd);
        let i = args.iter().position(|a| a == "--to").expect("missing --to");
        assert_eq!(args[i + 1], "+15555550123");
    }

    #[test]
    fn build_stream_command_emits_session_id_flag() {
        let opts = StreamOptions {
            openclaw_session: Some(OpenClawSession {
                session_id: Some("sess-42".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let cmd = OpenClawAdapter.build_stream_command("hi", &opts);
        let args = args_of(&cmd);
        let i = args.iter().position(|a| a == "--session-id").expect("missing --session-id");
        assert_eq!(args[i + 1], "sess-42");
    }

    #[test]
    fn build_stream_command_emits_agent_flag() {
        let opts = StreamOptions {
            openclaw_session: Some(OpenClawSession {
                agent: Some("ops".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let cmd = OpenClawAdapter.build_stream_command("hi", &opts);
        let args = args_of(&cmd);
        let i = args.iter().position(|a| a == "--agent").expect("missing --agent");
        assert_eq!(args[i + 1], "ops");
    }

    #[test]
    fn build_stream_command_omits_all_flags_when_session_unset() {
        // Default StreamOptions + no session: no --to,
        // --session-id, or --agent. The CLI's own error
        // becomes the user-facing hint, mapped through
        // friendlySendError.
        let cmd = OpenClawAdapter.build_stream_command("hi", &StreamOptions::default());
        let args = args_of(&cmd);
        assert!(!args.contains(&"--to".to_string()));
        assert!(!args.contains(&"--session-id".to_string()));
        assert!(!args.contains(&"--agent".to_string()));
        // The base args are still there.
        assert!(args.starts_with(&["agent".to_string(), "--local".to_string()]));
    }

    #[test]
    fn build_stream_command_prefers_to_over_session_id_and_agent() {
        // A future UI bug that lets the user fill all
        // three fields at once would otherwise emit three
        // flags and confuse the CLI. Pin the priority
        // order so the bug is caught locally.
        let opts = StreamOptions {
            openclaw_session: Some(OpenClawSession {
                to: Some("+1".into()),
                session_id: Some("sid".into()),
                agent: Some("a".into()),
            }),
            ..Default::default()
        };
        let cmd = OpenClawAdapter.build_stream_command("hi", &opts);
        let args = args_of(&cmd);
        assert!(args.contains(&"--to".to_string()));
        assert!(!args.contains(&"--session-id".to_string()));
        assert!(!args.contains(&"--agent".to_string()));
    }

    #[test]
    fn setup_status_is_never_ready_for_headless_openclaw() {
        // OpenClaw 2026.3.2 refuses to run a headless turn
        // without --to / --session-id / --agent (verified
        // 2026-06-08). The default trait impl would mark a
        // resolved + authed binary as `Ready`, which would
        // make the Agents panel render a green chip and
        // suggest the chat composer should work — a lie.
        // Pin the contract: setup_status must NOT be Ready
        // when the binary resolves, regardless of auth state.
        let a = OpenClawAdapter;
        if !a.check_available() {
            // Binary missing on this runner — the install CTA
            // is the right surface; nothing to assert about
            // headless behaviour because we cannot get there.
            return;
        }
        let status = a.setup_status().status;
        assert!(
            status != super::super::SetupStatus::Ready,
            "OpenClaw should never report Ready because headless mode requires a session id"
        );
    }
}
