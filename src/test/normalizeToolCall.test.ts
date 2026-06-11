import { describe, expect, it } from "vitest";
import {
  friendlyToolName,
  hasRunningToolItems,
  normalizeStatus,
  normalizeToolGroupItem,
  normalizeToolItem,
  normalizeToolItems,
  toolSubject,
} from "@/chat/normalizeToolCall";
import type { ReasonixItem } from "@/lib/reasonixAdapter";

describe("normalizeStatus", () => {
  it("maps the IntentLoom status set onto the 5-state union", () => {
    expect(normalizeStatus("success")).toBe("completed");
    expect(normalizeStatus("completed")).toBe("completed");
    expect(normalizeStatus("error")).toBe("error");
    expect(normalizeStatus("failed")).toBe("error");
    expect(normalizeStatus("running")).toBe("running");
    expect(normalizeStatus("in_progress")).toBe("running");
    expect(normalizeStatus("executing")).toBe("running");
    expect(normalizeStatus("confirming")).toBe("running");
    expect(normalizeStatus("canceled")).toBe("canceled");
    expect(normalizeStatus("pending")).toBe("pending");
    expect(normalizeStatus("weird-status")).toBe("pending");
    expect(normalizeStatus(undefined)).toBe("pending");
  });
});

describe("friendlyToolName", () => {
  it("translates ACP / OpenClaw tool names to short labels", () => {
    expect(friendlyToolName("execute", undefined)).toBe("Bash");
    expect(friendlyToolName("read", undefined)).toBe("Read");
    expect(friendlyToolName("edit", undefined)).toBe("Edit");
    expect(friendlyToolName("write", undefined)).toBe("Write");
    expect(friendlyToolName("search", undefined)).toBe("Search");
    expect(friendlyToolName("read_file", undefined)).toBe("Read");
  });

  it("falls back to the kind2 hint if name doesn't match", () => {
    expect(friendlyToolName("weird", "execute")).toBe("Bash");
  });

  it("returns 'Tool' for empty inputs", () => {
    expect(friendlyToolName(undefined, undefined)).toBe("Tool");
  });
});

describe("toolSubject", () => {
  it("returns the command for execute / bash / shell", () => {
    expect(toolSubject({ command: "ls -la" }, "execute")).toBe("ls -la");
    expect(toolSubject({ cmd: "echo hi" }, "bash")).toBe("echo hi");
  });

  it("returns the file path for read / write / edit", () => {
    expect(toolSubject({ file_path: "/tmp/foo.ts" }, "read")).toBe("/tmp/foo.ts");
    expect(toolSubject({ path: "src/index.ts" }, "Edit")).toBe("src/index.ts");
  });

  it("returns the search query for search / glob / grep", () => {
    expect(toolSubject({ pattern: "TODO" }, "search")).toBe("TODO");
    expect(toolSubject({ query: "useEffect" }, "Grep")).toBe("useEffect");
  });

  it("returns empty for missing args", () => {
    expect(toolSubject(null, "execute")).toBe("");
    expect(toolSubject({}, "execute")).toBe("");
  });
});

describe("normalizeToolItem", () => {
  it("returns undefined for non-tool items", () => {
    const item: ReasonixItem = { kind: "user", id: "u1", text: "hi" };
    expect(normalizeToolItem(item)).toBeUndefined();
  });

  it("normalizes a flat tool item with file path subject", () => {
    const item: ReasonixItem = {
      kind: "tool",
      id: "t1",
      name: "Edit",
      args: { file_path: "src/index.ts", old_string: "a", new_string: "b" },
      status: "completed",
      result: "ok",
      agentId: "claude",
    };
    const n = normalizeToolItem(item);
    expect(n).toBeDefined();
    expect(n!.key).toBe("t1");
    expect(n!.name).toBe("Edit");
    expect(n!.status).toBe("completed");
    expect(n!.description).toBe("src/index.ts");
    expect(n!.input).toContain("src/index.ts");
    expect(n!.output).toBe("ok");
    expect(n!.agentId).toBe("claude");
  });

  it("uses the override indexKey when provided", () => {
    const item: ReasonixItem = {
      kind: "tool",
      id: "t1",
      name: "Read",
      args: { file_path: "a.ts" },
      status: "completed",
    };
    expect(normalizeToolItem(item, "g1.0")?.key).toBe("g1.0");
  });
});

describe("normalizeToolGroupItem", () => {
  it("flattens tool_group children into individual entries with stable keys", () => {
    const child1: ReasonixItem = {
      kind: "tool",
      id: "a",
      name: "Read",
      args: { file_path: "a.ts" },
      status: "completed",
    };
    const child2: ReasonixItem = {
      kind: "tool",
      id: "b",
      name: "Edit",
      args: { file_path: "b.ts" },
      status: "running",
    };
    const group: ReasonixItem = { kind: "tool_group", id: "g1", tools: [child1, child2], agentId: "codex" };
    const flat = normalizeToolGroupItem(group);
    expect(flat).toHaveLength(2);
    expect(flat[0].key).toBe("g1.0");
    expect(flat[1].key).toBe("g1.1");
    expect(flat[1].status).toBe("running");
    expect(flat[1].agentId).toBe("codex");
  });
});

describe("normalizeToolItems", () => {
  it("returns [] for non tool-bearing items", () => {
    const items: ReasonixItem[] = [
      { kind: "user", id: "u1", text: "hi" },
      { kind: "assistant", id: "a1", text: "hello" },
    ];
    expect(normalizeToolItems(items)).toEqual([]);
  });
});

describe("hasRunningToolItems", () => {
  it("returns true if any leaf tool is running", () => {
    const items: ReasonixItem[] = [
      { kind: "tool", id: "1", name: "Read", args: {}, status: "completed" },
      { kind: "tool", id: "2", name: "Edit", args: {}, status: "running" },
    ];
    expect(hasRunningToolItems(items)).toBe(true);
  });

  it("returns true if any tool_group child is running", () => {
    const items: ReasonixItem[] = [
      {
        kind: "tool_group",
        id: "g1",
        tools: [
          { kind: "tool", id: "1", name: "Read", args: {}, status: "completed" },
          { kind: "tool", id: "2", name: "Edit", args: {}, status: "running" },
        ],
      },
    ];
    expect(hasRunningToolItems(items)).toBe(true);
  });

  it("returns false when no item is running", () => {
    const items: ReasonixItem[] = [
      { kind: "tool", id: "1", name: "Read", args: {}, status: "completed" },
      { kind: "user", id: "u1", text: "hi" },
    ];
    expect(hasRunningToolItems(items)).toBe(false);
  });
});
