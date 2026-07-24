/**
 * Regression tests for snapshot-vs-delta stream handling.
 *
 * Root cause: in `messageStore.appendContent`, we used to do
 * `msg.content = msg.content + content`. When the upstream emits
 * a Claude Code `assistant` event whose `content` block is the
 * FULL text (not a delta), the listener can fire more than once
 * for the same event (e.g. React StrictMode in dev re-runs the
 * effect, or the backend retries). Each call would += the same
 * full text, producing a duplicated user-visible reply like
 * "Hello worldHello world".
 *
 * Snapshot events replace the current text while delta events append.
 * Keeping that information in the protocol prevents duplicate snapshots
 * without dropping legitimate repeated delta chunks.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { useMessageStore } from "@/stores/messageStore";
import { useConversationStore } from "@/stores/conversationStore";

const resetStores = () => {
  useMessageStore.setState({
    messages: [],
    currentThinking: "",
    currentToolCalls: [],
    currentToolResponses: [],
    currentPermission: null,
    currentPlan: null,
    currentUsage: null,
    currentThinkingMeta: null,
    summaryByConversation: {},
    notices: [],
  } as any);
  useConversationStore.setState({
    conversations: [],
    currentConversationId: null,
  } as any);
};

const seedUserAndAssistant = () => {
  useMessageStore.getState().addMessage({
    id: "u1",
    type: "text",
    role: "user",
    content: "hi",
    timestamp: 1,
  } as any);
  useMessageStore.getState().addMessage({
    id: "a1",
    type: "text",
    role: "assistant",
    content: "",
    timestamp: 2,
  } as any);
  // mirror into conversation store
  const msgs = useMessageStore.getState().messages;
  useConversationStore.setState((s) => ({
    ...s,
    conversations: [
      {
        id: "c1",
        name: "c1",
        createdAt: 1,
        updatedAt: 1,
        messages: msgs,
        metadata: { agentId: "claude" },
      } as any,
    ],
    currentConversationId: "c1",
  }));
};

describe("messageStore snapshot and delta handling", () => {
  beforeEach(() => {
    resetStores();
    seedUserAndAssistant();
  });

  it("appends a single chunk the first time", () => {
    useMessageStore.getState().appendContent("Hello world");
    expect(useMessageStore.getState().messages[1].content).toBe("Hello world");
  });

  it("does not duplicate when the same snapshot is received twice", () => {
    useMessageStore.getState().replaceContent("Hello world");
    useMessageStore.getState().replaceContent("Hello world");
    expect(useMessageStore.getState().messages[1].content).toBe("Hello world");
  });

  it("replaces (not concatenates) when the new full text extends the old", () => {
    // Claude Code streaming: each event carries the full text so
    // it grows: "Hello" then "Hello world"
    useMessageStore.getState().replaceContent("Hello");
    useMessageStore.getState().replaceContent("Hello world");
    expect(useMessageStore.getState().messages[1].content).toBe("Hello world");
  });

  it("still appends legacy streaming deltas (not full text)", () => {
    // Old Anthropic streaming protocol: each delta is a small chunk
    useMessageStore.getState().appendContent("Hello");
    useMessageStore.getState().appendContent(", ");
    useMessageStore.getState().appendContent("world");
    expect(useMessageStore.getState().messages[1].content).toBe("Hello, world");
  });

  it("snapshot write-through updates the conversation store", () => {
    useMessageStore.getState().replaceContent("Hello world");
    useMessageStore.getState().replaceContent("Hello world");
    const conv = useConversationStore.getState().conversations[0];
    expect(conv.messages[conv.messages.length - 1].content).toBe("Hello world");
  });

  it("preserves repeated delta chunks", () => {
    useMessageStore.getState().appendContent("ha");
    useMessageStore.getState().appendContent("ha");
    expect(useMessageStore.getState().messages[1].content).toBe("haha");
  });
});
