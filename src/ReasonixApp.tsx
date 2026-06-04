import { useCallback, useState, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SquarePen, History, Settings, Command, Moon, Sun, Bot,
  FolderOpen, Search, Terminal, Code, Server,
  Logs, MessageSquare,
  ChartBar, Users, ChevronRight, X,
  Sparkles, MessageCircle,
} from "lucide-react";
import { useReasonixController } from "./lib/reasonixAdapter";
import type { Mode } from "./lib/reasonixAdapter";
import { Transcript } from "./components/Chat/ReasonixTranscript";
import { Composer } from "./components/Chat/ReasonixComposer";
import { StatusBar } from "./components/layout/ReasonixStatusBar";
import { SettingsDrawer } from "./components/layout/SettingsDrawer";
import { HistoryDrawer } from "./components/layout/HistoryDrawer";
import { CommandPalette, useCommandPalette } from "./components/common/CommandPalette";
import { ToastContainer } from "./components/common/ToastContainer";
import { useThemeStore } from "./stores/useThemeStore";
import { useModelStore } from "./stores/useModelStore";
import type { AppId } from "./shared/types";
import { invoke } from "./lib/tauri";

// Lazy load panels
const AgentsPanel = lazy(() => import("./components/LeftPanel/AgentsPanel").then(m => ({ default: m.AgentsPanel })));
const ProjectsPanel = lazy(() => import("./components/LeftPanel/ProjectsPanel").then(m => ({ default: m.ProjectsPanel })));
const SkillsPanel = lazy(() => import("./components/LeftPanel/SkillsPanel").then(m => ({ default: m.SkillsPanel })));
const PromptsPanel = lazy(() => import("./components/LeftPanel/PromptsPanel").then(m => ({ default: m.PromptsPanel })));
const McpPanel = lazy(() => import("./components/LeftPanel/McpPanel").then(m => ({ default: m.McpPanel })));
const UsageDashboard = lazy(() => import("./components/LeftPanel/UsageDashboard").then(m => ({ default: m.UsageDashboard })));
const LogsPanel = lazy(() => import("./components/LeftPanel/LogsPanel").then(m => ({ default: m.LogsPanel })));
const ExpertPanel = lazy(() => import("./components/LeftPanel/ExpertPanel").then(m => ({ default: m.ExpertPanel })));

type NavKey = "chat" | "projects" | "agents" | "model" | "prompts" | "mcp" | "usage" | "skills" | "expert" | "sessions" | "logs" | "hermes" | "search" | "settings";

interface NavItem {
  key: NavKey;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { key: "chat", icon: <MessageCircle size={18} />, label: "聊天" },
      { key: "agents", icon: <Bot size={18} />, label: "AI 助手" },
      { key: "sessions", icon: <MessageSquare size={18} />, label: "会话管理" },
    ],
  },
  {
    label: "项目",
    items: [
      { key: "projects", icon: <FolderOpen size={18} />, label: "项目管理" },
      { key: "skills", icon: <Code size={18} />, label: "Skills" },
      { key: "expert", icon: <Users size={18} />, label: "专家" },
      { key: "prompts", icon: <Sparkles size={18} />, label: "Prompts" },
    ],
  },
  {
    label: "系统",
    items: [
      { key: "model", icon: <Terminal size={18} />, label: "模型配置" },
      { key: "mcp", icon: <Server size={18} />, label: "MCP" },
      { key: "usage", icon: <ChartBar size={18} />, label: "用量统计" },
      { key: "logs", icon: <Logs size={18} />, label: "日志" },
      { key: "hermes", icon: <Bot size={18} />, label: "Hermes Agent" },
    ],
  },
];

// Agent tabs config
const ALL_AGENTS: { id: AppId; label: string; shortLabel: string }[] = [
  { id: "claude", label: "Claude Code", shortLabel: "Claude" },
  { id: "codex", label: "Codex", shortLabel: "Codex" },
  { id: "gemini", label: "Gemini CLI", shortLabel: "Gemini" },
  { id: "opencode", label: "OpenCode", shortLabel: "OpenCode" },
  { id: "openclaw", label: "OpenClaw", shortLabel: "OpenClaw" },
];

function isNavKey(value: string | null): value is NavKey {
  if (!value) return false;
  return [
    "chat", "projects", "agents", "model", "prompts", "mcp",
    "usage", "skills", "expert", "sessions", "logs", "hermes", "search", "settings",
  ].includes(value);
}

const PANEL_TITLES: Record<NavKey, string> = {
  chat: "聊天",
  projects: "项目管理",
  agents: "AI 助手",
  model: "模型配置",
  prompts: "Prompts",
  mcp: "MCP",
  usage: "用量统计",
  skills: "Skills",
  expert: "专家",
  sessions: "会话管理",
  logs: "日志",
  hermes: "Hermes Agent",
  search: "搜索",
  settings: "设置",
};

export const ReasonixApp: React.FC = () => {
  const {
    state, send, cancel, approve,
    setPlan, setBypass,
    newSession, listSessions, resumeSession, deleteSession, renameSession, pickWorkspace,
  } = useReasonixController();

  const [mode, setMode] = useState<Mode>("normal");
  const [histView, setHistView] = useState<any[] | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  // URL is the source of truth for navigation state: deep links,
  // browser back/forward, and reload all stay in sync.
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get("panel");
  const activeNav: NavKey = isNavKey(panelParam) ? panelParam : "chat";
  const rightPanelOpen = activeNav !== "chat";
  const settingsOpen = searchParams.get("view") === "settings";
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { currentApp, setCurrentApp } = useModelStore();

  // Navigation: chat = close panel, others = open panel, settings = open drawer.
  // Each call writes the URL, so deep links and back/forward stay correct.
  const handleNavClick = useCallback(
    (key: NavKey) => {
      const next = new URLSearchParams(searchParams);
      if (key === "chat") {
        next.delete("panel");
      } else if (key === "settings") {
        next.set("view", "settings");
      } else {
        next.set("panel", key);
        next.delete("view");
      }
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  // Switch agent
  const handleAgentSwitch = useCallback((appId: AppId) => {
    setCurrentApp(appId);
    // Also switch via backend if available
    invoke("switch_agent", { agentId: appId }).catch(() => {});
  }, [setCurrentApp]);

  // Toggle mode
  const applyMode = useCallback((m: Mode) => {
    setMode(m);
    setPlan(m === "plan");
    setBypass(m === "yolo");
  }, [setPlan, setBypass]);

  const cycleMode = useCallback(() => {
    const next = mode === "normal" ? "plan" : mode === "plan" ? "yolo" : "normal";
    if (next === "yolo") {
      const ok = window.confirm("YOLO 模式允许 AI 不经确认直接执行操作。确定开启？");
      if (!ok) return;
    }
    applyMode(next);
  }, [mode, applyMode]);

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen(true);
      } else if (mod && e.key === "n") {
        e.preventDefault();
        newSession();
      } else if (mod && e.key === "b") {
        e.preventDefault();
        setSidebarExpanded((v) => !v);
      } else if (mod && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setThemeMode(themeMode === "dark" ? "light" : "dark");
      } else if (e.key === "Escape") {
        if (cmdPaletteOpen) {
          setCmdPaletteOpen(false);
        } else if (settingsOpen) {
          const next = new URLSearchParams(searchParams);
          next.delete("view");
          setSearchParams(next, { replace: true });
        } else if (rightPanelOpen) {
          const next = new URLSearchParams(searchParams);
          next.delete("panel");
          setSearchParams(next, { replace: true });
        } else if (histView !== null) {
          setHistView(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newSession, setThemeMode, themeMode, cmdPaletteOpen, rightPanelOpen, histView, settingsOpen, searchParams, setSearchParams]);

  // Command palette commands
  const commands = useCommandPalette({
    onNewChat: () => { newSession(); setCmdPaletteOpen(false); },
    onOpenFolder: async () => { await pickWorkspace?.(); setCmdPaletteOpen(false); },
    onSettings: () => {
  const next = new URLSearchParams(searchParams);
  next.set("view", "settings");
  setSearchParams(next, { replace: true });
  setCmdPaletteOpen(false);
},
    onToggleTheme: () => { setThemeMode(themeMode === "dark" ? "light" : "dark"); },
  });

  // Right panel content
  const renderRightPanel = () => {
    switch (activeNav) {
      case "agents":
        return (
          <Suspense fallback={<PanelLoader />}>
            <AgentsPanel />
          </Suspense>
        );
      case "projects":
        return (
          <Suspense fallback={<PanelLoader />}>
            <ProjectsPanel />
          </Suspense>
        );
      case "skills":
        return (
          <Suspense fallback={<PanelLoader />}>
            <SkillsPanel />
          </Suspense>
        );
      case "prompts":
        return (
          <Suspense fallback={<PanelLoader />}>
            <PromptsPanel />
          </Suspense>
        );
      case "mcp":
        return (
          <Suspense fallback={<PanelLoader />}>
            <McpPanel />
          </Suspense>
        );
      case "usage":
        return (
          <Suspense fallback={<PanelLoader />}>
            <UsageDashboard />
          </Suspense>
        );
      case "logs":
        return (
          <Suspense fallback={<PanelLoader />}>
            <LogsPanel />
          </Suspense>
        );
      case "expert":
        return (
          <Suspense fallback={<PanelLoader />}>
            <ExpertPanel />
          </Suspense>
        );
      case "sessions":
        return (
          <Suspense fallback={<PanelLoader />}>
            <SessionsPanel
              onResume={(path) => {
  setHistView(null);
  resumeSession(path);
  const next = new URLSearchParams(searchParams);
  next.delete("panel");
  setSearchParams(next, { replace: true });
}}
              onDelete={(path) => deleteSession(path)}
              onRename={(path, title) => renameSession(path, title)}
            />
          </Suspense>
        );
      case "hermes":
        return <HermesPanel />;
      case "model":
        return <ModelPanel />;
      case "search":
        return <SearchPanel />;
      default:
        return (
          <div style={{ padding: 24, color: "var(--fg-dim)", fontSize: 13 }}>
            选择左侧菜单查看功能
          </div>
        );
    }
  };

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <nav className={`sidebar${sidebarExpanded ? " sidebar--expanded" : ""}`} data-testid="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__logo">I</div>
          <span className="sidebar__title">IntentLoom</span>
        </div>

        <div className="sidebar__nav">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="sidebar__nav-group">
              {sidebarExpanded && group.label && (
                <div className="sidebar__nav-group-label">{group.label}</div>
              )}
              {group.items.map((item) => (
                <button
                  key={item.key}
                  className={`sidebar__nav-item${activeNav === item.key && rightPanelOpen ? " active" : ""}`}
                  onClick={() => handleNavClick(item.key)}
                  title={!sidebarExpanded ? item.label : undefined}
                >
                  <span className="sidebar__nav-item-icon">{item.icon}</span>
                  <span className="sidebar__nav-item-label">{item.label}</span>
                </button>
              ))}
              {gi < NAV_GROUPS.length - 1 && (
                <div className="sidebar__nav-separator" />
              )}
            </div>
          ))}
        </div>

        <div className="sidebar__footer">
          <button
            className="sidebar__nav-item"
            onClick={() => handleNavClick("settings")}
            title={!sidebarExpanded ? "设置" : undefined}
          >
            <span className="sidebar__nav-item-icon"><Settings size={18} /></span>
            <span className="sidebar__nav-item-label">设置</span>
          </button>

          <button
            className="sidebar__toggle"
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
          >
            <ChevronRight size={14} className={`sidebar__toggle-icon${sidebarExpanded ? " sidebar__toggle-icon--expanded" : ""}`} />
            {sidebarExpanded && <span>收起</span>}
          </button>
        </div>
      </nav>

      {/* ── Main Area ── */}
      <div className="main-area">
        {/* Top Bar */}
        <header className="topbar">
          {/* Agent Tabs */}
          <div className="agent-tabs">
            {ALL_AGENTS.map((agent) => (
              <button
                key={agent.id}
                className={`agent-tab${currentApp === agent.id ? " active" : ""}`}
                onClick={() => handleAgentSwitch(agent.id)}
                title={agent.label}
              >
                <Bot size={12} />
                {sidebarExpanded ? agent.label : agent.shortLabel}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="topbar__spacer" />

          {/* Model path */}
          <span className="topbar__model">{state.meta?.cwd || "IntentLoom"}</span>

          {/* Right controls */}
          <div className="topbar__right">
            {/* Mode toggle */}
            <button
              className={`mode-badge mode-badge--${mode}`}
              onClick={cycleMode}
            >
              <span className="mode-badge__dot" />
              {mode === "normal" ? "NORMAL" : mode === "plan" ? "PLAN" : "YOLO"}
            </button>

            <button className="chip chip--icon" onClick={() => setCmdPaletteOpen(true)} title="命令面板 (Ctrl+K)">
              <Command size={13} />
            </button>
            <button className="chip chip--icon" onClick={() => listSessions().then(setHistView)} disabled={state.running} title="历史记录">
              <History size={13} />
            </button>
            <button className="chip chip--icon" onClick={() => pickWorkspace?.()} title="选择工作目录">
              <FolderOpen size={13} />
            </button>
            <button className="chip chip--icon" onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")} title="切换主题">
              {themeMode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button className="chip chip--icon" onClick={newSession} title="新建会话">
              <SquarePen size={13} />
            </button>
          </div>
        </header>

        {/* Startup error */}
        {state.meta?.startupErr && (
          <div className="banner banner--error">{state.meta.startupErr}</div>
        )}

        {/* Main Content */}
        <main className="main">
          <Transcript items={state.items} onNewChat={newSession} onPickWorkspace={pickWorkspace} />
        </main>

        {/* Footer */}
        <footer className="footer">
          <Composer
            running={state.running}
            mode={mode}
            onSend={send}
            onCancel={cancel}
            onCycleMode={cycleMode}
          />
          <StatusBar
            running={state.running}
            mode={mode}
            turnStartAt={state.turnStartAt}
            turnTokens={state.turnTokens}
            onOpenFolder={() => pickWorkspace?.()}
            cwd={state.meta?.cwd}
          />
        </footer>
      </div>

      {/* ── Right Panel (slide-in) ── */}
      {rightPanelOpen && (
        <>
          <div className="right-panel-backdrop" onClick={() => {
  const next = new URLSearchParams(searchParams);
  next.delete("panel");
  setSearchParams(next, { replace: true });
}} />
          <div className="right-panel">
            <div className="right-panel__head">
              <div className="right-panel__title">
                <Sparkles size={14} className="ilo-fg-accent" />
                {PANEL_TITLES[activeNav]}
              </div>
              <button className="chip chip--icon" onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("panel");
                setSearchParams(next, { replace: true });
              }}>
                <X size={14} />
              </button>
            </div>
            <div className="right-panel__body">
              {renderRightPanel()}
            </div>
          </div>
        </>
      )}

      {/* ── Command Palette ── */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        commands={commands}
      />

      {/* ── Toast ── */}
      <ToastContainer />

      {/* ── Permission Modal ── */}
      {state.approval && (
        <div className="modal-backdrop">
          <div className="modal animate-fadeIn">
            <div className="modal__head">
              <div className="modal__title">⚠️ 权限请求</div>
            </div>
            <div className="approval">
              <div className="approval__tool">{state.approval.tool}</div>
              <div className="approval__args">{state.approval.args}</div>
              <div className="approval__actions">
                <button className="approval__btn" onClick={() => approve(state.approval!.id, false)}>拒绝</button>
                <button className="approval__btn approval__btn--allow" onClick={() => approve(state.approval!.id, true)}>允许</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── History Drawer ── */}
      {histView !== null && (
        <HistoryDrawer
          sessions={histView}
          onResume={(path) => { setHistView(null); resumeSession(path); }}
          onDelete={(path) => { deleteSession(path); listSessions().then(setHistView); }}
          onRename={(path, title) => { renameSession(path, title); listSessions().then(setHistView); }}
          onClose={() => setHistView(null)}
        />
      )}

      {/* ── Settings Drawer ── */}
      {settingsOpen && <SettingsDrawer onClose={() => {
  const next = new URLSearchParams(searchParams);
  next.delete("view");
  setSearchParams(next, { replace: true });
}} />}
    </div>
  );
};

// ── Supporting Components ─────────────────────────────────────────────────────

function PanelLoader() {
  return (
    <div className="panel-loader">
      <div className="panel-loader__spinner" />
    </div>
  );
}

function SessionsPanel({ onResume, onDelete, onRename: _onRename }: {
  onResume: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, title: string) => void;
}) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<any[]>("list_sessions").then(setSessions).catch(() => setSessions([])).finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoader />;
  if (!sessions.length) return (
    <div className="panel-empty">暂无会话记录</div>
  );

  return (
    <div className="session-list">
      {sessions.map((s) => (
        <div key={s.id || s.path} className="session-row" onClick={() => onResume(s.path)}>
          <MessageSquare size={14} className="ilo-fg-dim session-row__icon" />
          <div className="session-row__body">
            <div className="session-row__title">{s.title || "无标题会话"}</div>
            {s.preview && <div className="session-row__preview">{s.preview}</div>}
          </div>
          <button className="chip chip--icon session-row__delete" onClick={(e) => { e.stopPropagation(); onDelete(s.path); }}>
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ModelPanel() {
  const { currentProviderId, providers, switchProvider } = useModelStore();
  const providerList = Object.values(providers);

  return (
    <div className="model-panel">
      <div className="model-panel__section">
        <h3 className="model-panel__heading">当前模型</h3>
        <select
          className="model-panel__select"
          value={currentProviderId}
          onChange={(e) => switchProvider(e.target.value)}
        >
          {providerList.map((p) => (
            <option key={p.id} value={p.id}>{p.name} {p.settingsConfig?.ANTHROPIC_MODEL ? "(" + p.settingsConfig.ANTHROPIC_MODEL + ")" : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <h3 className="model-panel__heading">可用模型</h3>
        {providerList.map((p) => (
          <div
            key={p.id}
            className={`model-card${currentProviderId === p.id ? " model-card--active" : ""}`}
            onClick={() => switchProvider(p.id)}
          >
            <div className="model-card__name">{p.name}</div>
            <div className="model-card__model">{p.settingsConfig?.ANTHROPIC_MODEL || p.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await invoke<any[]>("search_code", { query, cwd: "" });
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  return (
    <div className="search-panel">
      <div className="search-panel__bar">
        <input
          className="search-panel__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜索代码..."
        />
        <button onClick={handleSearch} disabled={searching} className="chip chip--on">
          <Search size={13} />
        </button>
      </div>
      {results.map((r, i) => (
        <div key={i} className="search-panel__row">
          <div className="search-panel__file">{r.file}</div>
          <div className="search-panel__line">{r.line}</div>
        </div>
      ))}
      {!results.length && query && !searching && (
        <div className="search-panel__empty">无结果</div>
      )}
    </div>
  );
}

function HermesPanel() {
  const switchHermesMode = (window as any).__hermesStore?.switchHermesMode;

  return (
    <div className="hermes-panel">
      <div className="hermes-panel__card">
        <div className="hermes-panel__title-row">
          <Bot size={18} className="ilo-fg-accent" />
          <span className="hermes-panel__title">Hermes Agent</span>
          <span className="hermes-panel__badge">已激活</span>
        </div>
        <p className="hermes-panel__desc">
          Hermes 是 IntentLoom 的本地 AI 助手，运行在您的设备上，保护隐私。
        </p>
      </div>
      <div>
        <h3 className="hermes-panel__heading">模式</h3>
        {["normal", "plan", "yolo"].map((m) => (
          <button
            key={m}
            className="hermes-panel__mode-btn"
            onClick={() => switchHermesMode?.(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
