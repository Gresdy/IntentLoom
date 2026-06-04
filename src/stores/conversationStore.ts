import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, Message } from '@/types/message';

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
        const conversation: Conversation = {
          id: generateId(),
          name: `新对话 ${new Date().toLocaleString()}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          metadata: {},
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
    }
  )
);
