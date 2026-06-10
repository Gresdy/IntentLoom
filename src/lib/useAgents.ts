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
  /** Per-adapter auth state. The hint is rendered inline next to the
   * chip in the Agents panel so the user knows what command to run
   * (or what env var to set) when credentials are missing. */
  auth: {
    status: "logged_in" | "logged_out" | "unknown" | "not_required";
    hint: string | null;
  };
  /** Install hint used by the panel's "安装指南" / "复制命令" buttons.
   * Sourced from the same AGENT_INSTALL_INFO table the test suite
   * locks against so the panel and the canonical id list can never
   * drift. */
  install_url?: string;
  install_command?: string;
  /** Coarse-grained "can the user use this right now?" signal the
   * panel uses to pick an install vs login CTA. The Rust backend
   * derives this from `check_available` + `auth_state`; agents the
   * user hasn't set up at all show up here as `needs_install`. */
  setup: {
    status: "ready" | "needs_login" | "needs_install" | "misconfigured";
    message: string;
    cta?: { kind: "install_url"; url: string } | { kind: "install_command"; command: string } | { kind: "login_hint"; command: string };
  };
  /** User-overridden env vars, persisted via set_agent_config. Empty
   * when the user hasn't touched this adapter. */
  env: Record<string, string>;
}

export interface AgentConfig {
  cli_path: string | null;
  env: Record<string, string>;
}

interface AgentState {
  agents: AgentInfo[];
  loading: boolean;
  error: string | null;
  lastLoadedAt: number | null;
  loadAgents: () => Promise<void>;
  isAvailable: (id: string) => boolean;
  /** Set the user's per-agent overrides (cli_path + env). Persists
   * to disk via the Rust `set_agent_config` command, then refreshes
   * the agent list so the panel re-resolves `path` and `setup`. */
  setAgentConfig: (id: string, config: AgentConfig) => Promise<void>;
  /** Wipe a single adapter's overrides and refresh. */
  clearAgentConfig: (id: string) => Promise<void>;
}

/** Curated install hints keyed by adapter id. MUST stay in sync with
 * the Rust registry in `src-tauri/src/agents/` — the test in
 * `src/test/agentsPanel.test.ts` is the single source of truth on
 * the JS side, locking the keys to the six registered ids and
 * catching any future drift. */
export const AGENT_INSTALL_INFO: Record<string, { url: string; command: string }> = {
  claude: {
    url: "https://docs.anthropic.com/en/docs/claude-code/overview",
    command: "npm install -g @anthropic-ai/claude-code",
  },
  gemini: {
    url: "https://ai.google.dev/gemini-code",
    command: "gemini install",
  },
  codex: {
    url: "https://openai.com/codex",
    command: "安装 OpenAI Codex",
  },
  opencode: {
    url: "https://github.com/opencode-ai/opencode",
    command: "npm install -g opencode-ai",
  },
  openclaw: {
    url: "https://github.com/openclaw/openclaw",
    command: "npm install -g @openclaw/cli",
  },
  // Hermes is a Python project shipped from a CNB mirror (the user's
  // install lives at ~/.hermes/hermes, symlinked into ~/.local/bin).
  // Generic one-liner — keep this in sync when the upstream URL changes.
  hermes: {
    url: "https://cnb.cool/hermesagent-cn",
    command: "git clone https://cnb.cool/hermesagent-cn/hermes-agent-cn-mirror.git && cd hermes-agent && pip install -e .",
  },
};

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,
  lastLoadedAt: null,

  loadAgents: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await invoke<AgentInfo[]>("list_agents");
      // Stamp the canonical install hint onto each agent so the
      // panel can read it straight off the store without importing
      // AGENT_INSTALL_INFO separately. Backend remains the source of
      // truth for availability / version / auth; the install hint is
      // a pure UI concern.
      const agents = raw.map((a) => ({
        ...a,
        install_url: AGENT_INSTALL_INFO[a.id]?.url,
        install_command: AGENT_INSTALL_INFO[a.id]?.command,
      }));
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

  setAgentConfig: async (id, config) => {
    try {
      await invoke<AgentConfig>("set_agent_config", { id, config });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[useAgents] set_agent_config failed:", e);
    }
    // Re-fetch so the resolved `path` and `setup.status` reflect
    // the new override (a stale `cli_path` would lie about the
    // availability flag).
    await get().loadAgents();
  },

  clearAgentConfig: async (id) => {
    try {
      await invoke<void>("clear_agent_config", { id });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[useAgents] clear_agent_config failed:", e);
    }
    await get().loadAgents();
  },
}));

// One-shot loader for the ReasonixApp mount. Callers invoke this
// inside a `useEffect(() => { refreshAgentList() }, [])`. Splitting it
// out keeps the call site declarative.
export async function refreshAgentList(): Promise<void> {
  await useAgentStore.getState().loadAgents();
}
