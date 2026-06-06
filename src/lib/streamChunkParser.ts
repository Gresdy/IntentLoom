// Parser for `ai-stream-chunk` payloads. Each chunk is a single line
// emitted by the backend's CLI process. We don't know in advance
// which CLI is running (Claude Code / Gemini CLI / Codex / OpenCode /
// OpenClaw), so the parser is deliberately tolerant: it tries JSON
// first, then falls back to "treat the whole line as plain text".
//
// Two protocol shapes are recognized:
//
//   1. Claude Code / Anthropic streaming protocol
//      (`type: content_block_delta | content_block_start | message_start | ...`).
//      See https://docs.anthropic.com/claude/reference/messages-streaming.
//
//   2. A minimal generic shape (`{type: "text", text}` / `"tool_call"`
//      / `"plan"` / `"tool_response"` / `"permission"`) that any CLI
//      can emit. This is what `multi-agent-cockpit.md` §六 calls the
//      "front-end event contract" and the way Gemini / Codex / the
//      other adapters are expected to normalize their output.
//
// Anything we don't recognize returns `null`; the caller treats the
// raw line as a text chunk (the historical behavior). This makes the
// parser safe to drop in even before the adapters are migrated to
// the new event shapes — the worst case is exactly what we had before
// (raw text appended to the assistant message).

import { inferToolKind, parseDiff } from "@/utils/toolCallParser";
import type { PlanState, ToolCall } from "@/types/message";

export type ParsedChunk =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool_call"; tool: ToolCall }
  | { kind: "tool_response"; id: string; result: unknown }
  | { kind: "plan"; plan: PlanState }
  | { kind: "permission"; id: string; tool: string; args: unknown }
  | { kind: "notice"; level: "info" | "warn" | "error"; text: string }
  | { kind: "control"; event: string };

export function parseStreamChunk(raw: string | null | undefined): ParsedChunk | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Hermes Agent (`src-tauri/src/agents/hermes.rs`) emits a
  // leading `session_id: <id>` line on stdout as its session
  // bootstrap, followed by the actual response. The backend
  // adapter deliberately forwards it to the front-end (it is
  // useful metadata for other consumers — see the comment in
  // hermes.rs), so we filter it here: recognise the shape, emit
  // a no-op control event so the controller's switch falls
  // through (the existing `case "control": break` is exactly
  // this), and do not let the historical "raw line is text"
  // fallback append `session_id: 7c3a-...` to the transcript.
  // We accept `session_id:`, `session-id:`, and a flexible amount
  // of whitespace between the key, the colon, and the value.
  const sessionMatch = /^session[-_]id\s*:\s*\S+/i.exec(trimmed);
  if (sessionMatch) {
    return { kind: "control", event: "session_started" };
  }

  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    // The chunk did not parse as JSON. Fall through to the
    // Hermes error detector below — it only runs on the
    // raw line, not on a partially-parsed object, so a
    // future adapter that ships a proper `type: "error"`
    // JSON event is unaffected.
    event = null;
  }
  if (!event || typeof event !== "object") {
    // Plain-text path. Hermes auth / network failure block.
    // The CLI writes a plain-text line starting with 🔐
    // (followed by a short explanation and a 401/403/5xx)
    // when the upstream provider rejects the request. We
    // surface that as a styled `notice` chunk so the
    // Transcript renders it as a red banner, not as part
    // of the assistant reply. The detector is intentionally
    // narrow — see the long comment on `detectHermesNotice`
    // for the exact rules.
    const hermesNotice = detectHermesNotice(trimmed);
    if (hermesNotice) {
      return hermesNotice;
    }
    return null;
  }
  if ((event as any).type === "content_block_delta") {
    return parseContentBlockDelta(event as any);
  }
  if ((event as any).type === "content_block_start") {
    return parseContentBlockStart(event as any);
  }
  if ((event as any).type === "content_block_stop") {
    return { kind: "control", event: "block_stop" };
  }
  if ((event as any).type === "message_start") {
    return { kind: "control", event: "message_start" };
  }
  if ((event as any).type === "message_delta") {
    return { kind: "control", event: "message_delta" };
  }
  if ((event as any).type === "message_stop") {
    return { kind: "control", event: "message_stop" };
  }

  // ----- Generic event shapes (Gemini + future adapters) -----
  const t = (event as any).type;
  if (t === "text" && typeof (event as any).text === "string") {
    return { kind: "text", text: (event as any).text };
  }
  if (t === "thinking") {
    const text = (event as any).text ?? (event as any).thinking;
    if (typeof text === "string") return { kind: "thinking", text };
  }
  if (t === "tool_call" || t === "tool_use") {
    return parseGenericToolCall(event as any);
  }
  if (t === "tool_response" || t === "tool_result") {
    return {
      kind: "tool_response",
      id: String((event as any).id ?? ""),
      result: (event as any).result ?? (event as any).content ?? null,
    };
  }
  if (t === "plan") {
    return { kind: "plan", plan: normalizePlan(event as any) };
  }
  if (t === "permission" || t === "approval_request") {
    return {
      kind: "permission",
      id: String((event as any).id ?? ""),
      tool: String((event as any).tool ?? (event as any).tool_name ?? ""),
    args: (event as any).args ?? (event as any).arguments ?? {},
    };
  }
  return null;
}

function parseContentBlockDelta(event: any): ParsedChunk | null {
  const delta = event.delta ?? {};
  if (delta.type === "text_delta" && typeof delta.text === "string") {
    return { kind: "text", text: delta.text };
  }
  if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
    return { kind: "thinking", text: delta.thinking };
  }
  if (delta.type === "input_json_delta") {
    // Streaming partial JSON for a tool_use input. The full input is
    // available in the corresponding `content_block_stop` for many
    // adapters; for now we just emit a no-op control so the parser
    // doesn't drop the event entirely. A future Phase can buffer
    // these per `index` and parse on block_stop.
    return { kind: "control", event: "input_json_delta" };
  }
  return null;
}

function parseContentBlockStart(event: any): ParsedChunk | null {
  const block = event.content_block ?? {};
  if (block.type === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "unknown";
    const tool: ToolCall = {
      id: String(event.id ?? block.id ?? cryptoRandomId()),
      name,
      kind: inferToolKind(name),
      arguments: block.input ?? {},
      status: "in_progress",
    };
    return { kind: "tool_call", tool };
  }
  if (block.type === "thinking") {
    return { kind: "thinking", text: "" };
  }
  return null;
}

function parseGenericToolCall(event: any): ParsedChunk {
  const name = typeof event.name === "string" ? event.name : "unknown";
  const tool: ToolCall = {
    id: String(event.id ?? cryptoRandomId()),
    name,
    kind: inferToolKind(name),
    arguments: event.arguments ?? event.input ?? event.parameters ?? {},
    status: "in_progress",
    diff: parseDiff(event.diff),
  };
  return { kind: "tool_call", tool };
}

function normalizePlan(event: any): PlanState {
  const rawEntries = Array.isArray(event.entries) ? event.entries : [];
  return {
    entries: rawEntries.map((e: any, i: number) => ({
      id: String(e.id ?? `step-${i}`),
      title: typeof e.title === "string" ? e.title : String(e),
      description: e.description,
      status: (e.status ?? "pending") as PlanState["entries"][number]["status"],
      dependencies: e.dependencies,
    })),
    currentIndex: typeof event.currentIndex === "number" ? event.currentIndex : -1,
    isRunning: Boolean(event.isRunning),
  };
}

/**
 * Hermes-friendly error detector.
 *
 * Returns a `notice` chunk when the trimmed line looks like a
 * Hermes auth / network failure block; returns `null` otherwise
 * so the caller falls through to its normal text / JSON path.
 *
 * The detection is intentionally conservative. We only flag a
 * line when it carries both a clear failure signal and a
 * concrete indicator of where it came from:
 *
 *   - the line starts with the 🔐 emoji that Hermes prepends
 *     to its auth-failure banner;
 *   - OR the line contains a recognised HTTP status code
 *     (401 / 403 / 404 / 429 / 5xx) AND one of the failure
 *     phrases Hermes uses ("authentication failed",
 *     "permission denied", "rate limit", "internal server
 *     error", "bad gateway", "service unavailable"). The pair
 *     requirement stops a stray "HTTP 401" mention in a normal
 *     code answer from being mis-classified.
 *
 * The function is exported so the vitest suite can hit it
 * directly without going through the full `parseStreamChunk`
 * pipeline (which makes the assertions about input boundaries
 * cleaner).
 */
export function detectHermesNotice(
  trimmed: string,
): { kind: "notice"; level: "info" | "warn" | "error"; text: string } | null {
  if (!trimmed) return null;
  if (trimmed.startsWith("🔐")) {
    return { kind: "notice", level: "error", text: trimmed };
  }
  // Status-code + phrase pair. We intentionally match the phrase
  // before the code in the alternation, so a line like
  // "authentication failed (401)" is recognised even though
  // the digit appears after the words.
  const statusCode = /(?:401|403|404|429|5\d{2})/;
  const failurePhrase =
    /authentication\s+failed|permission\s+denied|rate\s+limit|internal\s+server\s+error|bad\s+gateway|service\s+unavailable|unauthor(?:ized|ised)|forbidden|not\s+found/i;
  if (statusCode.test(trimmed) && failurePhrase.test(trimmed)) {
    return { kind: "notice", level: "error", text: trimmed };
  }
  return null;
}

// crypto.randomUUID is available in modern browsers and Tauri WebView;
// keep a tiny fallback for older runtimes.
function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
