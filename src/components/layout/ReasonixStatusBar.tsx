import { useState, useEffect } from "react";
import { ChevronDown, FolderOpen, Zap, Cpu, Clock } from "lucide-react";

const MODELS = [
  { id: "claude", name: "Claude Code", provider: "Anthropic" },
  { id: "claude-sonnet", name: "Claude Sonnet", provider: "Anthropic" },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "gemini", name: "Gemini Pro", provider: "Google" },
];

interface StatusBarProps {
  running: boolean;
  mode: "normal" | "plan" | "yolo";
  turnStartAt?: number | null;
  turnTokens: number;
  onOpenFolder?: () => void;
  cwd?: string;
}

export function StatusBar({
  running,
  turnStartAt,
  turnTokens,
  onOpenFolder,
  cwd,
}: StatusBarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [currentModel, setCurrentModel] = useState(MODELS[0]);

  useEffect(() => {
    if (!running || !turnStartAt) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(
      () => setElapsed(Math.floor((Date.now() - turnStartAt) / 1000)),
      1000
    );
    return () => clearInterval(interval);
  }, [running, turnStartAt]);

  const formatTime = (s: number) =>
    s < 60 ? s + "s" : Math.floor(s / 60) + "m " + (s % 60) + "s";

  // 截断路径显示
  const displayCwd = cwd
    ? cwd.length > 40
      ? "..." + cwd.slice(-37)
      : cwd
    : null;

  return (
    <div className="statusbar">
      {/* 模型选择 */}
      <div style={{ position: "relative" }}>
        <button className="modelsw__trigger" onClick={() => setShowMenu(!showMenu)}>
          <Zap size={11} />
          <span className="modelsw__label">{currentModel.name}</span>
          <ChevronDown size={11} />
        </button>
        {showMenu && (
          <>
            <div className="modelsw__backdrop" onClick={() => setShowMenu(false)} />
            <div className="modelsw__menu">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  className={`modelsw__item ${m.id === currentModel.id ? "modelsw__item--current" : ""}`}
                  onClick={() => {
                    setCurrentModel(m);
                    setShowMenu(false);
                  }}
                >
                  <span className="modelsw__model">{m.name}</span>
                  <span style={{ color: "var(--fg-faint)", fontSize: 10 }}>
                    {m.provider}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 状态 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {running ? (
          <span style={{ color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
            <Cpu size={11} className="animate-spin" style={{ display: "inline" }} />
            {formatTime(elapsed)}
            {turnTokens > 0 && " · " + turnTokens + " tokens"}
          </span>
        ) : (
          <span
            style={{
              color: "var(--fg-faint)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
            }}
          >
            <Clock size={11} />
            就绪
          </span>
        )}
      </div>

      {/* 目录 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
        {displayCwd && (
          <span
            style={{
              color: "var(--fg-faint)",
              fontSize: 11,
              fontFamily: "var(--mono)",
              maxWidth: 200,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={cwd}
          >
            {displayCwd}
          </span>
        )}
        <button
          className="statusbar__cwd"
          onClick={onOpenFolder}
          title="选择工作目录"
        >
          <FolderOpen size={11} />
          <span>选择目录</span>
        </button>
      </div>
    </div>
  );
}
