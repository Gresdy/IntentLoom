/**
 * conversationExport — AionUi `conversationExport.ts` port tests.
 *
 * Covers:
 *  - sanitizeFileName: invalid chars, empty, length cap
 *  - formatTimestamp: YYYYMMDD-HHMMSS shape
 *  - joinFilePath: POSIX + Windows separators
 *  - readMessageContent: string + object + unknown shapes
 *  - getMessageRoleKey: right/left/center
 *  - buildConversationExportText: includes the header lines,
 *    skips non-shareable messages, includes the noMessages hint
 *    when the list is empty
 *  - getDefaultExportFileName: derives a date-stamped file name
 *    from a conversation name + short id
 */

import { describe, expect, it } from "vitest";
import {
  buildConversationExportText,
  DEFAULT_EXPORT_LABELS_ZH,
  formatTimestamp,
  getDefaultExportFileName,
  getMessageRoleKey,
  joinFilePath,
  readMessageContent,
  sanitizeFileName,
} from "@/chat/conversationExport";

describe("sanitizeFileName", () => {
  it("replaces illegal chars with _", () => {
    expect(sanitizeFileName("hello/world?")).toBe("hello_world_");
  });
  it("falls back to 'conversation' on empty", () => {
    expect(sanitizeFileName("   ")).toBe("conversation");
  });
  it("clips to 80 chars", () => {
    expect(sanitizeFileName("a".repeat(120)).length).toBe(80);
  });
});

describe("formatTimestamp", () => {
  it("returns YYYYMMDD-HHMMSS", () => {
    // 2024-03-14 09:08:07 local
    const t = new Date(2024, 2, 14, 9, 8, 7).getTime();
    const out = formatTimestamp(t);
    expect(out).toMatch(/^20240314-090807$/);
  });
});

describe("joinFilePath", () => {
  it("joins POSIX paths with /", () => {
    expect(joinFilePath("/tmp", "foo.md")).toBe("/tmp/foo.md");
  });
  it("joins Windows paths with \\", () => {
    expect(joinFilePath("C:\\tmp", "foo.md")).toBe("C:\\tmp\\foo.md");
  });
  it("does not double the separator when the dir already ends in /", () => {
    expect(joinFilePath("/tmp/", "foo.md")).toBe("/tmp/foo.md");
  });
});

describe("readMessageContent", () => {
  it("returns string content as-is", () => {
    expect(readMessageContent({ type: "x", position: "right", content: "hi" })).toBe("hi");
  });
  it("unwraps object content", () => {
    expect(
      readMessageContent({
        type: "x",
        position: "right",
        content: { content: "hi" },
      }),
    ).toBe("hi");
  });
  it("JSON-stringifies unknown shapes", () => {
    expect(
      readMessageContent({
        type: "x",
        position: "right",
        content: { foo: 1 },
      }),
    ).toBe('{\n  "foo": 1\n}');
  });
});

describe("getMessageRoleKey", () => {
  it("maps position to role", () => {
    expect(getMessageRoleKey({ type: "x", position: "right" })).toBe("user");
    expect(getMessageRoleKey({ type: "x", position: "left" })).toBe("assistant");
    expect(getMessageRoleKey({ type: "x", position: "center" })).toBe("system");
  });
});

describe("buildConversationExportText", () => {
  const labels = DEFAULT_EXPORT_LABELS_ZH;
  it("includes the header + every shareable message in order", () => {
    const body = buildConversationExportText(
      { id: "c-1234567890", name: "我的研究", type: "chat" },
      [
        { type: "text", position: "right", content: "user1" },
        { type: "text", position: "left", content: "assistant1" },
        { type: "tool_call", position: "left", content: "tool detail" },
        { type: "tips", position: "center", content: "notice" },
      ],
      labels,
    );
    expect(body).toContain("会话: 我的研究");
    expect(body).toContain("会话ID: c-1234567890");
    expect(body).toContain("user:");
    expect(body).toContain("user1");
    expect(body).toContain("assistant:");
    expect(body).toContain("assistant1");
    // tool_call is dropped from the export.
    expect(body).not.toContain("tool detail");
    // tips is exported but typed as `system` (center).
    expect(body).toContain("system:");
    expect(body).toContain("notice");
  });
  it("renders the noMessages hint when the list has no shareable items", () => {
    const body = buildConversationExportText(
      { id: "x", name: "x" },
      [{ type: "tool_call", position: "left", content: "ignored" }],
      labels,
    );
    expect(body).toContain("（无可导出的消息）");
  });
});

describe("getDefaultExportFileName", () => {
  it("derives a date-stamped file name from the conversation name", () => {
    const out = getDefaultExportFileName(
      { id: "x", name: "我的研究" },
      new Date(2024, 0, 2).getTime(),
    );
    // 2024-01-02 in the local zone, segments joined with `-`.
    expect(out).toMatch(/^[\p{L}\p{N}]+_2024-01-02\.md$/u);
  });
  it("falls back to the short conversation id when no name is set", () => {
    const out = getDefaultExportFileName({ id: "abcdef123456" }, new Date(2024, 0, 2).getTime());
    expect(out).toMatch(/^abcdef12_2024-01-02\.md$/);
  });
});
