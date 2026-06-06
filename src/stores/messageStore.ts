import { create } from 'zustand';
import type { Message, ToolCall, ToolResponse, PermissionRequest, PlanState, TokenUsage } from '@/types/message';
import type { ThinkingProcess } from '@/shared/thinking';
import type { ArtifactTally } from '@/lib/artifactTally';

/**
 * In-conversation notice emitted by the streaming controller.
 * Used today for Hermes auth / network failure banners (T6) —
 * see `detectHermesNotice` in `src/lib/streamChunkParser.ts`
 * for the source side. The `level` field is rendered by the
 * Transcript as a CSS modifier (`notice--error`,
 * `notice--warn`, plain `notice`), so a future caller can opt
 * into a softer tone by passing `"warn"` or `"info"` instead
 * of `"error"`.
 */
export interface ConversationNotice {
  id: string;
  level: "info" | "warn" | "error";
  text: string;
}

interface MessageState {
  messages: Message[];
  isStreaming: boolean;
  
  // 流式输出状态
  currentThinking: string;
  currentThinkingProcess: ThinkingProcess | null;
  currentToolCalls: ToolCall[];
  currentToolResponses: ToolResponse[];
  currentPermission: PermissionRequest | null;
  currentPlan: PlanState | null;
  currentUsage: TokenUsage | null;

  // End-of-conversation artifact summary, keyed by conversation id.
  // Written by the streaming controller on `ai-stream-end`; read by
  // the transcript to render a one-time ConversationSummary card.
  summaryByConversation: Record<string, ArtifactTally>;

  /**
   * Notices emitted during the current turn — Hermes auth
   * failures, network errors, etc. Cleared on every new turn
   * (see `resetCurrentStream`) so the transcript does not
   * show stale banners from prior conversations.
   */
  notices: ConversationNotice[];

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  setStreaming: (streaming: boolean) => void;
  
  // Thinking actions
  setThinking: (thinking: string) => void;
  setThinkingProcess: (process: ThinkingProcess | null) => void;
  updateThinkingContent: (content: string) => void;
  appendThinking: (content: string) => void;
  
  // Tool actions
  addToolCall: (toolCall: ToolCall) => void;
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
  addToolResponse: (response: ToolResponse) => void;
  
  // Permission actions
  setPermission: (permission: PermissionRequest | null) => void;
  approvePermission: (tool: string, remember: boolean) => void;
  denyPermission: (tool: string) => void;
  
  // Plan actions
  setPlan: (plan: PlanState | null) => void;
  updatePlanEntry: (entryId: string, status: string) => void;
  
  // Usage actions
  setUsage: (usage: TokenUsage | null) => void;

  // Summary actions
  setSummary: (conversationId: string, tally: ArtifactTally) => void;

  // Notice actions
  addNotice: (level: ConversationNotice["level"], text: string) => void;
  clearNotices: () => void;

  // Stream reset
  resetCurrentStream: () => void;
  appendContent: (content: string) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isStreaming: false,
  
  currentThinking: '',
  currentThinkingProcess: null,
  currentToolCalls: [],
  currentToolResponses: [],
  currentPermission: null,
  currentPlan: null,
  currentUsage: null,
  summaryByConversation: {},
  notices: [],

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },
  
  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }));
  },
  
  clearMessages: () => {
    set({ messages: [] });
  },
  
  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },
  
  setThinking: (thinking) => {
    set({ currentThinking: thinking });
  },
  
  setThinkingProcess: (process) => {
    set({ currentThinkingProcess: process });
  },
  
  updateThinkingContent: (content) => {
    const state = get();
    if (state.messages.length === 0) return;
    
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.role !== 'assistant') return;
    
    set((state) => ({
      messages: state.messages.map((msg, idx) =>
        idx === state.messages.length - 1
          ? { ...msg, thinking: content }
          : msg
      ),
    }));
  },
  
  appendThinking: (content) => {
    set((state) => {
      const newThinking = (state.currentThinking || '') + content;
      return {
        currentThinking: newThinking,
        messages: state.messages.map((msg, idx) =>
          idx === state.messages.length - 1 && msg.role === 'assistant'
            ? { ...msg, thinking: (msg.thinking || '') + content }
            : msg
        ),
      };
    });
  },
  
  addToolCall: (toolCall) => {
    set((state) => ({
      currentToolCalls: [...state.currentToolCalls, toolCall],
    }));
  },
  
  updateToolCall: (id, updates) => {
    set((state) => ({
      currentToolCalls: state.currentToolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...updates } : tc
      ),
    }));
  },
  
  addToolResponse: (response) => {
    set((state) => ({
      currentToolResponses: [...state.currentToolResponses, response],
    }));
  },
  
  setPermission: (permission) => {
    set({ currentPermission: permission });
  },
  
  approvePermission: (_tool, _remember) => {
    set({ currentPermission: null });
  },
  
  denyPermission: (_tool) => {
    set({ currentPermission: null });
  },
  
  setPlan: (plan) => {
    set({ currentPlan: plan });
  },
  
  updatePlanEntry: (entryId, status) => {
    const state = get();
    if (!state.currentPlan) return;
    
    set({
      currentPlan: {
        ...state.currentPlan,
        entries: state.currentPlan.entries.map((entry) =>
          entry.id === entryId ? { ...entry, status: status as any } : entry
        ),
      },
    });
  },
  
  setUsage: (usage) => {
    set({ currentUsage: usage });
  },

  setSummary: (conversationId, tally) => {
    set((state) => ({
      summaryByConversation: { ...state.summaryByConversation, [conversationId]: tally },
    }));
  },

  addNotice: (level, text) => {
    // Deduplicate consecutive identical notices — the Hermes
    // CLI can emit the same line on retry, and the second copy
    // would otherwise pile on top of the first. We keep the
    // first occurrence (the user has already seen it) and
    // ignore the rest within a single turn; `resetCurrentStream`
    // will clear the list at the start of the next turn anyway.
    set((state) => {
      const last = state.notices[state.notices.length - 1];
      if (last && last.level === level && last.text === text) {
        return state;
      }
      return {
        notices: [
          ...state.notices,
          {
            id: `notice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            level,
            text,
          },
        ],
      };
    });
  },

  clearNotices: () => {
    set({ notices: [] });
  },

  resetCurrentStream: () => {
    set({
      currentThinking: '',
      currentThinkingProcess: null,
      currentToolCalls: [],
      currentToolResponses: [],
      currentPermission: null,
      currentPlan: null,
      currentUsage: null,
      notices: [],
    });
  },
  
  appendContent: (content) => {
    const state = get();
    if (state.messages.length === 0) return;
    
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.role !== 'assistant') return;
    
    set((state) => ({
      messages: state.messages.map((msg, idx) =>
        idx === state.messages.length - 1
          ? { ...msg, content: msg.content + content }
          : msg
      ),
    }));
  },
}));
