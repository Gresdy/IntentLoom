/**
 * Per-agent readiness hook — references AionUi's
 * `useAgentReadinessCheck` (aionui/src/renderer/hooks/agent/useAgentReadinessCheck.ts).
 *
 * The two projects share the same problem: knowing whether a
 * local CLI is *available* is not the same as knowing whether
 * it is *ready to chat right now*. A binary that resolves on
 * `$PATH` may still be missing auth, may have an expired token,
 * or may simply not be installed in the way the user thinks it
 * is. The topbar / Agents panel need a way to ask the backend
 * "actually run this CLI and tell me if it works" without
 * blocking the UI on a multi-second probe — and, when the
 * current agent is broken, to discover an alternative in the
 * same shape.
 *
 * IntentLoom's implementation differs from AionUi's in three
 * concrete ways because our backend surface is different:
 *
 *   1. The probe here is `check_agent_health` (a
 *      `<bin> --version` round-trip), not AionUi's deeper
 *      ACP-session handshake. AionUi's probe creates a
 *      protocol session and sends a real prompt; we keep
 *      ours to a single 5s-bounded version round-trip so a
 *      misbehaving CLI cannot park the Tauri worker and so
 *      the test suite does not need network access to verify
 *      the happy path. The on-demand nature is the same:
 *      the user clicks "重新检测" (or auto-retries after a
 *      failed `send_chat_message`) and this hook fires.
 *
 *   2. We do NOT have a separate "is preset" / "is remote"
 *      filter because IntentLoom's adapter registry is
 *      homogeneous — every id is a local CLI, no ACP-vs-Gemini
 *      split. The `availableAgents` list is therefore a flat
 *      list of every other registered adapter (excluding the
 *      one we are checking, since recommending "use the
 *      same broken CLI" is not useful).
 *
 *   3. The state shape mirrors the AionUi hook one-for-one
 *      (`isReady`, `isChecking`, `error`, `progress`,
 *      `currentAgent`, `availableAgents`, `bestAgent`) so a
 *      future migration to ACP-style probes can reuse the
 *      consumers without touching the call sites.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@/lib/tauri";
import { useAgentStore, type AgentInfo } from "@/lib/useAgents";

export interface AgentHealth {
  id: string;
  available: boolean;
  /** Handshake latency in ms; 0 when the binary is missing. */
  latencyMs: number;
  /** Resolved absolute path, when the lookup succeeded. */
  path: string | null;
  /** CLI-reported version string, or `null` if `--version` did
   * not surface one (or the probe never ran). */
  version: string | null;
  /** Short user-visible error on the failure path; `null` on
   * the happy path. Mirrors the Rust `HealthCheck.error`. */
  error: string | null;
  /** Unix millis when the probe was performed. Lets the
   * consumer render a "checked 12s ago" freshness hint. */
  checkedAt: number;
  /** The same `auth` shape that the bulk `list_agents` returns
   * for this adapter — kept in sync with `AgentInfo.auth` so
   * the consumer can render a single chip from the
   * `check_agent_health` payload alone. */
  auth: AgentInfo["auth"];
  /** Same `setup` shape as `AgentInfo.setup` — the
   * coarse-grained "is the agent usable right now?" signal. */
  setup: AgentInfo["setup"];
}

export interface AgentReadinessState {
  /** True until a probe reports otherwise. Mirrors AionUi's
   * "assume ready until proven otherwise" default so the UI
   * does not flash a red banner on the very first render. */
  isReady: boolean;
  /** True while a probe (current or alternative scan) is in
   * flight. The consumer is expected to dim the chip and
   * show a spinner while this is set. */
  isChecking: boolean;
  /** Error message from the most recent failed probe, or
   * `undefined` when the last probe succeeded / has not run. */
  error?: string;
  /** Other agents the consumer can recommend if the current
   * one is broken. `available === true` entries are the
   * ready-to-go candidates. `available === false` entries
   * carry a `health.error` string the consumer can surface
   * next to the chip. */
  availableAgents: Array<AgentInfo & { health: AgentHealth }>;
  /** The first agent in `availableAgents` whose health probe
   * returned `available: true`. `null` when no alternative
   * is usable. The consumer surfaces this as the recommended
   * fallback. */
  bestAgent: (AgentInfo & { health: AgentHealth }) | null;
  /** 0-100 progress for the alternative-scan loop. The
   * current-agent probe is a single shot, so `progress`
   * stays at 0 for `checkCurrentAgent` and ramps up only
   * during `findAlternatives`. */
  progress: number;
  /** The agent whose health is currently being probed. The
   * consumer uses this to render a "正在检测 Claude…" toast
   * instead of guessing from `isChecking`. */
  currentAgent: string | null;
}

export type UseAgentReadinessCheckOptions = {
  /** The adapter id to check. Required — the hook always
   * targets one specific CLI, never "all of them". */
  id: string;
  /** Whether to fire `performFullCheck` on mount. Default
   * `false` so mounting the hook is cheap; callers opt in
   * when the user opens the agent panel or after a
   * failed `send_chat_message`. */
  autoCheck?: boolean;
  /** Callback fired the first time an alternative probe
   * comes back `available: true`. The consumer can use
   * this to auto-switch tabs or surface a "ready to use X
   * instead" suggestion. */
  onAgentReady?: (agent: AgentInfo & { health: AgentHealth }) => void;
};

const INITIAL_STATE: AgentReadinessState = {
  isReady: true,
  isChecking: false,
  availableAgents: [],
  bestAgent: null,
  progress: 0,
  currentAgent: null,
};

interface RustHealthReport {
  id: string;
  health: {
    available: boolean;
    latencyMs: number;
    path: string | null;
    version: string | null;
    error: string | null;
    checkedAt: number;
  };
  auth: AgentInfo["auth"];
  setup: AgentInfo["setup"];
}

/** Internal helper: normalize the Rust `AgentHealthReport`
 * payload into the flat `AgentHealth` shape the rest of the
 * hook uses. Centralized so a future schema change only
 * touches one place. */
function normalizeHealth(report: RustHealthReport): AgentHealth {
  return {
    id: report.id,
    available: report.health.available,
    latencyMs: report.health.latencyMs,
    path: report.health.path,
    version: report.health.version,
    error: report.health.error,
    checkedAt: report.health.checkedAt,
    auth: report.auth,
    setup: report.setup,
  };
}

export function useAgentReadinessCheck(options: UseAgentReadinessCheckOptions) {
  const { id, autoCheck = false, onAgentReady } = options;
  const [state, setState] = useState<AgentReadinessState>({
    ...INITIAL_STATE,
    currentAgent: id,
  });

  // Keep the latest `onAgentReady` in a ref so the
  // `findAlternatives` loop can fire it without re-creating
  // the loop closure on every render. The hook contract is
  // that consumers can pass a fresh callback each render
  // without forcing a re-probe.
  const onReadyRef = useRef(onAgentReady);
  useEffect(() => {
    onReadyRef.current = onAgentReady;
  }, [onAgentReady]);

  /** Probe the agent identified by `id`. Returns `true` when
   * the probe came back `available: true`, `false` for any
   * other path. The boolean is also reflected in the state
   * (`isReady` flips to `false` on a failure). */
  const checkCurrentAgent = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({
      ...prev,
      isChecking: true,
      currentAgent: id,
    }));
    try {
      const report = await invoke<RustHealthReport>("check_agent_health", { id });
      const health = normalizeHealth(report);
      setState((prev) => ({
        ...prev,
        isReady: health.available,
        isChecking: false,
        error: health.error ?? undefined,
        currentAgent: health.id,
      }));
      return health.available;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        isReady: false,
        isChecking: false,
        error: msg,
      }));
      return false;
    }
  }, [id]);

  /** Scan every other registered adapter in sequence and
   * return the first one whose probe comes back
   * `available: true`. The result is also reflected in
   * state — `bestAgent` is set as soon as we find a hit so
   * the consumer can render a recommendation without waiting
   * for the rest of the loop to finish. */
  const findAlternatives = useCallback(async () => {
    // Snapshot the current registry. We pull from the
    // existing `useAgentStore` rather than re-fetching
    // because the registry is already kept fresh by
    // `refreshAgentList` on mount; the on-demand alternative
    // scan only needs the list of ids, not the full info
    // payload. If the store is empty (e.g. first render
    // before `refreshAgentList` resolves), the alternative
    // scan simply returns no candidates — the consumer can
    // call `refreshAgentList` and retry.
    const allAgents = useAgentStore.getState().agents;
    const candidates = allAgents
      .filter((a) => a.id !== id)
      .map((a) => ({ ...a, health: null as unknown as AgentHealth }));

    setState((prev) => ({
      ...prev,
      isChecking: true,
      progress: 0,
      availableAgents: candidates,
      bestAgent: null,
    }));

    const total = candidates.length;
    if (total === 0) {
      setState((prev) => ({ ...prev, isChecking: false, progress: 100 }));
      return;
    }

    let completed = 0;
    let firstAvailable: (AgentInfo & { health: AgentHealth }) | null = null;
    const results: Array<AgentInfo & { health: AgentHealth }> = [];

    for (const candidate of candidates) {
      try {
        const report = await invoke<RustHealthReport>("check_agent_health", { id: candidate.id });
        const health = normalizeHealth(report);
        const enriched = { ...candidate, health };
        results.push(enriched);
        if (health.available && !firstAvailable) {
          firstAvailable = enriched;
          // Surface the first hit immediately so the
          // consumer can render a "建议切换到 X" suggestion
          // without waiting for the rest of the loop. The
          // remaining candidates still get probed (cheap
          // version round-trips) so a future
          // "排序备选" affordance has the full picture.
          setState((prev) => ({
            ...prev,
            isChecking: false,
            bestAgent: firstAvailable,
            availableAgents: results,
          }));
          onReadyRef.current?.(firstAvailable);
          // Short-circuit: the rest of the registry is
          // not probed, so a slow CLI two slots down
          // cannot hold up a recommendation. This
          // matches the AionUi `useAgentReadinessCheck`
          // behavior (`return` inside its `forEach`) and
          // keeps the probe count to the minimum
          // necessary to find a fallback.
          break;
        }
      } catch (err) {
        // Per-candidate failures are recorded but do not
        // short-circuit the loop. A single broken probe
        // should not deny the user the chance to switch to
        // a different working agent.
        const errorMsg = err instanceof Error ? err.message : String(err);
        const syntheticHealth: AgentHealth = {
          id: candidate.id,
          available: false,
          latencyMs: 0,
          path: candidate.path,
          version: candidate.version,
          error: errorMsg,
          checkedAt: Date.now(),
          auth: candidate.auth,
          setup: candidate.setup,
        };
        results.push({ ...candidate, health: syntheticHealth });
      }
      completed++;
      setState((prev) => ({
        ...prev,
        progress: Math.round((completed / total) * 100),
        availableAgents: [
          ...results,
          ...candidates.slice(completed).map((c) => ({ ...c, health: null as unknown as AgentHealth })),
        ],
      }));
    }

    setState((prev) => ({
      ...prev,
      isChecking: false,
      progress: 100,
      bestAgent: firstAvailable ?? prev.bestAgent,
      availableAgents: results,
    }));
  }, [id]);

  /** Convenience: probe the current agent; if it is not
   * ready, immediately run `findAlternatives`. Mirrors
   * AionUi's `performFullCheck` so call sites can be one
   * shot. */
  const performFullCheck = useCallback(async () => {
    const ok = await checkCurrentAgent();
    if (!ok) {
      await findAlternatives();
    }
  }, [checkCurrentAgent, findAlternatives]);

  /** Reset to the initial state. Useful when the user
   * switches tabs (we want the new tab's first render to
   * start from a clean slate, not show stale
   * `availableAgents` from the previous tab). */
  const reset = useCallback(() => {
    setState({ ...INITIAL_STATE, currentAgent: id });
  }, [id]);

  // Auto-check on mount when the consumer opted in. The
  // effect deps are limited to `autoCheck` and the callbacks
  // — `id` changing is handled by the `useEffect` ordering
  // below (we re-probe on id change so the hook is
  // re-usable across agent switches).
  useEffect(() => {
    if (autoCheck) {
      void performFullCheck();
    }
    // performFullCheck already includes `id` in its dep
    // chain (via checkCurrentAgent / findAlternatives), so
    // we deliberately don't list it here — we only want to
    // re-fire on opt-in changes, not on every `id` tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheck, performFullCheck]);

  // Re-probe when `id` changes. The hook is mounted once
  // per agent tab in the current ReasonixApp wiring, but a
  // future consumer might mount it once and pass dynamic
  // ids; this effect makes the second pattern safe.
  useEffect(() => {
    setState({ ...INITIAL_STATE, currentAgent: id });
  }, [id]);

  return {
    ...state,
    checkCurrentAgent,
    findAlternatives,
    performFullCheck,
    reset,
  };
}

export default useAgentReadinessCheck;
