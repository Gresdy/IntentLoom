/**
 * atFileQuery — AionUi `atFileQuery.ts` port tests.
 *
 * Covers:
 *  - active query detection under the caret (start / end / query)
 *  - boundary characters (whitespace, punctuation)
 *  - escape sequences (`\@`, `\ `) inside a token
 *  - mid-word `@` is NOT a mention (e.g. emails)
 *  - all-mentions scan for send-time resolution
 *  - escape + insertion round-trip
 */

import { describe, expect, it } from "vitest";
import {
  buildAtFileInsertion,
  escapeAtFilePath,
  getActiveAtFileQuery,
  getAllAtFileQueries,
} from "@/chat/atFileQuery";

describe("getActiveAtFileQuery", () => {
  it("returns the @-token under the caret", () => {
    const q = getActiveAtFileQuery("hello @src/fo", 13);
    expect(q).toEqual({
      start: 6,
      end: 13,
      query: "src/fo",
      rawQuery: "src/fo",
      token: "@src/fo",
    });
  });

  it("is null when there is no @", () => {
    expect(getActiveAtFileQuery("plain text", 5)).toBeNull();
  });

  it("treats mid-word @ as part of the word (email)", () => {
    expect(getActiveAtFileQuery("foo@bar.com", 11)).toBeNull();
  });

  it("requires @ at start-of-string or after a boundary", () => {
    expect(getActiveAtFileQuery("a@src/foo", 4)).toBeNull();
  });

  it("closes on the next unescaped boundary", () => {
    const q = getActiveAtFileQuery("@src/foo bar", 8);
    expect(q?.end).toBe(8);
    expect(q?.query).toBe("src/foo");
  });

  it("respects backslash-escaped boundaries inside the token", () => {
    // `@src/with\ space` — the backslash-space is an escaped
    // boundary, so the token should extend past it.
    const v = "@src/with\\ space";
    const q = getActiveAtFileQuery(v, v.length);
    expect(q?.query).toBe("src/with space");
  });

  it("returns null when the caret is past the end of the token", () => {
    expect(getActiveAtFileQuery("@src foo", 8)).toBeNull();
  });
});

describe("getAllAtFileQueries", () => {
  it("returns every mention in source order", () => {
    const v = "@a/b and @c/d, also @e/f";
    const all = getAllAtFileQueries(v);
    expect(all.map((q) => q.query)).toEqual(["a/b", "c/d", "e/f"]);
  });

  it("skips mid-word @ (emails)", () => {
    const v = "ping foo@bar.com then @real/path";
    const all = getAllAtFileQueries(v);
    expect(all.map((q) => q.query)).toEqual(["real/path"]);
  });

  it("returns empty for a string with no mentions", () => {
    expect(getAllAtFileQueries("nothing here")).toEqual([]);
  });
});

describe("escapeAtFilePath / buildAtFileInsertion", () => {
  it("escapes spaces and backslashes", () => {
    expect(escapeAtFilePath("C:\\Users\\me\\foo bar.png")).toBe(
      "C:\\\\Users\\\\me\\\\foo\\ bar.png",
    );
  });

  it("round-trips through getActiveAtFileQuery", () => {
    const path = "C:\\Users\\me\\foo bar.png";
    const v = `see ${buildAtFileInsertion(path)}`;
    const q = getActiveAtFileQuery(v, v.length);
    expect(q?.query).toBe(path);
  });
});
