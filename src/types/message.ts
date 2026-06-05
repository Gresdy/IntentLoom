export interface Message {
  id: string;
  type: MessageType;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResponses?: ToolResponse[];
  thinking?: any;
  plan?: PlanState;
  permission?: PermissionRequest;
  usage?: TokenUsage;
  metadata?: MessageMetadata;
  position?: 'left' | 'center' | 'right';
}

export type MessageType = 
  | 'text' 
  | 'tool_call' 
  | 'tool_response' 
  | 'plan' 
  | 'tips' 
  | 'error' 
  | 'agent_status'
  | 'thinking'
  | 'acp_tool_call'
  | 'acp_permission'
  | 'available_commands'
  | 'usage_update';

export interface MessageMetadata {
  model?: string;
  backend?: string;
  agentId?: string;
  [key: string]: any;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: any;
  status: ToolCallStatus;
  result?: any;
  toolCallId?: string;
  kind?: ToolCallKind;
  title?: string;
  rawInput?: any;
  diff?: DiffContent[];
}

export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'error';

export type ToolCallKind = 'edit' | 'read' | 'execute';

export interface DiffContent {
  type: 'diff' | 'content' | 'add' | 'remove';
  path?: string;
  oldText?: string;
  newText?: string;
}

export interface ToolResponse {
  toolCallId: string;
  status: 'success' | 'error';
  result?: any;
  error?: string;
  content?: string;
}

export interface PlanStep {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  content: string;
  result?: string;
}

export interface PlanEntry {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dependencies?: string[];
}

export interface PlanState {
  entries: PlanEntry[];
  currentIndex: number;
  isRunning?: boolean;
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  args: any;
  reason?: string;
  remembered?: boolean;
  status?: 'pending' | 'approved' | 'denied';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface Conversation {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  metadata: {
    model?: string;
    backend?: string;
    workspace?: string;
    // Which agent (CLI) this conversation belongs to. Older persisted
    // conversations won't have this; readers must default to "claude"
    // for backwards compatibility.
    agentId?: string;
  };
}

export interface Expert {
  id: string;
  name: string;
  description: string;
  avatar?: string;
  color?: string;
  skills: string[];
  isActive: boolean;
  systemPrompt?: string;
}

export interface Agent {
  id: string;
  name: string;
  type: 'claude' | 'gemini' | 'anthropic' | 'openai';
  config: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  systemPrompt?: string;
}
