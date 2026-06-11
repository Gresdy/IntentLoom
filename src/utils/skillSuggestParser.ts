/**
 * skillSuggestParser — AionUi `skillSuggestParser.ts` port.
 *
 * Background: the Anthropic / Claude Skill format (SKILL.md) has a
 * YAML frontmatter (`name:` / `description:`) and a markdown body.
 * AionUi lets the model emit an inline `[SKILL_SUGGEST]…[/SKILL_SUGGEST]`
 * block in its streamed response; the renderer parses the block,
 * validates the content is a real SKILL.md (not the template
 * placeholder), and turns it into a `MessageSkillSuggest` card the
 * user can accept or dismiss.
 *
 * IntentLoom already has `MessageSkillSuggest.tsx` rendering the
 * `kind: "skill_suggest"` ReasonixItem. The adapter streams a
 * `skill_suggest` message when it sees a well-formed
 * `[SKILL_SUGGEST]` block in the stream. What was missing was the
 * parser itself + the tag-stripping that runs on the assistant
 * text BEFORE rendering (so the raw `[SKILL_SUGGEST]` tags never
 * appear inline in the message bubble).
 *
 * Three exports — `parseSkillSuggest` (the parser used by the
 * adapter to mint a `skill_suggest` ReasonixItem), `stripSkillSuggest`
 * (called on the assistant text in the same place `stripThinkTags`
 * already runs), and `hasSkillSuggest` (a fast `[/test]`).
 *
 * AionUi reference:
 *   src/renderer/utils/chat/skillSuggestParser.ts
 */

export interface SkillSuggestion {
  name: string;
  description: string;
  /** Full SKILL.md content (including frontmatter) */
  content: string;
}

// Placeholder patterns that indicate the AI echoed the template
// instead of generating real content. Rejecting them in the parser
// keeps a card from rendering for an obvious "skill-name" stub.
const PLACEHOLDER_NAME_PATTERNS = [/^skill-name$/i, /^your[- ]skill[- ]name/i, /^description of/i];
const PLACEHOLDER_DESC_PATTERNS = [/^one-line description/i, /^your[- ]skill[- ]name/i];
const PLACEHOLDER_BODY_PATTERNS = [
  /^\(Full SKILL\.md body/i,
  /^Full SKILL\.md body/i,
  /^\(clear instructions for executing this task/i,
  /^<Full instructions: output format, tone, sources to check/i,
];

function matchesAny(value: string, patterns: RegExp[]): boolean {
  const trimmed = value.trim();
  return patterns.some((p) => p.test(trimmed));
}

/**
 * Validate that `content` is a well-formed SKILL.md:
 * YAML frontmatter with `name:` and `description:`, and a
 * non-empty body. Rejects template placeholder content
 * (e.g. "skill-name", "One-line description").
 */
function isValidSkillContent(content: string): boolean {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n+([\s\S]*)$/);
  if (!match) return false;

  const frontmatter = match[1];
  const body = match[2]?.trim();

  const nameMatch = frontmatter.match(/^name:\s*(.+)/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)/m);

  if (!nameMatch?.[1]?.trim() || !descMatch?.[1]?.trim()) return false;
  if (!body) return false;

  // Reject template placeholders
  if (matchesAny(nameMatch[1], PLACEHOLDER_NAME_PATTERNS)) return false;
  if (matchesAny(descMatch[1], PLACEHOLDER_DESC_PATTERNS)) return false;
  if (matchesAny(body, PLACEHOLDER_BODY_PATTERNS)) return false;

  return true;
}

/**
 * Parse `[SKILL_SUGGEST]...[/SKILL_SUGGEST]` blocks from AI message
 * content. Returns the first valid match or `null`. Validates the
 * `content` field is a proper SKILL.md (not a placeholder) before
 * returning so the caller does not have to re-check.
 */
export function parseSkillSuggest(text: string): SkillSuggestion | null {
  if (!text || typeof text !== "string") return null;

  const match = text.match(/\[SKILL_SUGGEST\]\s*\n?([\s\S]*?)\[\/SKILL_SUGGEST\]/i);
  if (!match) return null;

  const body = match[1];

  const nameMatch = body.match(/^name:\s*(.+)/im);
  const descMatch = body.match(/^description:\s*(.+)/im);

  // Extract content: everything after the "content:" line.
  const contentMatch = body.match(/^content:\s*\n?([\s\S]*)/im);

  if (!nameMatch?.[1] || !contentMatch?.[1]) return null;

  const content = contentMatch[1].trim();

  // Validate the content is a well-formed SKILL.md before
  // returning — a stray "[SKILL_SUGGEST] … [/SKILL_SUGGEST]" with
  // only a placeholder name would otherwise still mint a card.
  if (!isValidSkillContent(content)) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch?.[1]?.trim() ?? nameMatch[1].trim(),
    content,
  };
}

/**
 * Strip `[SKILL_SUGGEST]…[/SKILL_SUGGEST]` blocks from content for
 * clean display. The actual card rendering goes through
 * `MessageSkillSuggest.tsx` once the adapter streams a
 * `kind: "skill_suggest"` ReasonixItem; this function is what
 * makes sure the raw block never leaks into the assistant bubble
 * inline. Mirrors `stripThinkTags` in shape so the two can be
 * composed by the adapter without ordering concerns.
 */
export function stripSkillSuggest(text: string): string {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\[SKILL_SUGGEST\][\s\S]*?\[\/SKILL_SUGGEST\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Check whether `text` contains a `[SKILL_SUGGEST]` block at all.
 * Cheap, used to gate the more expensive `parseSkillSuggest` call.
 */
export function hasSkillSuggest(text: string): boolean {
  return /\[SKILL_SUGGEST\]/i.test(text);
}
