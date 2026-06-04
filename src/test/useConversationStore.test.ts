import { beforeEach, describe, expect, it } from "vitest";
import { useConversationStore } from "@/stores/conversationStore";
import type { Message } from "@/types/message";

const stubMsg = (role: Message["role"], content: string): Message =>
  ({ id: Math.random().toString(36).slice(2), role, content, createdAt: Date.now() } as Message);

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
});
