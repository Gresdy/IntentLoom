import { useState } from "react";
import { Button } from "@arco-design/web-react";
import { Send } from "@icon-park/react";
import { useSessionStore } from "../../stores/useSessionStore";
import { useModelStore } from "../../stores/useModelStore";

// 动态导入invoke函数
const invoke = async (command: string, args?: any) => {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(command, args);
};

export const ChatInput: React.FC = () => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { addMessage } = useSessionStore();
  const { currentCli } = useModelStore();

  const generateId = () => Math.random().toString(36).substring(2, 15);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      id: generateId(),
      role: "user" as const,
      content: input.trim(),
      timestamp: Date.now(),
    };

    addMessage(userMessage);
    setInput("");
    setLoading(true);

    try {
      const response = await invoke("call_ai", {
        cli: currentCli,
        prompt: input.trim(),
      });

      const assistantMessage = {
        id: generateId(),
        role: "assistant" as const,
        content: response as string,
        timestamp: Date.now(),
      };
      addMessage(assistantMessage);
    } catch (err) {
      const errorMessage = {
        id: generateId(),
        role: "assistant" as const,
        content: `错误: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      addMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 border-t border-gray-200">
      <textarea
        className="w-full p-2 border border-gray-200 rounded text-sm resize-none"
        placeholder="输入你的意图..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        rows={2}
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="primary"
          loading={loading}
          disabled={!input.trim()}
          onClick={handleSend}
          icon={<Send size={14} />}
        >
          发送
        </Button>
      </div>
    </div>
  );
};
