/**
 * FileChangePreview — AionUI-style compact file change summary.
 * Shows the list of files modified in a tool group with a
 * diff-stat-style bar indicating additions vs deletions.
 *
 * AionUI reference: `MessageFileChanges` in `MessageToolGroup.tsx`
 *   - Merged WriteFile diffs into a single panel
 *   - Per-file diff with add/remove line counts
 *   - Expandable to show the actual diff content
 *
 * This component is used inside ToolGroupCard's expanded state
 * and can also be rendered standalone when a single tool call
 * produces multi-file changes.
 */

import { useState } from "react";
import { ChevronRight, FileEdit, FilePlus2, FileMinus } from "lucide-react";

export interface FileChange {
  path: string;
  /** Number of lines added. */
  added: number;
  /** Number of lines removed. */
  removed: number;
  /** Whether this is a new file creation. */
  isNew?: boolean;
  /** Whether this file was deleted. */
  isDeleted?: boolean;
  /** Diff lines, if available. */
  diff?: DiffLine[];
  /**
   * Wall-clock timestamp the change was reported. Optional — when the
   * adapter can't supply one the transcript row falls back to "now".
   * Used by the `MessageTimeStamp` row chrome to render
   * `formatMessageTime(createAt)` next to the change list.
   */
  createdAt?: number;
}

export interface DiffLine {
  type: "add" | "remove" | "content";
  text: string;
}

export interface FileChangePreviewProps {
  changes: FileChange[];
}

export function FileChangePreview({ changes }: FileChangePreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const totalAdded = changes.reduce((s, c) => s + c.added, 0);
  const totalRemoved = changes.reduce((s, c) => s + c.removed, 0);

  return (
    <div className="file-preview">
      <button
        className="file-preview__header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`file-preview__chevron ${expanded ? "file-preview__chevron--open" : ""}`}>
          <ChevronRight size={12} />
        </span>
        <span className="file-preview__title">文件变更</span>
        <span className="file-preview__stats">
          <span className="file-preview__stat file-preview__stat--add">+{totalAdded}</span>
          <span className="file-preview__stat file-preview__stat--remove">-{totalRemoved}</span>
        </span>
        <span className="file-preview__count">{changes.length} 个文件</span>
      </button>

      {expanded && (
        <div className="file-preview__body">
          {changes.map((c) => (
            <FileChangeRow key={c.path} change={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileChangeRow({ change }: { change: FileChange }) {
  const [showDiff, setShowDiff] = useState(false);

  const icon = change.isNew
    ? <FilePlus2 size={12} className="ilo-fg-accent" />
    : change.isDeleted
    ? <FileMinus size={12} style={{ color: "#f87171" }} />
    : <FileEdit size={12} className="ilo-fg-accent" />;

  return (
    <div className="file-preview__row">
      <button
        className="file-preview__row-header"
        onClick={() => setShowDiff(!showDiff)}
      >
        {icon}
        <span className="file-preview__path">{change.path}</span>
        <span className="file-preview__row-stats">
          <span className="file-preview__stat--add">+{change.added}</span>
          <span className="file-preview__stat--remove">-{change.removed}</span>
        </span>
        <DiffStatBar added={change.added} removed={change.removed} />
      </button>
      {showDiff && change.diff && (
        <div className="file-preview__diff">
          {change.diff.map((line, i) => (
            <div
              key={i}
              className={`file-preview__diff-line ${line.type === "add" ? "file-preview__diff-line--add" : line.type === "remove" ? "file-preview__diff-line--remove" : ""}`}
            >
              <span className="file-preview__diff-marker">{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}</span>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mini diff-stat bar: a thin horizontal bar showing the add/remove ratio. */
function DiffStatBar({ added, removed }: { added: number; removed: number }) {
  const total = added + removed;
  if (total === 0) return null;
  const addPct = (added / total) * 100;
  const removePct = (removed / total) * 100;

  return (
    <span className="diff-stat-bar">
      <span className="diff-stat-bar__add" style={{ width: `${addPct}%` }} />
      <span className="diff-stat-bar__remove" style={{ width: `${removePct}%` }} />
    </span>
  );
}
