/**
 * Tests for `useAgentReadinessCheck` — the on-demand health
 * probe that complements the bulk `list_agents` discovery
 * call. Mirrors the AionUi `useAgentReadinessCheck` test
 * surface: verify the hook drives the backend
 * `check_agent_health` IPC, surfaces the response in
 * `state.isReady` / `state.error`, and short-circuits to
 * `findAlternatives` on failure.
 *
 * The Rust side has its own end-to-end coverage in
 * `src-tauri/src/agents/mod.rs#health_check_tests`; this
 * file is the on-the-wire assertion that the front-end hook
 * actually talks to the IPC surface and that the response
 * shape is consumed end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const invokeMock = vi.fn();
vi.mock("@/lib/tauri", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

import {
  useAgentReadinessCheck,
} from "@/hooks/useAgentReadinessCheck";
import { useAgentStore } from "@/lib/useAgents";

function mountHook(
  id: string,
  options?: {
    onAgentReady?: Parameters<typeof useAgentReadinessCheck>[0]["onAgentReady"];
  },
) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let latest: ReturnType<typeof useAgentReadinessCheck> | null = null;
  const Capture = () => {
    const hook = useAgentReadinessCheck({ id, onAgentReady: options?.onAgentReady });
    // Stash the hook result on every render so the test can
    // read the latest state + call the actions.
    latest = hook;
    return null;
  };
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(createElement(Capture));
  });
  return {
    get: () => {
      if (!latest) throw new Error("hook never captured");
      return latest;
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

const happyReport = (id: string, latencyMs: number) => ({
  id,
  health: {
    available: true,
    latencyMs,
    path: `/usr/local/bin/${id}`,
    version: "1.0.0",
    error: null,
    checkedAt: Date.now(),
  },
  auth: { status: "logged_in", hint: null },
  setup: { status: "ready", message: "已就绪" },
});

const failReport = (id: string, error: string) => ({
  id,
  health: {
    available: false,
    latencyMs: 0,
    path: null,
    version: null,
    error,
    checkedAt: Date.now(),
  },
  auth: { status: "unknown", hint: "未登录" },
  setup: { status: "needs_install", message: error },
});

describe("useAgentReadinessCheck", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    // Seed the agent store with a few candidates so
    // `findAlternatives` has something to scan. The store is
    // reset on each test by re-creating it with the standard
    // `loadAgents` mock — but since we never call that
    // directly, the seed here is what the alternative scan
    // will see.
    useAgentStore.setState({
      agents: [
        {
          id: "claude",
          name: "claude",
          display_name: "Claude Code",
          available: true,
          path: "/usr/local/bin/claude",
          version: "1.0.0",
          supports_streaming: true,
          description: "Anthropic 出品的代码助手 CLI",
          auth: { status: "logged_in", hint: null },
          setup: { status: "ready", message: "已就绪" },
          env: {},
        },
        {
          id: "codex",
          name: "codex",
          display_name: "Codex",
          available: true,
          path: "/usr/local/bin/codex",
          version: "1.0.0",
          supports_streaming: true,
          description: "OpenAI Codex",
          auth: { status: "logged_in", hint: null },
          setup: { status: "ready", message: "已就绪" },
          env: {},
        },
        {
          id: "gemini",
          name: "gemini",
          display_name: "Gemini CLI",
          available: true,
          path: "/usr/local/bin/gemini",
          version: "1.0.0",
          supports_streaming: true,
          description: "Google Gemini",
          auth: { status: "logged_in", hint: null },
          setup: { status: "ready", message: "已就绪" },
          env: {},
        },
      ],
      loading: false,
      error: null,
      lastLoadedAt: Date.now(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in the assume-ready state (matches AionUi default)", () => {
    const h = mountHook("claude");
    const s = h.get();
    expect(s.isReady).toBe(true);
    expect(s.isChecking).toBe(false);
    expect(s.error).toBeUndefined();
    expect(s.bestAgent).toBeNull();
    expect(s.availableAgents).toEqual([]);
    h.unmount();
  });

  it("checkCurrentAgent calls check_agent_health with the right id and flips isReady=true on success", async () => {
    invokeMock.mockResolvedValueOnce(happyReport("claude", 123));
    const h = mountHook("claude");
    let ok = false;
    await act(async () => {
      ok = await h.get().checkCurrentAgent();
    });
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("check_agent_health", { id: "claude" });
    const s = h.get();
    expect(s.isReady).toBe(true);
    expect(s.isChecking).toBe(false);
    expect(s.error).toBeUndefined();
    h.unmount();
  });

  it("checkCurrentAgent flips isReady=false and surfaces the error message on failure", async () => {
    invokeMock.mockResolvedValueOnce(failReport("claude", "退出码 1"));
    const h = mountHook("claude");
    let ok = true;
    await act(async () => {
      ok = await h.get().checkCurrentAgent();
    });
    expect(ok).toBe(false);
    const s = h.get();
    expect(s.isReady).toBe(false);
    expect(s.isChecking).toBe(false);
    expect(s.error).toBe("退出码 1");
    h.unmount();
  });

  it("checkCurrentAgent flips isReady=false on a thrown IPC error", async () => {
    invokeMock.mockRejectedValueOnce(new Error("IPC bridge offline"));
    const h = mountHook("claude");
    let ok = true;
    await act(async () => {
      ok = await h.get().checkCurrentAgent();
    });
    expect(ok).toBe(false);
    const s = h.get();
    expect(s.isReady).toBe(false);
    expect(s.error).toBe("IPC bridge offline");
    h.unmount();
  });

  it("findAlternatives scans the registry, surfaces the first available hit, and skips the current id", async () => {
    // claude (the current id) is NOT probed; codex succeeds
    // first, the loop short-circuits on the first available
    // hit so gemini is never probed.
    invokeMock.mockResolvedValueOnce(happyReport("codex", 80));
    const h = mountHook("claude");
    await act(async () => {
      await h.get().findAlternatives();
    });
    const s = h.get();
    // Exactly one probe fired: codex. claude is excluded
    // (it is the current id), gemini was never reached
    // because the loop breaks on the first available hit.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "check_agent_health", { id: "codex" });
    expect(s.bestAgent?.id).toBe("codex");
    // `availableAgents` contains only the entries actually
    // probed (codex); gemini never made it onto the list
    // because the short-circuit skipped it. The consumer
    // is expected to render the bestAgent recommendation
    // without consulting the rest of the registry.
    const ids = s.availableAgents.map((a) => a.id);
    expect(ids).toEqual(["codex"]);
    expect(s.progress).toBe(100);
    expect(s.isChecking).toBe(false);
    h.unmount();
  });

  it("findAlternatives falls back to no bestAgent when every alternative fails", async () => {
    invokeMock.mockResolvedValue(failReport("n/a", "未安装"));
    const h = mountHook("claude");
    await act(async () => {
      await h.get().findAlternatives();
    });
    const s = h.get();
    expect(s.bestAgent).toBeNull();
    expect(s.availableAgents).toHaveLength(2);
    for (const candidate of s.availableAgents) {
      expect(candidate.health.available).toBe(false);
      expect(candidate.health.error).toBe("未安装");
    }
    h.unmount();
  });

  it("findAlternatives calls onAgentReady as soon as the first alternative is available", async () => {
    invokeMock.mockResolvedValueOnce(happyReport("codex", 80));
    invokeMock.mockResolvedValueOnce(happyReport("gemini", 200));
    let callbackCount = 0;
    let callbackId: string | null = null;
    const h = mountHook("claude", {
      onAgentReady: (a) => {
        callbackCount++;
        callbackId = a.id;
      },
    });
    await act(async () => {
      await h.get().findAlternatives();
    });
    expect(callbackCount).toBe(1);
    expect(callbackId).toBe("codex");
    h.unmount();
  });

  it("performFullCheck is a no-op follow-up when checkCurrentAgent passes", async () => {
    invokeMock.mockResolvedValueOnce(happyReport("claude", 50));
    const h = mountHook("claude");
    await act(async () => {
      await h.get().performFullCheck();
    });
    // Only the current-agent probe fired; no alternative scan.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("check_agent_health", { id: "claude" });
    h.unmount();
  });

  it("performFullCheck escalates to findAlternatives on a failed current-agent probe", async () => {
    invokeMock.mockResolvedValueOnce(failReport("claude", "未安装"));
    invokeMock.mockResolvedValueOnce(happyReport("codex", 60));
    const h = mountHook("claude");
    await act(async () => {
      await h.get().performFullCheck();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(h.get().bestAgent?.id).toBe("codex");
    h.unmount();
  });

  it("reset clears availableAgents and bestAgent", async () => {
    invokeMock.mockResolvedValueOnce(happyReport("codex", 60));
    const h = mountHook("claude");
    await act(async () => {
      await h.get().findAlternatives();
    });
    expect(h.get().bestAgent?.id).toBe("codex");
    act(() => {
      h.get().reset();
    });
    const s = h.get();
    expect(s.bestAgent).toBeNull();
    expect(s.availableAgents).toEqual([]);
    expect(s.progress).toBe(0);
    h.unmount();
  });
});
