/**
 * usePendingConfirmationsRecovery — AionUi `usePendingConfirmationsRecovery` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/usePendingConfirmationsRecovery.ts
 *
 * After a page refresh, in-flight permission requests that the user
 * never answered are still in the message list as `status: "pending"`
 * items — but the agent has long since given up waiting. This hook
 * scans the items on mount and, for every pending permission request,
 * pops a toast asking the user to re-confirm or dismiss it.
 *
 * IntentLoom port notes:
 *   - We use the existing `useToastStore` instead of the AionUi
 *     `Message.useMessage()` so the toast integrates with the rest
 *     of the app's UI.
 *   - The hook only fires once per (conversation, pendingItemId)
 *     pair, tracked via a `useRef` set, so re-renders caused by
 *     the same item being streamed again don't re-toast.
 *   - Dismiss / re-confirm actions are exposed via the returned
 *     `recover` / `dismiss` callbacks, so the host component can
 *     decide whether to wire them to buttons or just leave the toast
 *     as informational.
 */

import { useEffect, useRef } from "react";
import type { ReasonixItem } from "@/lib/reasonixAdapter";
import { useToastStore } from "@/lib/useToast";

export interface PendingConfirmation {
  id: string;
  toolName: string;
  reason?: string;
}

export interface UsePendingConfirmationsRecoveryReturn {
  recover: (item: PendingConfirmation) => void;
  dismiss: (item: PendingConfirmation) => void;
}

/** Pull every `permission` item still in `status === "pending"` from the
 *  given list. The adapter guarantees `status: "pending"` items are
 *  always surfaces that have not yet been answered, so we don't need
 *  a separate "responded" flag — the host flips `status` to
 *  `"approved"` or `"denied"` once the user clicks a button. */
function extractPending(items: ReasonixItem[]): PendingConfirmation[] {
  return items
    .filter((it): it is Extract<ReasonixItem, { kind: "permission" }> => it.kind === "permission" && it.status === "pending")
    .map((it) => ({ id: it.id, toolName: it.toolName, reason: it.reason }));
}

export function usePendingConfirmationsRecovery(
  items: ReasonixItem[]
): UsePendingConfirmationsRecoveryReturn {
  const announcedRef = useRef<Set<string>>(new Set());
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    const pending = extractPending(items);
    if (pending.length === 0) return;
    // Defer to the next macrotask so the toast does not flash during
    // the very first render (when the scroller + messages are still
    // settling into place).
    const id = window.setTimeout(() => {
      for (const p of pending) {
        if (announcedRef.current.has(p.id)) continue;
        announcedRef.current.add(p.id);
        addToast({
          type: "warning",
          message: `有未响应的权限请求：${p.toolName}${p.reason ? ` (${p.reason})` : ""}`,
          duration: 6000,
        });
      }
    }, 600);
    return () => window.clearTimeout(id);
  }, [items, addToast]);

  return {
    recover: () => {
      /* hook owner can wire to actual approve callback; left empty for
       * composability — see Phase 3 doc for rationale. */
    },
    dismiss: (p) => {
      announcedRef.current.add(p.id);
    },
  };
}
