/**
 * MessageTips — AionUi `MessageTips` port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageTips.tsx
 *
 * Renders an `error / warning / success / info` notice card. AionUi uses
 * this for both generic system notices AND for the rich structured-error
 * payload emitted by the agent gateway (ownership tag, retryable flag,
 * resolution hint). IntentLoom's adapter doesn't emit the full AionUi
 * shape yet, but the structuredError field is plumbed through so the
 * renderer is ready the moment the adapter catches up.
 *
 * Visual rule:
 *   - error: red 8px-radius card with a left bar
 *   - warning: amber
 *   - success: green
 *   - info: subtle border, no left bar
 *   - JSON bodies: auto-detected and rendered as a <pre> code block
 *   - non-JSON long text: collapsed after 3 lines with a "展开 / 收起"
 *     toggle (AionUi `CollapsibleContent` pattern)
 */

import { useState } from "react";
import { AlertTriangle, Info, CheckCircle2, AlertOctagon, ChevronDown, ChevronRight } from "lucide-react";

export type TipsLevel = "info" | "success" | "warning" | "error";

export interface StructuredError {
  message: string;
  code?: string;
  ownership?: "aionui" | "user_agent" | "user_llm_provider" | "unknown_upstream";
  retryable?: boolean;
  detail?: string;
  resolution?: string;
  workspacePath?: string;
}

export interface MessageTipsProps {
  id: string;
  level: TipsLevel;
  text: string;
  code?: string;
  structuredError?: StructuredError;
  agentId?: string;
}

const OWNERSHIP_LABEL: Record<NonNullable<StructuredError["ownership"]>, string> = {
  aionui: "AionUi 内部错误",
  user_agent: "CLI/Agent 错误",
  user_llm_provider: "模型提供方错误",
  unknown_upstream: "上游未知错误",
};

const RESOLUTION_LABEL: Record<string, string> = {
  retry: "可重试",
  wait_for_current_response: "等待当前响应",
  start_new_session: "开新会话",
  reconnect_agent: "重连 Agent",
  check_agent_login: "检查 Agent 登录态",
  check_agent_installation: "检查 Agent 安装",
  check_agent_version: "检查 Agent 版本",
  check_local_command: "检查本地命令",
  check_provider_credentials: "检查 Provider 凭据",
  check_provider_billing: "检查 Provider 余额",
  check_provider_base_url: "检查 Provider Base URL",
  change_model: "换模型",
  reduce_context: "缩短上下文",
  send_feedback: "发送反馈",
};

function StatusIcon({ level }: { level: TipsLevel }) {
  switch (level) {
    case "error":
      return <AlertOctagon size={14} />;
    case "warning":
      return <AlertTriangle size={14} />;
    case "success":
      return <CheckCircle2 size={14} />;
    case "info":
    default:
      return <Info size={14} />;
  }
}

/** Detect whether a string is a single JSON object / array and return
 *  the parsed shape, or undefined. The detector is conservative — it
 *  requires both the first and last non-whitespace character to be
 *  `{` / `}` or `[` / `]` to avoid the obvious false-positive of an
 *  essay that starts with a curly quote. */
function parseJsonOrUndefined(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (trimmed.length < 2) return undefined;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (!((first === "{" && last === "}") || (first === "[" && last === "]"))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export function MessageTips(props: MessageTipsProps) {
  const { level, text, code, structuredError, agentId } = props;
  const [expanded, setExpanded] = useState(false);
  const [showTech, setShowTech] = useState(false);

  // Structured-error path: rich error card with ownership + retryable + resolution
  if (structuredError) {
    const ownership = structuredError.ownership;
    return (
      <div
        className={`message-tips message-tips--error`}
        data-testid="message-tips-error"
        data-error-code={structuredError.code ?? code}
        role="alert"
      >
        <div className="message-tips__header">
          <StatusIcon level="error" />
          <span className="message-tips__title">
            {structuredError.code ? `错误 ${structuredError.code}` : "Agent 错误"}
          </span>
        </div>
        <div className="message-tips__body">
          {ownership && (
            <span className={`message-tips__tag message-tips__tag--ownership-${ownership}`}>
              {OWNERSHIP_LABEL[ownership]}
            </span>
          )}
          {structuredError.retryable !== undefined && (
            <span className={`message-tips__tag message-tips__tag--${structuredError.retryable ? "retry-yes" : "retry-no"}`}>
              {structuredError.retryable ? "可重试" : "不可重试"}
            </span>
          )}
          {structuredError.workspacePath && (
            <span className="message-tips__tag">工作区 {structuredError.workspacePath}</span>
          )}
          <div className="message-tips__message">{structuredError.message}</div>
          {structuredError.resolution && (
            <div className="message-tips__resolution">
              <strong>建议:</strong> {RESOLUTION_LABEL[structuredError.resolution] ?? structuredError.resolution}
            </div>
          )}
          {(structuredError.detail || code) && (
            <button
              type="button"
              className="message-tips__tech-toggle"
              onClick={() => setShowTech(!showTech)}
              aria-expanded={showTech}
            >
              {showTech ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <span>技术细节</span>
            </button>
          )}
          {showTech && (
            <pre className="message-tips__tech-detail">
              {[
                code ? `code: ${code}` : "",
                structuredError.detail ?? "",
                text,
              ]
                .filter(Boolean)
                .join("\n")}
            </pre>
          )}
        </div>
        {agentId && <span className="message-tips__agent" data-agent-id={agentId} />}
      </div>
    );
  }

  // Info level: lightweight inline notice
  if (level === "info") {
    return (
      <div className="message-tips message-tips--info" data-testid="message-tips-info" role="status">
        <span className="message-tips__inline-text">{text}</span>
      </div>
    );
  }

  // Try JSON auto-highlight first
  const json = parseJsonOrUndefined(text);
  if (json !== undefined) {
    return (
      <div
        className={`message-tips message-tips--${level}`}
        data-testid={`message-tips-${level}`}
        role={level === "error" ? "alert" : "status"}
      >
        <div className="message-tips__header">
          <StatusIcon level={level} />
          {code && <span className="message-tips__code">{code}</span>}
        </div>
        <pre className="message-tips__json">{JSON.stringify(json, null, 2)}</pre>
      </div>
    );
  }

  // Long text: collapsible
  const isLong = text.length > 160;
  return (
    <div
      className={`message-tips message-tips--${level}`}
      data-testid={`message-tips-${level}`}
      role={level === "error" ? "alert" : "status"}
    >
      <div className="message-tips__header">
        <StatusIcon level={level} />
        {code && <span className="message-tips__code">{code}</span>}
      </div>
      <div className="message-tips__body">
        <span className={`message-tips__text ${!expanded && isLong ? "message-tips__text--truncated" : ""}`}>
          {text}
        </span>
        {isLong && (
          <button
            type="button"
            className="message-tips__expand"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            {expanded ? "收起" : "展开全部"}
          </button>
        )}
      </div>
    </div>
  );
}

export default MessageTips;
