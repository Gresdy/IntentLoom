use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::agents::{find_adapter, StreamOptions};
use crate::agents::resolve_binary;

/// Registry of in-flight AI CLI children, keyed by the session id
/// emitted from `stream_ai`. The frontend calls
/// `cancel_ai(session_id)` to interrupt a long-running turn without
/// killing the whole Tauri process — today every "running" chat is one
/// spawned child, so cancelling the child is the right granularity.
///
/// We store just the PID (not the `Child` itself) for two reasons:
///   1. `child.wait()` and `child.start_kill()` both need `&mut self`,
///      and there is no way to hold the `Child` inside the registry
///      while the wait task is borrowing it. PID-based kill avoids
///      that mutex dance entirely.
///   2. The PID survives even after the wait task has taken ownership
///      of the child, so cancel can fire any time after spawn.
#[derive(Default)]
pub struct AiProcessRegistry {
    /// session_id -> OS pid. Entries are inserted after a successful
    /// `child.spawn()` and removed in the wait task's exit branch
    /// (success or error). Cancelling a session removes the entry
    /// *before* sending the signal, so a second cancel is a no-op.
    inner: Mutex<HashMap<String, u32>>,
}

impl AiProcessRegistry {
    /// Insert (session_id, pid) so a subsequent `cancel_ai` can find
    /// it. The caller has just spawned the child and the OS has
    /// assigned a pid; we only fail loudly if the registry mutex is
    /// poisoned (someone else panicked while holding it).
    pub fn register(&self, session_id: &str, pid: u32) {
        self.inner
            .lock()
            .expect("AiProcessRegistry mutex poisoned")
            .insert(session_id.to_string(), pid);
    }

    /// Drop the (session_id, pid) entry. Called from the wait task on
    /// every exit path, and from `cancel_ai` after the kill has been
    /// dispatched. Idempotent — removing a missing key is fine.
    pub fn unregister(&self, session_id: &str) -> Option<u32> {
        self.inner
            .lock()
            .expect("AiProcessRegistry mutex poisoned")
            .remove(session_id)
    }

    /// Look up the pid for a session_id without removing it. Used by
    /// tests; the live cancel path uses [`take_for_cancel`] so a
    /// second cancel doesn't double-send SIGTERM.
    ///
    /// [`take_for_cancel`]: Self::take_for_cancel
    pub fn lookup(&self, session_id: &str) -> Option<u32> {
        self.inner
            .lock()
            .expect("AiProcessRegistry mutex poisoned")
            .get(session_id)
            .copied()
    }

    /// Remove and return the pid for a session_id, if any. Used by
    /// `cancel_ai` so a second cancel targeting the same session is
    /// observable (returns `None`).
    pub fn take_for_cancel(&self, session_id: &str) -> Option<u32> {
        self.inner
            .lock()
            .expect("AiProcessRegistry mutex poisoned")
            .remove(session_id)
    }
}

/// Send SIGTERM to `pid` on unix, `taskkill /F /T /PID` on Windows.
/// Returns `true` if the signal was dispatched (the OS may still
/// refuse to honour it for a non-existent / owned-by-another-user
/// process — that case is the caller's problem, not ours).
fn kill_process(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // Safety: libc::kill takes a pid and a signal number. We
        // explicitly pass SIGTERM (not SIGKILL) so the child gets a
        // chance to flush stdout / release locks before exiting. The
        // wait task will observe the exit and clean up the registry
        // entry on its own; cancel_ai also removes the entry to make
        // a second cancel observable.
        unsafe { libc::kill(pid as i32, libc::SIGTERM) == 0 }
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// Build the [`Command`] used to invoke `cli` for streaming output.
/// Every adapter owns its own flag layout (Claude uses
/// `--print-format-json --prompt`, Gemini uses `-p --output-format
/// stream-json`, Codex uses `exec --json`, OpenClaw uses
/// `agent --local --json -m`). Unknown ids are rejected so the call
/// site doesn't silently fall back to a default that only matches
/// Claude. The `opts` argument is plumbed to the adapter so per-CLI
/// mode / reasoning flags make it onto the wire.
fn build_command(cli: &str, prompt: &str, opts: &StreamOptions) -> Result<Command, String> {
    let adapter = find_adapter(cli).ok_or_else(|| format!("Unknown AI CLI: {cli}"))?;
    let adapter_cmd = adapter.build_stream_command(prompt, opts);

    // The adapter's `build_stream_command` constructs
    // `Command::new(self.binary())` with just the bare name (e.g.
    // "claude"). On a Tauri `.app` bundle that inherits a minimal
    // system PATH, that lookup fails with "No such file or
    // directory" even when the user's shell PATH includes the
    // binary at e.g. `~/.local/bin/claude`. The std/tokio Command
    // type has no `set_program`, so we re-resolve via
    // `resolve_binary` (which knows the user-local fallback list)
    // and rebuild the Command with the absolute path. Args are
    // copied across so the adapter's per-CLI flag layout is
    // preserved verbatim. Stdio is reapplied when set. Env vars are
    // NOT copied here because none of the current adapters set any
    // on the Command (the CLI reads its env from the shell
    // environment or `~/.claude/settings.json` at spawn time).
    let Some(resolved) = resolve_binary(cli) else {
        // No resolution; fall through with the adapter's original
        // Command so the spawn error stays informative
        // ("No such file or directory" against the bare name).
        return Ok(adapter_cmd);
    };

    // Extract everything we need into owned values before dropping
    // `adapter_cmd`. We have to give the local bindings names that
    // don't shadow `std::io::stdin` / `stdout` / `stderr` (which
    // would otherwise be resolved to those statics via name
    // resolution and confuse the borrow checker).
    let std_cmd = adapter_cmd.as_std();
    let args: Vec<std::ffi::OsString> =
        std_cmd.get_args().map(|a| a.to_os_string()).collect();
    let adapter_current_dir = std_cmd.get_current_dir().map(|p| p.to_path_buf());
    // `std_cmd` is a `&std::process::Command` borrowed from
    // `adapter_cmd`; we just stop using it so the borrow can
    // end. The explicit `let _ =` is the idiomatic
    // "intentionally discard" pattern (the original code used
    // `drop(std_cmd)` which `clippy` flagged as a no-op for
    // references).
    let _ = std_cmd;

    // Re-construct a fresh Command targeting the resolved absolute
    // path. The adapter's args + working dir are reapplied so the
    // per-CLI flag layout is preserved verbatim. Stdio is hard-
    // wired to piped because (a) every adapter's
    // `build_stream_command` already sets piped stdout/stderr for
    // the streaming protocol, and (b) `std::process::Command`
    // does not expose stable per-stream getters on stable Rust
    // (`get_stdio` is nightly-only), so we cannot faithfully copy
    // the adapter's stdio config back into the new Command
    // without depending on a nightly feature. Piped is the
    // correct choice for the streaming case anyway — the
    // reader task consumes stdout and the caller does not
    // need to write to stdin.
    let mut cmd = Command::new(resolved);
    cmd.args(args);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    // CWD resolution priority:
    //   1. `opts.cwd` from the frontend — the workspace the user
    //      picked from the folder dialog. This is the common case
    //      and the one the user actually expects (Claude's `Read`
    //      / `Edit` / `Bash` should operate on the project shown
    //      in the status bar, not on Tauri's launch directory).
    //   2. The adapter's own `Command::current_dir` if it set one
    //      (none of today's adapters do, but the path stays open
    //      for a future adapter that wants to lock itself to a
    //      sub-directory of the user's project).
    //   3. Inherit the parent process's CWD — the right fallback
    //      for `call_ai` / Skills callers that pass no cwd and
    //      for unit tests.
    //
    // The frontend-supplied cwd is validated up front so a stale
    // path (workspace folder was deleted between the picker and
    // the next send) fails with the same "AI CLI error" wrapper
    // the spawn path would have used, instead of a bare OS
    // error that bypasses the friendlySendError mapping.
    if let Some(cwd) = opts.cwd.as_deref().filter(|s| !s.is_empty()) {
        let path = std::path::Path::new(cwd);
        if !path.is_dir() {
            return Err(format!(
                "AI CLI error: 工作目录不可用: {cwd} (文件夹可能已被删除)"
            ));
        }
        cmd.current_dir(path);
    } else if let Some(d) = adapter_current_dir {
        cmd.current_dir(d);
    }
    Ok(cmd)
}

/// Non-streaming call: waits for the whole output. The optional
/// `mode` / `reasoning` strings are forwarded to the adapter so the
/// non-streaming path (used by some Skills, the market tool, etc.) gets
/// the same flag treatment as the streaming path.
#[command]
pub async fn call_ai(
    cli: String,
    prompt: String,
    mode: Option<String>,
    reasoning: Option<String>,
    cwd: Option<String>,
    openclaw_session: Option<crate::agents::OpenClawSession>,
) -> Result<String, String> {
    let opts = StreamOptions { mode, reasoning, cwd, openclaw_session };
    let mut cmd = build_command(&cli, &prompt, &opts)?;
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to execute {cli}: {e}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("AI CLI error: {stderr}"))
    }
}

/// Streaming call: spawns the CLI, reads stdout line by line, and emits
/// `ai-stream-chunk` / `ai-stream-end` events through the Tauri event bus.
/// The chunk event carries the raw line as a string payload (the React side
/// listens with `listen<string>('ai-stream-chunk', ...)`); the end event
/// carries either `"ok"` or `"exit: <code>"`. Returns the final session id
/// once the process exits. The optional `mode` and `reasoning` strings
/// are forwarded to the adapter so the per-CLI composer dropdowns land
/// on the CLI's argv verbatim.
#[command]
pub async fn stream_ai(
    app: AppHandle,
    cli: String,
    prompt: String,
    session_id: Option<String>,
    mode: Option<String>,
    reasoning: Option<String>,
    cwd: Option<String>,
    openclaw_session: Option<crate::agents::OpenClawSession>,
) -> Result<String, String> {
    // We need the registry both to register the spawned pid and to
    // unregister it on every exit branch. `app.state` is the cheap
    // lookup; we do it once at the top so the wait/cleanup paths can
    // reach it without re-resolving. We also keep the `pid` local so
    // the unregister call doesn't have to re-read the map.
    let registry = app.state::<AiProcessRegistry>();
    let mut registered_pid: Option<u32> = None;
    // Reject unknown ids early so the call site doesn't get a half-baked
    // Command back from the default shape.
    if find_adapter(&cli).is_none() {
        return Err(format!("Unknown AI CLI: {cli}"));
    }

    let sid = session_id.unwrap_or_else(|| {
        format!(
            "ai-{}-{:x}",
            chrono::Utc::now().timestamp_millis(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.subsec_nanos())
                .unwrap_or(0)
        )
    });

    let opts = StreamOptions { mode, reasoning, cwd, openclaw_session };
    let mut child = build_command(&cli, &prompt, &opts)?
        .spawn()
        .map_err(|e| format!("Failed to spawn {cli}: {e}"))?;
    // Register the pid BEFORE handing the child to the wait task so a
    // cancel that races the spawn can still find a process to kill.
    // tokio::process::Child::id() returns `Option<u32>`; the OS
    // always assigns a pid for `spawn()` on unix, but on Windows the
    // child may be created without a handle until the first syscall.
    // We treat None as "not cancellable" rather than failing the
    // whole stream — the chat will still work, just no cancel.
    if let Some(pid) = child.id() {
        registry.register(&sid, pid);
        registered_pid = Some(pid);
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "No stdout".to_string())?;

    let app_for_lines = app.clone();
    let reader_handle = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            if line.is_empty() {
                continue;
            }
            // Frontend listens for string payload on ai-stream-chunk, so we
            // emit the raw line directly. session_id still lives on the
            // closure-captured `sid` if consumers need it later.
            let _ = app_for_lines.emit("ai-stream-chunk", line);
        }
    });

    // Wrap the wait + end event in a closure so every exit path
    // (Ok / Err / early return on stdin grab) unregisters the pid
    // exactly once. We use a block instead of a `?` early-return so
    // the cleanup is unconditional.
    let result: Result<String, String> = async {
        let status = child
            .wait()
            .await
            .map_err(|e| format!("Process wait failed: {e}"))?;

        let _ = reader_handle.await;

        let _ = app.emit(
            "ai-stream-end",
            if status.success() {
                "ok".to_string()
            } else {
                format!("exit: {}", status.code().unwrap_or(-1))
            },
        );

        if status.success() {
            Ok(sid.clone())
        } else {
            Err(format!("AI CLI exited with {}", status.code().unwrap_or(-1)))
        }
    }
    .await;

    if let Some(pid) = registered_pid.take() {
        // Sanity check: if the registry still has a different pid
        // (cancel removed ours mid-wait), don't overwrite.
        if let Some(stored) = registry.lookup(&sid) {
            if stored == pid {
                registry.unregister(&sid);
            }
        } else {
            // Already removed by cancel_ai; nothing to do.
            let _ = pid;
        }
    }

    result
}

/// Friendly wrapper used by the React chat surface
/// (`reasonixAdapter`). Forwards to [`stream_ai`] so the same
/// `ai-stream-chunk` / `ai-stream-end` event contract is honored end-to-end.
/// The optional `project_path` is prepended as a `[cwd: ...]` hint that
/// CLI tools can pick up if they want to scope the run. The `mode` and
/// `reasoning` strings are read from the composer's per-CLI dropdowns.
///
/// `project_path` is also forwarded to [`stream_ai`] as the `cwd`
/// option so the spawned CLI runs (and any tools it invokes —
/// `Read`, `Edit`, `Bash`, …) operate on the workspace the user
/// picked from the folder dialog. The `[cwd: ...]` prefix stays
/// in the prompt as a redundant, model-visible hint: belt-and-
/// braces for adapters that don't honour process CWD, and so the
/// model can answer "what is the current directory?" without
/// having to call a tool.
#[command]
pub async fn send_chat_message(
    app: AppHandle,
    cli: String,
    message: String,
    conversation_id: String,
    project_path: Option<String>,
    mode: Option<String>,
    reasoning: Option<String>,
    openclaw_session: Option<crate::agents::OpenClawSession>,
) -> Result<String, String> {
    let prefix = project_path
        .as_deref()
        .map(|p| format!("[cwd: {p}]\n"))
        .unwrap_or_default();
    let prompt = format!("{prefix}{message}");
    stream_ai(
        app,
        cli,
        prompt,
        Some(conversation_id),
        mode,
        reasoning,
        project_path,
        openclaw_session,
    )
    .await
}

#[command]
pub async fn cancel_ai(
    registry: tauri::State<'_, AiProcessRegistry>,
    session_id: String,
) -> Result<bool, String> {
    // Take the pid out of the registry *first* so a second cancel
    // targeting the same session observes "nothing to do" instead of
    // sending a duplicate SIGTERM. If the wait task had already
    // unregister()d on natural exit, this returns None and we report
    // false — the caller's UI is in the same state either way.
    let pid = registry.take_for_cancel(&session_id);
    match pid {
        Some(pid) => {
            let dispatched = kill_process(pid);
            if !dispatched {
                tracing::warn!(pid, session_id, "cancel_ai: kill returned false");
            }
            Ok(dispatched)
        }
        None => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- AiProcessRegistry --

    #[test]
    fn registry_register_then_lookup_returns_pid() {
        let r = AiProcessRegistry::default();
        r.register("s-1", 1234);
        assert_eq!(r.lookup("s-1"), Some(1234));
        assert_eq!(r.lookup("s-missing"), None);
    }

    #[test]
    fn registry_take_for_cancel_removes_entry() {
        let r = AiProcessRegistry::default();
        r.register("s-1", 1234);
        // First take returns the pid and removes the entry — a
        // second cancel targeting the same session observes nothing.
        assert_eq!(r.take_for_cancel("s-1"), Some(1234));
        assert_eq!(r.take_for_cancel("s-1"), None);
        assert_eq!(r.lookup("s-1"), None);
    }

    #[test]
    fn registry_unregister_is_idempotent() {
        let r = AiProcessRegistry::default();
        // Unregistering a session that was never registered is a
        // no-op. The wait task calls unregister on every exit
        // branch, so it must not panic when the entry was already
        // taken by cancel_ai.
        assert_eq!(r.unregister("never-registered"), None);
        r.register("s-1", 42);
        assert_eq!(r.unregister("s-1"), Some(42));
        assert_eq!(r.unregister("s-1"), None);
    }

    #[test]
    fn registry_handles_many_concurrent_sessions() {
        let r = AiProcessRegistry::default();
        for i in 0..50u32 {
            r.register(&format!("s-{i}"), 1000 + i);
        }
        // Lookup all of them back; the order doesn't matter but
        // every entry must be there.
        for i in 0..50u32 {
            assert_eq!(r.lookup(&format!("s-{i}")), Some(1000 + i));
        }
        // Take even-indexed ones out; odd ones stay.
        for i in (0..50u32).step_by(2) {
            assert_eq!(r.take_for_cancel(&format!("s-{i}")), Some(1000 + i));
        }
        for i in 0..50u32 {
            let expected = if i % 2 == 0 { None } else { Some(1000 + i) };
            assert_eq!(r.lookup(&format!("s-{i}")), expected);
        }
    }

    #[test]
    fn kill_process_does_not_panic_on_any_input() {
        // We deliberately do NOT call kill_process() with our own
        // pid, `0` (process group), `-1`, or `u32::MAX` (which
        // truncates to -1 in i32) — any of those would broadcast
        // SIGTERM to the test runner itself on Unix. Stay strictly
        // above any plausible pid (Linux default pid_max is
        // 4194304; macOS pids rarely exceed a few hundred thousand)
        // and strictly positive, so libc::kill returns -1/ESRCH
        // safely and taskkill exits non-zero. The only invariant
        // worth testing is "the function returns a bool and does
        // not panic on a definitely-out-of-range pid".
        let _ = kill_process(2_000_000_000);
        let _ = kill_process(1_000_000_000);
        let _ = kill_process(50_000_000);
    }

    // -- existing tests below --

    #[test]
    fn call_ai_unknown_cli_rejects() {
        // Exercise the same lookup synchronously to keep the test fast.
        assert!(find_adapter("not-a-real-cli").is_none());
        // All five registered ids resolve to an adapter.
        for id in ["claude", "gemini", "codex", "opencode", "openclaw", "hermes"] {
            assert!(find_adapter(id).is_some(), "expected adapter for {id}");
        }
    }

    #[test]
    fn build_command_routes_to_claude_default_flags() {
        // Claude's default build_stream_command is the canonical shape.
        // We assert on the std::process::Command that tokio wraps so we
        // can read back program + args.
        //
        // `build_command` re-resolves the binary through
        // `resolve_binary` so the program field is the *absolute*
        // path (e.g. `/Users/foo/.local/bin/claude`), not the
        // bare `claude` the adapter requested. That re-resolution
        // is what makes the streaming call survive a Tauri
        // `.app` launch with a minimal inherited PATH — the
        // adapter's `Command::new("claude")` would otherwise fail
        // with "No such file or directory" on macOS Finder
        // launches. We assert the resolved program is a path
        // whose final segment is `claude` so the test stays
        // accurate as the resolved location changes from
        // machine to machine.
        let cmd = build_command("claude", "hello", &StreamOptions::default()).unwrap();
        let std_cmd = cmd.as_std();
        let program = std_cmd.get_program();
        let program_name = std::path::Path::new(program)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        assert_eq!(program_name, "claude", "resolved program should end in 'claude', got {program:?}");
        let args: Vec<&str> = std_cmd
            .get_args()
            .map(|a| a.to_str().expect("utf-8 arg"))
            .collect();
        // Updated 2026-06-08 to match the new Claude Code
        // invocation shape verified against Claude v2.1.143:
        //   claude -p <prompt> --output-format stream-json --verbose
        // The old `--print-format-json --prompt` shape stopped
        // being accepted in recent CLI releases.
        assert_eq!(args, vec!["-p", "hello", "--output-format", "stream-json", "--verbose"]);
    }

    // -- cwd propagation --
    //
    // `build_command` is the single chokepoint for setting the
    // child's working directory: it plumbs `opts.cwd` from the
    // `send_chat_message` IPC into `Command::current_dir` and
    // validates the path up front so a stale workspace (the user
    // deleted the folder between the picker and the next send)
    // surfaces a clean error instead of a confusing OS-level
    // ENOENT. These tests pin the three branches — Some valid,
    // Some stale, None — so a future refactor that drops the
    // validation or silently ignores `cwd` will fail loudly.

    #[test]
    fn build_command_applies_frontend_cwd() {
        // Use std::env::temp_dir() as the workspace — guaranteed
        // to exist on every platform and trivially writable, so
        // the test stays hermetic and CI-friendly.
        let workspace = std::env::temp_dir();
        let opts = StreamOptions {
            cwd: Some(workspace.to_string_lossy().to_string()),
            ..StreamOptions::default()
        };
        let cmd = build_command("claude", "hello", &opts).unwrap();
        let cwd = cmd.as_std().get_current_dir().expect("cwd should be set");
        // Compare canonical paths so a /tmp -> /private/tmp
        // symlink resolution on macOS doesn't false-fail the
        // assertion.
        assert_eq!(
            std::fs::canonicalize(cwd).unwrap(),
            std::fs::canonicalize(&workspace).unwrap(),
        );
    }

    #[test]
    fn build_command_rejects_stale_cwd() {
        // A path that almost certainly does not exist on the test
        // runner. Using a sentinel under temp_dir is fine too,
        // but a single-component name under root is simpler and
        // still hermetic.
        let stale = "/this/path/should/never/exist/on/the/test/runner";
        let opts = StreamOptions {
            cwd: Some(stale.to_string()),
            ..StreamOptions::default()
        };
        let err = build_command("claude", "hello", &opts).unwrap_err();
        // The wrapper mirrors the spawn-failure wrapper so the
        // frontend's `friendlySendError` mapping picks it up and
        // the user sees a single consistent error shape.
        assert!(err.starts_with("AI CLI error:"), "got: {err}");
        assert!(err.contains("工作目录不可用"), "got: {err}");
        assert!(err.contains(stale), "stale path missing from error: {err}");
    }

    #[test]
    fn build_command_ignores_empty_cwd() {
        // An empty string from the frontend (e.g. a user
        // deliberately clearing the workspace) must NOT fail
        // validation. The contract is "empty == no cwd", not
        // "empty == error".
        let opts = StreamOptions {
            cwd: Some(String::new()),
            ..StreamOptions::default()
        };
        let cmd = build_command("claude", "hello", &opts).unwrap();
        // No current_dir was set — the child inherits the
        // parent's CWD, which is what the hook is asserting
        // by passing empty.
        assert!(cmd.as_std().get_current_dir().is_none());
    }

    #[test]
    fn build_command_inherits_cwd_when_unset() {
        // The default `StreamOptions` has `cwd: None`; the
        // resulting Command must NOT have a current_dir, so
        // the child runs in the parent's CWD. This is the
        // path the bare `call_ai` and unit tests use.
        let cmd = build_command("claude", "hello", &StreamOptions::default()).unwrap();
        assert!(cmd.as_std().get_current_dir().is_none());
    }
}
