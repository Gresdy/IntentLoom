import type { ToolCall, ToolCallKind, ToolCallStatus, DiffContent } from '@/types/message';

export function inferToolKind(name: string): ToolCallKind {
  const lower = name.toLowerCase();
  if (lower.includes('read')) return 'read';
  if (lower.includes('edit') || lower.includes('write') || lower.includes('create')) return 'edit';
  if (lower.includes('bash') || lower.includes('run') || lower.includes('execute') || lower.includes('command')) return 'execute';
  return 'read';
}

export function parseToolCall(raw: any): ToolCall {
  const name = raw.name || 'unknown';
  return {
    id: raw.id || crypto.randomUUID(),
    name,
    kind: inferToolKind(name),
    arguments: raw.parameters || raw.args || raw.arguments || {},
    status: mapToolStatus(raw.status),
    title: raw.title,
    diff: parseDiff(raw.diff),
  };
}

export function mapToolStatus(status: string): ToolCallStatus {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
    case 'in-progress':
      return 'in_progress';
    case 'done':
    case 'completed':
      return 'completed';
    case 'error':
    case 'failed':
      return 'error';
    default:
      return 'pending';
  }
}

export function parseDiff(diffContent: string | DiffContent[] | undefined): DiffContent[] | undefined {
  if (!diffContent) return undefined;
  
  if (Array.isArray(diffContent)) {
    return diffContent;
  }
  
  if (typeof diffContent === 'string') {
    const lines = diffContent.split('\n');
    const diffs: DiffContent[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('+')) {
        diffs.push({
          type: 'add',
          newText: trimmed.slice(1).trim(),
        });
      } else if (trimmed.startsWith('-')) {
        diffs.push({
          type: 'remove',
          oldText: trimmed.slice(1).trim(),
        });
      }
    }
    
    return diffs.length > 0 ? diffs : undefined;
  }
  
  return undefined;
}

export function getStatusColor(status: ToolCallStatus): string {
  switch (status) {
    case 'pending':
      return 'blue';
    case 'in_progress':
      return 'orange';
    case 'completed':
      return 'green';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

export function getStatusLabel(status: ToolCallStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'in_progress':
      return 'In Progress';
    case 'completed':
      return 'Done';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}
