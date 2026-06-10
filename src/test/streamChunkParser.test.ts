import { describe, expect, it } from "vitest";
import { parseStreamChunk, type ParsedChunk } from "@/lib/streamChunkParser";

/**
 * `parseStreamChunk` returns an array of chunks because the
 * Claude Code wire format can pack a `content: [thinking, text,
 * tool_use]` array into a single line. Every other adapter
 * (Hermes / Codex / OpenCode / OpenClaw / Anthropic streaming)
 * produces a one-element array. These tests use `first()` to
 * peel off the single chunk from legacy / single-block events
 * so the assertions stay readable; the new Claude Code block
 * uses the array form directly to exercise the multi-chunk path.
 */
function first(chunks: ParsedChunk[]): ParsedChunk {
  if (chunks.length !== 1) {
    throw new Error(
      `expected exactly 1 chunk from single-block event, got ${chunks.length}: ${JSON.stringify(chunks)}`,
    );
  }
  return chunks[0]!;
}

describe("parseStreamChunk", () => {
  describe("non-JSON / empty inputs", () => {
    it("returns [] for empty string", () => {
      expect(parseStreamChunk("")).toEqual([]);
    });

    it("returns [] for whitespace-only string", () => {
      expect(parseStreamChunk("   \n  ")).toEqual([]);
    });

    it("returns [] for plain text (no JSON)", () => {
      // The caller falls back to "treat the line as raw text" when we
      // return [], which is the historical Claude behavior.
      expect(parseStreamChunk("Hello, world!")).toEqual([]);
    });

    it("returns [] for invalid JSON", () => {
      expect(parseStreamChunk("{not valid json")).toEqual([]);
    });

    it("returns [] for non-object JSON", () => {
      expect(parseStreamChunk("42")).toEqual([]);
      expect(parseStreamChunk("null")).toEqual([]);
      expect(parseStreamChunk("[1,2,3]")).toEqual([]);
    });
  });

  describe("Claude / Anthropic streaming protocol (legacy)", () => {
    it("parses text_delta from content_block_delta", () => {
      expect(
        first(
          parseStreamChunk(
            JSON.stringify({
              type: "content_block_delta",
              delta: { type: "text_delta", text: "Hello " },
            }),
          ),
        ),
      ).toEqual({ kind: "text", text: "Hello " });
    });

    it("parses thinking_delta from content_block_delta", () => {
      expect(
        first(
          parseStreamChunk(
            JSON.stringify({
              type: "content_block_delta",
              delta: { type: "thinking_delta", thinking: "Let me think..." },
            }),
          ),
        ),
      ).toEqual({ kind: "thinking", text: "Let me think..." });
    });

    it("parses tool_use from content_block_start", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "toolu_abc",
            name: "Write",
            input: { file_path: "/tmp/foo.ts" },
          },
        }),
      );
      expect(chunks).toHaveLength(1);
      const c = chunks[0]!;
      expect(c.kind).toBe("tool_call");
      if (c.kind === "tool_call") {
        expect(c.tool.name).toBe("Write");
        expect(c.tool.id).toBe("toolu_abc");
        expect(c.tool.kind).toBe("edit");
        expect(c.tool.status).toBe("in_progress");
        expect(c.tool.arguments).toEqual({ file_path: "/tmp/foo.ts" });
      }
    });

    it("parses thinking block start", () => {
      expect(
        first(
          parseStreamChunk(
            JSON.stringify({
              type: "content_block_start",
              content_block: { type: "thinking" },
            }),
          ),
        ),
      ).toEqual({ kind: "thinking", text: "" });
    });

    it("classifies input_json_delta as a control event", () => {
      expect(
        first(
          parseStreamChunk(
            JSON.stringify({
              type: "content_block_delta",
              delta: { type: "input_json_delta", partial_json: '{"a":' },
            }),
          ),
        ),
      ).toEqual({ kind: "control", event: "input_json_delta" });
    });

    it("passes through message_start / message_delta / message_stop as control", () => {
      for (const t of ["message_start", "message_delta", "message_stop"]) {
        expect(first(parseStreamChunk(JSON.stringify({ type: t })))).toEqual({
          kind: "control",
          event: t,
        });
      }
    });

    it("passes through content_block_stop as control", () => {
      expect(
        first(parseStreamChunk(JSON.stringify({ type: "content_block_stop" }))),
      ).toEqual({ kind: "control", event: "block_stop" });
    });
  });

  // The CURRENT `claude -p` wire format. Verified against
  // `claude --output-format stream-json --verbose` on Claude Code
  // v2.1.143 (2026-06-08). The key behavioural difference vs
  // the Anthropic streaming protocol: each event carries the
  // FULL message (not a delta) under `message.content`, and a
  // single event can pack thinking + text + tool_use in one
  // `content` array. The parser fans that out into multiple
  // chunks in the order the model emitted them.
  describe("Claude Code wire format (current `claude -p` output)", () => {
    it("ignores the system/init session metadata", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "system",
          subtype: "init",
          session_id: "abc",
          tools: ["Bash", "Read"],
          model: "MiniMax-M2.7",
          permissionMode: "default",
        }),
      );
      // The control event lets the controller record "session
      // started at <time>" in the LoomPanel if it wants, but
      // it must NOT produce text / thinking / tool chunks.
      expect(chunks).toEqual([{ kind: "control", event: "system_init" }]);
    });

    it("fans a thinking-only assistant event into a single chunk", () => {
      expect(
        parseStreamChunk(
          JSON.stringify({
            type: "assistant",
            message: {
              id: "m1",
              role: "assistant",
              content: [
                {
                  type: "thinking",
                  thinking: "the user wants me to say hi",
                  signature: "abc",
                },
              ],
            },
          }),
        ),
      ).toEqual([{ kind: "thinking", text: "the user wants me to say hi" }]);
    });

    it("fans a text-only assistant event into a single chunk", () => {
      expect(
        parseStreamChunk(
          JSON.stringify({
            type: "assistant",
            message: { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
          }),
        ),
      ).toEqual([{ kind: "text", text: "Hello!" }]);
    });

    it("fans a tool_use-only assistant event into a single chunk", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "call_abc",
                name: "Bash",
                input: { command: "ls -la" },
              },
            ],
          },
        }),
      );
      expect(chunks).toHaveLength(1);
      const c = chunks[0]!;
      expect(c.kind).toBe("tool_call");
      if (c.kind === "tool_call") {
        expect(c.tool.id).toBe("call_abc");
        expect(c.tool.name).toBe("Bash");
        expect(c.tool.kind).toBe("execute");
        expect(c.tool.arguments).toEqual({ command: "ls -la" });
        expect(c.tool.status).toBe("in_progress");
      }
    });

    it("fans thinking + text + tool_use in one event into THREE chunks in order", () => {
      // This is the headline case the parser rewrite unlocks.
      // A single Claude Code line can carry all three content
      // kinds; the old single-chunk parser would have dropped
      // two of them.
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "thinking", thinking: "let me check the file" },
              { type: "text", text: "Reading the file now." },
              {
                type: "tool_use",
                id: "call_xyz",
                name: "Read",
                input: { file_path: "/tmp/foo.ts" },
              },
            ],
          },
        }),
      );
      expect(chunks).toEqual([
        { kind: "thinking", text: "let me check the file" },
        { kind: "text", text: "Reading the file now." },
        {
          kind: "tool_call",
          tool: expect.objectContaining({
            id: "call_xyz",
            name: "Read",
            kind: "read",
            arguments: { file_path: "/tmp/foo.ts" },
            status: "in_progress",
          }),
        },
      ]);
    });

    it("fans a user/tool_result event into a tool_response chunk", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "call_abc",
                content: "file contents here",
                is_error: false,
              },
            ],
          },
        }),
      );
      expect(chunks).toEqual([
        {
          kind: "tool_response",
          id: "call_abc",
          result: "file contents here",
        },
      ]);
    });

    it("normalises tool_result content array-of-blocks into a joined string", () => {
      // Anthropic's tool result can be an array of
      // `{type:"text",text:...}` blocks. The front-end
      // ToolCard body is a single string, so the parser
      // joins them with `\n` for a predictable render.
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "call_1",
                content: [
                  { type: "text", text: "line 1" },
                  { type: "text", text: "line 2" },
                ],
              },
            ],
          },
        }),
      );
      expect(chunks).toEqual([
        { kind: "tool_response", id: "call_1", result: "line 1\nline 2" },
      ]);
    });

    it("emits a control event for the end-of-turn result", () => {
      expect(
        parseStreamChunk(
          JSON.stringify({
            type: "result",
            subtype: "end_turn",
            duration_ms: 1234,
            is_error: false,
            num_turns: 1,
            stop_reason: "end_turn",
            total_cost_usd: 0.0,
          }),
        ),
      ).toEqual([{ kind: "control", event: "result" }]);
    });

    it("promotes an error result to a notice chunk", () => {
      // When Claude hits the budget cap it emits
      // `subtype: "error_max_budget_usd"` with is_error=true.
      // The user needs to see a red banner, not a silent
      // control event.
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "result",
          subtype: "error_max_budget_usd",
          is_error: true,
          errors: ["Reached maximum budget ($0.10)"],
        }),
      );
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.kind).toBe("notice");
      if (chunks[0]!.kind === "notice") {
        expect(chunks[0]!.level).toBe("error");
        expect(chunks[0]!.text).toContain("Reached maximum budget");
      }
    });

    it("ignores unknown content block types in an assistant event", () => {
      // Forward-compat: a future Claude Code release might add
      // new block types (e.g. redacted_thinking, web_search).
      // The parser must not surface unknown blocks as text.
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            content: [
              { type: "redacted_thinking", data: "opaque" },
              { type: "text", text: "visible" },
            ],
          },
        }),
      );
      expect(chunks).toEqual([{ kind: "text", text: "visible" }]);
    });

    it("returns [] for an assistant event with no recognisable content", () => {
      // An empty content array, or one with only unknown
      // block types, yields no chunks — we do NOT fall
      // through to the "raw line is text" path because the
      // line IS valid JSON.
      expect(
        parseStreamChunk(
          JSON.stringify({
            type: "assistant",
            message: { role: "assistant", content: [] },
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("Generic event shapes (Gemini + future adapters)", () => {
    it("parses generic text event", () => {
      expect(
        first(
          parseStreamChunk(JSON.stringify({ type: "text", text: "streamed response" })),
        ),
      ).toEqual({ kind: "text", text: "streamed response" });
    });

    it("parses generic thinking event (text field)", () => {
      expect(
        first(
          parseStreamChunk(JSON.stringify({ type: "thinking", text: "reasoning..." })),
        ),
      ).toEqual({ kind: "thinking", text: "reasoning..." });
    });

    it("parses generic thinking event (thinking field)", () => {
      expect(
        first(
          parseStreamChunk(JSON.stringify({ type: "thinking", thinking: "reasoning..." })),
        ),
      ).toEqual({ kind: "thinking", text: "reasoning..." });
    });

    it("parses generic tool_call with arguments", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "tool_call",
          id: "tc1",
          name: "Bash",
          arguments: { command: "ls -la" },
        }),
      );
      expect(chunks).toHaveLength(1);
      const c = chunks[0]!;
      expect(c.kind).toBe("tool_call");
      if (c.kind === "tool_call") {
        expect(c.tool.name).toBe("Bash");
        expect(c.tool.id).toBe("tc1");
        expect(c.tool.kind).toBe("execute");
        expect(c.tool.arguments).toEqual({ command: "ls -la" });
        expect(c.tool.diff).toBeUndefined();
      }
    });

    it("parses generic tool_call with diff payload", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "tool_call",
          id: "tc1",
          name: "Edit",
          arguments: { file_path: "a.ts" },
          diff: [
            { type: "add", newText: "import x" },
            { type: "remove", oldText: "import y" },
          ],
        }),
      );
      expect(chunks).toHaveLength(1);
      const c = chunks[0]!;
      if (c.kind === "tool_call") {
        expect(c.tool.kind).toBe("edit");
        expect(c.tool.diff).toHaveLength(2);
        expect(c.tool.diff![0]).toEqual({ type: "add", newText: "import x" });
      }
    });

    it("falls back to args / parameters / input field names for tool args", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({ type: "tool_call", name: "Read", parameters: { p: "/a" } }),
      );
      expect(chunks).toHaveLength(1);
      const c = chunks[0]!;
      if (c.kind === "tool_call") {
        expect(c.tool.arguments).toEqual({ p: "/a" });
      }
    });

    it("parses tool_response with id and result", () => {
      expect(
        first(
          parseStreamChunk(
            JSON.stringify({
              type: "tool_response",
              id: "tc1",
              result: { stdout: "ok" },
            }),
          ),
        ),
      ).toEqual({
        kind: "tool_response",
        id: "tc1",
        result: { stdout: "ok" },
      });
    });

    it("parses plan event with entries and currentIndex", () => {
      const chunks = parseStreamChunk(
        JSON.stringify({
          type: "plan",
          entries: [
            { id: "a", title: "Step A", status: "completed" },
            { id: "b", title: "Step B", status: "in_progress" },
          ],
          currentIndex: 1,
          isRunning: true,
        }),
      );
      expect(chunks).toHaveLength(1);
      const c = chunks[0]!;
      expect(c.kind).toBe("plan");
      if (c.kind === "plan") {
        expect(c.plan.entries).toHaveLength(2);
        expect(c.plan.entries[0].title).toBe("Step A");
        expect(c.plan.entries[1].status).toBe("in_progress");
        expect(c.plan.currentIndex).toBe(1);
        expect(c.plan.isRunning).toBe(true);
      }
    });

    it("parses permission event", () => {
      expect(
        first(
          parseStreamChunk(
            JSON.stringify({
              type: "permission",
              id: "p1",
              tool: "Bash",
              args: { command: "rm -rf /" },
            }),
          ),
        ),
      ).toEqual({
        kind: "permission",
        id: "p1",
        tool: "Bash",
        args: { command: "rm -rf /" },
      });
    });

    it("parses approval_request as permission", () => {
      expect(
        first(
          parseStreamChunk(JSON.stringify({ type: "approval_request", id: "p2", tool_name: "Edit" })),
        ),
      ).toEqual({
        kind: "permission",
        id: "p2",
        tool: "Edit",
        args: {},
      });
    });
  });

  describe("unrecognized events", () => {
    it("returns [] for unknown type field", () => {
      expect(parseStreamChunk(JSON.stringify({ type: "something_new" }))).toEqual([]);
    });

    it("returns [] for missing type field on object", () => {
      expect(parseStreamChunk(JSON.stringify({ foo: "bar" }))).toEqual([]);
    });
  });

  // Hermes Agent (`src-tauri/src/agents/hermes.rs`) emits a
  // leading `session_id: <id>` line as its session bootstrap.
  // The backend adapter intentionally forwards it; the parser
  // is responsible for not letting it slip into the transcript.
  // We emit a no-op control event so the controller's switch
  // statement drops it on the floor (the existing
  // `case "control": break` is exactly this path).
  describe("Hermes session_id line", () => {
    it("classifies a plain 'session_id: <id>' line as session_started control", () => {
      expect(parseStreamChunk("session_id: 7c3a-9e21")).toEqual([
        { kind: "control", event: "session_started" },
      ]);
    });

    it("accepts a flexible amount of whitespace around the colon", () => {
      expect(parseStreamChunk("session_id:    abc123")).toEqual([
        { kind: "control", event: "session_started" },
      ]);
      expect(parseStreamChunk("session_id:xyz")).toEqual([
        { kind: "control", event: "session_started" },
      ]);
    });

    it("also matches the session-id / SESSION_ID spellings", () => {
      // Hermes is the only adapter known to use the underscore
      // form today, but the parser is intentionally lenient so
      // future forks of the CLI don't have to coordinate a
      // parser bump to add a new spelling.
      expect(parseStreamChunk("session-id: 42")).toEqual([
        { kind: "control", event: "session_started" },
      ]);
      expect(parseStreamChunk("SESSION_ID: 42")).toEqual([
        { kind: "control", event: "session_started" },
      ]);
    });

    it("does not treat 'session_idle' or 'session_idle: 5' as session_started", () => {
      // The key must be followed by a colon immediately after
      // (optionally with whitespace), not by another identifier
      // character. A "session_idle" timer value would otherwise
      // be mis-classified.
      expect(parseStreamChunk("session_idle")).toEqual([]);
      expect(parseStreamChunk("session_idle: 5")).toEqual([]);
    });

    it("does not match a session_id field embedded in prose", () => {
      // The regex anchors to the start of the trimmed line, so
      // a chat reply that happens to mention "session_id" is
      // unaffected — it stays text.
      const prose = "use the session_id from the prior turn to resume";
      expect(parseStreamChunk(prose)).toEqual([]);
    });
  });

  // Hermes auth / network failure detection. T6 surfaces these
  // as styled `notice` chunks so the Transcript can render them
  // as a red banner instead of folding them into the assistant
  // reply. The detection is conservative on purpose — see the
  // long comment on `detectHermesNotice` in the parser for the
  // exact rules.
  describe("Hermes notice line", () => {
    it("classifies a 🔐-prefixed line as an error notice", () => {
      expect(
        parseStreamChunk("🔐 upstream returned 401 — authentication failed."),
      ).toEqual([
        {
          kind: "notice",
          level: "error",
          text: "🔐 upstream returned 401 — authentication failed.",
        },
      ]);
    });

    it("classifies a status code + failure-phrase pair as error notice", () => {
      expect(
        parseStreamChunk("authentication failed (HTTP 401) for provider=anthropic"),
      ).toEqual([
        {
          kind: "notice",
          level: "error",
          text: "authentication failed (HTTP 401) for provider=anthropic",
        },
      ]);
      expect(parseStreamChunk("rate limit hit, retrying (429)")).toEqual([
        {
          kind: "notice",
          level: "error",
          text: "rate limit hit, retrying (429)",
        },
      ]);
      expect(parseStreamChunk("upstream 503 service unavailable")).toEqual([
        {
          kind: "notice",
          level: "error",
          text: "upstream 503 service unavailable",
        },
      ]);
    });

    it("does not classify a bare status-code mention as a notice", () => {
      // A code answer that happens to mention "401" must keep
      // going through the normal text path. The pair rule
      // (status code AND failure phrase) is the gate.
      expect(parseStreamChunk("HTTP 401 is the right status here")).toEqual([]);
      expect(parseStreamChunk("status 200 means ok")).toEqual([]);
    });

    it("does not classify a failure phrase without a status code as a notice", () => {
      // "permission denied" alone is too generic — the parser
      // would mis-fire on any chat reply that uses the phrase.
      expect(parseStreamChunk("permission denied by the file mode")).toEqual([]);
    });

    it("does not reclassify JSON error events that already have a type field", () => {
      // If an adapter ever migrates to a proper `type: "error"`
      // event shape, the JSON branch handles it (returning
      // an empty array here because we don't define a
      // type="error" branch — the front-end already has a
      // separate plan for a future structured error
      // contract). The point of the assertion is just to
      // confirm we don't accidentally route JSON through the
      // Hermes detector.
      const json = JSON.stringify({ type: "error", message: "401 authentication failed" });
      const chunks = parseStreamChunk(json);
      // Result may be empty or any non-notice shape; we just
      // care that it is NOT a notice.
      expect(chunks).not.toMatchObject([{ kind: "notice" }]);
    });
  });

  describe("Codex CLI wire format (codex exec --json)", () => {
    // Wire format captured 2026-06-08 against
    // codex-cli 0.137.0-alpha.4. Each line is a top-level
    // JSON object; the interesting dispatch is on
    // `item.completed` whose `item.type` field carries the
    // actual chunk shape.

    it("routes thread.started / turn.started to no-op control events", () => {
      expect(parseStreamChunk(
        JSON.stringify({
          type: "thread.started",
          thread_id: "019ea57a-31d3-7ee0-9fed-38c5e3b3c5d8",
        }),
      )).toEqual([{ kind: "control", event: "thread.started" }]);
      expect(parseStreamChunk(
        JSON.stringify({ type: "turn.started" }),
      )).toEqual([{ kind: "control", event: "turn.started" }]);
    });

    it("routes turn.completed to a turn_completed control event", () => {
      // Usage block is preserved for the Loom panel / usage
      // store to read off the same payload; the parser just
      // surfaces a control marker.
      expect(parseStreamChunk(
        JSON.stringify({
          type: "turn.completed",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      )).toEqual([{ kind: "control", event: "turn_completed" }]);
    });

    it("routes item.completed / item.type=reasoning to a thinking chunk", () => {
      expect(parseStreamChunk(
        JSON.stringify({
          type: "item.completed",
          item: {
            id: "item_0",
            type: "reasoning",
            text: "The user asks me to say the single word hi.",
          },
        }),
      )).toEqual([{
        kind: "thinking",
        text: "The user asks me to say the single word hi.",
      }]);
    });

    it("routes item.completed / item.type=agent_message to a text chunk", () => {
      expect(parseStreamChunk(
        JSON.stringify({
          type: "item.completed",
          item: { id: "item_1", type: "agent_message", text: "hi" },
        }),
      )).toEqual([{ kind: "text", text: "hi" }]);
    });

    it("routes unknown item subtypes (function_call, etc.) to a tool_call chunk", () => {
      // The full item payload is forwarded as `arguments` so
      // the ToolCard on the transcript can render whatever
      // Codex's wire shape is (e.g. file_edit / web_search /
      // custom tool). The `name` field carries the
      // `item.type` so the existing tool-kind inference
      // (`inferToolKind`) can pick a sensible icon.
      const item = {
        id: "item_2",
        type: "function_call",
        name: "Read",
        arguments: { file_path: "/tmp/foo.txt" },
      };
      expect(parseStreamChunk(
        JSON.stringify({ type: "item.completed", item }),
      )).toEqual([{
        kind: "tool_call",
        tool: {
          id: "item_2",
          name: "function_call",
          kind: expect.any(String),
          arguments: item,
          status: "completed",
        },
      }]);
    });

    it("ignores item.completed events with a missing item payload", () => {
      // A future Codex revision might add a control-shaped
      // item.completed we haven't seen yet; the parser must
      // not crash and must not leak the raw line as text.
      const out = parseStreamChunk(
        JSON.stringify({ type: "item.completed" }),
      );
      // Empty array is the contract for "don't render this";
      // the caller's raw-line fallback then keeps the line
      // out of the transcript instead of showing JSON.
      expect(out).toEqual([]);
    });

    // -- item.started (live in-progress hook) --
    //
    // Captured 2026-06-08 from a real `codex exec --json` run
    // that triggered a `cat` shell command. The flow was:
    //   1. item.started / type=command_execution / status=in_progress
    //   2. ... model thinks ...
    //   3. item.completed / type=command_execution / status=completed
    //   4. item.completed / type=agent_message / text=...
    // Without (1) the user only sees the tool call when (3)
    // lands, losing the running-toolcard spinner. Without
    // the command_execution special case on (3), the result
    // (command + output + exit code) is dropped on the floor.

    it("routes item.started / type=reasoning to a thinking chunk", () => {
      // Starts the live "正在思考..." timer at the right
      // moment, not when the reasoning is already done.
      expect(parseStreamChunk(
        JSON.stringify({
          type: "item.started",
          item: { id: "item_0", type: "reasoning", text: "Let me think..." },
        }),
      )).toEqual([{ kind: "thinking", text: "Let me think..." }]);
    });

    it("routes item.started / type=agent_message to a text chunk", () => {
      expect(parseStreamChunk(
        JSON.stringify({
          type: "item.started",
          item: { id: "item_1", type: "agent_message", text: "draft..." },
        }),
      )).toEqual([{ kind: "text", text: "draft..." }]);
    });

    it("routes item.started / type=command_execution to an in_progress tool_call", () => {
      // The controller's `addToolCall` will create a live
      // ToolCard with `status: "in_progress"`. The
      // `arguments` payload carries the full Codex item so
      // the ToolCard can render the command (the only field
      // it has at this point — `aggregated_output`,
      // `exit_code`, etc. are filled in by the
      // matching `item.completed` below).
      const item = {
        id: "item_2",
        type: "command_execution",
        command: "/bin/zsh -lc 'cat /tmp/codex-tooldemo/test.txt'",
        status: "in_progress",
      };
      expect(parseStreamChunk(
        JSON.stringify({ type: "item.started", item }),
      )).toEqual([{
        kind: "tool_call",
        tool: {
          id: "item_2",
          name: "command_execution",
          kind: expect.any(String),
          arguments: item,
          status: "in_progress",
        },
      }]);
    });

    it("routes item.completed / type=command_execution to a tool_response with the rich payload", () => {
      // The id matches the `item.started` above so the
      // controller's `updateToolCall(id, { status:
      // "completed" })` finds the right card and attaches
      // the result (command + aggregated_output + exit_code
      // + status) so the ToolCard can render "exit 0: hello".
      const item = {
        id: "item_2",
        type: "command_execution",
        command: "/bin/zsh -lc 'cat /tmp/codex-tooldemo/test.txt'",
        aggregated_output: "hello\n",
        exit_code: 0,
        status: "completed",
      };
      expect(parseStreamChunk(
        JSON.stringify({ type: "item.completed", item }),
      )).toEqual([{
        kind: "tool_response",
        id: "item_2",
        result: {
          command: item.command,
          aggregated_output: "hello\n",
          exit_code: 0,
          status: "completed",
        },
      }]);
    });
  });
});
