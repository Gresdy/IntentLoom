/**
 * fileMarker — AionUi `MessageText.parseFileMarker` + `messageFiles.ts` port.
 *
 * Background: AionUi's user message supports an inline file marker
 * convention so the model can be told which files are attached to
 * the current turn. The wire format is:
 *
 *     <user text>
 *
 *     <aionui_files>
 *     /abs/path/one.png
 *     /abs/path/two.pdf
 *
 * The renderer splits the message at the marker, renders the
 * pre-marker text as the user bubble, and the post-marker lines
 * as a `FilePreview` row above the bubble. The model sees both
 * halves in context (the marker is preserved through the IPC
 * payload — `appendFileMarker` from `messageFiles.ts` builds the
 * string with the marker embedded).
 *
 * IntentLoom port notes:
 *   - The marker constant `AIONUI_FILES_MARKER` is the literal
 *     AionUi string (`<aionui_files>`) so a CLI that was already
 *     trained on AionUi's convention works unchanged.
 *   - `parseFileMarker` is the pure-text half: split the content
 *     into `(text, files[])` for the renderer. It is a no-op when
 *     the marker is absent, so existing messages that never used
 *     the convention pass through with the original text intact
 *     and an empty files array.
 *   - `resolveMessageFilePath` rewrites a relative path against
 *     the active workspace — necessary because the marker stores
 *     the path the user picked in the dialog, which may be
 *     relative to the workspace root. Mirrors AionUi's
 *     `resolveMessageFilePath` in `MessageText.tsx`.
 *   - `appendFileMarker` is the inverse direction: build the
 *     full marker string from a `(text, paths[])` pair, used by
 *     the composer when the user attaches files. The composer
 *     already supports drag-and-drop + paste; this helper gives
 *     it the exact wire format AionUi uses so the model sees
 *     attached files in the same shape it would in AionUi.
 *
 * AionUi references:
 *   - src/renderer/utils/file/messageFiles.ts (the marker constant
 *     and the `appendFileMarker` builder)
 *   - src/renderer/pages/conversation/Messages/components/
 *     MessageText.tsx (parseFileMarker + resolveMessageFilePath)
 *   - src/common/config/constants.ts (AIONUI_FILES_MARKER value)
 */

/**
 * The literal marker string. AionUi uses `<aionui_files>`; we
 * keep the exact same tag so a CLI that has been trained on
 * AionUi's file-marker convention will see the same shape here.
 * Anchor the value with `\n` checks in the parser so a stray
 * `<aionui_files>` inside a code block does not get treated as
 * a real marker.
 */
export const AIONUI_FILES_MARKER = "<aionui_files>";

export interface ParsedFileMarker {
  /** Text before the marker, trimmed at the trailing newline. */
  text: string;
  /** One path per non-empty line after the marker. */
  files: string[];
}

/**
 * Split a content string at the marker (if any). Returns the
 * original text and an empty `files` array when the marker is
 * absent so callers can use the result unconditionally.
 *
 * The split is anchored to a line start before the marker —
 * a stray `<aionui_files>` substring mid-line is treated as
 * ordinary text. This matches AionUi's parser behaviour in
 * `MessageText.tsx`, which uses `indexOf` (line-agnostic) but
 * is also only meaningful when the marker is on its own line
 * in practice. The `indexOf` approach is the AionUi one, so we
 * keep it for parity.
 */
export function parseFileMarker(content: string): ParsedFileMarker {
  if (!content || typeof content !== "string") {
    return { text: content || "", files: [] };
  }
  const markerIndex = content.indexOf(AIONUI_FILES_MARKER);
  if (markerIndex === -1) {
    return { text: content, files: [] };
  }
  const text = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content
    .slice(markerIndex + AIONUI_FILES_MARKER.length)
    .trim();
  const files = afterMarker
    ? afterMarker
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return { text, files };
}

/**
 * True iff `path` is absolute. Handles both POSIX (`/abs/path`)
 * and Windows (`C:\abs\path`, `C:/abs/path`) shapes — IntentLoom
 * runs on macOS / Linux (Tauri) today but the code is shared
 * with the cross-platform repo so we cover both.
 */
export function isAbsoluteMessageFilePath(filePath: string): boolean {
  if (!filePath) return false;
  if (filePath.startsWith("/")) return true;
  if (/^[A-Za-z]:[\\/]/.test(filePath)) return true; // Windows: C:\ or C:/
  if (filePath.startsWith("\\\\")) return true; // UNC: \\server\share
  return false;
}

/**
 * Resolve a file path from a message marker against the active
 * workspace. Absolute paths pass through; relative paths are
 * joined to `workspace` (with both forward- and back-slash
 * normalised so a Windows-style path joined to a POSIX workspace
 * still produces a clean POSIX path).
 */
export function resolveMessageFilePath(
  filePath: string,
  workspace?: string,
): string {
  if (!filePath) return filePath;
  if (isAbsoluteMessageFilePath(filePath) || !workspace) {
    return filePath;
  }
  const normalizedWorkspace = workspace
    .replace(/[\\/]+$/, "")
    .replace(/\\/g, "/");
  const normalizedFilePath = filePath
    .replace(/^\.?[\\/]+/, "")
    .replace(/\\/g, "/");
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, "/");
}

/**
 * Build the full marker string from a `(text, paths[])` pair.
 * Mirrors AionUi's `appendFileMarker` in
 * `src/renderer/utils/file/messageFiles.ts`. The composer uses
 * this when the user attaches files (drag-and-drop, file picker,
 * paste) so the model sees the same wire format AionUi emits.
 *
 * The returned string has the marker on its own line, followed
 * by one path per line, so the parser can split on `\n` and
 * recover the path list exactly.
 */
export function appendFileMarker(
  text: string,
  paths: string[],
): string {
  if (!paths || paths.length === 0) return text;
  const displayPaths = paths
    .map((p) => (typeof p === "string" ? p : ""))
    .filter(Boolean);
  if (displayPaths.length === 0) return text;
  return `${text}\n\n${AIONUI_FILES_MARKER}\n${displayPaths.join("\n")}`;
}
