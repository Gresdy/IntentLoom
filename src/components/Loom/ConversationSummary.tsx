// End-of-conversation artifact card. Renders the tally of files
// added / modified / deleted and commands run during a single turn.
// Triggered by `ai-stream-end` in `useReasonixController`; the parent
// transcript only mounts it when `summary` is set on the item.
//
// Each row (新增 / 修改 / 删除 / 执行) is now a click-to-expand
// disclosure: the header shows just the count, and clicking reveals
// the actual file paths or command strings collected by
// `buildArtifactSummary`. The "本对话已完成" header itself stays
// static — it's the conversation-level status, not a per-row summary.

import { useState } from "react";
import { FileEdit, FilePlus2, FileX2, Terminal, CheckCircle2, ChevronRight } from "lucide-react";
import type { ArtifactTally } from "@/lib/artifactTally";
import { hasAnyArtifact } from "@/lib/artifactTally";

type RowKey = "added" | "modified" | "deleted" | "commands";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface ExpandableRowProps {
  rowKey: RowKey;
  icon: React.ReactNode;
  iconClass?: string;
  label: string;
  items: string[];
  emptyHint?: string;
  expanded: string | null;
  onToggle: (key: string) => void;
  /** When true, render items as a command block (monospace) instead of file paths. */
  asCommand?: boolean;
}

function ExpandableRow({
  rowKey,
  icon,
  iconClass,
  label,
  items,
  emptyHint,
  expanded,
  onToggle,
  asCommand,
}: ExpandableRowProps) {
  const isOpen = expanded === rowKey;
  // Always render the row header so the user knows it exists. The
  // chevron only appears when there's something to show — otherwise
  // clicking would just open an empty box, which is a worse UX than
  // a plain label.
  const expandable = items.length > 0;
  return (
    <li className="conv-summary__row-group">
      <div
        className={`conv-summary__row ${expandable ? "conv-summary__row--clickable" : ""} ${isOpen ? "conv-summary__row--expanded" : ""}`}
        onClick={expandable ? () => onToggle(rowKey) : undefined}
        role={expandable ? "button" : undefined}
        aria-expanded={expandable ? isOpen : undefined}
        tabIndex={expandable ? 0 : undefined}
        onKeyDown={
          expandable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(rowKey);
                }
              }
            : undefined
        }
      >
        <span className={iconClass}>{icon}</span>
        <span className="conv-summary__row-label">{label}</span>
        {expandable && (
          <span className={`conv-summary__chevron ${isOpen ? "conv-summary__chevron--open" : ""}`}>
            <ChevronRight size={11} />
          </span>
        )}
      </div>
      {isOpen && expandable && (
        <ul className="conv-summary__detail">
          {items.map((it) => (
            <li
              key={it}
              className={`conv-summary__detail-item ${asCommand ? "conv-summary__detail-item--cmd" : ""}`}
              title={it}
            >
              {asCommand ? truncate(it, 200) : it}
            </li>
          ))}
        </ul>
      )}
      {isOpen && !expandable && emptyHint && (
        <div className="conv-summary__detail conv-summary__detail--empty">{emptyHint}</div>
      )}
    </li>
  );
}

export function ConversationSummary({ summary }: { summary: ArtifactTally }) {
  const [expandedRow, setExpandedRow] = useState<RowKey | null>(null);

  if (!hasAnyArtifact(summary)) return null;

  const toggle = (key: RowKey) => setExpandedRow(expandedRow === key ? null : key);

  return (
    <div className="conv-summary" role="status" aria-label="本对话产物">
      <div className="conv-summary__head">
        <CheckCircle2 size={14} />
        本对话已完成
      </div>
      <ul className="conv-summary__rows">
        {summary.added > 0 && (
          <ExpandableRow
            rowKey="added"
            icon={<FilePlus2 size={12} />}
            iconClass="conv-summary__icon conv-summary__icon--add"
            label={`新增 ${summary.added} 个文件`}
            items={summary.addedFiles}
            emptyHint="（无文件路径）"
            expanded={expandedRow}
            onToggle={(k) => toggle(k as RowKey)}
          />
        )}
        {summary.modified > 0 && (
          <ExpandableRow
            rowKey="modified"
            icon={<FileEdit size={12} />}
            iconClass="conv-summary__icon conv-summary__icon--mod"
            label={`修改 ${summary.modified} 个文件`}
            items={summary.modifiedFiles}
            emptyHint="（无文件路径）"
            expanded={expandedRow}
            onToggle={(k) => toggle(k as RowKey)}
          />
        )}
        {summary.deleted > 0 && (
          <ExpandableRow
            rowKey="deleted"
            icon={<FileX2 size={12} />}
            iconClass="conv-summary__icon conv-summary__icon--del"
            label={`删除 ${summary.deleted} 个文件`}
            items={summary.deletedFiles}
            emptyHint="（无文件路径）"
            expanded={expandedRow}
            onToggle={(k) => toggle(k as RowKey)}
          />
        )}
        {summary.commands > 0 && (
          <ExpandableRow
            rowKey="commands"
            icon={<Terminal size={12} />}
            iconClass="conv-summary__icon"
            label={`执行 ${summary.commands} 个命令`}
            items={summary.commandsRun}
            emptyHint="（无命令详情）"
            expanded={expandedRow}
            onToggle={(k) => toggle(k as RowKey)}
            asCommand
          />
        )}
      </ul>
    </div>
  );
}
