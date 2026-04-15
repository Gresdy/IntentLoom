import { ChatHistory } from "./ChatHistory";
import { ChatInput } from "./ChatInput";

export const RightPanel: React.FC = () => {
  return (
    <div className="h-full w-[400px] border-l border-gray-200 flex flex-col bg-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-100">
        <h3 className="font-medium">对话</h3>
      </div>

      {/* Chat History */}
      <ChatHistory />

      {/* Input */}
      <ChatInput />
    </div>
  );
};

export { ChatHistory } from "./ChatHistory";
export { ChatInput } from "./ChatInput";
