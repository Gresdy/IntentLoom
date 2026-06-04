import { create } from "zustand";
import { invoke } from "../lib/tauri";

export interface Prompt {
  id: number;
  name: string;
  content: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface PromptsState {
  prompts: Prompt[];
  currentPrompt: Prompt | null;
  enabledPrompt: Prompt | null;
  isLoading: boolean;
  loadPrompts: () => Promise<void>;
  createPrompt: (name: string, content: string, description?: string) => Promise<Prompt | null>;
  updatePrompt: (id: number, name: string, content: string, description?: string) => Promise<Prompt | null>;
  deletePrompt: (id: number) => Promise<boolean>;
  enablePrompt: (id: number) => Promise<boolean>;
  disableAllPrompts: () => Promise<boolean>;
  setCurrentPrompt: (prompt: Prompt | null) => void;
}

export const usePromptsStore = create<PromptsState>((set, get) => ({
  prompts: [],
  currentPrompt: null,
  enabledPrompt: null,
  isLoading: false,

  loadPrompts: async () => {
    set({ isLoading: true });
    try {
      const prompts = await invoke<Prompt[]>("get_prompts");
      const enabledPrompt = prompts.find(p => p.enabled) || null;
      
      set({ 
        prompts, 
        enabledPrompt,
        isLoading: false 
      });
    } catch (error) {
      console.error("Failed to load prompts:", error);
      set({ isLoading: false });
    }
  },

  createPrompt: async (name, content, description) => {
    try {
      const prompt = await invoke<Prompt>("create_prompt", {
        prompt: { name, content, description }
      });
      await get().loadPrompts();
      return prompt;
    } catch (error) {
      console.error("Failed to create prompt:", error);
      return null;
    }
  },

  updatePrompt: async (id, name, content, description) => {
    try {
      const prompt = await invoke<Prompt>("update_prompt", {
        id,
        prompt: { name, content, description }
      });
      await get().loadPrompts();
      return prompt;
    } catch (error) {
      console.error("Failed to update prompt:", error);
      return null;
    }
  },

  deletePrompt: async (id) => {
    try {
      const result = await invoke<boolean>("delete_prompt", { id });
      if (result) {
        await get().loadPrompts();
      }
      return result;
    } catch (error) {
      console.error("Failed to delete prompt:", error);
      // Re-throw so the UI layer can show a proper notification
      throw error;
    }
  },

  enablePrompt: async (id) => {
    try {
      const result = await invoke<boolean>("enable_prompt", { id });
      if (result) {
        await get().loadPrompts();
      }
      return result;
    } catch (error) {
      console.error("Failed to enable prompt:", error);
      return false;
    }
  },

  disableAllPrompts: async () => {
    try {
      const result = await invoke<boolean>("disable_all_prompts");
      if (result) {
        await get().loadPrompts();
      }
      return result;
    } catch (error) {
      console.error("Failed to disable all prompts:", error);
      return false;
    }
  },

  setCurrentPrompt: (prompt) => {
    set({ currentPrompt: prompt });
  },
}));
