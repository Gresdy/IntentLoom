/**
 * streamingPassthrough — T12 regression test.
 *
 * The bug: messageStore.appendContent / appendThinking /
 * addToolCall / updateToolCall / addToolResponse / setPlan
 * were updating the messageStore's own `messages` field but
 * NOT the conversation store's assistant message. The
 * reasonixAdapter's items derivation reads from the
 * conversation store, so during streaming the assistant
 * bubble rendered empty and the ai-stream-end fallback
 * path wrote "no response from CLI" even when the CLI had
 * returned a perfectly good answer.
 *
 * The fix makes each streaming update function also
 * persist the new value through to the conversation
 * store. This test exercises that path end-to-end:
 *
 *   1. addMessageToCurrent creates user + empty assistant
 *   2. appendContent streams three text chunks
 *   3. addToolCall fires mid-stream
 *   4. updateToolCall marks the call completed
 *   5. addToolResponse attaches the result
 *   6. appendThinking streams a reasoning block
 *   7. setPlan posts a plan
 *
 * After each step, the conversation store's last
 * assistant message reflects the live state — not the
 * empty initial value. This is what the items derivation
 * sees, and what the user sees in the transcript.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useConversationStore } from "@/stores/conversationStore";
import { useMessageStore } from "@/stores/messageStore";
import type { PlanState, ToolCall, ToolResponse } from "@/types/message";

const seedAssistant = () => {
  const c = useConversationStore.getState().createConversation();
  const userMsg = {
    id: "u1",
    role: "user" as const,
    content: "hi",
    type: "text" as const,
    timestamp: Date.now(),
  };
  const assistantMsg = {
    id: "a1",
    role: "assistant" as const,
    content: "",
    type: "text" as const,
    timestamp: Date.now(),
  };
  useConversationStore.getState().addMessageToCurrent(userMsg);
  useConversationStore.getState().addMessageToCurrent(assistantMsg);
  // Mirror into the messageStore so the append* / addTool*
  // guards (which check messageStore.messages) pass. The real
  // reasonixAdapter.send() does the same — the two stores are
  // kept in lockstep during the live turn.
  useMessageStore.setState({
    messages: [userMsg, assistantMsg],
    isStreaming: true,
    currentThinking: "",
    currentToolCalls: [],
    currentToolResponses: [],
    currentPlan: null,
  });
  return c;
};

const lastConvoMessage = () => {
  const conv = useConversationStore.getState().getCurrentConversation();
  expect(conv).toBeDefined();
  const last = conv!.messages[conv!.messages.length - 1];
  expect(last.role).toBe("assistant");
  return last;
};

describe("streaming passthrough to conversation store (T12)", () => {
  beforeEach(() => {
    localStorage.clear();
    useConversationStore.setState({ conversations: [], currentConversationId: null });
    // Reset the messageStore by walking through a "fake send":
    // it stores a fresh empty assistant in `messages` and
    // resets the per-turn flags. We do this so subsequent
    // append* / addTool* calls index the correct message.
    useMessageStore.setState({
      messages: [],
      isStreaming: false,
      currentThinking: "",
      currentToolCalls: [],
      currentToolResponses: [],
      currentPlan: null,
      notices: [],
    } as any);
  });

  it("appendContent accumulates into the conversation store live", () => {
    seedAssistant();
    useMessageStore.getState().appendContent("Hello, ");
    useMessageStore.getState().appendContent("world");
    useMessageStore.getState().appendContent("!");
    const last = lastConvoMessage();
    expect(last.content).toBe("Hello, world!");
  });

  it("appendThinking accumulates into the conversation store live", () => {
    seedAssistant();
    useMessageStore.getState().appendThinking("step 1: greet");
    useMessageStore.getState().appendThinking(" | step 2: respond");
    expect(lastConvoMessage().thinking).toBe("step 1: greet | step 2: respond");
  });

  it("addToolCall / updateToolCall / addToolResponse are all live", () => {
    seedAssistant();
    const tc: ToolCall = {
      id: "t1",
      name: "Read",
      kind: "read",
      arguments: { path: "/tmp/foo" },
      status: "in_progress",
    };
    useMessageStore.getState().addToolCall(tc);
    expect(lastConvoMessage().toolCalls?.[0]).toMatchObject({
      id: "t1",
      name: "Read",
      status: "in_progress",
    });

    useMessageStore.getState().updateToolCall("t1", {
      status: "completed",
      result: "file contents here",
    });
    expect(lastConvoMessage().toolCalls?.[0]).toMatchObject({
      id: "t1",
      status: "completed",
      result: "file contents here",
    });

    const resp: ToolResponse = {
      toolCallId: "t1",
      status: "success",
      result: "file contents here",
    };
    useMessageStore.getState().addToolResponse(resp);
    expect(lastConvoMessage().toolResponses?.[0]).toMatchObject({
      toolCallId: "t1",
      status: "success",
    });
  });

  it("setPlan posts the plan to the conversation store live", () => {
    seedAssistant();
    const plan: PlanState = {
      currentIndex: 0,
      entries: [
        { id: "p1", title: "step 1", status: "completed" },
        { id: "p2", title: "step 2", status: "in_progress" },
      ],
    };
    useMessageStore.getState().setPlan(plan);
    expect(lastConvoMessage().plan).toEqual(plan);
  });

  it("full stream flow leaves the assistant message fully populated (the user's symptom)", () => {
    // Reproduces the user's screenshot scenario: assistant
    // bubble ends up with the live content, NOT the
    // "no response from CLI" placeholder.
    seedAssistant();
    useMessageStore.getState().appendContent("Sure! ");
    useMessageStore.getState().appendContent("Here is your answer.");
    useMessageStore.getState().appendThinking("Reasoning: I should help.");

    const last = lastConvoMessage();
    expect(last.content).toBe("Sure! Here is your answer.");
    expect(last.thinking).toBe("Reasoning: I should help.");
    // The pre-fix code path left last.content === "" at this
    // point, which the ai-stream-end handler then replaced with
    // the "no response from CLI" fallback. With the fix in
    // place, the content is here before ai-stream-end runs.
    expect(last.content.length).toBeGreaterThan(0);
  });
});
