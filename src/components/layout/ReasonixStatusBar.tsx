import { useMemo, useState, useEffect } from "react";
import { ChevronDown, FolderOpen, Zap, Cpu, Clock } from "lucide-react";
import { useModelStore, effectiveModelForCli } from "@/stores/useModelStore";
import { findModel } from "@/config/cliPresets";

interface StatusBarProps {
  running: boolean;
  turnStartAt?: number | null;
  turnTokens: number;
  onOpenFolder?: () => void;
  cwd?: string;
  /**
   * Called when the user picks a model / provider from the menu.
   * The id is routed to either `switchProvider` (for known
   * providers) or `setCurrentApp` (for top-tab CLI ids) inside
   * `reasonixAdapter.setModel`; this component just passes the
   * chosen id through.
   */
  onSetModel?: (id: string) => void;
}

export function StatusBar({
  running,
  turnStartAt,
  turnTokens,
  onOpenFolder,
  cwd,
  onSetModel,
}: StatusBarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Derive the dropdown contents from the live model store. The
  // previous hardcoded `MODELS` array was a 0.x demo — it had no
  // relationship to whatever the user had actually configured —
  // and the click only logged. The 0.x array is now gone; the
  // menu reads `providers` instead. If the user has not yet
  // imported a preset (T10 wires that up), the menu collapses
  // to a single "current CLI" entry derived from `currentApp`,
  // so the trigger label still reflects something honest.
  const { providers, currentProviderId, currentApp } = useModelStore();
  const menuItems = useMemo(() => {
    const fromProviders = Object.values(providers).map((p) => ({
      id: p.id,
      name: p.name,
      provider: p.type ?? "",
    }));
    if (fromProviders.length > 0) return fromProviders;
    return [{ id: currentApp, name: currentApp, provider: "default" }];
  }, [providers, currentApp]);
  const activeModelId = currentProviderId || currentApp;
  // Surface the current CLI's model in the statusbar so the
  // user can see at-a-glance what is about to run. Reads from
  // `currentModelByCli[currentApp]` with the per-CLI default
  // fallback (`effectiveModelForCli`) so the first render
  // shows a real label, not "(未选)".
  const state = useModelStore.getState();
  const activeModel = effectiveModelForCli(state, currentApp);
  const activeModelLabel =
    findModel(currentApp as Parameters<typeof findModel>[0], activeModel)?.label ?? activeModel;

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
      <div style={{ position: "relative" }}>
        <button
          className="modelsw__trigger"
          onClick={() => setShowMenu((v) => !v)}
          title={activeModelId}
        >
          <Zap size={11} />
          <span className="modelsw__label" title={activeModelLabel}>
            {activeModelLabel || activeModelId}
          </span>
          <ChevronDown size={11} />
        </button>
        {showMenu && (
          <>
            <div className="modelsw__backdrop" onClick={() => setShowMenu(false)} />
            <div className="modelsw__menu">
              {menuItems.map((m) => (
                <button
                  key={m.id}
                  className={`modelsw__item ${m.id === activeModelId ? "modelsw__item--current" : ""}`}
                  onClick={() => {
                    onSetModel?.(m.id);
                    setShowMenu(false);
                  }}
                >
                  <span className="modelsw__model">{m.name}</span>
                  {m.provider && (
                    <span style={{ color: "var(--fg-faint)", fontSize: 10 }}>
                      {m.provider}
                    </span>
                  )}
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
