/**
 * `deepClone` — single allocation, structuredClone-backed clone
 * helper.
 *
 * Behavior contract (pinned by `src/test/deepClone.test.ts`):
 *  - Returns a new top-level reference (clones are not the same
 *    `===` identity as the input).
 *  - Nested objects / arrays are cloned recursively — mutating
 *    the clone must not affect the source.
 *  - Primitives / null / undefined pass through unchanged.
 *  - Under Chromium / Node 17+ uses `globalThis.structuredClone`,
 *    which preserves `Date` / `Map` / `Set` / `RegExp` / typed
 *    arrays without losing type fidelity. Falls back to the
 *    JSON round-trip only if the platform does not provide
 *    `structuredClone` (jsdom does once `src/test/setup.ts`
 *    polyfills it).
 */
export function deepClone<T>(value: T): T {
  const clone = (globalThis as { structuredClone?: <T>(v: T) => T })
    .structuredClone;
  if (typeof clone === "function") {
    return clone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
