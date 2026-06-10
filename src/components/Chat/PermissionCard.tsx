/**
 * PermissionCard — AionUI-style inline permission request card.
 *
 * Directly mirrors AionUI's `MessagePermission` component:
 *   - Card with action icon (⚡ exec / ✏️ edit / 📖 info / 🔌 mcp)
 *   - Title + command/code display
 *   - Radio.Group for options (Allow Once / Always Allow / Deny)
 *   - Button confirm with disabled state until selection
 *   - "✓ Response sent" success feedback
 *
 * AionUI reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessagePermission.tsx
 */

import { useState } from "react";
import { AgentBadge } from "./AgentBadge";

export interface PermissionCardProps {
  id: string;
  toolName: string;
  args: any;
  reason?: string;
  status: "pending" | "approved" | "denied";
  agentId?: string;
  onApprove?: (id: string, allow: boolean) => void;
}

/** AionUI's actionIcons map */
const actionIcons: Record<string, string> = {
  exec: "⚡",
  edit: "✏️",
  info: "📖",
  mcp: "🔌",
};

/** AionUI's command_type detection */
function getActionType(toolName: string): string {
  const name = toolName.toLowerCase();
  if (name.includes("exec") || name.includes("bash") || name.includes("command")) return "exec";
  if (name.includes("edit") || name.includes("write") || name.includes("replace")) return "edit";
  if (name.includes("mcp")) return "mcp";
  return "info";
}

export function PermissionCard({ id, toolName, args, reason, status, agentId, onApprove }: PermissionCardProps) {
  const action = getActionType(toolName);
  const icon = actionIcons[action] || "🔐";

  // AionUI pattern: derive display title and command type
  const displayTitle = reason || getDisplayTitle(toolName);
  const commandType = action === "exec" ? (args?.command ?? args?.cmd ?? "") : "";
  const description = args && typeof args === "object" && action === "edit"
    ? (args.file_path ?? args.path ?? "")
    : "";

  const [selected, setSelected] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [hasResponded, setHasResponded] = useState(false);

  // AionUI pattern: Radio.Group options
  const options = getOptions(action, toolName);

  const handleConfirm = async () => {
    if (hasResponded || !selected) return;
    setIsResponding(true);
    try {
      const allow = selected !== "cancel";
      onApprove?.(id, allow);
      setHasResponded(true);
    } finally {
      setIsResponding(false);
    }
  };

  return (
    <div className={`perm-card ${status === "pending" && !hasResponded ? "perm-card--pending" : status === "approved" || hasResponded ? "perm-card--approved" : "perm-card--denied"}`}>
      <div className="perm-card__header">
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span className="perm-card__title">{displayTitle}</span>
        <AgentBadge agentId={agentId} />
        {status !== "pending" && !hasResponded && (
          <span className={`perm-card__status ${status === "approved" ? "perm-card__status--ok" : "perm-card__status--deny"}`}>
            {status === "approved" ? "已允许" : "已拒绝"}
          </span>
        )}
      </div>

      {/* AionUI pattern: show command for exec type */}
      {commandType && (
        <div className="perm-card__code-block">
          <div className="perm-card__code-label">命令</div>
          <code className="perm-card__code">{commandType}</code>
        </div>
      )}

      {/* AionUI pattern: show file path for edit type */}
      {description && description !== displayTitle && (
        <div className="perm-card__desc">{description}</div>
      )}

      {!hasResponded && status === "pending" && (
        <>
          <div className="perm-card__question">选择操作</div>
          <div className="perm-card__options">
            {options.map((opt) => (
              <label key={opt.value} className="perm-card__radio">
                <input
                  type="radio"
                  name={`perm-${id}`}
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
              disabled={!selected || isResponding}
              onClick={handleConfirm}
            >
              {isResponding ? "处理中…" : "确认"}
            </button>
          </div>
        </>
      )}

      {/* AionUI pattern: success feedback after responding */}
      {hasResponded && (
        <div className="perm-card__responded">
          ✓ 响应已发送
        </div>
      )}
    </div>
  );
}

/** AionUI-style options based on action type */
function getOptions(action: string, toolName: string): Array<{ label: string; value: string }> {
  switch (action) {
    case "edit":
      return [
        { label: "允许一次", value: "proceed_once" },
        { label: "始终允许", value: "proceed_always" },
        { label: "拒绝", value: "cancel" },
      ];
    case "exec":
      return [
        { label: "允许执行一次", value: "proceed_once" },
        { label: "始终允许执行", value: "proceed_always" },
        { label: "拒绝", value: "cancel" },
      ];
    case "mcp":
      return [
        { label: "允许一次", value: "proceed_once" },
        { label: `始终允许 ${toolName}`, value: "proceed_always_tool" },
        { label: "始终允许该服务器的所有工具", value: "proceed_always_server" },
        { label: "拒绝", value: "cancel" },
      ];
    default:
      return [
        { label: "继续", value: "proceed_once" },
        { label: "始终继续", value: "proceed_always" },
        { label: "取消", value: "cancel" },
      ];
  }
}

/** Generate a display title from tool name and args */
function getDisplayTitle(toolName: string): string {
  const action = getActionType(toolName);
  switch (action) {
    case "edit":
      return "文件修改请求";
    case "exec":
      return "命令执行请求";
    case "mcp":
      return "MCP 工具调用请求";
    default:
      return "操作确认";
  }
}
