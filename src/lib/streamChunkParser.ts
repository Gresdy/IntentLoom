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
  | { kind: "control"; event: string };

export function parseStreamChunk(raw: string | null | undefined): ParsedChunk | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let event: unknown;
  try {
    event = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!event || typeof event !== "object") return null;

  // ----- Claude / Anthropic streaming protocol -----
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

// crypto.randomUUID is available in modern browsers and Tauri WebView;
// keep a tiny fallback for older runtimes.
function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
