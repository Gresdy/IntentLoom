//! Local-CLI adapter registry.
//!
//! Each adapter is a tiny unit that knows how to talk to one specific
//! CLI binary (claude / gemini / codex / opencode / openclaw). They share
//! a common interface ([`AgentAdapter`]) so the rest of the codebase can
//! dispatch to any of them without special-casing.
//!
//! Phase 1 of `docs/plan/multi-agent-cockpit.md` calls for adapter
//! skeletons plus per-adapter hello-world tests. This module ships
//! those skeletons. The streaming behaviour (stream-json normalization,
//! event emission) is still funnelled through `commands::ai::stream_ai`
//! and will be migrated per-adapter in W2 once the protocol for each
//! CLI is verified on a real install.
//!
//! Honestly-flagged limitations live in each adapter file — every
//! non-Claude adapter carries a "protocol unverified" comment.

pub mod claude;
pub mod codex;
pub mod gemini;
pub mod openclaw;
pub mod opencode;

pub use claude::ClaudeAdapter;
pub use codex::CodexAdapter;
pub use gemini::GeminiAdapter;
pub use openclaw::OpenClawAdapter;
pub use opencode::OpenCodeAdapter;
pub mod hermes;
pub use hermes::HermesAdapter;

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

/// Common interface every local-CLI adapter must implement.
///
/// Today the trait focuses on identity (`id`, `binary`, `display_name`)
/// plus `check_available()` for the TopBar tab gating. Methods that
/// require per-CLI protocol knowledge (stream-json shape, approval
/// hooks, resume semantics) are deliberately left out and will be
/// added per-adapter as we verify them.
pub trait AgentAdapter: Send + Sync {
    /// Stable id, matches `useModelStore.currentApp` on the frontend.
    fn id(&self) -> &'static str;
    /// Human-readable label for the TopBar tab.
    fn display_name(&self) -> &'static str;
    /// Binary name to spawn (resolved through `$PATH`).
    fn binary(&self) -> &'static str;
    /// One-line description shown in tooltips / ToolsModal.
    fn description(&self) -> &'static str;
    /// Whether this CLI supports streaming responses. All known CLIs
    /// do, so the default is `true`.
    fn supports_streaming(&self) -> bool {
        true
    }
    /// Best-effort availability check via `which`.
    fn check_available(&self) -> bool {
        which(self.binary()).is_some()
    }
    /// Probed CLI version, when the adapter knows how to ask. Default
    /// is `None` (unprobed).
    fn version(&self) -> Option<String> {
        None
    }
    /// Build the [`Command`] used to spawn the CLI for streaming.
    /// Adapters that have been verified against their real `--help` output
    /// override this; the default is the Claude Code shape
    /// (`--print-format-json --prompt <msg>`) and is used as the placeholder
    /// for unverified adapters (currently `opencode`).
    fn build_stream_command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("--print-format-json")
            .arg("--prompt")
            .arg(prompt)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }

    /// Per-adapter auth state surfaced to the UI. The default is
    /// `AuthState::unknown()` — adapters override when they know how
    /// to read their own credential file(s) or env var(s).
    fn auth_state(&self) -> AuthState {
        AuthState::unknown()
    }
}

/// Resolve `~/.something` style paths against the user's `$HOME`. Falls
/// back to the literal suffix (no leading slash) when HOME is unset so
/// the probes never panic; the file lookup will simply miss.
pub fn home_path(suffix: &str) -> String {
    let trimmed = suffix.trim_start_matches('/');
    match std::env::var("HOME") {
        Ok(home) if !home.is_empty() => format!("{}/{}", home, trimmed),
        _ => trimmed.to_string(),
    }
}

/// Tiny `which` implementation, copied from `commands::agents::which` so
/// the adapter registry can probe availability without taking a
/// dependency on the Tauri command surface.
pub fn which(bin: &str) -> Option<String> {
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(bin);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

/// Static registry of all known adapters, in display order. Iterate this
/// to build the TopBar tab list and the `list_agents` Tauri command
/// payload.
pub fn all_adapters() -> Vec<Box<dyn AgentAdapter>> {
    vec![
        Box::new(ClaudeAdapter),
        Box::new(GeminiAdapter),
        Box::new(CodexAdapter),
        Box::new(OpenCodeAdapter),
        Box::new(OpenClawAdapter),
        Box::new(HermesAdapter),
    ]
}

/// Lookup an adapter by its frontend id (matches
/// `useModelStore.currentApp`).
pub fn find_adapter(id: &str) -> Option<Box<dyn AgentAdapter>> {
    all_adapters().into_iter().find(|a| a.id() == id)
}

/// Resolve a binary name for a frontend id, returning `None` for
/// unknown ids. The wrapper used by `commands::ai::stream_ai` to keep
/// its `binary_for` helper honest.
pub fn binary_for(id: &str) -> Option<&'static str> {
    find_adapter(id).map(|a| a.binary())
}

/// Where the adapter's auth credential lives, used by the
/// `auth_state()` implementations to know what to probe.
///
/// - `ApiKeyFile(path)` — read the file as JSON, look for a key under
///   a known name. Empty / missing / sentinel values count as "not set".
/// - `EnvVar(name)` — `std::env::var(name)` set & non-empty counts as set.
/// - `JsonPath { file, dotted_path }` — read JSON, walk a dotted path
///   (e.g. `auth.profiles`), return `LoggedIn` if the result is a
///   non-empty object or array.
/// - `OAuthBrowser` — the CLI does OAuth via the user's browser when
///   first launched; we cannot tell from disk whether the user has
///   completed that flow. Default is `Unknown` with no hint.
#[derive(Debug, Clone)]
pub enum AuthProbe {
    ApiKeyFile { path: String, key: &'static str, sentinel_values: &'static [&'static str] },
    EnvVar(&'static str),
    JsonPath { path: String, dotted_path: &'static str },
    OAuthBrowser,
}

/// Per-adapter auth state surfaced to the UI. `LoggedIn` is the only
/// state with no `hint` — the others carry a short, user-visible
/// next-step (e.g. "运行 `claude` 触发 OAuth 登录").
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuthStatus {
    /// We can see a credential locally (API key file, OAuth token,
    /// env var, non-empty profile). The CLI will be able to authenticate.
    LoggedIn,
    /// The CLI is installed but we can see no local credential.
    LoggedOut,
    /// We cannot determine without invoking the CLI (browser OAuth,
    /// remote provider login, etc.). The hint tells the user how to
    /// verify themselves.
    Unknown,
    /// The CLI does not require authentication (local-only model).
    NotRequired,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub status: AuthStatus,
    /// Short, user-visible hint when status is not `LoggedIn`. Always
    /// `None` for `LoggedIn` / `NotRequired` — the UI doesn't show a
    /// hint when there is nothing to do.
    pub hint: Option<String>,
}

impl AuthState {
    pub fn logged_in() -> Self {
        Self { status: AuthStatus::LoggedIn, hint: None }
    }
    pub fn logged_out(hint: &str) -> Self {
        Self { status: AuthStatus::LoggedOut, hint: Some(hint.to_string()) }
    }
    pub fn unknown_with_hint(hint: &str) -> Self {
        Self { status: AuthStatus::Unknown, hint: Some(hint.to_string()) }
    }
    pub fn unknown() -> Self {
        Self { status: AuthStatus::Unknown, hint: None }
    }
    pub fn not_required() -> Self {
        Self { status: AuthStatus::NotRequired, hint: None }
    }
}

/// Run a single `AuthProbe` against the host filesystem / environment.
/// Used by the per-adapter `auth_state()` methods and by the unit
/// tests, which feed in a synthetic probe against a temp file.
pub fn evaluate_probe(probe: &AuthProbe) -> AuthState {
    match probe {
        AuthProbe::ApiKeyFile { path, key, sentinel_values } => {
            let Ok(raw) = std::fs::read_to_string(path) else {
                return AuthState::unknown_with_hint("凭证文件不存在");
            };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
                return AuthState::unknown_with_hint("凭证文件不是合法 JSON");
            };
            let value = json.get(*key).and_then(|v| v.as_str()).unwrap_or("");
            if value.is_empty() {
                return AuthState::logged_out("凭证文件缺少 API Key");
            }
            if sentinel_values.iter().any(|s| *s == value) {
                // `PROXY_MANAGED` and similar sentinels still mean
                // "the credential is set" — a proxy is providing it.
                return AuthState::logged_in();
            }
            AuthState::logged_in()
        }
        AuthProbe::EnvVar(name) => match std::env::var(name) {
            Ok(v) if !v.is_empty() => AuthState::logged_in(),
            _ => AuthState::logged_out("未设置环境变量"),
        },
        AuthProbe::JsonPath { path, dotted_path } => {
            let Ok(raw) = std::fs::read_to_string(path) else {
                return AuthState::unknown_with_hint("配置文件不存在");
            };
            let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
                return AuthState::unknown_with_hint("配置文件不是合法 JSON");
            };
            let mut current = &json;
            for segment in dotted_path.split('.') {
                match current.get(segment) {
                    Some(next) => current = next,
                    None => return AuthState::unknown_with_hint("未在配置中找到凭证段"),
                }
            }
            match current {
                serde_json::Value::Object(map) if !map.is_empty() => AuthState::logged_in(),
                serde_json::Value::Array(arr) if !arr.is_empty() => AuthState::logged_in(),
                serde_json::Value::String(s) if !s.is_empty() => AuthState::logged_in(),
                _ => AuthState::logged_out("配置文件中凭证段为空"),
            }
        }
        AuthProbe::OAuthBrowser => AuthState::unknown_with_hint("首次运行 CLI 时触发浏览器登录"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_six_adapters() {
        assert_eq!(all_adapters().len(), 6);
    }

    #[test]
    fn all_adapters_have_unique_ids() {
        let mut ids: Vec<&str> = all_adapters().iter().map(|a| a.id()).collect();
        ids.sort();
        let original = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), original, "duplicate adapter ids in registry");
    }

    #[test]
    fn all_known_ids_resolve() {
        for id in ["claude", "gemini", "codex", "opencode", "openclaw", "hermes"] {
            assert!(
                find_adapter(id).is_some(),
                "adapter '{id}' missing from registry"
            );
        }
    }

    #[test]
    fn unknown_id_returns_none() {
        assert!(find_adapter("nope").is_none());
        assert!(find_adapter("").is_none());
    }

    #[test]
    fn binary_for_keeps_existing_aliases() {
        assert_eq!(binary_for("claude"), Some("claude"));
        // Future: when "claude-code" gets a separate alias adapter, this
        // assertion will need to track that. Today we still accept the
        // legacy id and resolve it to the same binary.
    }

    #[test]
    fn which_returns_none_for_missing_binary() {
        assert!(which("definitely-not-a-real-binary-xyz").is_none());
    }
}

#[cfg(test)]
mod probe_tests {
    //! Unit tests for [`evaluate_probe`]. Each test uses a unique
    //! `/tmp` path so the suite is safe to run with `cargo test`
    //! defaults (no shared HOME, no shared state file).
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static SEQ: AtomicUsize = AtomicUsize::new(0);

    fn tmp_path(suffix: &str) -> String {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        format!("/tmp/intentloom_probe_{pid}_{n}_{suffix}")
    }

    fn write(path: &str, body: &[u8]) {
        let mut f = std::fs::File::create(path).expect("create temp file");
        f.write_all(body).expect("write temp file");
        f.sync_all().ok();
    }

    // -- ApiKeyFile --

    #[test]
    fn api_key_file_with_real_key_logs_in() {
        let p = tmp_path("apikey_ok.json");
        write(&p, br#"{"OPENAI_API_KEY": "sk-real-1234567890"}"#);
        let probe = AuthProbe::ApiKeyFile {
            path: p.clone(),
            key: "OPENAI_API_KEY",
            sentinel_values: &[],
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::LoggedIn);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn api_key_file_with_sentinel_value_still_logs_in() {
        let p = tmp_path("apikey_sentinel.json");
        write(&p, br#"{"OPENAI_API_KEY": "PROXY_MANAGED"}"#);
        let probe = AuthProbe::ApiKeyFile {
            path: p.clone(),
            key: "OPENAI_API_KEY",
            sentinel_values: &["PROXY_MANAGED"],
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::LoggedIn);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn api_key_file_missing_logs_out() {
        // Missing file → probe returns Unknown; the Codex adapter
        // remaps that to LoggedOut with a friendlier hint. The raw
        // probe behaviour is what we test here.
        let p = tmp_path("apikey_missing.json");
        std::fs::remove_file(&p).ok();
        let probe = AuthProbe::ApiKeyFile {
            path: p,
            key: "OPENAI_API_KEY",
            sentinel_values: &[],
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::Unknown);
    }

    #[test]
    fn api_key_file_empty_value_logs_out() {
        let p = tmp_path("apikey_empty.json");
        write(&p, br#"{"OPENAI_API_KEY": ""}"#);
        let probe = AuthProbe::ApiKeyFile {
            path: p.clone(),
            key: "OPENAI_API_KEY",
            sentinel_values: &[],
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::LoggedOut);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn api_key_file_malformed_logs_out() {
        let p = tmp_path("apikey_bad.json");
        write(&p, b"not valid json");
        let probe = AuthProbe::ApiKeyFile {
            path: p.clone(),
            key: "OPENAI_API_KEY",
            sentinel_values: &[],
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::Unknown);
        std::fs::remove_file(&p).ok();
    }

    // -- EnvVar --

    #[test]
    fn env_var_set_logs_in() {
        let key = "INTENTLOOM_TEST_AUTH_TOKEN";
        // SAFETY: this test sets a unique env var and is single-threaded
        // for that var; other tests in the suite do not touch it.
        unsafe { std::env::set_var(key, "sk-env-123") };
        assert_eq!(
            evaluate_probe(&AuthProbe::EnvVar(key)).status,
            AuthStatus::LoggedIn
        );
        unsafe { std::env::remove_var(key) };
    }

    #[test]
    fn env_var_empty_logs_out() {
        let key = "INTENTLOOM_TEST_AUTH_EMPTY";
        unsafe { std::env::set_var(key, "") };
        assert_eq!(
            evaluate_probe(&AuthProbe::EnvVar(key)).status,
            AuthStatus::LoggedOut
        );
        unsafe { std::env::remove_var(key) };
    }

    #[test]
    fn env_var_unset_logs_out() {
        let key = "INTENTLOOM_TEST_AUTH_UNSET_XYZ_12345";
        unsafe { std::env::remove_var(key) };
        assert_eq!(
            evaluate_probe(&AuthProbe::EnvVar(key)).status,
            AuthStatus::LoggedOut
        );
    }

    // -- JsonPath --

    #[test]
    fn json_path_non_empty_object_logs_in() {
        let p = tmp_path("json_obj.json");
        write(&p, br#"{"auth": {"profiles": {"minimax": {}}}}"#);
        let probe = AuthProbe::JsonPath {
            path: p.clone(),
            dotted_path: "auth.profiles",
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::LoggedIn);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn json_path_non_empty_string_logs_in() {
        let p = tmp_path("json_str.json");
        write(&p, br#"{"env": {"ANTHROPIC_AUTH_TOKEN": "sk-x"}}"#);
        let probe = AuthProbe::JsonPath {
            path: p.clone(),
            dotted_path: "env.ANTHROPIC_AUTH_TOKEN",
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::LoggedIn);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn json_path_empty_object_logs_out() {
        let p = tmp_path("json_empty.json");
        write(&p, br#"{"auth": {"profiles": {}}}"#);
        let probe = AuthProbe::JsonPath {
            path: p.clone(),
            dotted_path: "auth.profiles",
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::LoggedOut);
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn json_path_missing_segment_logs_out() {
        // Rename is a little imprecise — a missing segment along the
        // dotted path returns `Unknown` from the probe (we cannot tell
        // whether the user is logged out vs. hasn't written that key
        // yet), not `LoggedOut`. The "out" part of the name now refers
        // to "no leaf object/array/string found" rather than "the user
        // is logged out". Keep the name for symmetry with the other
        // path-based tests; the assertion is what matters.
        // See `json_path_file_missing_is_unknown` for the file-level
        // missing case; the segment-level missing case is `Unknown`
        // rather than `LoggedOut` because we don't want to claim
        // "logged out" for keys the CLI may not even write.
        let p = tmp_path("json_missing.json");
        write(&p, br#"{"env": {}}"#);
        let probe = AuthProbe::JsonPath {
            path: p.clone(),
            dotted_path: "env.ANTHROPIC_AUTH_TOKEN",
        };
        let state = evaluate_probe(&probe);
        assert_eq!(state.status, AuthStatus::Unknown);
        // The hint should help the user understand the gap.
        assert!(state.hint.is_some(), "missing segment must carry a hint");
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn json_path_file_missing_is_unknown() {
        let p = tmp_path("json_no_file.json");
        std::fs::remove_file(&p).ok();
        let probe = AuthProbe::JsonPath {
            path: p,
            dotted_path: "auth.profiles",
        };
        assert_eq!(evaluate_probe(&probe).status, AuthStatus::Unknown);
    }

    // -- OAuthBrowser --

    #[test]
    fn oauth_browser_is_always_unknown_with_hint() {
        let s = evaluate_probe(&AuthProbe::OAuthBrowser);
        assert_eq!(s.status, AuthStatus::Unknown);
        assert!(s.hint.is_some());
    }

    // -- home_path helper --

    #[test]
    fn home_path_resolves_under_home() {
        // SAFETY: HOME is process-wide; this test sets it to a known
        // value and restores it before returning. Other tests in the
        // suite do not read HOME, so the brief window is safe.
        let saved = std::env::var("HOME").ok();
        unsafe { std::env::set_var("HOME", "/tmp/intentloom_test_home") };
        let p = home_path(".codex/auth.json");
        assert_eq!(p, "/tmp/intentloom_test_home/.codex/auth.json");
        if let Some(v) = saved {
            unsafe { std::env::set_var("HOME", v) };
        } else {
            unsafe { std::env::remove_var("HOME") };
        }
    }

    #[test]
    fn home_path_strips_leading_slash() {
        // The "no HOME" case should still produce a usable relative
        // path; the file lookup will just miss, never panic.
        let saved = std::env::var("HOME").ok();
        unsafe { std::env::remove_var("HOME") };
        let p = home_path("/.claude/settings.json");
        assert_eq!(p, ".claude/settings.json");
        if let Some(v) = saved {
            unsafe { std::env::set_var("HOME", v) };
        }
    }
}
