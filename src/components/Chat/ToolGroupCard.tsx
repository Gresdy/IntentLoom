/**
 * ToolGroupCard — AionUI-style tool group rendering.
 *
 * Directly mirrors AionUI's `MessageToolGroup` pattern:
 *   - Each tool call rendered as an `Alert`-like row with Badge status
 *   - `WriteFile` / `Edit` tools with diffs → merged `FileChangesPanel`
 *   - `ConfirmationDetails` → inline approve/deny with Radio.Group
 *   - `ImageGeneration` → standalone image display
 *   - Generic tools → Badge + Tag + description + expandable result
 *
 * AionUI reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolGroup.tsx
 */

import { useState, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { AgentBadge, getAgentMeta } from "./AgentBadge";
import type { ReasonixItem } from "@/lib/reasonixAdapter";

export interface ToolGroupCardProps {
  item: ReasonixItem & { kind: "tool_group" };
  onApprove?: (id: string, allow: boolean) => void;
}

type ToolItem = ReasonixItem & { kind: "tool" };

function asToolItem(item: ReasonixItem): ToolItem | null {
  return item.kind === "tool" ? (item as ToolItem) : null;
}

/**
 * AionUI-style ConfirmationDetails — inline approval card
 * inside a tool group. Mirrors AionUI's `ConfirmationDetails`
 * component with Radio.Group + Button confirm pattern.
 *
 * AionUI reference: MessageToolGroup.tsx → ConfirmationDetails
 */
function ConfirmationDetails({
  content,
  onConfirm,
}: {
  content: ToolItem;
  onConfirm: (outcome: "proceed_once" | "proceed_always" | "cancel") => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hasResponded, setHasResponded] = useState(false);

  const toolName = (content.name ?? "").toLowerCase();
  const isEdit = toolName.includes("edit") || toolName.includes("write") || toolName.includes("replace");
  const isExec = toolName.includes("exec") || toolName.includes("bash") || toolName.includes("command");

  const actionIcon = isEdit ? "✏️" : isExec ? "⚡" : "📖";
  const question = isEdit
    ? "是否允许修改此文件？"
    : isExec
    ? "是否允许执行此命令？"
    : "是否继续？";

  const options = [
    { label: "允许一次", value: "proceed_once" as const },
    { label: "始终允许", value: "proceed_always" as const },
    { label: "拒绝", value: "cancel" as const },
  ];

  const handleConfirm = () => {
    if (!selected || hasResponded) return;
    setHasResponded(true);
    onConfirm(selected as "proceed_once" | "proceed_always" | "cancel");
  };

  const hasDiff = isEdit && Array.isArray(content.diff) && content.diff.length > 0;

  return (
    <div className="perm-card perm-card--pending">
      <div className="perm-card__header">
        <span style={{ fontSize: 16 }}>{actionIcon}</span>
        <span className="perm-card__title">
          {isEdit ? "文件修改请求" : isExec ? "命令执行请求" : "操作确认"}
        </span>
        <AgentBadge agentId={content.agentId} />
      </div>

      {hasDiff && (
        <div className="perm-card__diff">
          {content.diff!.map((d: any, i: number) => (
            <DiffLine key={i} diff={d} />
          ))}
        </div>
      )}

      {isExec && (
        <div className="perm-card__cmd">
          <pre className="code">{fileSubject(content.args)}</pre>
        </div>
      )}

      {!isEdit && !isExec && content.args && (
        <div className="perm-card__desc">
          {typeof content.args === "string" ? content.args : JSON.stringify(content.args, null, 2).slice(0, 200)}
        </div>
      )}

      {!hasResponded && (
        <>
          <div className="perm-card__question">{question}</div>
          <div className="perm-card__options">
            {options.map((opt) => (
              <label key={opt.value} className="perm-card__radio">
                <input
                  type="radio"
                  name={`confirm-${content.id}`}
                  value={opt.value}
                  checked={selected === opt.value}
                  onChange={() => setSelected(opt.value)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <div className="perm-card__actions">
            <div />
            <button
              className="perm-card__btn perm-card__btn--approve"
              disabled={!selected}
              onClick={handleConfirm}
            >
              确认
            </button>
          </div>
        </>
      )}

      {hasResponded && (
        <div className="perm-card__responded">
          ✓ 响应已发送
        </div>
      )}
    </div>
  );
}

/**
 * AionUI-style ToolResultDisplay — collapsible result output.
 * Mirrors AionUI's CollapsibleContent + pre pattern.
 */
function ToolResultDisplay({ content }: { content: ToolItem }) {
  const [expanded, setExpanded] = useState(false);
  const result = content.result;

  if (!result) return null;

  const display = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const isLong = display.length > 300;

  return (
    <div className="tool-group__result">
      <pre className={`tool-group__result-pre ${!expanded && isLong ? "tool-group__result-pre--truncated" : ""}`}>
        {expanded || !isLong ? display : display.slice(0, 300) + "…"}
      </pre>
      {isLong && (
        <button className="tool-group__result-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

export function ToolGroupCard({ item, onApprove }: ToolGroupCardProps) {
  const tools = item.tools;
  const agentId = item.agentId;

  const writeFileResults = useMemo(() => {
    return tools.filter(
      (t): t is ToolItem =>
        t.kind === "tool" &&
        (t.kind2 === "edit" || t.kind2 === "write" || /write|edit|replace/i.test(t.name ?? "")) &&
        !!t.diff &&
        Array.isArray(t.diff) &&
        t.diff.length > 0
    );
  }, [tools]);

  const firstWriteFileIndex = useMemo(() => {
    return tools.findIndex(
      (t): t is ToolItem =>
        t.kind === "tool" &&
        (t.kind2 === "edit" || t.kind2 === "write" || /write|edit|replace/i.test(t.name ?? "")) &&
        !!t.diff &&
        Array.isArray(t.diff) &&
        t.diff.length > 0
    );
  }, [tools]);

  const changedFiles = useMemo(() => {
    const files = new Map<string, { added: number; removed: number; isNew: boolean }>();
    for (const t of writeFileResults) {
      const path = fileSubject(t.args);
      if (!path) continue;
      const existing = files.get(path) ?? { added: 0, removed: 0, isNew: false };
      if (Array.isArray(t.diff)) {
        for (const d of t.diff) {
          if (d.type === "add") existing.added++;
          else if (d.type === "remove") existing.removed++;
        }
      }
      if (/create|new/i.test(t.name ?? "")) existing.isNew = true;
      files.set(path, existing);
    }
    return [...files.entries()].map(([path, stats]) => ({ path, ...stats }));
  }, [writeFileResults]);

  const meta = getAgentMeta(agentId);

  return (
    <div className="tool-group">
      {changedFiles.length > 0 && (
        <div className="tool-group__file-summary">
          <div className="tool-group__file-summary-header">
            <span style={{ fontSize: 12 }}>📝</span>
            <span className="tool-group__file-summary-title">
              {changedFiles.length} 个文件变更
            </span>
            <span className="tool-group__file-summary-stats">
              <span className="ilo-fg-ok">+{changedFiles.reduce((s, c) => s + c.added, 0)}</span>
              <span className="ilo-fg-err">-{changedFiles.reduce((s, c) => s + c.removed, 0)}</span>
            </span>
          </div>
          <div className="tool-group__file-summary-list">
            {changedFiles.map((f) => (
              <span key={f.path} className="tool-group__file-chip">
                {f.isNew ? <span style={{ fontSize: 10 }}>📄</span> : <span style={{ fontSize: 10 }}>✏️</span>}
                {shortenPath(f.path)}
                <span className="tool-group__file-chip-stats">
                  <span className="ilo-fg-ok">+{f.added}</span>
                  <span className="ilo-fg-err">-{f.removed}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {tools.map((content, index) => {
        const tool = asToolItem(content);
        if (!tool) return null;

        const isLoading = tool.status === "running" || tool.status === "in_progress";
        const isError = tool.status === "error";
        const isSuccess = tool.status === "completed" || tool.status === "success";
        const isCanceled = tool.status === "canceled";

        if (tool.status === "pending" && needsConfirmation(tool)) {
          return (
            <ConfirmationDetails
              key={tool.id}
              content={tool}
              onConfirm={(outcome) => {
                onApprove?.(tool.id, outcome !== "cancel");
              }}
            />
          );
        }

        if (
          index === firstWriteFileIndex &&
          writeFileResults.length > 1 &&
          (tool.kind2 === "edit" || tool.kind2 === "write" || /write|edit|replace/i.test(tool.name)) &&
          tool.diff &&
          Array.isArray(tool.diff) &&
          tool.diff.length > 0
        ) {
          return null;
        }

        if (/image/i.test(tool.name) && tool.result && typeof tool.result === "object" && "img_url" in tool.result) {
          return (
            <div key={tool.id} className="tool-group__image">
              <img
                src={String((tool.result as any).img_url)}
                alt="Generated image"
                style={{ maxHeight: 320, borderRadius: 8, objectFit: "contain" }}
              />
            </div>
          );
        }

        const alertType = isError ? "error" : isSuccess ? "success" : isCanceled ? "warning" : "info";

        return (
          <div key={tool.id} className={`tool-group__alert tool-group__alert--${alertType}`}>
            <div className="tool-group__alert-header">
              <span className={`tool-group__badge tool-group__badge--${alertType}`}>
                {isLoading ? (
                  <Loader2 size={10} className="spin" />
                ) : isError ? (
                  <span className="ilo-fg-err">✗</span>
                ) : isCanceled ? (
                  <span className="ilo-fg-faint">○</span>
                ) : (
                  <span className="ilo-fg-ok">✓</span>
                )}
              </span>
              <span className="tool-group__tag" style={{ borderColor: meta.color, color: meta.color }}>
                {friendlyKind(tool.kind2 ?? tool.name)}
              </span>
              {isCanceled && <span className="tool-group__canceled">（已取消）</span>}
            </div>

            {tool.args && (
              <div className={`tool-group__description ${isError ? "tool-group__description--error" : ""}`}>
                {describeTool(tool)}
              </div>
            )}

            {tool.result && <ToolResultDisplay content={tool} />}

            {isError && (
              <div className="tool-group__error-footer">
                <AgentBadge agentId={tool.agentId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function needsConfirmation(tool: ToolItem): boolean {
  const name = (tool.name ?? "").toLowerCase();
  return (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("exec") ||
    name.includes("bash") ||
    name.includes("command") ||
    name.includes("mcp")
  );
}

function friendlyKind(kind: string): string {
  const map: Record<string, string> = {
    read: "Read", write: "Write", edit: "Edit", execute: "Bash",
    search: "Search", fetch: "Fetch", command_execution: "Bash",
    file_edit: "Edit", web_search: "Search", replace: "Edit",
    glob: "Glob", grep: "Grep",
  };
  return map[kind.toLowerCase()] ?? kind;
}

function describeTool(tool: ToolItem): string {
  const args = tool.args;
  if (!args || typeof args !== "object") return "";
  const name = (tool.name ?? "").toLowerCase();
  const kind2 = (tool.kind2 ?? "").toLowerCase();

  if (name.includes("edit") || name.includes("replace") || kind2 === "edit") {
    const path = args.file_path ?? args.path ?? "";
    return path ? path : "";
  }
  if (name.includes("exec") || name.includes("bash") || name.includes("command") || kind2 === "execute") {
    const cmd = args.command ?? args.cmd ?? "";
    return cmd ? (cmd.length > 120 ? cmd.slice(0, 120) + "…" : cmd) : "";
  }
  if (name.includes("read") || name.includes("fetch") || kind2 === "read") {
    const path = args.file_path ?? args.path ?? args.query ?? args.pattern ?? "";
    return path ? path : "";
  }
  if (name.includes("search") || name.includes("glob") || name.includes("grep")) {
    const q = args.query ?? args.pattern ?? args.path ?? "";
    return q ? q : "";
  }

  const json = JSON.stringify(args);
  return json.length > 100 ? json.slice(0, 100) + "…" : json;
}

function DiffLine({ diff }: { diff: any }) {
  if (diff.type === "diff" || diff.type === "content") {
    return (
      <>
        {diff.oldText !== undefined && (
          <div className="tool-group__diff-line tool-group__diff-line--remove">- {diff.oldText}</div>
        )}
        {diff.newText !== undefined && (
          <div className="tool-group__diff-line tool-group__diff-line--add">+ {diff.newText}</div>
        )}
      </>
    );
  }
  if (diff.type === "add") {
    return <div className="tool-group__diff-line tool-group__diff-line--add">+ {diff.newText ?? ""}</div>;
  }
  if (diff.type === "remove") {
    return <div className="tool-group__diff-line tool-group__diff-line--remove">- {diff.oldText ?? ""}</div>;
  }
  return null;
}

function fileSubject(args: any): string {
  if (args && typeof args === "object") {
    if (typeof args.file_path === "string") return args.file_path;
    if (typeof args.path === "string") return args.path;
  }
  return "";
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 2) return p;
  return ".../" + parts.slice(-2).join("/");
}
