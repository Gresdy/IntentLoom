import { useCallback, useMemo, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "./tauri";
import { useConversationStore } from "@/stores/conversationStore";
import { useMessageStore } from "@/stores/messageStore";
import { useModelStore } from "@/stores/useModelStore";

export type Mode = "normal" | "plan" | "yolo";

export type ReasonixItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean; reasoning?: string }
  | { kind: "tool"; id: string; name: string; args: any; status: string; result?: any }
  | { kind: "phase"; id: string; text: string }
  | { kind: "notice"; id: string; level: string; text: string };

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

  const { isStreaming, currentThinking, setStreaming } = useMessageStore();

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
      }
    }

    return result;
  }, [conversationMessages, isStreaming, currentThinking, currentConversation]);

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
        const chunk = event.payload;
        const conv = getCurrentConversation();
        if (conv && conv.messages.length > 0) {
          const lastMsg = conv.messages[conv.messages.length - 1];
          updateLastMessage({ content: (lastMsg.content || "") + chunk });
        }
      });

      unlistenEnd = await listen("ai-stream-end", () => {
        setStreaming(false);
      });
    };

    setupListeners();
    return () => {
      unlistenChunk?.();
      unlistenEnd?.();
    };
  }, [getCurrentConversation, updateLastMessage, setStreaming]);

  const send = useCallback(
    async (text: string) => {
      let conv = getCurrentConversation();
      if (!conv) {
        conv = createConversation();
      }

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
          cli: "claude",
          message: text,
          conversationId: conv.id,
          projectPath: null,
        });
      } catch (error) {
        console.error("发送消息失败:", error);
        updateLastMessage({ content: `错误: ${error}` });
        setStreaming(false);
      }
    },
    [getCurrentConversation, createConversation, addMessageToCurrent, updateLastMessage, setStreaming]
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
