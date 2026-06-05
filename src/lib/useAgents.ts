// Agent registry on the React side. The Rust adapter registry in
// `src-tauri/src/agents/` is the source of truth for which CLIs exist
// and whether they are installed; this store mirrors the subset of
// that data the UI needs to gate the TopBar tabs (Phase 1.5 of
// `docs/plan/multi-agent-cockpit.md`). Hermes is *not* part of the
// adapter registry — its disabled state lives on the `ALL_AGENTS`
// constant in ReasonixApp, which is the source of truth for not-yet-
// shipped agents regardless of `which`.

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
  lastLoadedAt: number | null;
  loadAgents: () => Promise<void>;
  isAvailable: (id: string) => boolean;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,
  lastLoadedAt: null,

  loadAgents: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await invoke<AgentInfo[]>("list_agents");
      set({ agents, loading: false, lastLoadedAt: Date.now() });
    } catch (e) {
      // Backend unreachable is not fatal: the TopBar just shows every
      // CLI as "未验证" until the next successful load.
      console.error("Failed to load agents:", e);
      set({
        agents: [],
        loading: false,
        error: String(e),
        lastLoadedAt: Date.now(),
      });
    }
  },

  isAvailable: (id: string) => {
    const found = get().agents.find((a) => a.id === id);
    return found ? found.available : false;
  },
}));

// One-shot loader for the ReasonixApp mount. Callers invoke this
// inside a `useEffect(() => { refreshAgentList() }, [])`. Splitting it
// out keeps the call site declarative.
export async function refreshAgentList(): Promise<void> {
  await useAgentStore.getState().loadAgents();
}
