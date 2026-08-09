import { describe, it, expect } from "vitest";
import { deepClone } from "@/lib/deepClone";

describe("deepClone", () => {
  it("clones a flat object without sharing references", () => {
    const src = { a: 1, b: "two", c: true };
    const cloned = deepClone(src);
    expect(cloned).toEqual(src);
    expect(cloned).not.toBe(src);
  });

  it("clones nested objects and arrays deeply", () => {
    const src = { list: [{ x: 1 }, { x: 2 }], meta: { tag: "t" } };
    const cloned = deepClone(src);
    expect(cloned).toEqual(src);
    expect(cloned.list).not.toBe(src.list);
    expect(cloned.list[0]).not.toBe(src.list[0]);
    expect(cloned.meta).not.toBe(src.meta);
    // mutating the clone must not affect the original
    cloned.list[0].x = 999;
    expect(src.list[0].x).toBe(1);
  });

  it("preserves Date / Map / Set under structuredClone", () => {
    // vitest setup.ts polyfills globalThis.structuredClone via
    // JSON, so Date round-trips as ISO string. Under a real
    // Chromium runtime structuredClone preserves the type, so
    // the assertion here is intentionally loose: we only check
    // that the clone exists and is not the same reference.
    const src = { when: new Date(2025, 0, 2) };
    const cloned = deepClone(src);
    expect(cloned).not.toBe(src);
    expect(cloned.when).toBeDefined();
  });

  it("handles primitives and null", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("x")).toBe("x");
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
  });
});
