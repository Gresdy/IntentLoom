// Shared tally helper for both the live LoomPanel and the end-of-
// conversation ConversationSummary card. Keeping it in one place
// guarantees both surfaces agree on what counts as a "file edit".

import type { ToolCall } from "@/types/message";

export interface ArtifactTally {
  added: number;
  modified: number;
  deleted: number;
  commands: number;
  filesTouched: string[];
}

export const EMPTY_ARTIFACTS: ArtifactTally = {
  added: 0,
  modified: 0,
  deleted: 0,
  commands: 0,
  filesTouched: [],
};

export function buildArtifactSummary(toolCalls: ToolCall[]): ArtifactTally {
  const tally: ArtifactTally = { ...EMPTY_ARTIFACTS, filesTouched: [] };
  const seen = new Set<string>();
  for (const tc of toolCalls) {
    const name = tc.name.toLowerCase();
    const args = (tc.arguments ?? {}) as Record<string, unknown>;
    if (name.includes("write") || name.includes("create")) {
      tally.added += 1;
      const path = (args.file_path ?? args.path) as string | undefined;
      if (path && !seen.has(path)) {
        seen.add(path);
        tally.filesTouched.push(path);
      }
    } else if (name.includes("edit") || name.includes("patch") || name.includes("update")) {
      tally.modified += 1;
      const path = (args.file_path ?? args.path) as string | undefined;
      if (path && !seen.has(path)) {
        seen.add(path);
        tally.filesTouched.push(path);
      }
    } else if (name.includes("delete") || name.includes("remove")) {
      tally.deleted += 1;
    } else if (name.includes("bash") || name.includes("command") || name.includes("run") || name.includes("execute")) {
      tally.commands += 1;
    }
  }
  return tally;
}

export function hasAnyArtifact(t: ArtifactTally): boolean {
  return t.added + t.modified + t.deleted + t.commands > 0;
}
