import React, { useState, useEffect } from "react";
import { usePromptsStore, type Prompt } from "../../stores/usePromptsStore";
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";

export const PromptsPanel: React.FC = () => {
  const {
    prompts,
    isLoading,
    loadPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    enablePrompt,
  } = usePromptsStore();

  const [showForm, setShowForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    description: "",
  });

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.content.trim()) return;

    if (editingPrompt) {
      await updatePrompt(editingPrompt.id, formData.name, formData.content, formData.description);
    } else {
      await createPrompt(formData.name, formData.content, formData.description);
    }

    setFormData({ name: "", content: "", description: "" });
    setEditingPrompt(null);
    setShowForm(false);
  };

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setFormData({
      name: prompt.name,
      content: prompt.content,
      description: prompt.description || "",
    });
    setShowForm(true);
  };

  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  const handleDelete = (id: number) => {
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (deleteTarget == null) return;
    await deletePrompt(deleteTarget);
    setDeleteTarget(null);
  };

  const handleEnable = async (id: number) => {
    await enablePrompt(id);
  };

  const handleCancel = () => {
    setFormData({ name: "", content: "", description: "" });
    setEditingPrompt(null);
    setShowForm(false);
  };

  return (
    <div className="p-3 space-y-3">
      {/* Delete Confirm — 统一的 drawer chrome */}
      {deleteTarget != null && (
        <div className="drawer-backdrop" onClick={() => setDeleteTarget(null)}>
          <aside className="drawer drawer--narrow">
            <header className="drawer__head">
              <div className="drawer__title">
                <Trash2 size={14} className="ilo-fg-warn" />
                删除提示词
              </div>
              <button className="chip chip--icon" onClick={() => setDeleteTarget(null)} title="关闭">
                <X size={14} />
              </button>
            </header>
            <div className="drawer__body drawer__body--single">
              <p style={{ margin: 0, color: "var(--fg-dim)", fontSize: 13 }}>确定要删除这个提示词吗？</p>
            </div>
            <footer className="drawer__actions">
              <button className="btn" onClick={() => setDeleteTarget(null)}>取消</button>
              <button className="btn" style={{ background: "var(--err)", borderColor: "var(--err)", color: "#fff" }} onClick={confirmDelete}>删除</button>
            </footer>
          </aside>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-[#a0a0b0]">
          提示词 ({prompts.length})
        </span>
        <button
          onClick={() => loadPrompts()}
          className="p-1.5 rounded-lg hover:bg-[#2a2a4e] transition-colors"
          title="刷新"
        >
          <RefreshCw size={14} className="text-[#a0a0b0]" />
        </button>
      </div>

      {/* Add Button */}
      <button
        onClick={() => {
          setEditingPrompt(null);
          setFormData({ name: "", content: "", description: "" });
          setShowForm(true);
        }}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#6366f1] hover:bg-[#5558e3] transition-colors text-sm font-medium"
      >
        <Plus size={16} />
        添加提示词
      </button>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={handleCancel} />
          <div className="relative bg-[#1a1a2e] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden border border-[#2a2a4e] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a4e]">
              <h2 className="text-lg font-semibold text-white">
                {editingPrompt ? "编辑提示词" : "添加提示词"}
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
                  placeholder="例如: 代码审查助手"
                  className="w-full px-3 py-2 border border-[#2a2a4e] rounded-lg bg-[#252540] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a0a0b0] mb-1.5">
                  描述 <span className="text-[#606080]">(可选)</span>
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="提示词的简短描述..."
                  className="w-full px-3 py-2 border border-[#2a2a4e] rounded-lg bg-[#252540] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#a0a0b0] mb-1.5">
                  内容 <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="输入提示词内容..."
                  rows={12}
                  className="w-full px-3 py-2 border border-[#2a2a4e] rounded-lg bg-[#252540] text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#6366f1] font-mono"
                />
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
                disabled={!formData.name.trim() || !formData.content.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#6366f1] hover:bg-[#5558e3] disabled:opacity-50"
              >
                {editingPrompt ? "保存" : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompts List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={20} className="animate-spin text-[#a0a0b0]" />
        </div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-[#606080] text-sm">暂无提示词</div>
        </div>
      ) : (
        <div className="space-y-2">
          {prompts.map((prompt) => (
            <div
              key={prompt.id}
              className={`
                relative p-3 rounded-xl border transition-all cursor-pointer
                ${prompt.enabled
                  ? "border-[#6366f1] bg-[#6366f1]/10"
                  : "border-[#2a2a4e] bg-[#252540] hover:bg-[#2a2a4e]"
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0" onClick={() => handleEdit(prompt)}>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-white truncate">
                      {prompt.name}
                    </h3>
                    {prompt.enabled && (
                      <span className="flex items-center gap-1 text-xs text-[#6366f1]">
                        <Check size={12} />
                        已启用
                      </span>
                    )}
                  </div>
                  {prompt.description && (
                    <p className="text-xs text-[#606080] mt-1 truncate">
                      {prompt.description}
                    </p>
                  )}
                  <p className="text-xs text-[#505070] mt-1 line-clamp-2">
                    {prompt.content.substring(0, 100)}...
                  </p>
                </div>

                <div className="flex items-center gap-1 ml-2">
                  {!prompt.enabled && (
                    <button
                      onClick={() => handleEnable(prompt.id)}
                      className="p-1.5 rounded-lg hover:bg-[#3a3a5e] transition-colors"
                      title="启用"
                    >
                      <Check size={14} className="text-[#a0a0b0]" />
                    </button>
                  )}
                  <button
                    onClick={() => handleEdit(prompt)}
                    className="p-1.5 rounded-lg hover:bg-[#3a3a5e] transition-colors"
                    title="编辑"
                  >
                    <Pencil size={14} className="text-[#a0a0b0]" />
                  </button>
                  <button
                    onClick={() => handleDelete(prompt.id)}
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
