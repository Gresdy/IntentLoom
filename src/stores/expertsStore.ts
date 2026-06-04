import { create } from "zustand";
import { invoke } from "../lib/tauri";
import type { Expert, ExpertTemplate } from "../shared/types";

/// 预设专家模板（用于快速创建）
const DEFAULT_TEMPLATES: ExpertTemplate[] = [
  {
    id: "fullstack-engineer",
    name: "全栈工程师",
    description: "前后端全能，擅长 Laravel/React/Vue/Flutter",
    systemPrompt:
      "你是一位高级全栈工程师，精通前端、后端、移动端开发。你有10年经验，对架构设计、性能优化、安全编码有深刻理解。",
    color: "#6366f1",
  },
  {
    id: "frontend-expert",
    name: "前端专家",
    description: "React/Vue/TypeScript/CSS 深度专家",
    systemPrompt:
      "你是一位前端专家，精通 React、Vue、TypeScript、CSS 和现代前端工程化实践。",
    color: "#06b6d4",
  },
  {
    id: "backend-expert",
    name: "后端专家",
    description: "Rust/Go/Python/Java 深度专家",
    systemPrompt:
      "你是一位后端架构专家，精通微服务、分布式系统、数据库设计、性能优化。",
    color: "#10b981",
  },
  {
    id: "data-analyst",
    name: "数据分析专家",
    description: "Python/数据分析/机器学习",
    systemPrompt:
      "你是一位数据分析专家，精通 Python、数据分析、机器学习、数据可视化。",
    color: "#f59e0b",
  },
  {
    id: "agri-remote",
    name: "农林业遥感专家",
    description: "遥感影像分析/作物识别/产量预测",
    systemPrompt:
      "你是一位农林业遥感专家，精通卫星遥感影像分析、作物类型识别、产量预测模型、农业信息化解决方案。",
    color: "#22c55e",
  },
  {
    id: "security-expert",
    name: "安全专家",
    description: "应用安全/渗透测试/安全架构",
    systemPrompt:
      "你是一位安全专家，精通 OWASP、Web 安全、移动端安全、云原生安全、安全架构设计。",
    color: "#ef4444",
  },
  {
    id: "devops-expert",
    name: "DevOps 专家",
    description: "CI/CD/Docker/K8s/监控运维",
    systemPrompt:
      "你是一位 DevOps 工程师，精通 CI/CD、Docker、Kubernetes、监控告警、基础设施即代码。",
    color: "#8b5cf6",
  },
];

interface ExpertsState {
  experts: Expert[];
  templates: ExpertTemplate[];
  loading: boolean;
  error: string | null;

  // 加载专家列表（全部或按项目）
  loadExperts: (projectId?: string) => Promise<void>;
  createExpert: (projectId: string | undefined, expert: Partial<Expert>) => Promise<Expert>;
  updateExpert: (id: string, updates: Partial<Expert>) => Promise<void>;
  deleteExpert: (id: string) => Promise<void>;
  toggleExpertActive: (id: string) => Promise<void>;
  getTemplates: () => ExpertTemplate[];
  getActiveExpert: (projectId: string) => Expert | undefined;
}

export const useExpertsStore = create<ExpertsState>((set, get) => ({
  experts: [],
  templates: DEFAULT_TEMPLATES,
  loading: false,
  error: null,

  loadExperts: async (projectId?: string) => {
    set({ loading: true, error: null });
    try {
      const experts = await invoke<Expert[]>("list_experts", { projectId: projectId || null });
      set({ experts, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  createExpert: async (projectId: string | undefined, expert: Partial<Expert>) => {
    const newExpert = await invoke<Expert>("create_expert", {
      projectId: projectId || null,
      name: expert.name ?? "新专家",
      description: expert.description ?? "",
      avatar: expert.avatar,
      systemPrompt: expert.systemPrompt ?? "",
      skills: expert.skills ?? [],
      mcpServers: expert.mcpServers ?? [],
      model: expert.model,
      knowledgeBase: expert.knowledgeBase ?? [],
      color: expert.color ?? "#6366f1",
      isActive: expert.isActive ?? true,
      sortOrder: expert.sortOrder ?? 0,
    });
    set((s) => ({ experts: [...s.experts, newExpert] }));
    return newExpert;
  },

  updateExpert: async (id: string, updates: Partial<Expert>) => {
    // skills / mcp_servers / knowledge_base 转 JSON string
    const skillsJson =
      updates.skills !== undefined
        ? JSON.stringify(updates.skills)
        : undefined;
    const mcpServersJson =
      updates.mcpServers !== undefined
        ? JSON.stringify(updates.mcpServers)
        : undefined;
    const knowledgeBaseJson =
      updates.knowledgeBase !== undefined
        ? JSON.stringify(updates.knowledgeBase)
        : undefined;

    await invoke("update_expert", {
      id,
      name: updates.name,
      description: updates.description,
      avatar: updates.avatar,
      systemPrompt: updates.systemPrompt,
      skills: skillsJson,
      mcpServers: mcpServersJson,
      model: updates.model,
      knowledgeBase: knowledgeBaseJson,
      color: updates.color,
      isActive: updates.isActive,
      sortOrder: updates.sortOrder,
    });
    set((s) => ({
      experts: s.experts.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    }));
  },

  deleteExpert: async (id: string) => {
    await invoke("delete_expert", { id });
    set((s) => ({ experts: s.experts.filter((e) => e.id !== id) }));
  },

  toggleExpertActive: async (id: string) => {
    await invoke("toggle_expert_active", { id });
    set((s) => ({
      experts: s.experts.map((e) =>
        e.id === id ? { ...e, isActive: !e.isActive } : e
      ),
    }));
  },

  getTemplates: () => DEFAULT_TEMPLATES,

  getActiveExpert: (projectId?: string) => {
    return get().experts.find((e) => e.projectId === projectId && e.isActive);
  },
}));
