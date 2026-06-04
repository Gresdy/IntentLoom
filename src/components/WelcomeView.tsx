import { Zap, Code2, Layers, Shield, ArrowRight } from "lucide-react";

interface WelcomeViewProps {
  onAction?: (action: string) => void;
}

const FEATURES = [
  {
    icon: <Zap size={20} />,
    title: "意图理解",
    description: "理解你的真实意图，而非字面意思",
    color: "var(--accent)",
  },
  {
    icon: <Code2 size={20} />,
    title: "代码专家",
    description: "多语言支持，深度代码理解",
    color: "#3b82f6",
  },
  {
    icon: <Layers size={20} />,
    title: "项目感知",
    description: "理解项目结构，上下文物",
    color: "#10b981",
  },
  {
    icon: <Shield size={20} />,
    title: "安全可控",
    description: "权限管理，操作可追溯",
    color: "#8b5cf6",
  },
];

const EXAMPLES = [
  "解释这段代码的工作原理",
  "帮我重构这个组件",
  "为这个函数写单元测试",
  "优化这段代码的性能",
  "检查这段代码的安全问题",
  "生成这个函数的文档",
];

export function WelcomeView({ onAction }: WelcomeViewProps) {
  return (
    <div className="h-full overflow-y-auto p-8 ilo-bg-app">
      <div className="max-w-3xl mx-auto">
        {/* Logo 区域 */}
        <div className="text-center mb-12">
          <div 
            className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center text-3xl font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            I
          </div>
          <h1 
            className="text-3xl font-bold mb-3 ilo-fg"
          >
            IntentLoom
          </h1>
          <p 
            className="text-lg mb-2 ilo-fg-dim"
          >
            你的 AI 编程伙伴
          </p>
          <p 
            className="max-w-md mx-auto"
            style={{ color: "var(--fg-faint)", fontSize: 14 }}
          >
            基于意图理解的智能编程助手，让 AI 成为你的开发伙伴而非工具
          </p>
        </div>

        {/* 功能特点 */}
        <div className="mb-12">
          <h2 
            className="text-sm font-medium mb-4 text-center"
            style={{ color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            核心能力
          </h2>
          <div 
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
          >
            {FEATURES.map((feature, i) => (
              <div
                key={i}
                className="p-4 rounded-xl transition-all cursor-pointer"
                style={{ 
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border-soft)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = feature.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-soft)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: `${feature.color}20`, color: feature.color }}
                >
                  {feature.icon}
                </div>
                <h3 className="font-medium mb-1 ilo-fg">{feature.title}</h3>
                <p style={{ color: "var(--fg-faint)", fontSize: 12 }}>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 示例提示 */}
        <div>
          <h2 
            className="text-sm font-medium mb-4 text-center"
            style={{ color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}
          >
            开始尝试
          </h2>
          <div className="flex flex-col gap-2">
            {EXAMPLES.map((example, i) => (
              <button
                key={i}
                className="flex items-center justify-between p-4 rounded-lg text-left transition-all"
                style={{ 
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border-soft)",
                  color: "var(--fg-dim)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--fg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-soft)";
                  e.currentTarget.style.color = "var(--fg-dim)";
                }}
                onClick={() => onAction?.(example)}
              >
                <span style={{ fontSize: 14 }}>{example}</span>
                <ArrowRight size={16} className="ilo-fg-faint" />
              </button>
            ))}
          </div>
        </div>

        {/* 底部提示 */}
        <div 
          className="mt-12 text-center text-xs ilo-fg-faint"
        >
          按 <kbd className="px-1.5 py-0.5 rounded mx-1" style={{ background: "var(--bg-elev-2)", border: "1px solid var(--border)" }}>Ctrl+K</kbd> 打开命令面板
          · 按 <kbd className="px-1.5 py-0.5 rounded mx-1" style={{ background: "var(--bg-elev-2)", border: "1px solid var(--border)" }}>Tab</kbd> 切换模式
        </div>
      </div>
    </div>
  );
}
