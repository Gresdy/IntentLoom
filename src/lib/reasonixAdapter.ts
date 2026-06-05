import { useCallback, useMemo, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "./tauri";
import { useConversationStore } from "@/stores/conversationStore";
import { useMessageStore } from "@/stores/messageStore";
import { useModelStore } from "@/stores/useModelStore";
import { buildArtifactSummary, hasAnyArtifact } from "@/lib/artifactTally";
import type { ArtifactTally } from "@/lib/artifactTally";
import { useProductChangesStore } from "@/lib/useProductChanges";
import { parseStreamChunk } from "@/lib/streamChunkParser";
import type { ToolCall } from "@/types/message";

export type Mode = "normal" | "plan" | "yolo";

export type ReasonixItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean; reasoning?: string }
  | { kind: "tool"; id: string; name: string; args: any; status: string; result?: any; diff?: any[]; kind2?: string }
  | { kind: "phase"; id: string; text: string }
  | { kind: "notice"; id: string; level: string; text: string }
  | { kind: "summary"; id: string; tally: ArtifactTally };

export interface ReasonixMeta {
  label: string;
  startupErr?: string;
  cwd?: string;
}

export interface ReasonixState {
  items: ReasonixItem[];
  running: boolean;
  meta: ReasonixMeta | null;
  context: any;
  usage: { promptTokens: number; completionTokens: number; cacheHitTokens: number; cacheMissTokens: number } | null;
  balance: any;
  jobs: any[];
  approval: { id: string; tool: string; args: string } | null;
  ask: { id: string; question: string; options: string[] } | null;
  turnStartAt: number | null;
  turnTokens: number;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Convert a ToolCall from messageStore into the wire shape used by
// the `tool` ReasonixItem. Kept tiny because the Transcript side
// already has its own `tool.diff` / `tool.kind` accessors.
function toolCallToItem(tc: ToolCall, idSuffix: string): ReasonixItem {
  return {
    kind: "tool",
    id: idSuffix,
    name: tc.name,
    args: tc.arguments,
    status: tc.status,
    result: tc.result,
    diff: tc.diff,
    kind2: tc.kind,
  };
}

export function useReasonixController() {
  const {
    conversations,
    currentConversationId,
    createConversation,
    deleteConversation,
    selectConversation,
    addMessageToCurrent,
    updateLastMessage,
    getCurrentConversation,
  } = useConversationStore();

  const { currentProviderId, providers } = useModelStore();
  const currentProvider = currentProviderId ? providers[currentProviderId] : null;

  const {
    isStreaming,
    currentThinking,
    currentToolCalls,
    setStreaming,
    summaryByConversation,
    addToolCall,
    addToolResponse,
    updateToolCall,
    setPlan,
    setPermission,
    appendContent,
    appendThinking,
    setSummary,
    resetCurrentStream,
  } = useMessageStore();

  const currentConversation = useMemo(() => {
    return conversations.find((c) => c.id === currentConversationId);
  }, [conversations, currentConversationId]);

  const conversationMessages = currentConversation?.messages ?? [];

  const items: ReasonixItem[] = useMemo(() => {
    const result: ReasonixItem[] = [];

    for (const msg of conversationMessages) {
      if (msg.role === "user") {
        result.push({ kind: "user", id: msg.id, text: msg.content });
      } else if (msg.role === "assistant") {
        result.push({
          kind: "assistant",
          id: msg.id,
          text: msg.content,
          streaming: false,
          reasoning: msg.thinking,
        });
        // Persisted tool calls on the assistant message become ToolCards
        // in the transcript. W3 of the-loom-as-product.md: this is what
        // makes "文件改动内联展示" work after the stream ends — the
        // live stream lights up LoomPanel, the persisted mirror shows
        // the same content inline in chat history.
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            result.push(toolCallToItem(tc, `${msg.id}-tc-${tc.id}`));
          }
        }
      }
    }

    if (isStreaming && currentConversation?.messages.length) {
      const lastMsg = currentConversation.messages[currentConversation.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        result.push({
          kind: "assistant",
          id: "streaming",
          text: lastMsg.content,
          streaming: true,
          reasoning: currentThinking,
        });
        // Live tool cards: the in-flight tool calls from messageStore.
        // After stream-end these get persisted onto the assistant
        // message (see ai-stream-end handler) and the live snapshot
        // resets, so we don't double-render.
        for (const tc of currentToolCalls) {
          result.push(toolCallToItem(tc, `live-tc-${tc.id}`));
        }
      }
    }

    if (currentConversationId) {
      const tally = summaryByConversation[currentConversationId];
      if (tally && hasAnyArtifact(tally)) {
        result.push({
          kind: "summary",
          id: `summary-${currentConversationId}`,
          tally,
        });
      }
    }

    return result;
  }, [
    conversationMessages,
    isStreaming,
    currentThinking,
    currentToolCalls,
    currentConversation,
    currentConversationId,
    summaryByConversation,
  ]);

  const meta: ReasonixMeta | null = useMemo(() => {
    return currentProvider ? { label: currentProvider.name } : { label: "Claude" };
  }, [currentProvider]);

  const state: ReasonixState = useMemo(
    () => ({
      items,
      running: isStreaming,
      meta,
      context: null,
      usage: null,
      balance: null,
      jobs: [],
      approval: null,
      ask: null,
      turnStartAt: isStreaming ? Date.now() : null,
      turnTokens: 0,
    }),
    [items, isStreaming, meta]
  );

  useEffect(() => {
    let unlistenChunk: (() => void) | undefined;
    let unlistenEnd: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenChunk = await listen<string>("ai-stream-chunk", (event) => {
        const raw = event.payload;
        const parsed = parseStreamChunk(raw);

        // Fallback: not JSON or unrecognized shape. The historical
        // behavior was to treat the whole line as text. Keep that
        // contract so adapters that haven't migrated to the new
        // event contract still render something visible.
        if (!parsed) {
          appendContent(raw);
          return;
        }

        switch (parsed.kind) {
          case "text":
            appendContent(parsed.text);
            break;
          case "thinking":
            appendThinking(parsed.text);
            break;
          case "tool_call":
            addToolCall(parsed.tool);
            break;
          case "tool_response":
            addToolResponse({
              toolCallId: parsed.id,
              status: "success",
              result: parsed.result,
            });
            if (parsed.id) {
              updateToolCall(parsed.id, { status: "completed" });
            }
            break;
          case "plan":
            setPlan(parsed.plan);
            break;
          case "permission":
            setPermission({
              id: parsed.id,
              toolName: parsed.tool,
              args: parsed.args,
              status: "pending",
            });
            break;
          case "control":
            // message_start/stop/delta and content_block_stop are
            // protocol scaffolding; the end event itself is handled
            // in the dedicated `ai-stream-end` listener.
            break;
        }
      });

      unlistenEnd = await listen("ai-stream-end", () => {
        // Snapshot the live per-turn state before we reset it, so
        // both the persisted message and the summary card reflect
        // what actually happened this turn.
        const conv = getCurrentConversation();
        const tcs = useMessageStore.getState().currentToolCalls;
        const plan = useMessageStore.getState().currentPlan;

        // Persist the live tool calls / plan onto the assistant
        // message so the transcript can render them as ToolCards /
        // plan markers on reload. Without this, the live LoomPanel
        // would show activity but the transcript would stay empty
        // after the user navigates away.
        if (conv && conv.messages.length > 0) {
          const lastMsg = conv.messages[conv.messages.length - 1];
          if (lastMsg.role === "assistant") {
            updateLastMessage({
              toolCalls: tcs.length > 0 ? tcs : lastMsg.toolCalls,
              plan: plan ?? lastMsg.plan,
            });
          }
        }

        if (conv) {
          const tally = buildArtifactSummary(tcs);
          if (hasAnyArtifact(tally)) {
            setSummary(conv.id, tally);
          }
          // Mirror the live turn into the cross-conversation
          // product_changes ledger. We do this here (not earlier)
          // because the Rust write is synchronous-ish and would slow
          // the streaming loop; once the turn is done the user is
          // already waiting for a final response, so a single batch
          // insert is invisible. Failures are caught inside the
          // store and demoted to a console warning — the live tally
          // above still works.
          const agentId =
            conv.metadata?.agentId ??
            useModelStore.getState().currentApp ??
            "claude";
          void useProductChangesStore
            .getState()
            .recordBatch(conv.id, agentId, tcs);
        }

        setStreaming(false);
        // Clear the per-turn state so the next `send()` starts clean
        // and the live LoomPanel collapses back to "no current
        // activity" (the transcript still shows what happened via
        // the persisted tool calls / plan above).
        resetCurrentStream();
      });
    };

    setupListeners().catch((err) => {
      // Vite dev (no Tauri shell) and edge cases where the IPC bridge
      // isn't ready will reject the listen() promise. The UI is built
      // around streaming events from the Rust backend, so there is
      // nothing to render when they are missing — stay silent instead
      // of crashing the whole component tree.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[reasonixAdapter] stream listeners unavailable:", err);
      }
    });
    return () => {
      unlistenChunk?.();
      unlistenEnd?.();
    };
  }, [
    getCurrentConversation,
    updateLastMessage,
    setStreaming,
    appendContent,
    appendThinking,
    addToolCall,
    addToolResponse,
    updateToolCall,
    setPlan,
    setPermission,
    setSummary,
    resetCurrentStream,
  ]);

  const send = useCallback(
    async (text: string) => {
      let conv = getCurrentConversation();
      if (!conv) {
        conv = createConversation();
      }

      // Wipe any per-turn state carried over from a previous
      // interrupted stream. Without this, LoomPanel's tool/plan
      // sections would briefly show the previous turn's leftovers
      // before the new chunks overwrite them.
      resetCurrentStream();

      const userMessage = {
        id: generateId(),
        type: "text" as const,
        role: "user" as const,
        content: text,
        timestamp: Date.now(),
        position: "right" as const,
      };
      addMessageToCurrent(userMessage);

      const assistantMessage = {
        id: generateId(),
        type: "text" as const,
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
        position: "left" as const,
      };
      addMessageToCurrent(assistantMessage);

      setStreaming(true);

      try {
        await invoke("send_chat_message", {
          cli: useModelStore.getState().currentApp,
          message: text,
          conversationId: conv.id,
          projectPath: null,
        });
      } catch (error) {
        console.error("发送消息失败:", error);
        appendContent(`\n\n错误: ${error}`);
        setStreaming(false);
      }
    },
    [
      getCurrentConversation,
      createConversation,
      addMessageToCurrent,
      setStreaming,
      resetCurrentStream,
      appendContent,
    ]
  );

  const cancel = useCallback(() => {
    setStreaming(false);
  }, [setStreaming]);

  const approve = useCallback(async (id: string, allow: boolean) => {
    if (allow) {
      await invoke("approve_permission", { id, remember: false });
    } else {
      await invoke("deny_permission", { id });
    }
  }, []);

  const newSession = useCallback(() => {
    createConversation();
  }, [createConversation]);

  const listSessions = useCallback(async () => {
    return conversations.map((c) => ({
      id: c.id,
      path: c.id,
      title: c.name || "未命名对话",
      preview: c.messages[0]?.content?.slice(0, 50),
      updatedAt: c.updatedAt || Date.now(),
      messageCount: c.messages.length,
      agentId: c.metadata?.agentId ?? "claude",
    }));
  }, [conversations]);

  const resumeSession = useCallback((path: string) => {
    selectConversation(path);
  }, [selectConversation]);

  const deleteSessionFn = useCallback((path: string) => {
    deleteConversation(path);
  }, [deleteConversation]);

  const renameSessionFn = useCallback((_path: string, _title: string) => {
    // TODO: 实现重命名
  }, []);

  const pickWorkspace = useCallback(async () => {
    // TODO: 实现选择工作目录
  }, []);

  const setModelFn = useCallback((name: string) => {
    console.log("切换模型:", name);
  }, []);

  const setPlanFn = useCallback((_v: boolean) => {
    // TODO: 实现 Plan 模式
  }, []);

  const setBypassFn = useCallback((_v: boolean) => {
    // TODO: 实现 Bypass 模式
  }, []);

  const answerQuestion = useCallback((_id: string, _choices: string[]) => {}, []);

  const refreshMeta = useCallback(async () => {}, []);

  const rewind = useCallback((_turn: number, _scope?: string) => {}, []);

  return {
    state,
    send,
    cancel,
    approve,
    answerQuestion,
    setPlan: setPlanFn,
    setBypass: setBypassFn,
    newSession,
    listSessions,
    resumeSession,
    deleteSession: deleteSessionFn,
    renameSession: renameSessionFn,
    refreshMeta,
    pickWorkspace,
    rewind,
    setModel: setModelFn,
  };
}
