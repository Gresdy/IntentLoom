/**
 * ThinkingDisplay — AionUi-style thinking process display.
 * 
 * Ported from AionUi's MessageThinking component:
 *   /Users/zyh/PycharmProjects/AionUi/src/renderer/pages/conversation/Messages/components/MessageThinking.tsx
 * 
 * Features:
 *   - Spinning indicator while thinking
 *   - Elapsed time display (ticking every second)
 *   - Collapsible body with raw reasoning text
 *   - Auto-collapse when thinking is done
 *   - Divider lines (hr elements)
 *   - Italic styling for thinking text
 *   - Theme-aware gradient background
 * 
 * AionUi reference:
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageThinking.tsx
 */

import { useEffect, useRef, useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

export interface ThinkingDisplayProps {
  /** Raw reasoning text accumulated so far */
  content: string;
  /** Lifecycle state: "active" while reasoning, "done" when final answer streams */
  status: "active" | "done";
  /** Wall-clock start time in ms */
  startTime: number;
  /** Final duration in ms (set when status becomes "done") */
  duration?: number;
}

/** Get the first line of content, truncated to max chars */
export function firstLine(text: string, max = 80): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const first = (trimmed.split("\n")[0] ?? "").trim();
  return first.length > max ? first.slice(0, max) + "…" : first;
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

export function ThinkingDisplay(props: ThinkingDisplayProps) {
  const { content, status, startTime, duration } = props;
  const themeMode = useThemeStore((s) => s.mode);
  
  const isDone = status === "done";
  const [expanded, setExpanded] = useState(!isDone);
  const [now, setNow] = useState(() => Date.now());
  const startTimeRef = useRef(startTime);
  const bodyRef = useRef<HTMLPreElement>(null);

  // Track the last `startTime` we synced to so a fresh turn doesn't carry
  // an elapsed counter from the previous one
  useEffect(() => {
    if (startTimeRef.current !== startTime) {
      startTimeRef.current = startTime;
      setNow(Date.now());
    }
  }, [startTime]);

  // Auto-collapse when status changes to done
  useEffect(() => {
    if (isDone) {
      setExpanded(false);
    }
  }, [isDone]);

  // Elapsed timer for active thinking
  useEffect(() => {
    if (status !== "active") return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (!isDone && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isDone, expanded]);

  // Nothing to render when the controller has not produced any content yet
  // AND we are not the active turn. A stale "thinking done in 0s" empty card
  // would be visual noise.
  if (!content && status !== "active") return null;

  // Theme-aware gradient background
  const gradientStyle = themeMode === "dark"
    ? "linear-gradient(135deg, #464767 0%, #323232 100%)"
    : "linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)";

  // Calculate elapsed time
  const elapsedMs = isDone ? (duration ?? 0) : Math.max(0, now - startTime);

  return (
    <div
      className={`thinking thinking--${status}`}
      data-testid="thinking-display"
      style={{ background: gradientStyle }}
    >
      <button
        type="button"
        className="thinking__header"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <span className={`thinking__chevron ${expanded ? "thinking__chevron--open" : ""}`}>
          ▶
        </span>
        {!isDone && (
          <span className="thinking__spinner" />
        )}
        <span className="thinking__subject">
          {isDone ? "思考完成" : "思考中"}
        </span>
        {isDone && content && (
          <span className="thinking__preview">— {firstLine(content)}</span>
        )}
        <span className="thinking__duration">
          {formatDurationMs(elapsedMs)}
        </span>
      </button>
      {expanded && (
        <pre ref={bodyRef} className="thinking__body">{content || (isDone ? "" : "…")}</pre>
      )}
    </div>
  );
}

export default ThinkingDisplay;
