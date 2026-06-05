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
});
