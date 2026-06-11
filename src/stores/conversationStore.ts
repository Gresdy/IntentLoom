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
  // === Edit / regenerate (T4 parity) ===
  /**
   * Update the content of a single message in the current conversation
   * by id. Returns the resolved Message (or `undefined` if the id
   * did not match anything) so callers can immediately re-send with
   * the new text without having to scan the list themselves.
   */
  editMessageById: (messageId: string, updates: Partial<Message>) => Message | undefined;
  /**
   * Drop every message from the one with `messageId` onward. Returns
   * the index that was removed so the UI can scroll to the surviving
   * tail. Use this for user-message edit (truncate everything after
   * the edited message) and assistant regenerate (truncate the
   * assistant and everything after it).
   */
  truncateFromMessageId: (messageId: string) => number;
  /**
   * Drop every message that comes AFTER `messageId`, keeping the
   * message itself. Returns the number of messages that were
   * dropped. This is the "edit user message and re-send" case:
   * keep the (now-edited) user message but throw away the assistant
   * reply + any tool calls so the assistant can stream a fresh one.
   */
  truncateAfterMessageId: (messageId: string) => number;
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

      // T4 parity — edit a single message by id. Returns the
      // updated message so the caller (Transcript) can immediately
      // call `send(newText)` without re-scanning the list. When
      // the id does not exist (e.g. stale click on a row that was
      // already truncated) we return `undefined` and leave the
      // conversation untouched — the user will see their click
      // had no effect, but the transcript state stays consistent.
      editMessageById: (messageId, updates) => {
        let resolved: Message | undefined;
        set((state) => {
          if (!state.currentConversationId) return state;
          return {
            conversations: state.conversations.map((c) => {
              if (c.id !== state.currentConversationId) return c;
              const messages = c.messages.map((m) => {
                if (m.id !== messageId) return m;
                resolved = { ...m, ...updates };
                return resolved;
              });
              return { ...c, messages, updatedAt: Date.now() };
            }),
          };
        });
        return resolved;
      },

      // T4 parity — truncate from a given message id onward.
      // Returns the number of messages that were removed, so the
      // caller can decide whether to surface a "trimmed N messages"
      // toast. The id is matched by exact equality (not by `role`
      // or position) so this is safe to call on a user message
      // id (drops itself + everything after — useful for "delete
      // this turn and start over") OR on an assistant message id
      // (drops the assistant + everything after — useful for
      // regenerate). When the id is unknown we return 0 and leave
      // the conversation alone.
      truncateFromMessageId: (messageId) => {
        let removed = 0;
        set((state) => {
          if (!state.currentConversationId) return state;
          return {
            conversations: state.conversations.map((c) => {
              if (c.id !== state.currentConversationId) return c;
              const idx = c.messages.findIndex((m) => m.id === messageId);
              if (idx === -1) return c;
              removed = c.messages.length - idx;
              return {
                ...c,
                messages: c.messages.slice(0, idx),
                updatedAt: Date.now(),
              };
            }),
          };
        });
        return removed;
      },

      // T4 parity — keep `messageId`, drop everything after. Mirrors
      // the edit-and-resend flow: the user edits their prompt, we
      // keep the (now-edited) prompt, throw away the assistant
      // reply + any tool calls, then re-send.
      truncateAfterMessageId: (messageId) => {
        let removed = 0;
        set((state) => {
          if (!state.currentConversationId) return state;
          return {
            conversations: state.conversations.map((c) => {
              if (c.id !== state.currentConversationId) return c;
              const idx = c.messages.findIndex((m) => m.id === messageId);
              if (idx === -1) return c;
              if (idx === c.messages.length - 1) return c; // nothing to drop
              removed = c.messages.length - idx - 1;
              return {
                ...c,
                messages: c.messages.slice(0, idx + 1),
                updatedAt: Date.now(),
              };
            }),
          };
        });
        return removed;
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

// Selector: which conversation is currently active? Returns `null`
// for the empty / pre-create state so the `ConversationArtifactProvider`
// (Phase 5) can scope its store to a real id and skip re-seeding on
// every render. Mirrors AionUi's `selectCurrentConversationId`.
export function selectCurrentConversationId(state: ConversationState): string | null {
  return state.currentConversationId;
}
