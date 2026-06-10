/**
 * AgentBadge — a small inline chip that shows which CLI agent
 * produced a given message or tool call. The chip carries the
 * agent's brand colour as a left-side accent bar and a short
 * label (e.g. "Claude", "Codex", "Gemini").
 *
 * AionUI references:
 *   - MessageToolCall renders a per-tool `<Tag>` with a coloured
 *     status indicator; we carry the same pattern but keyed by
 *     agent identity rather than tool result status.
 *   - The TopBar session chips already use per-agent colours; the
 *     badge reuses the same palette for consistency.
 */

import type { ReasonixItem } from "@/lib/reasonixAdapter";

/** Agent identity map: id → display name + brand colour.
 *  MUST stay in sync with `globals.css` `.session-row__agent[data-agent]`. */
export const AGENT_META: Record<string, { label: string; color: string; icon: string }> = {
  claude:   { label: "Claude",    color: "#d97757", icon: "C" },
  codex:    { label: "Codex",     color: "#10a37f", icon: "X" },
  gemini:   { label: "Gemini",   color: "#4285f4", icon: "G" },
  opencode: { label: "OpenCode", color: "#8b5cf6", icon: "O" },
  openclaw: { label: "OpenClaw", color: "#f59e0b", icon: "W" },
  hermes:   { label: "Hermes",   color: "#ef4444", icon: "H" },
};

export function getAgentMeta(agentId?: string) {
  if (!agentId) return AGENT_META.claude;
  return AGENT_META[agentId] ?? { label: agentId, color: "#8b8b8b", icon: agentId[0]?.toUpperCase() ?? "?" };
}

export interface AgentBadgeProps {
  agentId?: string;
  size?: "sm" | "md";
}

export function AgentBadge({ agentId, size = "sm" }: AgentBadgeProps) {
  const meta = getAgentMeta(agentId);
  const sizeClass = size === "md" ? "agent-badge--md" : "agent-badge--sm";

  return (
    <span
      className={`agent-badge ${sizeClass}`}
      style={{ "--agent-color": meta.color } as React.CSSProperties}
      title={meta.label}
    >
      <span className="agent-badge__icon">{meta.icon}</span>
      <span className="agent-badge__label">{meta.label}</span>
    </span>
  );
}

/** Hook to derive the agent identity from a ReasonixItem. */
export function useAgentId(item: ReasonixItem): string | undefined {
  return item.agentId;
}
