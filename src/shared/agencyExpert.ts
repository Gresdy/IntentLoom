/**
 * Agency Expert 类型定义
 *
 * 对应 agency-agents-zh 的 AI 专家角色格式。
 * 与项目级 Expert 不同，AgencyExpert 是全局共享的专家模板库。
 */

// ─── 元数据（对应 YAML frontmatter） ───

export interface ExpertMetadata {
  name: string;
  description: string;
  color: ExpertColor;
}

// ─── 内容分区（对应 ## 标题分割） ───

export interface ExpertContent {
  identity: string;       // ## 你的身份与记忆
  mission: string;        // ## 你的核心使命
  rules: string;          // ## 你必须遵循的关键规则
  deliverables: string;   // ## 你的技术交付物
  workflow: string;       // ## 你的工作流程
  communication: string;  // ## 你的沟通风格
  memory: string;         // ## 学习与记忆
  metrics: string;        // ## 你的成功指标
}

// ─── 完整专家定义 ───

export interface AgencyExpert {
  id: string;              // 文件名（不含 .md），如 "engineering-frontend-developer"
  metadata: ExpertMetadata;
  content: ExpertContent;

  // 分类
  department: ExpertDepartment;
  source: "agency" | "custom";

  // 扩展
  filePath: string;        // 原始文件相对路径
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── 简化卡片（列表展示用） ───

export interface ExpertCard {
  id: string;
  name: string;
  description: string;
  color: ExpertColor;
  department: ExpertDepartment;
  enabled: boolean;
}

// ─── 颜色枚举 ───

export type ExpertColor =
  | "cyan"
  | "blue"
  | "green"
  | "yellow"
  | "red"
  | "purple"
  | "pink"
  | "orange";

// ─── 颜色映射（agency color name → hex） ───

export const EXPERT_COLOR_MAP: Record<ExpertColor, string> = {
  cyan: "#06b6d4",
  blue: "#3b82f6",
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  pink: "#ec4899",
  orange: "#f97316",
};

// 解析颜色名称为 hex，未知颜色默认 cyan
export function parseColor(raw: string): ExpertColor {
  const normalized = raw?.trim().toLowerCase() ?? "";
  if (normalized in EXPERT_COLOR_MAP) return normalized as ExpertColor;
  return "cyan";
}

// 获取颜色 hex 值
export function getColorHex(color: ExpertColor): string {
  return EXPERT_COLOR_MAP[color] ?? EXPERT_COLOR_MAP.cyan;
}

// ─── 部门分类 ───

export type ExpertDepartment =
  | "engineering"
  | "marketing"
  | "design"
  | "finance"
  | "sales"
  | "product"
  | "game"
  | "academic"
  | "paidMedia"
  | "hr"
  | "legal"
  | "specialized"
  | "projectManagement"
  | "spatialComputing"
  | "testing"
  | "support"
  | "strategy"
  | "supplyChain"
  | "other";

export interface DepartmentConfig {
  name: string;
  icon: string;     // IconPark 图标名
  count?: number;   // 运行时统计
}

export const DEPARTMENTS: Record<ExpertDepartment, DepartmentConfig> = {
  engineering: { name: "工程部", icon: "Code" },
  marketing: { name: "营销部", icon: "Megaphone" },
  design: { name: "设计部", icon: "Palette" },
  finance: { name: "金融部", icon: "Money" },
  sales: { name: "销售部", icon: "TrendUp" },
  product: { name: "产品部", icon: "Product" },
  game: { name: "游戏开发", icon: "Game" },
  academic: { name: "学术部", icon: "Book" },
  paidMedia: { name: "付费媒体", icon: "Ads" },
  hr: { name: "人力资源", icon: "Users" },
  legal: { name: "法务部", icon: "Scale" },
  specialized: { name: "专项部", icon: "Star" },
  projectManagement: { name: "项目管理", icon: "Folder" },
  spatialComputing: { name: "空间计算", icon: "Box" },
  testing: { name: "测试部", icon: "TestTube" },
  support: { name: "支持部", icon: "Customer" },
  strategy: { name: "战略部", icon: "ChartLine" },
  supplyChain: { name: "供应链", icon: "Delivery" },
  other: { name: "其他", icon: "More" },
};

// 目录名到部门枚举的特殊映射（非 1:1 的目录名）
const DIR_TO_DEPT: Record<string, ExpertDepartment> = {
  "game-development": "game",
  "paid-media": "paidMedia",
  "project-management": "projectManagement",
  "spatial-computing": "spatialComputing",
  "supply-chain": "supplyChain",
  // game-development 的子目录也归到 game
  unity: "game",
  "unreal-engine": "game",
  godot: "game",
  "roblox-studio": "game",
  blender: "game",
};

// 从文件路径推断部门（目录名 → 部门枚举）
export function detectDepartment(filePath: string): ExpertDepartment {
  const parts = filePath.split("/");
  // 从路径中查找部门名（优先精确匹配，再特殊映射）
  for (let i = parts.length - 2; i >= 0; i--) {
    const dirName = parts[i];
    if (dirName in DEPARTMENTS) return dirName as ExpertDepartment;
    if (dirName in DIR_TO_DEPT) return DIR_TO_DEPT[dirName];
  }

  return "other";
}

// ─── 优先导入列表（35个推荐专家） ───

export const PRIORITY_EXPERTS: { department: ExpertDepartment; id: string }[] = [
  { department: "engineering", id: "engineering-frontend-developer" },
  { department: "engineering", id: "engineering-backend-architect" },
  { department: "engineering", id: "engineering-ai-engineer" },
  { department: "engineering", id: "engineering-security-engineer" },
  { department: "engineering", id: "engineering-devops-automator" },
  { department: "engineering", id: "engineering-data-engineer" },
  { department: "engineering", id: "engineering-mobile-app-builder" },
  { department: "engineering", id: "engineering-code-reviewer" },
  { department: "engineering", id: "engineering-technical-writer" },
  { department: "engineering", id: "engineering-software-architect" },
  { department: "engineering", id: "engineering-sre" },
  { department: "engineering", id: "engineering-database-optimizer" },
  { department: "engineering", id: "engineering-git-workflow-master" },
  { department: "engineering", id: "engineering-rapid-prototyper" },
  { department: "design", id: "design-ui-designer" },
  { department: "design", id: "design-ux-researcher" },
  { department: "design", id: "design-brand-guardian" },
  { department: "marketing", id: "marketing-xiaohongshu-operator" },
  { department: "marketing", id: "marketing-douyin-strategist" },
  { department: "marketing", id: "marketing-wechat-operator" },
  { department: "marketing", id: "marketing-bilibili-strategist" },
  { department: "marketing", id: "marketing-baidu-seo-specialist" },
  { department: "marketing", id: "marketing-growth-hacker" },
  { department: "marketing", id: "marketing-seo-specialist" },
  { department: "product", id: "product-manager" },
  { department: "finance", id: "finance-financial-analyst" },
  { department: "finance", id: "finance-investment-researcher" },
  { department: "sales", id: "sales-engineer" },
  { department: "sales", id: "sales-deal-strategist" },
  { department: "specialized", id: "specialized-meeting-assistant" },
  { department: "specialized", id: "specialized-mcp-builder" },
  { department: "engineering", id: "engineering-incident-response-commander" },
  { department: "engineering", id: "engineering-wechat-mini-program-developer" },
  { department: "engineering", id: "engineering-feishu-integration-developer" },
  { department: "engineering", id: "engineering-dingtalk-integration-developer" },
];
