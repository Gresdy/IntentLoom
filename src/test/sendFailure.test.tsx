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
