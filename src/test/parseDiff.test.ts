import { describe, expect, it } from "vitest";
import {
  diffStat,
  extractContentFromDiff,
  parseDiff,
  type FileChangeInfo,
} from "@/chat/diffUtils";

describe("parseDiff", () => {
  it("returns an empty diff for empty input", () => {
    const out = parseDiff("", "foo.ts");
    expect(out.file_name).toBe("foo.ts");
    expect(out.diff).toEqual([]);
  });

  it("strips standard unified-diff headers", () => {
    const input = [
      "diff --git a/foo.ts b/foo.ts",
      "index 1234..5678 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,2 +1,2 @@",
      " const x = 1;",
      "-const y = 2;",
      "+const y = 3;",
    ].join("\n");
    const out = parseDiff(input, "foo.ts");
    expect(out.diff).toEqual([
      { type: "context", text: "const x = 1;" },
      { type: "remove", text: "const y = 2;" },
      { type: "add", text: "const y = 3;" },
    ]);
  });

  it("handles the \\ No newline at end of file marker", () => {
    const input = [
      " line",
      "+added",
      "\\ No newline at end of file",
    ].join("\n");
    const out = parseDiff(input, "x");
    expect(out.diff).toHaveLength(2);
    expect(out.diff[0].type).toBe("context");
    expect(out.diff[1].type).toBe("add");
  });

  it("preserves literal +/- characters inside line content", () => {
    const input = [
      "-const re = /\\d+/;",
      "+const re = /[-+]?\\d+/;",
    ].join("\n");
    const out = parseDiff(input, "regex.ts");
    expect(out.diff[0]).toEqual({ type: "remove", text: "const re = /\\d+/;" });
    expect(out.diff[1]).toEqual({ type: "add", text: "const re = /[-+]?\\d+/;" });
  });

  it("handles CR/LF line endings", () => {
    const input = " line1\r\n+added\r\n-removed\r\n";
    const out = parseDiff(input, "x");
    expect(out.diff).toEqual([
      { type: "context", text: "line1" },
      { type: "add", text: "added" },
      { type: "remove", text: "removed" },
    ]);
  });
});

describe("extractContentFromDiff", () => {
  it("reconstructs the post-change file content by dropping remove lines", () => {
    const change: FileChangeInfo = parseDiff(
      [" const a = 1;", "-const b = 2;", "+const b = 3;", " const c = 4;"].join("\n"),
      "x.ts"
    );
    expect(extractContentFromDiff(change)).toBe("const a = 1;\nconst b = 3;\nconst c = 4;");
  });
});

describe("diffStat", () => {
  it("counts add / remove / context lines", () => {
    const change = parseDiff(
      [" a", "-b", "+c", " d", "+e"].join("\n"),
      "x"
    );
    expect(diffStat(change)).toEqual({ added: 2, removed: 1, context: 2 });
  });
});
