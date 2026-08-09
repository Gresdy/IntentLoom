import { describe, it, expect, beforeEach } from "vitest";
import { readStoredToolOrder } from "./readStoredToolOrder";

// readStoredToolOrder is the resilience layer between
// Sidebar's useEffect and whatever junk lives in
// localStorage. The contract it has to hold:
//  - missing key    -> []
//  - valid array    -> string[]
//  - malformed JSON -> []  (NOT throw)
//  - non-array JSON -> []  (NOT throw)
//  - mixed array    -> only the strings
//  - storage throw  -> []  (private mode, etc.)
//
// Pinned by these tests so a regression breaks the
// Sidebar render path immediately, not in production.

beforeEach(() => {
  window.localStorage.clear();
});

describe("readStoredToolOrder", () => {
  it("returns [] when the key is missing", () => {
    expect(readStoredToolOrder("nope")).toEqual([]);
  });

  it("returns the string array when the payload is valid", () => {
    window.localStorage.setItem(
      "tools",
      JSON.stringify(["claude", "codex", "gemini"]),
    );
    expect(readStoredToolOrder("tools")).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
  });

  it("swallows malformed JSON and returns []", () => {
    window.localStorage.setItem("tools", "{not really json");
    expect(readStoredToolOrder("tools")).toEqual([]);
  });

  it("rejects non-array payloads (object) and returns []", () => {
    window.localStorage.setItem("tools", JSON.stringify({ a: 1 }));
    expect(readStoredToolOrder("tools")).toEqual([]);
  });

  it("keeps only the string entries of a mixed array", () => {
    window.localStorage.setItem(
      "tools",
      JSON.stringify(["claude", 42, null, "codex", { a: 1 }]),
    );
    expect(readStoredToolOrder("tools")).toEqual(["claude", "codex"]);
  });

  it("returns [] when localStorage itself throws", () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error("SecurityError: storage disabled");
    };
    try {
      expect(readStoredToolOrder("tools")).toEqual([]);
    } finally {
      window.localStorage.getItem = original;
    }
  });
});
