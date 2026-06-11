/**
 * useAutoTitle — T6 chat parity tests.
 *
 * Covers:
 *  - placeholder renaming: first user message replaces the default
 *    "新对话 ..." name with a shortened prefix
 *  - non-placeholder names are preserved (the user has renamed it)
 *  - long messages are clamped to MAX_TITLE_LEN + ellipsis
 *  - whitespace / control chars are normalised
 *  - a second conversation id resets the "already titled" cache
 *  - an empty user message is skipped (no rename)
 */

import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoTitle, __test__ } from "@/hooks/useAutoTitle";
import { useConversationStore } from "@/stores/conversationStore";
import type { Message } from "@/types/message";

const stubUser = (content: string): Message =>
  ({
    id: Math.random().toString(36).slice(2),
    role: "user",
    content,
    type: "text",
    timestamp: Date.now(),
  } as Message);

describe("useAutoTitle", () => {
  afterEach(() => {
    localStorage.clear();
    useConversationStore.setState({ conversations: [], currentConversationId: null });
  });

  it("renames a default conversation from the first user message", () => {
    const c = useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubUser("帮我写一个 Python 脚本"));
    renderHook(() => useAutoTitle(c.id));
    expect(useConversationStore.getState().getCurrentConversation()?.name).toBe(
      "帮我写一个 Python 脚本",
    );
  });

  it("clamps long messages to MAX_TITLE_LEN and adds an ellipsis", () => {
    const c = useConversationStore.getState().createConversation();
    const long = "a".repeat(80);
    useConversationStore.getState().addMessageToCurrent(stubUser(long));
    renderHook(() => useAutoTitle(c.id));
    const got = useConversationStore.getState().getCurrentConversation()?.name ?? "";
    expect(got.length).toBe(__test__.MAX_TITLE_LEN + 1); // +1 for the ellipsis
    expect(got.endsWith("…")).toBe(true);
    expect(got.startsWith("a")).toBe(true);
  });

  it("collapses whitespace and strips control chars before titling", () => {
    const c = useConversationStore.getState().createConversation();
    useConversationStore
      .getState()
      .addMessageToCurrent(stubUser("  hello\n\nworld\u0007  "));
    renderHook(() => useAutoTitle(c.id));
    expect(useConversationStore.getState().getCurrentConversation()?.name).toBe(
      "hello world",
    );
  });

  it("preserves a user-rename (does not overwrite a non-placeholder name)", () => {
    const c = useConversationStore.getState().createConversation();
    useConversationStore.getState().updateConversation(c.id, { name: "我的研究" });
    useConversationStore.getState().addMessageToCurrent(stubUser("abc"));
    renderHook(() => useAutoTitle(c.id));
    expect(useConversationStore.getState().getCurrentConversation()?.name).toBe("我的研究");
  });

  it("does nothing when the conversation has no user message", () => {
    const c = useConversationStore.getState().createConversation();
    const before = useConversationStore.getState().getCurrentConversation()?.name;
    renderHook(() => useAutoTitle(c.id));
    expect(useConversationStore.getState().getCurrentConversation()?.name).toBe(before);
  });

  it("is a no-op when currentConversationId is null", () => {
    // No active conversation; renderHook should not throw.
    expect(() => renderHook(() => useAutoTitle(null))).not.toThrow();
  });

  it("re-titles when the active conversation id changes", () => {
    const a = useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubUser("aaa"));
    renderHook(() => useAutoTitle(a.id));
    expect(useConversationStore.getState().getCurrentConversation()?.name).toBe("aaa");

    // Switch to a fresh conversation with a different first message.
    const b = useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubUser("bbb"));
    renderHook(() => useAutoTitle(b.id));
    const all = useConversationStore.getState().conversations;
    const aState = all.find((x) => x.id === a.id);
    const bState = all.find((x) => x.id === b.id);
    expect(aState?.name).toBe("aaa");
    expect(bState?.name).toBe("bbb");
  });

  // Internal helpers exposed for unit tests.
  describe("shortenForTitle", () => {
    it("returns the trimmed text when under the cap", () => {
      expect(__test__.shortenForTitle("  hi there  ")).toBe("hi there");
    });
    it("clamps to MAX_TITLE_LEN and adds an ellipsis", () => {
      const out = __test__.shortenForTitle("x".repeat(40));
      expect(out.length).toBe(__test__.MAX_TITLE_LEN + 1);
      expect(out.endsWith("…")).toBe(true);
    });
    it("returns empty for an empty input", () => {
      expect(__test__.shortenForTitle("   \n   ")).toBe("");
    });
  });

  describe("isPlaceholderName", () => {
    it("accepts the default 新对话 prefix", () => {
      expect(__test__.isPlaceholderName("新对话 2026/6/11 13:30:00")).toBe(true);
    });
    it("rejects user-renamed names", () => {
      expect(__test__.isPlaceholderName("我的研究")).toBe(false);
    });
  });
});
