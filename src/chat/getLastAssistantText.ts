/**
 * getLastAssistantText — AionUi `getLastAssistantText.ts` port.
 *
 * Walks a message list backwards and returns the text of the
 * most recent non-empty, non-streaming, non-hidden assistant
 * message — with the think / skill-suggest tags stripped, so
 * the value is safe to copy to clipboard, append to a summary,
 * or send as a context to the model.
 *
 * The `/share` slash command in ReasonixApp used to inline a
 * one-liner that just dumped the last six `text`-bearing items
 * with a `•` prefix. That worked for a few messages but copied
 * the literal assistant text including any leaked `<thinking>`
 * blocks or `[SKILL_SUGGEST]` markers — the same bugs the
 * `getLastAssistantText` upstream helper is designed to prevent.
 *
 * AionUi reference:
 *   src/renderer/utils/chat/getLastAssistantText.ts
 */
import { stripThinkTags } from "@/utils/thinkTagFilter";
import { stripSkillSuggest } from "@/utils/skillSuggestParser";

/**
 * A reduced view of `TMessage` matching AionUi's upstream
 * signature. The adapter's `state.items` is a richer array
 * (ReasonixItem), but only `text` items with `position: "left"`
 * (assistant) qualify. We coerce on the consumer side to keep
 * this helper free of any IntentLoom-specific types.
 */
export interface GetLastAssistantTextMessage {
  type: string;
  position: "left" | "right" | "center";
  hidden?: boolean;
  content: string | { content?: string };
}

const isCopyableAssistantText = (
  message: GetLastAssistantTextMessage,
): boolean => {
  return message.type === "text" && message.position === "left" && !message.hidden;
};

/**
 * Pull the inner content string out of either a flat string
 * content (AionUi compatible) or an object with a `content`
 * field (IntentLoom's Message type stores it that way).
 */
const readContent = (raw: GetLastAssistantTextMessage["content"]): string => {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && typeof raw.content === "string") {
    return raw.content;
  }
  return "";
};

/**
 * Strip inline metadata blocks (`<think>…</think>`, `[SKILL_SUGGEST]…[/SKILL_SUGGEST]`)
 * and collapse 3+ newlines down to 2, so the value is ready to
 * paste anywhere without leaking the internal markup.
 */
const sanitizeAssistantText = (content: string): string => {
  return stripSkillSuggest(stripThinkTags(content))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Return the most recent assistant text message's sanitized
 * content, or `null` when:
 *   - the caller is currently streaming (a new turn in flight;
 *     the helper returns null so the caller can wait until the
 *     next turn completes)
 *   - the conversation has no assistant text message yet
 *   - the only assistant text messages are empty (just
 *     placeholder content) or still streaming
 */
export function getLastAssistantText(
  messages: GetLastAssistantTextMessage[],
  loading: boolean,
): string | null {
  if (loading) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isCopyableAssistantText(message)) continue;
    const content = readContent(message.content);
    const sanitized = sanitizeAssistantText(content);
    if (sanitized) return sanitized;
  }
  return null;
}
