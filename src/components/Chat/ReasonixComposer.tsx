import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { ArrowUp, Square, Zap, Hash, Lightbulb } from "lucide-react";
import type { Mode } from "../../lib/reasonixAdapter";

// 斜杠命令
const SLASH_COMMANDS = [
  { name: "model", desc: "切换模型", icon: <Zap size={12} /> },
  { name: "memory", desc: "打开记忆", icon: <Lightbulb size={12} /> },
  { name: "plan", desc: "进入计划模式", icon: <Hash size={12} /> },
];

interface ComposerProps {
  running: boolean;
  mode: Mode;
  onSend: (text: string) => void;
  onCancel: () => void;
  onCycleMode: () => void;
}

export function Composer({
  running,
  mode,
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

  // 模式颜色
  const modeColors: Record<Mode, { bg: string; text: string }> = {
    normal: { bg: "var(--bg-elev-2)", text: "var(--fg-faint)" },
    plan: { bg: "var(--accent-soft)", text: "var(--accent)" },
    yolo: { bg: "#e5484d", text: "#fff" },
  };

  return (
    <div className="composer">
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
          placeholder="输入消息... (/ 查看命令)"
          rows={3}
          disabled={running}
        />

        {/* 操作按钮 */}
        <div className="composer__actions">
          {/* 模式指示 */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
            style={{
              background: modeColors[mode].bg,
              color: modeColors[mode].text,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: modeColors[mode].text }}
            />
            {mode === "normal" ? "NORMAL" : mode === "plan" ? "PLAN" : "YOLO"}
          </div>

          {/* 发送/取消 */}
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
              disabled={!text.trim()}
              title="发送 (Enter)"
            >
              <ArrowUp size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
