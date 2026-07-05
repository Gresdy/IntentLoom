/**
 * ToolGroupSummary — AionUi-style collapsible tool step summary.
 * 
 * Ported from AionUi's MessageToolGroupSummary:
 *   /Users/zyh/PycharmProjects/AionUi/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx
 * 
 * Features:
 *   - "View Steps · N" header with Checklist icon
 *   - Badge status indicator for each tool (breathing animation for running)
 *   - Tool name + description on each row
 *   - Expandable detail panel for input/output
 * 
 * AionUi reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroupSummary.tsx
 */

import { useState, useMemo, useEffect } from "react";
import { ChevronRight, Loader2, CheckCircle2, ListChecks } from "lucide-react";
import type { ReasonixItem } from "@/lib/reasonixAdapter";

export interface ToolGroupSummaryProps {
  tools: ReasonixItem[];
}

/** Status badge component with breathing animation for running state */
function StatusBadge({ status }: { status: string }) {
  if (status === "running" || status === "in_progress") {
    return <Loader2 size={10} className="tool-group-badge-icon tool-group-badge-icon--running spin" />;
  }
  if (status === "completed" || status === "success") {
    return <CheckCircle2 size={10} className="ilo-fg-ok" />;
  }
  if (status === "error") {
    return <span className="ilo-fg-err" style={{ fontSize: 10 }}>✗</span>;
  }
  return <span className="ilo-fg-faint" style={{ fontSize: 10 }}>○</span>;
}

/** Tool item row with expandable detail */
function ToolItemRow({ item }: { item: ReasonixItem }) {
  const [expanded, setExpanded] = useState(false);
  if (item.kind !== "tool") return null;

  const hasDetail = item.args || item.result;
  const name = friendlyKind(item.kind2 ?? item.name);
  const description = describeToolBrief(item);

  return (
    <div className="tool-group-item">
      <div
        className={`tool-group-item-header ${hasDetail ? "tool-group-item-header--clickable" : ""}`}
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
      >
        <StatusBadge status={item.status} />
        <span className={`tool-group-item-name ${hasDetail ? "" : "tool-group-item-name--no-detail"}`}>
          {name}
        </span>
        {description && (
          <span className="tool-group-item-desc">
            {expanded ? description : truncate(description, 60)}
          </span>
        )}
        {hasDetail && (
          <span className={`tool-group-item-chevron ${expanded ? "tool-group-item-chevron--open" : ""}`}>
            <ChevronRight size={10} />
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className="tool-group-item-detail">
          {item.args && typeof item.args === "object" && Object.keys(item.args).length > 0 && (
            <div className="tool-group-detail-section">
              <div className="tool-group-detail-label">Input</div>
              <pre className="tool-group-detail-content">
                {typeof item.args === "string" ? item.args : JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          )}
          {item.result && (
            <div className="tool-group-detail-section">
              <div className="tool-group-detail-label">Output</div>
              <pre className="tool-group-detail-content">
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

  // Auto-expand when any tool is still running
  const hasRunning = toolItems.some((t) => t.status === "running" || t.status === "in_progress");

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  return (
    <div className="tool-group-summary">
      <button
        type="button"
        className={`tool-group-summary-header ${showMore ? "tool-group-summary-header--open" : ""}`}
        onClick={() => setShowMore(!showMore)}
        aria-expanded={showMore}
        aria-label={showMore ? "收起步骤详情" : "展开步骤详情"}
      >
        <span className="tool-group-summary-icon">
          {hasRunning ? (
            <Loader2 size={12} className="spin" />
          ) : (
            <ListChecks size={12} />
          )}
        </span>
        <span className="tool-group-summary-label">
          {showMore ? "收起步骤" : "查看步骤"}
          {toolItems.length > 0 ? ` · ${toolItems.length}` : ""}
        </span>
        <span className={`tool-group-summary-arrow ${showMore ? "tool-group-summary-arrow--open" : ""}`}>
          <ChevronRight size={11} />
        </span>
      </button>
      {showMore && (
        <div className="tool-group-summary-body">
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
