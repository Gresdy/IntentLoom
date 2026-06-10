import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Check, Download, Link, RefreshCw, Terminal, X, Settings } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useAgentStore, type AgentConfig } from "../../lib/useAgents";
import type { AgentInfo } from "../../lib/useAgents";

/**
 * Agents panel — the visual front of the local-CLI availability,
 * install, and config feature. Reads straight from the shared
 * `useAgentStore` so the TopBar's gating and this panel never
 * disagree; the refresh button reuses the same `loadAgents`
 * that ReasonixApp's mount effect calls.
 *
 * Each agent renders a status-driven CTA derived from the backend's
 * `setup.status` field:
 *   - `ready`           — nothing to do
 *   - `needs_install`   — "安装指南" / "复制命令" buttons (url or
 *                          shell command depending on the adapter)
 *   - `needs_login`     — "复制登录命令" (the adapter's `binary`
 *                          name, which the user runs to trigger OAuth)
 *   - `misconfigured`   — inline warning text, no button
 *
 * Below that sits a small settings card with the user-configurable
 * `cli_path` override. The override is persisted via
 * `set_agent_config` and survives restart.
 */
export const AgentsPanel: React.FC = () => {
  const agents = useAgentStore((s) => s.agents);
  const loading = useAgentStore((s) => s.loading);
  const lastLoadedAt = useAgentStore((s) => s.lastLoadedAt);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const setAgentConfig = useAgentStore((s) => s.setAgentConfig);
  const clearAgentConfig = useAgentStore((s) => s.clearAgentConfig);
  const [filter, setFilter] = useState<"all" | "available" | "unavailable">("all");
  // The set of agent ids whose settings card is expanded. The card
  // is closed by default to keep the panel scannable; users opt in
  // per-adapter.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Polling timer — re-fetch every 30s so an agent the user
  // installs in another terminal flips to "已安装" without a manual
  // refresh. Toggled off when the tab is hidden so a backgrounded
  // panel doesn't keep pinging the backend.
  const pollRef = useRef<number | null>(null);

  // First mount: kick off the load if the store is empty. Subsequent
  // mounts reuse the cached list (the TopBar has already populated
  // it on app start).
  useEffect(() => {
    if (lastLoadedAt === null && !loading) {
      void loadAgents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light polling — only re-fetches if the user is still on the
  // panel. Cheap; one `list_agents` per 30s.
  useEffect(() => {
    const start = () => {
      if (pollRef.current !== null) return;
      pollRef.current = window.setInterval(() => {
        void loadAgents();
      }, 30_000);
    };
    const stop = () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void loadAgents();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredAgents = useMemo(
    () =>
      agents.filter((agent) => {
        if (filter === "available") return agent.available;
        if (filter === "unavailable") return !agent.available;
        return true;
      }),
    [agents, filter],
  );

  const availableCount = agents.filter((a) => a.available).length;

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      await openExternal(url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[AgentsPanel] failed to open install URL:", e);
    }
  }, []);

  const handleCopy = useCallback((text: string) => {
    if (text) {
      void navigator.clipboard.writeText(text);
    }
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="h-full flex flex-col bg-[#FAF5FF]">
      {/* Header */}
      <div className="p-4 border-b border-[#DDD6FE] bg-[#F5F3FF]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-[#1E1B4B]">AI 助手</h2>
            <p className="text-sm text-[#6B7280] mt-1">
              已检测 {availableCount} / {agents.length} 个助手
            </p>
          </div>
          <button
            onClick={() => void loadAgents()}
            disabled={loading}
            className="p-2 text-[#6B7280] hover:text-[#7C3AED] hover:bg-[#EDE9FE] rounded-lg transition-colors disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["all", "available", "unavailable"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                filter === f
                  ? "bg-[#7C3AED] ilo-fg-onaccent"
                  : "ilo-bg-elev text-[#6B7280] hover:bg-[#EDE9FE] border border-[#DDD6FE]"
              }`}
            >
              {f === "all" ? "全部" : f === "available" ? "已安装" : "未安装"}
            </button>
          ))}
        </div>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {loading && agents.length === 0 ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🤖</div>
            <div className="text-[#9CA3AF]">暂无 AI 助手</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isExpanded={expanded.has(agent.id)}
                onToggleExpand={() => toggleExpanded(agent.id)}
                onOpenUrl={handleOpenUrl}
                onCopy={handleCopy}
                onSaveConfig={setAgentConfig}
                onClearConfig={clearAgentConfig}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#DDD6FE] bg-[#F5F3FF]">
        <p className="text-xs text-[#9CA3AF] text-center">
          系统会自动检测 PATH 中的 AI 助手
        </p>
      </div>
    </div>
  );
};

export default AgentsPanel;

interface AgentCardProps {
  agent: AgentInfo;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenUrl: (url: string) => void;
  onCopy: (text: string) => void;
  onSaveConfig: (id: string, config: AgentConfig) => Promise<void>;
  onClearConfig: (id: string) => Promise<void>;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isExpanded,
  onToggleExpand,
  onOpenUrl,
  onCopy,
  onSaveConfig,
  onClearConfig,
}) => {
  const [cliPath, setCliPath] = useState<string>(agent.env && agent.path ? agent.path : "");
  const [envText, setEnvText] = useState<string>(() => {
    const entries = Object.entries(agent.env ?? {});
    return entries.map(([k, v]) => `${k}=${v}`).join("\n");
  });

  const ready = agent.setup.status === "ready";
  const needsInstall = agent.setup.status === "needs_install";
  const needsLogin = agent.setup.status === "needs_login";
  const misconfigured = agent.setup.status === "misconfigured";

  const installCta = agent.setup.cta?.kind === "install_url"
    ? { kind: "install_url" as const, url: agent.setup.cta.url }
    : agent.setup.cta?.kind === "install_command"
    ? { kind: "install_command" as const, command: agent.setup.cta.command }
    : null;
  const loginCta = agent.setup.cta?.kind === "login_hint" ? agent.setup.cta.command : null;

  const authChip = () => {
    if (!agent.available) return null;
    switch (agent.auth.status) {
      case "logged_in":
        return (
          <span className="auth-chip auth-chip--ok">
            <Check size={10} />
            已登录
          </span>
        );
      case "logged_out":
        return (
          <span className="auth-chip auth-chip--warn">
            <X size={10} />
            未登录
          </span>
        );
      case "not_required":
        return <span className="auth-chip auth-chip--muted">无需认证</span>;
      case "unknown":
      default:
        return (
          <span className="auth-chip auth-chip--muted" title={agent.auth.hint ?? undefined}>
            状态未知
          </span>
        );
    }
  };

  const handleSaveConfig = () => {
    const env: Record<string, string> = {};
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1);
    }
    const cfg: AgentConfig = {
      cli_path: cliPath.trim() || null,
      env,
    };
    void onSaveConfig(agent.id, cfg);
  };

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        agent.available
          ? "ilo-bg-elev border-[#DDD6FE] hover:border-[#7C3AED]"
          : "bg-[#FAF5FF] border-[#E9E3F9] hover:border-[#A78BFA]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            agent.available ? "bg-green-100" : "bg-[#EDE9FE]"
          }`}
        >
          <Terminal
            size={20}
            className={agent.available ? "text-green-600" : "text-[#7C3AED]"}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-[#1E1B4B]">{agent.display_name}</h3>
            {agent.available ? (
              <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 flex items-center gap-1">
                <Check size={10} />
                已安装
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded bg-[#EDE9FE] text-[#7C3AED] flex items-center gap-1">
                <X size={10} />
                未安装
              </span>
            )}
            {ready && (
              <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700 flex items-center gap-1">
                <Check size={10} />
                就绪
              </span>
            )}
            {authChip()}
            {agent.supports_streaming && agent.available && (
              <span className="px-2 py-0.5 text-xs rounded bg-[#CFFAFE] text-[#0891B2]">流式</span>
            )}
          </div>

          <p className="text-sm text-[#6B7280] mb-2 line-clamp-2">
            {agent.description}
          </p>

          {/* Setup CTA — driven by the backend's `setup.status`. We
              deliberately do not show the install buttons when the
              binary is already on disk, even if a stale `cli_path`
              override used to make it look uninstalled: the panel
              follows the resolved path, not the user's intent. */}
          {needsInstall && installCta?.kind === "install_url" && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onOpenUrl(installCta.url)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#7C3AED] ilo-fg-onaccent hover:bg-[#6D28D9] transition-colors"
              >
                <Download size={12} />
                安装指南
              </button>
              {agent.install_command && (
                <button
                  onClick={() => onCopy(agent.install_command!)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#EDE9FE] text-[#7C3AED] hover:bg-[#DDD6FE] transition-colors"
                >
                  <Terminal size={12} />
                  复制命令
                </button>
              )}
              <span className="text-xs text-[#9CA3AF]">{agent.setup.message}</span>
            </div>
          )}
          {needsInstall && installCta?.kind === "install_command" && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => onCopy(installCta.command)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#7C3AED] ilo-fg-onaccent hover:bg-[#6D28D9] transition-colors"
              >
                <Terminal size={12} />
                复制安装命令
              </button>
              {agent.install_url && (
                <button
                  onClick={() => onOpenUrl(agent.install_url!)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#EDE9FE] text-[#7C3AED] hover:bg-[#DDD6FE] transition-colors"
                >
                  <Download size={12} />
                  安装指南
                </button>
              )}
              <span className="text-xs text-[#9CA3AF]">{agent.setup.message}</span>
            </div>
          )}
          {needsLogin && (
            <div className="flex items-center gap-2 mt-2">
              {loginCta && (
                <button
                  onClick={() => onCopy(loginCta)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#7C3AED] ilo-fg-onaccent hover:bg-[#6D28D9] transition-colors"
                >
                  <Terminal size={12} />
                  复制登录命令
                </button>
              )}
              <span className="text-xs text-[#9CA3AF]">{agent.setup.message}</span>
            </div>
          )}
          {misconfigured && (
            <p className="auth-hint auth-hint--warn mt-1">{agent.setup.message}</p>
          )}

          {/* Auth-hint row (e.g. "needs ANTHROPIC_API_KEY"). Reuse the
              shape that pre-dates the `setup.status` field so the
              "logged out" path still gets the actionable hint. */}
          {agent.available && needsLogin && agent.auth.hint && (
            <p className="auth-hint auth-hint--muted mt-1">
              <span className="auth-hint__label">提示：</span>
              {agent.auth.hint}
            </p>
          )}

          {agent.available && (
            <div className="space-y-1 text-xs text-[#9CA3AF] mt-2">
              {agent.version && (
                <div className="flex items-center gap-1">
                  <span className="text-[#A3A3A6]">版本：</span>
                  <span className="font-mono">{agent.version}</span>
                </div>
              )}
              {agent.path && (
                <div className="flex items-center gap-1">
                  <span className="text-[#A3A3A6]">路径：</span>
                  <span className="font-mono truncate flex-1">{agent.path}</span>
                  <button
                    onClick={() => onCopy(agent.path || "")}
                    className="p-1 hover:ilo-bg-soft rounded"
                    title="复制路径"
                  >
                    <Link size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Settings card — user override of cli_path + env. Closed
              by default. Empty state shows the message; populated
              state shows a tiny "clear" affordance. */}
          <div className="mt-3">
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-xs text-[#7C3AED] hover:text-[#6D28D9]"
            >
              <Settings size={12} />
              {isExpanded ? "收起配置" : "设置"}
            </button>
            {isExpanded && (
              <div className="mt-2 p-3 rounded-lg bg-white border border-[#DDD6FE] space-y-2">
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1">CLI 路径覆盖</label>
                  <input
                    type="text"
                    value={cliPath}
                    onChange={(e) => setCliPath(e.target.value)}
                    placeholder="留空则用 PATH 中找到的"
                    className="w-full px-2 py-1.5 text-xs font-mono border border-[#DDD6FE] rounded focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#6B7280] mb-1">
                    环境变量 (每行 KEY=VALUE)
                  </label>
                  <textarea
                    value={envText}
                    onChange={(e) => setEnvText(e.target.value)}
                    placeholder={"ANTHROPIC_BASE_URL=https://proxy\nANTHROPIC_API_KEY=sk-..."}
                    rows={4}
                    className="w-full px-2 py-1.5 text-xs font-mono border border-[#DDD6FE] rounded focus:outline-none focus:border-[#7C3AED]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveConfig}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#7C3AED] ilo-fg-onaccent hover:bg-[#6D28D9]"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => void onClearConfig(agent.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#EDE9FE] text-[#7C3AED] hover:bg-[#DDD6FE]"
                  >
                    重置
                  </button>
                  {agent.env && Object.keys(agent.env).length > 0 && (
                    <span className="text-xs text-[#9CA3AF]">已应用 {Object.keys(agent.env).length} 个环境变量</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
