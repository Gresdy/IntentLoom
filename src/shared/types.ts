export interface Project {
  id: number;
  name: string;
  path: string;
  created_at: string;
}

export interface Session {
  id: number;
  title: string;
  file_path: string;
  created_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  timestamp: number;
}

export interface PlanTask {
  id: string;
  title: string;
  completed: boolean;
  commands?: string[];
}

export interface Plan {
  title: string;
  tasks: PlanTask[];
  file_path?: string;
}

export type AICLI = "claude-code" | "gemini" | "codex" | "opencode" | "openclaw";

export interface Provider {
  id: string;
  name: string;
  type: "official" | "aws-bedrock" | "proxy";
  api_key?: string;
  api_base?: string;
}

export interface FileNode {
  name: string;
  path: string;
  file_type: "file" | "directory";
  children?: FileNode[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  author: string;
  source: "claude-plugins" | "skillsllm" | "skillsmp";
  repo_url: string;
  local_path?: string;
  symlinks: Record<string, string>;
  version?: string;
  installed_at?: string;
  updated_at?: string;
}

export interface SkillsDirs {
  intentloom: string;
  claude_code: string;
  windsurf: string;
  cursor: string;
  vscode: string;
  antigravity: string;
  codebuddy: string;
  codex: string;
  kiro: string;
  openclaw: string;
  opencode: string;
  qoder: string;
  trae: string;
}
