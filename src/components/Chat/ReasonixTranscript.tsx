import { useRef, useEffect, useState } from "react";
import type { ReasonixItem } from "../../lib/reasonixAdapter";
import { ChevronRight, Loader2, FolderOpen, Bot } from "lucide-react";

interface TranscriptProps {
  items: ReasonixItem[];
  onPrompt?: (text: string) => void;
  onNewChat?: () => void;
  onPickWorkspace?: () => void;
}

export function Transcript({ items, onPrompt, onNewChat, onPickWorkspace }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="welcome">
        <div
          className="welcome__logo"
          style={{ background: "var(--accent)", color: "var(--accent-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18 }}
        >
          I
        </div>
        <h1 className="welcome__title">IntentLoom</h1>
        <p className="welcome__tag">将混沌的想法编织成清晰的产品</p>
        <div className="welcome__hints">
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> 命令面板</span>
          <span><kbd>Tab</kbd> 切换模式</span>
          <span><kbd>Ctrl</kbd>+<kbd>N</kbd> 新会话</span>
        </div>
        <div className="welcome__examples">
          <button className="welcome__ex" onClick={() => onPrompt?.("帮我解释这段代码的功能")}>帮我解释这段代码的功能</button>
          <button className="welcome__ex" onClick={() => onPrompt?.("重构这个组件，使其更易维护")}>重构这个组件，使其更易维护</button>
          <button className="welcome__ex" onClick={() => onPrompt?.("为这个函数编写单元测试")}>为这个函数编写单元测试</button>
          <button className="welcome__ex" onClick={() => onPrompt?.("分析项目架构，给出改进建议")}>分析项目架构，给出改进建议</button>
        </div>
        <div className="welcome__quick-actions" style={{ marginTop: 20, display: "flex", gap: 10 }}>
          {onPickWorkspace && (
            <button className="chip" onClick={onPickWorkspace} style={{ fontSize: 12, gap: 6 }}>
              <FolderOpen size={13} /> 打开项目
            </button>
          )}
          {onNewChat && (
            <button className="chip" onClick={onNewChat} style={{ fontSize: 12, gap: 6 }}>
              <Bot size={13} /> 新建会话
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="transcript">
      {items.map((item) => <ItemRenderer key={item.id} item={item} />)}
      <div ref={bottomRef} />
    </div>
  );
}

function ItemRenderer({ item }: { item: ReasonixItem }) {
  switch (item.kind) {
    case "user":
      return (
        <div className="msg msg--user">
          <span className="msg__caret">›</span>
          <div className="msg__text">{item.text}</div>
        </div>
      );
    
    case "assistant":
      return <AssistantMessage text={item.text} streaming={item.streaming} reasoning={item.reasoning} />;
    
    case "tool":
      return <ToolCard item={item as any} />;
    
    case "phase":
      return <div className="phase">{item.text}</div>;
    
    case "notice":
      return <div className={`notice ${item.level === "warn" ? "notice--warn" : ""}`}>{item.text}</div>;
    
    default:
      return null;
  }
}

function AssistantMessage({ text, streaming, reasoning }: { text: string; streaming?: boolean; reasoning?: string }) {
  const [showReasoning, setShowReasoning] = useState(false);

  return (
    <div className="msg msg--assistant">
      {reasoning && (
        <div className="reasoning">
          <button className="reasoning__toggle" onClick={() => setShowReasoning(!showReasoning)}>
            <ChevronRight size={12} className={`reasoning__chevron ${showReasoning ? "reasoning__chevron--open" : ""}`} />
            思考过程
          </button>
          {showReasoning && <div className="reasoning__body">{reasoning}</div>}
        </div>
      )}
      <div className="msg__stream">{text}{streaming && <span className="cursor" />}</div>
    </div>
  );
}

function ToolCard({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(false);
  
  const statusIcon: Record<string, React.ReactNode> = {
    running: <Loader2 size={12} className="spin ilo-fg-accent" />,
    success: <span className="ilo-fg-ok">✓</span>,
    error: <span className="ilo-fg-err">✗</span>,
    pending: <span className="ilo-fg-faint">○</span>,
  };

  return (
    <div className={`tool ${item.status === "running" ? "tool--running" : ""}`}>
      <button className="tool__row tool__row--clickable" onClick={() => setExpanded(!expanded)}>
        <span className={`tool__chevron ${expanded ? "tool__chevron--open" : "tool__chevron--placeholder"}`}>
          {expanded ? <ChevronRight size={12} /> : null}
        </span>
        <span className="tool__icon">{statusIcon[item.status]}</span>
        <span className="tool__name">{item.name}</span>
        <span className="tool__subject">{JSON.stringify(item.args).slice(0, 50)}</span>
      </button>
      {expanded && item.result && <div className="tool__body"><pre className="code">{JSON.stringify(item.result, null, 2)}</pre></div>}
      {item.status === "error" && <div className="tool__err">{item.result}</div>}
    </div>
  );
}
