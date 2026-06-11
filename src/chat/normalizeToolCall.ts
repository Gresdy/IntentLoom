/**
 * normalizeToolCall — AionUi `normalizeToolCall` port, adapted to
 * IntentLoom's `ReasonixItem` shape.
 *
 * Originally from
 *   packages/desktop/src/common/chat/normalizeToolCall.ts
 *
 * AionUi has three tool-related message shapes (`IMessageToolGroup`,
 * `IMessageToolCall`, `IMessageAcpToolCall`) because its renderer
 * consumes messages from many different CLIs (Claude, Codex, Qwen, ...)
 * via ACP. IntentLoom has a single `ReasonixItem { kind: "tool" }` with
 * a flat shape, but the *consumer components* still benefit from a
 * shared `NormalizedToolCall` view because:
 *
 *   - The same row needs to render in `ToolGroupSummary` (compact list),
 *     `ToolGroupCard` (detailed), and the standalone `ToolCard` (per-item
 *     inline).
 *   - Each of those three currently re-derives the same human-readable
 *     subject (file path / command / search pattern) and the same status
 *     → badge mapping. The three derivations have already drifted once
 *     and will drift again.
 *
 * The shape returned here is the AionUi one, with one IntentLoom
 * addition: `agentId` is plumbed through so the consumer can render the
 * `AgentBadge` without re-reading the source item.
 *
 * This file is the single source of truth for "how does a tool call
 * look to the UI?". Adding a new field (e.g. a permission prompt) is
 * a one-file change instead of a three-file change.
 */

import type { ReasonixItem } from "@/lib/reasonixAdapter";

export type NormalizedToolStatus = "pending" | "running" | "completed" | "error" | "canceled";

export interface NormalizedToolCall {
  /** Stable key. For `tool` items, this is `item.id`; for `tool_group` it's `${id}.${index}`. */
  key: string;
  /** Human-readable name shown in the badge. e.g. "Read", "Edit", "Bash". */
  name: string;
  /** Lifecycle status. */
  status: NormalizedToolStatus;
  /** Short description shown next to the name — file path, command, search query, ... */
  description?: string;
  /** Pre-formatted input payload (JSON or string). May be undefined for tools with no args. */
  input?: string;
  /** Pre-formatted output payload. May be undefined until the tool finishes. */
  output?: string;
  /** If the source was a WriteFile-style item with a parsed diff, the original source item. */
  source?: ReasonixItem;
  /** Agent (CLI) that produced this tool call. Used by the consumer to pick a color. */
  agentId?: string;
  /** Whether the source item is a multi-tool container. */
  isGroup?: boolean;
}

const formatValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/** Map a `tool.status` value to the normalized status. Mirrors AionUi's
 *  `normalizeToolGroupStatus` + `normalizeToolCallStatus` + `normalizeAcpStatus`
 *  collapsed into a single function. The IntentLoom status string set
 *  is the superset of all three. */
export function normalizeStatus(status: string | undefined): NormalizedToolStatus {
  switch (status) {
    case "success":
    case "completed":
      return "completed";
    case "error":
    case "failed":
      return "error";
    case "running":
    case "in_progress":
    case "executing":
    case "confirming":
      return "running";
    case "canceled":
      return "canceled";
    case "pending":
    default:
      return "pending";
  }
}

/** Friendly name (Edit / Read / Bash / …) from a tool name or kind. Shared
 *  with `ToolGroupCard` and `ToolGroupSummary`; both delegate to here so
 *  the label map stays in one place. */
const FRIENDLY_KIND: Record<string, string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  execute: "Bash",
  search: "Search",
  fetch: "Fetch",
  command_execution: "Bash",
  file_edit: "Edit",
  web_search: "Search",
  replace: "Edit",
  glob: "Glob",
  grep: "Grep",
  bash: "Bash",
  read_file: "Read",
  write_file: "Write",
  edit_file: "Edit",
};

export function friendlyToolName(name: string | undefined, kind2?: string): string {
  if (!name && !kind2) return "Tool";
  const lower = (name ?? "").toLowerCase();
  if (FRIENDLY_KIND[lower]) return FRIENDLY_KIND[lower];
  if (kind2) {
    const lowerKind = kind2.toLowerCase();
    if (FRIENDLY_KIND[lowerKind]) return FRIENDLY_KIND[lowerKind];
  }
  return name ?? kind2 ?? "Tool";
}

/** Derive a short subject string for the tool row: file path, command, search query. */
export function toolSubject(args: unknown, name?: string): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("exec") || lower.includes("bash") || lower.includes("command")) {
    const cmd = a.command ?? a.cmd;
    return typeof cmd === "string" ? cmd : "";
  }
  if (lower.includes("read") || lower.includes("fetch") || lower.includes("edit") || lower.includes("write") || lower.includes("replace")) {
    const p = a.file_path ?? a.path ?? a.file_name;
    return typeof p === "string" ? p : "";
  }
  if (lower.includes("search") || lower.includes("glob") || lower.includes("grep")) {
    const q = a.query ?? a.pattern ?? a.path;
    return typeof q === "string" ? q : "";
  }
  const generic = a.file_path ?? a.path ?? a.command ?? a.query ?? a.pattern;
  if (typeof generic === "string") return generic;
  return "";
}

/** Normalize a single `tool` item. */
export function normalizeToolItem(item: ReasonixItem, indexKey?: string): NormalizedToolCall | undefined {
  if (item.kind !== "tool") return undefined;
  const { id, name, args, status, result, kind2, agentId } = item;

  return {
    key: indexKey ?? id,
    name: friendlyToolName(name, kind2),
    status: normalizeStatus(status),
    description: toolSubject(args, name) || undefined,
    input: args && Object.keys(args as object).length > 0 ? formatValue(args) : undefined,
    output: result !== undefined ? formatValue(result) : undefined,
    source: item,
    agentId,
  };
}

/** Normalize the children of a `tool_group` item. */
export function normalizeToolGroupItem(item: ReasonixItem): NormalizedToolCall[] {
  if (item.kind !== "tool_group") return [];
  const groupAgentId = item.agentId;
  return item.tools
    .map((child, i) => {
      const normalized = normalizeToolItem(child, `${item.id}.${i}`);
      if (!normalized) return undefined;
      // Inherit the group's agentId when the child doesn't have one,
      // so consumers can always read `agentId` from a `NormalizedToolCall`.
      if (!normalized.agentId && groupAgentId) normalized.agentId = groupAgentId;
      return normalized;
    })
    .filter((n): n is NormalizedToolCall => n !== undefined);
}

/** Unified entry point: turn any mix of `tool` / `tool_group` items into a
 *  flat list of `NormalizedToolCall`. `ToolGroupSummary` uses this directly
 *  so a `tool_summary` virtual item can render the children in a uniform
 *  collapsible list. */
export function normalizeToolItems(items: ReasonixItem[]): NormalizedToolCall[] {
  const out: NormalizedToolCall[] = [];
  for (const item of items) {
    if (item.kind === "tool") {
      const n = normalizeToolItem(item);
      if (n) out.push(n);
    } else if (item.kind === "tool_group") {
      out.push(...normalizeToolGroupItem(item));
    }
  }
  return out;
}

/** True if any of the given items is currently running. Used by
 *  `ToolGroupSummary` to auto-expand the steps list when the model is
 *  still working — mirrors AionUi's `hasRunningToolMessages`. */
export function hasRunningToolItems(items: ReasonixItem[]): boolean {
  return items.some((item) => {
    if (item.kind === "tool") return normalizeStatus(item.status) === "running";
    if (item.kind === "tool_group") return item.tools.some((c) => c.kind === "tool" && normalizeStatus(c.status) === "running");
    return false;
  });
}
