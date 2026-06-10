import { useRef, useEffect, useState } from "react";
import type { ReasonixItem } from "../../lib/reasonixAdapter";
import { ChevronRight, Loader2, FolderOpen, Bot, FileEdit, FilePlus2, Terminal, Sparkles } from "lucide-react";
import { ConversationSummary } from "../Loom/ConversationSummary";
import { ThinkingDisplay } from "./ThinkingDisplay";
import { useMessageStore } from "@/stores/messageStore";

interface TranscriptProps {
  items: ReasonixItem[];
  onPrompt?: (text: string) => void;
  onNewChat?: () => void;
  onPickWorkspace?: () => void;
  /**
   * Drop a fully-rendered demo turn (user prompt → thinking →
   * tool calls → assistant text) into the active conversation.
   * Powers the “查看示例对话” affordance on the welcome screen
   * so the user can see chat + thinking + tool rendering live in
   * the browser, even without the Claude CLI installed.
   */
  onSeedDemo?: () => void;
}

export function Transcript({ items, onPrompt, onNewChat, onPickWorkspace, onSeedDemo }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

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
      {items.map((item) => <ItemRenderer key={item.id} item={item} />)}
      <div ref={bottomRef} />
    </div>
  );
}

function ItemRenderer({ item }: { item: ReasonixItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg msg--user">
          <span className="msg__caret">›</span>
          <div className="msg__text">{item.text}</div>
        </div>
      );

    case "assistant":
      return <AssistantMessage text={item.text} streaming={item.streaming} reasoning={item.reasoning} />;

    case "tool":
      return <ToolCard item={item as any} />;

    case "phase":
      return <div className="phase">{item.text}</div>;

    case "notice":
      // Map the streaming controller's `level` ("info" / "warn" /
      // "error") to the matching CSS modifier so the banner picks
      // up the right red / amber / neutral background. We only
      // emit the modifier when the level is one we recognise —
      // unknown values fall through to a plain `.notice` block
      // rather than dumping a bogus class name into the DOM.
      const lvl = item.level;
      const lvlClass =
        lvl === "error" || lvl === "warn" || lvl === "info"
          ? `notice--${lvl}`
          : "";
      return (
        <div className={lvlClass ? `notice ${lvlClass}` : "notice"} role={lvl === "error" ? "alert" : "status"}>
          {item.text}
        </div>
      );

    case "summary":
      return <ConversationSummary summary={item.tally} />;

    default:
      return null;
  }
}

function AssistantMessage({ text, streaming, reasoning }: { text: string; streaming?: boolean; reasoning?: string }) {
  const [showReasoning, setShowReasoning] = useState(false);
  // The live ThinkingDisplay lifecycle (status, start time,
  // final duration) lives in `messageStore.currentThinkingMeta`
  // because the streaming controller is the only writer. The
  // raw `reasoning` text is also passed in as a prop because
  // the controller already snapshots it onto either the
  // persisted message (history view) or the live `currentThinking`
  // (active turn) — so the prop carries the right string in
  // both render paths.
  const thinkingMeta = useMessageStore((s) => s.currentThinkingMeta);

  // The `ThinkingDisplay` is only meaningful for the LIVE
  // streaming turn. For the persisted history view we keep
  // the old collapsible "思考过程" affordance so a user
  // scrolling back through yesterday's session still sees
  // the reasoning (with no live timer) and can expand it
  // for context. The two surfaces are different on purpose:
  // live = animated card, history = static disclosure.
  const isLiveTurn = Boolean(streaming);

  return (
    <div className="msg msg--assistant">
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

// ToolCard — three branches:
//   1. `edit` kind + diff present   → render +/- diff inline (W3 of the loom plan)
//   2. `edit` kind + no diff        → fall through to plain args
//   3. `execute` kind               → render the command in a monospace block
//   4. everything else              → args summary + JSON on expand
function ToolCard({ item }: { item: any }) {
  // AionUi-style: auto-expand on error so the user sees
  // WHAT failed without having to click. Default
  // collapsed on success / running.
  const [expanded, setExpanded] = useState(item.status === "error");
  // `kind2` carries the underlying tool kind (edit / execute / read);
  // `kind` itself is the ReasonixItem discriminator and is always
  // "tool" at this point. Fall through to `kind` for safety so an
  // un-rewrapped item (e.g. test fixtures) still gets a sensible
  // branch.
  const kind: string | undefined =
    item.kind === "tool" ? item.kind2 ?? undefined : item.kind;
  const diff: any[] | undefined = Array.isArray(item.diff) ? item.diff : undefined;
  const hasDiff = kind === "edit" && diff && diff.length > 0;
  const isExec = kind === "execute";
  const isRead = kind === "read";

  const statusIcon: Record<string, React.ReactNode> = {
    running: <Loader2 size={12} className="spin ilo-fg-accent" />,
    success: <span className="ilo-fg-ok">✓</span>,
    error: <span className="ilo-fg-err">✗</span>,
    pending: <span className="ilo-fg-faint">○</span>,
  };

  // AionUi-style status badge — text next to the icon,
  // so the user can read the state at a glance without
  // having to interpret the icon colour. Mirrors the
  // `<Tag color="green">` / `<Tag color="red">` pattern
  // but as plain text to avoid a `<Tag>` dependency.
  const statusBadge: Record<string, { text: string; cls: string }> = {
    running: { text: "进行中", cls: "tool__status--running" },
    success: { text: "完成", cls: "tool__status--ok" },
    error: { text: "失败", cls: "tool__status--err" },
    pending: { text: "等待", cls: "tool__status--pending" },
  };

  // Per-tool-type friendly label — same as AionUi's
  // `MessageCodexToolCall` `GenericDisplay` fallback.
  // Falls back to the raw tool name when we don't
  // recognise the kind.
  const friendlyKind: Record<string, string> = {
    read: "Read",
    write: "Write",
    edit: "Edit",
    execute: "Bash",
    search: "Search",
    fetch: "Fetch",
  };
  const kindLabel = friendlyKind[kind ?? ""] ?? item.name;

  const subject = hasDiff
    ? fileSubject(item.args)
    : isExec
    ? commandSubject(item.args)
    : isRead
    ? fileSubject(item.args)
    : fileSubject(item.args) || JSON.stringify(item.args).slice(0, 50);

  const icon = hasDiff
    ? item.args && fileSubject(item.args) && /create|write/i.test(item.name || "")
      ? <FilePlus2 size={12} className="ilo-fg-accent" />
      : <FileEdit size={12} className="ilo-fg-accent" />
    : isExec
    ? <Terminal size={12} className="ilo-fg-accent" />
    : isRead
    ? <FileEdit size={12} className="ilo-fg-accent" />
    : null;

  return (
    <div className={`tool ${item.status === "running" ? "tool--running" : ""} ${hasDiff ? "tool--has-diff" : ""} ${isExec ? "tool--exec" : ""}`}>
      <button className="tool__row tool__row--clickable" onClick={() => setExpanded(!expanded)}>
        <span className={`tool__chevron ${expanded ? "tool__chevron--open" : "tool__chevron--placeholder"}`}>
          {expanded ? <ChevronRight size={12} /> : null}
        </span>
        <span className="tool__icon">{statusIcon[item.status]}</span>
        {statusBadge[item.status] && (
          <span className={`tool__status ${statusBadge[item.status].cls}`}>
            {statusBadge[item.status].text}
          </span>
        )}
        {icon}
        <span className="tool__name">{kindLabel}</span>
        <span className="tool__subject">{subject}</span>
      </button>

      {hasDiff && (
        <div className="tool__diff">
          {diff!.map((d, i) => (
            <DiffLine key={i} diff={d} />
          ))}
        </div>
      )}

      {isExec && subject && (
        <div className="tool__cmd">
          <pre className="code">{commandSubject(item.args)}</pre>
        </div>
      )}

      {/* AionUi-style: for `Read` / `Write` results, render
       * the raw text (often a file body) without
       * JSON.stringify — the previous version wrapped
       * everything in a JSON object, which made file
       * contents unreadable. For unknown tool kinds
       * we still fall through to JSON so the user gets
       * SOMETHING visible. */}
      {expanded && item.result && !hasDiff && (
        isRead ? (
          <div className="tool__body tool__body--read">
            <pre className="code">{String(item.result)}</pre>
          </div>
        ) : isExec && item.result && typeof item.result === "object" && "exit_code" in item.result ? (
          // Codex `command_execution` rich payload: the actual
          // shell command, its aggregated stdout+stderr, the
          // exit code, and the final status. Show the exit
          // code as a small chip next to the body so a non-zero
          // exit stands out, and render the aggregated output
          // as a code block instead of a JSON dump. The raw
          // JSON fallback below would render this as
          // `{ command: ..., aggregated_output: ..., ... }`
          // which is unreadable for a `cat` / `ls` result.
          <div className="tool__body tool__body--exec">
            <div className="tool__exec-header">
              <span className="tool__exec-label">输出</span>
              <span className={"tool__exec-exit" + (item.result.exit_code === 0 ? " tool__exec-exit--ok" : " tool__exec-exit--err")}>
                exit {String(item.result.exit_code)}
              </span>
            </div>
            <pre className="code">{String(item.result.aggregated_output ?? "")}</pre>
          </div>
        ) : typeof item.result === "string" ? (
          <div className="tool__body">
            <pre className="code">{item.result}</pre>
          </div>
        ) : (
          <div className="tool__body">
            <pre className="code">{JSON.stringify(item.result, null, 2)}</pre>
          </div>
        )
      )}
      {item.status === "error" && <div className="tool__err">{item.result}</div>}
    </div>
  );
}

function DiffLine({ diff }: { diff: any }) {
  // `diff.type` is one of 'add' | 'remove' | 'diff' | 'content'.
  // 'diff' and 'content' carry oldText/newText; for those we render
  // both halves as paired lines so reviewers can scan them.
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
  }
  return "";
}

function commandSubject(args: any): string {
  if (args && typeof args === "object" && typeof args.command === "string") {
    return args.command;
  }
  return "";
}
