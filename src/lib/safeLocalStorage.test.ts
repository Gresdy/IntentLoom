import { describe, it, expect, beforeEach } from "vitest";
import {
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
} from "./safeLocalStorage";

// The contract:
//  - getItem on a missing key            -> null
//  - getItem on a present key            -> the stored string
//  - getItem with storage throwing       -> null (no throw)
//  - setItem                             -> returns true on success
//  - setItem with storage throwing       -> returns false (no throw)
//  - removeItem                          -> returns true on success
//  - removeItem with storage throwing    -> returns false (no throw)
//
// Pinned so a regression in the wrappers can never crash the app's
// `useState` lazy initializers again.
//
// Note: jsdom's localStorage methods live on `Storage.prototype`,
// not on the per-instance object, so we have to override the
// prototype methods. Assigning to `window.localStorage.setItem`
// does not change the implementation the wrapper actually calls.
// `vi.spyOn(..., 'method').mockImplementation(...)` is tempting
// but vitest's spy reports the wrapped throw back to the test as
// a failure even when the wrapper catches it, so we restore the
// original method ourselves in a try/finally.

beforeEach(() => {
  window.localStorage.clear();
});

function stubStorageMethod<T extends "getItem" | "setItem" | "removeItem">(
  method: T,
  replacement: () => unknown,
) {
  const original = Storage.prototype[method];
  // vi.spyOn(Storage.prototype, method).mockImplementation can also
  // be used; we use direct assignment for the reason explained
  // above. configureable:true so we can delete the property in
  // the restore step.
  Object.defineProperty(Storage.prototype, method, {
    value: replacement,
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(Storage.prototype, method, {
      value: original,
      configurable: true,
      writable: true,
    });
  };
}

describe("safeLocalStorage", () => {
  describe("getItem", () => {
    it("returns null for a missing key", () => {
      expect(safeStorageGet("nope")).toBeNull();
    });
    it("returns the stored value for a present key", () => {
      window.localStorage.setItem("k", "v");
      expect(safeStorageGet("k")).toBe("v");
    });
    it("returns null when the underlying getItem throws", () => {
      const restore = stubStorageMethod("getItem", () => {
        throw new Error("SecurityError");
      });
      try {
        expect(safeStorageGet("k")).toBeNull();
      } finally {
        restore();
      }
    });
  });

  describe("setItem", () => {
    it("writes the value and returns true", () => {
      expect(safeStorageSet("k", "v")).toBe(true);
      expect(window.localStorage.getItem("k")).toBe("v");
    });
    it("returns false (no throw) when the underlying setItem throws", () => {
      const restore = stubStorageMethod("setItem", () => {
        throw new Error("QuotaExceeded");
      });
      try {
        expect(safeStorageSet("k", "v")).toBe(false);
      } finally {
        restore();
      }
    });
  });

  describe("removeItem", () => {
    it("removes the key and returns true", () => {
      window.localStorage.setItem("k", "v");
      expect(safeStorageRemove("k")).toBe(true);
      expect(window.localStorage.getItem("k")).toBeNull();
    });
    it("returns false (no throw) when the underlying removeItem throws", () => {
      const restore = stubStorageMethod("removeItem", () => {
        throw new Error("disabled");
      });
      try {
        expect(safeStorageRemove("k")).toBe(false);
      } finally {
        restore();
      }
    });
  });
});
