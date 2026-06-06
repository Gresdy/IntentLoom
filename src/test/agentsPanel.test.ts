import { describe, expect, it } from "vitest";
import { AGENT_INSTALL_INFO } from "@/components/LeftPanel/AgentsPanel";

// The six ids the Rust registry (src-tauri/src/agents/) and the
// TopBar / agents panel must agree on. Keep this list as the
// single source of truth for "what IntentLoom knows how to
// route to" on the front-end — `agents::registry_contains_six_adapters`
// is the matching Rust-side test in src-tauri/src/agents/mod.rs.
const KNOWN_IDS = [
  "claude",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
] as const;

describe("AgentsPanel.AGENT_INSTALL_INFO", () => {
  it("covers exactly the six registered adapter ids", () => {
    const keys = Object.keys(AGENT_INSTALL_INFO).sort();
    expect(keys).toEqual([...KNOWN_IDS].sort());
  });

  it("never re-introduces the dead kiro / nanobot ids", () => {
    // T4 dropped these on purpose: there is no matching adapter
    // in the Rust registry, so the install button was a 404 in
    // disguise. If a future contributor copies one back in, the
    // mismatch with KNOWN_IDS above will already fail; this test
    // makes the intent explicit so the failure message is clear.
    expect("kiro" in AGENT_INSTALL_INFO).toBe(false);
    expect("nanobot" in AGENT_INSTALL_INFO).toBe(false);
  });

  it("every entry has a non-empty url and command", () => {
    for (const [id, info] of Object.entries(AGENT_INSTALL_INFO)) {
      expect(info.url.length, `${id} url should be non-empty`).toBeGreaterThan(0);
      expect(info.command.length, `${id} command should be non-empty`).toBeGreaterThan(0);
      // http(s) only — the install button is wired to window.open
      // and we don't want javascript: or file: urls slipping in.
      expect(info.url.startsWith("https://") || info.url.startsWith("http://")).toBe(true);
    }
  });
});
