/**
 * Tests for the `friendlySendError` helper — the pure
 * function that maps a raw Rust error string from
 * `send_chat_message` into a user-facing message.
 *
 * These strings end up in the toast AND in the red
 * transcript notice, so a regression is a UX regression
 * for every chat that fails to spawn. Pinning the exact
 * mapping here is the cheapest way to keep that surface
 * stable.
 *
 * The function is pure (no React, no Zustand, no Tauri)
 * so the tests are direct unit tests — no rendering,
 * no mocking, no async.
 */

import { describe, expect, it } from "vitest";
import { friendlySendError } from "@/lib/reasonixAdapter";

describe("friendlySendError", () => {
  it("returns a clean fallback for an empty / whitespace input", () => {
    expect(friendlySendError("", "claude")).toBe("claude 调用失败");
    expect(friendlySendError("   ", "claude")).toBe("claude 调用失败");
  });

  it("maps OS-level ENOENT / 'No such file' to a clear install hint", () => {
    expect(
      friendlySendError('No such file or directory (os error 2)', "claude"),
    ).toContain("claude 不可用");
    expect(
      friendlySendError('No such file or directory (os error 2)', "claude"),
    ).toContain("PATH");
    // Codex is the more common case on this dev box —
    // make sure the CLI name is interpolated, not
    // hard-coded to "claude".
    expect(
      friendlySendError("not found", "codex"),
    ).toContain("codex 不可用");
    // Lower-case "no such file" is what the macOS spawn
    // error actually produces; the lower() check in the
    // function is what makes this pass.
    expect(
      friendlySendError("spawn: no such file", "gemini"),
    ).toContain("gemini 不可用");
    // And `enoent` (the literal errno string) should also
    // be caught.
    expect(
      friendlySendError("fork: enoent", "claude"),
    ).toContain("claude 不可用");
  });

  it("maps EACCES / 'Permission denied' to a chmod hint", () => {
    expect(
      friendlySendError("Permission denied (os error 13)", "claude"),
    ).toContain("权限不足");
    expect(
      friendlySendError("Permission denied (os error 13)", "claude"),
    ).toContain("chmod");
    // Lower-case variant must also match — the spawn
    // error on macOS is `permission denied`.
    expect(
      friendlySendError("spawn: permission denied", "claude"),
    ).toContain("chmod");
  });

  it("preserves the stderr detail from the 'AI CLI error:' wrapper", () => {
    expect(
      friendlySendError("AI CLI error: not logged in", "claude"),
    ).toBe("claude 调用失败：not logged in");
    expect(
      friendlySendError("AI CLI error: invalid API key", "codex"),
    ).toBe("codex 调用失败：invalid API key");
  });

  it("truncates very long stderr details to keep the toast readable", () => {
    const long = "x".repeat(500);
    const out = friendlySendError(`AI CLI error: ${long}`, "claude");
    expect(out).toContain("claude 调用失败：");
    // 120 chars of detail + the ellipsis. The hard cap is
    // intentionally loose so the test does not have to
    // re-derive the exact threshold; we just check that
    // the full 500-char string did NOT make it through.
    expect(out).not.toContain("x".repeat(500));
  });

  it("translates the 'AI CLI exited with N' wrapper into a friendlier phrase", () => {
    // The pre-flight check should normally catch this
    // case, but if the binary resolves at startup and
    // disappears mid-stream (a common dev-box
    // scenario), the Rust side still surfaces this
    // wrapper. Make sure it gets translated.
    expect(
      friendlySendError("AI CLI exited with 1", "claude"),
    ).toContain("claude 启动失败");
    expect(
      friendlySendError("AI CLI exited with 1", "claude"),
    ).toContain("退出码 1");
    expect(
      friendlySendError("AI CLI exited with 127", "codex"),
    ).toContain("codex 启动失败");
    expect(
      friendlySendError("AI CLI exited with 127", "codex"),
    ).toContain("退出码 127");
    // Negative exit codes (signal-killed) are also valid.
    expect(
      friendlySendError("AI CLI exited with -1", "claude"),
    ).toContain("退出码 -1");
  });

  it("falls back to a passthrough for unknown errors with the CLI name prepended", () => {
    // The pre-flight check in `send()` already maps
    // known shapes, but a future Rust change could
    // surface a new error string. The fallback should
    // still prefix the CLI name so the user can tell
    // which engine failed.
    const out = friendlySendError("something completely unexpected", "codex");
    expect(out).toContain("codex 调用失败");
    expect(out).toContain("something completely unexpected");
  });

  it("trims surrounding whitespace before matching / passing through", () => {
    expect(
      friendlySendError("  No such file or directory  ", "claude"),
    ).toContain("claude 不可用");
    expect(
      friendlySendError("  AI CLI error: not logged in  ", "claude"),
    ).toBe("claude 调用失败：not logged in");
  });

  it("translates the stale-workspace wrapper from build_command cwd validation", () => {
    // `commands/ai.rs::build_command` rejects a `cwd` that
    // doesn't exist on disk BEFORE spawning, by emitting an
    // `AI CLI error: 工作目录不可用: <path> (文件夹可能已被删除)`
    // string. The same `AI CLI error:` prefix means the
    // existing wrapper regex already catches it; this test
    // pins the exact user-facing phrasing so a future Rust
    // message tweak does not silently change the toast.
    const msg =
      "AI CLI error: 工作目录不可用: /tmp/old-workspace (文件夹可能已被删除)";
    const out = friendlySendError(msg, "claude");
    expect(out).toContain("claude 调用失败");
    expect(out).toContain("/tmp/old-workspace");
  });
});
