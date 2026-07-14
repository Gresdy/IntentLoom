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

export type AppId = AICLI | "claude" | "hermes";

export interface ExpertSnapshot {
  expertId: number;
  sessionId: string;
  content: string;
  timestamp: number;
}

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

export interface Expert {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  color: string;
  enabled: boolean;
  is_template: boolean;
  department?: string;
  priority?: number;
  created_at?: string;
  sortOrder?: number;
  skills?: string[];
  mcpServers?: string[];
  knowledgeBase?: string;
  avatar?: string;
  systemPrompt?: string;
  model?: string;
  isActive?: boolean;
  projectId?: number;
}

export interface ExpertTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  color: string;
}

// ── Knowledge Base / Local RAG (v1) ─────────────────────────────────────
// Mirror of `src-tauri/src/commands/knowledge.rs` types. Keep these in sync
// whenever the Rust side adds a field — TypeScript only sees what we type.

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  provider: string;
  apiBase: string;
  apiKey: string;
  embedModel: string;
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  documentCount: number;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export type KbDocumentStatus = "pending" | "ingesting" | "ready" | "failed";

export interface KbDocument {
  id: string;
  kbId: string;
  name: string;
  sourcePath: string;
  mimeType: string;
  sizeBytes: number;
  charCount: number;
  chunkCount: number;
  status: KbDocumentStatus;
  error: string | null;
  createdAt: string;
}

export interface KbChunk {
  id: string;
  kbId: string;
  docId: string;
  ord: number;
  content: string;
  charStart: number;
  charEnd: number;
}

export interface KbCitation {
  docId: string;
  docName: string;
  chunkId: string;
  ord: number;
  score: number;
  preview: string;
}

export interface KbAskResult {
  question: string;
  prompt: string;
  citations: KbCitation[];
}

export interface KbIngestResult {
  document: KbDocument;
  chunkCount: number;
}
