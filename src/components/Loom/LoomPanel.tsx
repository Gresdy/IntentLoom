// LoomPanel — the "weaving loom" on the right side of the app.
//
// Wires three sources of truth together:
//   1. `useModelStore.currentApp`  → the active CLI in the TopBar
//   2. `useConversationStore`     → the current conversation and its
//      most recent user message (used for the intent block)
//   3. `useMessageStore`          → live streaming data (plan, tool
//      calls, thinking, artifacts) from `useReasonixController`
//
// The data flow is intentionally simple: LoomPanel is a *consumer*,
// not a producer. The streaming adapter (`reasonixAdapter.ts`) writes
// into `useMessageStore`; LoomPanel reads from it. When no streaming
// is active, every section falls back to a clear "no data yet" hint
// rather than showing stale or invented content.

import { useMemo } from "react";
import { Bot, ListTodo, Wrench, Package, FileEdit, Terminal, FilePlus2, FileX2 } from "lucide-react";
import { useModelStore } from "@/stores/useModelStore";
import { useMessageStore } from "@/stores/messageStore";
import { useConversationStore } from "@/stores/conversationStore";
import type { ToolCall, PlanEntry } from "@/types/message";
import { buildArtifactSummary, hasAnyArtifact } from "@/lib/artifactTally";

export function LoomPanel() {
  const currentApp = useModelStore((s) => s.currentApp);
  const plan = useMessageStore((s) => s.currentPlan);
  const toolCalls = useMessageStore((s) => s.currentToolCalls);
  const thinking = useMessageStore((s) => s.currentThinking);
  const isStreaming = useMessageStore((s) => s.isStreaming);
  const conversations = useConversationStore((s) => s.conversations);
  const currentConversationId = useConversationStore((s) => s.currentConversationId);

  // The latest user message of the current conversation is the best
  // "intent" proxy we have until Phase 1 wires a real intent parser.
  const intent = useMemo(() => {
    const cur = conversations.find((c) => c.id === currentConversationId);
    if (!cur) return { text: "", type: "" };
    const lastUser = [...cur.messages].reverse().find((m) => m.role === "user");
    return {
      text: lastUser?.content ?? "",
      type: "",
    };
  }, [conversations, currentConversationId]);

  // Tally tool calls into the four artifact buckets the panel shows.
  // This is the "weft → cloth" transition: each tool is a row, the
  // summary is what was woven.
  const artifacts = useMemo(() => buildArtifactSummary(toolCalls), [toolCalls]);

  const isIdle = !isStreaming && toolCalls.length === 0 && !plan;

  return (
    <aside className="loom-panel" aria-label="Loom">
      <div className="loom-panel__head">
        <span className="loom-panel__title">
          <span className="loom-panel__dot" />
          织机
        </span>
        <span className="loom-panel__subtitle">
          {isStreaming ? "编织中" : isIdle ? "空闲" : "已收线"}
        </span>
      </div>

      <div className="loom-panel__body">
        <LoomSection
          icon={<Bot size={12} />}
          title="意图"
          summary={currentApp}
        >
          {intent.text ? (
            <div className="loom-section__intent">{intent.text}</div>
          ) : (
            <div className="loom-section__empty">还没有用户输入</div>
          )}
          {thinking && (
            <div className="loom-section__thinking">
              <span className="loom-section__thinking-dot" />
              AI 正在思考…
            </div>
          )}
        </LoomSection>

        <LoomSection
          icon={<ListTodo size={12} />}
          title="计划"
          empty={isStreaming ? "AI 还没产生计划" : "本对话无计划"}
        >
          {plan && plan.entries.length > 0 ? (
            <PlanList entries={plan.entries} currentIndex={plan.currentIndex} />
          ) : null}
        </LoomSection>

        <LoomSection
          icon={<Wrench size={12} />}
          title="工具"
          empty="还没有工具调用"
        >
          {toolCalls.length > 0 ? (
            <ToolList toolCalls={toolCalls} />
          ) : null}
        </LoomSection>

        <LoomSection
          icon={<Package size={12} />}
          title="产物"
          empty="还没有产物"
        >
          <ArtifactSummary summary={artifacts} />
        </LoomSection>

        <div className="loom-panel__hint">
          右侧的"织机"实时显示当前 CLI 在做什么 —— 计划、工具调用、文件改动。
        </div>
      </div>
    </aside>
  );
}

function LoomSection({
  icon,
  title,
  summary,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary?: string;
  empty?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="loom-section">
      <header className="loom-section__head">
        <span className="loom-section__icon">{icon}</span>
        <h3 className="loom-section__title">{title}</h3>
        {summary && <span className="loom-section__summary">{summary}</span>}
      </header>
      <div className="loom-section__body">
        {children}
        {!children && empty && (
          <div className="loom-section__empty">{empty}</div>
        )}
      </div>
    </section>
  );
}

function PlanList({ entries, currentIndex }: { entries: PlanEntry[]; currentIndex: number }) {
  return (
    <ol className="loom-plan">
      {entries.map((entry, i) => {
        const status =
          entry.status === "completed"
            ? "done"
            : entry.status === "in_progress" || i === currentIndex
            ? "active"
            : entry.status === "skipped"
            ? "skipped"
            : "pending";
        return (
          <li key={entry.id} className={`loom-plan__item loom-plan__item--${status}`}>
            <span className="loom-plan__mark" />
            <span className="loom-plan__title">{entry.title}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ToolList({ toolCalls }: { toolCalls: ToolCall[] }) {
  // Show the most recent 8 tool calls; older ones roll off the bottom.
  const visible = toolCalls.slice(-8);
  return (
    <ul className="loom-tools">
      {visible.map((tc) => {
        const isError = tc.status === "error";
        const isDone = tc.status === "completed";
        const mark = isError ? "✗" : isDone ? "✓" : tc.status === "in_progress" ? "…" : "○";
        const subject = subjectForTool(tc);
        return (
          <li key={tc.id} className={`loom-tools__item loom-tools__item--${tc.status}`}>
            <span className="loom-tools__mark">{mark}</span>
            <span className="loom-tools__name">{tc.name}</span>
            {subject && <span className="loom-tools__subject">{subject}</span>}
          </li>
        );
      })}
      {toolCalls.length > visible.length && (
        <li className="loom-tools__more">…还有 {toolCalls.length - visible.length} 个</li>
      )}
    </ul>
  );
}

function subjectForTool(tc: ToolCall): string {
  const args = tc.arguments ?? {};
  if (typeof args === "object" && args !== null) {
    if ("file_path" in args && typeof args.file_path === "string") return args.file_path;
    if ("path" in args && typeof args.path === "string") return args.path;
    if ("command" in args && typeof args.command === "string") {
      const cmd = args.command as string;
      return cmd.length > 40 ? cmd.slice(0, 37) + "…" : cmd;
    }
  }
  return "";
}
import type { ArtifactTally } from "@/lib/artifactTally";

function ArtifactSummary({ summary }: { summary: ArtifactTally }) {
  if (!hasAnyArtifact(summary)) {
    return null;
  }
  return (
    <ul className="loom-artifacts">
      {summary.added > 0 && (
        <li className="loom-artifacts__row">
          <FilePlus2 size={11} className="loom-artifacts__icon loom-artifacts__icon--add" />
          <span>新增 {summary.added} 个文件</span>
        </li>
      )}
      {summary.modified > 0 && (
        <li className="loom-artifacts__row">
          <FileEdit size={11} className="loom-artifacts__icon loom-artifacts__icon--mod" />
          <span>修改 {summary.modified} 个文件</span>
        </li>
      )}
      {summary.deleted > 0 && (
        <li className="loom-artifacts__row">
          <FileX2 size={11} className="loom-artifacts__icon loom-artifacts__icon--del" />
          <span>删除 {summary.deleted} 个文件</span>
        </li>
      )}
      {summary.commands > 0 && (
        <li className="loom-artifacts__row">
          <Terminal size={11} className="loom-artifacts__icon" />
          <span>执行 {summary.commands} 个命令</span>
        </li>
      )}
      {summary.filesTouched.length > 0 && (
        <li className="loom-artifacts__files">
          {summary.filesTouched.slice(0, 5).map((f) => (
            <span key={f} className="loom-artifacts__file" title={f}>
              {f.split("/").pop() || f}
            </span>
          ))}
          {summary.filesTouched.length > 5 && (
            <span className="loom-artifacts__more">+{summary.filesTouched.length - 5}</span>
          )}
        </li>
      )}
    </ul>
  );
}
