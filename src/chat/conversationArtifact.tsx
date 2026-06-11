/**
 * conversationArtifact — AionUi `ConversationArtifactProvider` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/artifacts.tsx
 *
 * A "conversation artifact" is a non-message UI surface that lives
 * inside the active conversation — the canonical examples are a
 * skill_suggest card the user can accept / dismiss, and a
 * cron_trigger card that navigates to the scheduled-task detail
 * view. AionUi keeps these in a separate React context so:
 *   - Multiple `MessageSkillSuggest` cards across the transcript
 *     can share accept/dismiss state.
 *   - The cron page can observe the last-triggered cron job without
 *     subscribing to every transcript row.
 *   - The provider survives the transcript being remounted
 *     (e.g. when the user switches conversations and back).
 *
 * IntentLoom port notes:
 *   - The store is a thin in-memory map keyed by artifact id.
 *     Persistence to SQLite is intentionally out of scope: the
 *     `reasonixAdapter` already streams `cron_trigger` /
 *     `skill_suggest` events as first-class ReasonixItems, so the
 *     artifact store only tracks "user has interacted with this
 *     artifact" — not the artifact data itself.
 *   - The hook `useConversationArtifactStore()` is the only export
 *     consumers should reach for. The Provider component is a thin
 *     wrapper that does nothing more than mount the store onto the
 *     React tree.
 *   - Conversation-scoped: when the host changes `conversationId`,
 *     the store drops its state to avoid leaking accept/dismiss
 *     choices between conversations.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export type ConversationArtifactStatus = "pending" | "accepted" | "dismissed" | "active" | "inactive";

export type ConversationArtifactKind = "skill_suggest" | "cron_trigger";

export interface ConversationArtifactMeta {
  id: string;
  conversation_id: string;
  kind: ConversationArtifactKind;
  status: ConversationArtifactStatus;
  created_at: number;
  updated_at: number;
  /** Free-form payload — typed loosely because the gateway
   *  serialises/deserialises it opaquely. The renderer reads
   *  `name` / `description` / `cronJobId` etc. from `payload` and
   *  does its own schema validation. */
  payload?: Record<string, unknown>;
}

export interface ConversationArtifactStoreValue {
  conversationId: string | null;
  /** All known artifacts for the active conversation, sorted by
   *  `created_at` ascending. */
  artifacts: ConversationArtifactMeta[];
  /** Look up a single artifact by id. */
  getArtifact: (id: string) => ConversationArtifactMeta | undefined;
  /** True if the user has accepted a `skill_suggest` card. */
  isAccepted: (id: string) => boolean;
  /** True if the user has dismissed a card (any kind). */
  isDismissed: (id: string) => boolean;
  upsertArtifact: (artifact: ConversationArtifactMeta) => void;
  setArtifactStatus: (id: string, status: ConversationArtifactStatus) => void;
  removeArtifact: (id: string) => void;
}

const noop = () => undefined;

const EMPTY_STORE: ConversationArtifactStoreValue = {
  conversationId: null,
  artifacts: [],
  getArtifact: noop,
  isAccepted: () => false,
  isDismissed: () => false,
  upsertArtifact: noop,
  setArtifactStatus: noop,
  removeArtifact: noop,
};

const ConversationArtifactContext = createContext<ConversationArtifactStoreValue>(EMPTY_STORE);

export function useConversationArtifactStore(): ConversationArtifactStoreValue {
  return useContext(ConversationArtifactContext);
}

/** Filter helper: which artifacts should be visible in the active
 *  transcript right now?
 *   - `cron_trigger` shows only when its status is `active`
 *   - `skill_suggest` shows only when its status is `pending`
 *  Mirrors AionUi's `visibleArtifacts` selector. */
export function visibleArtifacts(artifacts: ConversationArtifactMeta[]): ConversationArtifactMeta[] {
  return artifacts.filter((a) => {
    if (a.kind === "cron_trigger") return a.status === "active";
    if (a.kind === "skill_suggest") return a.status === "pending";
    return false;
  });
}

export interface ConversationArtifactProviderProps {
  conversationId: string | null;
  /** Optional pre-seed list (e.g. loaded from a parent IPC). */
  initial?: ConversationArtifactMeta[];
  /** Optional subscriber for live updates (e.g. AionUi's
   *  `ipcBridge.conversation.artifactStream.on`). */
  onStream?: (handler: (artifact: ConversationArtifactMeta) => void) => () => void;
  children: ReactNode;
}

export function ConversationArtifactProvider({
  conversationId,
  initial,
  onStream,
  children,
}: ConversationArtifactProviderProps) {
  const [artifacts, setArtifacts] = useState<ConversationArtifactMeta[]>(() =>
    initial ? [...initial].sort((a, b) => a.created_at - b.created_at) : []
  );

  // Reset state when the conversation changes so accept/dismiss
  // choices from a previous conversation don't leak over.
  const lastConvIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastConvIdRef.current === conversationId) return;
    lastConvIdRef.current = conversationId;
    setArtifacts(initial ? [...initial].sort((a, b) => a.created_at - b.created_at) : []);
  }, [conversationId, initial]);

  const upsertArtifact = useCallback((artifact: ConversationArtifactMeta) => {
    setArtifacts((current) => {
      const idx = current.findIndex((a) => a.id === artifact.id);
      if (idx === -1) return [...current, artifact].sort((a, b) => a.created_at - b.created_at);
      const next = current.slice();
      next[idx] = artifact;
      return next;
    });
  }, []);

  const setArtifactStatus = useCallback((id: string, status: ConversationArtifactStatus) => {
    setArtifacts((current) =>
      current.map((a) => (a.id === id ? { ...a, status, updated_at: Date.now() } : a))
    );
  }, []);

  const removeArtifact = useCallback((id: string) => {
    setArtifacts((current) => current.filter((a) => a.id !== id));
  }, []);

  const getArtifact = useCallback(
    (id: string) => artifacts.find((a) => a.id === id),
    [artifacts]
  );

  const isAccepted = useCallback(
    (id: string) => artifacts.find((a) => a.id === id)?.status === "accepted",
    [artifacts]
  );

  const isDismissed = useCallback(
    (id: string) => artifacts.find((a) => a.id === id)?.status === "dismissed",
    [artifacts]
  );

  // Optional live stream subscription.
  useEffect(() => {
    if (!onStream) return;
    return onStream((artifact) => {
      if (conversationId && artifact.conversation_id && artifact.conversation_id !== conversationId) return;
      upsertArtifact(artifact);
    });
  }, [conversationId, onStream, upsertArtifact]);

  const value = useMemo<ConversationArtifactStoreValue>(
    () => ({
      conversationId,
      artifacts,
      getArtifact,
      isAccepted,
      isDismissed,
      upsertArtifact,
      setArtifactStatus,
      removeArtifact,
    }),
    [conversationId, artifacts, getArtifact, isAccepted, isDismissed, upsertArtifact, setArtifactStatus, removeArtifact]
  );

  return <ConversationArtifactContext.Provider value={value}>{children}</ConversationArtifactContext.Provider>;
}
