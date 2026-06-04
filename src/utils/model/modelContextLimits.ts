/**
 * @license
 * Copyright 2026 IntentLoom
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 已知模型的 context window 大小配置
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // Gemini 系列
  'gemini-3.1-pro-preview': 1_048_576,
  'gemini-3-pro-preview': 1_048_576,
  'gemini-3-flash-preview': 1_048_576,
  'gemini-3-pro-image-preview': 65_536,
  'gemini-2.5-pro': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.5-flash-lite': 1_048_576,
  'gemini-2.5-flash-image': 32_768,
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.0-flash-lite': 1_048_576,
  'gemini-1.5-pro': 2_097_152,
  'gemini-1.5-flash': 1_048_576,

  // OpenAI 系列
  'gpt-5.1': 400_000,
  'gpt-5.1-chat': 128_000,
  'gpt-5': 400_000,
  'gpt-5-chat': 128_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4-turbo-preview': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
  'gpt-3.5-turbo-16k': 16_385,
  o1: 200_000,
  'o1-preview': 128_000,
  'o1-mini': 128_000,
  o3: 200_000,
  'o3-mini': 200_000,

  // Claude 系列
  'claude-opus-4.5': 200_000,
  'claude-haiku-4.5': 200_000,
  'claude-sonnet-4.5': 1_000_000,
  'claude-opus-4.1': 200_000,
  'claude-opus-4': 200_000,
  'claude-sonnet-4': 1_000_000,
  'claude-3.7-sonnet': 200_000,
  'claude-3.5-haiku': 200_000,
  'claude-3-opus': 200_000,
  'claude-3-haiku': 200_000,
};

/**
 * 默认 context limit（当无法确定模型时使用）
 */
export const DEFAULT_CONTEXT_LIMIT = 1_048_576;

/**
 * 根据模型名称获取 context limit
 * 支持模糊匹配，例如 "gemini-2.5-pro-latest" 会匹配 "gemini-2.5-pro"
 */
export function getModelContextLimit(modelName: string | undefined | null): number {
  if (!modelName) return DEFAULT_CONTEXT_LIMIT;

  const lowerModelName = modelName.toLowerCase();

  // 精确匹配
  if (MODEL_CONTEXT_LIMITS[lowerModelName]) {
    return MODEL_CONTEXT_LIMITS[lowerModelName];
  }

  // 模糊匹配：查找最长匹配的模型名
  let bestMatch = '';
  let bestLimit = DEFAULT_CONTEXT_LIMIT;

  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (lowerModelName.includes(key) && key.length > bestMatch.length) {
      bestMatch = key;
      bestLimit = limit;
    }
  }

  return bestLimit;
}

/**
 * 计算文本的 token 估算值
 * 使用简单的估算方法：1 个 token 约等于 4 个字符
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 检查消息历史是否超出上下文限制
 */
export function checkContextLimit(messages: any[], modelName: string): {
  isExceeded: boolean;
  currentTokens: number;
  limit: number;
  recommendedAction: string;
} {
  const limit = getModelContextLimit(modelName);
  let totalTokens = 0;

  for (const message of messages) {
    if (message.content) {
      totalTokens += estimateTokenCount(typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
    }
    if (message.thinkingProcess) {
      totalTokens += estimateTokenCount(JSON.stringify(message.thinkingProcess));
    }
  }

  const isExceeded = totalTokens > limit * 0.9; // 90% 阈值
  let recommendedAction = '';

  if (isExceeded) {
    recommendedAction = totalTokens > limit
      ? '会话历史超出上下文限制，请开始新会话或清除历史记录'
      : '会话历史接近上下文限制，建议开始新会话';
  }

  return {
    isExceeded,
    currentTokens: totalTokens,
    limit,
    recommendedAction,
  };
}
