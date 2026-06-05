// Cross-conversation `product_changes` ledger on the React side.
//
// The Rust side (see `src-tauri/src/commands/product_changes.rs`)
// stores every tool call (file edit / command) emitted by every
// conversation in a single SQLite table. This store mirrors the
// aggregate numbers the LoomPanel needs to render its "跨对话累计"
// section, and provides a `recordBatch` helper that the streaming
// controller calls on `ai-stream-end` to persist the live turn.
//
// The store is intentionally tiny: one aggregate snapshot is enough
// for the panel. LoomPanel reads it; reasonixAdapter writes through
// it; nothing else cares.

import { create } from "zustand";
import { invoke } from "./tauri";
import type { ToolCall } from "@/types/message";

export type ProductChangeKind = "added" | "modified" | "deleted" | "command";

export interface ProductChangeAggregate {
  byKind: Record<string, number>;
  byAgent: Record<string, number>;
  totalFiles: number;
  totalCommands: number;
  totalRows: number;
}

const EMPTY_AGGREGATE: ProductChangeAggregate = {
  byKind: {},
  byAgent: {},
  totalFiles: 0,
  totalCommands: 0,
  totalRows: 0,
};

interface ProductChangesState {
  aggregate: ProductChangeAggregate;
  loading: boolean;
  error: string | null;
  lastLoadedAt: number | null;

  refresh: () => Promise<void>;
  recordBatch: (
    conversationId: string,
    agentId: string,
    toolCalls: ToolCall[],
  ) => Promise<number>;
}

// Map a single ToolCall to its product-change kind. Mirrors the
// heuristic in `artifactTally.ts` so the same name → bucket mapping
// drives both surfaces. Commands are emitted with the command text
// in `summary`; file edits carry the file path in `path`.
export function classifyToolCall(
  tc: ToolCall,
): { kind: ProductChangeKind; path?: string; summary?: string } | null {
  const name = (tc.name ?? "").toLowerCase();
  const args = (tc.arguments ?? {}) as Record<string, unknown>;
  const path =
    (args.file_path as string | undefined) ??
    (args.path as string | undefined) ??
    undefined;
  if (
    name.includes("write") ||
    name.includes("create") ||
    name.includes("add")
  ) {
    return { kind: "added", path };
  }
  if (
    name.includes("edit") ||
    name.includes("patch") ||
    name.includes("update") ||
    name.includes("modify")
  ) {
    return { kind: "modified", path };
  }
  if (name.includes("delete") || name.includes("remove")) {
    return { kind: "deleted", path };
  }
  if (
    name.includes("bash") ||
    name.includes("command") ||
    name.includes("run") ||
    name.includes("execute")
  ) {
    const cmd = args.command;
    const summary = typeof cmd === "string" ? cmd : undefined;
    return { kind: "command", summary };
  }
  return null;
}

export function toolCallsToRecords(
  conversationId: string,
  agentId: string,
  toolCalls: ToolCall[],
): Array<{
  conversationId: string;
  agentId: string;
  kind: ProductChangeKind;
  path: string | null;
  summary: string | null;
}> {
  const out: Array<{
    conversationId: string;
    agentId: string;
    kind: ProductChangeKind;
    path: string | null;
    summary: string | null;
  }> = [];
  for (const tc of toolCalls) {
    const cls = classifyToolCall(tc);
    if (!cls) continue;
    out.push({
      conversationId,
      agentId,
      kind: cls.kind,
      path: cls.path ?? null,
      summary: cls.summary ?? null,
    });
  }
  return out;
}

export const useProductChangesStore = create<ProductChangesState>(
  (set, get) => ({
    aggregate: EMPTY_AGGREGATE,
    loading: false,
    error: null,
    lastLoadedAt: null,

    refresh: async () => {
      set({ loading: true, error: null });
      try {
        // The Rust side returns camelCase because the struct uses
        // `#[serde(rename_all = "camelCase")]`. We re-normalize to
        // the snake_case shape the UI renders.
        const raw = await invoke<{
          byKind: Record<string, number>;
          byAgent: Record<string, number>;
          totalFiles: number;
          totalCommands: number;
          totalRows: number;
        }>("list_product_changes_aggregate", { conversationId: null });
        set({
          aggregate: {
            byKind: raw.byKind ?? {},
            byAgent: raw.byAgent ?? {},
            totalFiles: raw.totalFiles ?? 0,
            totalCommands: raw.totalCommands ?? 0,
            totalRows: raw.totalRows ?? 0,
          },
          loading: false,
          lastLoadedAt: Date.now(),
        });
      } catch (e) {
        // Backend unreachable is the common case in vite dev (no
        // Tauri shell) and harmless — the panel just keeps the
        // previous aggregate. Demote to console.warn in dev so the
        // console isn't dominated by the same message on every mount.
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[useProductChanges] backend unreachable:", e);
        } else {
          // eslint-disable-next-line no-console
          console.error("Failed to load product_changes aggregate:", e);
        }
        set({
          loading: false,
          error: String(e),
          lastLoadedAt: Date.now(),
        });
      }
    },

    recordBatch: async (
      conversationId: string,
      agentId: string,
      toolCalls: ToolCall[],
    ) => {
      const records = toolCallsToRecords(conversationId, agentId, toolCalls);
      if (records.length === 0) return 0;
      const n = await invoke<number>("record_product_changes_batch", {
        changes: records.map((r) => [
          r.conversationId,
          r.agentId,
          r.kind,
          r.path,
          r.summary,
        ]),
      });
      // Invalidate the cached aggregate so the next render shows the
      // new numbers. We don't `await` — the IPC write is the source
      // of truth; a slightly stale aggregate for a few hundred ms is
      // fine.
      void get().refresh();
      return n;
    },
  }),
);
