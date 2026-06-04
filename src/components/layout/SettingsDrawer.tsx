import { X, Sun, Moon, Monitor, Palette, Type, Keyboard, Info, Cpu } from "lucide-react";
import { useState } from "react";
import { useThemeStore, ACCENT_COLORS_LIST, FONT_SIZE_OPTIONS } from "../../stores/useThemeStore";

interface SettingsDrawerProps {
  onClose: () => void;
}

type SettingsTab = "appearance" | "shortcuts" | "about";

export function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const { mode, setMode, accentColor, setAccentColor, fontSize, setFontSize } = useThemeStore();

  const tabs = [
    { id: "appearance" as const, label: "外观", icon: <Palette size={14} /> },
    { id: "shortcuts" as const, label: "快捷键", icon: <Keyboard size={14} /> },
    { id: "about" as const, label: "关于", icon: <Info size={14} /> },
  ];

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer drawer--wide" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <header className="drawer__head">
          <div className="drawer__title flex items-center gap-2">
            <Cpu size={16} />
            设置
          </div>
          <button className="chip" onClick={onClose}>
            <X size={14} />
          </button>
        </header>

        {/* Tab 导航 */}
        <div className="flex border-b ilo-border-soft">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm transition-colors ${
                activeTab === tab.id ? "border-b-2" : ""
              }`}
              style={{
                borderColor: activeTab === tab.id ? "var(--accent)" : "transparent",
                color: activeTab === tab.id ? "var(--accent)" : "var(--fg-dim)",
              }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容 */}
        <div className="drawer__body">
          {activeTab === "appearance" && (
            <AppearanceSettings 
              mode={mode} 
              setMode={setMode}
              accentColor={accentColor}
              setAccentColor={setAccentColor}
              fontSize={fontSize}
              setFontSize={setFontSize}
            />
          )}
          
          {activeTab === "shortcuts" && <ShortcutsSettings />}
          
          {activeTab === "about" && <AboutSettings />}
        </div>
      </aside>
    </div>
  );
}

function AppearanceSettings({
  mode, setMode, accentColor, setAccentColor, fontSize, setFontSize
}: {
  mode: string;
  setMode: (m: any) => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
  fontSize: string;
  setFontSize: (f: any) => void;
}) {
  const [customColor, setCustomColor] = useState(accentColor);

  return (
    <div>
      {/* 主题 */}
      <div className="settings-section">
        <div className="settings-section__title flex items-center gap-2">
          <Monitor size={14} />
          主题
        </div>
        <div className="theme-switcher">
          <button
            className={`theme-btn ${mode === "light" ? "theme-btn--active" : ""}`}
            onClick={() => setMode("light")}
          >
            <Sun size={14} className="inline mr-1" />
            浅色
          </button>
          <button
            className={`theme-btn ${mode === "dark" ? "theme-btn--active" : ""}`}
            onClick={() => setMode("dark")}
          >
            <Moon size={14} className="inline mr-1" />
            深色
          </button>
          <button
            className={`theme-btn ${mode === "system" ? "theme-btn--active" : ""}`}
            onClick={() => setMode("system")}
          >
            <Monitor size={14} className="inline mr-1" />
            自动
          </button>
        </div>
      </div>

      {/* 主题色 */}
      <div className="settings-section">
        <div className="settings-section__title flex items-center gap-2">
          <Palette size={14} />
          主题色
        </div>
        <div className="color-picker">
          {ACCENT_COLORS_LIST.map((color) => (
            <button
              key={color.value}
              className={`color-swatch ${accentColor === color.value ? "color-swatch--active" : ""}`}
              style={{ background: color.value }}
              onClick={() => setAccentColor(color.value)}
              title={color.name}
            />
          ))}
        </div>
        
        {/* 自定义颜色 */}
        <div className="flex items-center gap-2 mt-3">
          <input
            type="color"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer"
            style={{ border: "1px solid var(--border)" }}
          />
          <input
            type="text"
            value={customColor}
            onChange={(e) => setCustomColor(e.target.value)}
            onBlur={() => setAccentColor(customColor)}
            className="flex-1 px-2 py-1 rounded text-xs"
            style={{ 
              background: "var(--bg)", 
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--mono)",
            }}
          />
          <button 
            className="chip"
            onClick={() => setAccentColor(customColor)}
          >
            应用
          </button>
        </div>
      </div>

      {/* 字体大小 */}
      <div className="settings-section">
        <div className="settings-section__title flex items-center gap-2">
          <Type size={14} />
          字体大小
        </div>
        <div className="flex gap-2">
          {FONT_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`chip ${fontSize === opt.value ? "chip--on" : ""}`}
              onClick={() => setFontSize(opt.value)}
            >
              {opt.label} ({opt.value === "small" ? "13px" : opt.value === "medium" ? "14px" : "15px"})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutsSettings() {
  const shortcuts = [
    { keys: "Ctrl+K", desc: "打开命令面板" },
    { keys: "Ctrl+O", desc: "打开文件夹" },
    { keys: "Ctrl+Shift+N", desc: "新建会话" },
    { keys: "Ctrl+,", desc: "打开设置" },
    { keys: "Enter", desc: "发送消息" },
    { keys: "Shift+Tab", desc: "切换模式 (Normal → Plan → Yolo)" },
    { keys: "Tab", desc: "在斜杠菜单中选择" },
    { keys: "Escape", desc: "关闭弹窗/菜单" },
  ];

  return (
    <div>
      <div className="settings-section">
        <div className="settings-section__title">全局快捷键</div>
        <div className="space-y-1">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-2">
              <span style={{ color: "var(--fg-dim)", fontSize: 13 }}>{s.desc}</span>
              <kbd style={{
                padding: "4px 8px",
                borderRadius: 6,
                fontSize: 12,
                background: "var(--bg-elev-2)",
                border: "1px solid var(--border)",
                fontFamily: "var(--mono)",
              }}>
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutSettings() {
  return (
    <div>
      <div className="settings-section">
        <div 
          className="flex flex-col items-center text-center p-6 rounded-lg ilo-bg-soft"
        >
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold mb-4"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            I
          </div>
          <h2 className="text-lg font-semibold mb-1">IntentLoom</h2>
          <p style={{ color: "var(--fg-faint)", fontSize: 13 }}>版本 0.1.0</p>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section__title">核心特性</div>
        <ul className="space-y-2" style={{ color: "var(--fg-dim)", fontSize: 13 }}>
          <li className="flex items-start gap-2">
            <span className="ilo-fg-ok">✓</span>
            意图驱动的 AI 编程伙伴
          </li>
          <li className="flex items-start gap-2">
            <span className="ilo-fg-ok">✓</span>
            支持多 AI 模型 (Claude, GPT, Gemini)
          </li>
          <li className="flex items-start gap-2">
            <span className="ilo-fg-ok">✓</span>
            项目级上下文理解
          </li>
          <li className="flex items-start gap-2">
            <span className="ilo-fg-ok">✓</span>
            专家模板系统
          </li>
          <li className="flex items-start gap-2">
            <span className="ilo-fg-ok">✓</span>
            安全的权限管理
          </li>
        </ul>
      </div>

      <div className="settings-section">
        <div className="settings-section__title">技术栈</div>
        <div 
          className="p-4 rounded-lg ilo-bg-soft"
        >
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="ilo-fg-faint">框架</span>
              <div className="ilo-fg">Tauri 2.0</div>
            </div>
            <div>
              <span className="ilo-fg-faint">前端</span>
              <div className="ilo-fg">React 19</div>
            </div>
            <div>
              <span className="ilo-fg-faint">状态管理</span>
              <div className="ilo-fg">Zustand</div>
            </div>
            <div>
              <span className="ilo-fg-faint">样式</span>
              <div className="ilo-fg">UnoCSS + CSS Variables</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
