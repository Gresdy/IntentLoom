import { create } from 'zustand';
import type { Message, ToolCall, ToolResponse, PermissionRequest, PlanState, TokenUsage } from '@/types/message';
import type { ThinkingProcess } from '@/shared/thinking';
import type { ArtifactTally } from '@/lib/artifactTally';

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

  resetCurrentStream: () => {
    set({
      currentThinking: '',
      currentThinkingProcess: null,
      currentToolCalls: [],
      currentToolResponses: [],
      currentPermission: null,
      currentPlan: null,
      currentUsage: null,
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
