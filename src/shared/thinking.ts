export interface Entity {
  name: string;
  type: string;
  description?: string;
}

export interface IntentUnderstanding {
  intentTypes: string[];
  entities: Entity[];
  domain: string;
  confidence: number;
  keywords?: string[];
}

export interface ReasoningStep {
  id: string;
  order: number;
  description: string;
  details?: string;
  relatedTasks?: string[];
  thinking?: string;
}

export type ThinkTagFormat = 'anthropic' | 'general' | 'answer' | 'minimax';

export interface ThinkParseResult {
  format: ThinkTagFormat;
  content: string;
  startPos: number;
  endPos: number;
}

export interface ThoughtData {
  subject: string;
  description: string;
  content?: string;
  status?: 'active' | 'done';
  durationMs?: number;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in-progress" | "completed";
  dependencies?: string[];
  estimatedComplexity?: number;
  commands?: string[];
  result?: string;
  error?: string;
}

export interface ThinkingProcess {
  intent: IntentUnderstanding;
  reasoningSteps: ReasoningStep[];
  tasks: TaskItem[];
  rawThinking?: string;
  timestamp: number;
}

export type ThinkingPhase = "intent" | "reasoning" | "tasks";

export interface ThinkingState {
  isProcessing: boolean;
  thinkingProcess: ThinkingProcess | null;
  expandedPhases: Set<ThinkingPhase>;
  error: string | null;
  showThinkingPanel: boolean;
  subject?: string;
  description?: string;
  duration?: number;
  status?: 'active' | 'done';
  rawContent?: string;
}

export const DEFAULT_INTENT: IntentUnderstanding = {
  intentTypes: [],
  entities: [],
  domain: "通用",
  confidence: 0,
};

export const DEFAULT_THINKING_PROCESS: ThinkingProcess = {
  intent: DEFAULT_INTENT,
  reasoningSteps: [],
  tasks: [],
  timestamp: Date.now(),
};
