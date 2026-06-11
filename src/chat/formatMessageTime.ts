/**
 * formatMessageTime — AionUi `formatMessageTime` port.
 *
 * Renders a message timestamp the way AionUi does in
 * `packages/desktop/src/renderer/pages/conversation/Messages/components/MessageText.tsx`:
 *   - Same day:  "HH:mm"
 *   - Different day: "MM-DD HH:mm"
 *
 * The IntentLoom codebase never had per-message timestamps before — every
 * item kind rendered by `ReasonixTranscript` had its own ad-hoc date, if
 * any. Pulling this into a single helper keeps the visual rule in one
 * place and gives `ReasonixTranscript` a single import to lean on.
 *
 * The function is intentionally pure (no Intl, no Date formatting locale
 * tricks) so the rendered string is stable across SSR / Tauri webview /
 * timezone shifts — `getHours()` / `getMonth()` etc. all read the
 * current system time the same way the chat rendered it.
 */

const pad2 = (n: number): string => n.toString().padStart(2, "0");

/**
 * Format a unix-ms timestamp for display next to a chat message.
 *
 * @param timestamp Unix milliseconds (e.g. `Date.now()`).
 * @returns "HH:mm" if the message is from today, "MM-DD HH:mm" otherwise.
 */
export function formatMessageTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const time = `${hours}:${minutes}`;

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) return time;

  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${month}-${day} ${time}`;
}
