import type { ThinkTagFormat, ThinkParseResult } from '@/shared/thinking';

export function hasThinkTags(content: string): boolean {
  return (
    content.indexOf('</think>') >= 0 ||
    content.indexOf('</thinking>') >= 0 ||
    content.indexOf('<answer>') >= 0 ||
    content.indexOf('</answer>') >= 0
  );
}

export function detectThinkFormat(content: string): ThinkTagFormat | null {
  if (content.indexOf('</think>') >= 0) return 'anthropic';
  if (content.indexOf('</thinking>') >= 0 || content.indexOf('<thinking>') >= 0) return 'general';
  if (content.indexOf('</answer>') >= 0 || content.indexOf('<answer>') >= 0) return 'answer';
  if (content.indexOf('<MiniMax>') >= 0) return 'minimax';
  return null;
}

function extractAnthropic(content: string, results: ThinkParseResult[]): void {
  const regex = /<answer>[\s\S]*?<\/answer>/g;
  let match = regex.exec(content);
  while (match) {
    results.push({
      format: 'anthropic',
      content: match[0].slice(8, -9).trim(),
      startPos: match.index,
      endPos: match.index + match[0].length,
    });
    match = regex.exec(content);
  }
}

function extractGeneral(content: string, results: ThinkParseResult[]): void {
  const regex = /<thinking>[\s\S]*?<\/thinking>/g;
  let match = regex.exec(content);
  while (match) {
    results.push({
      format: 'general',
      content: match[0].slice(11, -13).trim(),
      startPos: match.index,
      endPos: match.index + match[0].length,
    });
    match = regex.exec(content);
  }
}

function extractAnswer(content: string, results: ThinkParseResult[]): void {
  const regex = /<answer>[\s\S]*?<\/answer>/g;
  let match = regex.exec(content);
  while (match) {
    results.push({
      format: 'answer',
      content: match[0].slice(8, -9).trim(),
      startPos: match.index,
      endPos: match.index + match[0].length,
    });
    match = regex.exec(content);
  }
}

export function extractThinkContent(content: string): ThinkParseResult[] {
  const results: ThinkParseResult[] = [];
  extractAnthropic(content, results);
  extractGeneral(content, results);
  extractAnswer(content, results);
  return results.sort((a, b) => a.startPos - b.startPos);
}

export function stripThinkTags(content: string): string {
  let result = content;
  result = result.replace(/<answer>[\s\S]*?<\/answer>/g, '');
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
  result = result.replace(/<answer>[\s\S]*?<\/answer>/g, '');
  return result.trim();
}

export function extractFirstThinkContent(content: string): string | null {
  const results = extractThinkContent(content);
  return results.length > 0 ? results[0].content : null;
}

export function splitContentWithThinking(content: string): {
  thinking: string[];
  answer: string;
} {
  const results = extractThinkContent(content);
  const thinking: string[] = [];
  
  for (const result of results) {
    thinking.push(result.content);
  }
  
  const answer = stripThinkTags(content);
  
  return { thinking, answer };
}
