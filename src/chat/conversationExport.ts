/**
 * conversationExport — AionUi `conversationExport.ts` port.
 *
 * AionUi lets the user export a whole conversation to a Markdown
 * text file via `/export` (the slash command the host wires up
 * at the App level). The output is a flat transcript:
 *
 *     # <conversation name>
 *     <conversationId>: <id>
 *     <exportedAt>: <ISO timestamp>
 *     <type>: <conversation type>
 *
 *     user:
 *     <text>
 *
 *     assistant:
 *     <text>
 *
 *     ...
 *
 * The renderer is responsible for putting the file on disk; this
 * module is the pure-text side (the body the user sees / pastes /
 * downloads). The slash command's job is to:
 *   1. resolve the active conversation + message list,
 *   2. call `buildConversationExportText` to assemble the body,
 *   3. hand the string to the clipboard (IntentLoom path) or to
 *      a Tauri file-save dialog (AionUi path).
 *
 * Why Markdown: AionUi picks Markdown because every chat surface
 * downstream of IntentLoom (Slack, GitHub issues, Notion, the
 * LoomPanel export sidebar) renders it correctly. The text body
 * is also friendly to grep / awk — useful for the user who wants
 * to extract a single assistant turn later.
 *
 * AionUi reference:
 *   src/renderer/utils/chat/conversationExport.ts
 */

/** Characters that are never legal in a filename cross-platform. */
const INVALID_FILENAME_CHARS_RE = /[<>:"/\\|?*]/g;
const padTimestampPart = (value: number): string =>
  String(value).padStart(2, "0");

/**
 * Sanitize a free-form string so it can be used as a filename
 * component. Replaces illegal characters with `_`, trims, falls
 * back to `'conversation'` on empty, and clips to 80 chars.
 */
export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(INVALID_FILENAME_CHARS_RE, "_").trim();
  return (cleaned || "conversation").slice(0, 80);
}

const normalizeDefaultExportSegment = (name: string): string => {
  const normalized = sanitizeFileName(name)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "conversation";
};

const getShortConversationId = (conversationId?: string): string => {
  const normalized = (conversationId || "").trim();
  return normalized.slice(0, 8) || "conversation";
};

/** Join a directory and filename with the right separator. */
export function joinFilePath(dir: string, fileName: string): string {
  const separator = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith("/") || dir.endsWith("\\")
    ? `${dir}${fileName}`
    : `${dir}${separator}${fileName}`;
}

/** `YYYYMMDD-HHMMSS` in local time — the AionUi default file timestamp. */
export function formatTimestamp(time = Date.now()): string {
  const date = new Date(time);
  return `${date.getFullYear()}${padTimestampPart(date.getMonth() + 1)}${padTimestampPart(date.getDate())}-${padTimestampPart(date.getHours())}${padTimestampPart(date.getMinutes())}${padTimestampPart(date.getSeconds())}`;
}

const formatDefaultExportFileDate = (time = Date.now()): string => {
  const date = new Date(time);
  return `${date.getFullYear()}-${padTimestampPart(date.getMonth() + 1)}-${padTimestampPart(date.getDate())}`;
};

export type MessageRole = "user" | "assistant" | "system";

export interface ExportTranscriptLabels {
  conversation: string;
  conversationId: string;
  exportedAt: string;
  type: string;
  noMessages: string;
  user: string;
  assistant: string;
  system: string;
}

/**
 * A flat transcript view of a message. The export module only
 * needs the kind / position / content surface — anything else
 * (tool calls, plans, cron metadata, …) is intentionally
 * dropped from the Markdown body because Markdown is for
 * human reading, not for replaying a session.
 */
export interface ExportMessage {
  type: string;
  /** Optional in the public type so role-only tests don't have
   *  to fabricate a position. `getMessageRoleKey` falls back
   *  to `system` for any other / missing value. */
  position?: "left" | "right" | "center";
  /** Optional in the public type so role-only tests don't have
   *  to fabricate a content payload. `readMessageContent` handles
   *  `undefined` by JSON-stringifying an empty object. */
  content?: unknown;
}

/** Read the `content` field off a message with the same shape
 *  AionUi's `TMessage.content` uses. */
export function readMessageContent(message: ExportMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object" && "content" in content) {
    const inner = (content as { content: unknown }).content;
    if (typeof inner === "string") return inner;
  }
  try {
    return JSON.stringify(content ?? {}, null, 2);
  } catch {
    return String(content ?? "");
  }
}

export const getMessageRoleKey = (message: ExportMessage): MessageRole => {
  if (message.position === "right") return "user";
  if (message.position === "left") return "assistant";
  return "system";
};

const isShareableMessage = (message: ExportMessage): boolean => {
  // AionUi exports `text` and `tips` only — tool calls, plans,
  // permission requests, etc. are not human-readable in Markdown
  // and would just clutter the file.
  return message.type === "text" || message.type === "tips";
};

const isUserTextMessage = (message: ExportMessage): boolean => {
  return message.type === "text" && message.position === "right";
};

export interface ExportableConversation {
  id: string;
  name?: string;
  type?: string;
}

/**
 * Build the full Markdown export body for one conversation.
 * Mirrors AionUi's `buildConversationExportText` so the wire
 * format is identical (handy if the user pastes an export into
 * a different tool that already knows AionUi's format).
 */
export function buildConversationExportText(
  conversation: ExportableConversation,
  messages: ExportMessage[],
  labels: ExportTranscriptLabels,
): string {
  const lines: string[] = [];
  lines.push(`${labels.conversation}: ${conversation.name || labels.conversation}`);
  lines.push(`${labels.conversationId}: ${conversation.id}`);
  lines.push(`${labels.exportedAt}: ${new Date().toISOString()}`);
  lines.push(`${labels.type}: ${conversation.type || ""}`);
  lines.push("");

  const exportableMessages = messages.filter(isShareableMessage);
  exportableMessages.forEach((message) => {
    lines.push(`${labels[getMessageRoleKey(message)]}:`);
    lines.push(readMessageContent(message));
    lines.push("");
  });

  if (exportableMessages.length === 0) {
    lines.push(labels.noMessages);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Default `ExportTranscriptLabels` (Chinese). A future i18n pass
 * can swap this for a t() lookup; for now the slash command
 * passes this in directly.
 */
export const DEFAULT_EXPORT_LABELS_ZH: ExportTranscriptLabels = {
  conversation: "会话",
  conversationId: "会话ID",
  exportedAt: "导出时间",
  type: "类型",
  noMessages: "（无可导出的消息）",
  user: "user",
  assistant: "assistant",
  system: "system",
};

/**
 * Pick a default file name for the export — `<sanitized name>_<date>.md`
 * — using the active conversation's name (or a fallback) plus
 * the local date. Mirrors AionUi's `getDefaultExportFileName` so
 * the file the user sees in the save dialog has the same shape.
 */
export function getDefaultExportFileName(
  conversation: ExportableConversation,
  time = Date.now(),
): string {
  const nameSegment = normalizeDefaultExportSegment(
    conversation.name || getShortConversationId(conversation.id),
  );
  return `${nameSegment}_${formatDefaultExportFileDate(time)}.md`;
}

// Suppress unused-var warnings on the helper that the AionUi
// source keeps for symmetry but IntentLoom does not call.
void isUserTextMessage;
