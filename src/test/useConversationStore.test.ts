import { beforeEach, describe, expect, it } from "vitest";
import { useConversationStore } from "@/stores/conversationStore";
import type { Message } from "@/types/message";

const stubMsg = (role: Message["role"], content: string): Message =>
  ({
    id: Math.random().toString(36).slice(2),
    role,
    content,
    type: "text",
    timestamp: Date.now(),
    createdAt: Date.now(),
  } as Message);

describe("useConversationStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useConversationStore.setState({ conversations: [], currentConversationId: null });
  });

  it("createConversation appends and selects the new conversation", () => {
    const c = useConversationStore.getState().createConversation();
    expect(useConversationStore.getState().conversations).toHaveLength(1);
    expect(useConversationStore.getState().currentConversationId).toBe(c.id);
  });

  it("deleteConversation removes the entry and clears selection if matched", () => {
    const a = useConversationStore.getState().createConversation();
    const b = useConversationStore.getState().createConversation();
    useConversationStore.getState().deleteConversation(a.id);
    expect(useConversationStore.getState().conversations.map((c) => c.id)).toEqual([b.id]);
    useConversationStore.getState().deleteConversation(b.id);
    expect(useConversationStore.getState().currentConversationId).toBeNull();
  });

  it("selectConversation sets the active id (store trusts the caller)", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().selectConversation("missing");
    expect(useConversationStore.getState().currentConversationId).toBe("missing");
  });

  it("addMessageToCurrent appends a message to the active conversation", () => {
    const c = useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "hi"));
    const after = useConversationStore.getState().conversations.find((x) => x.id === c.id);
    expect(after?.messages).toHaveLength(1);
    expect(after?.messages[0].content).toBe("hi");
  });

  it("getCurrentConversation returns the active conversation", () => {
    expect(useConversationStore.getState().getCurrentConversation()).toBeUndefined();
    const c = useConversationStore.getState().createConversation();
    expect(useConversationStore.getState().getCurrentConversation()?.id).toBe(c.id);
  });


  // === T4 chat parity — edit + truncate ===
  it("editMessageById updates content in place and returns the new message", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "hi"));
    const id = useConversationStore.getState().getCurrentConversation()!.messages[0].id;
    const updated = useConversationStore.getState().editMessageById(id, { content: "hello" });
    expect(updated?.content).toBe("hello");
    expect(useConversationStore.getState().getCurrentConversation()!.messages[0].content).toBe("hello");
  });

  it("editMessageById returns undefined for an unknown id and leaves the list alone", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "hi"));
    const before = useConversationStore.getState().getCurrentConversation()!.messages.length;
    const out = useConversationStore.getState().editMessageById("missing", { content: "x" });
    expect(out).toBeUndefined();
    expect(useConversationStore.getState().getCurrentConversation()!.messages.length).toBe(before);
  });

  it("truncateFromMessageId drops the message and everything after, returns the count", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "u1"));
    useConversationStore.getState().addMessageToCurrent(stubMsg("assistant", "a1"));
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "u2"));
    useConversationStore.getState().addMessageToCurrent(stubMsg("assistant", "a2"));
    const a1 = useConversationStore.getState().getCurrentConversation()!.messages[1].id;
    const removed = useConversationStore.getState().truncateFromMessageId(a1);
    expect(removed).toBe(3);
    const after = useConversationStore.getState().getCurrentConversation()!.messages;
    expect(after.map((m) => m.content)).toEqual(["u1"]);
  });

  it("truncateFromMessageId returns 0 for an unknown id", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "u1"));
    const removed = useConversationStore.getState().truncateFromMessageId("missing");
    expect(removed).toBe(0);
    expect(useConversationStore.getState().getCurrentConversation()!.messages).toHaveLength(1);
  });

  it("truncateAfterMessageId keeps the message and drops everything after, returns the count", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "u1"));
    useConversationStore.getState().addMessageToCurrent(stubMsg("assistant", "a1"));
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "u2"));
    const u1 = useConversationStore.getState().getCurrentConversation()!.messages[0].id;
    const removed = useConversationStore.getState().truncateAfterMessageId(u1);
    expect(removed).toBe(2);
    const after = useConversationStore.getState().getCurrentConversation()!.messages;
    expect(after.map((m) => m.content)).toEqual(["u1"]);
  });

  it("truncateAfterMessageId returns 0 when the message is the last one", () => {
    useConversationStore.getState().createConversation();
    useConversationStore.getState().addMessageToCurrent(stubMsg("user", "u1"));
    const u1 = useConversationStore.getState().getCurrentConversation()!.messages[0].id;
    const removed = useConversationStore.getState().truncateAfterMessageId(u1);
    expect(removed).toBe(0);
    expect(useConversationStore.getState().getCurrentConversation()!.messages).toHaveLength(1);
  });
});
