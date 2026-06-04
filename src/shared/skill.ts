export interface Skill {
  name: string;
  description: string;
  license?: string;
  allowed_tools: string[];
  content: string;
  path: string;
  category: "public" | "custom";
}

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  version?: string;
  author?: string;
  "allowed-tools": string[];
}

export const ALLOWED_TOOLS = [
  "read_file",
  "write_file",
  "bash",
  "grep",
  "ls",
  "tree",
  "search",
  "web_search",
  "web_fetch",
] as const;

export type AllowedTool = typeof ALLOWED_TOOLS[number];
