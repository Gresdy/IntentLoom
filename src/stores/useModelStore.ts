import { create } from "zustand";
import type { AICLI, AppId, Provider } from "../shared/types";
import { CLI_DEFAULT_MODEL, defaultModelForCli } from "../config/cliPresets";

interface ModelState {
  /**
   * Active top-bar tab id. Matches the `id` field of every
   * adapter in `src-tauri/src/agents/`. Kept as a free
   * `string` (not a `AICLI` union) because the top bar also
   * carries the legacy "claude-code" / "hermes" aliases that
   * do not have a dedicated adapter of their own.
   */
  currentApp: string;
  /** Currently active CLI id (matches `AgentAdapter.id`). */
  currentCli: AICLI;
  /** Active provider id (matches `Provider.id`). Empty = none. */
  currentProviderId: string;
  /**
   * Active model id **per CLI**. Keyed by `AppId` so the
   * composer's model dropdown restores the right selection
   * after the user tabs back to a previous CLI. The composer
   * reads this on render and writes back via
   * `setCurrentModel(cli, modelId)`.
   */
  currentModelByCli: Record<string, string>;
  /**
   * Active provider id **per CLI**. Same pattern as
   * `currentModelByCli` — kept per-CLI so the user can have
   * "DeepSeek" for Claude and "OpenAI Official" for Codex
   * simultaneously without one stomping the other.
   */
  currentProviderByCli: Record<string, string>;
  /** Flat provider map keyed by id; populated from the bundled presets. */
  providers: Record<string, Provider & { settingsConfig?: Record<string, string> }>;
  setCurrentApp: (appId: string) => void;
  setCurrentCli: (cli: AICLI) => void;
  setCurrentProvider: (provider: Provider | null) => void;
  registerProvider: (provider: Provider) => void;
  switchProvider: (id: string) => void;
  /**
   * Set the active model for a CLI. The composer wires this
   * to its Model dropdown's `onChange`. When `modelId` is
   * `null` we clear the slot (the composer then falls back
   * to the per-CLI default at send time). Unknown ids are
   * stored verbatim so the user sees their own typo instead
   * of a silent reset.
   */
  setCurrentModel: (cli: AppId, modelId: string | null) => void;
  /**
   * Set the active provider for a CLI. Wired to the
   * StatusBar's provider picker. We also mirror the id into
   * `currentProviderId` when `cli` matches `currentCli` so
   * the legacy flat-`currentProviderId` consumers (StatusBar
   * header label) keep reading the right value.
   */
  setCurrentProviderForCli: (cli: AppId, providerId: string | null) => void;
  getEnabledProvider: () => Provider | null;
}

// Selectors live outside the store so they can be passed to zustand
// `useShallow` and other consumer patterns without re-creating identity.
export const selectCurrentProvider = (s: ModelState) =>
  s.currentProviderId ? s.providers[s.currentProviderId] ?? null : null;

/**
 * Resolve the model id the composer / send pipeline should
 * use for a CLI: the user's explicit choice, falling back to
 * the per-CLI default from `cliPresets`. Returns `""` when
 * the CLI genuinely has no model picker (hermes / openclaw) —
 * the Rust side treats that as "do not pass any model hint".
 *
 * Accepts `string` (not the strict `AppId` union) because
 * `currentApp` in this store is a free `string` — the top
 * bar carries legacy aliases like `claude-code` / `hermes`
 * that are not all in `AICLI`. Unknown ids fall back to
 * `""` so a stale `localStorage` value cannot crash the
 * lookup chain.
 */
export function effectiveModelForCli(
  state: Pick<ModelState, "currentModelByCli">,
  cli: string,
): string {
  const stored = state.currentModelByCli[cli];
  if (stored && stored.length > 0) return stored;
  return (
    defaultModelForCli(cli as AppId) ||
    (CLI_DEFAULT_MODEL as Record<string, string>)[cli] ||
    ""
  );
}

export const useModelStore = create<ModelState>((set, get) => ({
  currentApp: "claude",
  currentCli: "claude-code",
  currentProviderId: "",
  currentModelByCli: {},
  currentProviderByCli: {},
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
  registerProvider: (provider) => {
    if (get().providers[provider.id]) return;
    set({
      providers: { ...get().providers, [provider.id]: { ...provider } },
    });
  },
  switchProvider: (id) => {
    if (get().providers[id]) {
      set({ currentProviderId: id });
    }
  },
  setCurrentModel: (cli, modelId) =>
    set((s) => {
      const next = { ...s.currentModelByCli };
      if (modelId && modelId.length > 0) {
        next[cli] = modelId;
      } else {
        delete next[cli];
      }
      return { currentModelByCli: next };
    }),
  setCurrentProviderForCli: (cli, providerId) =>
    set((s) => {
      const next = { ...s.currentProviderByCli };
      if (providerId && providerId.length > 0) {
        next[cli] = providerId;
      } else {
        delete next[cli];
      }
      const updates: Partial<ModelState> = { currentProviderByCli: next };
      // Keep the legacy flat currentProviderId in sync so the
      // StatusBar's "active provider" label does not lie when
      // the user switches CLI mid-conversation.
      if (cli === s.currentApp || cli === s.currentCli) {
        updates.currentProviderId = providerId ?? "";
      }
      return updates;
    }),
  getEnabledProvider: () => {
    const state = get();
    const p = state.providers[state.currentProviderId];
    return p || null;
  },
}));
