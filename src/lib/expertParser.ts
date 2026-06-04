/**
 * Agency Expert MD 文件解析器
 *
 * 解析 agency-agents-zh 格式的 .md 专家文件：
 *   - YAML frontmatter（name, description, color）
 *   - Markdown body（按 ## 标题分区）
 *
 * 不依赖 gray-matter，轻量自实现。
 */

import type {
  AgencyExpert,
  ExpertColor,
  ExpertContent,
  ExpertMetadata,
} from "../shared/agencyExpert";
import { parseColor, detectDepartment } from "../shared/agencyExpert";

// ─── Frontmatter 解析 ───

interface RawFrontmatter {
  name?: string;
  description?: string;
  color?: string;
  [key: string]: string | undefined;
}

/**
 * 从 MD 文本中提取 YAML frontmatter 和 body 内容。
 * 格式：以 "---" 开头和结尾的 YAML 块。
 */
function extractFrontmatter(text: string): {
  data: RawFrontmatter;
  content: string;
} {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: text };
  }

  const yaml = match[1];
  const body = match[2];

  // 轻量 YAML 解析（只处理 key: value 格式）
  const data: RawFrontmatter = {};
  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }

  return { data, content: body };
}

// ─── 内容分区提取 ───

/** agency-agents-zh 标准章节映射（含变体） */
const SECTION_KEYS: [RegExp, keyof ExpertContent][] = [
  // 身份
  [/身份与记忆|身份与角色|你的身份|🧠.*身份|:brain:.*身份/i, "identity"],
  // 核心使命
  [/核心使命|🎯.*使命|:dart:.*使命|你的核心使命/i, "mission"],
  // 关键规则
  [/关键规则|必须遵守|🚨.*规则|🚫.*规则|🔧.*规则|:rotating_light:.*规则/i, "rules"],
  // 技术交付物
  [/技术交付物|交付物|专业能力与交付物|📋.*交付|🛠.*交付|:clipboard:.*交付/i, "deliverables"],
  // 工作流程
  [/工作流程|🔄.*流程|:arrows_counterclockwise:.*流程/i, "workflow"],
  // 沟通风格
  [/沟通风格|💬.*沟通|:speech_balloon:.*沟通/i, "communication"],
  // 学习与记忆
  [/学习与记忆|学习与积累|持续学习|🔄.*学习|:arrows_counterclockwave:.*学习/i, "memory"],
  // 成功指标
  [/成功指标|成功标准|质量指标|📊.*指标|🎯.*指标|:dart:.*指标/i, "metrics"],
];

/**
 * 从 Markdown body 中按 ## 标题分割，提取各章节内容。
 */
function extractSections(markdown: string): ExpertContent {
  const sections = markdown.split(/^##\s+/m);

  const content: ExpertContent = {
    identity: "",
    mission: "",
    rules: "",
    deliverables: "",
    workflow: "",
    communication: "",
    memory: "",
    metrics: "",
  };

  for (const section of sections) {
    const firstLine = section.split("\n")[0]?.trim() ?? "";
    const bodyText = section.split("\n").slice(1).join("\n").trim();

    // 用正则匹配标题到 content key
    for (const [pattern, contentKey] of SECTION_KEYS) {
      if (pattern.test(firstLine)) {
        (content[contentKey] as string) += bodyText + "\n";
        break;
      }
    }
  }

  // 去除尾部多余换行
  for (const key of Object.keys(content) as (keyof ExpertContent)[]) {
    content[key] = content[key].trim();
  }

  return content;
}

// ─── 颜色规范化 ───

/**
 * 将 agency-agents-zh 中的颜色名称映射为标准 ExpertColor。
 * agency 文件中可能用 hex 值（如 "#06b6d4"）或名称（如 "cyan"）。
 */
function normalizeColor(raw: string): ExpertColor {
  const trimmed = raw.trim();

  // 如果是颜色名称
  const asName = parseColor(trimmed);
  if (asName !== "cyan" || trimmed === "cyan") return asName;

  // 如果是 hex 值，根据色相反推最接近的 ExpertColor
  const hexMatch = trimmed.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = `#${hexMatch[1].toLowerCase()}`;
    // 先精确匹配
    const hexToColor: Record<string, ExpertColor> = {
      "#06b6d4": "cyan",
      "#3b82f6": "blue",
      "#10b981": "green",
      "#f59e0b": "yellow",
      "#ef4444": "red",
      "#8b5cf6": "purple",
      "#ec4899": "pink",
      "#f97316": "orange",
    };
    if (hexToColor[hex]) return hexToColor[hex];

    // 色相近似匹配
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2 / 255;

    if (l < 0.2) return "purple"; // 暗色偏紫
    if (l > 0.8) return "yellow"; // 亮色偏黄

    // 简单色相判断
    if (max === min) return "yellow"; // 灰色偏黄
    let h = 0;
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;

    if (h < 15 || h >= 345) return "red";
    if (h < 45) return "orange";
    if (h < 75) return "yellow";
    if (h < 165) return "green";
    if (h < 195) return "cyan";
    if (h < 265) return "blue";
    if (h < 315) return "purple";
    return "pink";
  }

  return "cyan";
}

// ─── 核心解析函数 ───

/**
 * 解析单个 agency expert MD 文件。
 *
 * @param raw  文件原始文本
 * @param filePath  文件路径（用于提取 ID 和部门）
 */
export function parseExpertMarkdown(
  raw: string,
  filePath: string
): AgencyExpert {
  const { data, content: body } = extractFrontmatter(raw);
  const fileName = filePath.split("/").pop() ?? "unknown";
  const id = fileName.replace(/\.md$/i, "");

  const metadata: ExpertMetadata = {
    name: data.name ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: data.description ?? "",
    color: normalizeColor(data.color ?? "cyan"),
  };

  const content = extractSections(body);

  return {
    id,
    metadata,
    content,
    department: detectDepartment(filePath),
    source: "agency",
    filePath,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * 将 AgencyExpert 转换为项目级 Expert 的 systemPrompt。
 * 组合：身份 + 核心使命 + 关键规则（精简版）
 */
export function buildSystemPrompt(expert: AgencyExpert): string {
  const parts: string[] = [];

  if (expert.content.identity) {
    parts.push(expert.content.identity);
  }
  if (expert.content.mission) {
    parts.push(`## 核心使命\n${expert.content.mission}`);
  }
  if (expert.content.rules) {
    parts.push(`## 关键规则\n${expert.content.rules}`);
  }

  return parts.join("\n\n");
}

/**
 * 将 AgencyExpert 转换为完整 systemPrompt（含所有内容区）。
 */
export function buildFullSystemPrompt(expert: AgencyExpert): string {
  const allSections: [string, string][] = [
    ["身份与记忆", expert.content.identity],
    ["核心使命", expert.content.mission],
    ["关键规则", expert.content.rules],
    ["技术交付物", expert.content.deliverables],
    ["工作流程", expert.content.workflow],
    ["沟通风格", expert.content.communication],
    ["学习与记忆", expert.content.memory],
    ["成功指标", expert.content.metrics],
  ];
  const sections = allSections.filter(([, v]) => v.length > 0);

  const header = `# ${expert.metadata.name}\n${expert.metadata.description}`;
  const body = sections.map(([t, v]) => `## ${t}\n${v}`).join("\n\n");

  return `${header}\n\n${body}`;
}

/**
 * 从 AgencyExpert 生成项目级 Expert 的创建参数。
 */
export function toProjectExpert(expert: AgencyExpert) {
  return {
    name: expert.metadata.name,
    description: expert.metadata.description,
    systemPrompt: buildSystemPrompt(expert),
    color: getColorHex(expert.metadata.color),
    skills: [] as string[],
    mcpServers: [] as string[],
  };
}

function getColorHex(color: ExpertColor): string {
  const map: Record<ExpertColor, string> = {
    cyan: "#06b6d4",
    blue: "#3b82f6",
    green: "#10b981",
    yellow: "#f59e0b",
    red: "#ef4444",
    purple: "#8b5cf6",
    pink: "#ec4899",
    orange: "#f97316",
  };
  return map[color] ?? "#06b6d4";
}
