/**
 * ToolGroupSummary — AionUI-style collapsible tool step summary.
 *
 * Directly mirrors AionUI's `MessageToolGroupSummary` pattern:
 *   - "View Steps · N" header with Checklist icon
 *   - Badge status indicator for each tool (breathing animation for running)
 *   - Tool name + description on each row
 *   - Expandable detail panel for input/output
 *
 * AionUI reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx
 */

import { useState, useMemo, useEffect } from "react";
import { ChevronRight, Loader2, CheckCircle2, ListChecks } from "lucide-react";
import type { ReasonixItem } from "@/lib/reasonixAdapter";

export interface ToolGroupSummaryProps {
  tools: ReasonixItem[];
}

/** AionUI's statusToBadge mapping — breathing animation for running state */
function StatusBadge({ status }: { status: string }) {
  if (status === "running" || status === "in_progress") {
    return <Loader2 size={10} className="spin tool-group-summary__badge-icon tool-group-summary__badge-icon--running" />;
  }
  if (status === "completed" || status === "success") {
    return <CheckCircle2 size={10} className="ilo-fg-ok" />;
  }
  if (status === "error") {
    return <span className="ilo-fg-err" style={{ fontSize: 10 }}>✗</span>;
  }
  // pending / default
  return <span className="ilo-fg-faint" style={{ fontSize: 10 }}>○</span>;
}

/** AionUI's ToolItemDetail — expandable tool row */
function ToolItemRow({ item }: { item: ReasonixItem }) {
  const [expanded, setExpanded] = useState(false);
  if (item.kind !== "tool") return null;

  const hasDetail = item.args || item.result;
  const name = friendlyKind(item.kind2 ?? item.name);
  const description = describeToolBrief(item);

  return (
    <div className="tool-group-summary__item">
      <div
        className={`tool-group-summary__item-header ${hasDetail ? "tool-group-summary__item-header--clickable" : ""}`}
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
      >
        <StatusBadge status={item.status} />
        <span className={`tool-group-summary__item-name ${hasDetail ? "" : "tool-group-summary__item-name--no-detail"}`}>
          {name}
        </span>
        {description && (
          <span className="tool-group-summary__item-desc">
            {expanded ? description : truncate(description, 60)}
          </span>
        )}
        {hasDetail && (
          <span className={`tool-group-summary__item-chevron ${expanded ? "tool-group-summary__item-chevron--open" : ""}`}>
            <ChevronRight size={10} />
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className="tool-group-summary__item-detail">
          {item.args && typeof item.args === "object" && Object.keys(item.args).length > 0 && (
            <div className="tool-group-summary__detail-section">
              <div className="tool-group-summary__detail-label">Input</div>
              <pre className="tool-group-summary__detail-content">
                {typeof item.args === "string" ? item.args : JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          )}
          {item.result && (
            <div className="tool-group-summary__detail-section">
              <div className="tool-group-summary__detail-label">Output</div>
              <pre className="tool-group-summary__detail-content">
                {typeof item.result === "string" ? item.result : JSON.stringify(item.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolGroupSummary({ tools }: ToolGroupSummaryProps) {
  const [showMore, setShowMore] = useState(false);

  const toolItems = useMemo(
    () => tools.filter((t): t is ReasonixItem & { kind: "tool" } => t.kind === "tool"),
    [tools]
  );

  // AionUI pattern: auto-expand when any tool is still running
  const hasRunning = toolItems.some((t) => t.status === "running" || t.status === "in_progress");

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  return (
    <div className="tool-group-summary">
      <div className="tool-group-summary__header" onClick={() => setShowMore(!showMore)}>
        <span className="tool-group-summary__icon">
          {hasRunning ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <ListChecks size={12} />
          )}
        </span>
        <span className="tool-group-summary__label">
          查看步骤{toolItems.length > 0 ? ` · ${toolItems.length}` : ""}
        </span>
        <span className={`tool-group-summary__arrow ${showMore ? "tool-group-summary__arrow--open" : ""}`}>
          <ChevronRight size={10} />
        </span>
      </div>
      {showMore && (
        <div className="tool-group-summary__body">
          {toolItems.map((item) => (
            <ToolItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function friendlyKind(kind: string): string {
  const map: Record<string, string> = {
    read: "Read", write: "Write", edit: "Edit", execute: "Bash",
    search: "Search", fetch: "Fetch", command_execution: "Bash",
    file_edit: "Edit", web_search: "Search", replace: "Edit",
    glob: "Glob", grep: "Grep",
  };
  return map[(kind ?? "").toLowerCase()] ?? kind ?? "Tool";
}

function describeToolBrief(item: ReasonixItem): string {
  if (item.kind !== "tool") return "";
  const args = item.args;
  if (!args || typeof args !== "object") return "";
  const name = (item.name ?? "").toLowerCase();
  const kind2 = (item.kind2 ?? "").toLowerCase();
  if (name.includes("edit") || name.includes("replace") || kind2 === "edit") {
    return args.file_path ?? args.path ?? "";
  }
  if (name.includes("exec") || name.includes("bash") || name.includes("command") || kind2 === "execute") {
    const cmd = args.command ?? args.cmd ?? "";
    return cmd ? truncate(cmd, 60) : "";
  }
  if (name.includes("read") || name.includes("fetch") || kind2 === "read") {
    return args.file_path ?? args.path ?? args.query ?? args.pattern ?? "";
  }
  return "";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
