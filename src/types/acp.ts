export type ACPStreamEvent =
  | 'agent_message_chunk'
  | 'agent_thought_chunk'
  | 'tool_call'
  | 'tool_call_update'
  | 'tool_response'
  | 'plan'
  | 'available_commands'
  | 'config_option_update'
  | 'usage_update'
  | 'permission'
  | 'error';

export interface ACPAgentMessageChunk {
  type: 'agent_message_chunk';
  data: {
    content: string;
  };
}

export interface ACPAgentThoughtChunk {
  type: 'agent_thought_chunk';
  data: {
    subject?: string;
    description?: string;
    content: string;
    status: 'active' | 'done';
    durationMs?: number;
  };
}

export interface ACPToolCall {
  type: 'tool_call';
  data: {
    id: string;
    name: string;
    kind?: 'edit' | 'read' | 'execute' | 'bash' | 'web_search' | 'web_fetch';
    title?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    args?: Record<string, any>;
    reason?: string;
  };
}

export interface ACPToolCallUpdate {
  type: 'tool_call_update';
  data: {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
    content?: string;
    diff?: ACPDiff[];
  };
}

export interface ACPToolResponse {
  type: 'tool_response';
  data: {
    id: string;
    status: 'success' | 'error';
    content?: string;
    result?: any;
    error?: string;
  };
}

export interface ACPDiff {
  type: 'diff';
  path?: string;
  oldText?: string;
  newText?: string;
}

export interface ACPPlan {
  type: 'plan';
  data: {
    sessionId: string;
    entries: ACPPlanEntry[];
    currentIndex?: number;
  };
}

export interface ACPPlanEntry {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error' | 'skipped';
}

export interface ACPAvailableCommands {
  type: 'available_commands';
  data: {
    commands: ACPCommand[];
  };
}

export interface ACPCommand {
  name: string;
  description: string;
  args?: ACPCommandArg[];
}

export interface ACPCommandArg {
  name: string;
  description: string;
  required: boolean;
  default?: string;
}

export interface ACPConfigOptionUpdate {
  type: 'config_option_update';
  data: {
    key: string;
    value: any;
  };
}

export interface ACPUsageUpdate {
  type: 'usage_update';
  data: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost?: number;
  };
}

export interface ACPPermission {
  type: 'permission';
  data: {
    id: string;
    tool: string;
    args: Record<string, any>;
    reason?: string;
    status: 'pending' | 'approved' | 'denied';
  };
}

export interface ACPError {
  type: 'error';
  data: {
    message: string;
    code?: string;
  };
}

export type ACPStreamUpdate =
  | ACPAgentMessageChunk
  | ACPAgentThoughtChunk
  | ACPToolCall
  | ACPToolCallUpdate
  | ACPToolResponse
  | ACPPlan
  | ACPAvailableCommands
  | ACPConfigOptionUpdate
  | ACPUsageUpdate
  | ACPPermission
  | ACPError;
