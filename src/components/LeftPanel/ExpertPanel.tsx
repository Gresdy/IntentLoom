import { useEffect, useState, useCallback, useMemo } from "react";
import { useExpertsStore } from "../../stores/expertsStore";
import { useAgencyExpertStore } from "../../stores/agencyExpertStore";
import { open } from "@tauri-apps/plugin-dialog";
import type { Expert } from "../../shared/types";
import type { AgencyExpert, ExpertDepartment } from "../../shared/agencyExpert";
import { Briefcase, BookOpen, Box, Check, ChevronDown, ChevronRight, Code2, Download, ExternalLink, FolderOpen, Gamepad2, MoreHorizontal, Pencil, Plus, Radio, Search, Server, Star, Trash2, TrendingUp, User, X, Zap, FlaskConical } from "lucide-react";
import {
  DEPARTMENTS,
  getColorHex,
  PRIORITY_EXPERTS,
} from "../../shared/agencyExpert";

interface Props {
  projectId?: string;
}

const EXPERT_COLORS = [
  "#6366f1", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
];

type ViewMode = "my-experts" | "agency-library";

export function ExpertPanel(_props: Props) {
  const {
    experts,
    loading,
    error,
    loadExperts,
    createExpert,
    updateExpert,
    deleteExpert,
    toggleExpertActive,
  } = useExpertsStore();

  const {
    experts: agencyExperts,
    loading: agencyLoading,
    error: agencyError,
    searchQuery,
    activeDepartment,
    loadFromDir,
    searchExperts,
    filterByDepartment,
    getFilteredExperts,
    getDepartmentCounts,
    importToProject,
  } = useAgencyExpertStore();

  const [viewMode, setViewMode] = useState<ViewMode>("my-experts");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expert | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // 表单状态
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [skills, setSkills] = useState("");
  const [mcpServers, setMcpServers] = useState("");

  // Agency 详情弹窗
  const [detailExpert, setDetailExpert] = useState<AgencyExpert | null>(null);

  // 专家库折叠状态
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  // 批量导入状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const [importProgress, setImportProgress] = useState<{
    total: number;
    done: number;
    failed: number;
  } | null>(null);

  // 加载全部已导入专家（不再按项目过滤）
  useEffect(() => {
    loadExperts();
  }, [loadExperts]);

  // 切换视图时清空选中
  useEffect(() => {
    setSelectedIds(new Set());
    setImportProgress(null);
  }, [viewMode]);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "warning" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" | "warning" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // PRIORITY_EXPERTS 的 id 集合
  const priorityIdSet = useMemo(() => new Set(PRIORITY_EXPERTS.map((p) => p.id)), []);

  // 已导入专家名称集合
  const importedNames = useMemo(() => new Set(experts.map((e) => e.name)), [experts]);

  const isImported = useCallback(
    (expert: AgencyExpert) => importedNames.has(expert.metadata.name),
    [importedNames]
  );

  // Agency 过滤
  const filteredAgency = getFilteredExperts();
  const deptCounts = getDepartmentCounts();

  // 按部门分组专家
  const groupedByDept = useMemo(() => {
    const groups: Record<string, AgencyExpert[]> = {};
    for (const e of filteredAgency) {
      const dept = e.department;
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(e);
    }
    // 按部门内名称排序
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.metadata.name.localeCompare(b.metadata.name, "zh"));
    }
    return groups;
  }, [filteredAgency]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setSystemPrompt("");
    setColor("#6366f1");
    setSkills("");
    setMcpServers("");
    setShowForm(true);
  }

  function openEdit(e: Expert) {
    setEditing(e);
    setName(e.name);
    setDescription(e.description);
    setSystemPrompt(e.systemPrompt ?? "");
    setColor(e.color);
    setSkills((e.skills ?? []).join(", "));
    setMcpServers((e.mcpServers ?? []).join(", "));
    setShowForm(true);
  }

  async function handleSubmit() {
    if (!name.trim() || !systemPrompt.trim()) return;

    const payload: Partial<Expert> = {
      name: name.trim(),
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      color,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      mcpServers: mcpServers.split(",").map((s) => s.trim()).filter(Boolean),
    };

    if (editing) {
      await updateExpert(editing.id, payload);
    } else {
      await createExpert(undefined, payload);
    }
    setShowForm(false);
  }

  // 打开目录选择器导入 agency-agents-zh
  async function handleImportDir() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;
    await loadFromDir(selected as string);
    setViewMode("agency-library");
  }

  // 切换选中
  function toggleSelect(expertId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(expertId)) {
        next.delete(expertId);
      } else {
        next.add(expertId);
      }
      return next;
    });
  }

  // 全选/取消全选当前过滤列表
  function toggleSelectAll() {
    if (selectedIds.size === filteredAgency.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAgency.map((e) => e.id)));
    }
  }

  // 批量导入（不依赖项目ID）
  async function handleBatchImport() {
    if (selectedIds.size === 0) {
      showToast("请先勾选要导入的专家", "warning");
      return;
    }

    const ids = Array.from(selectedIds);
    setImportingIds(new Set(ids));
    setImportProgress({ total: ids.length, done: 0, failed: 0 });

    let done = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await importToProject(id, undefined, createExpert);
        done++;
      } catch (e) {
        failed++;
        console.error(`[ExpertPanel] 导入专家失败 id=${id}:`, e);
        showToast(`导入失败：${e}`, "error");
      }
      setImportProgress({ total: ids.length, done, failed });
    }

    await loadExperts();
    setImportingIds(new Set());
    setSelectedIds(new Set());

    if (failed > 0) {
      showToast(`导入完成：成功 ${done}，失败 ${failed}`, "error");
    } else {
      showToast(`成功导入 ${done} 个专家`, "success");
    }

    setTimeout(() => setImportProgress(null), 3000);
  }

  // 一键导入优先专家（不依赖项目ID）
  async function handleImportPriority() {
    const availableIds = PRIORITY_EXPERTS
      .filter((p) => agencyExperts.some((e) => e.id === p.id))
      .map((p) => p.id);

    if (availableIds.length === 0) return;

    setImportingIds(new Set(availableIds));
    setImportProgress({ total: availableIds.length, done: 0, failed: 0 });

    let done = 0;
    let failed = 0;

    for (const id of availableIds) {
      try {
        await importToProject(id, undefined, createExpert);
        done++;
      } catch (e) {
        failed++;
        console.error(`[ExpertPanel] 导入优先专家失败 id=${id}:`, e);
      }
      setImportProgress({ total: availableIds.length, done, failed });
    }

    await loadExperts();
    setImportingIds(new Set());

    if (failed > 0) {
      showToast(`导入完成：成功 ${done}，失败 ${failed}`, "error");
    } else {
      showToast(`成功导入 ${done} 个推荐专家`, "success");
    }

    setTimeout(() => setImportProgress(null), 3000);
  }

  // 折叠/展开部门
  function toggleDeptCollapse(dept: string) {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  }

  // 渲染主内容
  return (
    <div className="h-full flex flex-col ilo-bg-soft">
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 100,
          padding: "8px 16px",
          background: toast.type === "error" ? "var(--err)" : toast.type === "warning" ? "var(--warn)" : "var(--ok)",
          color: "#fff", borderRadius: "var(--radius)", fontSize: 13,
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
        }}>
          {toast.message}
        </div>
      )}
      {/* 头部 */}
      <div className="px-4 py-3 ilo-bg-elev border-b ilo-border-soft flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold ilo-fg-faint">专家中心</h2>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
            {viewMode === "my-experts" ? `${experts.length} 个` : `${agencyExperts.length} 个`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === "my-experts" && (
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 ilo-fg-onaccent text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus size={14} />
              新建
            </button>
          )}
          {viewMode === "agency-library" && (
            <button
              onClick={handleImportDir}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 ilo-fg-onaccent text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Download size={14} />
              导入目录
            </button>
          )}
        </div>
      </div>

      {/* 视图切换 */}
      <div className="px-4 py-2 ilo-bg-elev border-b ilo-border-soft flex items-center gap-2">
        <button
          onClick={() => setViewMode("my-experts")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            viewMode === "my-experts"
              ? "bg-indigo-100 text-indigo-700"
              : "ilo-fg-dim hover:ilo-bg-soft"
          }`}
        >
          <User size={14} />
          我的专家
          {experts.length > 0 && (
            <span className="px-1.5 py-0.5 bg-indigo-200 text-indigo-800 text-[10px] rounded">
              {experts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setViewMode("agency-library")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            viewMode === "agency-library"
              ? "bg-indigo-100 text-indigo-700"
              : "ilo-fg-dim hover:ilo-bg-soft"
          }`}
        >
          <Star size={14} />
          专家库
          {agencyExperts.length > 0 && (
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded">
              {agencyExperts.length}
            </span>
          )}
        </button>
      </div>

      {/* ============================== */}
      {/* 我的专家视图 */}
      {/* ============================== */}
      {viewMode === "my-experts" && (
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center h-32 ilo-fg-dim">
              <div className="text-sm">加载中...</div>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-32 text-red-500 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && experts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <User size={48} className="ilo-fg mb-3" />
              <p className="text-sm ilo-fg-dim mb-1">暂无专家</p>
              <p className="text-xs ilo-fg-dim mb-4">
                从专家库导入或手动创建专家
              </p>
              <button
                onClick={() => setViewMode("agency-library")}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <Star size={14} />
                浏览专家库
              </button>
            </div>
          )}

          {!loading && !error && experts.length > 0 && (
            <div className="grid grid-cols-1 gap-3">
              {experts.map((expert) => (
                <div
                  key={expert.id}
                  className={`ilo-bg-elev rounded-xl border ilo-border-soft p-4 hover:shadow-md transition-shadow ${
                    expert.isActive ? "" : "opacity-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-1 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: expert.color }}
                    />
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                      style={{ backgroundColor: `${expert.color}15` }}
                    >
                      <User size={20} style={{ color: expert.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold ilo-fg-faint truncate">
                          {expert.name}
                        </h3>
                        {expert.isActive ? (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded">
                            已启用
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 ilo-bg-soft ilo-fg-dim text-[10px] rounded">
                            已停用
                          </span>
                        )}
                      </div>
                      {expert.description && (
                        <p className="text-xs ilo-fg-dim mt-1 line-clamp-2">
                          {expert.description}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(expert.skills ?? []).slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="px-2 py-0.5 ilo-bg-soft ilo-fg-faint text-[10px] rounded"
                          >
                            {skill}
                          </span>
                        ))}
                        {(expert.skills ?? []).length > 3 && (
                          <span className="px-2 py-0.5 ilo-fg-dim text-[10px]">
                            +{(expert.skills ?? []).length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(expert)}
                        className="p-1.5 ilo-fg-dim hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="编辑"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleExpertActive(expert.id)}
                        className={`p-1.5 rounded transition-colors ${
                          expert.isActive
                            ? "text-green-500 hover:text-green-600 hover:bg-green-50"
                            : "ilo-fg-dim hover:ilo-fg-dim hover:ilo-bg-soft"
                        }`}
                        title={expert.isActive ? "停用" : "启用"}
                      >
                        {expert.isActive ? <Check size={14} /> : <Radio size={14} />}
                      </button>
                      <button
                        onClick={() => setDeleting(expert.id)}
                        className="p-1.5 ilo-fg-dim hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================== */}
      {/* 专家库视图 */}
      {/* ============================== */}
      {viewMode === "agency-library" && (
        <>
          {/* 搜索栏 */}
          <div className="px-4 py-2 ilo-bg-elev border-b ilo-border-soft">
            <div className="flex items-center gap-2 px-3 py-1.5 ilo-bg-soft rounded-lg border ilo-border-soft">
              <Search size={14} className="ilo-fg-dim shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => searchExperts(e.target.value)}
                placeholder="搜索专家名称、描述..."
                className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => searchExperts("")}
                  className="ilo-fg-dim hover:ilo-fg-faint"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* 部门筛选 */}
          <div className="px-4 py-2 ilo-bg-elev border-b ilo-border-soft flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => filterByDepartment("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeDepartment === "all"
                  ? "bg-indigo-100 text-indigo-700"
                  : "ilo-fg-faint hover:ilo-bg-soft"
              }`}
            >
              全部
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  activeDepartment === "all"
                    ? "bg-indigo-200 text-indigo-800"
                    : "ilo-bg-elev-2 ilo-fg-dim"
                }`}
              >
                {deptCounts.all || 0}
              </span>
            </button>
            {(Object.keys(DEPARTMENTS) as ExpertDepartment[])
              .filter((dept) => (deptCounts[dept] ?? 0) > 0)
              .map((dept) => (
                <button
                  key={dept}
                  onClick={() => filterByDepartment(dept)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    activeDepartment === dept
                      ? "bg-indigo-100 text-indigo-700"
                      : "ilo-fg-faint hover:ilo-bg-soft"
                  }`}
                >
                  {getDeptIcon(dept)}
                  {DEPARTMENTS[dept].name}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      activeDepartment === dept
                        ? "bg-indigo-200 text-indigo-800"
                        : "ilo-bg-elev-2 ilo-fg-dim"
                    }`}
                  >
                    {deptCounts[dept] || 0}
                  </span>
                </button>
              ))}
          </div>

          {/* 批量操作栏 */}
          {agencyExperts.length > 0 && (
            <div className="px-4 py-2 ilo-bg-soft border-b ilo-border-soft flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSelectAll}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                    selectedIds.size === filteredAgency.length && filteredAgency.length > 0
                      ? "bg-indigo-100 text-indigo-700"
                      : "ilo-fg-dim hover:ilo-bg-elev-2"
                  }`}
                >
                  <Check size={14} />
                  {selectedIds.size === filteredAgency.length && filteredAgency.length > 0
                    ? "取消全选"
                    : "全选"}
                </button>
                {selectedIds.size > 0 && (
                  <span className="text-xs ilo-fg-dim">
                    已选 {selectedIds.size} 个
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImportPriority}
                  disabled={importingIds.size > 0}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
                  title="导入 35 个推荐专家"
                >
                  <Star size={12} />
                  优先推荐
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={handleBatchImport}
                    disabled={importingIds.size > 0}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium ilo-fg-onaccent bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    <Download size={12} />
                    导入选中 ({selectedIds.size})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 进度条 */}
          {importProgress && (
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-indigo-700 font-medium">
                  {importProgress.done === importProgress.total
                    ? `导入完成！成功 ${importProgress.done}，失败 ${importProgress.failed}`
                    : `正在导入... ${importProgress.done}/${importProgress.total}`}
                </span>
                {importProgress.done < importProgress.total && (
                  <span className="text-xs text-indigo-500">
                    {Math.round((importProgress.done / importProgress.total) * 100)}%
                  </span>
                )}
              </div>
              <div className="w-full bg-indigo-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${(importProgress.done / importProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* 专家列表 - 按部门分组 */}
          <div className="flex-1 overflow-y-auto p-4">
            {agencyLoading && (
              <div className="flex items-center justify-center h-32 ilo-fg-dim">
                <div className="text-sm">加载专家库中...</div>
              </div>
            )}
            {agencyError && (
              <div className="flex items-center justify-center h-32 text-red-500 text-sm">
                {agencyError}
              </div>
            )}

            {!agencyLoading && !agencyError && agencyExperts.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Star size={48} className="ilo-fg mb-3" />
                <p className="text-sm ilo-fg-dim mb-1">专家库为空</p>
                <p className="text-xs ilo-fg-dim mb-4">
                  导入 agency-agents-zh 目录获取 211 个 AI 专家角色
                </p>
                <button
                  onClick={handleImportDir}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 ilo-fg-onaccent text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <FolderOpen size={14} />
                  选择 agency-agents-zh 目录
                </button>
              </div>
            )}

            {!agencyLoading && !agencyError && filteredAgency.length === 0 && agencyExperts.length > 0 && (
              <div className="text-center py-8 ilo-fg-dim text-sm">
                没有匹配的专家
              </div>
            )}

            {!agencyLoading && !agencyError && filteredAgency.length > 0 && (
              <div className="space-y-4">
                {/* "全部"模式：按部门分组 */}
                {activeDepartment === "all" ? (
                  Object.entries(groupedByDept).map(([dept, deptExperts]) => {
                    const collapsed = collapsedDepts.has(dept);
                    const deptName = DEPARTMENTS[dept as ExpertDepartment]?.name ?? "其他";
                    return (
                      <div key={dept}>
                        {/* 部门标题 */}
                        <button
                          onClick={() => toggleDeptCollapse(dept)}
                          className="flex items-center gap-2 mb-2 w-full text-left group"
                        >
                          {collapsed ? (
                            <ChevronRight size={14} className="ilo-fg-dim group-hover:ilo-fg-faint transition-colors" />
                          ) : (
                            <ChevronDown size={14} className="ilo-fg-dim group-hover:ilo-fg-faint transition-colors" />
                          )}
                          <span className="text-xs font-semibold ilo-fg-faint group-hover:ilo-fg-faint transition-colors">
                            {deptName}
                          </span>
                          <span className="px-1.5 py-0.5 ilo-bg-elev-2 ilo-fg-dim text-[10px] rounded">
                            {deptExperts.length}
                          </span>
                        </button>

                        {!collapsed && (
                          <div className="grid grid-cols-3 gap-2 ml-5">
                            {deptExperts.map((expert) => (
                              <AgencyExpertCard
                                key={expert.id}
                                expert={expert}
                                selected={selectedIds.has(expert.id)}
                                importing={importingIds.has(expert.id)}
                                imported={isImported(expert)}
                                isPriority={priorityIdSet.has(expert.id)}
                                onSelect={() => toggleSelect(expert.id)}
                                onView={() => setDetailExpert(expert)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  /* 单部门模式：直接网格 */
                  <div className="grid grid-cols-3 gap-2">
                    {filteredAgency.map((expert) => (
                      <AgencyExpertCard
                        key={expert.id}
                        expert={expert}
                        selected={selectedIds.has(expert.id)}
                        importing={importingIds.has(expert.id)}
                        imported={isImported(expert)}
                        isPriority={priorityIdSet.has(expert.id)}
                        onSelect={() => toggleSelect(expert.id)}
                        onView={() => setDetailExpert(expert)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 创建/编辑表单 */}
      {showForm && (
        <ExpertFormModal
          editing={editing}
          name={name}
          description={description}
          systemPrompt={systemPrompt}
          color={color}
          skills={skills}
          mcpServers={mcpServers}
          onNameChange={setName}
          onDescriptionChange={setDescription}
          onSystemPromptChange={setSystemPrompt}
          onColorChange={setColor}
          onSkillsChange={setSkills}
          onMcpServersChange={setMcpServers}
          onSubmit={handleSubmit}
          onClose={() => setShowForm(false)}
          canSubmit={!!name.trim() && !!systemPrompt.trim()}
        />
      )}

      {/* 删除确认 */}
      {deleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="ilo-bg-elev rounded-xl w-[360px] p-6">
            <h3 className="font-semibold ilo-fg-faint text-lg mb-2">确认删除</h3>
            <p className="text-sm ilo-fg-dim mb-6">
              确定要删除这个专家吗？此操作无法撤销。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleting(null)}
                className="px-4 py-2 text-sm ilo-fg-faint hover:ilo-bg-soft rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await deleteExpert(deleting);
                  setDeleting(null);
                }}
                className="px-4 py-2 text-sm bg-red-600 ilo-fg-onaccent rounded-lg hover:bg-red-700 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agency 专家详情弹窗 */}
      {detailExpert && (
        <AgencyExpertDetail
          expert={detailExpert}
          onClose={() => setDetailExpert(null)}
          onImport={() => {
                  importToProject(detailExpert.id, undefined, createExpert).then(() => {
                    loadExperts();
                    setDetailExpert(null);
                  });
                }
          }
          imported={isImported(detailExpert)}
          isPriority={PRIORITY_EXPERTS.some((p) => p.id === detailExpert.id)}
        />
      )}
    </div>
  );
}

// ─── 专家库卡片 ───

function AgencyExpertCard({
  expert,
  selected,
  importing,
  imported,
  isPriority,
  onSelect,
  onView,
}: {
  expert: AgencyExpert;
  selected: boolean;
  importing: boolean;
  imported: boolean;
  isPriority: boolean;
  onSelect: () => void;
  onView: () => void;
}) {
  const hex = getColorHex(expert.metadata.color);

  return (
    <div
      className={`ilo-bg-elev rounded-lg border p-2.5 hover:shadow-sm transition-all cursor-pointer group ${
        imported
          ? "ilo-border-soft opacity-60"
          : selected
          ? "border-indigo-300 bg-indigo-50/50"
          : "ilo-border-soft hover:ilo-border"
      }`}
      onClick={imported ? onView : onSelect}
    >
      <div className="flex items-start gap-2">
        {/* 选中框 */}
        {!imported && (
          <div
            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              selected
                ? "bg-indigo-600 border-indigo-600"
                : "ilo-border group-hover:border-indigo-400"
            }`}
          >
            {selected && <Check size={10} className="ilo-fg-onaccent" />}
          </div>
        )}

        {/* 图标 */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 relative"
          style={{ backgroundColor: `${hex}15` }}
        >
          <User size={16} style={{ color: hex }} />
          {isPriority && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full flex items-center justify-center">
              <Star size={7} className="ilo-fg-onaccent" />
            </div>
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-medium ilo-fg-faint truncate leading-tight">
            {expert.metadata.name}
          </h4>
          {expert.metadata.description && (
            <p className="text-[10px] ilo-fg-dim mt-0.5 line-clamp-2 leading-relaxed">
              {expert.metadata.description}
            </p>
          )}
          {imported && (
            <span className="inline-block mt-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-[9px] rounded">
              已导入
            </span>
          )}
        </div>

        {/* 查看详情 */}
        {!imported && !selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 ilo-fg-dim hover:text-indigo-600 hover:bg-indigo-50 rounded transition-all shrink-0"
            title="查看详情"
          >
            <ExternalLink size={12} />
          </button>
        )}

        {importing && (
          <div className="shrink-0 mt-1">
            <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agency 专家详情弹窗 ───

function AgencyExpertDetail({
  expert,
  onClose,
  onImport,
  imported,
  isPriority,
}: {
  expert: AgencyExpert;
  onClose: () => void;
  onImport?: () => void;
  imported?: boolean;
  isPriority?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "rules" | "workflow" | "raw">("overview");
  const [importing, setImporting] = useState(false);

  const hex = getColorHex(expert.metadata.color);

  // 构建所有可见内容段
  const allSections = [
    { key: "identity", label: "身份与记忆", content: expert.content.identity },
    { key: "mission", label: "核心使命", content: expert.content.mission },
    { key: "rules", label: "关键规则", content: expert.content.rules },
    { key: "deliverables", label: "技术交付物", content: expert.content.deliverables },
    { key: "workflow", label: "工作流程", content: expert.content.workflow },
    { key: "communication", label: "沟通风格", content: expert.content.communication },
    { key: "memory", label: "学习与记忆", content: expert.content.memory },
    { key: "metrics", label: "成功指标", content: expert.content.metrics },
  ];

  const visibleSections = allSections.filter((s) => s.content.trim().length > 0);
  const hasContent = visibleSections.length > 0;

  async function handleImport() {
    if (importing) return;
    if (!onImport) {
      console.warn("[AgencyExpertDetail] onImport 未提供");
      return;
    }
    setImporting(true);
    try {
      await onImport();
    } catch (e) {
      console.error("[AgencyExpertDetail] 导入失败：", e);
    } finally {
      setImporting(false);
    }
  }

  // 如果没有结构化内容，直接显示原始 system prompt
  const rawPrompt = imported
    ? undefined
    : `${expert.metadata.description}\n\n` +
      visibleSections.map((s) => `## ${s.label}\n${s.content}`).join("\n\n");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="ilo-bg-elev rounded-xl w-[720px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: `${hex}40` }}>
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center relative"
              style={{ backgroundColor: `${hex}15` }}
            >
              <User size={28} style={{ color: hex }} />
              {isPriority && (
                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center shadow-sm">
                  <Star size={10} className="ilo-fg-onaccent" />
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold ilo-fg-faint">{expert.metadata.name}</h2>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs ilo-fg-dim">{expert.metadata.description}</span>
                <span className="px-1.5 py-0.5 ilo-bg-soft ilo-fg-dim text-[10px] rounded">
                  {DEPARTMENTS[expert.department]?.name ?? "其他"}
                </span>
                {imported && (
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-[10px] rounded">
                    已导入
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 ilo-fg-dim hover:ilo-fg-faint rounded-lg hover:ilo-bg-soft transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab 切换 */}
        {hasContent && (
          <div className="px-6 py-2 border-b ilo-border-soft flex items-center gap-1 shrink-0">
            {(["overview", "rules", "workflow", "raw"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === tab
                    ? "bg-indigo-100 text-indigo-700"
                    : "ilo-fg-dim hover:ilo-bg-soft"
                }`}
              >
                {tab === "overview" ? "概览" : tab === "rules" ? "规则与交付" : tab === "workflow" ? "流程与沟通" : "原始内容"}
              </button>
            ))}
          </div>
        )}

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {!hasContent ? (
            <div className="text-center py-8 ilo-fg-dim text-sm">
              该专家暂无详细内容
            </div>
          ) : activeTab === "overview" ? (
            <div className="space-y-4">
              {visibleSections.slice(0, 3).map((s) => (
                <SectionBlock key={s.key} title={s.label} content={s.content} color={hex} />
              ))}
            </div>
          ) : activeTab === "rules" ? (
            <div className="space-y-4">
              {visibleSections
                .filter((s) => ["rules", "deliverables"].includes(s.key))
                .map((s) => (
                  <SectionBlock key={s.key} title={s.label} content={s.content} color={hex} />
                ))}
            </div>
          ) : activeTab === "workflow" ? (
            <div className="space-y-4">
              {visibleSections
                .filter((s) => ["workflow", "communication", "memory", "metrics"].includes(s.key))
                .map((s) => (
                  <SectionBlock key={s.key} title={s.label} content={s.content} color={hex} />
                ))}
            </div>
          ) : (
            /* raw - 原始内容 */
            <div className="rounded-lg border ilo-border-soft overflow-hidden">
              <div className="px-4 py-2 text-xs font-semibold ilo-fg-faint ilo-bg-soft flex items-center justify-between">
                <span>完整 System Prompt</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(rawPrompt ?? "");
                  }}
                  className="text-indigo-600 hover:text-indigo-700 text-[10px] font-normal"
                >
                  复制
                </button>
              </div>
              <pre className="px-4 py-3 text-xs ilo-fg-faint leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto ilo-bg-elev">
                {rawPrompt}
              </pre>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t ilo-border-soft flex items-center justify-between shrink-0">
          <span className="text-xs ilo-fg-dim">{expert.id}</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm ilo-fg-faint hover:ilo-bg-soft rounded-lg transition-colors"
            >
              关闭
            </button>
            {!imported && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 text-sm ilo-fg-onaccent rounded-lg hover:opacity-90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                style={{ backgroundColor: hex }}
              >
                {importing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    导入中...
                  </>
                ) : (
                  "导入到项目"
                )}
              </button>
            )}
            {imported && (
              <span className="px-4 py-2 text-sm text-green-700 bg-green-100 rounded-lg">
                ✓ 已导入
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 内容区块 ───

function SectionBlock({
  title,
  content,
  color,
}: {
  title: string;
  content: string;
  color: string;
}) {
  if (!content.trim()) return null;
  return (
    <div className="rounded-lg border ilo-border-soft overflow-hidden">
      <div className="px-4 py-2 text-xs font-semibold ilo-fg-faint ilo-bg-soft flex items-center gap-2">
        <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <div className="px-4 py-3 text-xs ilo-fg-faint leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
        {content}
      </div>
    </div>
  );
}

// ─── 创建/编辑表单 ───

function ExpertFormModal({
  editing,
  name,
  description,
  systemPrompt,
  color,
  skills,
  mcpServers,
  onNameChange,
  onDescriptionChange,
  onSystemPromptChange,
  onColorChange,
  onSkillsChange,
  onMcpServersChange,
  onSubmit,
  onClose,
  canSubmit,
}: {
  editing: Expert | null;
  name: string;
  description: string;
  systemPrompt: string;
  color: string;
  skills: string;
  mcpServers: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSystemPromptChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onSkillsChange: (v: string) => void;
  onMcpServersChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  canSubmit: boolean;
}) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer drawer--narrow">
        <header className="drawer__head">
          <div className="drawer__title">
            <Briefcase size={14} className="ilo-fg-accent" />
            {editing ? "编辑专家" : "新建专家"}
          </div>
          <button className="chip chip--icon" onClick={onClose} title="关闭">
            <X size={14} />
          </button>
        </header>

        <div className="drawer__body drawer__body--single" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="block text-sm font-medium ilo-fg-faint mb-1.5">
              名称 <span style={{ color: "var(--err)" }}>*</span>
            </label>
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="专家名称，如：前端专家"
              className="w-full px-3 py-2 border ilo-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              style={{ background: "var(--bg)", color: "var(--fg)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium ilo-fg-faint mb-1.5">
              描述
            </label>
            <input
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="简短描述专家的职责范围"
              className="w-full px-3 py-2 border ilo-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              style={{ background: "var(--bg)", color: "var(--fg)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium ilo-fg-faint mb-1.5">
              System Prompt <span style={{ color: "var(--err)" }}>*</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="定义专家角色的核心指令..."
              rows={4}
              className="w-full px-3 py-2 border ilo-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              style={{ background: "var(--bg)", color: "var(--fg)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium ilo-fg-faint mb-1.5">
              颜色标识
            </label>
            <div className="flex gap-2">
              {EXPERT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorChange(c)}
                  className={`w-8 h-8 rounded-lg transition-all ${
                    color === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium ilo-fg-faint mb-1.5">
              Skills（逗号分隔）
            </label>
            <input
              value={skills}
              onChange={(e) => onSkillsChange(e.target.value)}
              placeholder="python, rust, react"
              className="w-full px-3 py-2 border ilo-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              style={{ background: "var(--bg)", color: "var(--fg)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium ilo-fg-faint mb-1.5">
              MCP Servers（逗号分隔）
            </label>
            <input
              value={mcpServers}
              onChange={(e) => onMcpServersChange(e.target.value)}
              placeholder="mcp-server-1, mcp-server-2"
              className="w-full px-3 py-2 border ilo-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              style={{ background: "var(--bg)", color: "var(--fg)" }}
            />
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            className="btn"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="btn btn--primary"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {editing ? "保存" : "创建"}
          </button>
        </footer>
      </aside>
    </div>
  );
}

// ─── 部门图标映射 ───

function getDeptIcon(dept: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    engineering: <Code2 size={14} />,
    marketing: <Star size={14} />,
    design: <Box size={14} />,
    finance: <TrendingUp size={14} />,
    sales: <TrendingUp size={14} />,
    product: <Zap size={14} />,
    game: <Gamepad2 size={14} />,
    academic: <BookOpen size={14} />,
    paidMedia: <Star size={14} />,
    hr: <User size={14} />,
    legal: <MoreHorizontal size={14} />,
    specialized: <Star size={14} />,
    projectManagement: <FolderOpen size={14} />,
    spatialComputing: <Box size={14} />,
    testing: <FlaskConical size={14} />,
    support: <User size={14} />,
    strategy: <TrendingUp size={14} />,
    supplyChain: <Server size={14} />,
    other: <MoreHorizontal size={14} />,
  };
  return iconMap[dept] ?? <MoreHorizontal size={14} />;
}
