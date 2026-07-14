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

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { ReasonixItem } from "../../lib/reasonixAdapter";
import { ChevronRight, Loader2, FolderOpen, Bot, FileEdit, Sparkles, Pencil, RefreshCw, Check, X } from "lucide-react";
import { ConversationSummary } from "../Loom/ConversationSummary";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { ToolGroupCard } from "./ToolGroupCard";
import { ToolGroupSummary } from "./ToolGroupSummary";
import { FileChangePreview, type FileChange } from "./FileChangePreview";
import { PermissionCard } from "./PermissionCard";
import { AgentBadge, getAgentMeta } from "./AgentBadge";
import { useMessageStore } from "@/stores/messageStore";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { usePendingConfirmationsRecovery } from "@/hooks/usePendingConfirmationsRecovery";
import { formatMessageTime } from "@/chat/formatMessageTime";
import { CHAT_MESSAGE_JUMP_EVENT, type ChatMessageJumpDetail } from "@/chat/chatMessageJumpEvents";
import { MessageAgentStatus } from "./MessageAgentStatus";
import { MessageTips } from "./MessageTips";
import { MessagePlan } from "./MessagePlan";
import { MessageSkillSuggest } from "./MessageSkillSuggest";
import { MessageCronTrigger } from "./MessageCronTrigger";
import { MessageAvailableCommands } from "./MessageAvailableCommands";
import { SelectionReplyButton } from "./SelectionReplyButton";
import { MessageText } from "./MessageText";
import { ToolExecutionDisplay } from "./ToolExecutionDisplay";
import type { ToolCall } from "@/types/message";

interface TranscriptProps {
  items: ReasonixItem[];
  onPrompt?: (text: string) => void;
  onNewChat?: () => void;
  onPickWorkspace?: () => void;
  onSeedDemo?: () => void;
  onApprove?: (id: string, allow: boolean) => void;
  onEditUserMessage?: (messageId: string, newText: string) => void;
  onRegenerateAssistant?: (messageId: string) => void;
}

/**
 * AionUI-style processed item type.
 */
type ProcessedItem =
  | { type: "item"; item: ReasonixItem }
  | { type: "file_summary"; id: string; changes: FileChange[]; sourceIds: string[] }
  | { type: "tool_summary"; id: string; tools: ReasonixItem[]; sourceIds: string[] };

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
          createdAt: timestampOf(item),
          diff: Array.isArray(item.diff) ? item.diff.map((d: any) => ({
            type: d.type,
            text: d.newText ?? d.oldText ?? "",
          })) : undefined,
        });
        fileSourceIds.push(item.id);
        toolList.push(item);
        toolSourceIds.push(item.id);
        continue;
      }

      flushFileChanges();
      toolList.push(item);
      toolSourceIds.push(item.id);
      continue;
    }

    if (item.kind === "tool_group") {
      flushFileChanges();
      toolList.push(item);
      toolSourceIds.push(item.id);
      continue;
    }

    flushFileChanges();
    flushToolList();
    result.push({ type: "item", item });
  }

  flushFileChanges();
  flushToolList();

  return result;
}

export function Transcript({ items, onPrompt, onNewChat, onPickWorkspace, onSeedDemo, onApprove, onEditUserMessage, onRegenerateAssistant }: TranscriptProps) {
  const {
    handleScrollerRef,
    handleContentRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    showScrollButton,
    scrollToBottom,
    scrollElementIntoView,
    hideScrollButton,
  } = useAutoScroll({ messages: items, itemCount: items.length });

  const processed = useMemo(() => preprocessItems(items), [items]);

  usePendingConfirmationsRecovery(items);

  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>();
  const lastHandledJumpRef = useRef<string>("");
  const shownAgentStatusRef = useRef<Set<string>>(new Set());

  const handleJumpToMessage = useCallback(
    (detail: ChatMessageJumpDetail) => {
      const key = `${detail.messageId ?? detail.msgId ?? ""}`;
      if (lastHandledJumpRef.current === key) return;
      lastHandledJumpRef.current = key;
      if (detail.messageId) setHighlightedMessageId(detail.messageId);
      const el = detail.messageId
        ? (document.querySelector(`[data-message-id="${detail.messageId}"]`) as HTMLElement | null)
        : null;
      hideScrollButton();
      scrollElementIntoView(el, {
        behavior: detail.behavior ?? "smooth",
        block: detail.align ?? "center",
      });
    },
    [hideScrollButton, scrollElementIntoView]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => handleJumpToMessage((e as CustomEvent<ChatMessageJumpDetail>).detail);
    window.addEventListener(CHAT_MESSAGE_JUMP_EVENT, handler);
    return () => window.removeEventListener(CHAT_MESSAGE_JUMP_EVENT, handler);
  }, [handleJumpToMessage]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const id = window.setTimeout(() => setHighlightedMessageId(undefined), 2400);
    return () => window.clearTimeout(id);
  }, [highlightedMessageId]);

  const handleScrollButtonClick = () => {
    hideScrollButton();
    scrollToBottom("smooth");
  };

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
      <div
        ref={handleScrollerRef}
        className="transcript__scroller"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        data-testid="transcript-scroller"
      >
        <div ref={handleContentRef} className="transcript__content" data-testid="transcript-content">
          {processed.map((p) => {
            if (p.type === "file_summary") {
              return (
                <div key={p.id} className="transcript__row" data-message-id={p.id}>
                  <FileChangePreview changes={p.changes} />
                  <MessageTimeStamp createdAt={p.changes[0]?.createdAt} />
                </div>
              );
            }
            if (p.type === "tool_summary") {
              return (
                <div key={p.id} className="transcript__row" data-message-id={p.id}>
                  <ToolGroupSummary tools={p.tools} />
                  <MessageTimeStamp createdAt={timestampOf(p.tools[0])} />
                </div>
              );
            }
            return (
              <div
                key={p.item.id}
                className={`transcript__row${highlightedMessageId === p.item.id ? " transcript__row--highlighted" : ""}`}
                data-message-id={p.item.id}
                data-agent-id={p.item.agentId}
              >
                <ItemRenderer
                  item={p.item}
                  onApprove={onApprove}
                  onEditUserMessage={onEditUserMessage}
                  onRegenerateAssistant={onRegenerateAssistant}
                  shownAgentStatusRef={shownAgentStatusRef}
                />
                <MessageTimeStamp createdAt={timestampOf(p.item)} />
              </div>
            );
          })}
          <div className="transcript__bottom-anchor" />
        </div>
      </div>

      <SelectionReplyButton />

      {showScrollButton && (
        <>
          <div className="transcript__bottom-mask" aria-hidden="true" />
          <button
            type="button"
            className="transcript__scroll-button"
            onClick={handleScrollButtonClick}
            aria-label="滚到最新"
            title="滚到最新"
            data-testid="transcript-scroll-to-bottom"
          >
            <ChevronRight size={16} style={{ transform: "rotate(90deg)" }} />
          </button>
        </>
      )}
    </div>
  );
}

function ItemRenderer({
  item,
  onApprove,
  onEditUserMessage,
  onRegenerateAssistant,
  shownAgentStatusRef,
}: {
  item: ReasonixItem;
  onApprove?: (id: string, allow: boolean) => void;
  onEditUserMessage?: (messageId: string, newText: string) => void;
  onRegenerateAssistant?: (messageId: string) => void;
  shownAgentStatusRef?: React.MutableRefObject<Set<string>>;
}) {
  const localRef = useRef<Set<string>>(new Set());
  const statusRef = shownAgentStatusRef ?? localRef;
  
  switch (item.kind) {
    case "user":
      return (
        <UserMessageRow
          id={item.id}
          text={item.text}
          streaming={Boolean((item as { streaming?: boolean }).streaming)}
          onEdit={onEditUserMessage}
        />
      );

    case "assistant":
      return (
        <AssistantMessageRow
          id={item.id}
          text={item.text}
          streaming={item.streaming}
          reasoning={item.reasoning}
          toolCalls={item.toolCalls}
          createdAt={item.createdAt}
          onRegenerate={onRegenerateAssistant}
        />
      );

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

    case "agent_status": {
      const statusKey = `${item.backend}:${item.status}`;
      if (statusRef.current.has(statusKey)) {
        return null;
      }
      statusRef.current.add(statusKey);
      return (
        <MessageAgentStatus
          id={item.id}
          backend={item.backend}
          status={item.status}
          agentName={item.agentName}
          agentId={item.agentId}
        />
      );
    }

    case "tips":
      return (
        <MessageTips
          id={item.id}
          level={item.level}
          text={item.text}
          code={item.code}
          structuredError={item.structuredError}
          agentId={item.agentId}
        />
      );

    case "plan":
      return (
        <MessagePlan
          id={item.id}
          title={item.title}
          entries={item.entries}
          agentId={item.agentId}
        />
      );

    case "skill_suggest":
      return (
        <MessageSkillSuggest
          id={item.id}
          name={item.name}
          description={item.description}
          content={item.content}
          agentId={item.agentId}
        />
      );

    case "cron_trigger":
      return (
        <MessageCronTrigger
          id={item.id}
          cronJobId={item.cronJobId}
          cronJobName={item.cronJobName}
          triggeredAt={item.triggeredAt}
          agentId={item.agentId}
        />
      );

    case "available_commands":
      return (
        <MessageAvailableCommands
          id={item.id}
          commands={item.commands}
          agentId={item.agentId}
        />
      );

    case "notice": {
      const lvl = item.level;
      const lvlClass = lvl === "error" || lvl === "warn" || lvl === "info" ? `notice--${lvl}` : "";
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

/**
 * UserMessageRow — AionUi-style user message rendering.
 * Uses MessageText component with isUserMessage={true} for consistent styling.
 */
export function UserMessageRow({
  id,
  text,
  streaming,
  onEdit,
}: {
  id: string;
  text: string;
  streaming?: boolean;
  onEdit?: (messageId: string, newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  if (editing) {
    return (
      <div className="user-message-edit" data-message-id={id}>
        <div className="user-message-edit__form" data-testid="user-message-edit-form">
          <textarea
            className="user-message-edit__textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={Math.max(2, Math.min(8, draft.split("\n").length))}
            data-testid="user-message-edit-textarea"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const trimmed = draft.trim();
                if (trimmed && trimmed !== text) {
                  onEdit?.(id, trimmed);
                }
                setEditing(false);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(text);
                setEditing(false);
              }
            }}
          />
          <div className="user-message-edit__actions">
            <button
              type="button"
              className="user-message-edit__cancel"
              onClick={() => {
                setDraft(text);
                setEditing(false);
              }}
              title="取消 (Esc)"
              data-testid="user-message-edit-cancel"
            >
              <X size={12} />
            </button>
            <button
              type="button"
              className="user-message-edit__save"
              onClick={() => {
                const trimmed = draft.trim();
                if (trimmed && trimmed !== text) {
                  onEdit?.(id, trimmed);
                }
                setEditing(false);
              }}
              disabled={!draft.trim() || draft.trim() === text}
              title="保存并重发 (Enter)"
              data-testid="user-message-edit-save"
            >
              <Check size={12} />
              <span>保存并重发</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canEdit = Boolean(onEdit) && !streaming;

  return (
    <div className="user-message" data-message-id={id}>
      <MessageText
        id={id}
        content={text}
        isUserMessage={true}
        createdAt={timestampOf({ kind: "user", id, text })}
      />
      {canEdit && (
        <div className="user-message-actions" data-testid="user-message-actions">
          <button
            type="button"
            className="user-message__edit-btn"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
            title="编辑并重发"
            data-testid="user-message-edit-button"
          >
            <Pencil size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * AssistantMessageRow — AionUi-style assistant message rendering.
 */
export function AssistantMessageRow({
  id,
  text,
  streaming,
  reasoning,
  toolCalls,
  createdAt,
  onRegenerate,
}: {
  id: string;
  text: string;
  streaming?: boolean;
  reasoning?: string;
  toolCalls?: ToolCall[];
  createdAt?: number;
  onRegenerate?: (messageId: string) => void;
}) {
  const canRegenerate = Boolean(onRegenerate) && !streaming;
  return (
    <div className="assistant-message" data-message-id={id}>
      <AssistantMessageBody
        id={id}
        text={text}
        streaming={streaming}
        reasoning={reasoning}
        toolCalls={toolCalls}
        createdAt={createdAt}
      />
      {canRegenerate && (
        <div className="msg__actions msg__actions--assistant" data-testid="assistant-message-actions">
          <button
            type="button"
            className="msg__action-btn"
            onClick={() => onRegenerate?.(id)}
            title="重新生成此回答"
            data-testid="assistant-message-regenerate-button"
          >
            <RefreshCw size={12} />
            <span>重新生成</span>
          </button>
        </div>
      )}
    </div>
  );
}

function AssistantMessageBody({
  id,
  text,
  streaming,
  reasoning,
  toolCalls = [],
  createdAt,
  agentId,
}: {
  id?: string;
  text: string;
  streaming?: boolean;
  reasoning?: string;
  toolCalls?: ToolCall[];
  createdAt?: number;
  agentId?: string;
}) {
  const thinkingMeta = useMessageStore((s) => s.currentThinkingMeta);
  const msgId = id ?? "";
  const isLiveTurn = Boolean(streaming);
  const liveThinkingMeta = isLiveTurn ? thinkingMeta : null;

  // Track tool execution start time
  const toolStartTimeRef = useRef<number | null>(null);
  useEffect(() => {
    if (toolCalls.length > 0 && toolStartTimeRef.current === null) {
      toolStartTimeRef.current = Date.now();
    }
    if (toolCalls.length === 0) {
      toolStartTimeRef.current = null;
    }
  }, [toolCalls.length]);

  // 阶段1: 思考中 (Thinking) - 在最前面
  const isThinking = liveThinkingMeta?.status === "active";
  const thinkingDone = liveThinkingMeta?.status === "done";

  // 阶段2: 工具执行中 (Tool Execution) - 思考完成后、回答前
  const hasActiveTools = toolCalls.length > 0;
  const isToolExecuting = isLiveTurn && hasActiveTools;

  // 阶段3: 最终回答 (Final Answer) - 思考和工具都完成后
  const hasFinalOutput = !isLiveTurn && text;

  // 修复：流式输出时，如果有reasoning，不要同时显示MessageText，避免重复
  const showLiveText = isLiveTurn && !isToolExecuting && !reasoning;

  return (
    <div className="assistant-message-body">
      {agentId && (
        <div className="assistant-message-body__agent">
          <AgentBadge size="md" />
        </div>
      )}

      {/* 阶段1: 思考过程 - 显示在最前面 */}
      {(isThinking || thinkingDone || reasoning) && (
        <ThinkingDisplay
          content={reasoning ?? ""}
          status={liveThinkingMeta?.status ?? (reasoning ? "done" : "active")}
          startTime={liveThinkingMeta?.startTime ?? createdAt ?? Date.now()}
          duration={liveThinkingMeta?.duration}
        />
      )}

      {/* 阶段2: 工具执行过程 - 思考完成后显示，类似思考过程的显示方式 */}
      {(isToolExecuting || (hasActiveTools && !isLiveTurn)) && (
        <ToolExecutionDisplay
          tools={toolCalls}
          startTime={toolStartTimeRef.current ?? createdAt ?? Date.now()}
        />
      )}

      {/* 阶段3: 最终回答 - 最后显示 */}
      {hasFinalOutput && (
        <MessageText 
          id={msgId} 
          content={text} 
          createdAt={createdAt ?? Date.now()}
        />
      )}

      {/* 流式输出时显示（没有reasoning时） */}
      {showLiveText && (
        <MessageText 
          id={msgId} 
          content={text} 
          createdAt={createdAt ?? Date.now()}
        />
      )}
    </div>
  );
}

function ToolCard({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(item.status === "error");
  const kind: string | undefined = item.kind === "tool" ? item.kind2 ?? undefined : item.kind;
  const diff: any[] | undefined = Array.isArray(item.diff) ? item.diff : undefined;
  const hasDiff = (kind === "edit" || kind === "write" || /edit|write|replace/i.test(item.name ?? "")) && diff && diff.length > 0;
  const isExec = kind === "execute" || /exec|bash|command/i.test(item.name ?? "");
  
  if (hasDiff) {
    return <ReplacePreview item={item} diff={diff!} />;
  }

  const statusIcon: Record<string, React.ReactNode> = {
    running: <Loader2 size={12} className="spin" />,
    in_progress: <Loader2 size={12} className="spin" />,
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

  const subject = isExec ? commandSubject(item.args) : fileSubject(item.args) || (typeof item.args === "object" ? JSON.stringify(item.args).slice(0, 50) : "");
  const hasDetail = item.args || item.result;
  const agentMeta = getAgentMeta(item.agentId);

  return (
    <div className={`tool ${item.status === "running" || item.status === "in_progress" ? "tool--running" : ""}`} style={{ borderLeftColor: agentMeta.color }}>
      <div
        className={`tool__row ${hasDetail ? "tool__row--clickable" : ""}`}
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
      >
        <span className={`tool__chevron ${expanded ? "tool__chevron--open" : ""}`}>
          {expanded ? <ChevronRight size={12} /> : null}
        </span>
        <span className="tool__icon">{statusIcon[item.status] ?? statusIcon.pending}</span>
        <span className="tool__name" style={{ color: agentMeta.color }}>{kindLabel}</span>
        {subject && <span className="tool__subject">{expanded ? subject : truncate(subject, 80)}</span>}
        {item.agentId && <AgentBadge agentId={item.agentId} />}
        {hasDetail && (
          <span className="tool__expand-hint">
            <ChevronRight size={10} />
          </span>
        )}
      </div>

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

function ReplacePreview({ item, diff }: { item: any; diff: any[] }) {
  const filePath = fileSubject(item.args) || "unknown";
  const fileName = filePath.split(/[/\\]/).pop() || filePath;
  const agentMeta = getAgentMeta(item.agentId);

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
    <div className="tool tool--has-diff" style={{ borderLeftColor: agentMeta.color }}>
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
        {diff.oldText !== undefined && <div className="tool__diff-line tool__diff-line--remove">- {diff.oldText}</div>}
        {diff.newText !== undefined && <div className="tool__diff-line tool__diff-line--add">+ {diff.newText}</div>}
      </>
    );
  }
  if (diff.type === "add") return <div className="tool__diff-line tool__diff-line--add">+ {diff.newText ?? ""}</div>;
  if (diff.type === "remove") return <div className="tool__diff-line tool__diff-line--remove">- {diff.oldText ?? ""}</div>;
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

function timestampOf(item: ReasonixItem): number | undefined {
  const maybe = (item as { createdAt?: number }).createdAt;
  if (typeof maybe === "number" && Number.isFinite(maybe) && maybe > 0) return maybe;
  return Date.now();
}

function MessageTimeStamp({ createdAt }: { createdAt?: number }) {
  if (!createdAt) return null;
  const label = formatMessageTime(createdAt);
  if (!label) return null;
  return (
    <span className="transcript__time" title={new Date(createdAt).toISOString()}>
      {label}
    </span>
  );
}
