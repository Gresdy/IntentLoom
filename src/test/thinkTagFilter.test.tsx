import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const invokeMock = vi.fn();
vi.mock("@/lib/tauri", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

const streamChunkListeners: Array<(payload: unknown) => void> = [];
const streamEndListeners: Array<(payload: unknown) => void> = [];
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (ev: { payload: unknown }) => void) => {
    if (event === "ai-stream-chunk") {
      streamChunkListeners.push((payload) => handler({ payload }));
    } else if (event === "ai-stream-end") {
      streamEndListeners.push((payload) => handler({ payload }));
    }
    return Promise.resolve(() => {});
  },
}));

import { useReasonixController } from "@/lib/reasonixAdapter";
import { useMessageStore } from "@/stores/messageStore";

async function mountController(): Promise<{
  send: (text: string) => Promise<void>;
  emitChunk: (raw: string) => void;
  endStream: () => void;
  unmount: () => void;
}> {
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

  for (let i = 0; i < 50; i++) {
    if (streamChunkListeners.length > 0 && streamEndListeners.length > 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (streamChunkListeners.length === 0 || streamEndListeners.length === 0) {
    throw new Error(
      `listeners not registered (chunk=${streamChunkListeners.length}, end=${streamEndListeners.length})`,
    );
  }

  return {
    send: async (text: string) => {
      if (!captured) throw new Error("controller never captured");
      await captured.send(text);
    },
    emitChunk: (raw: string) => {
      for (const l of streamChunkListeners) l(raw);
    },
    endStream: () => {
      for (const l of streamEndListeners) l("ok");
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

describe("think-tag strip on streamed text (T9)", () => {
  // T9 plugs stripThinkTags() into the controller's stream-chunk
  // handler so `<thinking>...</thinking>` /
  // `<answer>...</answer>` blocks in raw (non-JSON) chunks and
  // structured `text` events never reach the assistant message.
  // The handler calls `useMessageStore.getState().appendContent`
  // with the stripped result. We spy on that action and assert
  // on the argument. We don't go through `appendContent`'s
  // internal state machine because that's a pre-existing
  // detail of the streaming pipeline, separate from the filter
  // contract T9 is locking down.

  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockImplementation(async () => null);
    streamChunkListeners.length = 0;
    streamEndListeners.length = 0;
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
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("strips <thinking>...</thinking> blocks from a raw (non-JSON) chunk", async () => {
    const appendSpy = vi.spyOn(useMessageStore.getState(), "appendContent");
    const c = await mountController();
    await c.send("hi");
    appendSpy.mockClear();

    act(() => {
      c.emitChunk("Hello! <thinking>internal reasoning here</thinking> World.");
    });

    expect(appendSpy).toHaveBeenCalledWith("Hello!  World.");
    appendSpy.mockRestore();
    c.unmount();
  });

  it("strips <answer>...</answer> blocks from a JSON text event", async () => {
    const appendSpy = vi.spyOn(useMessageStore.getState(), "appendContent");
    const c = await mountController();
    await c.send("hi");
    appendSpy.mockClear();

    act(() => {
      c.emitChunk(JSON.stringify({ type: "text", text: "Answer: <answer>42</answer> done." }));
    });

    expect(appendSpy).toHaveBeenCalledWith("Answer:  done.");
    appendSpy.mockRestore();
    c.unmount();
  });

  it("does not strip content that just happens to mention <answer> in prose", async () => {
    // stripThinkTags only removes matched pairs, so an
    // unbalanced "<answer>" without a closing </answer> is
    // preserved verbatim. This is the safety case for
    // legitimate user mentions of the literal string.
    const appendSpy = vi.spyOn(useMessageStore.getState(), "appendContent");
    const c = await mountController();
    await c.send("hi");
    appendSpy.mockClear();

    act(() => {
      c.emitChunk("Use the <answer> tag like this:");
    });

    expect(appendSpy).toHaveBeenCalledWith("Use the <answer> tag like this:");
    appendSpy.mockRestore();
    c.unmount();
  });

  it("plain text with no think tags is preserved verbatim", async () => {
    const appendSpy = vi.spyOn(useMessageStore.getState(), "appendContent");
    const c = await mountController();
    await c.send("hi");
    appendSpy.mockClear();

    act(() => {
      c.emitChunk("Just a normal response.");
    });

    expect(appendSpy).toHaveBeenCalledWith("Just a normal response.");
    appendSpy.mockRestore();
    c.unmount();
  });

  it("strips multiple <answer> blocks from the same chunk", async () => {
    const appendSpy = vi.spyOn(useMessageStore.getState(), "appendContent");
    const c = await mountController();
    await c.send("hi");
    appendSpy.mockClear();

    act(() => {
      c.emitChunk("before <answer>one</answer> middle <answer>two</answer> after");
    });

    expect(appendSpy).toHaveBeenCalledWith("before  middle  after");
    appendSpy.mockRestore();
    c.unmount();
  });
});
