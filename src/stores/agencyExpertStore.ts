/**
 * Agency Expert Store
 *
 * 管理 agency-agents-zh 专家库的全局状态。
 * 专家库存储在 ~/.intentloom/experts/ 目录下。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "../lib/tauri";
import { parseExpertMarkdown, buildSystemPrompt } from "../lib/expertParser";
import type {
  AgencyExpert,
  ExpertCard,
  ExpertDepartment,
} from "../shared/agencyExpert";
import { getColorHex, DEPARTMENTS } from "../shared/agencyExpert";
import type { Expert } from "../shared/types";

// ─── State ───

interface AgencyExpertState {
  experts: AgencyExpert[];
  searchQuery: string;
  activeDepartment: ExpertDepartment | "all";
  loading: boolean;
  error: string | null;

  // Actions
  loadFromDir: (dirPath: string) => Promise<void>;
  searchExperts: (query: string) => void;
  filterByDepartment: (dept: ExpertDepartment | "all") => void;
  getExpert: (id: string) => AgencyExpert | undefined;
  getSystemPrompt: (id: string) => string;
  toggleExpert: (id: string) => void;

  // 导入到项目（projectId 可选）
  importToProject: (
    expertId: string,
    projectId: string | undefined,
    createExpertFn: (projectId: string | undefined, data: Partial<Expert>) => Promise<Expert>
  ) => Promise<Expert>;

  // 批量导入到项目
  batchImportToProject: (
    expertIds: string[],
    projectId: string | undefined,
    createExpertFn: (projectId: string | undefined, data: Partial<Expert>) => Promise<Expert>
  ) => Promise<{ success: number; failed: number }>;

  // 计算属性
  getFilteredExperts: () => AgencyExpert[];
  getFilteredCards: () => ExpertCard[];
  getDepartmentCounts: () => Record<string, number>;
}

export const useAgencyExpertStore = create<AgencyExpertState>()(
  persist(
    (set, get) => ({
      experts: [],
      searchQuery: "",
      activeDepartment: "all",
      loading: false,
      error: null,

      // ─── 从目录加载专家 MD 文件 ───
      loadFromDir: async (dirPath: string) => {
        set({ loading: true, error: null });
        try {
          // 调用 Tauri 后端扫描目录中的 .md 文件
          const result = await invoke<{
            files: { path: string; content: string }[];
          }>("scan_expert_files", { dirPath });

          const experts: AgencyExpert[] = result.files
            .map((f) => parseExpertMarkdown(f.content, f.path))
            // 过滤掉无效文件：无 name（frontmatter 缺失）或非角色文件
            .filter(
              (e) =>
                e.metadata.name.trim() !== "" &&
                !e.filePath.includes(".github") &&
                !e.filePath.includes("playbooks") &&
                !e.filePath.includes("runbooks") &&
                !e.filePath.includes("coordination") &&
                !e.filePath.includes("examples/") &&
                !e.filePath.includes("integrations/")
            );

          // 合并：已存在的保留 enabled 状态
          const existingMap = new Map(get().experts.map((e) => [e.id, e]));
          const merged = experts.map((expert) => {
            const existing = existingMap.get(expert.id);
            if (existing) {
              return { ...expert, enabled: existing.enabled };
            }
            return expert;
          });

          set({ experts: merged, loading: false });
        } catch (e) {
          set({ error: String(e), loading: false });
        }
      },

      // ─── 搜索 ───
      searchExperts: (query: string) => {
        set({ searchQuery: query });
      },

      // ─── 部门筛选 ───
      filterByDepartment: (dept: ExpertDepartment | "all") => {
        set({ activeDepartment: dept });
      },

      // ─── 获取单个专家 ───
      getExpert: (id: string) => {
        return get().experts.find((e) => e.id === id);
      },

      // ─── 获取 system prompt ───
      getSystemPrompt: (id: string) => {
        const expert = get().getExpert(id);
        if (!expert) return "";
        return buildSystemPrompt(expert);
      },

      // ─── 切换启用状态 ───
      toggleExpert: (id: string) => {
        set((state) => ({
          experts: state.experts.map((e) =>
            e.id === id ? { ...e, enabled: !e.enabled, updatedAt: Date.now() } : e
          ),
        }));
      },

      // ─── 导入单个专家（projectId 可选） ───
      importToProject: async (
        expertId: string,
        projectId: string | undefined,
        createExpertFn: (projectId: string | undefined, data: Partial<Expert>) => Promise<Expert>
      ) => {
        const expert = get().getExpert(expertId);
        if (!expert) throw new Error(`Expert not found: ${expertId}`);

        return createExpertFn(projectId, {
          name: expert.metadata.name,
          description: expert.metadata.description,
          systemPrompt: buildSystemPrompt(expert),
          color: getColorHex(expert.metadata.color),
          skills: [],
          mcpServers: [],
        });
      },

      // ─── 批量导入 ───
      batchImportToProject: async (
        expertIds: string[],
        projectId: string | undefined,
        createExpertFn: (projectId: string | undefined, data: Partial<Expert>) => Promise<Expert>
      ) => {
        let success = 0;
        let failed = 0;

        for (const id of expertIds) {
          try {
            await get().importToProject(id, projectId, createExpertFn);
            success++;
          } catch {
            failed++;
          }
        }

        return { success, failed };
      },

      // ─── 过滤后的专家列表 ───
      getFilteredExperts: () => {
        const { experts, searchQuery, activeDepartment } = get();
        return experts.filter((e) => {
          // 部门筛选
          if (activeDepartment !== "all" && e.department !== activeDepartment) {
            return false;
          }
          // 搜索
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
              e.metadata.name.toLowerCase().includes(q) ||
              e.metadata.description.toLowerCase().includes(q) ||
              e.id.toLowerCase().includes(q)
            );
          }
          return true;
        });
      },

      // ─── 过滤后的卡片列表 ───
      getFilteredCards: () => {
        return get().getFilteredExperts().map((e) => ({
          id: e.id,
          name: e.metadata.name,
          description: e.metadata.description,
          color: e.metadata.color,
          department: e.department,
          enabled: e.enabled,
        }));
      },

      // ─── 各部门数量统计 ───
      getDepartmentCounts: () => {
        const { experts } = get();
        const counts: Record<string, number> = { all: experts.length };

        for (const dept of Object.keys(DEPARTMENTS)) {
          counts[dept] = experts.filter((e) => e.department === dept).length;
        }

        return counts;
      },
    }),
    {
      name: "agency-expert-storage",
      // 只持久化 experts 和 activeDepartment
      partialize: (state) => ({
        experts: state.experts,
        activeDepartment: state.activeDepartment,
      }),
    }
  )
);
