/**
 * skillSuggestParser — AionUi `skillSuggestParser.ts` port tests.
 *
 * Covers:
 *  - parseSkillSuggest: well-formed SKILL.md, missing fields,
 *    template placeholders, malformed content
 *  - stripSkillSuggest: removes blocks, collapses whitespace,
 *    passes through plain text
 *  - hasSkillSuggest: cheap detection
 */

import { describe, expect, it } from "vitest";
import {
  parseSkillSuggest,
  stripSkillSuggest,
  hasSkillSuggest,
} from "@/utils/skillSuggestParser";

describe("parseSkillSuggest", () => {
  it("parses a well-formed SKILL.md block", () => {
    const text = `Here is a skill:

[SKILL_SUGGEST]
name: code-review
description: Reviews staged changes against the project style.
content:
---
name: code-review
description: Reviews staged changes against the project style.
---

# Steps
1. Run the linter
2. Diff against HEAD
[/SKILL_SUGGEST]`;
    const out = parseSkillSuggest(text);
    expect(out?.name).toBe("code-review");
    expect(out?.description).toBe(
      "Reviews staged changes against the project style.",
    );
    expect(out?.content).toContain("# Steps");
  });

  it("rejects template placeholder content (skill-name)", () => {
    const text = `[SKILL_SUGGEST]
name: skill-name
description: One-line description of what the skill does.
content:
---
name: skill-name
description: One-line description of what the skill does.

# Steps
[/SKILL_SUGGEST]`;
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it("rejects malformed blocks without YAML frontmatter", () => {
    const text = `[SKILL_SUGGEST]
name: x
content: not a real skill
[/SKILL_SUGGEST]`;
    expect(parseSkillSuggest(text)).toBeNull();
  });

  it("returns null for an absent block", () => {
    expect(parseSkillSuggest("no skill here")).toBeNull();
  });

  it("handles non-string input gracefully", () => {
    expect(parseSkillSuggest("" as unknown as string)).toBeNull();
    expect(parseSkillSuggest(null as unknown as string)).toBeNull();
  });
});

describe("stripSkillSuggest", () => {
  it("removes the [SKILL_SUGGEST] block from the content", () => {
    const text = `before\n[SKILL_SUGGEST]\nname: x\ndescription: y\ncontent:\n---\nname: x\ndescription: y\n\nbody\n[/SKILL_SUGGEST]\nafter`;
    const out = stripSkillSuggest(text);
    expect(out).not.toContain("[SKILL_SUGGEST]");
    expect(out).not.toContain("[/SKILL_SUGGEST]");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("collapses 3+ newlines down to 2", () => {
    const text = "a\n\n\n\n\nb";
    expect(stripSkillSuggest(text)).toBe("a\n\nb");
  });

  it("passes through plain text untouched", () => {
    expect(stripSkillSuggest("hello world")).toBe("hello world");
  });
});

describe("hasSkillSuggest", () => {
  it("returns true when the opening tag is present", () => {
    expect(hasSkillSuggest("foo [SKILL_SUGGEST] bar")).toBe(true);
  });
  it("returns false when the tag is absent", () => {
    expect(hasSkillSuggest("plain text")).toBe(false);
  });
});
