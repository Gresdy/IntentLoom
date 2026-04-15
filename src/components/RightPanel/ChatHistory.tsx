import type { Message } from "../../shared/types";
import { useSessionStore } from "../../stores/useSessionStore";

const MessageItem: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"
        }`}
      >
        {/* Thinking process */}
        {message.thinking && (
          <div className="text-sm opacity-70 mb-2 italic border-b border-current border-opacity-20 pb-2">
            {message.thinking}
          </div>
        )}
        {/* Content */}
        <div className="text-sm whitespace-pre-wrap">{message.content}</div>
      </div>
    </div>
  );
};

export const ChatHistory: React.FC = () => {
  const { messages } = useSessionStore();

  return (
    <div className="flex-1 overflow-auto p-3">
      {messages.length === 0 ? (
        <div className="text-center text-gray-400 mt-8">
          输入意图开始对话
        </div>
      ) : (
        messages.map((msg) => <MessageItem key={msg.id} message={msg} />)
      )}
    </div>
  );
};
