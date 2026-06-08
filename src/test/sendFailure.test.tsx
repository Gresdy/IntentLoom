import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const invokeMock = vi.fn();
vi.mock("@/lib/tauri", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

import { useReasonixController } from "@/lib/reasonixAdapter";
import { useMessageStore } from "@/stores/messageStore";
import { useToastStore } from "@/lib/useToast";

function mountController(): {
  send: (text: string) => Promise<void>;
  getNotices: () => ReturnType<typeof useMessageStore.getState>["notices"];
  isStreaming: () => boolean;
  unmount: () => void;
} {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let captured: ReturnType<typeof useReasonixController> | null = null;
  const Capture = () => {
    const c = useReasonixController();
    useEffect(() => {
      captured = c;
    });
    return null;
  };
  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(createElement(Capture));
  });
  return {
    send: async (text: string) => {
      if (!captured) throw new Error("controller never captured");
      await captured.send(text);
    },
    getNotices: () => useMessageStore.getState().notices,
    isStreaming: () => useMessageStore.getState().isStreaming,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

describe("send() failure handling (T7)", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useMessageStore.setState({
      messages: [],
      isStreaming: false,
      notices: [],
      currentToolCalls: [],
      currentToolResponses: [],
      currentPermission: null,
      currentPlan: null,
      currentUsage: null,
      currentThinking: "",
    });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useToastStore.setState({ toasts: [] });
  });

  it("on invoke rejection: pops a toast, appends a red notice, clears streaming", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "send_chat_message") {
        throw new Error("ipc broken");
      }
      return null;
    });

    const c = mountController();
    await c.send("hello");

    // 1. Toast was added with the failure message
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      type: "error",
      message: expect.stringContaining("发送消息失败") as unknown as string,
    });

    // 2. A red notice was added to the message store
    const notices = c.getNotices();
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      level: "error",
      text: expect.stringContaining("发送消息失败") as unknown as string,
    });

    // 3. Streaming flag is reset so the spinner stops
    expect(c.isStreaming()).toBe(false);

    errSpy.mockRestore();
    c.unmount();
  });

  it("on success: no toast, no notice, no streaming reset call needed", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "send_chat_message") return null;
      return null;
    });

    const c = mountController();
    await c.send("hello");

    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(c.getNotices()).toHaveLength(0);
    // The success path leaves streaming=true (the end event will
    // flip it back to false). We just confirm we didn't take
    // the failure branch.
    expect(c.isStreaming()).toBe(true);
    c.unmount();
  });

  it("non-Error rejections (e.g. plain string) still surface as toast + notice", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "send_chat_message") {
        // Some Tauri commands throw stringly-typed errors; the
        // handler should not blow up on those.
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "channel closed";
      }
      return null;
    });

    const c = mountController();
    await c.send("hello");

    const toasts = useToastStore.getState().toasts;
    const notices = c.getNotices();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain("channel closed");
    expect(notices).toHaveLength(1);
    expect(notices[0].text).toContain("channel closed");
    errSpy.mockRestore();
    c.unmount();
  });
});

describe("send() pre-flight availability check", () => {
  // These two tests cover the new "is the active CLI
  // available?" short-circuit added on top of the
  // existing T7 failure handling. The pre-flight
  // consults `useAgentStore.agents` (populated by
  // `refreshAgentList` on mount) and bails out BEFORE
  // calling `send_chat_message` if the active id is
  // marked unavailable — saves the user a useless
  // spawn + a raw OS error toast.

  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useMessageStore.setState({
      messages: [],
      isStreaming: false,
      notices: [],
      currentToolCalls: [],
      currentToolResponses: [],
      currentPermission: null,
      currentPlan: null,
      currentUsage: null,
      currentThinking: "",
    });
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useToastStore.setState({ toasts: [] });
  });

  it("short-circuits with a clear toast when the active CLI is unavailable", async () => {
    // Wire up: the registry knows about Claude (it's
    // registered) but reports `available: false` because
    // the binary is not on $PATH. `currentApp` is Claude.
    // The pre-flight check should catch this and toast
    // BEFORE we ever call `send_chat_message`.
    const { useModelStore } = await import("@/stores/useModelStore");
    const { useAgentStore } = await import("@/lib/useAgents");
    useModelStore.setState({ currentApp: "claude" });
    useAgentStore.setState({
      agents: [
        {
          id: "claude",
          name: "claude",
          display_name: "Claude Code",
          available: false,
          path: null,
          version: null,
          supports_streaming: true,
          description: "Anthropic 出品的代码助手 CLI",
          auth: { status: "logged_out", hint: null },
          setup: { status: "needs_install", message: "未安装" },
          env: {},
        },
      ],
      loading: false,
      error: null,
      lastLoadedAt: Date.now(),
    });

    const c = mountController();
    await c.send("hello");

    // 1. `send_chat_message` was NEVER called — the
    // pre-flight check is the real source of truth,
    // not a fallback after a failed spawn.
    const sendCall = invokeMock.mock.calls.find(
      (call) => call[0] === "send_chat_message",
    );
    expect(sendCall).toBeUndefined();

    // 2. A clear, friendly toast fired. The user
    // should never see a raw exit code.
    const toasts = useToastStore.getState().toasts;
    const failToast = toasts.find((t) => t.type === "error");
    expect(failToast).toBeDefined();
    // The pre-flight check uses the agent's
    // `display_name` (more user-friendly than the
    // raw id), so the toast says "Claude Code" not
    // "claude". We assert the user-visible display
    // name AND the id substring so a future rename
    // of the display name shows up as a test diff
    // instead of silently passing.
    expect(failToast?.message).toContain("Claude Code");
    expect(failToast?.message.toLowerCase()).toContain("claude");
    expect(failToast?.message).toContain("不可用");
    // Mentions the next-step CTA so the user is not
    // stranded at a "something failed" banner.
    expect(failToast?.message).toMatch(/AI 助手|安装/);

    // 3. The user message was NOT added to the
    // transcript — there is nothing to respond to
    // because we never tried. Without this guard,
    // the user would see a user bubble followed by
    // an empty assistant bubble and the red notice
    // is the only signal that the send failed.
    const messages = useMessageStore.getState().messages;
    expect(messages).toHaveLength(0);

    // 4. Streaming is not set — the controller never
    // believed a turn was in flight.
    expect(c.isStreaming()).toBe(false);

    c.unmount();
  });

  it("proceeds to invoke send_chat_message when the active CLI is available", async () => {
    // Sanity check the inverse case: when the registry
    // reports `available: true`, the pre-flight is a
    // no-op and the call goes through to the Rust
    // side. This guards against a future refactor
    // accidentally short-circuiting EVERY send.
    const { useModelStore } = await import("@/stores/useModelStore");
    const { useAgentStore } = await import("@/lib/useAgents");
    useModelStore.setState({ currentApp: "claude" });
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
      ],
      loading: false,
      error: null,
      lastLoadedAt: Date.now(),
    });
    // Successful invoke → no error toast, streaming
    // gets set to true (the T7 test path).
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "send_chat_message") return null;
      return null;
    });

    const c = mountController();
    await c.send("hello");

    // The send DID reach the Rust side.
    const sendCall = invokeMock.mock.calls.find(
      (call) => call[0] === "send_chat_message",
    );
    expect(sendCall).toBeDefined();
    // No error toast on the happy path.
    const errorToasts = useToastStore
      .getState()
      .toasts.filter((t) => t.type === "error");
    expect(errorToasts).toHaveLength(0);

    c.unmount();
  });
});
