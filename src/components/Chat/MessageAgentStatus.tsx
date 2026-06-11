/**
 * MessageAgentStatus — AionUi `MessageAgentStatus` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageAgentStatus.tsx
 *
 * Renders a single agent session lifecycle badge. AionUi emits one of
 * these for every backend (Claude / Qwen / Codex / remote) at session
 * start so the user can see "Connecting…" → "Connected" → "Authenticated"
 * → "Session active" without having to guess why the prompt hasn't been
 * acknowledged yet.
 *
 * The IntentLoom port is intentionally simpler than AionUi's:
 *   - No FeedbackButton (we don't have a feedback subsystem yet).
 *   - The agent-name resolution falls back through
 *     `agentName` → `agentId` → capitalised `backend`, so the
 *     store can stuff any of the three without breaking the UI.
 *   - `disconnected` is treated as a no-op render (matches AionUi,
 *     which hides historical records of disconnected sessions).
 */

import { Loader2, CheckCircle2, AlertTriangle, Plug, Radio } from "lucide-react";
import { AgentBadge, getAgentMeta } from "./AgentBadge";

export type AgentLifecycleStatus =
  | "connecting"
  | "connected"
  | "authenticated"
  | "session_active"
  | "error";

export interface MessageAgentStatusProps {
  id: string;
  backend: string;
  status: AgentLifecycleStatus;
  agentName?: string;
  agentId?: string;
}

const STATUS_LABELS: Record<AgentLifecycleStatus, string> = {
  connecting: "正在连接…",
  connected: "已连接",
  authenticated: "已认证",
  session_active: "会话已激活",
  error: "连接出错",
};

function StatusIcon({ status }: { status: AgentLifecycleStatus }) {
  switch (status) {
    case "connecting":
      return <Loader2 size={12} className="spin ilo-fg-accent" />;
    case "connected":
    case "authenticated":
    case "session_active":
      return <CheckCircle2 size={12} className="ilo-fg-ok" />;
    case "error":
      return <AlertTriangle size={12} style={{ color: "var(--danger, #f87171)" }} />;
  }
}

export function MessageAgentStatus(props: MessageAgentStatusProps) {
  const { backend, status, agentName, agentId } = props;

  if ((status as string) === "disconnected") return null;

  // AionUi: agent_name (extension/custom) > detected agent name > capitalised backend
  const meta = getAgentMeta(agentId ?? backend);
  const displayName = agentName || meta.label || backend.charAt(0).toUpperCase() + backend.slice(1);

  const isSuccess = status === "connected" || status === "authenticated" || status === "session_active";
  const isConnecting = status === "connecting";

  const containerClass = [
    "agent-status-message",
    "agent-status-message--" + status,
  ].join(" ");

  return (
    <div
      className={containerClass}
      data-testid={`agent-status-${status}`}
      data-agent-backend={backend}
      role="status"
    >
      <span className="agent-status-message__icon" aria-hidden="true">
        {isConnecting ? <Plug size={12} /> : isSuccess ? <Radio size={12} /> : <StatusIcon status={status} />}
      </span>
      <span className="agent-status-message__name">{displayName}</span>
      <span className="agent-status-message__sep" aria-hidden="true">·</span>
      <span className="agent-status-message__label">
        <StatusIcon status={status} />
        <span>{STATUS_LABELS[status]}</span>
      </span>
      {agentId && <AgentBadge agentId={agentId} />}
    </div>
  );
}

export default MessageAgentStatus;
