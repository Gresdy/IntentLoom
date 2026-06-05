// End-of-conversation artifact card. Renders the tally of files
// added / modified / deleted and commands run during a single turn.
// Triggered by `ai-stream-end` in `useReasonixController`; the parent
// transcript only mounts it when `summary` is set on the item.

import { FileEdit, FilePlus2, FileX2, Terminal, CheckCircle2 } from "lucide-react";
import type { ArtifactTally } from "@/lib/artifactTally";
import { hasAnyArtifact } from "@/lib/artifactTally";

export function ConversationSummary({ summary }: { summary: ArtifactTally }) {
  if (!hasAnyArtifact(summary)) return null;

  return (
    <div className="conv-summary" role="status" aria-label="本对话产物">
      <div className="conv-summary__head">
        <CheckCircle2 size={14} />
        本对话已完成
      </div>
      <ul className="conv-summary__rows">
        {summary.added > 0 && (
          <li className="conv-summary__row">
            <FilePlus2 size={12} className="conv-summary__icon conv-summary__icon--add" />
            新增 {summary.added} 个文件
          </li>
        )}
        {summary.modified > 0 && (
          <li className="conv-summary__row">
            <FileEdit size={12} className="conv-summary__icon conv-summary__icon--mod" />
            修改 {summary.modified} 个文件
          </li>
        )}
        {summary.deleted > 0 && (
          <li className="conv-summary__row">
            <FileX2 size={12} className="conv-summary__icon conv-summary__icon--del" />
            删除 {summary.deleted} 个文件
          </li>
        )}
        {summary.commands > 0 && (
          <li className="conv-summary__row">
            <Terminal size={12} className="conv-summary__icon" />
            执行 {summary.commands} 个命令
          </li>
        )}
      </ul>
      {summary.filesTouched.length > 0 && (
        <div className="conv-summary__files">
          {summary.filesTouched.slice(0, 8).map((f) => (
            <span key={f} className="conv-summary__file" title={f}>
              {f.split("/").pop() || f}
            </span>
          ))}
          {summary.filesTouched.length > 8 && (
            <span className="conv-summary__file">+{summary.filesTouched.length - 8}</span>
          )}
        </div>
      )}
    </div>
  );
}
