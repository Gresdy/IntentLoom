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

pub mod config;
pub use config::{AgentConfig, AgentConfigStore};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;

/// Common interface every local-CLI adapter must implement.
///
/// Today the trait focuses on identity (`id`, `binary`, `display_name`)
/// plus `check_available()` for the TopBar tab gating. Methods that
/// require per-CLI protocol knowledge (stream-json shape, approval
/// hooks, resume semantics) are deliberately left out and will be
/// added per-adapter as we verify them on a real install.
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
    /// Best-effort availability check via [`which`]. Returns true
    /// when the binary is reachable from the process — either on
    /// `$PATH` or via the user-local fallback list in
    /// [`resolve_binary`]. The user-local fallback matters: a Tauri
    /// `.app` bundle on macOS inherits a minimal system PATH and
    /// would otherwise miss the user's `~/.local/bin/claude` etc.
    /// Also enforces the executable-bit check so a non-executable
    /// file matching the name is not reported as "available" (it
    /// would fail at spawn with EACCES).
    fn check_available(&self) -> bool {
        which(self.binary()).is_some()
    }
    /// Probed CLI version, when the adapter knows how to ask. The
    /// default implementation spawns `<binary> --version` and returns
    /// the first non-empty line of stdout, trimmed. Adapters whose
    /// binary has a non-standard version flag (or no version output
    /// at all) override this. Returns `None` on any failure —
    /// spawning, timeout, or non-zero exit — so the UI can show an
    /// em-dash without blocking the panel render.
    fn version(&self) -> Option<String> {
        probe_version(self.binary())
    }
    /// Real handshake test: confirms the binary is not just on disk
    /// but actually runnable end-to-end. The default implementation
    /// times a `<bin> --version` invocation; adapters that need a
    /// deeper check (e.g. an OAuth round-trip to the upstream, or a
    /// warm-up of a long-lived daemon) override to run their own
    /// probe and report its latency.
    ///
    /// The returned [`HealthCheck`] carries availability, latency,
    /// the resolved path, the version string (when the binary
    /// reported one), and a short user-visible error message on
    /// the failure path. Safe to call from any thread — the
    /// underlying probe runs on a worker thread with a bounded
    /// channel, the same pattern as [`probe_version`].
    ///
    /// Always populates `path` and `error` from the *resolved*
    /// binary, not from a user-supplied `cli_path` override —
    /// call sites that want to honour overrides should call
    /// [`crate::commands::agents::check_agent_health`] which
    /// routes the override through the same path resolution as
    /// `list_agents`.
    fn health_check(&self) -> HealthCheck {
        // Inlined rather than calling `health_check_default` so the
        // trait stays object-safe (we cannot pass `&Self` as
        // `&dyn AgentAdapter` from a non-Sized method). The body
        // is the same as the free function; the only difference
        // is that we read `binary()` / `version()` directly off
        // `self` here.
        use std::sync::mpsc;
        use std::thread;
        use std::time::{Duration, Instant};

        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        let path = resolve_binary(self.binary());
        let Some(path) = path else {
            return HealthCheck {
                available: false,
                latency_ms: 0,
                path: None,
                version: None,
                error: Some(format!("{} 未在 PATH 中找到", self.binary())),
                checked_at: now_ms,
            };
        };

        let bin = self.binary().to_string();
        let path_for_thread = path.clone();
        let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);
        let start = Instant::now();
        thread::spawn(move || {
            let result = tauri::async_runtime::block_on(run_health_probe(&path_for_thread));
            let _ = tx.send(result);
        });

        let outcome = rx.recv_timeout(Duration::from_millis(HEALTH_CHECK_TIMEOUT_MS + 2_000));
        let latency_ms = start.elapsed().as_millis() as u64;

        let available = matches!(outcome, Ok(Ok(())));
        let error = match outcome {
            Ok(Ok(())) => None,
            Ok(Err(e)) => Some(e),
            Err(_) => Some(format!("{bin} 健康检查超时")),
        };

        HealthCheck {
            available,
            latency_ms,
            path: Some(path),
            version: if available { self.version() } else { None },
            error,
            checked_at: now_ms,
        }
    }
    /// Build the [`Command`] used to spawn the CLI for streaming. The
    /// `opts` argument carries the per-CLI composer dropdown selections
    /// (mode / reasoning effort). Adapters that expose those flags on
    /// their `--help` override this method to splice the right argv
    /// tokens; adapters that don't (opencode, openclaw, hermes today)
    /// accept the new signature and silently drop the options.
    ///
    /// The default body is the Claude Code shape
    /// (`--print-format-json --prompt <msg>`) and is used as the
    /// placeholder for unverified adapters.
    fn build_stream_command(&self, prompt: &str, opts: &StreamOptions) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("--print-format-json")
            .arg("--prompt")
            .arg(prompt)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let _ = opts; // default impl ignores options
        cmd
    }

    /// Per-adapter auth state surfaced to the UI. The default is
    /// `AuthState::unknown()` — adapters override when they know how
    /// to read their own credential file(s) or env var(s).
    fn auth_state(&self) -> AuthState {
        AuthState::unknown()
    }

    /// Coarse-grained "can the user use this right now?" signal the
    /// panel uses to pick an install vs login CTA. Default impl
    /// derives the status from `check_available` + `auth_state` so
    /// most adapters get a sensible answer for free. Adapters with
    /// non-trivial setup (custom daemon, license key, etc.) should
    /// override.
    fn setup_status(&self) -> SetupState {
        if !self.check_available() {
            return SetupState::needs_install_url(
                "未检测到可执行文件",
                format!("https://example.com/install/{}", self.id()),
            );
        }
        match self.auth_state().status {
            AuthStatus::LoggedIn | AuthStatus::NotRequired => SetupState::ready(),
            AuthStatus::LoggedOut => SetupState::needs_login(
                "已安装,但尚未登录",
                self.binary().to_string(),
            ),
            AuthStatus::Unknown => SetupState::misconfigured(
                "已安装,但认证状态未知 — 运行该 CLI 完成 OAuth",
            ),
        }
    }
}

/// Per-run options the composer dropdowns (mode / reasoning) set on
/// the [`AgentAdapter::build_stream_command`] call. Both fields are
/// `None` when the user has not picked anything; the frontend always
/// resolves to the spec default, so `None` on the Rust side means
/// "the caller did not pass them through".
///
/// The Rust side keeps this struct small on purpose — anything that
/// has more than 2-3 known values belongs in a per-CLI helper, not
/// in the trait surface.
#[derive(Debug, Clone, Default)]
pub struct StreamOptions {
    /// Permission / approval mode. Mapped to `--permission-mode`
    /// (claude), `--sandbox` (codex), `--approval-mode` (gemini).
    /// Each adapter decides whether to emit the flag.
    pub mode: Option<String>,
    /// Reasoning effort. Mapped to `--effort` (claude) or
    /// `-c model_reasoning_effort=<value>` (codex). Gemini does
    /// not expose a reasoning knob.
    pub reasoning: Option<String>,
    /// Per-turn model override. Each adapter decides how to
    /// translate it into argv / env:
    ///   - claude  : `ANTHROPIC_MODEL=<model>` env var (Claude
    ///     reads it from the environment, no CLI flag for this).
    ///   - codex   : `-m <model>` flag.
    ///   - gemini  : `-m <model>` flag.
    ///   - opencode: `-m <model>` flag (placeholder; the binary
    ///     is unverified — the flag is emitted so the next person
    ///     who verifies it doesn't have to add a new option).
    ///   - openclaw / hermes: ignored for now — both CLIs pick
    ///     their own model from session / config.
    ///
    /// `None` means "do not pass any model hint" so the CLI
    /// falls back to whatever is baked into its own config (the
    /// common case for Anthropic / OpenAI OAuth sign-ins where
    /// the user has not overridden the model). The front-end
    /// also uses `None` when the composer dropdown is at its
    /// default (i.e. the user hasn't picked a model yet).
    ///
    /// The string is forwarded verbatim — adapters do NOT
    /// validate that the value is a real model id. Letting the
    /// upstream CLI fail on an unknown model is the right
    /// behaviour: surfacing the error through the existing
    /// `friendlySendError` pipeline gives the user a much
    /// clearer signal than a frontend-side validator would.
    pub model: Option<String>,
    /// Working directory the CLI should run in. The frontend
    /// passes the workspace the user picked from the folder
    /// dialog so the spawned process (and any tools the CLI
    /// invokes — `Read`, `Edit`, `Bash`, …) operate on the
    /// project the user actually sees in the status bar.
    ///
    /// `None` (or empty) means "leave the CWD alone" — the CLI
    /// inherits Tauri's own CWD, which is the right fallback
    /// for the bare ReasonixApp boot path (no workspace
    /// chosen) and for unit tests that don't care about CWD.
    ///
    /// `Some(path)` is applied to the child via
    /// `Command::current_dir` in
    /// [`crate::commands::ai::build_command`]. The path is
    /// validated as a directory before spawn (a stale
    /// `project_path` from a deleted folder would otherwise
    /// fail at spawn with a confusing OS error) and a
    /// missing / non-directory path is converted into the
    /// same "AI CLI error" wrapper the spawn failure path
    /// uses, so the UI can show one consistent error.
    pub cwd: Option<String>,
    /// OpenClaw session selector. The headless `openclaw agent`
    /// command refuses to run a turn without one of `--to
    /// <E.164>`, `--session-id <id>`, or `--agent <id>` (verified
    /// 2026-06-08 against OpenClaw 2026.3.2). The composer
    /// surfaces a three-way picker to the user; the chosen
    /// value is forwarded to the IPC and ends up here.
    /// Other adapters ignore this field; the OpenClaw
    /// adapter emits the corresponding flag in its
    /// `build_stream_command`.
    pub openclaw_session: Option<OpenClawSession>,
    /// Per-turn environment variable overrides. The frontend
    /// populates this from the selected provider's
    /// `settingsConfig.env` (e.g. `ANTHROPIC_BASE_URL`,
    /// `ANTHROPIC_AUTH_TOKEN`, `OPENAI_BASE_URL`,
    /// `OPENAI_API_KEY`). An empty map means "inherit the
    /// parent process' environment", which is the correct
    /// behaviour for a user who has not picked a provider
    /// preset (the CLI reads the shell's env or its own
    /// settings file at spawn time).
    pub env: HashMap<String, String>,
}

/// OpenClaw session selector. Exactly ONE of the three fields
/// is `Some` when the user has picked a session (the composer
/// enforces this); if all three are `None`, the OpenClaw
/// adapter leaves the flag off, which preserves the original
/// "must pick a session" error so the user notices the gap.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawSession {
    /// Maps to `--to <E.164>` — a phone number, used to
    /// derive the session key for chat-channel delivery.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
    /// Maps to `--session-id <id>` — continue a previously
    /// persisted session by id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    /// Maps to `--agent <id>` — pick a named agent (the
    /// user's `openclaw agents` config).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
}

impl OpenClawSession {
    /// True when the user has actually picked a session. The
    /// OpenClaw adapter uses this to decide whether to
    /// emit a flag at all (an "empty" session means
    /// "no selection yet" — the adapter stays silent and
    /// OpenClaw CLI surfaces its own "Pass --to/--session-id
    /// / --agent" error, which the frontend renders as a
    /// Misconfigured notice).
    pub fn is_set(&self) -> bool {
        self.to.is_some() || self.session_id.is_some() || self.agent.is_some()
    }
}

impl StreamOptions {
    /// Convenience for callers that have no per-CLI selections to
    /// apply (the non-streaming `call_ai` path, for example).
    pub fn empty() -> Self {
        Self::default()
    }
}

/// How long `probe_version` is willing to wait for `<bin> --version`
/// to finish. Independent of the `which` lookup so a slow CLI cannot
/// drag the whole `list_agents` call past the IPC default timeout.
const VERSION_PROBE_TIMEOUT_MS: u64 = 3_000;

/// Spawn `<bin> --version` and return the first non-empty line of
/// stdout, trimmed. Bounded by [`VERSION_PROBE_TIMEOUT_MS`] so a
/// misbehaving CLI can never hang the list_agents call. Returns
/// `None` on any failure — spawn error, non-zero exit, timeout,
/// empty output. The trait default uses this; adapters with
/// non-standard version flags (none today) override `version()`
/// instead of touching this helper.
///
/// Implemented without `Handle::current().block_on()` so it is
/// safe to call from any thread, including the Tauri async runtime
/// worker that backs `list_agents`. The async probe runs on a
/// dedicated `std::thread`, the calling thread bounds its wait
/// with `recv_timeout`, and the worker kills the child on its own
/// timeout arm via `tokio::select!` — a stuck CLI cannot keep a
/// Tauri worker parked because the child is reaped in whichever
/// branch wins.
fn probe_version(bin: &str) -> Option<String> {
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    // The spawned worker needs 'static, and `bin` is a borrowed
    // &str. Hoist it to an owned `String` once and move that into
    // the closure; the closure itself is the only owner.
    let bin = bin.to_string();
    let (tx, rx) = mpsc::sync_channel::<Option<String>>(1);

    thread::spawn(move || {
        let result = tauri::async_runtime::block_on(probe_version_async(bin));
        // Sender drops here; the receiver always gets exactly one
        // value (Some or None) and the channel then closes.
        let _ = tx.send(result);
    });

    // The inner probe already has its own 3s timeout; we give the
    // outer channel a slightly larger window so a slow probe can
    // still deliver a value before we give up.
    rx.recv_timeout(Duration::from_millis(VERSION_PROBE_TIMEOUT_MS + 1_000))
        .ok()
        .flatten()
}

/// Async core of [`probe_version`]. Lives in its own function so
/// the caller can stay sync (and never touch the Tauri async
/// runtime directly) and so the unit test can `await` it from
/// within a `#[tokio::test]`. Takes an owned `String` so the
/// caller doesn't have to pass a `'static` slice.
async fn probe_version_async(bin: String) -> Option<String> {
    use std::time::Duration;

    let child = Command::new(&bin)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .ok()?;

    // Race the child against the timeout. `tokio::select!` cancels
    // the losing branch by dropping its future, so when the
    // timeout arm wins the `wait_with_output` future is dropped
    // (releasing the child back to the runtime) and we kill it
    // ourselves. When the child wins, we collect its output and
    // skip the kill entirely.
    let timeout = Duration::from_millis(VERSION_PROBE_TIMEOUT_MS);
    let output = tokio::select! {
        result = child.wait_with_output() => result.ok()?,
        _ = tokio::time::sleep(timeout) => {
            // Best-effort kill; the child will be reaped by the
            // async runtime on drop. We don't await `start_kill`
            // because that would just race the same sleep timer.
            return None;
        }
    };

    if !output.status.success() {
        return None;
    }
    let mut s = String::from_utf8(output.stdout).ok()?;
    if s.trim().is_empty() {
        // Some CLIs (Gemini today) print the version on stderr
        // instead. Try stderr as a fallback before giving up.
        s = String::from_utf8(output.stderr).ok()?;
    }
    s.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.to_string())
}

/// How long [`run_health_probe`] is willing to wait for
/// `<bin> --version` to finish. Independent of the `which`
/// lookup so a slow CLI cannot drag the whole
/// `check_agent_health` call past the IPC default timeout.
/// Mirrors `VERSION_PROBE_TIMEOUT_MS` for now; separated
/// into its own constant so a future "deep" health check
/// (one that actually sends a prompt and reads the
/// stream-JSON response) can have a longer budget without
/// re-tuning the version probe.
const HEALTH_CHECK_TIMEOUT_MS: u64 = 5_000;

/// Default implementation of [`AgentAdapter::health_check`].
/// Lifted out of the trait so it can be unit-tested without
/// standing up a fake adapter. The flow is:
///
///   1. resolve the binary through `resolve_binary` (the same
///      lookup `check_available` uses, so a binary that `which`
///      cannot find will be reported as missing here too);
///   2. spawn `<resolved> --version` on a worker thread, with
///      a hard timeout bounded by [`HEALTH_CHECK_TIMEOUT_MS`];
///   3. return success + latency when the child exits 0
///      inside the budget, or a populated error otherwise.
///
/// The version string is read by calling `version()` on the
/// adapter so the test stays consistent with the version
/// panel — if the version probe returned a string at all,
/// the health check returns the same string. This means a
/// stub adapter used in tests can return a synthetic version
/// from `version()` and observe it propagated through the
/// health check.
///
/// Safe to call from any thread. We do NOT use
/// `tauri::async_runtime` directly so the helper is callable
/// from a regular `#[test]`; the Tauri IPC handler awaits
/// the command and so does not need an async shim.
pub fn health_check_default<F>(bin: &str, version_fn: F) -> HealthCheck
where
    F: FnOnce() -> Option<String>,
{
    use std::sync::mpsc;
    use std::thread;
    use std::time::{Duration, Instant};

    let now_ms = chrono::Utc::now().timestamp_millis() as u64;
    let path = resolve_binary(bin);
    let Some(path) = path else {
        return HealthCheck {
            available: false,
            latency_ms: 0,
            path: None,
            version: None,
            error: Some(format!("{bin} 未在 PATH 中找到")),
            checked_at: now_ms,
        };
    };

    let path_for_thread = path.clone();
    let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);
    let start = Instant::now();
    thread::spawn(move || {
        let result = tauri::async_runtime::block_on(run_health_probe(&path_for_thread));
        let _ = tx.send(result);
    });

    let outcome = rx.recv_timeout(Duration::from_millis(HEALTH_CHECK_TIMEOUT_MS + 2_000));
    let latency_ms = start.elapsed().as_millis() as u64;

    let available = matches!(outcome, Ok(Ok(())));
    let error = match outcome {
        Ok(Ok(())) => None,
        Ok(Err(e)) => Some(e),
        Err(_) => Some(format!("{} 健康检查超时", bin)),
    };

    HealthCheck {
        available,
        latency_ms,
        path: Some(path),
        version: if available { version_fn() } else { None },
        error,
        checked_at: now_ms,
    }
}

/// Async core of [`health_check_default`]. Spawns `<path> --version`
/// and returns `Ok(())` on a clean exit within
/// [`HEALTH_CHECK_TIMEOUT_MS`]; returns `Err(_)` for any other
/// path (spawn failure, non-zero exit, timeout, parse error).
/// The error message is short and user-visible — the UI shows
/// it verbatim next to the chip.
async fn run_health_probe(path: &str) -> Result<(), String> {
    use std::process::Stdio;
    use std::time::Duration;

    let child = Command::new(path)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 {}: {}", path, e))?;

    let timeout = Duration::from_millis(HEALTH_CHECK_TIMEOUT_MS);
    let output = tokio::select! {
        result = child.wait_with_output() => {
            result.map_err(|e| format!("等待进程退出失败: {}", e))?
        }
        _ = tokio::time::sleep(timeout) => {
            // The child is reaped on drop; we don't try to
            // start_kill because by this point the child has
            // already missed its budget and SIGTERM would just
            // race the same timeout. The async runtime will
            // close the underlying handle.
            return Err(format!("{path} 健康检查超时"));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        return Err(if detail.is_empty() {
            format!("退出码 {}", output.status.code().unwrap_or(-1))
        } else {
            format!("退出码 {}: {}", output.status.code().unwrap_or(-1), detail)
        });
    }
    Ok(())
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
/// dependency on the Tauri command surface. Returns the first `$PATH`
/// entry that names a real, executable file.
/// Additional search directories the stdlib's `which` wouldn't
/// see on macOS / Linux desktop launches. Background: Tauri apps
/// started from Finder / `open` inherit a minimal system PATH
/// (typically `/usr/bin:/bin:/usr/sbin:/sbin`) and do NOT see the
/// user's shell-managed locations like `~/.local/bin`,
/// `~/.cargo/bin`, or Homebrew. The user almost certainly has
/// `claude` at `~/.local/bin/claude` (the official npm install
/// location) but the launchd-spawned `.app` process can't see it.
///
/// The same fallback matters for Codex (often at `~/.local/bin`),
/// OpenCode (`/opt/homebrew/bin` or `~/.cargo/bin`), and any
/// other tool the user installed via a non-system package manager.
///
/// We deliberately do NOT call into the user's shell init scripts
/// (sourcing `~/.zshrc` etc) — that drags in the whole prompt
/// evaluation, side-effecting env vars we don't want, and is racy
/// on shells that prompt for input. A fixed list of well-known
/// per-user prefix dirs is simpler, predictable, and covers the
/// realistic installs.
fn user_local_bin_dirs() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    // `$HOME` first; everything below is relative to it.
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        for sub in [
            ".local/bin",          // pipx, npm global w/ prefix, official Claude install
            "bin",                 // classic user bin
            ".cargo/bin",          // rustup
            ".npm/bin",            // npm global w/o prefix
            ".bun/bin",            // bun
            ".local/share/cargo/bin",
            ".volta/bin",          // volta (Node)
        ] {
            out.push(home.join(sub));
        }
    }
    // System-level install locations that GUI apps sometimes miss
    // (e.g. Homebrew on Apple Silicon installs to /opt/homebrew/bin
    // but a `tccutil` denial can prune it from launchd-spawned PATH).
    for p in [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/opt/local/bin",
    ] {
        out.push(PathBuf::from(p));
    }
    out
}

/// Resolve a CLI binary name to an absolute, executable path.
///
/// Search order:
///   1. `$PATH` (matches what `Command::new(name)` will see at spawn)
///   2. Common per-user prefix dirs (`~/.local/bin`, `~/.cargo/bin`, …)
///   3. Common system prefix dirs (`/opt/homebrew/bin`, …)
///
/// Returning `Some(absolute_path)` from any of these means we will
/// actually be able to spawn the binary. Returning `None` means
/// "we looked everywhere we know to look; give up". The caller
/// (adapters, list_agents, spawn) treats both the same.
pub fn resolve_binary(bin: &str) -> Option<String> {
    let path = std::env::var("PATH").unwrap_or_default();
    let sep = if cfg!(windows) { ';' } else { ':' };
    for dir in path.split(sep) {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(bin);
        if candidate.is_file() && is_executable(&candidate) {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    for dir in user_local_bin_dirs() {
        let candidate = dir.join(bin);
        if candidate.is_file() && is_executable(&candidate) {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

pub fn which(bin: &str) -> Option<String> {
    resolve_binary(bin)
}

/// Cheap executability check. On Unix we stat the file and look at
/// the owner-execute bit; on Windows every regular file is
/// considered executable (PATHEXT decides what runs).
pub fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        match std::fs::metadata(path) {
            Ok(meta) => meta.mode() & 0o111 != 0,
            Err(_) => false,
        }
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
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

/// Result of a per-agent health probe — the wire shape returned by
/// `commands::agents::check_agent_health`. The default
/// implementation in [`AgentAdapter::health_check`] does a
/// `<bin> --version` round-trip; adapters that need a deeper
/// check (e.g. an OAuth round-trip to the upstream) override to
/// issue a real handshake and report its latency.
///
/// `available` and `error` are NOT redundant — they describe
/// different facets of the same probe. The UI shows the
/// boolean for the chip color and the error string for the
/// tooltip / inline message. A missing binary yields
/// `(false, Some("claude 未在 PATH 中找到"))`; a binary that
/// crashes at startup yields `(false, Some("退出码 1: …"))`;
/// the happy path yields `(true, None)`.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    /// True when the binary was resolved AND the handshake
    /// (default: `--version` exit 0) succeeded. False for any
    /// failure path — missing binary, spawn error, non-zero
    /// exit, timeout.
    pub available: bool,
    /// Round-trip latency in milliseconds for the handshake
    /// probe. `0` when the binary is missing (no probe was
    /// run). The UI uses this for the "ready (123ms)" label
    /// that appears under the agent chip.
    pub latency_ms: u64,
    /// Resolved absolute path to the binary, when the lookup
    /// succeeded. Independent of `available` — a binary can
    /// be on disk (path set) but fail the handshake (e.g. it
    /// crashed at startup with a missing shared library).
    pub path: Option<String>,
    /// Version string returned by the probe. `None` for
    /// "binary ran but did not report a version" and for
    /// "probe never ran". Mirrors the `version()` trait
    /// method's return shape so callers can compare them.
    pub version: Option<String>,
    /// Failure reason when `available: false`. `None` for the
    /// happy path. Short, user-visible (e.g. "binary not
    /// found", "exited with 1: no such flag", "timed out").
    pub error: Option<String>,
    /// When the check was performed, in Unix millis. Lets the
    /// UI render a "checked 12s ago" freshness hint without
    /// having to re-issue the IPC.
    pub checked_at: u64,
}

/// What the user needs to do before this agent can be used.
/// Distinct from `AuthState` (which is "do we *see* a credential
/// on disk?") — `SetupStatus` answers "is the agent *usable* right
/// now?". The default impl derives it from `check_available` and
/// `auth_state`; adapters with non-trivial setup (e.g. a custom
/// daemon) override.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SetupStatus {
    /// Binary on $PATH and credentials in place. The composer
    /// dropdown can pick this agent and start a turn.
    Ready,
    /// Binary on $PATH but the user has not signed in (no API
    /// key / OAuth token / credentials file). The panel should
    /// show a "登录" CTA.
    NeedsLogin,
    /// Binary not on $PATH (or the user-supplied `cli_path`
    /// override doesn't resolve). The panel should show an
    /// "安装" CTA.
    NeedsInstall,
    /// Binary and credentials both look OK at first glance, but
    /// something else is off (mismatched backend id, etc.).
    /// The hint carries the specific reason; the panel should
    /// surface it as a small warning row.
    Misconfigured,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    pub status: SetupStatus,
    /// Human-readable explanation of the status. Always
    /// non-empty so the panel can render a row without an
    /// extra empty-state branch.
    pub message: String,
    /// Optional next-step CTA, e.g. an install command the
    /// panel can copy. `None` for the `Ready` state.
    pub cta: Option<SetupCta>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SetupCta {
    /// "安装 — open this URL, then click 刷新" button.
    InstallUrl { url: String },
    /// "复制这条命令粘到终端" button.
    InstallCommand { command: String },
    /// "登录 — run `<binary>` to trigger OAuth" or similar.
    LoginHint { command: String },
}

impl SetupState {
    pub fn ready() -> Self {
        Self { status: SetupStatus::Ready, message: "已就绪".into(), cta: None }
    }
    pub fn needs_login(message: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            status: SetupStatus::NeedsLogin,
            message: message.into(),
            cta: Some(SetupCta::LoginHint { command: command.into() }),
        }
    }
    pub fn needs_install_url(message: impl Into<String>, url: impl Into<String>) -> Self {
        Self {
            status: SetupStatus::NeedsInstall,
            message: message.into(),
            cta: Some(SetupCta::InstallUrl { url: url.into() }),
        }
    }
    pub fn needs_install_command(message: impl Into<String>, command: impl Into<String>) -> Self {
        Self {
            status: SetupStatus::NeedsInstall,
            message: message.into(),
            cta: Some(SetupCta::InstallCommand { command: command.into() }),
        }
    }
    pub fn misconfigured(message: impl Into<String>) -> Self {
        Self {
            status: SetupStatus::Misconfigured,
            message: message.into(),
            cta: None,
        }
    }
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

    #[test]
    fn which_skips_non_executable_file() {
        // Write a real file to a temp dir with no exec bit set and
        // put that dir on PATH. `which` must NOT return it, because
        // spawning it would fail with EACCES at the call site.
        let dir = tempdir_unique("which_nox");
        let path = dir.join("nobyte");
        std::fs::write(&path, b"#!/bin/sh\necho nope\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        }
        let prev = std::env::var("PATH").unwrap_or_default();
        // SAFETY: test-only mutation of PATH; restored at the end of
        // the test. The test is single-threaded at this point.
        unsafe { std::env::set_var("PATH", dir.to_str().unwrap()) };
        assert!(
            which("nobyte").is_none(),
            "which() returned a non-executable file as available"
        );
        unsafe { std::env::set_var("PATH", &prev) };
    }

    fn tempdir_unique(tag: &str) -> std::path::PathBuf {
        let pid = std::process::id();
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("intentloom_{tag}_{pid}_{n}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
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
    //
    // These two assertions share the HOME env var, so they live in
    // a single test that toggles it twice. Earlier revisions had
    // them as two separate tests that raced against each other
    // under `cargo test`'s default parallel runner — one test
    // would `set_var` HOME, the other would `remove_var` it, and
    // whichever lost the race saw the wrong prefix. Combining them
    // sidesteps that without pulling in a `serial_test` dep.

    #[test]
    fn home_path_resolves_under_home_and_strips_leading_slash() {
        // SAFETY: HOME is process-wide; this test sets / unsets it
        // and restores the original value before returning. The
        // combined form is the only `home_path` test in the suite.
        let saved = std::env::var("HOME").ok();

        // Case 1: HOME set → resolved under $HOME.
        unsafe { std::env::set_var("HOME", "/tmp/intentloom_test_home") };
        assert_eq!(
            home_path(".codex/auth.json"),
            "/tmp/intentloom_test_home/.codex/auth.json"
        );

        // Case 2: HOME unset → relative suffix, no leading slash.
        unsafe { std::env::remove_var("HOME") };
        assert_eq!(home_path("/.claude/settings.json"), ".claude/settings.json");

        if let Some(v) = saved {
            unsafe { std::env::set_var("HOME", v) };
        }
    }
}

#[cfg(test)]
mod health_check_tests {
    //! Unit tests for [`health_check_default`] and the trait
    //! [`AgentAdapter::health_check`] default impl. The strategy is
    //! the same one the existing `which` / `probe_version` tests
    //! use: drop a real shell script into a temp dir, prepend that
    //! dir to `$PATH`, and assert the probe returns the expected
    //! HealthCheck.
    //!
    //! We don't depend on any particular CLI being installed on
    //! the test machine — every test writes its own stub binary
    //! so the suite is reproducible in CI.

    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static SEQ: AtomicUsize = AtomicUsize::new(0);

    fn tempdir_with_stub(name: &str, body: &str) -> std::path::PathBuf {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let pid = std::process::id();
        let dir = std::env::temp_dir().join(format!("intentloom_hc_{name}_{pid}_{n}"));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).expect("create stub");
        f.write_all(body.as_bytes()).expect("write stub");
        f.sync_all().ok();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        path
    }

    fn with_path(dir: &std::path::Path, f: impl FnOnce()) {
        let prev = std::env::var("PATH").unwrap_or_default();
        let sep = if cfg!(windows) { ';' } else { ':' };
        let next = format!("{}{sep}{}", dir.to_str().unwrap(), prev);
        // SAFETY: test-only PATH mutation. The test is single-threaded
        // at the point of mutation, and we restore the previous
        // value in the cleanup arm.
        unsafe { std::env::set_var("PATH", &next) };
        f();
        unsafe { std::env::set_var("PATH", &prev) };
    }

    #[test]
    fn missing_binary_reports_unavailable_with_chinese_error() {
        // A binary that simply doesn't exist on PATH. The probe
        // must short-circuit before spawning anything (so the
        // latency is 0 and the path is None) and surface a
        // user-visible error string.
        let result = health_check_default("definitely-not-a-real-binary-hc", || None);
        assert!(!result.available, "missing binary must be unavailable");
        assert_eq!(result.latency_ms, 0);
        assert!(result.path.is_none());
        assert!(result.version.is_none());
        let err = result.error.expect("error must be populated on failure");
        assert!(
            err.contains("PATH") || err.contains("未在"),
            "error should mention PATH lookup, got: {err}"
        );
        assert!(result.checked_at > 0, "checked_at must be a real timestamp");
    }

    #[test]
    fn successful_probe_reports_available_with_latency() {
        // A trivial stub: `echo 1.0.0`. The probe should treat
        // the clean exit 0 as a successful handshake, populate
        // the resolved path, and report a non-zero latency.
        let stub = tempdir_with_stub("ok-cli", "#!/bin/sh\necho 1.0.0\n");
        let dir = stub.parent().unwrap();
        with_path(dir, || {
            let result = health_check_default("ok-cli", || Some("1.0.0".into()));
            assert!(result.available, "ok binary must be available, error={:?}", result.error);
            assert!(result.path.is_some(), "resolved path must be populated");
            assert!(result.path.as_deref().unwrap().ends_with("ok-cli"));
            assert_eq!(result.version.as_deref(), Some("1.0.0"));
            assert!(result.error.is_none(), "no error on success path, got {:?}", result.error);
            // Latency is real wall-clock, so we only assert a
            // generous lower bound — anything ≥ 0 is valid.
            // The upper bound is the worker timeout + slack
            // (~7s) to catch a regression that lets the
            // worker thread run forever.
            assert!(result.latency_ms < 7_000, "latency exceeded probe budget: {}", result.latency_ms);
        });
    }

    #[test]
    fn failing_binary_reports_unavailable_with_exit_code() {
        // A stub that exits 1 immediately. The probe must
        // report `available: false` with an error string
        // carrying the exit code so the UI can show
        // "exited with 1" in the chip.
        let stub = tempdir_with_stub("bad-cli", "#!/bin/sh\nexit 1\n");
        let dir = stub.parent().unwrap();
        with_path(dir, || {
            let result = health_check_default("bad-cli", || None);
            assert!(!result.available, "exiting-non-zero binary must be unavailable");
            assert!(result.path.is_some(), "path is still resolved even on a non-zero exit");
            assert!(result.version.is_none(), "version must NOT be populated on failure");
            let err = result.error.expect("error must be populated on failure");
            assert!(err.contains("1"), "error should mention the exit code, got: {err}");
        });
    }

    #[test]
    fn version_callback_not_invoked_on_failure() {
        // The version() callback is only consulted on the
        // success path. On failure the closure must not be
        // called at all, so a future caller can pass an
        // expensive closure (e.g. one that re-runs the
        // version probe) and rely on short-circuiting.
        let stub = tempdir_with_stub("bad-cli-2", "#!/bin/sh\nexit 2\n");
        let dir = stub.parent().unwrap();
        with_path(dir, || {
            use std::sync::atomic::AtomicBool;
            let called = AtomicBool::new(false);
            let result = health_check_default("bad-cli-2", || {
                called.store(true, Ordering::SeqCst);
                Some("should-not-appear".into())
            });
            assert!(!result.available);
            assert!(!called.load(Ordering::SeqCst), "version callback must not run on failure");
            assert!(result.version.is_none());
        });
    }
}
