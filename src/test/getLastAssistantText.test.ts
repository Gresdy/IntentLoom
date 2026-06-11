/**
 * getLastAssistantText — AionUi `getLastAssistantText.ts` port tests.
 *
 * Covers:
 *  - returns null while loading
 *  - returns null on an empty list
 *  - returns the most recent non-empty, non-streaming assistant
 *    text
 *  - strips <thinking> and [SKILL_SUGGEST] tags from the result
 *  - ignores user text, system text, hidden messages, and
 *    non-text kinds
 *  - collapses 3+ newlines down to 2
 */

import { describe, expect, it } from "vitest";
import { getLastAssistantText } from "@/chat/getLastAssistantText";

describe("getLastAssistantText", () => {
  it("returns null while loading", () => {
    expect(
      getLastAssistantText(
        [{ type: "text", position: "left", content: "hi" }],
        true,
      ),
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(getLastAssistantText([], false)).toBeNull();
  });

  it("returns the most recent non-empty assistant text", () => {
    const out = getLastAssistantText(
      [
        { type: "text", position: "right", content: "user1" },
        { type: "text", position: "left", content: "first assistant" },
        { type: "text", position: "right", content: "user2" },
        { type: "text", position: "left", content: "second assistant" },
      ],
      false,
    );
    expect(out).toBe("second assistant");
  });

  it("strips <thinking> blocks", () => {
    const out = getLastAssistantText(
      [
        {
          type: "text",
          position: "left",
          content: "<thinking>reasoning</thinking> final answer",
        },
      ],
      false,
    );
    expect(out).toBe("final answer");
  });

  it("strips [SKILL_SUGGEST] blocks", () => {
    const out = getLastAssistantText(
      [
        {
          type: "text",
          position: "left",
          content:
            "summary[SKILL_SUGGEST]\nname: x\ndescription: y\ncontent:\n---\nname: x\ndescription: y\n---\n\nbody\n[/SKILL_SUGGEST]more",
        },
      ],
      false,
    );
    expect(out).toBe("summarymore");
  });

  it("collapses 3+ newlines down to 2", () => {
    const out = getLastAssistantText(
      [{ type: "text", position: "left", content: "a\n\n\n\nb" }],
      false,
    );
    expect(out).toBe("a\n\nb");
  });

  it("ignores user / system / hidden / non-text messages", () => {
    const out = getLastAssistantText(
      [
        { type: "text", position: "right", content: "user text" },
        { type: "text", position: "center", content: "system text" },
        { type: "text", position: "left", content: "hidden", hidden: true },
        { type: "tool_call", position: "left", content: "tool" },
        { type: "text", position: "left", content: "" },
        { type: "text", position: "left", content: "   " },
      ],
      false,
    );
    expect(out).toBeNull();
  });

  it("reads content out of an object { content } shape", () => {
    const out = getLastAssistantText(
      [
        {
          type: "text",
          position: "left",
          content: { content: "wrapped" },
        },
      ],
      false,
    );
    expect(out).toBe("wrapped");
  });
});
