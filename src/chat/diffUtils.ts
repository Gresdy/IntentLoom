/**
 * diffUtils — AionUi `diffUtils.parseDiff` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/utils/file/diffUtils.ts
 *
 * A small, dependency-free parser for unified-diff text. AionUi
 * keeps a custom parser in this file (rather than reaching for the
 * `diff` npm package) because every diff the chat renders comes
 * from one of three shapes:
 *   - A self-contained `WriteFile.result_display.file_diff` payload
 *     the gateway already serialized for us (full diff).
 *   - A `replace` / `Edit` tool's `old_string` / `new_string`
 *     (we generate the unified diff via `createTwoFilesPatch`).
 *   - A user-pasted diff for "show me the change inline".
 *
 * The parser only needs to handle the common subset: lines
 * starting with `+` / `-` / ` ` (no hunk headers, no file headers
 * required). It's strict on shape so the renderer never has to
 * defend against malformed input beyond showing the raw text in a
 * <pre>.
 *
 * The shape returned (`FileChangeInfo`) matches AionUi's, so
 * `FileChangesPanel` (used in AionUi's `MessageFileChanges` /
 * `MessageToolGroup`) and the IntentLoom `FileChangePreview` can
 * both consume it without an adapter.
 */

export type DiffLineType = "add" | "remove" | "context";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface FileChangeInfo {
  file_name: string;
  /** The path as it appeared in the diff, before trimming. */
  fullPath: string;
  diff: DiffLine[];
}

/** Heuristic: is this line a diff hunk header / file header? We use
 *  this to skip the noise that `git diff` (and `createTwoFilesPatch`)
 *  prepend to a unified diff. */
const isHeaderLine = (line: string): boolean => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  // `--- a/foo.ts`, `+++ b/foo.ts`, `@@ -1,3 +1,3 @@`, `diff --git ...`,
  // `index abc..def 100644`
  if (trimmed.startsWith("--- ") || trimmed.startsWith("+++ ")) return true;
  if (trimmed.startsWith("@@")) return true;
  if (trimmed.startsWith("diff --git ")) return true;
  if (trimmed.startsWith("index ")) return true;
  if (trimmed.startsWith("new file mode ")) return true;
  if (trimmed.startsWith("deleted file mode ")) return true;
  if (trimmed.startsWith("rename from ")) return true;
  if (trimmed.startsWith("rename to ")) return true;
  if (trimmed.startsWith("copy from ")) return true;
  if (trimmed.startsWith("copy to ")) return true;
  if (trimmed.startsWith("similarity index ")) return true;
  if (trimmed.startsWith("dissimilarity index ")) return true;
  if (trimmed.startsWith("Binary files ") && trimmed.endsWith(" differ")) return true;
  return false;
};

/** Parse a unified-diff text into structured `DiffLine[]`. Lines
 *  that look like headers or `No newline at end of file` markers
 *  are dropped — the renderer does not display them, and including
 *  them would inflate the add/remove counters. */
export function parseDiff(rawDiff: string, fileName: string): FileChangeInfo {
  const lines = (rawDiff ?? "").split(/\r?\n/);
  const diff: DiffLine[] = [];

  for (const line of lines) {
    if (isHeaderLine(line)) continue;
    if (line === "\\ No newline at end of file") continue;

    // A leading "+" or "-" marks add / remove; everything else is
    // context. A literal "+" or "-" at the start of a real line
    // (e.g. `+const a = "+1";`) is unambiguous because the
    // unified-diff format requires the leading marker to be the
    // very first character.
    const first = line[0];
    if (first === "+") {
      diff.push({ type: "add", text: line.slice(1) });
    } else if (first === "-") {
      diff.push({ type: "remove", text: line.slice(1) });
    } else {
      // Treat as context. If the line is empty or just whitespace,
      // we still record it as a context line so the diff preserves
      // its shape; the renderer can decide to skip it.
      diff.push({ type: "context", text: first === " " ? line.slice(1) : line });
    }
  }

  return {
    file_name: fileName,
    fullPath: fileName,
    diff,
  };
}

/** Reconstruct the post-change file content from a `FileChangeInfo`.
 *  Context + add lines are kept in order; remove lines are dropped.
 *  This is what AionUi feeds back into the file preview when the
 *  user wants to edit a generated file — the "current contents" is
 *  the diff with the `-` lines removed. */
export function extractContentFromDiff(change: FileChangeInfo): string {
  return change.diff
    .filter((line) => line.type !== "remove")
    .map((line) => line.text)
    .join("\n");
}

/** Counts of added / removed lines. Cheap O(diff.length) reducer. */
export interface DiffStat {
  added: number;
  removed: number;
  context: number;
}

export function diffStat(change: FileChangeInfo): DiffStat {
  let added = 0;
  let removed = 0;
  let context = 0;
  for (const line of change.diff) {
    if (line.type === "add") added += 1;
    else if (line.type === "remove") removed += 1;
    else context += 1;
  }
  return { added, removed, context };
}
