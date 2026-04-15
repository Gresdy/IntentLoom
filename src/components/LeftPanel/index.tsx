
import { Search, Terminal, Tag, Folder, Code, Setting } from "@icon-park/react";

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { key: "search", icon: <Search size={20} />, label: "搜索" },
  { key: "model", icon: <Terminal size={20} />, label: "模型切换" },
  { key: "provider", icon: <Tag size={20} />, label: "供应商" },
  { key: "prompts", icon: <Code size={20} />, label: "Prompts" },
  { key: "skills", icon: <Folder size={20} />, label: "Skills", badge: 0 },
];

const BOTTOM_ITEMS: NavItem[] = [
  { key: "settings", icon: <Setting size={20} />, label: "设置" },
];

interface LeftPanelProps {
  width: number;
  activeKey: string;
  onActiveKeyChange: (key: string) => void;
}

export const LeftPanel: React.FC<LeftPanelProps> = ({ width, activeKey, onActiveKeyChange }) => {
  const collapsed = width < 120;

  return (
    <div
      style={{ width: `${width}px` }}
      className="h-full flex flex-col bg-[#1a1a2e] text-white"
    >
      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-4 border-b border-[#2a2a4e]">
        <img 
          src="/icons/32x32.png" 
          alt="IntentLoom Logo" 
          className="w-8 h-8 rounded"
        />
        {!collapsed && (
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2a2a4e] transition-colors"
          >
            <svg
              className="w-4 h-4 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 py-3 overflow-y-auto">
        <div className="px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onActiveKeyChange(item.key)}
              className={`w-full h-[44px] flex items-center gap-3 px-3 rounded-lg transition-colors ${
                activeKey === item.key
                  ? "bg-[#6366f1] text-white"
                  : "text-[#a0a0b0] hover:bg-[#2a2a4e] hover:text-white"
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center shrink-0">
                {item.icon}
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-[#ef4444] rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom */}
      <div className="py-3 border-t border-[#2a2a4e]">
        <div className="px-3 space-y-1">
          {BOTTOM_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => onActiveKeyChange(item.key)}
              className={`w-full h-[44px] flex items-center gap-3 px-3 rounded-lg transition-colors ${
                activeKey === item.key
                  ? "bg-[#6366f1] text-white"
                  : "text-[#a0a0b0] hover:bg-[#2a2a4e] hover:text-white"
              }`}
            >
              <span className="w-6 h-6 flex items-center justify-center shrink-0">
                {item.icon}
              </span>
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          ))}
        </div>

        {/* Version */}
        {!collapsed && (
          <div className="px-4 pt-3">
            <span className="text-xs text-[#606080]">v0.1.0</span>
          </div>
        )}
      </div>
    </div>
  );
};

export { ModelSwitcher } from "./ModelSwitcher";
export { ProviderList } from "./ProviderList";
export { SkillsPanel } from "./SkillsPanel";
