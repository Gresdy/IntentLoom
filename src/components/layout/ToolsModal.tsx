import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  X,
  FolderOpen,
  Bot,
  Sparkles,
  FileCode,
  Server,
  BarChart3,
  ScrollText,
  Briefcase,
  History as HistoryIcon,
  Cpu,
  Search as SearchIcon,
} from "lucide-react";

type Tab = {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  status: "ok" | "stub" | "wip";
};

// Quick-launcher for the 9 right-side panels that used to live behind a
// slide-in. Clicking a tab jumps to the same URL the sidebar would
// (so we don't have to lazy-import every panel here). The "ok" / "stub"
// / "wip" badge is honest about which panels are real and which are
// placeholders until their backend lands.
const TABS: Tab[] = [
  // Hermes lives in ALL_AGENTS in the top tab as a peer of Claude /
  // Codex; the side panel was removed in favour of a chat-only path.
  { key: "agents",   label: "AI 助手",   icon: <Bot size={14} />,         description: "Claude / Codex / Gemini / OpenCode / OpenClaw / Hermes —— 顶部 tab 直接切换,这里管安装与凭证。", status: "ok" },
  { key: "projects", label: "项目",      icon: <FolderOpen size={14} />,  description: "项目目录与上下文绑定",                                            status: "ok" },
  { key: "skills",   label: "Skills",    icon: <Sparkles size={14} />,    description: "可复用的 prompt 模板与工具集合(本项目最扎实的子系统)",           status: "ok" },
  { key: "prompts",  label: "Prompts",   icon: <FileCode size={14} />,    description: "系统提示词管理",                                                    status: "ok" },
  { key: "mcp",      label: "MCP",       icon: <Server size={14} />,      description: "MCP(Model Context Protocol)服务器配置",                            status: "ok" },
  { key: "usage",    label: "用量统计",  icon: <BarChart3 size={14} />,   description: "token / cost 用量统计",                                            status: "ok" },
  { key: "logs",     label: "日志",      icon: <ScrollText size={14} />,  description: "查看应用与 CLI 输出日志",                                          status: "ok" },
  { key: "expert",   label: "专家",      icon: <Briefcase size={14} />,   description: "领域专家配置(路由 / 提示词 / 工具集合)",                          status: "ok" },
  { key: "sessions", label: "会话",      icon: <HistoryIcon size={14} />, description: "历史会话管理(resume / delete / rename)",                           status: "ok" },
  { key: "model",    label: "模型",      icon: <Cpu size={14} />,         description: "Provider / API key 配置",                                          status: "ok" },
  { key: "search",   label: "搜索",      icon: <SearchIcon size={14} />,  description: "代码搜索",                                                          status: "ok" },
];

export function ToolsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].key);
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const openInSidebar = (key: string) => {
    onClose();
    const next = new URLSearchParams(window.location.search);
    next.set("panel", key);
    setSearchParams(next, { replace: false });
  };

  return (
    <div
      className="tools-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="工具面板"
    >
      <div className="tools-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tools-modal__head">
          <span className="tools-modal__title">工具</span>
          <button className="chip chip--icon" onClick={onClose} title="关闭 (Esc)">
            <X size={14} />
          </button>
        </div>
        <div className="tools-modal__body">
          <nav className="tools-modal__tabs" aria-label="工具分类">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tools-modal__tab${activeTab === t.key ? " active" : ""}`}
                onClick={() => setActiveTab(t.key)}
              >
                <span className="tools-modal__tab-icon">{t.icon}</span>
                <span className="tools-modal__tab-label">{t.label}</span>
                {t.status === "stub" && (
                  <span className="tools-modal__tab-badge">占位</span>
                )}
              </button>
            ))}
          </nav>
          <div className="tools-modal__detail">
            <h3 className="tools-modal__detail-title">
              <span className="tools-modal__detail-icon">{tab.icon}</span>
              {tab.label}
              {tab.status === "stub" && (
                <span className="tools-modal__detail-badge">后端未实现</span>
              )}
            </h3>
            <p className="tools-modal__detail-desc">{tab.description}</p>
            <div className="tools-modal__detail-hint">
              <p>本窗口是侧边栏的快捷入口,实际面板仍然从 sidebar 打开(右侧 slide-in 通道)。</p>
              <p>把 Loom 沉淀为常驻视图后,这些"管理类"面板从主视野中撤出,改用本工具窗口按需调出。</p>
            </div>
            <button
              className="chip chip--on"
              onClick={() => openInSidebar(tab.key)}
            >
              在侧边栏中打开
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
