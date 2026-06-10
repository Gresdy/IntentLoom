// Parser for `ai-stream-chunk` payloads. Each chunk is a single line
// emitted by the backend's CLI process. We don't know in advance
// which CLI is running (Claude Code / Gemini CLI / Codex / OpenCode /
// OpenClaw / Hermes), so the parser is deliberately tolerant: it tries
// JSON first, then falls back to "treat the whole line as plain text".
//
// Three protocol shapes are recognized:
//
//   1. Claude Code wire format (the current `claude -p` output).
//      Each line is a top-level JSON object with a `type` field:
//        - `system / init`     — session metadata (tools, model, etc.);
//                               we ignore it on the front-end because
//                               the controller already knows the model.
//        - `assistant`         — a complete assistant message; the
//                               `message.content` array can carry a
//                               MIX of `thinking`, `text`, AND `tool_use`
//                               blocks in a single line. We fan out to
//                               one chunk per block (thinking first,
//                               then text, then tool calls) so the
//                               existing per-chunk pipeline in
//                               `reasonixAdapter` still works without
//                               stateful buffering.
//        - `user`              — a tool result; `message.content[0].type`
//                               is `tool_result` and the id is in
//                               `tool_use_id`.
//        - `result`            — end-of-turn summary (no payload to
//                               render; we emit a control event so the
//                               controller can stop the cursor).
//
//      Verified against `claude --output-format stream-json --verbose`
//      on Claude Code v2.1.143 (2026-06-08).
//
//   2. Anthropic messages-streaming protocol (the older shape that
//      some adapters still emit): `content_block_delta | start | stop`,
//      `message_start | delta | stop`. Kept for backward compatibility —
//      the tests in `streamChunkParser.test.ts` cover the
//      `text_delta` / `thinking_delta` / `tool_use` start cases.
//
//   3. Generic minimal shapes (`{type: "text", text}` / `"tool_call"`
//      / `"plan"` / `"tool_response"` / `"permission"`) that any CLI
//      can emit. This is the "front-end event contract" for adapters
//      that pre-normalize their output to a single chunk per line.
//
// Anything we don't recognize yields an empty array; the caller
// treats the raw line as text (the historical behavior). This makes
// the parser safe to drop in even before the adapters migrate to
// the new event shapes.

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

/**
 * Parse one line of stream output into a list of chunks.
 *
 * Returns `[]` (NOT `null`) when nothing usable came out of the
 * line — the caller treats `[]` exactly the same as a
 * "raw line is text" fallback in the historical behavior. The
 * list shape is the key API: a single Claude Code assistant
 * event with `content: [thinking, text, tool_use]` produces
 * THREE chunks in the order the controller should render them,
 * so the per-chunk pipeline in `reasonixAdapter` still works
 * without stateful re-parsing.
 */
export function parseStreamChunk(raw: string | null | undefined): ParsedChunk[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Hermes Agent (`src-tauri/src/agents/hermes.rs`) emits a
  // leading `session_id: <id>` line on stdout as its session
  // bootstrap, followed by the actual response. The backend
  // adapter deliberately forwards it to the front-end (it is
  // useful metadata for other consumers — see the comment in
  // hermes.rs), so we filter it here and emit a no-op control
  // event so the controller's switch falls through. We accept
  // `session_id:`, `session-id:`, and a flexible amount of
  // whitespace between the key, the colon, and the value.
  const sessionMatch = /^session[-_]id\s*:\s*\S+/i.exec(trimmed);
  if (sessionMatch) {
    return [{ kind: "control", event: "session_started" }];
  }

  let event: any;
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
      return [hermesNotice];
    }
    // Hermes plain-text tool call detector. When Hermes uses
    // a tool, it emits lines like:
    //   🔧 Using tool: Read(file_path="...")
    //   🔧 Using tool: Bash(command="...")
    //   📝 Tool result: <content>
    // We surface these as structured tool_call / tool_response
    // chunks so the ToolCard renders them properly instead of
    // dumping raw emoji-prefixed text into the message stream.
    const toolMatch = detectHermesToolCall(trimmed);
    if (toolMatch) {
      return [toolMatch];
    }
    return [];
  }

  // ---- 1. Claude Code wire format (current `claude -p` output) ----
  // Route FIRST so we do not collide with the generic
  // `{type: "tool_call", ...}` shape from §3 below — Claude
  // Code's `tool_use` block lives under `message.content[i]`
  // and we want the content-array walk, not the generic
  // top-level matcher.
  if (event.type === "assistant" && event.message && Array.isArray(event.message.content)) {
    const chunks = parseAssistantContent(event.message.content);
    if (chunks.length > 0) return chunks;
    // Fall through: an assistant event with no recognised
    // content blocks should still be ignored (not surfaced as
    // text), so we do NOT return `[{ kind: "text", text: trimmed }]`
    // here. That keeps the historical "raw line is text"
    // fallback for actual plain-text payloads.
  }
  if (event.type === "user" && event.message && Array.isArray(event.message.content)) {
    const chunks = parseUserContent(event.message.content);
    if (chunks.length > 0) return chunks;
  }
  if (event.type === "system") {
    // Session metadata — model, tools, mcp_servers, etc. We
    // surface a no-op control so the controller can record
    // it (useful for the LoomPanel "last session at" line)
    // but the transcript does not get a phantom bubble.
    return [{ kind: "control", event: "system_init" }];
  }
  if (event.type === "result") {
    // End-of-turn. The actual summary lives in `result` (cost,
    // duration, num_turns) but we only forward a control event
    // here — the dedicated `ai-stream-end` listener takes care
    // of the rest. If the result is an error, we promote the
    // control event to a `notice` so the user sees a red banner.
    if (event.is_error) {
      const errText = String(
        event.errors?.[0] ?? event.subtype ?? "end of turn",
      );
      return [{ kind: "notice", level: "error", text: errText }];
    }
    return [{ kind: "control", event: "result" }];
  }

  // ---- 2. Anthropic messages-streaming protocol (legacy) ----
  if (event.type === "content_block_delta") {
    const c = parseContentBlockDelta(event);
    return c ? [c] : [];
  }
  if (event.type === "content_block_start") {
    const c = parseContentBlockStart(event);
    return c ? [c] : [];
  }
  if (event.type === "content_block_stop") {
    return [{ kind: "control", event: "block_stop" }];
  }
  if (event.type === "message_start") {
    return [{ kind: "control", event: "message_start" }];
  }
  if (event.type === "message_delta") {
    return [{ kind: "control", event: "message_delta" }];
  }
  if (event.type === "message_stop") {
    return [{ kind: "control", event: "message_stop" }];
  }

  // ---- 3. Generic minimal shapes (any CLI) ----
  // ---- 4. Codex CLI wire format (codex exec --json) ----
  // Captured against codex-cli 0.137.0-alpha.4 on 2026-06-08.
  // Each line is a top-level JSON object. We dispatch on
  // `event.type`; `item.completed` events wrap the finished
  // item under `event.item` and discriminate on `item.type`.
  if (event.type === "thread.started" || event.type === "turn.started") {
    return [{ kind: "control", event: event.type }];
  }
  if (event.type === "turn.completed") {
    // The `usage` block carries token counts — surfaced as a
    // control event so the controller can attach the totals
    // to the assistant message without re-parsing. The Loom
    // panel already reads the same hook for its usage line.
    return [{ kind: "control", event: "turn_completed" }];
  }
  if (event.type === "item.started" && event.item && typeof event.item === "object") {
    // Live "in progress" hook. Without this, the user only
    // sees a Codex tool call when the corresponding
    // `item.completed` lands — by which point the model has
    // already finished executing. The thinking card, the
    // running ToolCard spinner, and the Loom panel's
    // activity feed all rely on getting the start event so
    // the timer can begin; the `status: "in_progress"` is
    // what the controller threads through to the UI.
    const item = event.item;
    if (item.type === "reasoning" && typeof item.text === "string") {
      return [{ kind: "thinking", text: item.text }];
    }
    if (item.type === "agent_message" && typeof item.text === "string") {
      return [{ kind: "text", text: item.text }];
    }
    // `command_execution` and other tool subtypes are
    // forwarded as a `tool_call` with `status: "in_progress"`.
    // The controller's `addToolCall` creates a live card; the
    // matching `item.completed` (see below) routes a
    // `tool_response` chunk through the controller's existing
    // path, which calls `updateToolCall(id, { status:
    // "completed" })` to mark the same card done.
    const name = typeof item.type === "string" ? item.type : "unknown";
    return [{
      kind: "tool_call",
      tool: {
        id: String(item.id ?? cryptoRandomId()),
        name,
        kind: inferToolKind(name),
        arguments: item,
        status: "in_progress",
      },
    }];
  }
  if (event.type === "item.completed" && event.item && typeof event.item === "object") {
    const item = event.item;
    if (item.type === "reasoning" && typeof item.text === "string") {
      return [{ kind: "thinking", text: item.text }];
    }
    if (item.type === "agent_message" && typeof item.text === "string") {
      return [{ kind: "text", text: item.text }];
    }
    if (item.type === "command_execution") {
      // `command_execution` carries a richer payload than the
      // generic tool-call fallback: the actual shell command,
      // its aggregated stdout+stderr, the exit code, and the
      // final status. We surface a `tool_response` chunk so
      // the controller's existing `tool_response` handler
      // picks it up and marks the matching live ToolCard
      // `status: "completed"`. The `id` is the same as the
      // `item.started` we emitted moments earlier, so the
      // controller's `updateToolCall` finds the right card.
      return [{
        kind: "tool_response",
        id: String(item.id ?? ""),
        result: {
          command: item.command,
          aggregated_output: item.aggregated_output,
          exit_code: item.exit_code,
          status: item.status,
        },
      }];
    }
    // Anything else (`function_call`, `web_search`, `file_edit`,
    // …) is forwarded as a tool call with the full item payload
    // so the controller renders it the same way it renders
    // Claude's `tool_use` block. The kind / title mapping in
    // `inferToolKind` already covers the common tool names.
    const name = typeof item.type === "string" ? item.type : "unknown";
    return [{
      kind: "tool_call",
      tool: {
        id: String(item.id ?? cryptoRandomId()),
        name,
        kind: inferToolKind(name),
        arguments: item,
        status: "completed",
      },
    }];
  }

  // Short alias for the event type — used by all subsequent sections.
  const t: string | undefined = event.type;

  // ---- 5. Gemini CLI wire format (gemini --output-format stream-json) ----
  // Gemini CLI emits a sequence of JSON objects. The streaming
  // protocol uses `type` discriminators that differ from both
  // Claude Code and the Anthropic streaming protocol:
  //   - `gemini_start`     → session start (control)
  //   - `gemini_thinking`  → thinking/reasoning text
  //   - `gemini_text`      → main response text
  //   - `gemini_tool_call` → tool invocation (with name + args)
  //   - `gemini_tool_result` → tool execution result
  //   - `gemini_end`       → end of turn (control)
  //
  // Fallback: if the event has a Gemini-specific `type` but is
  // not one we explicitly handle, we still try to extract text
  // content from `event.text` or `event.content` so the user
  // sees SOMETHING instead of a blank transcript.
  if (typeof t === "string" && t.startsWith("gemini_")) {
    if (t === "gemini_start") {
      return [{ kind: "control", event: "gemini_start" }];
    }
    if (t === "gemini_end") {
      return [{ kind: "control", event: "gemini_end" }];
    }
    if (t === "gemini_thinking") {
      const text = event.text ?? event.thinking ?? event.content ?? "";
      if (typeof text === "string") return [{ kind: "thinking", text }];
    }
    if (t === "gemini_text") {
      const text = event.text ?? event.content ?? "";
      if (typeof text === "string") return [{ kind: "text", text }];
    }
    if (t === "gemini_tool_call") {
      const name = typeof event.name === "string" ? event.name : "unknown";
      return [{
        kind: "tool_call",
        tool: {
          id: String(event.id ?? cryptoRandomId()),
          name,
          kind: inferToolKind(name),
          arguments: event.args ?? event.arguments ?? event.input ?? {},
          status: "in_progress",
        },
      }];
    }
    if (t === "gemini_tool_result") {
      return [{
        kind: "tool_response",
        id: String(event.id ?? event.tool_use_id ?? ""),
        result: event.result ?? event.content ?? null,
      }];
    }
    // Unrecognised gemini_* event — try to extract text.
    if (typeof event.text === "string" && event.text) {
      return [{ kind: "text", text: event.text }];
    }
    return [{ kind: "control", event: t }];
  }

  // ---- 6. OpenClaw wire format (openclaw agent --local --json) ----
  // OpenClaw with `--json` emits a single JSON result object
  // (not streaming). The shape varies but common patterns are:
  //   - `{ type: "response", content: "..." }` — simple text
  //   - `{ type: "response", content: [...], tool_calls: [...] }`
  //   - `{ type: "error", message: "..." }` — error response
  // Since the CLI is not streaming, the entire output arrives as
  // one chunk. We extract text and tool calls from the payload.
  if (t === "response" || t === "openclaw_response") {
    const chunks: ParsedChunk[] = [];
    // Extract text content
    const content = event.content ?? event.text ?? event.message;
    if (typeof content === "string" && content) {
      chunks.push({ kind: "text", text: content });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block === "string") {
          chunks.push({ kind: "text", text: block });
        } else if (block && typeof block === "object") {
          if (block.type === "text" && typeof block.text === "string") {
            chunks.push({ kind: "text", text: block.text });
          } else if (block.type === "tool_use" || block.type === "tool_call") {
            const name = typeof block.name === "string" ? block.name : "unknown";
            chunks.push({
              kind: "tool_call",
              tool: {
                id: String(block.id ?? cryptoRandomId()),
                name,
                kind: inferToolKind(name),
                arguments: block.input ?? block.args ?? block.arguments ?? {},
                status: "in_progress",
              },
            });
          }
        }
      }
    }
    // Extract tool calls from top-level array
    if (Array.isArray(event.tool_calls)) {
      for (const tc of event.tool_calls) {
        if (!tc || typeof tc !== "object") continue;
        const name = typeof tc.name === "string" ? tc.name : "unknown";
        chunks.push({
          kind: "tool_call",
          tool: {
            id: String(tc.id ?? cryptoRandomId()),
            name,
            kind: inferToolKind(name),
            arguments: tc.arguments ?? tc.input ?? {},
            status: "in_progress",
          },
        });
      }
    }
    if (chunks.length > 0) return chunks;
  }
  // OpenClaw error events use `openclaw_error` as the type
  // discriminator — this is specific enough not to conflict
  // with other adapters' `type: "error"` events (which we
  // don't handle; see the test "does not reclassify JSON
  // error events that already have a type field").
  if (t === "openclaw_error") {
    const msg = event.message ?? event.error ?? event.text ?? "Unknown error";
    return [{ kind: "notice", level: "error", text: String(msg) }];
  }

  // ---- 7. Generic minimal shapes (fallback for any CLI) ----
  if (t === "text" && typeof event.text === "string") {
    return [{ kind: "text", text: event.text }];
  }
  if (t === "thinking") {
    const text = event.text ?? event.thinking;
    if (typeof text === "string") return [{ kind: "thinking", text }];
  }
  if (t === "tool_call" || t === "tool_use") {
    return [parseGenericToolCall(event)];
  }
  if (t === "tool_response" || t === "tool_result") {
    return [{
      kind: "tool_response",
      id: String(event.id ?? ""),
      result: event.result ?? event.content ?? null,
    }];
  }
  if (t === "plan") {
    return [{ kind: "plan", plan: normalizePlan(event) }];
  }
  if (t === "permission" || t === "approval_request") {
    return [{
      kind: "permission",
      id: String(event.id ?? ""),
      tool: String(event.tool ?? event.tool_name ?? ""),
      args: event.args ?? event.arguments ?? {},
    }];
  }
  return [];
}

// Walk a Claude Code `assistant` event's `message.content` array.
// Blocks arrive in the order the model emitted them, and a single
// event can carry all three kinds. We preserve that order so the
// transcript renders thinking first, then text, then tool calls.
function parseAssistantContent(content: any[]): ParsedChunk[] {
  const out: ParsedChunk[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "thinking" && typeof block.thinking === "string") {
      out.push({ kind: "thinking", text: block.thinking });
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      out.push({ kind: "text", text: block.text });
      continue;
    }
    if (block.type === "tool_use") {
      const name = typeof block.name === "string" ? block.name : "unknown";
      const tool: ToolCall = {
        id: String(block.id ?? cryptoRandomId()),
        name,
        kind: inferToolKind(name),
        arguments: block.input ?? {},
        status: "in_progress",
      };
      out.push({ kind: "tool_call", tool });
      continue;
    }
    // Unknown block type (e.g. server_tool_use, redacted_thinking).
    // Skip rather than surface as text — those have their own
    // forward-compat shapes that a future Phase can handle.
  }
  return out;
}

// Walk a Claude Code `user` event's `message.content` array. Today
// every block is `tool_result`; the array form is what lets the
// format extend to multi-tool results in one event.
function parseUserContent(content: any[]): ParsedChunk[] {
  const out: ParsedChunk[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type !== "tool_result") continue;
    // The tool result's `content` can be a string OR an array of
    // `{type: "text", text: ...}` blocks (matches Anthropic's
    // shape). Normalise both to a plain string for the front-end
    // so the ToolCard body has something predictable to render.
    const raw = block.content;
    const result: unknown =
      typeof raw === "string"
        ? raw
        : Array.isArray(raw)
          ? raw
              .filter((b: any) => b && typeof b === "object" && b.type === "text")
              .map((b: any) => String(b.text ?? ""))
              .join("\n")
          : raw ?? null;
    out.push({
      kind: "tool_response",
      id: String(block.tool_use_id ?? ""),
      result,
    });
  }
  return out;
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

/**
 * Hermes plain-text tool call detector.
 *
 * Hermes in `-Q` (quiet) mode emits tool usage as plain-text
 * lines prefixed with 🔧. Common patterns:
 *   🔧 Using tool: Read(file_path="src/main.ts")
 *   🔧 Using tool: Bash(command="npm test")
 *   🔧 Using tool: Write(file_path="output.txt")
 *   📝 Tool result: <content>
 *
 * We parse these into structured `tool_call` / `tool_response`
 * chunks so the ToolCard renders them with the proper icon,
 * status badge, and collapsible body — instead of dumping
 * raw emoji-prefixed text into the message stream.
 *
 * Returns a `ParsedChunk` when the line matches, `null` otherwise.
 */
function detectHermesToolCall(
  trimmed: string,
): ParsedChunk | null {
  if (!trimmed) return null;

  // Tool invocation: 🔧 Using tool: ToolName(key="value", ...)
  const toolMatch = /^🔧\s*(?:Using\s+tool:\s*)?(\w+)\(([^)]*)\)/.exec(trimmed);
  if (toolMatch) {
    const name = toolMatch[1];
    const argsStr = toolMatch[2];
    // Parse simple key="value" pairs from the argument string.
    const args: Record<string, string> = {};
    const pairRe = /(\w+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = pairRe.exec(argsStr)) !== null) {
      args[m[1]] = m[2];
    }
    return {
      kind: "tool_call",
      tool: {
        id: cryptoRandomId(),
        name,
        kind: inferToolKind(name),
        arguments: args,
        status: "in_progress",
      },
    };
  }

  // Simpler pattern: 🔧 ToolName or 🔧 Running ToolName
  const simpleToolMatch = /^🔧\s*(?:Running\s+)?(\w+)/.exec(trimmed);
  if (simpleToolMatch) {
    const name = simpleToolMatch[1];
    // Don't match common English words that happen to follow 🔧
    const knownTools = /^(Read|Write|Edit|Bash|Search|Fetch|Glob|Grep|MultiEdit|ListFiles|FileEdit|Command)$/i;
    if (knownTools.test(name)) {
      return {
        kind: "tool_call",
        tool: {
          id: cryptoRandomId(),
          name,
          kind: inferToolKind(name),
          arguments: {},
          status: "in_progress",
        },
      };
    }
  }

  // Tool result: 📝 Tool result: <content>
  const resultMatch = /^📝\s*(?:Tool\s+result|Result):\s*(.*)$/.exec(trimmed);
  if (resultMatch) {
    return {
      kind: "tool_response",
      id: "", // Hermes doesn't carry tool_use_id in plain text
      result: resultMatch[1],
    };
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
