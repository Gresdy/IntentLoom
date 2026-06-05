// Agent registry on the React side. The Rust adapter registry in
// `src-tauri/src/agents/` is the source of truth for which CLIs exist
// and whether they are installed; this store mirrors the subset of
// that data the UI needs to gate the TopBar tabs (Phase 1.5 of
// `docs/plan/multi-agent-cockpit.md`). All 6 adapters (Claude, Codex,
// Gemini, OpenCode, OpenClaw, Hermes) live in the registry; there is
// no longer a special case here.

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
      // Backend unreachable is the common case in vite dev (no Tauri
      // shell listening for the IPC bridge) and harmless — the TopBar
      // just shows every CLI as "未验证" until the next successful
      // load. Demote to console.warn in dev so the console isn't
      // dominated by the same message on every mount.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[useAgents] backend unreachable:", e);
      } else {
        // eslint-disable-next-line no-console
        console.error("Failed to load agents:", e);
      }
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
