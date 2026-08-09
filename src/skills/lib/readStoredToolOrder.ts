/**
 * Read a `string[]` from localStorage without throwing on
 * malformed payloads (corrupt data, schema changes, manual
 * edits). On any failure we fall back to an empty ordering
 * so the consumer still renders — the worst-case is a
 * briefly-reordered list, never a white screen.
 *
 * Used by `Sidebar.tsx` to restore the user's tool order
 * for the coding / lobster sub-views. Extracted here so the
 * behavior contract is unit-testable without rendering React.
 */
export function readStoredToolOrder(key: string): string[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // private mode / disabled storage — same outcome as
    // a missing key, no ordered list to restore.
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
  } catch {
    // fall through to the default ordering
  }
  return [];
}
