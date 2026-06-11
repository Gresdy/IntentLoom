/**
 * messageHistory — AionUi `messageHistory.ts` port.
 *
 * Three small helpers that together power the composer's prompt
 * history navigation (↑ at the first line loads the previous
 * user message; ↓ at the last line moves forward through the
 * stack).
 *
 *   - `getConversationInputHistory(messages, conversationId)` —
 *     walks the message list backwards and returns the user's
 *     own past prompts, most-recent first, deduped. The composer
 *     pulls this list whenever the caret hits the first line of
 *     the textarea + the user presses ↑.
 *   - `isCaretOnFirstLine(textarea)` — true when the caret
 *     (or selection start) is on the first line, so ↑ should
 *     walk history instead of moving the caret up.
 *   - `isCaretOnLastLine(textarea)` — symmetric helper for ↓
 *     at the bottom of the textarea.
 *
 * The upstream AionUi source threads `conversationId` through
 * the call so a multi-conversation app only ever shows prompts
 * from the conversation the user is currently typing into —
 * exactly the right scoping. IntentLoom matches: we look up the
 * current conversation by id and filter to its `user`-role
 * text messages, returning an empty list when the id is unknown.
 *
 * AionUi reference:
 *   src/renderer/utils/chat/messageHistory.ts
 */

/**
 * A reduced view of a chat message that the input-history walker
 * actually consults. IntentLoom's `Message` type stores
 * `content` as a string for text messages, so the helper
 * accepts both flat strings and `{ content: string }` shapes
 * (the latter matches the upstream AionUi / TMessage wire
 * format).
 */
export interface HistoryMessage {
  id: string;
  conversation_id?: string;
  type: string;
  /** Optional in the public type so callers can pass
   *  IntentLoom's `Message` shape directly (which has
   *  `position?` on the union). The walker treats missing
   *  positions as not-matching any role. */
  position?: "left" | "right" | "center";
  content: string | { content?: string };
}

const readContent = (raw: HistoryMessage["content"]): string => {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw.content === "string") {
    return raw.content;
  }
  return "";
};

/**
 * Return the user's past prompts in *most-recent first* order.
 * Filters to `text`-typed, `right`-positioned messages of the
 * current conversation, dedupes by exact content (so the user
 * pressing ↑ doesn't loop forever on the same repeated prompt),
 * and skips empty / whitespace-only messages.
 *
 * Returns an empty list when `conversationId` is undefined —
 * the composer treats that as "no history nav".
 */
export function getConversationInputHistory(
  messages: HistoryMessage[],
  conversationId?: string,
): string[] {
  if (!conversationId) return [];

  const history: string[] = [];
  const seen = new Set<string>();

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (
      message.conversation_id !== conversationId ||
      message.type !== "text" ||
      message.position !== "right"
    ) {
      continue;
    }
    const content = readContent(message.content);
    if (!content.trim()) continue;
    if (seen.has(content)) continue;
    seen.add(content);
    history.push(content);
  }
  return history;
}

/**
 * True when the user's caret (or selection start) is on the
 * first line of the textarea. Used by the composer to decide
 * whether ↑ should walk history or move the caret up.
 *
 * Computed in O(n) on the prefix length — fine for a
 * chat-length textarea (a few KB at most). We don't try to
 * read `selectionStart` first because the textarea ref might
 * be null mid-IME-composition.
 */
export function isCaretOnFirstLine(textarea: HTMLTextAreaElement | null | undefined): boolean {
  if (!textarea) return false;
  const selectionStart = textarea.selectionStart ?? 0;
  return !textarea.value.slice(0, selectionStart).includes("\n");
}

/**
 * True when the user's caret (or selection end) is on the
 * last line. Symmetric to `isCaretOnFirstLine` for the ↓ key.
 */
export function isCaretOnLastLine(textarea: HTMLTextAreaElement | null | undefined): boolean {
  if (!textarea) return false;
  const selectionEnd = textarea.selectionEnd ?? textarea.value.length;
  return !textarea.value.slice(selectionEnd).includes("\n");
}
