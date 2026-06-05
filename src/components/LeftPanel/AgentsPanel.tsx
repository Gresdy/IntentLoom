import { useState, useEffect } from "react";
import { invoke } from "../../lib/tauri";
import { Check, Download, Link, RefreshCw, Terminal, X } from "lucide-react";

interface AgentInfo {
  id: string;
  name: string;
  display_name: string;
  available: boolean;
  path: string | null;
  version: string | null;
  supports_streaming: boolean;
  description: string;
  install_url?: string;
  install_command?: string;
}

const AGENT_INSTALL_INFO: Record<string, { url: string; command: string }> = {
  claude: {
    url: "https://docs.anthropic.com/en/docs/claude-code/overview",
    command: "npm install -g @anthropic-ai/claude-code",
  },
  gemini: {
    url: "https://ai.google.dev/gemini-code",
    command: "gemini install",
  },
  codex: {
    url: "https://openai.com/codex",
    command: "安装 OpenAI Codex",
  },
  opencode: {
    url: "https://github.com/opencode-ai/opencode",
    command: "npm install -g opencode-ai",
  },
  openclaw: {
    url: "https://github.com/openclaw/openclaw",
    command: "npm install -g @openclaw/cli",
  },
  kiro: {
    url: "https://kiro.ai",
    command: "安装 Kiro",
  },
  nanobot: {
    url: "https://github.com/nanobot-ai/nanobot",
    command: "npm install -g nanobot",
  },
  // Hermes is a Python project shipped from a CNB mirror (the user's
  // install lives at ~/.hermes/hermes-agent, symlinked into ~/.local/bin).
  // Generic one-liner — keep this in sync when the upstream URL changes.
  hermes: {
    url: "https://cnb.cool/hermesagent-cn",
    command: "git clone https://cnb.cool/hermesagent-cn/hermes-agent-cn-mirror.git && cd hermes-agent && pip install -e .",
  },
};

export const AgentsPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "available" | "unavailable">("all");

  const loadAgents = async () => {
    setLoading(true);
    try {
      const result = await invoke<AgentInfo[]>("list_agents");
      const agentsWithInstall = result.map((agent) => ({
        ...agent,
        install_url: AGENT_INSTALL_INFO[agent.id]?.url,
        install_command: AGENT_INSTALL_INFO[agent.id]?.command,
      }));
      setAgents(agentsWithInstall);
    } catch (e) {
      console.error("Failed to load agents:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const filteredAgents = agents.filter((agent) => {
    if (filter === "available") return agent.available;
    if (filter === "unavailable") return !agent.available;
    return true;
  });

  const availableCount = agents.filter((a) => a.available).length;

  const handleInstall = async (agent: AgentInfo) => {
    if (agent.install_url) {
      window.open(agent.install_url, "_blank");
    }
  };

  const handleCopyCommand = (agent: AgentInfo) => {
    if (agent.install_command) {
      navigator.clipboard.writeText(agent.install_command);
    }
  };

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
            onClick={loadAgents}
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
        {loading ? (
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
              <div
                key={agent.id}
                className={`p-4 rounded-xl border transition-all ${
                  agent.available
                    ? "ilo-bg-elev border-[#DDD6FE] hover:border-[#7C3AED]"
                    : "bg-[#FAF5FF] border-[#E9E3F9] hover:border-[#A78BFA]"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
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

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-[#1E1B4B]">
                        {agent.display_name}
                      </h3>
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
                      {agent.supports_streaming && agent.available && (
                        <span className="px-2 py-0.5 text-xs rounded bg-[#CFFAFE] text-[#0891B2]">
                          流式
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[#6B7280] mb-2 line-clamp-2">
                      {agent.description}
                    </p>

                    {agent.available ? (
                      <div className="space-y-1 text-xs text-[#9CA3AF]">
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
                              onClick={() => navigator.clipboard.writeText(agent.path || "")}
                              className="p-1 hover:ilo-bg-soft rounded"
                              title="复制路径"
                            >
                              <Link size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-2">
                        {agent.install_url && (
                          <button
                            onClick={() => handleInstall(agent)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#7C3AED] ilo-fg-onaccent hover:bg-[#6D28D9] transition-colors"
                          >
                            <Download size={12} />
                            安装指南
                          </button>
                        )}
                        {agent.install_command && (
                          <button
                            onClick={() => handleCopyCommand(agent)}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#EDE9FE] text-[#7C3AED] hover:bg-[#DDD6FE] transition-colors"
                          >
                            <Terminal size={12} />
                            复制命令
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
