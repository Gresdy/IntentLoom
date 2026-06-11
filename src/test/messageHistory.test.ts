/**
 * messageHistory — AionUi `messageHistory.ts` port tests.
 *
 * Covers:
 *  - getConversationInputHistory: most-recent-first ordering,
 *    dedupe by exact content, conversation-id scoping, skips
 *    empty / non-text / non-right messages
 *  - isCaretOnFirstLine / isCaretOnLastLine: true on the
 *    matching edge, false once a newline is between caret and
 *    the edge, false on a null textarea
 */

import { describe, expect, it } from "vitest";
import {
  getConversationInputHistory,
  isCaretOnFirstLine,
  isCaretOnLastLine,
} from "@/chat/messageHistory";

describe("getConversationInputHistory", () => {
  it("returns the user's prompts most-recent first", () => {
    const out = getConversationInputHistory(
      [
        { id: "1", conversation_id: "c1", type: "text", position: "right", content: "first" },
        { id: "2", conversation_id: "c1", type: "text", position: "left", content: "a1" },
        { id: "3", conversation_id: "c1", type: "text", position: "right", content: "second" },
      ],
      "c1",
    );
    expect(out).toEqual(["second", "first"]);
  });

  it("skips messages from other conversations", () => {
    const out = getConversationInputHistory(
      [
        { id: "1", conversation_id: "other", type: "text", position: "right", content: "x" },
        { id: "2", conversation_id: "c1", type: "text", position: "right", content: "y" },
      ],
      "c1",
    );
    expect(out).toEqual(["y"]);
  });

  it("dedupes by exact content (most-recent wins)", () => {
    const out = getConversationInputHistory(
      [
        { id: "1", conversation_id: "c1", type: "text", position: "right", content: "hello" },
        { id: "2", conversation_id: "c1", type: "text", position: "right", content: "world" },
        { id: "3", conversation_id: "c1", type: "text", position: "right", content: "hello" },
      ],
      "c1",
    );
    expect(out).toEqual(["hello", "world"]);
  });

  it("skips empty / whitespace-only content", () => {
    const out = getConversationInputHistory(
      [
        { id: "1", conversation_id: "c1", type: "text", position: "right", content: "" },
        { id: "2", conversation_id: "c1", type: "text", position: "right", content: "   " },
        { id: "3", conversation_id: "c1", type: "text", position: "right", content: "kept" },
      ],
      "c1",
    );
    expect(out).toEqual(["kept"]);
  });

  it("returns an empty list when conversationId is undefined", () => {
    expect(
      getConversationInputHistory(
        [{ id: "1", type: "text", position: "right", content: "x" }],
        undefined,
      ),
    ).toEqual([]);
  });
});

describe("isCaretOnFirstLine / isCaretOnLastLine", () => {
  const make = (value: string, start: number, end: number): HTMLTextAreaElement => {
    // jsdom doesn't keep a real selectionStart / selectionEnd on
    // textareas, so we have to fake them.
    const ta = document.createElement("textarea");
    ta.value = value;
    Object.defineProperty(ta, "selectionStart", { value: start, configurable: true });
    Object.defineProperty(ta, "selectionEnd", { value: end, configurable: true });
    return ta;
  };

  it("first-line is true on a single-line textarea", () => {
    const ta = make("hello", 0, 0);
    expect(isCaretOnFirstLine(ta)).toBe(true);
    expect(isCaretOnLastLine(ta)).toBe(true);
  });

  it("first-line is true until a newline precedes the caret", () => {
    const ta = make("hello\nworld", 2, 2);
    expect(isCaretOnFirstLine(ta)).toBe(true);
    const ta2 = make("hello\nworld", 7, 7);
    expect(isCaretOnFirstLine(ta2)).toBe(false);
  });

  it("last-line is true from the position right after the last newline onward", () => {
    const ta = make("hello\nworld", 9, 9);
    expect(isCaretOnLastLine(ta)).toBe(true);
    const ta2 = make("hello\nworld", 2, 2);
    expect(isCaretOnLastLine(ta2)).toBe(false);
  });

  it("respects the selection start (collapsed or extended)", () => {
    // Use a multi-line value with a trailing newline so the
    // distinction between first-line and last-line is unambiguous:
    // a caret in the middle is on neither.
    const ta = make("a\nb\nc\n", 0, 4);
    expect(isCaretOnFirstLine(ta)).toBe(true);
    expect(isCaretOnLastLine(ta)).toBe(false);
  });

  it("returns false on a null / undefined textarea", () => {
    expect(isCaretOnFirstLine(null)).toBe(false);
    expect(isCaretOnLastLine(undefined)).toBe(false);
  });
});
