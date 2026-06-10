// OpenClaw session selector — the `--to` / `--session-id` / `--agent`
// flag the headless `openclaw agent` subcommand needs. See the
// adapter docstring in `src-tauri/src/agents/openclaw.rs` for the
// headless limitation this solves.
//
// Persisted in `localStorage` so the choice survives an app
// restart. Only the OpenClaw tab consults this store; other CLIs
// ignore it. The store ships with `OpenClawSession.is_set() ==
// false` (the "user hasn't picked yet" default) so the OpenClaw
// adapter falls through to its "no flag emitted" branch and the
// CLI's own "Pass --to/--session-id/--agent" error surfaces —
// the friendlySendError pipeline turns that into a clear
// "OpenClaw 需要指定 --to/--session-id/--agent" hint in the
// transcript, mirroring the Agents panel warning.

import { create } from "zustand";

export interface OpenClawSession {
  /** Maps to `--to <E.164>` — phone number, derives the session key. */
  to?: string;
  /** Maps to `--session-id <id>` — continue a persisted session. */
  sessionId?: string;
  /** Maps to `--agent <id>` — pick a named agent. */
  agent?: string;
}

export function isOpenclawSessionSet(s: OpenClawSession | null | undefined): boolean {
  if (!s) return false;
  return Boolean(
    (s.to && s.to.length > 0) ||
    (s.sessionId && s.sessionId.length > 0) ||
    (s.agent && s.agent.length > 0),
  );
}

const STORAGE_KEY = "intentloom.openclaw-session";

function readPersisted(): OpenClawSession {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as OpenClawSession;
    return {};
  } catch {
    return {};
  }
}

function writePersisted(s: OpenClawSession): void {
  if (typeof window === "undefined") return;
  try {
    if (isOpenclawSessionSet(s)) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Swallow storage failures (private mode / disabled storage);
    // the in-memory store still works for the current session.
  }
}

type State = {
  session: OpenClawSession;
  setSession: (next: OpenClawSession) => void;
  /** Convenience for the picker: clear all three fields. */
  clearSession: () => void;
};

export const useOpenclawSessionStore = create<State>((set) => ({
  session: readPersisted(),
  setSession: (next) => {
    writePersisted(next);
    set({ session: next });
  },
  clearSession: () => {
    writePersisted({});
    set({ session: {} });
  },
}));

/** Resolve the current OpenClaw session, or `null` if unset. Used
    by `reasonixAdapter.send` to forward to the IPC; `null`
    means "don't emit a flag, let the CLI surface its own
    missing-session error". */
export function resolveOpenclawSession(): OpenClawSession | null {
  const s = useOpenclawSessionStore.getState().session;
  return isOpenclawSessionSet(s) ? s : null;
}
