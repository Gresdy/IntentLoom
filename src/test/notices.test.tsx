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
import { useMessageStore, type ConversationNotice } from "@/stores/messageStore";

function mountController(): {
  items: () => ReturnType<typeof useReasonixController>["state"]["items"];
  notices: () => ConversationNotice[];
  resetCurrentStream: () => void;
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
    items: () => captured?.state.items ?? [],
    notices: () => useMessageStore.getState().notices,
    resetCurrentStream: () => useMessageStore.getState().resetCurrentStream(),
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

describe("messageStore notices", () => {
  beforeEach(() => {
    useMessageStore.setState({ notices: [] });
  });

  afterEach(() => {
    useMessageStore.setState({ notices: [] });
  });

  it("addNotice appends a fresh entry with the right level and text", () => {
    useMessageStore.getState().addNotice("error", "🔐 401 authentication failed");
    const notices = useMessageStore.getState().notices;
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ level: "error", text: "🔐 401 authentication failed" });
    expect(notices[0].id).toMatch(/^notice-/);
  });

  it("addNotice dedupes consecutive identical entries", () => {
    useMessageStore.getState().addNotice("error", "🔐 401");
    useMessageStore.getState().addNotice("error", "🔐 401");
    useMessageStore.getState().addNotice("error", "🔐 401");
    expect(useMessageStore.getState().notices).toHaveLength(1);
  });

  it("addNotice does NOT dedupe non-consecutive duplicates or different levels", () => {
    useMessageStore.getState().addNotice("error", "🔐 401");
    useMessageStore.getState().addNotice("warn", "rate limit hit");
    useMessageStore.getState().addNotice("error", "🔐 401");
    expect(useMessageStore.getState().notices).toHaveLength(3);
  });

  it("clearNotices empties the array", () => {
    useMessageStore.getState().addNotice("error", "first");
    useMessageStore.getState().addNotice("warn", "second");
    useMessageStore.getState().clearNotices();
    expect(useMessageStore.getState().notices).toEqual([]);
  });

  it("resetCurrentStream wipes notices along with the rest of the per-turn state", () => {
    useMessageStore.getState().addNotice("error", "🔐 stale");
    useMessageStore.getState().resetCurrentStream();
    expect(useMessageStore.getState().notices).toEqual([]);
  });
});

describe("reasonixAdapter notice rendering", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useMessageStore.setState({ notices: [], messages: [], isStreaming: false });
  });

  afterEach(() => {
    localStorage.clear();
    useMessageStore.setState({ notices: [], messages: [], isStreaming: false });
  });

  it("an error notice surfaces in the controller's `items` array as a notice kind", () => {
    useMessageStore.getState().addNotice("error", "🔐 upstream 401");
    const c = mountController();
    const items = c.items();
    const notice = items.find((it) => it.kind === "notice");
    expect(notice).toBeDefined();
    expect(notice).toMatchObject({
      kind: "notice",
      level: "error",
      text: "🔐 upstream 401",
    });
    c.unmount();
  });

  it("notice id is unique per entry so React's key prop is stable", () => {
    useMessageStore.getState().addNotice("error", "first");
    useMessageStore.getState().addNotice("warn", "second");
    const c = mountController();
    const notices = c.items().filter((it) => it.kind === "notice");
    expect(notices).toHaveLength(2);
    const ids = new Set(notices.map((n) => (n as { id: string }).id));
    expect(ids.size).toBe(2);
    c.unmount();
  });

  it("clearing notices via the store removes them from the rendered items", () => {
    useMessageStore.getState().addNotice("error", "🔐 upstream 401");
    const c = mountController();
    expect(c.items().filter((it) => it.kind === "notice")).toHaveLength(1);
    act(() => {
      useMessageStore.getState().clearNotices();
    });
    expect(c.items().filter((it) => it.kind === "notice")).toHaveLength(0);
    c.unmount();
  });
});
