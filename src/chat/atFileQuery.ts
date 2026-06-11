/**
 * atFileQuery — AionUi `atFileQuery.ts` port.
 *
 * AionUi's `@`-mention file picker uses a small but careful parser
 * to detect the *active* `@path` token under the user's caret
 * without false-positives on stray `@`s in code blocks or inside
 * email addresses. The rules:
 *   - `@` starts a token only when it is at the start of the
 *     string or preceded by a boundary character (whitespace,
 *     punctuation, …). An `@` mid-word is part of that word
 *     (e.g. an email `foo@bar.com` is NOT a mention).
 *   - A backslash-escaped boundary character inside the token
 *     does NOT terminate the token. The escape is consumed
 *     (`\\@` → `@`, `\\ ` → ` `) so the inserted path is clean.
 *   - The token ends at the next unescaped boundary character
 *     (or end of input).
 *
 * The composer previously used a simple substring check on the
 * workspace file list — good enough for the @-menu dropdown but
 * wrong for the "is the caret currently inside an active @-token?"
 * question that drives the open/close state of the menu. This
 * module is the source of truth for both.
 *
 * Exports:
 *   - `getActiveAtFileQuery(value, caretPosition)` — the token
 *     under the caret, or `null` if the caret is not inside one.
 *   - `getAllAtFileQueries(value)` — every token in the value.
 *     Useful for "send" time, where we want to resolve every
 *     mention to its file path before handing the prompt to the
 *     CLI.
 *   - `escapeAtFilePath(path)` — inverse: produce a safe token
 *     string from a workspace path so a path with a space or
 *     backslash is round-trippable.
 *   - `buildAtFileInsertion(path)` — `@<escaped path>`, ready
 *     to splice into the textarea at the caret.
 *
 * AionUi reference:
 *   src/renderer/utils/chat/atFileQuery.ts
 */

/**
 * Boundary characters that mark the start / end of an `@`-token.
 * Matches AionUi's regex (whitespace + the common punctuation that
 * is also a Unicode word boundary in practice).
 */
const AT_FILE_BOUNDARY_RE = /[\s,;!?()[\]{}]/;

export interface ActiveAtFileQuery {
  /** Index of the `@` character (inclusive). */
  start: number;
  /** Index of the character *after* the token's last byte. */
  end: number;
  /** The unescaped query (so the file menu can filter on it). */
  query: string;
  /** The raw query text, with escape sequences intact. */
  rawQuery: string;
  /** The full token, including the leading `@`. */
  token: string;
}

function isBoundaryChar(char: string): boolean {
  return AT_FILE_BOUNDARY_RE.test(char);
}

/**
 * True iff the character at `index` in `value` is escaped by an
 * odd number of backslashes (so `\@` is escaped, `\\@` is not).
 */
function isEscaped(value: string, index: number): boolean {
  let backslashCount = 0;
  let cursor = index - 1;
  while (cursor >= 0 && value[cursor] === "\\") {
    backslashCount += 1;
    cursor -= 1;
  }
  return backslashCount % 2 === 1;
}

function unescapeAtFileQuery(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

/**
 * Escape every character in `path` that the parser treats as a
 * boundary, so a path like `C:\Users\me\foo bar.png` survives a
 * round-trip through the textarea intact.
 */
export function escapeAtFilePath(path: string): string {
  return path.replace(/([\\\s,;!?()[\]{}])/g, "\\$1");
}

/**
 * Build the @-token that the composer should splice into the
 * textarea when the user picks a file from the menu.
 */
export function buildAtFileInsertion(path: string): string {
  return `@${escapeAtFilePath(path)}`;
}

/**
 * The `@`-mention under the caret, or `null` when the caret is
 * not inside one. The result is `null` when:
 *   - the caret is on a boundary character that just closed a
 *     token (e.g. the user just typed a space)
 *   - the `@` under the caret is escaped
 *   - the `@` is mid-word (e.g. an email address)
 *   - the caret is outside any `@` token entirely
 */
export function getActiveAtFileQuery(
  value: string,
  caretPosition: number,
): ActiveAtFileQuery | null {
  if (!value) return null;

  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  let atIndex = -1;

  for (let index = safeCaret - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === "@" && !isEscaped(value, index)) {
      const previousChar = index > 0 ? value[index - 1] : "";
      if (!previousChar || isBoundaryChar(previousChar)) {
        atIndex = index;
        break;
      }
    }
    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      return null;
    }
  }

  if (atIndex === -1) return null;

  let tokenEnd = value.length;
  for (let index = atIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (isBoundaryChar(char) && !isEscaped(value, index)) {
      tokenEnd = index;
      break;
    }
  }

  if (safeCaret < atIndex || safeCaret > tokenEnd) {
    return null;
  }

  const rawQuery = value.slice(atIndex + 1, tokenEnd);
  return {
    start: atIndex,
    end: tokenEnd,
    query: unescapeAtFileQuery(rawQuery),
    rawQuery,
    token: value.slice(atIndex, tokenEnd),
  };
}

/**
 * Every `@`-mention in `value`, in source order. Used at send
 * time to resolve mentions to file paths. The simple substring
 * check the composer used to do missed escaped mentions and
 * mid-word `@`s; this parser agrees with `getActiveAtFileQuery`
 * on what counts as a real mention.
 */
export function getAllAtFileQueries(value: string): ActiveAtFileQuery[] {
  if (!value) return [];
  const queries: ActiveAtFileQuery[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "@" || isEscaped(value, index)) continue;

    const previousChar = index > 0 ? value[index - 1] : "";
    if (previousChar && !isBoundaryChar(previousChar)) continue;

    let tokenEnd = value.length;
    for (let cursor = index + 1; cursor < value.length; cursor += 1) {
      const nextChar = value[cursor];
      if (isBoundaryChar(nextChar) && !isEscaped(value, cursor)) {
        tokenEnd = cursor;
        break;
      }
    }

    const rawQuery = value.slice(index + 1, tokenEnd);
    queries.push({
      start: index,
      end: tokenEnd,
      query: unescapeAtFileQuery(rawQuery),
      rawQuery,
      token: value.slice(index, tokenEnd),
    });

    index = tokenEnd - 1;
  }
  return queries;
}
