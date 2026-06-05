import { useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '../lib/tauri';
import { useMessageStore } from '@/stores/messageStore';
import { useConversationStore } from '@/stores/conversationStore';
import type { Message, ToolCall, ToolResponse, ToolCallStatus, PermissionRequest, PlanState } from '@/types/message';

interface StreamEvent {
  event: 'thinking' | 'tool_call' | 'tool_response' | 'error' | 'permission' | 'plan';
  data: any;
}

interface StreamEnd {
  summary?: string;
}

export const useStreamingAI = () => {
  const {
    isStreaming,
    currentThinking,
    currentToolCalls,
    currentToolResponses,
    setStreaming,
    setThinking,
    appendThinking,
    addToolCall,
    addToolResponse,
    resetCurrentStream,
    messages,
  } = useMessageStore();
  
  const { addMessageToCurrent, getCurrentConversation, createConversation, currentConversationId, updateLastMessage } = useConversationStore();
  
  const messageIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);
  const currentPermissionsRef = useRef<PermissionRequest[]>([]);
  const currentPlanRef = useRef<PlanState | null>(null);
  
  const generateId = useCallback(() => Math.random().toString(36).substring(2, 15), []);
  
  const approvePermission = useCallback((id: string, remember: boolean) => {
    invoke('approve_permission', { id, remember }).catch(console.error);
    currentPermissionsRef.current = currentPermissionsRef.current.filter(p => p.id !== id);
  }, []);
  
  const denyPermission = useCallback((id: string) => {
    invoke('deny_permission', { id }).catch(console.error);
    currentPermissionsRef.current = currentPermissionsRef.current.filter(p => p.id !== id);
  }, []);
  
  const startPlanExecution = useCallback(() => {
    if (currentPlanRef.current) {
      currentPlanRef.current = { ...currentPlanRef.current, isRunning: true };
    }
  }, []);
  
  const pausePlanExecution = useCallback(() => {
    if (currentPlanRef.current) {
      currentPlanRef.current = { ...currentPlanRef.current, isRunning: false };
    }
  }, []);
  
  const cancelPlanExecution = useCallback(() => {
    currentPlanRef.current = null;
  }, []);
  
  const startStreaming = useCallback(async (cli: string, content: string, projectPath: string | null) => {
    // 如果正在流式输出，先停止
    if (isStreaming) {
      stopStreaming();
    }
    
    // 如果没有当前会话，创建新会话；否则使用现有会话
    let conversation = getCurrentConversation();
    if (!conversation) {
      conversation = createConversation();
    }
    
    if (!conversation) return;
    
    // 创建用户消息
    const userMessage: Message = {
      id: generateId(),
      type: 'text',
      role: 'user',
      content,
      timestamp: Date.now(),
      position: 'right',
    };
    
    // 只添加到conversation store
    addMessageToCurrent(userMessage);
    
    // 创建助手消息占位
    const assistantMessage: Message = {
      id: generateId(),
      type: 'text',
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      position: 'left',
    };
    
    addMessageToCurrent(assistantMessage);
    messageIdRef.current = assistantMessage.id;
    
    resetCurrentStream();
    setStreaming(true);
    
    try {
      // 调用后端命令
      await invoke('send_chat_message', {
        cli,
        message: content,
        conversationId: conversation.id,
        projectPath,
      });
    } catch (error) {
      console.error('发送消息失败:', error);
      setStreaming(false);
      // 添加错误消息
      const errorMessage: Message = {
        id: generateId(),
        type: 'error',
        role: 'assistant',
        content: `错误: ${error}`,
        timestamp: Date.now(),
        position: 'left',
      };
      addMessageToCurrent(errorMessage);
    }
  }, [currentConversationId, createConversation, getCurrentConversation, addMessageToCurrent, resetCurrentStream, setStreaming, generateId]);
  
  const stopStreaming = useCallback(() => {
    setStreaming(false);
    setThinking('');
    messageIdRef.current = null;
    unlistenRef.current.forEach(fn => fn());
    unlistenRef.current = [];
  }, [setStreaming, setThinking]);
  
  useEffect(() => {
    const setupListeners = async () => {
      // 监听流式文本输出
      const unlistenChunk = await listen<string>('ai-stream-chunk', (event) => {
        const content = event.payload;
        const conv = getCurrentConversation();
        if (conv && conv.messages.length > 0) {
          const lastMsg = conv.messages[conv.messages.length - 1];
          const currentContent = lastMsg.content || '';
          const newContent = currentContent + content;
          updateLastMessage({ content: newContent });
        } else {
        }
      });
      
      // 监听各种事件（thinking、tool_call等）
      const unlistenEvent = await listen<StreamEvent>('ai-stream-event', (event) => {
        const { event: eventType, data } = event.payload;
        
        switch (eventType) {
          case 'thinking':
            // 追加思考内容到 useMessageStore
            appendThinking(data.content || '');
            // 同时更新 conversationStore 中的消息
            const convForThinking = getCurrentConversation();
            if (convForThinking && convForThinking.messages.length > 0) {
              const lastMsgForThinking = convForThinking.messages[convForThinking.messages.length - 1];
              const currentThinking = lastMsgForThinking.thinking || '';
              const newThinking = currentThinking + (data.content || '');
              updateLastMessage({ thinking: newThinking });
            }
            break;
            
          case 'tool_call':
            // 添加工具调用
            const toolCall: ToolCall = {
              id: data.id || generateId(),
              name: data.name,
              arguments: data.arguments,
              status: 'in_progress' as ToolCallStatus,
            };
            addToolCall(toolCall);
            
            // 同时更新conversation中的最后一条消息
            const convForTool = getCurrentConversation();
            if (convForTool && convForTool.messages.length > 0) {
              const lastMsg = convForTool.messages[convForTool.messages.length - 1];
              const newToolCalls = lastMsg.toolCalls ? [...lastMsg.toolCalls, toolCall] : [toolCall];
              updateLastMessage({
                toolCalls: newToolCalls
              });
            }
            break;
            
          case 'tool_response':
            // 添加工具响应
            const toolResponse: ToolResponse = {
              toolCallId: data.tool_call_id,
              status: data.status || 'success',
              result: data.result,
              content: data.content,
            };
            addToolResponse(toolResponse);
            
            // 同时更新conversation中的最后一条消息
            const convForResponse = getCurrentConversation();
            if (convForResponse && convForResponse.messages.length > 0) {
              const lastMsg = convForResponse.messages[convForResponse.messages.length - 1];
              updateLastMessage({
                toolResponses: [...(lastMsg.toolResponses || []), toolResponse]
              });
            }
            break;
            
          case 'permission':
            // 处理权限请求
            const permission: PermissionRequest = {
              id: data.id || generateId(),
              toolName: data.tool || 'unknown',
              args: data.args || {},
              reason: data.reason,
              status: 'pending',
            };
            currentPermissionsRef.current = [...currentPermissionsRef.current, permission];
            
            // 更新conversation中的最后一条消息
            const convForPermission = getCurrentConversation();
            if (convForPermission && convForPermission.messages.length > 0) {
              updateLastMessage({
                permission
              });
            }
            break;
            
          case 'plan':
            // 处理执行计划
            const plan: PlanState = {
              entries: data.entries || [],
              currentIndex: data.currentIndex || 0,
              isRunning: true,
            };
            currentPlanRef.current = plan;
            
            // 更新conversation中的最后一条消息
            const convForPlan = getCurrentConversation();
            if (convForPlan && convForPlan.messages.length > 0) {
              updateLastMessage({
                plan
              });
            }
            break;
        }
      });
      
      // 监听流结束
      const unlistenEnd = await listen<StreamEnd>('ai-stream-end', () => {
        setStreaming(false);
        // 不要清空思考内容，让它保留显示
        // setThinking('');  // 已注释掉，保留思考内容
        // resetCurrentStream();  // 已注释掉，避免清空思考
        currentPermissionsRef.current = [];
        currentPlanRef.current = null;
        messageIdRef.current = null;
      });
      
      unlistenRef.current = [unlistenChunk, unlistenEvent, unlistenEnd];
    };
    
    setupListeners();
    
    return () => {
      unlistenRef.current.forEach(fn => fn());
    };
  }, [getCurrentConversation, setThinking, addToolCall, addToolResponse, setStreaming, resetCurrentStream, generateId]);
  
  return {
    messages,
    isStreaming,
    currentThinking,
    thought: currentThinking,
    content: messages[messages.length - 1]?.content || '',
    toolCalls: currentToolCalls,
    toolResponses: currentToolResponses,
    currentPermissions: currentPermissionsRef.current,
    currentPlan: currentPlanRef.current,
    startStreaming,
    stopStreaming,
    approvePermission,
    denyPermission,
    startPlanExecution,
    pausePlanExecution,
    cancelPlanExecution,
  };
};
