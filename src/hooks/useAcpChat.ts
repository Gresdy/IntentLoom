import { useEffect, useCallback, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '../lib/tauri';
import { useMessageStore } from '@/stores/messageStore';
import { useConversationStore } from '@/stores/conversationStore';
import type { Message, PermissionRequest, PlanState } from '@/types/message';

interface ConnectResponse {
  sessionId: string;
  success: boolean;
}

export const useAcpChat = () => {
  const {
    isStreaming,
    setStreaming,
    appendThinking,
    resetCurrentStream,
  } = useMessageStore();
  
  const { addMessageToCurrent, getCurrentConversation, createConversation, currentConversationId, updateLastMessage } = useConversationStore();
  
  const [isConnected, setIsConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const messageIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);

  const connect = useCallback(async (provider: string, workspace: string, cliPath?: string): Promise<ConnectResponse> => {
    try {
      const response = await invoke<ConnectResponse>('acp_connect', {
        request: {
          provider,
          workspace,
          cliPath,
        },
      });
      
      if (response.success) {
        setIsConnected(true);
        setCurrentSessionId(response.sessionId);
      }
      
      return response;
    } catch (error) {
      console.error('ACP connect failed:', error);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await invoke('acp_disconnect');
      setIsConnected(false);
      setCurrentSessionId(null);
    } catch (error) {
      console.error('ACP disconnect failed:', error);
      throw error;
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!isConnected) {
      throw new Error('Not connected to ACP');
    }

    if (!currentConversationId) {
      createConversation();
    }
    
    const conversation = getCurrentConversation();
    if (!conversation) return;
    
    const userMessage: Message = {
      id: Math.random().toString(36).substring(2, 15),
      type: 'text',
      role: 'user',
      content,
      timestamp: Date.now(),
      position: 'right',
    };
    
    addMessageToCurrent(userMessage);
    
    const assistantMessage: Message = {
      id: Math.random().toString(36).substring(2, 15),
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
      await invoke('acp_send_message', {
        request: {
          content,
          conversationId: conversation.id,
        },
      });
    } catch (error) {
      console.error('Send message failed:', error);
      setStreaming(false);
      const errorMessage: Message = {
        id: Math.random().toString(36).substring(2, 15),
        type: 'error',
        role: 'assistant',
        content: `错误: ${error}`,
        timestamp: Date.now(),
        position: 'left',
      };
      addMessageToCurrent(errorMessage);
    }
  }, [isConnected, currentConversationId, createConversation, getCurrentConversation, addMessageToCurrent, resetCurrentStream, setStreaming]);

  const getStatus = useCallback(async (): Promise<boolean> => {
    try {
      const status = await invoke<boolean>('acp_get_status');
      setIsConnected(status);
      return status;
    } catch (error) {
      console.error('Get status failed:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    const setupListeners = async () => {
      const unlistenChunk = await listen<string>('ai-stream-chunk', (event) => {
        const content = event.payload;
        const conversation = getCurrentConversation();
        if (conversation && conversation.messages.length > 0) {
          const lastMsg = conversation.messages[conversation.messages.length - 1];
          const newContent = (lastMsg.content || '') + content;
          updateLastMessage({ content: newContent });
        }
      });
      
      const unlistenEvent = await listen<any>('ai-stream-event', (event) => {
        const { event: eventType, data } = event.payload;
        
        switch (eventType) {
          case 'thinking':
            appendThinking(data.content || '');
            const conv = getCurrentConversation();
            if (conv && conv.messages.length > 0) {
              const lastMsg = conv.messages[conv.messages.length - 1];
              const newThinking = (lastMsg.thinking || '') + (data.content || '');
              updateLastMessage({ thinking: newThinking });
            }
            break;
            
          case 'tool_call':
          case 'tool_call_update':
            const toolConv = getCurrentConversation();
            if (toolConv && toolConv.messages.length > 0) {
              const lastMsg = toolConv.messages[toolConv.messages.length - 1];
              const toolCalls = lastMsg.toolCalls || [];
              toolCalls.push({
                id: data.id,
                name: data.name,
                arguments: data.args,
                status: data.status,
                kind: data.kind,
                title: data.title,
              });
              updateLastMessage({ toolCalls });
            }
            break;
            
          case 'permission':
            const permConv = getCurrentConversation();
            if (permConv && permConv.messages.length > 0) {
              const permission: PermissionRequest = {
                id: data.id || Math.random().toString(36).substring(2, 15),
                toolName: data.tool || 'unknown',
                args: data.args || {},
                reason: data.reason,
                status: 'pending',
              };
              updateLastMessage({ permission });
            }
            break;
            
          case 'plan':
            const planConv = getCurrentConversation();
            if (planConv && planConv.messages.length > 0) {
              const plan: PlanState = {
                entries: data.entries || [],
                currentIndex: data.currentIndex || 0,
                isRunning: true,
              };
              updateLastMessage({ plan });
            }
            break;
            
          case 'error':
            console.error('Stream error:', data.message);
            break;
        }
      });
      
      const unlistenEnd = await listen('ai-stream-end', () => {
        setStreaming(false);
      });
      
      unlistenRef.current = [unlistenChunk, unlistenEvent, unlistenEnd];
    };
    
    setupListeners();
    
    return () => {
      unlistenRef.current.forEach(fn => fn());
    };
  }, [getCurrentConversation, updateLastMessage, setStreaming, appendThinking]);

  useEffect(() => {
    getStatus();
  }, [getStatus]);

  return {
    isConnected,
    currentSessionId,
    isStreaming,
    connect,
    disconnect,
    sendMessage,
    getStatus,
  };
};
