/**
 * 错误处理工具
 * 提供统一的错误处理和错误消息格式化
 */

export interface AppError {
  code: string;
  message: string;
  details?: any;
  isUserFriendly: boolean;
}

/**
 * 错误代码定义
 */
export const ERROR_CODES = {
  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  API_ERROR: 'API_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  
  // AI 相关错误
  AI_ERROR: 'AI_ERROR',
  MODEL_ERROR: 'MODEL_ERROR',
  PROMPT_ERROR: 'PROMPT_ERROR',
  
  // 技能相关错误
  SKILL_ERROR: 'SKILL_ERROR',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_LOAD_ERROR: 'SKILL_LOAD_ERROR',
  
  // 文件系统错误
  FILE_ERROR: 'FILE_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_PERMISSION_ERROR: 'FILE_PERMISSION_ERROR',
  
  // 会话错误
  SESSION_ERROR: 'SESSION_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  
  // 专家错误
  EXPERT_ERROR: 'EXPERT_ERROR',
  EXPERT_NOT_FOUND: 'EXPERT_NOT_FOUND',
  
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  
  // 上下文错误
  CONTEXT_LIMIT_ERROR: 'CONTEXT_LIMIT_ERROR',
  CONTEXT_OVERFLOW_ERROR: 'CONTEXT_OVERFLOW_ERROR',
} as const;

/**
 * 错误消息映射
 */
const ERROR_MESSAGES: Record<typeof ERROR_CODES[keyof typeof ERROR_CODES], string> = {
  [ERROR_CODES.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
  [ERROR_CODES.API_ERROR]: 'API 调用失败，请稍后重试',
  [ERROR_CODES.TIMEOUT_ERROR]: '请求超时，请稍后重试',
  [ERROR_CODES.AI_ERROR]: 'AI 服务错误，请稍后重试',
  [ERROR_CODES.MODEL_ERROR]: '模型错误，请检查模型配置',
  [ERROR_CODES.PROMPT_ERROR]: '提示词错误，请检查输入内容',
  [ERROR_CODES.SKILL_ERROR]: '技能执行错误',
  [ERROR_CODES.SKILL_NOT_FOUND]: '技能未找到',
  [ERROR_CODES.SKILL_LOAD_ERROR]: '技能加载失败',
  [ERROR_CODES.FILE_ERROR]: '文件操作错误',
  [ERROR_CODES.FILE_NOT_FOUND]: '文件未找到',
  [ERROR_CODES.FILE_PERMISSION_ERROR]: '文件权限错误',
  [ERROR_CODES.SESSION_ERROR]: '会话错误',
  [ERROR_CODES.SESSION_NOT_FOUND]: '会话未找到',
  [ERROR_CODES.EXPERT_ERROR]: '专家配置错误',
  [ERROR_CODES.EXPERT_NOT_FOUND]: '专家未找到',
  [ERROR_CODES.UNKNOWN_ERROR]: '未知错误，请稍后重试',
  [ERROR_CODES.VALIDATION_ERROR]: '输入验证错误',
  [ERROR_CODES.CONTEXT_LIMIT_ERROR]: '上下文接近限制，请开始新会话',
  [ERROR_CODES.CONTEXT_OVERFLOW_ERROR]: '上下文超出限制，请开始新会话',
};

/**
 * 创建应用错误
 */
export function createError(
  code: typeof ERROR_CODES[keyof typeof ERROR_CODES],
  details?: any,
  customMessage?: string
): AppError {
  return {
    code,
    message: customMessage || ERROR_MESSAGES[code] || ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
    details,
    isUserFriendly: true,
  };
}

/**
 * 处理未知错误
 */
export function handleUnknownError(error: any): AppError {
  console.error('未知错误:', error);
  
  if (error instanceof Error) {
    // 处理网络错误
    if (error.message.includes('network') || error.message.includes('Network')) {
      return createError(ERROR_CODES.NETWORK_ERROR, error.message);
    }
    
    // 处理超时错误
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return createError(ERROR_CODES.TIMEOUT_ERROR, error.message);
    }
    
    // 处理文件错误
    if (error.message.includes('file') || error.message.includes('File')) {
      return createError(ERROR_CODES.FILE_ERROR, error.message);
    }
  }
  
  return createError(ERROR_CODES.UNKNOWN_ERROR, error);
}

/**
 * 格式化错误消息
 */
export function formatError(error: AppError | Error): string {
  if ('code' in error) {
    return error.message;
  }
  
  return error.message || '未知错误';
}

/**
 * 检查是否是用户友好的错误
 */
export function isUserFriendlyError(error: any): error is AppError {
  return 'isUserFriendly' in error && error.isUserFriendly;
}
