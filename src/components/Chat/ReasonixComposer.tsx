import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUp, Square, AtSign, Paperclip, X } from "lucide-react";
import type { AppId } from "../../shared/types";
import type { CliOption } from "../../lib/cliCapabilities";
import type { ModelOption } from "../../config/cliPresets";
import { Menu } from "../ui/Menu";
import { useOpenclawSessionStore } from "@/stores/useOpenclawSessionStore";
import { isOpenclawSessionSet } from "@/stores/useOpenclawSessionStore";
import { SlashCommandMenu, DEFAULT_SLASH_COMMANDS, type SlashCommand } from "./SlashCommandMenu";

// Slash commands are now provided by `SlashCommandMenu` (AionUi port).

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
  /**
   * Effective reasoning spec — already filtered against the
   * current model's `supportsReasoning` flag. `undefined`
   * means the dropdown should disappear entirely (the model
   * does not have a reasoning knob). See
   * `getEffectiveReasoningSpec` in `cliCapabilities.ts`.
   */
  reasoningSpec?: { flagTemplate: string; defaultId: string; options: CliOption[] };
  reasoningId: string | null;
  onReasoningChange: (id: string) => void;
  /** Models available for the current CLI. Empty = no picker. */
  models: ModelOption[];
  /** Currently selected model id. Null = "let the CLI default kick in". */
  modelId: string | null;
  onModelChange: (id: string) => void;
  onSend: (text: string, attachments?: { name: string; size: number; type?: string }[]) => void;
  onCancel: () => void;
  /**
   * Slash command interceptor. When the textarea text matches a known
   * slash command (name or alias), the composer calls this instead of
   * `onSend`. Returns `true` if the command was handled — the composer
   * clears the textarea; returns `false` if it was not handled, in
   * which case the composer falls back to `onSend` so the user can
   * still paste unknown slash commands to the LLM.
   */
  onCommand?: (cmd: SlashCommand, args: string) => boolean | void;
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
  models,
  modelId,
  onModelChange,
  onSend,
  onCancel,
  onCommand,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashActive, setSlashActive] = useState(0);
  // Drag-and-drop attachments. The parent decides whether to read
  // them via Tauri's fs API, base64-embed them in the prompt, or
  // pass them to an MCP resource. We do NOT block typing while
  // files are attached — the chips live above the textarea.
  const [attachedFiles, setAttachedFiles] = useState<
    { name: string; size: number; type?: string }[]
  >([]);
  // Visual feedback for drag-over. We use a counter so dragenter /
  // dragleave don't flicker when the user crosses child elements.
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
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
        : DEFAULT_SLASH_COMMANDS.filter((c) => c.name.toLowerCase().includes(slashQuery)).slice(0, 8),
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

  /**
   * Resolve a slash command from a free-form string. Returns the matched
   * command plus the trailing argument string (everything after the
   * command token, trimmed). Match is case-insensitive against both
   * the command name and any registered aliases.
   */
  const resolveSlashCommand = useCallback(
    (raw: string): { cmd: SlashCommand; args: string } | null => {
      const m = /^\/([A-Za-z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(raw);
      if (!m) return null;
      const token = m[1].toLowerCase();
      for (const c of DEFAULT_SLASH_COMMANDS) {
        if (c.name.toLowerCase() === token) {
          return { cmd: c, args: (m[2] ?? "").trim() };
        }
        if (c.aliases?.some((a) => a.toLowerCase() === token)) {
          return { cmd: c, args: (m[2] ?? "").trim() };
        }
      }
      return null;
    },
    []
  );

  /**
   * Read a FileList (from drop or paste) and add the files to the
   * attachment list. We only keep name + size + MIME type — the
   * parent reads actual bytes on demand if/when the user sends.
   * Holding File contents in component state would force every
   * attachment into memory even when the user never sends.
   */
  const attachFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type || undefined,
    }));
    if (incoming.length === 0) return;
    setAttachedFiles((prev) => [...prev, ...incoming]);
  }, []);

  // Drag-and-drop wiring. We MUST preventDefault on dragover to
  // allow the drop event to fire; without it the browser opens the
  // file in a new window and the textarea never sees the drop.
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      dragCounter.current += 1;
      if (dragCounter.current === 1) setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        attachFiles(e.dataTransfer.files);
        requestAnimationFrame(() => taRef.current?.focus());
      }
    },
    [attachFiles]
  );

  /**
   * Paste handler — when the clipboard contains files (e.g. a
   * screenshot from the OS clipboard), add them as attachments.
   * Plain-text paste is left to the textarea's default behavior.
   */
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (e.clipboardData.files.length > 0) {
        e.preventDefault();
        attachFiles(e.clipboardData.files);
      }
    },
    [attachFiles]
  );

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Slash commands that the parent registers are intercepted BEFORE
    // hitting the LLM channel. Unknown slash commands fall through to
    // onSend so the user can still paste a literal "/foo" if they want.
    const hit = resolveSlashCommand(trimmed);
    if (hit) {
      const handled = onCommand?.(hit.cmd, hit.args);
      if (handled !== false) {
        setText("");
        return;
      }
    }
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setText("");
    setAttachedFiles([]);
  }, [text, onSend, onCommand, resolveSlashCommand, attachedFiles]);

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
            if (picked.runOnPick) {
              // Fire the slash command immediately. handleSubmit would
              // do the same, but going through onPick keeps the menu
              // closed and avoids a second round of state updates.
              const handled = onCommand?.(picked, "");
              if (handled !== false) {
                setText("");
                setShowSlashMenu(false);
              }
              return;
            }
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
    [showSlashMenu, slashMatches, slashActive, handleSubmit, onCommand]
  );

  return (
    <div
      className={`composer${isDragging ? " composer--dragging" : ""}`}
      data-cli={cli}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="composer__wrap">
        {/* 斜杠命令菜单 */}
        {showSlashMenu && (
          <SlashCommandMenu
            query={slashQuery ?? ""}
            active={slashActive}
            onActiveChange={setSlashActive}
            onPick={(cmd: SlashCommand) => {
              if (cmd.runOnPick) {
                const handled = onCommand?.(cmd, "");
                if (handled !== false) {
                  setText("");
                  setShowSlashMenu(false);
                  taRef.current?.focus();
                }
              } else {
                setText("/" + cmd.name + " ");
                setShowSlashMenu(false);
                taRef.current?.focus();
              }
            }}
          />
        )}

      {/* Attachment chips — show only when there are pending files. */}
        {attachedFiles.length > 0 && (
          <div className="composer__attachments" data-testid="composer-attachments">
            {attachedFiles.map((f, i) => (
              <span key={i} className="composer__attachment-chip" title={f.type ?? f.name}>
                <Paperclip size={11} />
                <span className="composer__attachment-name">{f.name}</span>
                <button
                  type="button"
                  className="composer__attachment-remove"
                  onClick={() =>
                    setAttachedFiles((prev) => prev.filter((_, j) => j !== i))
                  }
                  title="移除附件"
                >
                  <X size={11} />
                </button>
              </span>
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
          onPaste={handlePaste}
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
        {/* @ 提及 / 附件入口 — UI 占位，下一轮接 selection-reply 与文件选择 */}
        <div className="composer__entry-points" role="toolbar" aria-label="composer entry points">
          <button
            type="button"
            className="composer__entry"
            aria-label="插入 @ 提及"
            title="插入 @ 提及（即将支持）"
            data-testid="composer-mention"
            disabled={running || !isAvailable}
            onClick={() => {
              setText((prev) => prev + "@");
              taRef.current?.focus();
            }}
          >
            <AtSign size={14} />
          </button>
          <button
            type="button"
            className="composer__entry"
            aria-label="附加文件"
            title="附加文件（即将支持）"
            data-testid="composer-attach"
            disabled={running || !isAvailable}
            onClick={() => {
              // Phase 4: UI-only placeholder. Phase 5+ will wire a Tauri
              // file picker that converts the picked files into the
              // AionUi AIONUI_FILES_MARKER syntax, then the model can
              // read them through the workspace mount.
            }}
          >
            <Paperclip size={14} />
          </button>
        </div>

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
            {/*
              模型(左侧,在模式之后)。`models.length === 0` 时不渲染
              下拉 — 这是 hermes / openclaw 等 "CLI 自己选模型"
              的标识。`modelId` 为 null 时回退到 CLI 默认(由
              `effectiveModelForCli` 在 send 时解析),所以下拉显示
              永远从 `modelId` 读出,不会因为初始 null 闪烁。
            */}
            {models.length > 0 && (
              <Menu
                caption="模型"
                value={modelId}
                options={models}
                onChange={onModelChange}
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
        {isDragging && (
          <div className="composer__drop-overlay" aria-hidden="true">
            <Paperclip size={20} />
            <span>松开以添加附件</span>
          </div>
        )}
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
