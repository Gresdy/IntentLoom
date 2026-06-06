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
import { useConversationStore } from "@/stores/conversationStore";

function mountController(): {
  renameSession: (path: string, title: string) => boolean;
  getName: (id: string) => string | undefined;
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
    renameSession: (path, title) => {
      if (!captured) throw new Error("controller never captured");
      return captured.renameSession(path, title);
    },
    getName: (id) =>
      useConversationStore.getState().conversations.find((c) => c.id === id)?.name,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      document.body.removeChild(host);
    },
  };
}

describe("reasonixAdapter.renameSession", () => {
  beforeEach(() => {
    localStorage.clear();
    invokeMock.mockReset();
    useConversationStore.setState({ conversations: [], currentConversationId: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renames an existing conversation and the new name is observable", () => {
    const a = useConversationStore.getState().createConversation();
    useConversationStore.getState().createConversation();
    const c = mountController();

    let ok = false;
    act(() => {
      ok = c.renameSession(a.id, "Refactor: dedupe the loader");
    });

    expect(ok).toBe(true);
    expect(c.getName(a.id)).toBe("Refactor: dedupe the loader");
    c.unmount();
  });

  it("rejects empty / whitespace-only titles without mutating state", () => {
    const a = useConversationStore.getState().createConversation();
    const before = c_getName(a.id);
    const c = mountController();

    expect(c.renameSession(a.id, "")).toBe(false);
    expect(c.renameSession(a.id, "   ")).toBe(false);
    expect(c.renameSession(a.id, "\t\n")).toBe(false);
    expect(c.getName(a.id)).toBe(before);
    c.unmount();
  });

  it("rejects unknown session ids and does not crash", () => {
    useConversationStore.getState().createConversation();
    const c = mountController();

    expect(c.renameSession("does-not-exist", "anything")).toBe(false);
    c.unmount();
  });

  it("trims surrounding whitespace so the displayed title is clean", () => {
    const a = useConversationStore.getState().createConversation();
    const c = mountController();

    act(() => {
      c.renameSession(a.id, "   Tidy up the formatter   ");
    });

    expect(c.getName(a.id)).toBe("Tidy up the formatter");
    c.unmount();
  });
});

// Tiny helper to read the name *before* the controller mounts,
// so the "rejected titles don't mutate" test can compare against
// the pre-call value. Inline so the test file doesn't need a
// shared utility module.
function c_getName(id: string): string | undefined {
  return useConversationStore.getState().conversations.find((c) => c.id === id)?.name;
}
