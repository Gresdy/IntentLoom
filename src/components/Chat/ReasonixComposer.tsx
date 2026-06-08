import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUp, Square, Zap, Hash, Lightbulb } from "lucide-react";
import type { AppId } from "../../shared/types";
import type { CliOption } from "../../lib/cliCapabilities";
import { Menu } from "../ui/Menu";
import { useOpenclawSessionStore } from "@/stores/useOpenclawSessionStore";
import { isOpenclawSessionSet } from "@/stores/useOpenclawSessionStore";

// 斜杠命令
const SLASH_COMMANDS = [
  { name: "model", desc: "切换模型", icon: <Zap size={12} /> },
  { name: "memory", desc: "打开记忆", icon: <Lightbulb size={12} /> },
  { name: "plan", desc: "进入计划模式", icon: <Hash size={12} /> },
];

interface ComposerProps {
  running: boolean;
  /** Current CLI selection; used to gate which dropdowns render. */
  cli: AppId;
  /**
   * Whether the active CLI is currently available on $PATH.
   * When `false`, the composer is locked down: the send
   * button is disabled and the textarea placeholder changes
   * to point the user at the AI 助手 panel. The pre-flight
   * check in `reasonixAdapter.send()` is the real source of
   * truth (it short-circuits even if a click gets through),
   * but disabling the button here is the first line of
   * defence and removes the surprise of a click that does
   * nothing. Mirrors the AionUi `useAgentReadinessCheck`
   * `isReady` flag — the consumer is expected to translate
   * it into a visible affordance.
   */
  isAvailable: boolean;
  /** Spec for the current CLI's permission/mode dropdown. Undefined = hidden. */
  modeSpec?: { flagTemplate: string; defaultId: string; options: CliOption[] };
  modeId: string | null;
  onModeChange: (id: string) => void;
  /** Spec for the current CLI's reasoning dropdown. Undefined = hidden. */
  reasoningSpec?: { flagTemplate: string; defaultId: string; options: CliOption[] };
  reasoningId: string | null;
  onReasoningChange: (id: string) => void;
  onSend: (text: string) => void;
  onCancel: () => void;
}

export function Composer({
  running,
  cli,
  isAvailable,
  modeSpec,
  modeId,
  onModeChange,
  reasoningSpec,
  reasoningId,
  onReasoningChange,
  onSend,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashActive, setSlashActive] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 检测斜杠命令
  const slashQuery = useMemo(() => {
    if (!text.startsWith("/") || /\s/.test(text)) return null;
    return text.slice(1).toLowerCase();
  }, [text]);

  const slashMatches = useMemo(
    () =>
      slashQuery === null
        ? []
        : SLASH_COMMANDS.filter((c) => c.name.toLowerCase().includes(slashQuery)).slice(0, 8),
    [slashQuery]
  );

  useEffect(() => {
    setShowSlashMenu(slashMatches.length > 0);
    setSlashActive(0);
  }, [slashMatches]);

  // 自动调整高度
  useEffect(() => {
    const el = taRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [text]);

  // Mount: rows={3} only fires once. Kick the resize effect with
  // the initial (empty) text so the box starts at the right height
  // before the user types anything.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed) {
      onSend(trimmed);
      setText("");
    }
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // 斜杠菜单导航
      if (showSlashMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashActive((a) => (a + 1) % slashMatches.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashActive((a) => (a - 1 + slashMatches.length) % slashMatches.length);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && slashMatches.length > 0)) {
          e.preventDefault();
          const picked = slashMatches[slashActive];
          if (picked) {
            setText("/" + picked.name + " ");
            setShowSlashMenu(false);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setText("");
          setShowSlashMenu(false);
          return;
        }
      }

      // 发送消息 (Enter 不带 Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
        return;
      }
    },
    [showSlashMenu, slashMatches, slashActive, handleSubmit]
  );

  return (
    <div className="composer" data-cli={cli}>
      <div className="composer__wrap">
        {/* 斜杠命令菜单 */}
        {showSlashMenu && (
          <div className="slashmenu">
            {slashMatches.map((cmd, i) => (
              <div
                key={cmd.name}
                className={`slashmenu__item ${i === slashActive ? "slashmenu__item--active" : ""}`}
                onMouseEnter={() => setSlashActive(i)}
                onClick={() => {
                  setText("/" + cmd.name + " ");
                  setShowSlashMenu(false);
                  taRef.current?.focus();
                }}
              >
                <span style={{ color: "var(--accent)", display: "flex", alignItems: "center" }}>
                  {cmd.icon}
                </span>
                <span
                  className="font-mono"
                  style={{ fontWeight: 600, color: "var(--accent)", flexShrink: 0 }}
                >
                  /{cmd.name}
                </span>
                <span style={{ color: "var(--fg-dim)", fontSize: 12 }}>{cmd.desc}</span>
              </div>
            ))}
          </div>
        )}

      {/* 输入框 */}
        <textarea
          ref={taRef}
          className="composer__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isAvailable
              ? "输入消息... (/ 查看命令)"
              : `${cli} 暂未安装或不可用 — 请在 “AI 助手” 面板安装或切换引擎`
          }
          rows={1}
          disabled={running || !isAvailable}
        />

        {/* OpenClaw headless-mode session picker — only when
             the active CLI is OpenClaw. The adapter (see
             `src-tauri/src/agents/openclaw.rs`) refuses to
             run a turn without one of `--to` / `--session-id`
             / `--agent`; the picker below forwards the
             user's choice to the IPC. Three fields, one
             per flag. The adapter picks them in priority
             order (to > sessionId > agent) and ignores the
             rest, so filling all three is harmless but
             redundant — the hint label calls that out.
             Persisted in localStorage via the zustand
             store so the choice survives an app restart. */}
        {cli === "openclaw" && <OpenclawSessionPicker />}

        {/* 操作按钮 */}
        <div className="composer__actions">
          {/* 模式(左侧) */}
          <div className="composer__prefs composer__prefs--left">
            {modeSpec && (
              <Menu
                caption="模式"
                value={modeId}
                options={modeSpec.options}
                onChange={onModeChange}
                downward={false}
              />
            )}
          </div>

          {/* 推理(右侧,紧贴发送按钮) + 发送/取消 — 同一个 send-group 推到最右 */}
          <div className="composer__send-group">
            {reasoningSpec && (
              <Menu
                caption="推理"
                value={reasoningId}
                options={reasoningSpec.options}
                onChange={onReasoningChange}
                downward={false}
                align="right"
              />
            )}
            {running ? (
              <button
                className="composer__cancel"
                onClick={onCancel}
                title="取消 (Ctrl+C)"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="composer__send"
                onClick={handleSubmit}
                disabled={!text.trim() || !isAvailable}
                title={
                  isAvailable
                    ? "发送 (Enter)"
                    : `${cli} 不可用 — 请先在 “AI 助手” 面板安装`
                }
              >
                <ArrowUp size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// OpenClaw session picker — three input fields (to /
// session-id / agent) plus a clear button. Rendered as a
// compact inline row above the composer's mode/send row;
// only mounted when the active CLI is OpenClaw (see the
// parent render). The fields bind directly to the
// `useOpenclawSessionStore` so the same state is read by
// `reasonixAdapter.send` on every send — no extra wiring
// through props.
function OpenclawSessionPicker() {
  const session = useOpenclawSessionStore((s) => s.session);
  const setSession = useOpenclawSessionStore((s) => s.setSession);
  const clearSession = useOpenclawSessionStore((s) => s.clearSession);
  const isSet = isOpenclawSessionSet(session);
  return (
    <div
      className={"composer__openclaw" + (isSet ? " composer__openclaw--set" : "")}
      data-testid="openclaw-session-picker"
    >
      <span className="composer__openclaw-label">会话</span>
      <input
        className="composer__openclaw-input"
        type="text"
        value={session.to ?? ""}
        onChange={(e) => setSession({ ...session, to: e.target.value || undefined })}
        placeholder="--to  E.164"
        title="E.164 phone (e.g. +15555550123). Highest priority."
        aria-label="OpenClaw session: phone"
      />
      <input
        className="composer__openclaw-input"
        type="text"
        value={session.sessionId ?? ""}
        onChange={(e) => setSession({ ...session, sessionId: e.target.value || undefined })}
        placeholder="--session-id"
        title="Session id to continue."
        aria-label="OpenClaw session: id"
      />
      <input
        className="composer__openclaw-input"
        type="text"
        value={session.agent ?? ""}
        onChange={(e) => setSession({ ...session, agent: e.target.value || undefined })}
        placeholder="--agent"
        title="Agent id (e.g. ops). Lowest priority."
        aria-label="OpenClaw session: agent"
      />
      {isSet && (
        <button
          type="button"
          className="composer__openclaw-clear"
          onClick={clearSession}
          title="清空会话"
          aria-label="清空 OpenClaw 会话"
        >
          ×
        </button>
      )}
    </div>
  );
}

