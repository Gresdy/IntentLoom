export type AcpBackend = 'claude' | 'gemini' | 'openai' | 'custom';

export interface AcpModelInfo {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  contextWindow?: number;
}

export interface AcpPermissionOption {
  id: string;
  name: string;
  description?: string;
  default?: boolean;
}

export interface AcpPermissionRequest {
  id: string;
  type: string;
  message: string;
  options: AcpPermissionOption[];
  required: boolean;
}

export interface AcpSessionConfigOption {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  description?: string;
  default?: unknown;
  options?: string[];
}

export type AcpSessionUpdateType = 
  | 'agent_message'
  | 'agent_thought'
  | 'agent_thought_chunk'
  | 'tool_call'
  | 'tool_response'
  | 'session_end'
  | 'error';

export interface AcpSessionUpdate {
  type: AcpSessionUpdateType;
  content?: string;
  tool_call?: {
    name: string;
    parameters: Record<string, unknown>;
  };
  tool_response?: {
    tool_call_id: string;
    content: string;
    status: 'success' | 'error';
  };
  error?: {
    code: string;
    message: string;
  };
  session_id?: string;
  timestamp?: number;
}

export interface AcpStreamMessage {
  type: 'chunk' | 'thought' | 'tool' | 'complete' | 'error';
  content: string;
  tool?: {
    name: string;
    input: Record<string, unknown>;
  };
}

export const AcpBackends_All: AcpBackend[] = ['claude', 'gemini', 'openai', 'custom'];
