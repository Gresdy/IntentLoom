import { useState } from "react";
import { Input, Button } from "@arco-design/web-react";
import { ArrowRight } from "@icon-park/react";

interface BrowserFrameProps {
  url: string;
  onUrlChange: (url: string) => void;
}

export const BrowserFrame: React.FC<BrowserFrameProps> = ({
  url,
  onUrlChange,
}) => {
  const [inputUrl, setInputUrl] = useState(url);

  const handleGo = () => {
    onUrlChange(inputUrl);
  };

  return (
    <div className="h-full flex flex-col">
      {/* URL Bar */}
      <div className="p-2 border-b border-gray-200 flex gap-2">
        <Input
          placeholder="输入 URL..."
          value={inputUrl}
          onChange={setInputUrl}
          onPressEnter={handleGo}
        />
        <Button type="primary" icon={<ArrowRight size={14} />} onClick={handleGo} />
      </div>

      {/* Browser Content Placeholder */}
      <div className="flex-1 bg-gray-50 flex items-center justify-center text-gray-400">
        {url ? (
          <iframe
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <span>输入 URL 后在此预览</span>
        )}
      </div>
    </div>
  );
};
