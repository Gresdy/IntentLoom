/**
 * `safeLocalStorage` — try/catch wrappers around the localStorage API.
 *
 * The platform's `localStorage.getItem` / `setItem` / `removeItem`
 * can throw in three real-world situations that bite Tauri WebView
 * users:
 *  - private / incognito mode on macOS (SecurityError)
 *  - storage quota exceeded (write only)
 *  - storage disabled by browser policy (enterprise / kiosk)
 *
 * A throw from a `useState` lazy initializer or a top-level module
 * evaluation crashes the whole app — so the read path in particular
 * must be safe. Writes are also wrapped because a write that throws
 * mid-handler (e.g. inside a drag-end callback) would surface an
 * unhandled rejection and abort the caller's optimistic UI update.
 *
 * The contract:
 *  - `getItem` returns `null` on miss OR on any failure (matches
 *    the platform behaviour for a missing key, so callers can write
 *    the obvious `getItem(k) ?? default` without distinguishing
 *    "missing" from "broken").
 *  - `setItem` and `removeItem` are best-effort; they return
 *    `true` on success, `false` on failure, and never throw.
 *
 * No `JSON.parse` / `JSON.stringify` is performed here — those are
 * the caller's concern (see `readStoredToolOrder.ts` for the
 * array-shaped helper used by the Skills Sidebar).
 */
function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function safeStorageGet(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded / SecurityError / disabled storage.
    return false;
  }
}

export function safeStorageRemove(key: string): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
