import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, Message } from '@/types/message';
import { useModelStore } from './useModelStore';

interface ConversationState {
  conversations: Conversation[];
  currentConversationId: string | null;
  
  // Actions
  createConversation: () => Conversation;
  deleteConversation: (id: string) => void;
  selectConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  addMessageToCurrent: (message: Message) => void;
  updateLastMessage: (updates: Partial<Message>) => void;
  getCurrentConversation: () => Conversation | undefined;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      
      createConversation: () => {
        // Bind the new conversation to whatever agent is currently
        // active in the TopBar so that switching tabs later doesn't
        // silently re-route the conversation to a different CLI.
        const agentId = useModelStore.getState().currentApp;
        const conversation: Conversation = {
          id: generateId(),
          name: `新对话 ${new Date().toLocaleString()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          metadata: { agentId },
        };
        
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentConversationId: conversation.id,
        }));
        
        return conversation;
      },
      
      deleteConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
        }));
      },
      
      selectConversation: (id) => {
        set({ currentConversationId: id });
      },
      
      updateConversation: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
          ),
        }));
      },
      
      addMessageToCurrent: (message) => {
        set((state) => {
          if (!state.currentConversationId) {
            return state;
          }
          
          const updated = {
            conversations: state.conversations.map((c) =>
              c.id === state.currentConversationId
                ? {
                    ...c,
                    messages: [...c.messages, message],
                    updatedAt: Date.now(),
                  }
                : c
            ),
          };
          return updated;
        });
      },
      
      updateLastMessage: (updates) => {
        set((state) => {
          if (!state.currentConversationId) {
            return state;
          }
          
          const updated = {
            conversations: state.conversations.map((c) => {
              if (c.id !== state.currentConversationId) return c;
              
              const messages = [...c.messages];
              if (messages.length === 0) {
                return c;
              }
              
              messages[messages.length - 1] = {
                ...messages[messages.length - 1],
                ...updates,
              };
              
              return {
                ...c,
                messages,
                updatedAt: Date.now(),
              };
            }),
          };
          return updated;
        });
      },
      
      getCurrentConversation: () => {
        const state = get();
        return state.conversations.find((c) => c.id === state.currentConversationId);
      },
    }),
    {
      name: 'intentloom-conversations',
      version: 1,
      // Migrate older persisted conversations so the new agentId field
      // is always populated. Anything without an explicit agentId
      // defaults to "claude" — the historical behaviour before Phase 2.
      migrate: (persisted: unknown, fromVersion: number) => {
        if (!persisted || typeof persisted !== 'object') return persisted as ConversationState;
        const state = persisted as ConversationState;
        if (fromVersion < 1 && Array.isArray(state.conversations)) {
          state.conversations = state.conversations.map((c) => ({
            ...c,
            metadata: { agentId: 'claude', ...(c.metadata ?? {}) },
          }));
        }
        return state;
      },
    }
  )
);

// Selector: which agent (CLI) does the current conversation belong to?
// Falls back to "claude" for legacy conversations that predate the
// Phase 2 binding work. The fallback matches the historical default —
// the app used to be Claude-only, so it never *mis*-routes, only ever
// *under*-routes old data to the legacy default.
export function selectCurrentAgentId(state: ConversationState): string {
  const cur = state.conversations.find((c) => c.id === state.currentConversationId);
  return cur?.metadata?.agentId ?? 'claude';
}
