/**
 * chatMessageJumpEvents — AionUi `chatMinimapEvents` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/utils/chat/chatMinimapEvents.ts
 *
 * Cross-component bus used by:
 *   - The chat minimap / search panel (publisher) — emits when the
 *     user clicks a result row
 *   - The transcript scroller (subscriber) — listens, scrolls the
 *     target message into view, and pulses a 2.4s highlight ring
 *
 * Keeping the event name as a single exported constant avoids the
 * silent typos that show up when each side hand-rolls its own
 * "jump-message" / "message-jump" / "scrollToMessage" string.
 *
 * Detail shape mirrors AionUi's `ChatMessageJumpDetail`: a
 * `conversation_id` discriminator (so minimap results from another
 * conversation don't trigger a scroll in the active one), an
 * optional `messageId`, an optional backend-supplied `msgId`, and
 * a `behavior` / `align` pair for the scroll.
 */

export const CHAT_MESSAGE_JUMP_EVENT = "intentloom:chat:message-jump" as const;

export interface ChatMessageJumpDetail {
  /** Conversation the message lives in. Listeners MUST filter on this. */
  conversation_id: string;
  /** Local ReasonixItem id. */
  messageId?: string;
  /** Backend-side msg_id. Listeners fall back to matching this if `messageId` is absent. */
  msgId?: string;
  /** Scroll behavior. Defaults to "smooth". */
  behavior?: ScrollBehavior;
  /** Scroll alignment. Defaults to "start" so the target is visible. */
  align?: ScrollLogicalPosition;
}

declare global {
  interface WindowEventMap {
    [CHAT_MESSAGE_JUMP_EVENT]: CustomEvent<ChatMessageJumpDetail>;
  }
}

/** Type-safe helper: `window.dispatchEvent(new CustomEvent(CHAT_MESSAGE_JUMP_EVENT, { detail }))`. */
export function dispatchChatMessageJump(detail: ChatMessageJumpDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_MESSAGE_JUMP_EVENT, { detail }));
}
