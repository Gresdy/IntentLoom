import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tauri", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));

import { useReasonixController } from "@/lib/reasonixAdapter";
import { useConversationStore } from "@/stores/conversationStore";
import { useMessageStore } from "@/stores/messageStore";
import type { Message, ToolCall } from "@/types/message";

function mountController() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let items: ReturnType<typeof useReasonixController>["state"]["items"] = [];

  const Capture = () => {
    const controller = useReasonixController();
    useEffect(() => {
      items = controller.state.items;
    });
    return null;
  };

  let root: Root;
  act(() => {
    root = createRoot(host);
    root.render(createElement(Capture));
  });

  return {
    items: () => items,
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(host);
    },
  };
}

const tools: ToolCall[] = [
  {
    id: "read-1",
    name: "Read",
    kind: "read",
    arguments: { path: "src/a.ts" },
    status: "completed",
    result: "a",
  },
  {
    id: "bash-2",
    name: "Bash",
    kind: "execute",
    arguments: { command: "npm test" },
    status: "completed",
    result: "passed",
  },
];

function seedConversation(assistant: Message) {
  useConversationStore.getState().createConversation();
  useConversationStore.getState().addMessageToCurrent({
    id: "user-1",
    type: "text",
    role: "user",
    content: "inspect",
    timestamp: 100,
  });
  useConversationStore.getState().addMessageToCurrent(assistant);
}

describe("reasonix assistant tool sequence", () => {
  beforeEach(() => {
    localStorage.clear();
    useConversationStore.setState({ conversations: [], currentConversationId: null });
    useMessageStore.setState({
      messages: [],
      isStreaming: false,
      currentThinking: "",
      currentThinkingMeta: null,
      currentToolCalls: [],
      currentToolResponses: [],
      notices: [],
    });
  });

  afterEach(() => {
    useConversationStore.setState({ conversations: [], currentConversationId: null });
    useMessageStore.setState({ isStreaming: false, currentToolCalls: [], notices: [] });
  });

  it("keeps persisted tools on their assistant item instead of appending tool rows", () => {
    seedConversation({
      id: "assistant-1",
      type: "text",
      role: "assistant",
      content: "final answer",
      thinking: "reasoning",
      toolCalls: tools,
      timestamp: 200,
    });
    const controller = mountController();
    const items = controller.items();
    const assistant = items.find((item) => item.kind === "assistant");

    expect(assistant).toMatchObject({
      kind: "assistant",
      id: "assistant-1",
      text: "final answer",
      reasoning: "reasoning",
      toolCalls: tools,
      streaming: false,
    });
    expect(items.some((item) => item.kind === "tool" || item.kind === "tool_group")).toBe(false);
    controller.unmount();
  });

  it("represents a live assistant once and uses the ordered live tool snapshot", () => {
    seedConversation({
      id: "assistant-live",
      type: "text",
      role: "assistant",
      content: "",
      timestamp: 200,
    });
    useMessageStore.setState({
      isStreaming: true,
      currentThinking: "live reasoning",
      currentToolCalls: tools,
    });

    const controller = mountController();
    const assistants = controller.items().filter((item) => item.kind === "assistant");
    expect(assistants).toHaveLength(1);
    expect(assistants[0]).toMatchObject({
      id: "assistant-live",
      streaming: true,
      reasoning: "live reasoning",
      toolCalls: tools,
    });
    controller.unmount();
  });
});
