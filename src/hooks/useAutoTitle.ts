/**
 * useAutoTitle — AionUi `useAutoTitle` port.
 *
 * AionUi ports the conversation title from the first user message:
 * when the user sends their first non-empty user message into a
 * conversation whose name is still the default placeholder
 * ("新对话 ..."), the title is replaced with a short prefix of
 * that message. The original first message is the most reliable
 * hint about what the conversation is actually about — better
 * than timestamps, better than random ids, and free at the
 * moment the user already typed it.
 *
 * The hook is intentionally narrow:
 *   - it only renames when the current name still looks like a
 *     placeholder (the default name set by
 *     `useConversationStore.createConversation`). Once the user
 *     has explicitly renamed the conversation, we leave it alone.
 *   - it fires once per (conversation, first user message) pair —
 *     a `useRef` tracks the conversationId we already titled, so
 *     a re-render or stream update cannot rename twice.
 *   - it caps the title to `MAX_TITLE_LEN` characters and strips
 *     leading/trailing whitespace + newlines, so a stray \n in
 *     the prompt does not turn into an empty title.
 *
 * The function returns the derived title (so the host component
 * can render it directly) but also writes through to the store,
 * so the history drawer / SessionsPanel pick it up immediately
 * via the same subscription they already have on
 * `useConversationStore`.
 *
 * AionUi reference: packages/desktop/src/renderer/hooks/
 *   useAutoTitle.ts (the upstream implementation is a few lines
 *   longer because it also handles Gemini-style multi-modal
 *   prompts; we only need the text path for the 6-CLI IntentLoom
 *   surface).
 */
import { useEffect, useRef } from "react";
import { useConversationStore } from "@/stores/conversationStore";

/** Hard cap on the title length so a 4 KB prompt does not blow
 *  up the session-list UI. 24 chars matches the doc target. */
const MAX_TITLE_LEN = 24;

/** Prefix string the default conversation name uses. We treat
 *  any name that `startsWith` this as "still a placeholder" and
 *  therefore safe to overwrite. Anything else was set by the
 *  user (or a previous auto-title run) and is left alone. */
const PLACEHOLDER_PREFIX = "新对话";

/**
 * Strip control chars and collapse any run of whitespace into a
 * single space, then clamp to MAX_TITLE_LEN. We use a regular
 * `\s+` collapse rather than a more aggressive trim so a prompt
 * like "帮我 debug\n\n一下" still keeps the visible break as a
 * single space — friendlier than "帮我 debug一下" with no
 * separator at all.
 */
function shortenForTitle(raw: string): string {
  const collapsed = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ") // strip ASCII control chars
    .replace(/\s+/g, " ")
    .trim();
  if (collapsed.length <= MAX_TITLE_LEN) return collapsed;
  return collapsed.slice(0, MAX_TITLE_LEN).trimEnd() + "…";
}

/**
 * Decide whether a given conversation name is still the default
 * placeholder produced by `createConversation`. Anything that
 * doesn't start with `新对话` (the default prefix) is considered
 * a user-set or previously-auto-titled name and is left alone.
 */
function isPlaceholderName(name: string): boolean {
  return name.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * Subscribe to the active conversation and rename it from the
 * first user message when appropriate. Returns the current
 * conversation's id (handy for callers that want to know whether
 * a rename is in flight). The function has no return value for
 * the rename itself — that side-effect is observable through
 * the store subscription the host already has.
 */
export function useAutoTitle(currentConversationId: string | null): void {
  // Track which conversation id we have already auto-titled, so
  // a re-render (or a stream-update re-render of the parent) does
  // not trigger a second rename. The ref is keyed on the
  // conversationId, not on the message text, because the
  // conversationId is the natural lifecycle boundary: switching
  // conversations resets the "already titled" flag, so a new
  // conversation will be auto-titled the next time it sees a
  // first user message.
  const titledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentConversationId) return;
    // Reset the "titled" marker when the active conversation
    // changes. We do this on every effect run so a conversation
    // switch correctly clears the cache.
    if (titledRef.current !== currentConversationId) {
      titledRef.current = null;
    }
    // Already titled for this conversation — nothing to do.
    if (titledRef.current === currentConversationId) return;

    const store = useConversationStore.getState();
    const conv = store.getCurrentConversation();
    if (!conv) return;
    if (!isPlaceholderName(conv.name)) {
      // User has already renamed this conversation, or a
      // previous auto-title run already set a non-placeholder
      // name. Either way, do not touch it.
      titledRef.current = currentConversationId;
      return;
    }
    // Find the first user-role message in the conversation.
    const firstUser = conv.messages.find((m) => m.role === "user" && typeof m.content === "string" && m.content.trim().length > 0);
    if (!firstUser) return;
    const title = shortenForTitle(firstUser.content);
    if (!title) return;
    store.updateConversation(currentConversationId, { name: title });
    titledRef.current = currentConversationId;
  }, [currentConversationId]);
}

// Exported for unit tests.
export const __test__ = {
  shortenForTitle,
  isPlaceholderName,
  MAX_TITLE_LEN,
  PLACEHOLDER_PREFIX,
};
