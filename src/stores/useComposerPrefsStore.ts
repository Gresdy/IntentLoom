import { create } from "zustand";
import type { AppId } from "../shared/types";
import { CLI_CAPABILITIES } from "../lib/cliCapabilities";

// Per-CLI selection for the composer's mode and reasoning dropdowns.
// Stored independently of the active CLI so switching back to a previous
// CLI restores its last setting (rather than always defaulting).
type ComposerPrefs = {
  /** Currently selected mode option id, keyed by CLI. */
  modeByCli: Partial<Record<AppId, string>>;
  /** Currently selected reasoning option id, keyed by CLI. Null when
      the CLI doesn't expose reasoning, or the user hasn't picked yet. */
  reasoningByCli: Partial<Record<AppId, string>>;
  setMode: (cli: AppId, id: string) => void;
  setReasoning: (cli: AppId, id: string) => void;
};

export const useComposerPrefsStore = create<ComposerPrefs>((set) => ({
  modeByCli: {},
  reasoningByCli: {},
  setMode: (cli, id) =>
    set((s) => ({ modeByCli: { ...s.modeByCli, [cli]: id } })),
  setReasoning: (cli, id) =>
    set((s) => ({ reasoningByCli: { ...s.reasoningByCli, [cli]: id } })),
}));

/**
 * Resolve the effective mode id for a CLI, falling back to the
 * spec default. The caller passes `modeByCli` explicitly so the
 * helper stays a pure function — ReasonixApp subscribes to the
 * map and forwards it on every render, which is what makes the
 * composer re-render the instant the user picks a value (see
 * the `modeByCli` / `reasoningByCli` subscriptions in
 * `ReasonixApp.tsx`).
 */
export function resolveModeId(
  cli: AppId,
  modeByCli: Partial<Record<AppId, string>>,
): string | null {
  const spec = CLI_CAPABILITIES[cli]?.modes;
  if (!spec) return null;
  const stored = modeByCli[cli];
  if (stored && spec.options.some((o) => o.id === stored)) return stored;
  return spec.defaultId;
}

/** Resolve the effective reasoning id for a CLI, falling back
    to the spec default (or null when the CLI has no reasoning
    spec). See `resolveModeId` for why the map is passed
    explicitly instead of read from `getState()`. */
export function resolveReasoningId(
  cli: AppId,
  reasoningByCli: Partial<Record<AppId, string>>,
): string | null {
  const spec = CLI_CAPABILITIES[cli]?.reasoning;
  if (!spec) return null;
  const stored = reasoningByCli[cli];
  if (stored && spec.options.some((o) => o.id === stored)) return stored;
  return spec.defaultId;
}
