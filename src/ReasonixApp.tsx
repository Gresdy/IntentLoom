import { useCallback, useState, useEffect, useRef, Suspense, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SquarePen, History, Settings, Command, Moon, Sun, Bot, PanelLeftClose, PanelLeftOpen,
  FolderOpen, X, Zap, ShieldAlert,
  MessageCircle, RefreshCw, Loader2,
  LayoutGrid,
} from "lucide-react";
import { AGENT_TAB_ICON } from "@/components/Topbar/AgentTabIcon";
import { useReasonixController } from "./lib/reasonixAdapter";
import { seedTestDemo, clearTestDemo } from "./lib/testDemo";
import { Transcript } from "./components/Chat/ReasonixTranscript";
import { ConversationArtifactProvider } from "./chat/conversationArtifact";
import { Composer } from "./components/Chat/ReasonixComposer";
import type { SlashCommand } from "./components/Chat/SlashCommandMenu";
import { TopUsage } from "./components/Chat/TopUsage";
import { StatusBar } from "./components/layout/ReasonixStatusBar";
import { useAgentReadinessCheck } from "./hooks/useAgentReadinessCheck";
import { useToastStore } from "./lib/useToast";
import { SettingsDrawer, isSettingsTab, type SettingsTab } from "./components/layout/SettingsDrawer";
import { HistoryDrawer } from "./components/layout/HistoryDrawer";
import { CommandPalette, useCommandPalette } from "./components/common/CommandPalette";
import { ToastContainer } from "./components/common/ToastContainer";
import { LoomPanel } from "./components/Loom/LoomPanel";
import { Onboarding } from "./components/Onboarding";
import { Resizer } from "./components/Resizer";
import { useThemeStore } from "./stores/useThemeStore";
import { useModelStore } from "./stores/useModelStore";
import { seedProvidersFromPresets } from "./config/providerPresets";
import type { AppId } from "./shared/types";
import { useConversationStore, selectCurrentAgentId, selectCurrentConversationId } from "./stores/conversationStore";
import { useAgentStore, refreshAgentList } from "./lib/useAgents";
import { getModeSpec, getReasoningSpec } from "./lib/cliCapabilities";
import { modelsForCli } from "./config/cliPresets";
import {
  useComposerPrefsStore,
  resolveModeId,
  resolveReasoningId,
} from "./stores/useComposerPrefsStore";

// 注意：AgentsPanel / ProjectsPanel / SkillsPanel / PromptsPanel /
// McpPanel / ExpertPanel / SearchPanel / SessionsPanel 这些面板现在
// 全部在 SettingsDrawer 里 lazy 加载（左侧 nav 点选后右侧渲染）。侧栏
// 只保留 3 个一级入口（聊天 / 自动化 / 项目管理），剩下的都进设置。
// 这里不再声明任何 panel lazy 加载,所有面板都在 SettingsDrawer 里
// 渲染。ProjectsPanel 是唯一例外 —— 侧栏「项目管理」还会打开右侧
// slide-in,所以在这里保留一份 import。PanelLoader 是 slide-in 的
// 通用 Suspense fallback,统一在 common/ 下。
import { ProjectsPanel } from "./components/LeftPanel/ProjectsPanel";
import { PanelLoader } from "./components/common/PanelLoader";

// Hermes is intentionally absent: it lives in ALL_AGENTS as a top-tab
// peer of Claude / Codex / Gemini, with no dedicated side panel.
// NavKey 只描述「左侧主侧栏」能直接打开的入口（聊天 / 自动化 / 项目管理），
// 以及「点齿轮进设置」这一种 view。其余 10+ 个面板（agents / sessions / skills /
// expert / prompts / mcp / model / usage / logs / search / shortcuts / about）
// 都合并进 Settings 里的左侧 nav，对应的内容在 SettingsDrawer 里渲染。
type NavKey = "chat" | "automation" | "projects" | "settings";

interface NavItem {
  key: NavKey;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

// 侧栏精简后,只剩 3 个一级入口(聊天 / 自动化 / 项目管理),不再
// 分组。其余 10+ 个面板(agents / sessions / skills / expert / prompts /
// mcp / model / usage / logs / search / shortcuts / about)全部并入
// Settings 里的左侧 nav,对应内容在 SettingsDrawer 里渲染。
const NAV_ITEMS: NavItem[] = [
  { key: "chat",       icon: <MessageCircle size={18} />, label: "聊天" },
  { key: "automation", icon: <Zap size={18} />,          label: "自动化" },
  { key: "projects",   icon: <FolderOpen size={18} />,   label: "项目管理" },
];

// 仅用于键盘快捷键 Ctrl+1..3 跳转的扁平顺序。
const FLAT_NAV_ITEMS: NavItem[] = NAV_ITEMS;

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

// (Per-agent icon lookup now lives in
// @/components/Topbar/AgentTabIcon — swap any of those SVGs out for
// the upstream brand mark without touching this file.)

function isNavKey(value: string | null): value is NavKey {
  if (!value) return false;
  // 只接受侧栏 3 个一级入口和 settings 这 4 个 key。
  // 其余所有面板(agents / sessions / skills / expert / prompts / mcp /
  // search)都通过 ?view=settings&tab=... 走 Settings 弹框,不再有
  // 独立的 panel 路由。
  return value === "chat" || value === "automation" || value === "projects" || value === "settings";
}

const PANEL_TITLES: Record<NavKey, string> = {
  chat: "聊天",
  automation: "自动化",
  projects: "项目管理",
  settings: "设置",
};

export const ReasonixApp: React.FC = () => {
  const {
    state, send, cancel, approve,
    newSession, listSessions, resumeSession, deleteSession, renameSession, pickWorkspace,
    setModel,
  } = useReasonixController();

  // Per-CLI mode + reasoning selection lives in its own store so it
  // The maps themselves MUST be subscribed here, otherwise the
  // composer would only re-render when an unrelated store (the
  // model picker, the agent list, ...) fires a render. With
  // these subscriptions, picking a mode or reasoning value
  // updates the composer in the same tick — the user sees
  // immediate feedback. Each map is keyed by `AppId` so
  // switching CLIs restores the right value rather than
  // stomping it.
  const modeByCli = useComposerPrefsStore((s) => s.modeByCli);
  const reasoningByCli = useComposerPrefsStore((s) => s.reasoningByCli);
  const setModeForCli = useComposerPrefsStore(
    (s: ReturnType<typeof useComposerPrefsStore.getState>) => s.setMode,
  );
  const setReasoningForCli = useComposerPrefsStore(
    (s: ReturnType<typeof useComposerPrefsStore.getState>) => s.setReasoning,
  );

  const [histView, setHistView] = useState<any[] | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
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

  // T10: seed `useModelStore.providers` from the bundled
  // `claudeProviderPresets` once on mount. This makes the
  // StatusBar model menu (T3) render real entries instead of
  // the empty fallback. `registerProvider` is idempotent so
  // the dev-mode StrictMode double-effect is harmless.
  useEffect(() => {
    seedProvidersFromPresets(useModelStore.getState().registerProvider);
  }, []);
  // === Dev/test injection: ?demo=1 in the URL auto-injects the
  // synthetic demo conversation on mount, so screenshots /
  // Playwright runs can verify message rendering without going
  // through the real CLI streaming path. Reads window.location
  // once on mount and never again (no re-runs on URL change).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") {
      try { clearTestDemo(); seedTestDemo(); } catch (e) { console.error("[demo inject]", e); }
    }
  }, []);
  // URL is the source of truth for navigation state: deep links,
  // browser back/forward, and reload all stay in sync.
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get("panel");
  const activeNav: NavKey = isNavKey(panelParam) ? panelParam : "chat";
  const rightPanelOpen = activeNav !== "chat";
  // Sidebar expands on hover and stays expanded for the active item. A
  // user-driven pin (Ctrl+B / Ctrl+/) keeps it open regardless of
  // hover or active state — the three sources OR together so any one
  // is enough to show the expanded form.
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const isSidebarExpanded =
    isSidebarHovered || isSidebarPinned || rightPanelOpen;
  const settingsOpen = searchParams.get("view") === "settings";
  // 设置弹框默认落点 tab。?view=settings&tab=agents 这样的 URL 会
  // 同步在 SettingsDrawer 里高亮对应 tab,这样顶栏设置按钮、命令面板、
  // 命令面板、未来的 deep-link 都能精确定位。
  const settingsTabParam = searchParams.get("tab");
  const initialSettingsTab: SettingsTab | undefined =
    settingsOpen && isSettingsTab(settingsTabParam)
      ? settingsTabParam
      : undefined;
  const { mode: themeMode, setMode: setThemeMode } = useThemeStore();
  const {
    currentApp,
    setCurrentApp,
    currentModelByCli,
    setCurrentModel,
  } = useModelStore();
  const currentConversationId = useConversationStore(selectCurrentConversationId);
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

  // On-demand health probe for the currently-active agent —
  // references AionUi's `useAgentReadinessCheck`. We only mount
  // the hook for the active tab so the cost is bounded (a
  // single version round-trip + at most one alternative scan
  // when the user explicitly clicks "重新检测"), not one
  // probe per registered CLI.
  //
  // The toast handler surfaces probe failures as a transient
  // "Claude 不可用：<error>" banner and, when an alternative
  // is found, the toast includes a "切换到 <bestAgent>" CTA
  // that the user can click to auto-switch tabs. This is the
  // one place where the alternative scan's value shows up in
  // the user-visible flow — without it the failure toast
  // would just be a passive error.
  const addToast = useToastStore((s) => s.addToast);
  const readiness = useAgentReadinessCheck({
    id: currentApp,
    onAgentReady: (alt) => {
      addToast({
        type: "info",
        message: `检测到可用替代：${alt.display_name}（延迟 ${alt.health.latencyMs}ms）`,
        duration: 6000,
      });
    },
  });
  // Mirror the last probe error into a toast when it changes
  // (so the user sees the failure without having to open the
  // agents panel). We compare by `error` + `currentAgent` to
  // avoid re-toasting on every re-render.
  const lastToastedErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (readiness.isChecking) return;
    if (!readiness.error) {
      lastToastedErrorRef.current = null;
      return;
    }
    const key = `${readiness.currentAgent}::${readiness.error}`;
    if (lastToastedErrorRef.current === key) return;
    lastToastedErrorRef.current = key;
    addToast({
      type: "error",
      message: `${readiness.currentAgent} 健康检查失败：${readiness.error}`,
      duration: 6000,
    });
  }, [
    readiness.isChecking,
    readiness.error,
    readiness.currentAgent,
    addToast,
  ]);

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

  // === T4 chat parity: user-edit + assistant-regenerate ===
  // Both flows end with `send(text)`, which appends a fresh user +
  // assistant message pair and kicks off a live stream. Before we
  // re-send we shape the conversation so the new assistant turn
  // starts from the prompt the user actually wants.
  //
  // - Edit user message: keep the (now-edited) user message, drop
  //   the assistant reply + any tool calls that came after.
  // - Regenerate assistant: find the user prompt that produced the
  //   assistant, drop the assistant + everything after, re-send the
  //   same prompt to get a fresh assistant turn.
  //
  // Both are no-ops when a stream is already running (the composer
  // and AssistantMessageRow already gate the UI, but we belt-and-
  // brace here so a stale click cannot race the live stream).
  const handleEditUserMessage = useCallback(
    (messageId: string, newText: string) => {
      if (state.running) return;
      const trimmed = newText.trim();
      if (!trimmed) return;
      const store = useConversationStore.getState();
      const removed = store.truncateAfterMessageId(messageId);
      store.editMessageById(messageId, { content: trimmed });
      if (removed > 0) {
        addToast({ type: "info", message: `已删除 ${removed} 条后续消息，重新发送中…` });
      }
      void send(trimmed);
    },
    [state.running, send, addToast],
  );

  const handleRegenerateAssistant = useCallback(
    (assistantMessageId: string) => {
      if (state.running) return;
      // Walk the conversation store to find the most recent user
      // message that came BEFORE this assistant message. We use
      // the persisted conversation (not the live `state.items`)
      // because tool cards, phases, etc. are not user/assistant
      // messages and we want the original prompt, not the rendered
      // transcript.
      const messages =
        useConversationStore.getState().getCurrentConversation()?.messages ?? [];
      const assistantIdx = messages.findIndex((m) => m.id === assistantMessageId);
      if (assistantIdx === -1) return;
      let userMsg: typeof messages[number] | undefined;
      for (let i = assistantIdx - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userMsg = messages[i];
          break;
        }
      }
      if (!userMsg || typeof userMsg.content !== "string" || !userMsg.content.trim()) {
        addToast({ type: "error", message: "找不到该回答对应的用户消息，无法重新生成。" });
        return;
      }
      // Drop the assistant + everything after, then re-send the
      // original user prompt. We do NOT need to truncate up to the
      // user message (the user message is already the boundary);
      // we only need to drop the assistant onward.
      const removed = useConversationStore.getState().truncateFromMessageId(assistantMessageId);
      if (removed > 0) {
        addToast({ type: "info", message: `已删除 ${removed} 条后续消息，重新生成中…` });
      }
      void send(userMsg.content);
    },
    [state.running, send, addToast],
  );

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
        setIsSidebarPinned((v) => !v);
      } else if (mod && e.key === "/") {
        // Alias for Ctrl+B — common in editors (e.g. VSCode's sidebar
        // toggle) so muscle memory carries over. Keep both bindings.
        e.preventDefault();
        setIsSidebarPinned((v) => !v);
      } else if (mod && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setThemeMode(themeMode === "dark" ? "light" : "dark");
      } else if (mod && e.shiftKey && e.key === "L") {
        // Ctrl+Shift+L 直接打开统一的设置弹框(以前这里是 ToolsModal
        // 的快捷入口,现在 ToolsModal 已经移除,统一走 Settings)。
        e.preventDefault();
        const nextL = new URLSearchParams(searchParams);
        if (settingsOpen) {
          nextL.delete("view");
          nextL.delete("tab");
        } else {
          nextL.set("view", "settings");
        }
        setSearchParams(nextL, { replace: true });
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
    // 侧栏精简后,只有 自动化 / 项目管理 会打开右侧 slide-in;聊天关闭它,
    // 其余面板全部走 Settings 弹框,不在右侧 slide-in 里渲染。
    switch (activeNav) {
      case "automation":
        return (
          <div className="panel-empty">
            <Zap size={20} className="ilo-fg-dim" />
            <div>自动化</div>
            <div style={{ fontSize: 12, color: "var(--fg-faint)" }}>
              自动化面板待接入。
            </div>
          </div>
        );
      case "projects":
        return (
          <Suspense fallback={<PanelLoader />}>
            <ProjectsPanel />
          </Suspense>
        );
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
      <nav
        className={`sidebar${isSidebarExpanded ? " sidebar--expanded" : ""}`}
        data-testid="sidebar"
        data-tour="sidebar"
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className="sidebar__header">
          <div className="sidebar__logo">I</div>
          <span className="sidebar__title">IntentLoom</span>
          <button
            className="sidebar__toggle"
            onClick={() => setIsSidebarPinned((v) => !v)}
            title={isSidebarPinned ? "取消固定侧边栏 (Ctrl+B)" : "固定侧边栏 (Ctrl+B)"}
            aria-label={isSidebarPinned ? "取消固定侧边栏" : "固定侧边栏"}
            aria-pressed={isSidebarPinned}
          >
            {isSidebarPinned ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
        </div>

        <div className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`sidebar__nav-item${activeNav === item.key && rightPanelOpen ? " active" : ""}`}
              onClick={() => handleNavClick(item.key)}
              title={!isSidebarExpanded ? item.label : undefined}
            >
              <span className="sidebar__nav-item-icon">{item.icon}</span>
              <span className="sidebar__nav-item-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar__footer">
          <button
            className="sidebar__nav-item"
            onClick={() => handleNavClick("settings")}
            title={!isSidebarExpanded ? "设置" : undefined}
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
            {ALL_AGENTS.map((agent, index) => {
              const unavailable = isUnavailable(agent.id);
              const isActive = currentApp === agent.id;
              // A tab is "checking" only when (a) it is the
              // currently-active tab AND (b) the readiness
              // hook has a probe in flight. Tabs for the
              // other agents stay at rest — we only mount
              // the hook for the active agent to keep the
              // probe count bounded.
              const isCheckingThis = isActive && readiness.isChecking;
              // Brand-style SVG if we drew one, otherwise the generic
              // lucide Bot glyph for ids the registry hasn't been
              // customised for yet.
              const Icon = AGENT_TAB_ICON[agent.id] ?? Bot;
              // Compose a richer tooltip. When the readiness
              // hook has surfaced a failure on the active
              // tab, surface the error inline so the user
              // does not have to open the agents panel to
              // see why "click → nothing happens".
              const tooltip = agent.disabled
                ? `${agent.label} (开发中)`
                : unavailable
                ? `${agent.label} (未安装)`
                : isActive && readiness.error
                ? `${agent.label} (${readiness.error})`
                : agent.label;
              return (
                <Fragment key={agent.id}>
                  {index > 0 && (
                    <span className="agent-tabs__divider" aria-hidden="true" />
                  )}
                  <button
                    className={
                      `agent-tab${isActive ? " active" : ""}` +
                      (agent.disabled ? " agent-tab--disabled" : "") +
                      (unavailable ? " agent-tab--unavailable" : "") +
                      (isCheckingThis ? " agent-tab--checking" : "")
                    }
                    onClick={() => handleAgentSwitch(agent.id)}
                    title={tooltip}
                    aria-pressed={isActive}
                    aria-disabled={agent.disabled || unavailable ? "true" : undefined}
                  >
                    <span className="agent-tab__icon">
                      {isCheckingThis ? (
                        <Loader2 size={isActive ? 22 : 20} className="spin ilo-fg-accent" />
                      ) : (
                        <Icon size={isActive ? 22 : 20} />
                      )}
                    </span>
                    <span className="agent-tab__label">{agent.label}</span>
                    {agent.disabled && <span className="agent-tab__badge">开发中</span>}
                    {!agent.disabled && unavailable && (
                      <span className="agent-tab__badge agent-tab__badge--missing">未安装</span>
                    )}
                  </button>
                </Fragment>
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
            {/* 重新检测 — on-demand health probe for the
             * currently-active agent. The icon swaps to a
             * spinner while the probe is in flight so the
             * user has a clear "正在检测…" affordance; the
             * button is disabled while a chat turn is
             * running to avoid re-probing mid-stream. The
             * tooltip surfaces the last probe latency when
             * one is available, mirroring the
             * `check_agent_health` `latencyMs` field. */}
            <button
              className="chip chip--icon"
              onClick={() => void readiness.performFullCheck()}
              disabled={state.running || readiness.isChecking}
              title={
                readiness.isChecking
                  ? "正在检测…"
                  : `重新检测 ${currentApp}` +
                    (readiness.isReady
                      ? readiness.bestAgent
                        ? ` (建议切换到 ${readiness.bestAgent.display_name})`
                        : ""
                      : readiness.error
                      ? ` (上次失败：${readiness.error})`
                      : " (未就绪)")
              }
            >
              {readiness.isChecking ? (
                <Loader2 size={13} className="spin ilo-fg-accent" />
              ) : (
                <RefreshCw size={13} />
              )}
            </button>
            <button className="chip chip--icon" onClick={() => setCmdPaletteOpen(true)} title="命令面板 (Ctrl+K)">
              <Command size={13} />
            </button>
            <button
              className="chip chip--icon"
              onClick={() => handleNavClick("settings")}
              title="设置 (Ctrl+Shift+L)"
            >
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
          {/* Top usage bar — aionui-style context-window signal.
             Sits between the topbar and the transcript so it is
             always visible during a conversation. The transcript
             below scrolls inside the existing <main> flex column,
             so adding this row does not change the chat layout. */}
          <TopUsage />
          <ConversationArtifactProvider conversationId={currentConversationId}>
            <Transcript
              items={state.items}
              onNewChat={newSession}
              onPickWorkspace={pickWorkspace}
              onSeedDemo={() => { clearTestDemo(); seedTestDemo(); }}
              onEditUserMessage={handleEditUserMessage}
              onRegenerateAssistant={handleRegenerateAssistant}
            />
          </ConversationArtifactProvider>
        </main>

        {/* Footer */}
        <footer className="footer">
          <Composer
            running={state.running}
            cli={currentApp as AppId}
            isAvailable={!isUnavailable(currentApp as AppId)}
            modeSpec={getModeSpec(currentApp as AppId)}
            modeId={resolveModeId(currentApp as AppId, modeByCli)}
            onModeChange={(id: string) => setModeForCli(currentApp as AppId, id)}
            reasoningSpec={getReasoningSpec(currentApp as AppId)}
            reasoningId={resolveReasoningId(currentApp as AppId, reasoningByCli)}
            onReasoningChange={(id: string) => setReasoningForCli(currentApp as AppId, id)}
            models={modelsForCli(currentApp as AppId)}
            modelId={currentModelByCli[currentApp as AppId] ?? null}
            onModelChange={(id: string) => setCurrentModel(currentApp as AppId, id)}
            onSend={send}
            onCancel={cancel}
            onCommand={(cmd: SlashCommand, args: string) => {
              // AionUi port — slash commands now dispatch to real handlers
              // instead of being pasted back into the textarea. Unknown
              // commands fall through (return false) so the user can
              // still type a literal "/foo" if they really want to.
              const name = cmd.name;
              switch (name) {
                case "help": {
                  const list = [
                    "/help", "/clear", "/compact [n]", "/history",
                    "/export", "/share", "/model [id]", "/memory",
                    "/plan", "/tasks", "/agent [id]", "/agents",
                    "/status", "/tools", "/init",
                  ];
                  addToast({
                    type: "info",
                    message: "可用命令：" + list.join(" · "),
                    duration: 8000,
                  });
                  return true;
                }
                case "clear": {
                  useConversationStore.getState().createConversation();
                  addToast({ type: "success", message: "会话已清空" });
                  return true;
                }
                case "compact": {
                  // Backend "compact" is not wired yet; surface a clear
                  // hint so the user knows the command was caught.
                  addToast({
                    type: "info",
                    message: "压缩请求已捕获（" + (args || "全部") + "），后续接入。",
                  });
                  return true;
                }
                case "history": {
                  const next = new URLSearchParams(searchParams);
                  next.set("view", "settings");
                  next.set("tab", "sessions");
                  setSearchParams(next, { replace: false });
                  return true;
                }
                case "export": {
                  addToast({
                    type: "info",
                    message: "导出 Markdown 即将在下一轮接入（占位）",
                  });
                  return true;
                }
                case "share": {
                  const summary = state.items
                    .filter((it) => "text" in it && typeof (it as { text?: unknown }).text === "string")
                    .slice(-6)
                    .map((it) => "• " + (it as { text: string }).text)
                    .join("\n");
                  if (navigator.clipboard) {
                    navigator.clipboard.writeText(summary).then(
                      () => addToast({ type: "success", message: "摘要已复制" }),
                      () => addToast({ type: "error", message: "复制失败" }),
                    );
                  }
                  return true;
                }
                case "model": {
                  // Cycle to next available model for the current CLI.
                  const ms = modelsForCli(currentApp as AppId);
                  if (!ms.length) return false;
                  const idx = ms.findIndex((m) => m.id === currentModelByCli[currentApp as AppId]);
                  const nextModel = ms[(idx + 1) % ms.length];
                  setCurrentModel(currentApp as AppId, nextModel.id);
                  addToast({ type: "success", message: "已切换到 " + nextModel.id });
                  return true;
                }
                case "memory": {
                  const next = new URLSearchParams(searchParams);
                  next.set("view", "settings");
                  next.set("tab", "expert");
                  setSearchParams(next, { replace: false });
                  return true;
                }
                case "plan": {
                  const spec = getModeSpec(currentApp as AppId);
                  if (!spec) return false;
                  const idx = spec.options.findIndex((o) => o.id === resolveModeId(currentApp as AppId, modeByCli));
                  const nextMode = spec.options[(idx + 1) % spec.options.length];
                  setModeForCli(currentApp as AppId, nextMode.id);
                  addToast({ type: "success", message: "已切换到 " + nextMode.id });
                  return true;
                }
                case "tasks": {
                  addToast({ type: "info", message: "任务列表即将在 LoomPanel 接入（占位）" });
                  return true;
                }
                case "agent": {
                  const idx = ALL_AGENTS.findIndex((a) => a.id === currentApp);
                  const nextA = ALL_AGENTS[(idx + 1) % ALL_AGENTS.length];
                  handleAgentSwitch(nextA.id);
                  return true;
                }
                case "agents": {
                  const list = ALL_AGENTS.map((a) => a.label + (isUnavailable(a.id) ? " (未安装)" : "")).join(" · ");
                  addToast({ type: "info", message: list, duration: 8000 });
                  return true;
                }
                case "status": {
                  const cwd = state.meta?.cwd ?? "(未选工作目录)";
                  const model = currentModelByCli[currentApp as AppId] ?? "(默认)";
                  const tokens = state.turnTokens ?? 0;
                  addToast({
                    type: "info",
                    message: currentApp + " · " + model + " · " + cwd + " · tokens " + tokens,
                    duration: 6000,
                  });
                  return true;
                }
                case "tools": {
                  addToast({ type: "info", message: "工具可用性切换即将接入（占位）" });
                  return true;
                }
                case "init": {
                  addToast({
                    type: "info",
                    message: "为当前目录生成 CLAUDE.md / AGENTS.md（占位）",
                  });
                  return true;
                }
                default:
                  return false;
              }
            }}
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

      {/* ── Side Panel (drawer — overlays loom-panel) ──
       *
       * 共享 .drawer.drawer--wide chrome,与 Settings drawer 是同一套
       * 视觉骨架(同样的 backdrop、圆角、阴影、header、关闭按钮)。这
       * 一并解决了「同一个 App 里有 4 套弹框样式」的问题 —— 现在侧栏
       * 「自动化」「项目管理」打开的面板与「设置」打开的面板视觉一致。 */}
      {rightPanelOpen && (
        <>
          <div
            className="drawer-backdrop"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("panel");
              setSearchParams(next, { replace: true });
            }}
          />
          <aside className="drawer drawer--wide" data-side-panel={activeNav}>
            <header className="drawer__head">
              <div className="drawer__title">
                {activeNav === "automation" && <Zap size={14} className="ilo-fg-accent" />}
                {activeNav === "projects" && <FolderOpen size={14} className="ilo-fg-accent" />}
                {PANEL_TITLES[activeNav]}
              </div>
              <button
                className="chip chip--icon"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("panel");
                  setSearchParams(next, { replace: true });
                }}
                title="关闭"
              >
                <X size={14} />
              </button>
            </header>
            <div className="drawer__body drawer__body--single">
              {renderRightPanel()}
            </div>
          </aside>
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

      {/* ── Permission Modal ──
       *
       * CLI 子代理在执行工具前会发起权限请求。视觉上与 Settings / 项
       * 目管理 / 子级确认弹框完全一致 —— 同一个 backdrop、同一个
       * header、同一个圆角阴影,允许/拒绝按钮落在 .drawer__actions
       * 区域。弹框宽度走 .drawer--narrow,因为内容只是工具名 + 参数。 */}
      {state.approval && (
        <div className="drawer-backdrop">
          <aside className="drawer drawer--narrow">
            <header className="drawer__head">
              <div className="drawer__title">
                <ShieldAlert size={14} className="ilo-fg-warn" />
                权限请求
              </div>
              <span className="chip" title="等待你的确认">待确认</span>
            </header>
            <div className="drawer__body drawer__body--single">
              <div className="approval">
                <div className="approval__tool">{state.approval.tool}</div>
                <div className="approval__args">{state.approval.args}</div>
              </div>
            </div>
            <footer className="drawer__actions">
              <button
                className="chip"
                onClick={() => approve(state.approval!.id, false)}
              >
                拒绝
              </button>
              <button
                className="chip chip--on"
                onClick={() => approve(state.approval!.id, true)}
              >
                允许
              </button>
            </footer>
          </aside>
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

      {/* ── Settings Drawer(统一的设置弹框:左侧 nav 分组,右侧内容) ── */}
      {settingsOpen && (
        <SettingsDrawer
          initialTab={initialSettingsTab}
          onClose={() => {
            const next = new URLSearchParams(searchParams);
            next.delete("view");
            next.delete("tab");
            setSearchParams(next, { replace: true });
          }}
          onResumeSession={(path) => {
            // 从设置里的「会话管理」tab 唤起历史会话后,顺手清掉
            // panel URL(切回聊天)以及 view URL(关闭设置),与旧 slide-in
            // 行为对齐。
            setHistView(null);
            resumeSession(path);
            const next = new URLSearchParams(searchParams);
            next.delete("view");
            next.delete("tab");
            next.delete("panel");
            setSearchParams(next, { replace: true });
          }}
          onDeleteSession={(path) => {
            deleteSession(path);
          }}
        />
      )}
      <Onboarding />
    </div>
  );
};
