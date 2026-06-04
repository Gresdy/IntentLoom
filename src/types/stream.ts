import type { ToolCallStatus, PlanEntry, DiffContent } from './message';

export type StreamEventType = 
  | 'start'
  | 'finish'
  | 'content'
  | 'thought'
  | 'tool_call'
  | 'tool_call_update'
  | 'tool_response'
  | 'plan'
  | 'available_commands'
  | 'config_option_update'
  | 'usage_update'
  | 'permission'
  | 'error';

export interface StreamEvent<T = any> {
  type: StreamEventType;
  data: T;
  timestamp?: number;
}

export interface ThoughtEventData {
  subject?: string;
  description?: string;
  content: string;
  status: 'active' | 'done';
  durationMs?: number;
}

export interface ToolCallEventData {
  id: string;
  name: string;
  kind?: 'edit' | 'read' | 'execute';
  title?: string;
  status: ToolCallStatus;
  args?: any;
  diff?: DiffContent[];
}

export interface ToolCallUpdateEventData {
  id: string;
  status: ToolCallStatus;
  content?: string;
  diff?: DiffContent[];
}

export interface ToolResponseEventData {
  id: string;
  status: 'success' | 'error';
  content?: string;
  error?: string;
}

export interface PlanEventData {
  entries: PlanEntry[];
  currentIndex?: number;
}

export interface PermissionEventData {
  tool: string;
  args: any;
  reason?: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface UsageEventData {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface ErrorEventData {
  message: string;
  code?: string;
}

export const EVENT_CHANNELS = {
  STREAM_START: 'ai-stream-start',
  STREAM_END: 'ai-stream-end',
  STREAM_CHUNK: 'ai-stream-chunk',
  STREAM_EVENT: 'ai-stream-event',
  THOUGHT: 'agent-thought',
  PERMISSION: 'agent-permission',
  PLAN: 'agent-plan',
} as const;

export type EventHandler = {
  [K in StreamEventType]?: (data: any) => void;
};
