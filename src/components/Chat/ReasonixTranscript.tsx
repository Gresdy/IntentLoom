/**
 * ReasonixTranscript — chat message rendering, AionUI-style.
 *
 * The core rendering loop mirrors AionUI's `MessageList` pattern:
 *   - Pre-process items to aggregate `file_summary` and `tool_summary`
 *     virtual messages (AionUI's `processedList` pattern)
 *   - Each item type rendered by a dedicated sub-component:
 *     user, assistant, tool, tool_group, permission, phase, notice, summary
 *   - `tool_group` items rendered by `ToolGroupCard` (AionUI's `MessageToolGroup`)
 *   - `tool_summary` virtual items rendered by `ToolGroupSummary` (AionUI's `MessageToolGroupSummary`)
 *   - `file_summary` virtual items rendered by `FileChangePreview` (AionUI's `MessageFileChanges`)
 *   - `permission` items rendered by `PermissionCard` (AionUI's `MessagePermission`)
 *
 * AionUI reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/MessageList.tsx
 */

import { useRef, useEffect, useState, useMemo } from "react";
import type { ReasonixItem } from "../../lib/reasonixAdapter";
import { ChevronRight, Loader2, FolderOpen, Bot, FileEdit, Sparkles } from "lucide-react";
import { ConversationSummary } from "../Loom/ConversationSummary";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { ToolGroupCard } from "./ToolGroupCard";
import { ToolGroupSummary } from "./ToolGroupSummary";
import { FileChangePreview, type FileChange } from "./FileChangePreview";
import { PermissionCard } from "./PermissionCard";
import { AgentBadge, getAgentMeta } from "./AgentBadge";
import { useMessageStore } from "@/stores/messageStore";

interface TranscriptProps {
  items: ReasonixItem[];
  onPrompt?: (text: string) => void;
  onNewChat?: () => void;
  onPickWorkspace?: () => void;
  onSeedDemo?: () => void;
  onApprove?: (id: string, allow: boolean) => void;
}

/**
 * AionUI-style processed item type.
 * Mirrors AionUI's `IMessageVO` / `IProcessedItem` pattern:
 *   - Regular items pass through as-is
 *   - `file_summary`: merged file changes from WriteFile/Edit tools
 *   - `tool_summary`: aggregated tool steps with ToolGroupSummary rendering
 */
type ProcessedItem =
  | { type: "item"; item: ReasonixItem }
  | { type: "file_summary"; id: string; changes: FileChange[]; sourceIds: string[] }
  | { type: "tool_summary"; id: string; tools: ReasonixItem[]; sourceIds: string[] };

/**
 * AionUI-style message pre-processing.
 * Mirrors AionUI's `processedList` logic in MessageList.tsx:
 *   - Consecutive tool/tool_group items with file edits → `file_summary`
 *   - Consecutive tool/tool_group items → `tool_summary`
 *   - Other items pass through unchanged
 */
function preprocessItems(items: ReasonixItem[]): ProcessedItem[] {
  const result: ProcessedItem[] = [];
  let fileChanges: FileChange[] = [];
  let fileSourceIds: string[] = [];
  let toolList: ReasonixItem[] = [];
  let toolSourceIds: string[] = [];

  const flushFileChanges = () => {
    if (fileChanges.length > 0) {
      result.push({
        type: "file_summary",
        id: `fs-${fileSourceIds[0] ?? Date.now()}`,
        changes: fileChanges,
        sourceIds: fileSourceIds,
      });
    }
    fileChanges = [];
    fileSourceIds = [];
  };

  const flushToolList = () => {
    if (toolList.length > 0) {
      result.push({
        type: "tool_summary",
        id: `ts-${toolSourceIds[0] ?? Date.now()}`,
        tools: toolList,
        sourceIds: toolSourceIds,
      });
    }
    toolList = [];
    toolSourceIds = [];
  };

  for (const item of items) {
    // Extract file changes from tool items
    if (item.kind === "tool") {
      const isEdit = item.kind2 === "edit" || item.kind2 === "write" || /write|edit|replace/i.test(item.name ?? "");
      const filePath = fileSubject(item.args);

      if (isEdit && filePath) {
        const added = Array.isArray(item.diff) ? item.diff.filter((d: any) => d.type === "add").length : 0;
        const removed = Array.isArray(item.diff) ? item.diff.filter((d: any) => d.type === "remove").length : 0;
        const isNew = /create|new/i.test(item.name ?? "");
        fileChanges.push({
          path: filePath,
          added,
          removed,
          isNew,
          diff: Array.isArray(item.diff) ? item.diff.map((d: any) => ({
            type: d.type,
            text: d.newText ?? d.oldText ?? "",
          })) : undefined,
        });
        fileSourceIds.push(item.id);
        // Also add to tool list so it appears in the tool summary
        toolList.push(item);
        toolSourceIds.push(item.id);
        continue;
      }

      // Non-edit tool → add to tool list
      flushFileChanges();
      toolList.push(item);
      toolSourceIds.push(item.id);
      continue;
    }

    if (item.kind === "tool_group") {
      // Flatten tool group items into the tool list
      // AionUI pattern: tool groups become tool_summary entries
      flushFileChanges();
      toolList.push(item);
      toolSourceIds.push(item.id);
      continue;
    }

    // Non-tool item → flush both buffers
    flushFileChanges();
    flushToolList();
    result.push({ type: "item", item });
  }

  flushFileChanges();
  flushToolList();

  return result;
}

export function Transcript({ items, onPrompt, onNewChat, onPickWorkspace, onSeedDemo, onApprove }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // AionUI-style pre-processing: aggregate tool items into
  // `file_summary` and `tool_summary` virtual messages
  const processed = useMemo(() => preprocessItems(items), [items]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="welcome">
        <div
          className="welcome__logo"
          style={{ background: "var(--accent)", color: "var(--accent-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}
        >
          I
        </div>
        <h1 className="welcome__title">IntentLoom</h1>
        <p className="welcome__tag">将混沌的想法编织成清晰的产品</p>
        <div className="welcome__hints">
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> 命令面板</span>
          <span><kbd>Tab</kbd> 切换模式</span>
          <span><kbd>Ctrl</kbd>+<kbd>N</kbd> 新会话</span>
        </div>
        <div className="welcome__examples">
          <button className="welcome__ex" onClick={() => onPrompt?.("帮我解释这段代码的功能")}>帮我解释这段代码的功能</button>
          <button className="welcome__ex" onClick={() => onPrompt?.("重构这个组件，使其更易维护")}>重构这个组件，使其更易维护</button>
          <button className="welcome__ex" onClick={() => onPrompt?.("为这个函数编写单元测试")}>为这个函数编写单元测试</button>
          <button className="welcome__ex" onClick={() => onPrompt?.("分析项目架构，给出改进建议")}>分析项目架构，给出改进建议</button>
        </div>
        <div className="welcome__quick-actions" style={{ marginTop: 20, display: "flex", gap: 10 }}>
          {onPickWorkspace && (
            <button className="chip" onClick={onPickWorkspace} style={{ fontSize: 12, gap: 6 }}>
              <FolderOpen size={13} /> 打开项目
            </button>
          )}
          {onNewChat && (
            <button className="chip" onClick={onNewChat} style={{ fontSize: 12, gap: 6 }}>
              <Bot size={13} /> 新建会话
            </button>
          )}
          {onSeedDemo && (
            <button
              className="chip welcome__demo"
              onClick={onSeedDemo}
              style={{ fontSize: 12, gap: 6 }}
              title="注入一条带思考 + 工具调用的示例对话，看看渲染效果"
            >
              <Sparkles size={13} /> 查看示例对话
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="transcript">
      {processed.map((p) => {
        if (p.type === "file_summary") {
          return <FileChangePreview key={p.id} changes={p.changes} />;
        }
        if (p.type === "tool_summary") {
          return <ToolGroupSummary key={p.id} tools={p.tools} />;
        }
        return <ItemRenderer key={p.item.id} item={p.item} onApprove={onApprove} />;
      })}
      <div ref={bottomRef} />
    </div>
  );
}

function ItemRenderer({ item, onApprove }: { item: ReasonixItem; onApprove?: (id: string, allow: boolean) => void }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg msg--user">
          <span className="msg__caret">›</span>
          <div className="msg__text">{item.text}</div>
        </div>
      );

    case "assistant":
      return <AssistantMessage text={item.text} streaming={item.streaming} reasoning={item.reasoning} agentId={item.agentId} />;

    case "tool":
      return <ToolCard item={item as any} />;

    case "tool_group":
      return <ToolGroupCard item={item} onApprove={onApprove} />;

    case "permission":
      return (
        <PermissionCard
          id={item.id}
          toolName={item.toolName}
          args={item.args}
          reason={item.reason}
          status={item.status}
          agentId={item.agentId}
          onApprove={onApprove}
        />
      );

    case "phase":
      return (
        <div className="phase">
          {item.agentId && <AgentBadge agentId={item.agentId} />}
          {item.text}
        </div>
      );

    case "notice": {
      const lvl = item.level;
      const lvlClass =
        lvl === "error" || lvl === "warn" || lvl === "info"
          ? `notice--${lvl}`
          : "";
      return (
        <div className={lvlClass ? `notice ${lvlClass}` : "notice"} role={lvl === "error" ? "alert" : "status"}>
          {item.agentId && <AgentBadge agentId={item.agentId} />}
          {item.text}
        </div>
      );
    }

    case "summary":
      return <ConversationSummary summary={item.tally} />;

    default:
      return null;
  }
}

function AssistantMessage({ text, streaming, reasoning, agentId }: { text: string; streaming?: boolean; reasoning?: string; agentId?: string }) {
  const [showReasoning, setShowReasoning] = useState(false);
  const thinkingMeta = useMessageStore((s) => s.currentThinkingMeta);
  const isLiveTurn = Boolean(streaming);
  const meta = getAgentMeta(agentId);

  return (
    <div className="msg msg--assistant" style={{ borderLeftColor: meta.color } as React.CSSProperties}>
      {agentId && (
        <div className="msg__agent">
          <AgentBadge agentId={agentId} size="md" />
        </div>
      )}
      {isLiveTurn && thinkingMeta && (
        <ThinkingDisplay
          content={reasoning ?? ""}
          status={thinkingMeta.status}
          startTime={thinkingMeta.startTime}
          duration={thinkingMeta.duration}
        />
      )}
      {!isLiveTurn && reasoning && (
        <div className="reasoning">
          <button className="reasoning__toggle" onClick={() => setShowReasoning(!showReasoning)}>
            <ChevronRight size={12} className={`reasoning__chevron ${showReasoning ? "reasoning__chevron--open" : ""}`} />
            思考过程
          </button>
          {showReasoning && <div className="reasoning__body">{reasoning}</div>}
        </div>
      )}
      <div className="msg__stream">{text}{streaming && <span className="cursor" />}</div>
    </div>
  );
}

/**
 * ToolCard — AionUI-style per-tool rendering.
 *
 * Mirrors AionUI's `MessageToolCall` pattern:
 *   - `Edit`/`Replace` tools with diffs → ReplacePreview diff panel
 *   - Other tools → Badge status + tool name + description + expandable input/output
 *   - `badge-breathing` animation for running state
 *
 * AionUI reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageToolCall.tsx
 */
export function ToolCard({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(item.status === "error");
  const kind: string | undefined =
    item.kind === "tool" ? item.kind2 ?? undefined : item.kind;
  const diff: any[] | undefined = Array.isArray(item.diff) ? item.diff : undefined;
  const hasDiff = (kind === "edit" || kind === "write" || /edit|write|replace/i.test(item.name ?? "")) && diff && diff.length > 0;
  const isExec = kind === "execute" || /exec|bash|command/i.test(item.name ?? "");
  // AionUI pattern: Edit/Replace tools with diffs get a ReplacePreview
  if (hasDiff) {
    return <ReplacePreview item={item} diff={diff!} />;
  }

  // AionUI pattern: Badge status + tool name + description
  const statusIcon: Record<string, React.ReactNode> = {
    running: <Loader2 size={12} className="spin ilo-fg-accent" />,
    in_progress: <Loader2 size={12} className="spin ilo-fg-accent" />,
    success: <span className="ilo-fg-ok">✓</span>,
    completed: <span className="ilo-fg-ok">✓</span>,
    error: <span className="ilo-fg-err">✗</span>,
    pending: <span className="ilo-fg-faint">○</span>,
  };

  const friendlyKind: Record<string, string> = {
    read: "Read", write: "Write", edit: "Edit", execute: "Bash",
    search: "Search", fetch: "Fetch", command_execution: "Bash",
    file_edit: "Edit", web_search: "Search", replace: "Edit",
  };
  const kindLabel = friendlyKind[kind ?? ""] ?? item.name;

  const subject = isExec
    ? commandSubject(item.args)
    : fileSubject(item.args) || (typeof item.args === "object" ? JSON.stringify(item.args).slice(0, 50) : "");

  const hasDetail = item.args || item.result;
  const agentMeta = getAgentMeta(item.agentId);

  return (
    <div className={`tool ${item.status === "running" || item.status === "in_progress" ? "tool--running" : ""}`} style={{ borderLeftColor: agentMeta.color } as React.CSSProperties}>
      {/* AionUI pattern: Badge + tool name + description row */}
      <div
        className={`tool__row ${hasDetail ? "tool__row--clickable" : ""}`}
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
      >
        <span className={`tool__chevron ${expanded ? "tool__chevron--open" : "tool__chevron--placeholder"}`}>
          {expanded ? <ChevronRight size={12} /> : null}
        </span>
        <span className="tool__icon">{statusIcon[item.status] ?? statusIcon.pending}</span>
        <span className="tool__name" style={{ color: agentMeta.color }}>{kindLabel}</span>
        {subject && <span className="tool__subject">{expanded ? subject : truncate(subject, 80)}</span>}
        {item.agentId && <AgentBadge agentId={item.agentId} />}
        {hasDetail && (
          <span className="tool__expand-hint">
            {expanded ? <ChevronRight size={10} style={{ transform: "rotate(90deg)" }} /> : <ChevronRight size={10} />}
          </span>
        )}
      </div>

      {/* AionUI pattern: expandable detail panel */}
      {expanded && hasDetail && (
        <div className="tool__detail-panel">
          {item.args && typeof item.args === "object" && Object.keys(item.args).length > 0 && (
            <div className="tool__detail-section">
              <div className="tool__detail-label">Input</div>
              <pre className="tool__detail-content">
                {isExec ? commandSubject(item.args) : JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          )}
          {item.result && (
            <div className="tool__detail-section">
              <div className="tool__detail-label">Output</div>
              <pre className="tool__detail-content">
                {typeof item.result === "string" ? item.result : JSON.stringify(item.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * ReplacePreview — AionUI-style diff preview for Edit/Replace tools.
 * Mirrors AionUI's `ReplacePreview` component which uses `createTwoFilesPatch`.
 */
function ReplacePreview({ item, diff }: { item: any; diff: any[] }) {
  const filePath = fileSubject(item.args) || "unknown";
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const agentMeta = getAgentMeta(item.agentId);

  // Collect add/remove counts from diff
  let added = 0, removed = 0;
  for (const d of diff) {
    if (d.type === "add") added++;
    else if (d.type === "remove") removed++;
    else if (d.type === "diff" || d.type === "content") {
      if (d.oldText) removed++;
      if (d.newText) added++;
    }
  }

  return (
    <div className="tool tool--has-diff" style={{ borderLeftColor: agentMeta.color } as React.CSSProperties}>
      <div className="tool__diff-header">
        <FileEdit size={12} style={{ color: agentMeta.color }} />
        <span className="tool__diff-filename">{fileName}</span>
        <span className="tool__diff-stats">
          <span className="ilo-fg-ok">+{added}</span>
          <span className="ilo-fg-err">-{removed}</span>
        </span>
        {item.agentId && <AgentBadge agentId={item.agentId} />}
      </div>
      <div className="tool__diff">
        {diff.map((d: any, i: number) => (
          <DiffLine key={i} diff={d} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ diff }: { diff: any }) {
  if (diff.type === "diff" || diff.type === "content") {
    return (
      <>
        {diff.oldText !== undefined && (
          <div className="tool__diff-line tool__diff-line--remove">- {diff.oldText}</div>
        )}
        {diff.newText !== undefined && (
          <div className="tool__diff-line tool__diff-line--add">+ {diff.newText}</div>
        )}
      </>
    );
  }
  if (diff.type === "add") {
    return <div className="tool__diff-line tool__diff-line--add">+ {diff.newText ?? ""}</div>;
  }
  if (diff.type === "remove") {
    return <div className="tool__diff-line tool__diff-line--remove">- {diff.oldText ?? ""}</div>;
  }
  return null;
}

function fileSubject(args: any): string {
  if (args && typeof args === "object") {
    if (typeof args.file_path === "string") return args.file_path;
    if (typeof args.path === "string") return args.path;
    if (typeof args.command === "string") return "";
  }
  return "";
}

function commandSubject(args: any): string {
  if (args && typeof args === "object" && typeof args.command === "string") {
    return args.command;
  }
  return "";
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
