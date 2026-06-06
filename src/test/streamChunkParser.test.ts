import { describe, expect, it } from "vitest";
import { parseStreamChunk } from "@/lib/streamChunkParser";

describe("parseStreamChunk", () => {
  describe("non-JSON / empty inputs", () => {
    it("returns null for empty string", () => {
      expect(parseStreamChunk("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
      expect(parseStreamChunk("   \n  ")).toBeNull();
    });

    it("returns null for plain text (no JSON)", () => {
      // The caller falls back to "treat the line as raw text" when we
      // return null, which is the historical Claude behavior.
      expect(parseStreamChunk("Hello, world!")).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseStreamChunk("{not valid json")).toBeNull();
    });

    it("returns null for non-object JSON", () => {
      expect(parseStreamChunk("42")).toBeNull();
      expect(parseStreamChunk("null")).toBeNull();
      expect(parseStreamChunk("[1,2,3]")).toBeNull();
    });
  });

  describe("Claude / Anthropic streaming protocol", () => {
    it("parses text_delta from content_block_delta", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Hello " },
        })
      );
      expect(result).toEqual({ kind: "text", text: "Hello " });
    });

    it("parses thinking_delta from content_block_delta", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "Let me think..." },
        })
      );
      expect(result).toEqual({ kind: "thinking", text: "Let me think..." });
    });

    it("parses tool_use from content_block_start", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "toolu_abc",
            name: "Write",
            input: { file_path: "/tmp/foo.ts" },
          },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("tool_call");
      if (result!.kind === "tool_call") {
        expect(result!.tool.name).toBe("Write");
        expect(result!.tool.id).toBe("toolu_abc");
        expect(result!.tool.kind).toBe("edit");
        expect(result!.tool.status).toBe("in_progress");
        expect(result!.tool.arguments).toEqual({ file_path: "/tmp/foo.ts" });
      }
    });

    it("parses thinking block start", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "content_block_start",
          content_block: { type: "thinking" },
        })
      );
      expect(result).toEqual({ kind: "thinking", text: "" });
    });

    it("classifies input_json_delta as a control event", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "input_json_delta", partial_json: '{"a":' },
        })
      );
      expect(result).toEqual({ kind: "control", event: "input_json_delta" });
    });

    it("passes through message_start / message_delta / message_stop as control", () => {
      for (const t of ["message_start", "message_delta", "message_stop"]) {
        const result = parseStreamChunk(JSON.stringify({ type: t }));
        expect(result).toEqual({ kind: "control", event: t });
      }
    });

    it("passes through content_block_stop as control", () => {
      const result = parseStreamChunk(JSON.stringify({ type: "content_block_stop" }));
      expect(result).toEqual({ kind: "control", event: "block_stop" });
    });
  });

  describe("Generic event shapes (Gemini + future adapters)", () => {
    it("parses generic text event", () => {
      const result = parseStreamChunk(
        JSON.stringify({ type: "text", text: "streamed response" })
      );
      expect(result).toEqual({ kind: "text", text: "streamed response" });
    });

    it("parses generic thinking event (text field)", () => {
      const result = parseStreamChunk(
        JSON.stringify({ type: "thinking", text: "reasoning..." })
      );
      expect(result).toEqual({ kind: "thinking", text: "reasoning..." });
    });

    it("parses generic thinking event (thinking field)", () => {
      const result = parseStreamChunk(
        JSON.stringify({ type: "thinking", thinking: "reasoning..." })
      );
      expect(result).toEqual({ kind: "thinking", text: "reasoning..." });
    });

    it("parses generic tool_call with arguments", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "tool_call",
          id: "tc1",
          name: "Bash",
          arguments: { command: "ls -la" },
        })
      );
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("tool_call");
      if (result!.kind === "tool_call") {
        expect(result!.tool.name).toBe("Bash");
        expect(result!.tool.id).toBe("tc1");
        expect(result!.tool.kind).toBe("execute");
        expect(result!.tool.arguments).toEqual({ command: "ls -la" });
        expect(result!.tool.diff).toBeUndefined();
      }
    });

    it("parses generic tool_call with diff payload", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "tool_call",
          id: "tc1",
          name: "Edit",
          arguments: { file_path: "a.ts" },
          diff: [
            { type: "add", newText: "import x" },
            { type: "remove", oldText: "import y" },
          ],
        })
      );
      expect(result).not.toBeNull();
      if (result!.kind === "tool_call") {
        expect(result!.tool.kind).toBe("edit");
        expect(result!.tool.diff).toHaveLength(2);
        expect(result!.tool.diff![0]).toEqual({ type: "add", newText: "import x" });
      }
    });

    it("falls back to args / parameters / input field names for tool args", () => {
      const result = parseStreamChunk(
        JSON.stringify({ type: "tool_call", name: "Read", parameters: { p: "/a" } })
      );
      expect(result).not.toBeNull();
      if (result!.kind === "tool_call") {
        expect(result!.tool.arguments).toEqual({ p: "/a" });
      }
    });

    it("parses tool_response with id and result", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "tool_response",
          id: "tc1",
          result: { stdout: "ok" },
        })
      );
      expect(result).toEqual({
        kind: "tool_response",
        id: "tc1",
        result: { stdout: "ok" },
      });
    });

    it("parses plan event with entries and currentIndex", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "plan",
          entries: [
            { id: "a", title: "Step A", status: "completed" },
            { id: "b", title: "Step B", status: "in_progress" },
          ],
          currentIndex: 1,
          isRunning: true,
        })
      );
      expect(result).not.toBeNull();
      expect(result!.kind).toBe("plan");
      if (result!.kind === "plan") {
        expect(result!.plan.entries).toHaveLength(2);
        expect(result!.plan.entries[0].title).toBe("Step A");
        expect(result!.plan.entries[1].status).toBe("in_progress");
        expect(result!.plan.currentIndex).toBe(1);
        expect(result!.plan.isRunning).toBe(true);
      }
    });

    it("parses permission event", () => {
      const result = parseStreamChunk(
        JSON.stringify({
          type: "permission",
          id: "p1",
          tool: "Bash",
          args: { command: "rm -rf /" },
        })
      );
      expect(result).toEqual({
        kind: "permission",
        id: "p1",
        tool: "Bash",
        args: { command: "rm -rf /" },
      });
    });

    it("parses approval_request as permission", () => {
      const result = parseStreamChunk(
        JSON.stringify({ type: "approval_request", id: "p2", tool_name: "Edit" })
      );
      expect(result).toEqual({
        kind: "permission",
        id: "p2",
        tool: "Edit",
        args: {},
      });
    });
  });

  describe("unrecognized events", () => {
    it("returns null for unknown type field", () => {
      expect(parseStreamChunk(JSON.stringify({ type: "something_new" }))).toBeNull();
    });

    it("returns null for missing type field on object", () => {
      expect(parseStreamChunk(JSON.stringify({ foo: "bar" }))).toBeNull();
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
      expect(parseStreamChunk("session_id: 7c3a-9e21")).toEqual({
        kind: "control",
        event: "session_started",
      });
    });

    it("accepts a flexible amount of whitespace around the colon", () => {
      expect(parseStreamChunk("session_id:    abc123")).toEqual({
        kind: "control",
        event: "session_started",
      });
      expect(parseStreamChunk("session_id:xyz")).toEqual({
        kind: "control",
        event: "session_started",
      });
    });

    it("also matches the session-id / SESSION_ID spellings", () => {
      // Hermes is the only adapter known to use the underscore
      // form today, but the parser is intentionally lenient so
      // future forks of the CLI don't have to coordinate a
      // parser bump to add a new spelling.
      expect(parseStreamChunk("session-id: 42")).toEqual({
        kind: "control",
        event: "session_started",
      });
      expect(parseStreamChunk("SESSION_ID: 42")).toEqual({
        kind: "control",
        event: "session_started",
      });
    });

    it("does not treat 'session_idle' or 'session_idle: 5' as session_started", () => {
      // The key must be followed by a colon immediately after
      // (optionally with whitespace), not by another identifier
      // character. A "session_idle" timer value would otherwise
      // be mis-classified.
      expect(parseStreamChunk("session_idle")).toBeNull();
      expect(parseStreamChunk("session_idle: 5")).toBeNull();
    });

    it("does not match a session_id field embedded in prose", () => {
      // The regex anchors to the start of the trimmed line, so
      // a chat reply that happens to mention "session_id" is
      // unaffected — it stays text.
      const prose = "use the session_id from the prior turn to resume";
      expect(parseStreamChunk(prose)).toBeNull();
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
      ).toEqual({
        kind: "notice",
        level: "error",
        text: "🔐 upstream returned 401 — authentication failed.",
      });
    });

    it("classifies a status code + failure-phrase pair as error notice", () => {
      expect(
        parseStreamChunk("authentication failed (HTTP 401) for provider=anthropic"),
      ).toEqual({
        kind: "notice",
        level: "error",
        text: "authentication failed (HTTP 401) for provider=anthropic",
      });
      expect(parseStreamChunk("rate limit hit, retrying (429)")).toEqual({
        kind: "notice",
        level: "error",
        text: "rate limit hit, retrying (429)",
      });
      expect(parseStreamChunk("upstream 503 service unavailable")).toEqual({
        kind: "notice",
        level: "error",
        text: "upstream 503 service unavailable",
      });
    });

    it("does not classify a bare status-code mention as a notice", () => {
      // A code answer that happens to mention "401" must keep
      // going through the normal text path. The pair rule
      // (status code AND failure phrase) is the gate.
      expect(parseStreamChunk("HTTP 401 is the right status here")).toBeNull();
      expect(parseStreamChunk("status 200 means ok")).toBeNull();
    });

    it("does not classify a failure phrase without a status code as a notice", () => {
      // "permission denied" alone is too generic — the parser
      // would mis-fire on any chat reply that uses the phrase.
      expect(parseStreamChunk("permission denied by the file mode")).toBeNull();
    });

    it("does not reclassify JSON error events that already have a type field", () => {
      // If an adapter ever migrates to a proper `type: "error"`
      // event shape, the JSON branch handles it (returning
      // null here because we don't define a type="error"
      // branch — the front-end already has a separate plan for
      // a future structured error contract). The point of the
      // assertion is just to confirm we don't accidentally
      // route JSON through the Hermes detector.
      const json = JSON.stringify({ type: "error", message: "401 authentication failed" });
      const result = parseStreamChunk(json);
      // Result may be null or any non-notice shape; we just
      // care that it is NOT a notice.
      expect(result).not.toMatchObject({ kind: "notice" });
    });
  });
});
