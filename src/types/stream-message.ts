export interface IMessageThinking {
  type: 'thinking';
  content: {
    content: string;
    status: 'active' | 'done';
    durationMs?: number;
    subject?: string;
    description?: string;
  };
}

export interface IMessageText {
  type: 'text';
  content: {
    content: string;
    role?: 'user' | 'assistant';
  };
}

export interface IMessageToolCall {
  type: 'tool_call';
  content: {
    update: {
      toolCallId: string;
      kind: 'edit' | 'read' | 'execute';
      title?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'error' | 'done';
      rawInput?: any;
      content?: DiffContent[];
    };
  };
}

export interface IMessagePlan {
  type: 'plan';
  content: {
    entries: PlanEntry[];
    currentIndex: number;
    isRunning?: boolean;
  };
}

export interface IMessagePermission {
  type: 'permission';
  content: {
    id: string;
    tool: string;
    args: any;
    message: string;
    options: PermissionOption[];
  };
}

export interface IMessageError {
  type: 'error';
  content: {
    message: string;
    code?: string;
  };
}

export interface IMessageToolResponse {
  type: 'tool_response';
  content: {
    toolCallId: string;
    status: string;
    result?: string;
    content?: string;
    error?: string;
  };
}

export interface IMessageUsage {
  type: 'usage';
  content: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
}

export interface IMessageTips {
  type: 'tips';
  content: {
    level?: 'info' | 'warning' | 'error';
    message: string;
  };
}

export interface DiffContent {
  type: 'diff' | 'content' | 'add' | 'remove';
  path?: string;
  oldText?: string;
  newText?: string;
}

export interface PlanEntry {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  dependencies?: string[];
}

export interface PermissionOption {
  id: string;
  name: string;
  description?: string;
}

export type TMessage =
  | IMessageThinking
  | IMessageText
  | IMessageToolCall
  | IMessageToolResponse
  | IMessagePlan
  | IMessagePermission
  | IMessageError
  | IMessageUsage
  | IMessageTips;

export interface StreamEvent {
  event: 'thinking' | 'tool_call' | 'tool_response' | 'error' | 'permission' | 'plan';
  data: any;
}

export interface StreamChunk {
  content: string;
}

export interface StreamEnd {
  summary?: string;
}

export interface ThoughtData {
  subject: string;
  description: string;
}

export interface ThoughtDisplayProps {
  thought?: ThoughtData;
  style?: 'default' | 'compact';
  running?: boolean;
  onStop?: () => void;
}
