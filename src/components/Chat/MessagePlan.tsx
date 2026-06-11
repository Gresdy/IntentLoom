/**
 * MessagePlan — AionUi `MessagePlan` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessagePlan.tsx
 *
 * Renders an inline plan / todo list as a collapsible block. The plan
 * items are emitted by the agent ("I will: 1. read the file 2. refactor
 * the loop 3. run the tests") and the user can see the live progress
 * without leaving the transcript.
 *
 * Status mapping (AionUi):
 *   - completed   → filled green check (IconCheckCircle)
 *   - everything else (pending / in_progress / skipped) → empty rounded
 *     square, with a 2px outline for in_progress to read as "active"
 */

import { useState } from "react";
import { CheckCircle2, ListChecks, ChevronDown, ChevronRight } from "lucide-react";

export type PlanEntryStatus = "pending" | "in_progress" | "completed" | "skipped";

export interface PlanEntry {
  id: string;
  content: string;
  status: PlanEntryStatus;
}

export interface MessagePlanProps {
  id: string;
  title?: string;
  entries: PlanEntry[];
  agentId?: string;
}

const STATUS_LABEL: Record<PlanEntryStatus, string> = {
  pending: "待办",
  in_progress: "进行中",
  completed: "已完成",
  skipped: "已跳过",
};

function EntryBullet({ status }: { status: PlanEntryStatus }) {
  if (status === "completed") {
    return <CheckCircle2 size={16} strokeWidth={3} className="message-plan__bullet message-plan__bullet--done" />;
  }
  if (status === "in_progress") {
    return (
      <span
        className="message-plan__bullet message-plan__bullet--active"
        aria-label={STATUS_LABEL.in_progress}
        data-status={status}
      />
    );
  }
  if (status === "skipped") {
    return (
      <span
        className="message-plan__bullet message-plan__bullet--skipped"
        aria-label={STATUS_LABEL.skipped}
        data-status={status}
      />
    );
  }
  return (
    <span
      className="message-plan__bullet"
      aria-label={STATUS_LABEL.pending}
      data-status={status}
    />
  );
}

export function MessagePlan(props: MessagePlanProps) {
  const { title, entries, agentId } = props;
  const [open, setOpen] = useState(true);

  const completed = entries.filter((e) => e.status === "completed").length;
  const total = entries.length;

  return (
    <div className="message-plan" data-testid="message-plan" data-plan-total={total} data-plan-completed={completed}>
      <button
        type="button"
        className="message-plan__header"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ListChecks size={14} className="message-plan__icon" />
        <span className="message-plan__title">{title ?? "待办列表"}</span>
        <span className="message-plan__progress">
          {completed}/{total}
        </span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && (
        <ol className="message-plan__entries" role="list">
          {entries.map((e, i) => (
            <li
              key={e.id ?? `${i}-${e.content}`}
              className="message-plan__entry"
              data-status={e.status}
            >
              <EntryBullet status={e.status} />
              <span className={`message-plan__content ${e.status === "completed" ? "message-plan__content--done" : ""}`}>
                {e.content}
              </span>
            </li>
          ))}
        </ol>
      )}
      {agentId && <span className="message-plan__agent" data-agent-id={agentId} />}
    </div>
  );
}

export default MessagePlan;
