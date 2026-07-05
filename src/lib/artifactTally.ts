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
  /**
   * Per-category file paths, populated by `buildArtifactSummary` so the
   * end-of-conversation ConversationSummary can expand a row and list
   * exactly which files were added / modified / deleted.
   */
  addedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  /**
   * Actual command strings executed during the turn. Lets the
   * "执行 N 个命令" row expand and show the real `bash`/`run` payloads
   * instead of just a count.
   */
  commandsRun: string[];
}

export const EMPTY_ARTIFACTS: ArtifactTally = {
  added: 0,
  modified: 0,
  deleted: 0,
  commands: 0,
  filesTouched: [],
  addedFiles: [],
  modifiedFiles: [],
  deletedFiles: [],
  commandsRun: [],
};

export function buildArtifactSummary(toolCalls: ToolCall[]): ArtifactTally {
  const tally: ArtifactTally = {
    ...EMPTY_ARTIFACTS,
    filesTouched: [],
    addedFiles: [],
    modifiedFiles: [],
    deletedFiles: [],
    commandsRun: [],
  };
  const seen = new Set<string>();
  for (const tc of toolCalls) {
    const name = tc.name.toLowerCase();
    const args = (tc.arguments ?? {}) as Record<string, unknown>;
    const path = (args.file_path ?? args.path) as string | undefined;
    if (name.includes("write") || name.includes("create")) {
      tally.added += 1;
      if (path && !seen.has(path)) {
        seen.add(path);
        tally.filesTouched.push(path);
        tally.addedFiles.push(path);
      }
    } else if (name.includes("edit") || name.includes("patch") || name.includes("update")) {
      tally.modified += 1;
      if (path && !seen.has(path)) {
        seen.add(path);
        tally.filesTouched.push(path);
        tally.modifiedFiles.push(path);
      }
    } else if (name.includes("delete") || name.includes("remove")) {
      tally.deleted += 1;
      if (path && !seen.has(path)) {
        seen.add(path);
        tally.filesTouched.push(path);
        tally.deletedFiles.push(path);
      }
    } else if (name.includes("bash") || name.includes("command") || name.includes("run") || name.includes("execute")) {
      tally.commands += 1;
      const cmd = (args.command ?? args.cmd) as string | undefined;
      if (cmd) {
        tally.commandsRun.push(cmd);
      }
    }
  }
  return tally;
}

export function hasAnyArtifact(t: ArtifactTally): boolean {
  return t.added + t.modified + t.deleted + t.commands > 0;
}
