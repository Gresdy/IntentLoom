/**
 * TeammateMessageAvatar — AionUi `TeammateMessageAvatar` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/TeammateMessageAvatar.tsx
 *
 * In multi-agent / multi-conversation runs, an assistant message
 * might be authored by a "teammate" (a sub-conversation spun off
 * to handle a delegated task). AionUi stamps the message with
 * `senderName` + `senderBackend` + `senderConversationId`, and the
 * avatar uses those to render a small colored bubble with the
 * teammate's name.
 *
 * IntentLoom's adapter does not yet emit teammate metadata, but
 * the component is ready — the parent supplies a `sender` object
 * and we render the bubble; if the sender is `undefined`, the
 * component returns `null` (matching AionUi's "no teammate → no
 * avatar" behavior, so the host's default `AgentBadge` still
 * shows for the primary agent).
 */

import { Users } from "lucide-react";
import { AgentBadge, getAgentMeta } from "./AgentBadge";

export interface TeammateSender {
  name: string;
  /** Backend / CLI the teammate is running on. */
  agentType?: string;
  /** Conversation id of the teammate's session. Optional. */
  conversationId?: string;
}

export interface TeammateMessageAvatarProps {
  sender?: TeammateSender;
  /** Override the agent id used to pick the bubble color. */
  agentId?: string;
}

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export function TeammateMessageAvatar({ sender, agentId }: TeammateMessageAvatarProps) {
  if (!sender) return null;
  const meta = getAgentMeta(agentId ?? sender.agentType);
  const color = meta.color;
  return (
    <span
      className="teammate-avatar"
      data-testid="teammate-avatar"
      data-sender-name={sender.name}
      data-sender-agent={sender.agentType ?? ""}
      title={`${sender.name}${sender.agentType ? ` · ${sender.agentType}` : ""}`}
      style={{ backgroundColor: color }}
    >
      <Users size={10} className="teammate-avatar__icon" />
      <span className="teammate-avatar__initials">{initials(sender.name)}</span>
      <span className="teammate-avatar__name">{sender.name}</span>
      {sender.agentType && <AgentBadge agentId={sender.agentType} />}
    </span>
  );
}

export default TeammateMessageAvatar;
