import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import {
  classifyToolCall,
  toolCallsToRecords,
  useProductChangesStore,
} from "@/lib/useProductChanges";
import type { ToolCall } from "@/types/message";

// vi.mock is hoisted; install a fresh `invoke` spy for every test
// so a leaked implementation from one case can't poison the next.
const invokeMock = vi.fn();
vi.mock("@/lib/tauri", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));

const tc = (
  id: string,
  name: string,
  args: Record<string, unknown> = {},
): ToolCall =>
  ({
    id,
    name,
    arguments: args,
    status: "completed",
  } as unknown as ToolCall);

describe("classifyToolCall", () => {
  it("maps write/create/add -> added and pulls file_path", () => {
    expect(classifyToolCall(tc("1", "Write", { file_path: "a.ts" }))).toEqual({
      kind: "added",
      path: "a.ts",
    });
    expect(classifyToolCall(tc("2", "create_file", { path: "b.ts" }))).toEqual({
      kind: "added",
      path: "b.ts",
    });
  });

  it("maps edit/patch/update/modify -> modified", () => {
    expect(classifyToolCall(tc("3", "Edit", { file_path: "c.ts" }))).toEqual({
      kind: "modified",
      path: "c.ts",
    });
    expect(classifyToolCall(tc("4", "update_config"))).toEqual({
      kind: "modified",
      path: undefined,
    });
  });

  it("maps delete/remove -> deleted", () => {
    expect(classifyToolCall(tc("5", "DeleteFile", { file_path: "d.ts" }))).toEqual({
      kind: "deleted",
      path: "d.ts",
    });
    expect(classifyToolCall(tc("6", "remove_dir"))).toEqual({
      kind: "deleted",
      path: undefined,
    });
  });

  it("maps bash/command/run/execute -> command and pulls command text", () => {
    expect(
      classifyToolCall(tc("7", "Bash", { command: "ls -la" })),
    ).toEqual({ kind: "command", path: undefined, summary: "ls -la" });
    expect(
      classifyToolCall(tc("8", "execute_shell", { command: "echo hi" })),
    ).toEqual({ kind: "command", path: undefined, summary: "echo hi" });
  });

  it("returns null for unknown tool names", () => {
    expect(classifyToolCall(tc("9", "read_file"))).toBeNull();
    expect(classifyToolCall(tc("10", "list_directory"))).toBeNull();
  });
});

describe("toolCallsToRecords", () => {
  it("filters out nulls and preserves the conversation + agent id", () => {
    const tcs = [
      tc("1", "Write", { file_path: "a.ts" }),
      tc("2", "Edit", { file_path: "b.ts" }),
      tc("3", "Bash", { command: "ls" }),
      tc("4", "read_file"),
    ];
    expect(toolCallsToRecords("conv-1", "claude", tcs)).toEqual([
      { conversationId: "conv-1", agentId: "claude", kind: "added", path: "a.ts", summary: null },
      { conversationId: "conv-1", agentId: "claude", kind: "modified", path: "b.ts", summary: null },
      { conversationId: "conv-1", agentId: "claude", kind: "command", path: null, summary: "ls" },
    ]);
  });

  it("returns [] for an empty input", () => {
    expect(toolCallsToRecords("c", "claude", [])).toEqual([]);
  });

  it("returns [] when every call is unclassifiable", () => {
    const tcs = [tc("1", "read_file"), tc("2", "glob")];
    expect(toolCallsToRecords("c", "claude", tcs)).toEqual([]);
  });
});

describe("useProductChangesStore", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    useProductChangesStore.setState({
      aggregate: {
        byKind: {},
        byAgent: {},
        totalFiles: 0,
        totalCommands: 0,
        totalRows: 0,
      },
      loading: false,
      error: null,
      lastLoadedAt: null,
    });
  });
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("refresh() calls the aggregate command and stores the result", async () => {
    invokeMock.mockResolvedValueOnce({
      byKind: { added: 2, command: 1 },
      byAgent: { claude: 3 },
      totalFiles: 2,
      totalCommands: 1,
      totalRows: 3,
    });
    await useProductChangesStore.getState().refresh();
    expect(invokeMock).toHaveBeenCalledWith(
      "list_product_changes_aggregate",
      { conversationId: null },
    );
    const agg = useProductChangesStore.getState().aggregate;
    expect(agg.totalFiles).toBe(2);
    expect(agg.totalCommands).toBe(1);
    expect(agg.byAgent).toEqual({ claude: 3 });
  });

  it("refresh() swallows backend errors and records the error string", async () => {
    invokeMock.mockRejectedValueOnce(new Error("backend down"));
    await useProductChangesStore.getState().refresh();
    expect(useProductChangesStore.getState().error).toContain("backend down");
  });

  it("recordBatch() sends records to the batch command and triggers refresh", async () => {
    invokeMock
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce({
        byKind: { added: 1, command: 1, modified: 1 },
        byAgent: { claude: 3 },
        totalFiles: 2,
        totalCommands: 1,
        totalRows: 3,
      });
    const tcs = [
      tc("1", "Write", { file_path: "a.ts" }),
      tc("2", "Edit", { file_path: "b.ts" }),
      tc("3", "Bash", { command: "ls" }),
    ];
    const n = await useProductChangesStore
      .getState()
      .recordBatch("conv-x", "claude", tcs);
    expect(n).toBe(3);
    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "record_product_changes_batch",
      {
        changes: [
          ["conv-x", "claude", "added", "a.ts", null],
          ["conv-x", "claude", "modified", "b.ts", null],
          ["conv-x", "claude", "command", null, "ls"],
        ],
      },
    );
  });

  it("recordBatch() short-circuits when no classifiable calls are present", async () => {
    const n = await useProductChangesStore
      .getState()
      .recordBatch("conv-x", "claude", [tc("1", "read_file")]);
    expect(n).toBe(0);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
