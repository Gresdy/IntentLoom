/**
 * ThinkingDisplay — a chat-effect surface for the "thinking
 * process" the assistant emits before its final answer.
 * References AionUi's `MessageThinking` /
 * `ThoughtDisplay` (aionui/src/renderer/pages/conversation/Messages/components/MessageThinking.tsx)
 * for the visual + behavioural pattern:
 *
 *   - elapsed time while the model is still reasoning
 *     (auto-ticking once per second);
 *   - explicit subject tag (e.g. "思考中" / "思考完成");
 *   - collapsible body with the raw reasoning text, auto-
 *     collapsed on completion so the final answer stays
 *     the visual focus;
 *   - gradient background that adapts to dark / light theme
 *     — the same look AionUi uses (`#464767 → #323232` on
 *     dark, `#F0F3FF → #F2F2F2` on light) so anyone
 *     familiar with AionUi's transcript immediately
 *     recognises what they are looking at.
 *
 * The component is purely presentational. Lifecycle
 * (start, tick, finish) is owned by the `messageStore`
 * and driven by the streaming controller in
 * `reasonixAdapter`. See the docs on `ThinkingMeta` in
 * `src/stores/messageStore.ts` for the wire shape.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Check } from "lucide-react";
import { useThemeStore } from "@/stores/useThemeStore";

export interface ThinkingDisplayProps {
  /** Raw reasoning text accumulated so far. May be empty
   * while the first delta is still in flight. */
  content: string;
  /** Lifecycle state. "active" while the model is still
   * reasoning, "done" once the final answer is streaming. */
  status: "active" | "done";
  /** Wall-clock start, in `Date.now()` ms. Used to derive
   * the live elapsed timer; required for the active path
   * but may be undefined for the "done" path if the
   * controller didn't get a clean start signal. */
  startTime: number;
  /** Final duration in ms. Required when `status === "done"`
   * — the controller stamps it on the first non-thinking
   * chunk so the user sees "思考完成 (12s)" instead of an
   * ever-ticking counter that goes stale. */
  duration?: number;
}

/** Format a duration in ms as the compact `Xs` / `Xm Ys`
 * shape AionUi uses. 0..59s renders as plain seconds; 60s+
 * adds a minutes prefix. */
export function formatDurationMs(ms: number): string {
  if (ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/** Pick the first non-empty line of a block of reasoning
 * text, trimmed. Used for the collapsed-state preview so the
 * user can see at a glance what the model was thinking
 * about without re-opening the body. Falls back to the
 * first 80 chars when the text has no line breaks, so a
 * single-line `let me think...` still produces a useful
 * preview. */
export function firstLine(text: string, max = 80): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  // `split("\n")[0]` keeps the line's own leading / trailing
  // whitespace, so trim again before passing it through.
  // The outer `trim()` already removed the document-level
  // leading whitespace; this inner trim strips whatever the
  // first line itself carried.
  const first = (trimmed.split("\n")[0] ?? "").trim();
  return first.length > max ? first.slice(0, max) + "…" : first;
}

export function ThinkingDisplay(props: ThinkingDisplayProps) {
  const { content, status, startTime, duration } = props;
  const themeMode = useThemeStore((s) => s.mode);
  // Local "now" tick used for the live elapsed counter.
  // We only tick while the model is actively reasoning —
  // once `status === "done"` we switch to the controller's
  // pinned `duration` and stop updating state, so the
  // component never re-renders for a stale counter.
  const [now, setNow] = useState(() => Date.now());

  // Track the last `startTime` we synced to so a fresh
  // turn doesn't carry an elapsed counter from the previous
  // one. The effect below resets `now` whenever the start
  // time moves forward (or back to a new turn).
  const startRef = useRef(startTime);
  useEffect(() => {
    if (startRef.current !== startTime) {
      startRef.current = startTime;
      setNow(Date.now());
    }
  }, [startTime]);

  // Active path: tick every second so the user sees the
  // timer advance. The interval is torn down on completion
  // and on unmount so we do not leak timers when the
  // component is reused across turns.
  useEffect(() => {
    if (status !== "active") return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [status]);

  // Auto-collapse once the reasoning is done. The user
  // can re-open by clicking the header; we just don't keep
  // the body expanded by default on completion. Mirrors
  // AionUi's `setExpanded(!isDone)` initial state.
  const [userExpanded, setUserExpanded] = useState<boolean>(status === "active");
  useEffect(() => {
    if (status === "done") {
      setUserExpanded(false);
    }
  }, [status]);

  // Nothing to render when the controller has not produced
  // any content yet AND we are not the active turn. A
  // stale "thinking done in 0s" empty card would be
  // visual noise.
  if (!content && status !== "active") return null;

  const elapsedMs = status === "active" ? Math.max(0, now - startTime) : duration ?? 0;
  const subject = status === "active" ? "思考中" : "思考完成";
  const preview = firstLine(content);

  // Theme-aware gradient backgrounds. Match AionUi's
  // values so a side-by-side comparison reads as the
  // same component. The dark theme is a slate→charcoal
  // gradient; light is a faint blue→grey wash.
  const background = themeMode === "dark"
    ? "linear-gradient(135deg, #2a2d3e 0%, #1f1f24 100%)"
    : "linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)";

  return (
    <div
      className={`thinking thinking--${status}`}
      style={{ background }}
      data-testid="thinking-display"
    >
      <button
        type="button"
        className="thinking__header"
        onClick={() => setUserExpanded((v) => !v)}
        aria-expanded={userExpanded}
      >
        <span className={`thinking__chevron ${userExpanded ? "thinking__chevron--open" : ""}`}>
          <ChevronRight size={12} />
        </span>
        <span className="thinking__status-icon">
          {status === "active" ? (
            <Loader2 size={12} className="spin ilo-fg-accent" />
          ) : (
            <Check size={12} className="ilo-fg-ok" />
          )}
        </span>
        <span className="thinking__subject">{subject}</span>
        {preview && status === "done" && (
          <span className="thinking__preview">— {preview}</span>
        )}
        <span className="thinking__duration">{formatDurationMs(elapsedMs)}</span>
      </button>
      {userExpanded && (
        <pre className="thinking__body">{content || (status === "active" ? "…" : "")}</pre>
      )}
    </div>
  );
}

export default ThinkingDisplay;
