/**
 * SelectionReplyButton — AionUi `SelectionReplyButton` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/SelectionReplyButton.tsx
 *
 * A floating action button that appears when the user has an active
 * text selection inside the transcript. Clicking it lifts the
 * selected text into the composer as a blockquote, so the user can
 * ask a follow-up question without manually copy-pasting the snippet.
 *
 * IntentLoom port notes:
 *   - The reply target is the composer textarea, not AionUi's
 *     dedicated "side-question" panel. We dispatch a
 *     `intentloom:chat:selection-reply` CustomEvent; the composer
 *     listens and prepends the selected text as a blockquote to its
 *     own draft. This keeps the Reply button purely presentational.
 *   - The button only appears for selections of 3+ characters inside
 *     an element with `data-message-id` (i.e. an actual transcript
 *     row). Selections in the welcome screen, the topbar, or the
 *     composer itself are ignored to avoid the obvious "the user
 *     highlighted a label and accidentally replied with it" bug.
 */

import { useEffect, useRef, useState } from "react";
import { Quote } from "lucide-react";

export const SELECTION_REPLY_EVENT = "intentloom:chat:selection-reply" as const;

export interface SelectionReplyDetail {
  /** The selected text, exactly as the user saw it. */
  text: string;
  /** id of the transcript row the selection lives in. */
  messageId: string;
  /** Agent (CLI) the row was attributed to, if known. */
  agentId?: string;
}

declare global {
  interface WindowEventMap {
    [SELECTION_REPLY_EVENT]: CustomEvent<SelectionReplyDetail>;
  }
}

const MIN_SELECTION_LENGTH = 3;

function findRowElement(node: Node | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur) {
    if (cur instanceof HTMLElement && cur.dataset.messageId) return cur;
    cur = cur.parentNode;
  }
  return null;
}

export function SelectionReplyButton() {
  const [anchor, setAnchor] = useState<{ top: number; left: number; text: string; messageId: string; agentId?: string } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setAnchor(null);
        return;
      }
      const text = selection.toString().trim();
      if (text.length < MIN_SELECTION_LENGTH) {
        setAnchor(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rowEl = findRowElement(range.commonAncestorContainer);
      if (!rowEl) {
        setAnchor(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setAnchor(null);
        return;
      }
      setAnchor({
        top: rect.top + window.scrollY,
        left: rect.right + window.scrollX,
        text,
        messageId: rowEl.dataset.messageId ?? "",
        agentId: rowEl.dataset.agentId,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    // Mirror the AionUi behavior: also re-check on scroll/resize so
    // the floating button tracks the selection's anchored position
    // if the user scrolls the page while a selection is still alive.
    window.addEventListener("scroll", handleSelectionChange, true);
    window.addEventListener("resize", handleSelectionChange);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("scroll", handleSelectionChange, true);
      window.removeEventListener("resize", handleSelectionChange);
    };
  }, []);

  if (!anchor) return null;

  const handleClick = () => {
    const detail: SelectionReplyDetail = {
      text: anchor.text,
      messageId: anchor.messageId,
      agentId: anchor.agentId,
    };
    window.dispatchEvent(new CustomEvent(SELECTION_REPLY_EVENT, { detail }));
    // Clear the active selection so the button disappears.
    window.getSelection()?.removeAllRanges();
    setAnchor(null);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="selection-reply-button"
      data-testid="selection-reply-button"
      style={{ position: "fixed", top: anchor.top - 36, left: anchor.left - 96 }}
      onMouseDown={(e) => e.preventDefault() /* don't steal selection */}
      onClick={handleClick}
    >
      <Quote size={12} />
      <span>引用回复</span>
    </button>
  );
}

export default SelectionReplyButton;
