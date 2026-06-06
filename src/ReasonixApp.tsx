import { useCallback, useState, useEffect, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SquarePen, History, Settings, Command, Moon, Sun, Bot, PanelLeftClose, PanelLeftOpen,
  FolderOpen, Search, Terminal, Code, Server,
  Logs, MessageSquare,
  ChartBar, Users, X,
  Sparkles, MessageCircle,
  LayoutGrid,
} from "lucide-react";
import { useReasonixController } from "./lib/reasonixAdapter";
import { Transcript } from "./components/Chat/ReasonixTranscript";
import { Composer } from "./components/Chat/ReasonixComposer";
import { StatusBar } from "./components/layout/ReasonixStatusBar";
import { SettingsDrawer } from "./components/layout/SettingsDrawer";
import { HistoryDrawer } from "./components/layout/HistoryDrawer";
import { CommandPalette, useCommandPalette } from "./components/common/CommandPalette";
import { ToastContainer } from "./components/common/ToastContainer";
import { LoomPanel } from "./components/Loom/LoomPanel";
import { Onboarding } from "./components/Onboarding";
import { Resizer } from "./components/Resizer";
import { ToolsModal } from "./components/layout/ToolsModal";
import { useThemeStore } from "./stores/useThemeStore";
import { useModelStore } from "./stores/useModelStore";
import type { AppId } from "./shared/types";
import { invoke } from "./lib/tauri";
import { useConversationStore, selectCurrentAgentId } from "./stores/conversationStore";
import { useAgentStore, refreshAgentList } from "./lib/useAgents";
import { getModeSpec, getReasoningSpec } from "./lib/cliCapabilities";
import {
  useComposerPrefsStore,
  resolveModeId,
  resolveReasoningId,
} from "./stores/useComposerPrefsStore";

// Lazy load panels
const AgentsPanel = lazy(() => import("./components/LeftPanel/AgentsPanel").then(m => ({ default: m.AgentsPanel })));
const ProjectsPanel = lazy(() => import("./components/LeftPanel/ProjectsPanel").then(m => ({ default: m.ProjectsPanel })));
const SkillsPanel = lazy(() => import("./components/LeftPanel/SkillsPanel").then(m => ({ default: m.SkillsPanel })));
const PromptsPanel = lazy(() => import("./components/LeftPanel/PromptsPanel").then(m => ({ default: m.PromptsPanel })));
const McpPanel = lazy(() => import("./components/LeftPanel/McpPanel").then(m => ({ default: m.McpPanel })));
const UsageDashboard = lazy(() => import("./components/LeftPanel/UsageDashboard").then(m => ({ default: m.UsageDashboard })));
const LogsPanel = lazy(() => import("./components/LeftPanel/LogsPanel").then(m => ({ default: m.LogsPanel })));
const ExpertPanel = lazy(() => import("./components/LeftPanel/ExpertPanel").then(m => ({ default: m.ExpertPanel })));

// Hermes is intentionally absent: it lives in ALL_AGENTS as a top-tab
// peer of Claude / Codex / Gemini, with no dedicated side panel.
type NavKey = "chat" | "projects" | "agents" | "model" | "prompts" | "mcp" | "usage" | "skills" | "expert" | "sessions" | "logs" | "search" | "settings";

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
    ],
  },
];

// Flat view of NAV_GROUPS in display order. Used by the keyboard
// shortcut handler to map Ctrl+1..9 onto the most-used navigation
// targets. Usage / logs are intentionally excluded because nine is a
// useful ceiling for chord-based navigation and those two have lower
// daily hit rate. (Hermes used to live here too; it now lives in
// ALL_AGENTS as a top-tab peer of Claude / Codex.)
const FLAT_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Agent tabs config
// disabled: tab stays in the DOM but cannot be activated. Today the
// list has no disabled entries; every CLI is gated at runtime by
// `isUnavailable` (Phase 1.5), which the adapter registry reports
// Phase 1.5 will additionally gate this on adapter availability
// (i.e. `which` returned None).
const ALL_AGENTS: { id: AppId; label: string; shortLabel: string; disabled?: boolean }[] = [
  { id: "claude", label: "Claude Code", shortLabel: "Claude" },
  { id: "codex", label: "Codex", shortLabel: "Codex" },
  { id: "gemini", label: "Gemini CLI", shortLabel: "Gemini" },
  { id: "opencode", label: "OpenCode", shortLabel: "OpenCode" },
  { id: "openclaw", label: "OpenClaw", shortLabel: "OpenClaw" },
  { id: "hermes", label: "Hermes", shortLabel: "Hermes" },
];

function isNavKey(value: string | null): value is NavKey {
  if (!value) return false;
  return [
    "chat", "projects", "agents", "model", "prompts", "mcp",
    "usage", "skills", "expert", "sessions", "logs", "search", "settings",
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
  search: "搜索",
  settings: "设置",
};

export const ReasonixApp: React.FC = () => {
  const {
    state, send, cancel, approve,
    newSession, listSessions, resumeSession, deleteSession, renameSession, pickWorkspace,
    setModel,
  } = useReasonixController();

  // Per-CLI mode + reasoning selection lives in its own store so it
  // survives CLI switches and is read by reasonixAdapter at send time.
  const setModeForCli = useComposerPrefsStore(
    (s: ReturnType<typeof useComposerPrefsStore.getState>) => s.setMode,
  );
  const setReasoningForCli = useComposerPrefsStore(
    (s: ReturnType<typeof useComposerPrefsStore.getState>) => s.setReasoning,
  );

  const [histView, setHistView] = useState<any[] | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  // Loom panel width lives in localStorage so the column stays at
  // the user's preferred size across reloads. 320 px matches the
  // default baked into globals.css; the [240, 520] range keeps the
  // chat area usable on laptop screens.
  const [loomPanelWidth, setLoomPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 320;
    const raw = window.localStorage.getItem("intentloom.loomWidth");
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 240 && n <= 520 ? n : 320;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("intentloom.loomWidth", String(loomPanelWidth));
    }
  }, [loomPanelWidth]);
  // URL is the source of truth for navigation state: deep links,
  // browser back/forward, and reload all stay in sync.
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get("panel");
  const activeNav: NavKey = isNavKey(panelParam) ? panelParam : "chat";
  const rightPanelOpen = activeNav !== "chat";
  const settingsOpen = searchParams.get("view") === "settings";
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const { currentApp, setCurrentApp } = useModelStore();
  // Phase 1.5: the adapter registry is loaded once on mount so the
  // TopBar can gate CLIs whose binary is missing on disk.
  const agentRegistry = useAgentStore((s) => s.agents);
  const lastLoadedAt = useAgentStore((s) => s.lastLoadedAt);

  useEffect(() => {
    refreshAgentList();
  }, []);

  // `isUnavailable` is `true` for CLIs the backend reported as missing.
  // Every peer adapter (Claude / Codex / Gemini / OpenCode / OpenClaw /
  // Hermes) consults the live registry — there is no longer a special
  // case for any agent in this list.
  const isUnavailable = useCallback(
    (id: AppId): boolean => {
      if (lastLoadedAt === null) return false; // still loading
      const found = agentRegistry.find((a) => a.id === id);
      return found ? !found.available : true;
    },
    [agentRegistry, lastLoadedAt]
  );

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
    // A disabled tab (none today) gets a soft "not yet" toast. Unmet
    // availability is reported separately via `isUnavailable` below.
    const meta = ALL_AGENTS.find((a) => a.id === appId);
    if (meta?.disabled) {
      window.alert(`${meta.label} 暂未上线。`);
      return;
    }
    // Phase 1.5: if the backend reported the CLI is not installed,
    // surface a clear "which" failure message instead of letting
    // the user click through and get a generic spawn error.
    if (isUnavailable(appId)) {
      window.alert(
        `${meta?.label ?? appId} 未在 $PATH 中找到。请安装后刷新。`
      );
      return;
    }
    // If a conversation is open and was started on a different agent,
    // switching tabs would silently re-route the next message to a new
    // CLI — exactly the bug Phase 2 of the multi-agent plan exists to
    // prevent. Surface a confirm and start a new conversation if the
    // user agrees.
    const currentAgentId = selectCurrentAgentId(useConversationStore.getState());
    if (currentAgentId !== appId) {
      const ok = window.confirm(
        `当前对话归属 ${currentAgentId},切到 ${appId} 会开启新对话。继续?`
      );
      if (!ok) return;
      useConversationStore.getState().createConversation();
    }
    setCurrentApp(appId);
  }, [setCurrentApp, isUnavailable]);

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
      } else if (mod && e.key === "/") {
        // Alias for Ctrl+B — common in editors (e.g. VSCode's sidebar
        // toggle) so muscle memory carries over. Keep both bindings.
        e.preventDefault();
        setSidebarExpanded((v) => !v);
      } else if (mod && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setThemeMode(themeMode === "dark" ? "light" : "dark");
      } else if (mod && e.shiftKey && e.key === "L") {
        e.preventDefault();
        setToolsOpen((v) => !v);
      } else if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        // Ctrl+1..9 jumps to the n-th nav item in display order. Only
        // fires when the index exists; users pressing Ctrl+5 when
        // there are only 4 items get a no-op.
        const idx = Number(e.key) - 1;
        const target = FLAT_NAV_ITEMS[idx];
        if (target) {
          e.preventDefault();
          handleNavClick(target.key);
        }
      } else if (e.key === "Escape") {
        if (cmdPaletteOpen) {
          setCmdPaletteOpen(false);
        } else if (toolsOpen) {
          setToolsOpen(false);
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
  // toolsOpen is intentionally read from closure on each keystroke; we
  // don't add it to deps to avoid rebinding the global listener on every
  // modal open/close.

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
      <nav className={`sidebar${sidebarExpanded ? " sidebar--expanded" : ""}`} data-testid="sidebar" data-tour="sidebar">
        <div className="sidebar__header">
          <div className="sidebar__logo">I</div>
          <span className="sidebar__title">IntentLoom</span>
          <button
            className="sidebar__toggle"
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            title={sidebarExpanded ? "收起侧边栏 (Ctrl+B)" : "展开侧边栏 (Ctrl+B)"}
            aria-label={sidebarExpanded ? "收起侧边栏" : "展开侧边栏"}
          >
            {sidebarExpanded ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
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
        </div>
      </nav>

      {/* ── Main Area ── */}
      <div className="main-area" data-tour="chat">
        {/* Top Bar */}
        <header className="topbar">
          {/* Agent Tabs */}
          <div className="agent-tabs">
            {ALL_AGENTS.map((agent) => {
              const unavailable = isUnavailable(agent.id);
              const tooltip = agent.disabled
                ? `${agent.label} (开发中)`
                : unavailable
                ? `${agent.label} (未安装)`
                : agent.label;
              return (
                <button
                  key={agent.id}
                  className={
                    `agent-tab${currentApp === agent.id ? " active" : ""}` +
                    (agent.disabled ? " agent-tab--disabled" : "") +
                    (unavailable ? " agent-tab--unavailable" : "")
                  }
                  onClick={() => handleAgentSwitch(agent.id)}
                  title={tooltip}
                  aria-disabled={agent.disabled || unavailable ? "true" : undefined}
                >
                  <Bot size={12} />
                  {sidebarExpanded ? agent.label : agent.shortLabel}
                  {agent.disabled && <span className="agent-tab__badge">开发中</span>}
                  {!agent.disabled && unavailable && (
                    <span className="agent-tab__badge agent-tab__badge--missing">未安装</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Spacer */}
          <div className="topbar__spacer" />

          {/* Model path */}
          <span className="topbar__model" title={state.meta?.cwd ?? "未选择工作目录"}>
            <FolderOpen size={11} />
            {state.meta?.cwd ? state.meta.cwd : "未选择工作目录"}
          </span>

          {/* Right controls */}
          <div className="topbar__right" data-tour="tools">
            <button className="chip chip--icon" onClick={() => setCmdPaletteOpen(true)} title="命令面板 (Ctrl+K)">
              <Command size={13} />
            </button>
            <button className="chip chip--icon" onClick={() => setToolsOpen(true)} title="工具面板 (Ctrl+Shift+T)">
              <LayoutGrid size={13} />
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
            cli={currentApp as AppId}
            modeSpec={getModeSpec(currentApp as AppId)}
            modeId={resolveModeId(currentApp as AppId)}
            onModeChange={(id: string) => setModeForCli(currentApp as AppId, id)}
            reasoningSpec={getReasoningSpec(currentApp as AppId)}
            reasoningId={resolveReasoningId(currentApp as AppId)}
            onReasoningChange={(id: string) => setReasoningForCli(currentApp as AppId, id)}
            onSend={send}
            onCancel={cancel}
          />
          <StatusBar
            running={state.running}
            turnStartAt={state.turnStartAt}
            turnTokens={state.turnTokens}
            onOpenFolder={() => pickWorkspace?.()}
            cwd={state.meta?.cwd}
            onSetModel={setModel}
          />
        </footer>
      </div>

      {/* ── Loom Panel (persistent right column) ── */}
      <Resizer
        direction="horizontal"
        className="loom-resizer"
        onResize={(delta) =>
          setLoomPanelWidth((w) => Math.min(520, Math.max(240, w + delta)))
        }
      />
      <div className="loom-panel-wrapper" data-tour="loom" style={{ width: loomPanelWidth, minWidth: loomPanelWidth }}>
        <LoomPanel />
      </div>

      {/* ── Right Panel (modal — overlays loom-panel) ── */}
      {rightPanelOpen && (
        <>
          <div
            className="right-panel-backdrop right-panel-backdrop--modal"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("panel");
              setSearchParams(next, { replace: true });
            }}
          />
          <div className="right-panel right-panel--modal">
            <div className="right-panel__head">
              <div className="right-panel__title">
                <Sparkles size={14} className="ilo-fg-accent" />
                {PANEL_TITLES[activeNav]}
              </div>
              <button
                className="chip chip--icon"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("panel");
                  setSearchParams(next, { replace: true });
                }}
              >
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

      {/* ── Tools Modal (quick launcher for the 12 side panels) ── */}
      <ToolsModal isOpen={toolsOpen} onClose={() => setToolsOpen(false)} />

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
      <Onboarding />
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
            <div className="session-row__title">
              {s.agentId && <span className="session-row__agent" data-agent={s.agentId}>{s.agentId}</span>}
              {s.title || "无标题会话"}
            </div>
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
