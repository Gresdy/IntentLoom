import { create } from "zustand";
import { invoke } from "./tauri";

export interface AgentInfo {
  id: string;
  name: string;
  display_name: string;
  available: boolean;
  path: string | null;
  version: string | null;
  supports_streaming: boolean;
  description: string;
}

interface AgentState {
  agents: AgentInfo[];
  loading: boolean;
  error: string | null;
  loadAgents: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  loading: false,
  error: null,

  loadAgents: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await invoke<AgentInfo[]>("list_agents");
      set({ agents, loading: false });
    } catch (e) {
      console.error("Failed to load agents:", e);
      set({ 
        agents: [
          { id: "claude", name: "claude", display_name: "Claude", available: false, path: null, version: null, supports_streaming: false, description: "Anthropic Claude" },
          { id: "hermes", name: "hermes", display_name: "Hermes", available: true, path: null, version: null, supports_streaming: true, description: "IntentLoom Hermes" },
        ],
        loading: false 
      });
    }
  },
}));
