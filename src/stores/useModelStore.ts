import { create } from "zustand";
import type { AICLI, Provider } from "../shared/types";

interface ModelState {
  currentApp: string;
  currentProviderId: string;
  currentCli: AICLI;
  providers: Record<string, Provider & { settingsConfig?: Record<string, string> }>;
  setCurrentApp: (appId: string) => void;
  setCurrentCli: (cli: AICLI) => void;
  setCurrentProvider: (provider: Provider | null) => void;
  switchProvider: (id: string) => void;
  getEnabledProvider: () => Provider | null;
}

// Selectors live outside the store so they can be passed to zustand
// `useShallow` and other consumer patterns without re-creating identity.
export const selectCurrentProvider = (s: ModelState) =>
  s.currentProviderId ? s.providers[s.currentProviderId] ?? null : null;

export const useModelStore = create<ModelState>((set, get) => ({
  currentApp: "claude",
  currentProviderId: "",
  currentCli: "claude-code",
  providers: {},
  setCurrentApp: (appId) => set({ currentApp: appId }),
  setCurrentCli: (cli) => set({ currentCli: cli }),
  setCurrentProvider: (provider) => {
    if (!provider) {
      set({ currentProviderId: "" });
      return;
    }
    set({
      currentProviderId: provider.id,
      providers: { ...get().providers, [provider.id]: { ...provider } },
    });
  },
  switchProvider: (id) => {
    if (get().providers[id]) {
      set({ currentProviderId: id });
    }
  },
  getEnabledProvider: () => {
    const state = get();
    const p = state.providers[state.currentProviderId];
    return p || null;
  },
}));
