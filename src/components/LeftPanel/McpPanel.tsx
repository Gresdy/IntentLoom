import React, { useState, useEffect } from "react";
import { useMcpStore, type McpServer, type McpServerInput } from "../../stores/useMcpStore";
import { Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";

const APP_LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
};

export const McpPanel: React.FC = () => {
  const {
    servers,
    isLoading,
    loadServers,
    createServer,
    updateServer,
    deleteServer,
  } = useMcpStore();

  const [showForm, setShowForm] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [formData, setFormData] = useState<McpServerInput>({
    name: "",
    server: { command: "", args: [] },
    apps: { claude: false, codex: false, gemini: false, opencode: false, openclaw: false },
  });

  useEffect(() => {
    loadServers();
  }, []);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.server.command) return;

    if (editingServer) {
      await updateServer(editingServer.id, formData);
    } else {
      await createServer(formData);
    }

    setFormData({
      name: "",
      server: { command: "", args: [] },
      apps: { claude: false, codex: false, gemini: false, opencode: false, openclaw: false },
    });
    setEditingServer(null);
    setShowForm(false);
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      server: server.server as { command: string; args: string[] },
      apps: server.apps,
    });
    setShowForm(true);
  };

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    await deleteServer(deleteTarget);
    setDeleteTarget(null);
  };

  const handleCancel = () => {
    setFormData({
      name: "",
      server: { command: "", args: [] },
      apps: { claude: false, codex: false, gemini: false, opencode: false, openclaw: false },
    });
    setEditingServer(null);
    setShowForm(false);
  };

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-[#a0a0b0]">
          MCP 服务器 ({servers.length})
        </span>
        <button
          onClick={() => loadServers()}
          className="p-1.5 rounded-lg hover:bg-[#2a2a4e] transition-colors"
          title="刷新"
        >
          <RefreshCw size={14} className="text-[#a0a0b0]" />
        </button>
      </div>

      {/* Add Button */}
      <button
        onClick={() => {
          setEditingServer(null);
          setFormData({
            name: "",
            server: { command: "", args: [] },
            apps: { claude: false, codex: false, gemini: false, opencode: false, openclaw: false },
          });
          setShowForm(true);
        }}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#6366f1] hover:bg-[#5558e3] transition-colors text-sm font-medium"
      >
        <Plus size={16} />
        添加 MCP 服务器
      </button>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={handleCancel} />
          <div className="relative bg-[#1a1a2e] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden border border-[#2a2a4e] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a4e]">
              <h2 className="text-lg font-semibold text-white">
                {editingServer ? "编辑 MCP 服务器" : "添加 MCP 服务器"}
              </h2>
              <button onClick={handleCancel} className="p-1.5 rounded-lg hover:bg-[#2a2a4e]">
                <X size={20} className="text-[#a0a0b0]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#a0a0b0] mb-1.5">
                  名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如: My MCP Server"
                  className="w-full px-3 py-2 border border-[#2a2a4e] rounded-lg bg-[#252540] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a0a0b0] mb-1.5">
                  Command <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.server.command || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    server: { ...formData.server, command: e.target.value }
                  })}
                  placeholder="例如: npx"
                  className="w-full px-3 py-2 border border-[#2a2a4e] rounded-lg bg-[#252540] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a0a0b0] mb-1.5">
                  Args (JSON)
                </label>
                <input
                  type="text"
                  value={JSON.stringify(formData.server.args || [])}
                  onChange={(e) => {
                    try {
                      const args = JSON.parse(e.target.value);
                      setFormData({
                        ...formData,
                        server: { ...formData.server, args }
                      });
                    } catch {}
                  }}
                  placeholder='["-y", "package-name"]'
                  className="w-full px-3 py-2 border border-[#2a2a4e] rounded-lg bg-[#252540] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1] font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a0a0b0] mb-2">
                  启用的应用
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(APP_LABELS).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 p-2 rounded-lg bg-[#252540] border border-[#2a2a4e] cursor-pointer hover:border-[#3a3a5e]"
                    >
                      <input
                        type="checkbox"
                        checked={formData.apps[key as keyof typeof formData.apps]}
                        onChange={(e) => setFormData({
                          ...formData,
                          apps: { ...formData.apps, [key]: e.target.checked }
                        })}
                        className="w-4 h-4 rounded accent-[#6366f1]"
                      />
                      <span className="text-sm text-white">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#2a2a4e] bg-[#252540]">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#a0a0b0] hover:bg-[#2a2a4e]"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.name.trim() || !formData.server.command}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#6366f1] hover:bg-[#5558e3] disabled:opacity-50"
              >
                {editingServer ? "保存" : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm — 统一的 drawer chrome (与 Settings / 项目管理 / 权限请求一致) */}
      {deleteTarget && (
        <div className="drawer-backdrop" onClick={() => setDeleteTarget(null)}>
          <aside className="drawer drawer--narrow">
            <header className="drawer__head">
              <div className="drawer__title">
                <Trash2 size={14} className="ilo-fg-warn" />
                删除 MCP 服务器
              </div>
              <button className="chip chip--icon" onClick={() => setDeleteTarget(null)} title="关闭">
                <X size={14} />
              </button>
            </header>
            <div className="drawer__body drawer__body--single">
              <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>确定要删除这个 MCP 服务器吗？</p>
            </div>
            <footer className="drawer__actions">
              <button className="btn" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn" style={{ background: "var(--err)", borderColor: "var(--err)", color: "#fff" }} onClick={confirmDelete}>删除</button>
            </footer>
          </aside>
        </div>
      )}

      {/* Server List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={20} className="animate-spin text-[#a0a0b0]" />
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-[#606080] text-sm">暂无 MCP 服务器</div>
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="p-3 rounded-xl border border-[#2a2a4e] bg-[#252540]"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0" onClick={() => handleEdit(server)}>
                  <h3 className="text-sm font-medium text-white truncate">
                    {server.name}
                  </h3>
                  <p className="text-xs text-[#606080] mt-1 font-mono truncate">
                    {server.server.command}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(server.apps).map(([key, enabled]) =>
                      enabled ? (
                        <span
                          key={key}
                          className="px-2 py-0.5 text-xs bg-[#6366f1]/20 text-[#6366f1] rounded"
                        >
                          {APP_LABELS[key]}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => handleEdit(server)}
                    className="p-1.5 rounded-lg hover:bg-[#3a3a5e] transition-colors"
                    title="编辑"
                  >
                    <Pencil size={14} className="text-[#a0a0b0]" />
                  </button>
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
                    title="删除"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
