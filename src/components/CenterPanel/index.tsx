import { useState } from "react";
import { FileText, Browser, Box } from "@icon-park/react";
import { MDViewer, getLanguage } from "./MDViewer";
import { BrowserFrame } from "./BrowserFrame";

interface CenterPanelProps {
  fileContent: string;
  filePath: string;
  onContentChange: (content: string) => void;
}

type TabKey = "md" | "browser" | "output";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "md", label: "MD编辑器", icon: <FileText size={14} /> },
  { key: "browser", label: "嵌入浏览器", icon: <Browser size={14} /> },
  { key: "output", label: "产物", icon: <Box size={14} /> },
];

export const CenterPanel: React.FC<CenterPanelProps> = ({
  fileContent,
  filePath,
  onContentChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>("md");
  const [browserUrl, setBrowserUrl] = useState("");

  const language = filePath ? getLanguage(filePath) : "markdown";

  return (
    <div className="h-full flex-1 flex flex-col bg-white">
      {/* Tab Nav */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1 px-4 py-2 text-sm border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-blue-500 text-blue-500"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "md" && (
          <MDViewer
            content={fileContent}
            onChange={onContentChange}
            language={language}
          />
        )}
        {activeTab === "browser" && (
          <BrowserFrame url={browserUrl} onUrlChange={setBrowserUrl} />
        )}
        {activeTab === "output" && (
          <div className="p-4 text-gray-500">产物展示区域</div>
        )}
      </div>

      {/* Execute Button */}
      <div className="p-3 border-t border-gray-200">
        <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center gap-2">
          <span>▶</span> 执行计划
        </button>
      </div>
    </div>
  );
};

export { MDViewer } from "./MDViewer";
export { BrowserFrame } from "./BrowserFrame";
