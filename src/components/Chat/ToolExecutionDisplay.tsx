/**
 * ToolExecutionDisplay — 工具执行过程显示组件
 * 
 * 类似于ThinkingDisplay，但用于显示工具执行过程：
 *   - Spinning indicator while executing
 *   - Elapsed time display (ticking every second)
 *   - Collapsible body with tool list
 *   - Auto-collapse when all tools are done
 *   - Shows tool names, input arguments, and result
 */

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { Loader2, ListChecks, ChevronRight } from "lucide-react";
import type { ToolCall } from "@/types/message";

export interface ToolExecutionDisplayProps {
  /** Current tool calls */
  tools: ToolCall[];
  /** Wall-clock start time in ms */
  startTime: number;
}

/** Get the tool names as a summary string */
function getToolsSummary(tools: ToolCall[]): string {
  if (tools.length === 0) return "";
  const names = tools.map(t => t.name || "Tool").slice(0, 3);
  if (tools.length > 3) {
    return names.join(", ") + ` (+${tools.length - 3} more)`;
  }
  return names.join(", ");
}

/** Format milliseconds as Xs or Xm Ys */
export function formatDurationMs(ms: number): string {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

/** Get the main argument as a preview string */
function getToolArgPreview(tool: ToolCall): string {
  const args = tool.arguments;
  if (!args || typeof args !== "object") return "";
  
  // Try common fields
  const fields = ["file_path", "path", "command", "query", "pattern", "url"];
  for (const field of fields) {
    if (field in args && typeof args[field] === "string") {
      const value = args[field] as string;
      return value.length > 50 ? value.slice(0, 47) + "..." : value;
    }
  }
  
  // Fall back to first string field
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > 0) {
      return value.length > 50 ? value.slice(0, 47) + "..." : value;
    }
  }
  
  return "";
}

/** Get the result as a preview string */
function getToolResultPreview(tool: ToolCall): string {
  const result = tool.result;
  if (!result) return "";
  if (typeof result === "string") {
    return result.length > 100 ? result.slice(0, 97) + "..." : result;
  }
  if (typeof result === "object") {
    // Try to get useful fields from result
    const fields = ["content", "output", "data", "files", "matches"];
    for (const field of fields) {
      if (field in result && result[field]) {
        const value = result[field];
        if (typeof value === "string") {
          return value.length > 100 ? value.slice(0, 97) + "..." : value;
        }
        if (Array.isArray(value)) {
          return `${value.length} items`;
        }
      }
    }
    // Fall back to JSON
    const json = JSON.stringify(result);
    return json.length > 100 ? json.slice(0, 97) + "..." : json;
  }
  return String(result).slice(0, 100);
}

export function ToolExecutionDisplay(props: ToolExecutionDisplayProps) {
  const { tools, startTime } = props;
  const themeMode = useThemeStore((s) => s.mode);
  
  const hasRunning = tools.some(t => t.status === "running" || t.status === "in_progress");
  const isDone = !hasRunning && tools.length > 0;
  const [expanded, setExpanded] = useState(!isDone);
  const [now, setNow] = useState(() => Date.now());
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const startTimeRef = useRef(startTime);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Track the last `startTime` we synced to so a fresh turn doesn't carry
  // an elapsed counter from the previous one
  useEffect(() => {
    if (startTimeRef.current !== startTime) {
      startTimeRef.current = startTime;
      setNow(Date.now());
    }
  }, [startTime]);

  // Auto-collapse when all tools are done
  useEffect(() => {
    if (isDone) {
      setExpanded(false);
    }
  }, [isDone]);

  // Elapsed timer for active execution
  useEffect(() => {
    if (!hasRunning) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasRunning]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (hasRunning && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [tools, hasRunning, expanded]);

  // Toggle tool detail expansion
  const toggleToolExpanded = (toolId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(toolId)) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  // Nothing to render when there are no tools
  if (tools.length === 0) return null;

  // Theme-aware gradient background
  const gradientStyle = themeMode === "dark"
    ? "linear-gradient(135deg, #464767 0%, #323232 100%)"
    : "linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)";

  // Calculate elapsed time
  const elapsedMs = isDone ? 0 : Math.max(0, now - startTime);

  return (
    <div
      className={`tool-execution tool-execution--${hasRunning ? "active" : "done"}`}
      data-testid="tool-execution-display"
      style={{ background: gradientStyle }}
    >
      <button
        type="button"
        className="tool-execution__header"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <span className={`tool-execution__chevron ${expanded ? "tool-execution__chevron--open" : ""}`}>
          ▶
        </span>
        {hasRunning && (
          <span className="tool-execution__spinner" />
        )}
        <span className="tool-execution__subject">
          {isDone ? "执行完成" : "执行中"}
        </span>
        {isDone && tools.length > 0 && (
          <span className="tool-execution__preview">— {getToolsSummary(tools)}</span>
        )}
        <span className="tool-execution__duration">
          {tools.length} 个步骤 · {formatDurationMs(elapsedMs)}
        </span>
      </button>
      {expanded && (
        <div ref={bodyRef} className="tool-execution__body">
          {tools.map((tool) => {
            const isExpanded = expandedTools.has(tool.id);
            const hasDetail = tool.arguments || tool.result;
            const argPreview = getToolArgPreview(tool);
            const resultPreview = getToolResultPreview(tool);
            
            return (
              <div key={tool.id} className="tool-execution__item">
                <div 
                  className={`tool-execution__item-header ${hasDetail ? "tool-execution__item-header--clickable" : ""}`}
                  onClick={hasDetail ? () => toggleToolExpanded(tool.id) : undefined}
                >
                  <span className="tool-execution__item-icon">
                    {tool.status === "running" || tool.status === "in_progress" ? (
                      <Loader2 size={10} className="spin" />
                    ) : tool.status === "completed" || tool.status === "success" ? (
                      <span className="ilo-fg-ok">✓</span>
                    ) : tool.status === "error" ? (
                      <span className="ilo-fg-err">✗</span>
                    ) : (
                      <span className="ilo-fg-faint">○</span>
                    )}
                  </span>
                  <span className="tool-execution__item-name">{tool.name || "Tool"}</span>
                  {argPreview && (
                    <span className="tool-execution__item-arg">— {argPreview}</span>
                  )}
                  {hasDetail && (
                    <span className={`tool-execution__item-chevron ${isExpanded ? "tool-execution__item-chevron--open" : ""}`}>
                      <ChevronRight size={10} />
                    </span>
                  )}
                </div>
                {isExpanded && hasDetail && (
                  <div className="tool-execution__item-detail">
                    {tool.arguments && (
                      <div className="tool-execution__detail-section">
                        <div className="tool-execution__detail-label">输入</div>
                        <pre className="tool-execution__detail-content">
                          {typeof tool.arguments === "string" 
                            ? tool.arguments 
                            : JSON.stringify(tool.arguments, null, 2)}
                        </pre>
                      </div>
                    )}
                    {tool.result && (
                      <div className="tool-execution__detail-section">
                        <div className="tool-execution__detail-label">输出</div>
                        <pre className="tool-execution__detail-content">
                          {typeof tool.result === "string" 
                            ? tool.result 
                            : JSON.stringify(tool.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ToolExecutionDisplay;
