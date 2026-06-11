import { useCallback, useMemo, useEffect, useState } from "react";
import type { AppId } from "../shared/types";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "./tauri";
import { useConversationStore } from "@/stores/conversationStore";
import { useMessageStore } from "@/stores/messageStore";
import { useModelStore, effectiveModelForCli } from "@/stores/useModelStore";
import { useAgentStore } from "@/lib/useAgents";
import { resolveModeId, resolveReasoningId, useComposerPrefsStore } from "@/stores/useComposerPrefsStore";
import { resolveOpenclawSession } from "@/stores/useOpenclawSessionStore";
import { buildArtifactSummary, hasAnyArtifact } from "@/lib/artifactTally";
import type { ArtifactTally } from "@/lib/artifactTally";
import { useProductChangesStore } from "@/lib/useProductChanges";
import { parseStreamChunk } from "@/lib/streamChunkParser";
import { useToastStore } from "@/lib/useToast";
import { useTestItemsStore } from "@/lib/testItemsStore";
import { stripThinkTags } from "@/utils/thinkTagFilter";
import { stripSkillSuggest } from "@/utils/skillSuggestParser";
import type { ToolCall } from "@/types/message";

export type Mode = "normal" | "plan" | "yolo";

export type ReasonixItem =
  | { kind: "user"; id: string; text: string; agentId?: string }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean; reasoning?: string; agentId?: string }
  | { kind: "tool"; id: string; name: string; args: any; status: string; result?: any; diff?: any[]; kind2?: string; agentId?: string }
  | { kind: "tool_group"; id: string; tools: ReasonixItem[]; agentId?: string }
  | { kind: "phase"; id: string; text: string; agentId?: string }
  | { kind: "notice"; id: string; level: string; text: string; agentId?: string }
  | { kind: "summary"; id: string; tally: ArtifactTally; agentId?: string }
  | { kind: "permission"; id: string; toolName: string; args: any; reason?: string; status: "pending" | "approved" | "denied"; agentId?: string }
  // === AionUi port (Phase 2) — new message kinds ===
  /** Agent session lifecycle badge: connecting / connected / authenticated / session_active / error. */
  | { kind: "agent_status"; id: string; backend: string; status: "connecting" | "connected" | "authenticated" | "session_active" | "error"; agentName?: string; agentId?: string; createdAt?: number }
  /** Structured tip / error / warning / success with optional JSON body. */
  | { kind: "tips"; id: string; level: "info" | "success" | "warning" | "error"; text: string; code?: string; structuredError?: { message: string; code?: string; ownership?: "aionui" | "user_agent" | "user_llm_provider" | "unknown_upstream"; retryable?: boolean; detail?: string; resolution?: string; workspacePath?: string }; agentId?: string; createdAt?: number }
  /** Inline plan / todo list rendered in the transcript. */
  | { kind: "plan"; id: string; title?: string; entries: Array<{ id: string; content: string; status: "pending" | "in_progress" | "completed" | "skipped" }>; agentId?: string; createdAt?: number }
  /** Skill suggestion card (e.g. "try /code-review"). */
  | { kind: "skill_suggest"; id: string; name: string; description: string; content?: string; agentId?: string; createdAt?: number }
  /** Cron / scheduled-task trigger card (e.g. "定时任务 #7 触发了"). */
  | { kind: "cron_trigger"; id: string; cronJobId?: string; cronJobName?: string; triggeredAt?: number; agentId?: string; createdAt?: number }
  /** Slash commands the active CLI natively supports (AionUi `available_commands` port). */
  | { kind: "available_commands"; id: string; commands: Array<{ name: string; description: string; hint?: string }>; agentId?: string; createdAt?: number };

export interface ReasonixMeta {
  label: string;
  startupErr?: string;
  /**
   * Absolute path of the workspace folder the user picked from the
   * native folder dialog. `null` (or absent) means "no workspace
   * chosen yet". The controller persists this in `localStorage`
   * under `intentloom.cwd` so the choice survives an app restart.
   */
  cwd?: string;
}

export interface ReasonixState {
  items: ReasonixItem[];
  running: boolean;
  meta: ReasonixMeta | null;
  context: any;
  usage: { promptTokens: number; completionTokens: number; cacheHitTokens: number; cacheMissTokens: number } | null;
  balance: any;
  jobs: any[];
  approval: { id: string; tool: string; args: string } | null;
  ask: { id: string; question: string; options: string[] } | null;
  turnStartAt: number | null;
  turnTokens: number;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// localStorage key for the last picked workspace path. Kept under
// the `intentloom.` namespace to avoid colliding with other apps
// in the same origin (Tauri serves the webview from `tauri://` so
// localStorage is per-app, but a prefix is cheap insurance).
const WORKSPACE_STORAGE_KEY = "intentloom.cwd";

function readPersistedCwd(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const v = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return v && v.length > 0 ? v : undefined;
  } catch {
    // localStorage can throw in private mode / disabled storage;
    // treat that as "no prior workspace" rather than crashing.
    return undefined;
  }
}

function writePersistedCwd(cwd: string | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (cwd && cwd.length > 0) {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, cwd);
    } else {
      window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  } catch {
    // Same as readPersistedCwd: swallow storage failures rather
    // than blocking the UI on a transient storage error.
  }
}

// Convert a ToolCall from messageStore into the wire shape used by
// the `tool` ReasonixItem. Kept tiny because the Transcript side
// already has its own `tool.diff` / `tool.kind` accessors.
function toolCallToItem(tc: ToolCall, idSuffix: string, agentId?: string): ReasonixItem {
  return {
    kind: "tool",
    id: idSuffix,
    name: tc.name,
    args: tc.arguments,
    status: tc.status,
    result: tc.result,
    diff: tc.diff,
    kind2: tc.kind,
    agentId,
  };
}

/**
 * Translate a raw error from `send_chat_message` into a
 * user-facing string. The Rust side (commands/ai.rs) bubbles
 * up either a literal OS error ("No such file or directory"),
 * a wrapper (`AI CLI error: <stderr>`), or a generic
 * `AI CLI exited with N`. The user should never see a raw
 * exit code in the toast — they want to know what to do
 * next, not what the OS returned.
 *
 * Exported so the test suite can pin the exact mapping
 * (these strings end up in user-visible toasts and notice
 * banners, so a regression is a UX regression).
 */
export function friendlySendError(raw: string, cli: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return `${cli} 调用失败`;
  const lower = trimmed.toLowerCase();
  // OS-level "no such file" / "not found" — the CLI is not
  // on $PATH. We just caught this in the pre-flight check,
  // but it can still show up if the user removed the binary
  // between the cache read and the spawn.
  if (
    lower.includes("no such file") ||
    lower.includes("not found") ||
    lower.includes("enoent")
  ) {
    return `${cli} 不可用：未在 PATH 中找到，请先安装或检查 cli_path 配置`;
  }
  // EACCES — binary exists but is not executable. Common
  // when the user copies a CLI into ~/bin without chmod +x.
  if (lower.includes("permission denied") || lower.includes("eacces")) {
    return `${cli} 无法执行：权限不足，请检查可执行位 (chmod +x)`;
  }
  // Wrapper from commands::ai::call_ai — the CLI ran but
  // produced stderr. Show the stderr tail if it's short
  // enough to be informative; otherwise fall back to the
  // generic CLI-failed message.
  const wrapperMatch = /^AI CLI error:\s*(.+)$/i.exec(trimmed);
  if (wrapperMatch) {
    const detail = wrapperMatch[1].trim();
    return `${cli} 调用失败：${detail.length > 120 ? detail.slice(0, 120) + "…" : detail}`;
  }
  // The exit-code wrapper from commands::ai::stream_ai. The
  // Rust side now ALSO appends the captured stderr tail after
  // the exit code (`: <stderr>`) so the user sees the
  // upstream CLI's diagnostic — auth 401, model-not-found,
  // network error, etc. — instead of just an opaque exit
  // code. The regex below matches both shapes:
  //   - `AI CLI exited with 1`             (no stderr)
  //   - `AI CLI exited with 1: <stderr...>`  (with stderr)
  // so older server builds that still emit the bare code
  // keep working while the new ones surface the real cause.
  const exitMatch = /^AI CLI exited with (-?\d+)(?::\s*(.*))?$/i.exec(trimmed);
  if (exitMatch) {
    const code = exitMatch[1];
    const detail = (exitMatch[2] ?? "").trim();
    const baseMsg = `${cli} 启动失败（退出码 ${code}）：请检查 CLI 是否已安装、已登录，或在 “AI 助手” 面板切换其他引擎`;
    if (!detail) return baseMsg;
    // Truncate at 200 chars so the toast stays readable; the
    // red notice below carries the full detail.
    const tail = detail.length > 200 ? detail.slice(0, 200) + "…" : detail;
    return `${baseMsg}\n\n${tail}`;
  }
  // Fallback — pass the raw text through but prefix with
  // the CLI name so the user knows which engine failed.
  return `${cli} 调用失败：${trimmed}`;
}

// AionUI-style grouping: consecutive `tool` items (2+) get
// wrapped into a `tool_group` so the transcript renders them
// as a collapsible group with a summary header. A single
// tool call stays standalone — the visual weight of a group
// header for one child is worse than just showing the card.
function groupConsecutiveTools(items: ReasonixItem[]): ReasonixItem[] {
  const out: ReasonixItem[] = [];
  let buffer: ReasonixItem[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    if (buffer.length === 1) {
      out.push(buffer[0]);
    } else {
      // All tools in a group share the same agentId (they were
      // produced by the same assistant message).
      const agentId = buffer[0].agentId;
      out.push({
        kind: "tool_group",
        id: `tg-${buffer[0].id}`,
        tools: [...buffer],
        agentId,
      });
    }
    buffer = [];
  };

  for (const item of items) {
    if (item.kind === "tool") {
      buffer.push(item);
    } else {
      flush();
      out.push(item);
    }
  }
  flush();
  return out;
}

export function useReasonixController() {
  // Last workspace folder the user picked from the native dialog.
  // Initialized from localStorage so a freshly-mounted controller
  // (e.g. after a window reload) shows the same path the user
  // previously chose. The setter writes back to localStorage on
  // every change, so even if the controller remounts inside the
  // same Tauri session the path survives.
  const [cwd, setCwd] = useState<string | undefined>(() => readPersistedCwd());

  const {
    conversations,
    currentConversationId,
    createConversation,
    deleteConversation,
    selectConversation,
    addMessageToCurrent,
    updateLastMessage,
    getCurrentConversation,
    updateConversation,
  } = useConversationStore();

  const {
    currentProviderId,
    providers,
    switchProvider,
    setCurrentApp,
  } = useModelStore();
  const currentProvider = currentProviderId ? providers[currentProviderId] : null;

  const {
    isStreaming,
    currentThinking,
    currentToolCalls,
    currentPermission,
    setStreaming,
    summaryByConversation,
    notices,
    addToolCall,
    addToolResponse,
    updateToolCall,
    setPlan,
    setPermission,
    appendContent,
    appendThinking,
    beginThinking,
    finishThinking,
    addNotice,
    setSummary,
    resetCurrentStream,
  } = useMessageStore();

  const currentConversation = useMemo(() => {
    return conversations.find((c) => c.id === currentConversationId);
  }, [conversations, currentConversationId]);

  const conversationMessages = currentConversation?.messages ?? [];

  const injectedItems = useTestItemsStore((s) => s.injectedItems);
  const items: ReasonixItem[] = useMemo(() => {
    const result: ReasonixItem[] = [];
    // === Test injection (dev only): any items pushed via
    // `useTestItemsStore.setInjectedItems` are prepended to the
    // transcript so screenshots / Playwright runs can verify
    // message rendering without a live CLI stream.
    if (injectedItems.length > 0) {
      // eslint-disable-next-line no-console
      console.log("[reasonixAdapter] injecting", injectedItems.length, "test items");
      for (const it of injectedItems) result.push(it);
    } else {
      // eslint-disable-next-line no-console
      console.log("[reasonixAdapter] useMemo run, injectedItems.length=0");
    }
    // The active agent for this conversation. Persisted
    // conversations carry `metadata.agentId`; for the live
    // stream we read from the model store so the current
    // tab's agent identity is reflected even before the
    // first message is sent.
    const agentId =
      currentConversation?.metadata?.agentId ??
      useModelStore.getState().currentApp ??
      "claude";

    for (const msg of conversationMessages) {
      if (msg.role === "user") {
        result.push({ kind: "user", id: msg.id, text: msg.content, agentId });
      } else if (msg.role === "assistant") {
        result.push({
          kind: "assistant",
          id: msg.id,
          text: msg.content,
          streaming: false,
          reasoning: msg.thinking,
          agentId,
        });
        // Persisted tool calls on the assistant message become ToolCards
        // in the transcript. W3 of the-loom-as-product.md: this is what
        // makes "文件改动内联展示" work after the stream ends — the
        // live stream lights up LoomPanel, the persisted mirror shows
        // the same content inline in chat history.
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            result.push(toolCallToItem(tc, `${msg.id}-tc-${tc.id}`, agentId));
          }
        }
        // Persisted permission requests render as inline permission cards
        // so the user can see what was approved / denied in history.
        if (msg.permission && msg.permission.status === "pending") {
          result.push({
            kind: "permission",
            id: `perm-${msg.id}`,
            toolName: msg.permission.toolName,
            args: msg.permission.args,
            reason: msg.permission.reason,
            status: msg.permission.status ?? "pending",
            agentId,
          });
        }
      }
    }

    if (isStreaming && currentConversation?.messages.length) {
      const lastMsg = currentConversation.messages[currentConversation.messages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        result.push({
          kind: "assistant",
          id: "streaming",
          text: lastMsg.content,
          streaming: true,
          reasoning: currentThinking,
          agentId,
        });
        // Live tool cards: the in-flight tool calls from messageStore.
        // After stream-end these get persisted onto the assistant
        // message (see ai-stream-end handler) and the live snapshot
        // resets, so we don't double-render.
        for (const tc of currentToolCalls) {
          result.push(toolCallToItem(tc, `live-tc-${tc.id}`, agentId));
        }
      }
    }

    // Live permission request — show as an inline approval card.
    if (isStreaming && currentPermission && currentPermission.status === "pending") {
      result.push({
        kind: "permission",
        id: `perm-live-${currentPermission.id}`,
        toolName: currentPermission.toolName,
        args: currentPermission.args,
        reason: currentPermission.reason,
        status: "pending",
        agentId,
      });
    }

    if (currentConversationId) {
      const tally = summaryByConversation[currentConversationId];
      if (tally && hasAnyArtifact(tally)) {
        result.push({
          kind: "summary",
          id: `summary-${currentConversationId}`,
          tally,
          agentId,
        });
      }
    }

    // In-conversation notices (Hermes auth / network banners,
    // T6). We push them after the per-conversation summary so
    // they render at the bottom of the transcript where a
    // "the upstream rejected your request" banner is the
    // natural place to look. The Transcript already styles
    // the `notice` kind with a red border / soft background.
    for (const n of notices) {
      result.push({ kind: "notice", id: n.id, level: n.level, text: n.text, agentId });
    }

    // AionUI-style grouping: consecutive `tool` items get
    // wrapped into a `tool_group` so the transcript renders
    // them as a collapsible group with a summary header
    // ("3 次工具调用") instead of N separate cards. The
    // grouping only applies to 2+ consecutive tools — a
    // single tool call is rendered as a standalone card
    // (the visual weight of a group header + single child
    // would be worse than just showing the card directly).
    const grouped = groupConsecutiveTools(result);
    return grouped;
  }, [
    conversationMessages,
    injectedItems,
    isStreaming,
    currentThinking,
    currentToolCalls,
    currentPermission,
    currentConversation,
    currentConversationId,
    summaryByConversation,
    notices,
  ]);

  const meta: ReasonixMeta | null = useMemo(() => {
    const base: ReasonixMeta = currentProvider
      ? { label: currentProvider.name }
      : { label: "Claude" };
    // Only attach cwd when we have one — the StatusBar / TopBar
    // already render a "未选择工作目录" placeholder when `cwd` is
    // absent, so we don't want to override that with `undefined`.
    return cwd ? { ...base, cwd } : base;
  }, [currentProvider, cwd]);

  const state: ReasonixState = useMemo(
    () => ({
      items,
      running: isStreaming,
      meta,
      context: null,
      usage: null,
      balance: null,
      jobs: [],
      approval: null,
      ask: null,
      turnStartAt: isStreaming ? Date.now() : null,
      turnTokens: 0,
    }),
    [items, isStreaming, meta]
  );

  // === Dev hook: expose controller state for Playwright / devtools.
  // Lets tests verify what the controller "sees" without going
  // through DOM inspection alone.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__controllerState = { itemsLen: items.length, injectedLen: injectedItems.length, kindCounts: items.reduce<Record<string, number>>((acc, i) => { acc[i.kind] = (acc[i.kind] ?? 0) + 1; return acc; }, {}) };
  }, [items, injectedItems]);

  // Hoisted out of the useEffect so the catch block in
  // `send` can unlisten the listeners after a failed send.
  // The useEffect's cleanup function still owns the
  // unsubscribe call on unmount.
  let unlistenChunk: (() => void) | undefined;
  let unlistenEnd: (() => void) | undefined;

  useEffect(() => {
    const setupListeners = async () => {
      unlistenChunk = await listen<string>("ai-stream-chunk", (event) => {
        const raw = event.payload;
        // `parseStreamChunk` returns an array — a single
        // Claude Code assistant event with a mixed
        // `content: [thinking, text, tool_use]` array
        // produces three chunks in the right order, and
        // the legacy single-chunk paths (Hermes, Codex,
        // OpenCode, OpenClaw) produce one-element arrays.
        // The per-chunk pipeline in this switch was
        // already correct for one chunk; wrapping it in
        // a for-loop is a no-op for the old adapters and
        // the only change needed to support the new
        // wire format.
        const chunks = parseStreamChunk(raw);

        // Fallback: not JSON or unrecognized shape. The historical
        // behavior was to treat the whole line as text. Keep that
        // contract so adapters that haven't migrated to the new
        // event contract still render something visible.
        if (chunks.length === 0) {
          // T9: a stray `<thinking>...</thinking>` or
          // `<answer>...</answer>` block in a non-JSON line must
          // not leak into the transcript. The parser's structured
          // path already routes `thinking_delta` chunks to
          // `appendThinking`, so this strip is a safety net for
          // adapters that emit thinking inline as text.
        appendContent(stripSkillSuggest(stripThinkTags(raw)));
        return;
        }

        for (const parsed of chunks) {
        switch (parsed.kind) {
          case "text":
            // T9: same strip as the raw fallback above. The
            // parser's `thinking` kind already goes to
            // `appendThinking` below, so this only fires for
            // adapters that interleave plain text and inline
            // thinking in the same `text` event — Claude
            // streaming-protocol users, for example, when a
            // model emits `<answer>...</answer>` blocks inside
            // its text delta. Belt-and-braces: never trust the
            // wire to keep thinking and text on separate channels.
            // The first text chunk also closes the live
            // ThinkingDisplay card so the timer stops
            // ticking — `appendThinking` opened it on the
            // first `thinking_delta` and `finishThinking`
            // stamps the final duration here. The card is
            // kept around (status: "done") so the user can
            // still re-open it to read the reasoning.
            finishThinking();
            appendContent(stripSkillSuggest(stripThinkTags(parsed.text)));
            break;
          case "thinking":
            // Open the live ThinkingDisplay card on the
            // first thinking chunk. `beginThinking` is
            // idempotent (it does NOT reset `startTime` on
            // re-entry) so a wire-protocol shape with
            // multiple `content_block_start` events before
            // the first delta does not double-count elapsed
            // seconds.
            beginThinking();
            appendThinking(parsed.text);
            break;
          case "tool_call":
            addToolCall(parsed.tool);
            break;
          case "tool_response":
            addToolResponse({
              toolCallId: parsed.id,
              status: "success",
              result: parsed.result,
            });
            // Attach the result to the matching tool call so
            // the ToolCard body can render the actual output
            // (Codex `command_execution.aggregated_output`,
            // Claude `tool_result` body, generic payloads).
            // Without this, `updateToolCall` only flips the
            // status, and the body section stays empty —
            // a confusing "完成" chip with no payload
            // underneath.
            if (parsed.id) {
              updateToolCall(parsed.id, {
                status: "completed",
                result: parsed.result,
              });
            }
            break;
          case "plan":
            setPlan(parsed.plan);
            break;
          case "permission":
            setPermission({
              id: parsed.id,
              toolName: parsed.tool,
              args: parsed.args,
              status: "pending",
            });
            break;
          case "notice":
            // Hermes auth / network failure banner (T6). The
            // parser detected 🔐-prefixed or status-code+phrase
            // lines and surfaced them as a `notice` chunk so we
            // render them as a styled red banner rather than
            // folding them into the assistant message text.
            // `addNotice` is in the messageStore; it dedupes
            // identical consecutive lines so a retrying CLI
            // doesn't spam the transcript.
            addNotice(parsed.level, parsed.text);
            break;
          case "control":
            // message_start/stop/delta and content_block_stop are
            // protocol scaffolding; the end event itself is handled
            // in the dedicated `ai-stream-end` listener.
            break;
        }
        }
      });

      unlistenEnd = await listen("ai-stream-end", () => {
        // Snapshot the live per-turn state before we reset it, so
        // both the persisted message and the summary card reflect
        // what actually happened this turn.
        const conv = getCurrentConversation();
        const tcs = useMessageStore.getState().currentToolCalls;
        const plan = useMessageStore.getState().currentPlan;

        // Persist the live tool calls / plan onto the assistant
        // message so the transcript can render them as ToolCards /
        // plan markers on reload. Without this, the live LoomPanel
        // would show activity but the transcript would stay empty
        // after the user navigates away.
        if (conv && conv.messages.length > 0) {
          const lastMsg = conv.messages[conv.messages.length - 1];
          if (lastMsg.role === "assistant") {
            // If the CLI produced no text content (e.g. it errored
            // out before any text chunk landed, or its output
            // stream was empty for some other reason), leave a
            // visible placeholder in the transcript so the user
            // never stares at a silent empty bubble. The notice
            // channel above would have already shown the root
            // cause; this is the "the assistant bubble is not
            // actually empty" affordance.
            const fallback = lastMsg.content && lastMsg.content.length > 0
              ? lastMsg.content
              : "_(no response from CLI — see the red notice above for details)_";
            updateLastMessage({
              content: fallback,
              toolCalls: tcs.length > 0 ? tcs : lastMsg.toolCalls,
              plan: plan ?? lastMsg.plan,
            });
          }
        }

        if (conv) {
          const tally = buildArtifactSummary(tcs);
          if (hasAnyArtifact(tally)) {
            setSummary(conv.id, tally);
          }
          // Mirror the live turn into the cross-conversation
          // product_changes ledger. We do this here (not earlier)
          // because the Rust write is synchronous-ish and would slow
          // the streaming loop; once the turn is done the user is
          // already waiting for a final response, so a single batch
          // insert is invisible. Failures are caught inside the
          // store and demoted to a console warning — the live tally
          // above still works.
          const agentId =
            conv.metadata?.agentId ??
            useModelStore.getState().currentApp ??
            "claude";
          void useProductChangesStore
            .getState()
            .recordBatch(conv.id, agentId, tcs);
        }

        setStreaming(false);
        // Clear the per-turn state so the next `send()` starts clean
        // and the live LoomPanel collapses back to "no current
        // activity" (the transcript still shows what happened via
        // the persisted tool calls / plan above).
        resetCurrentStream();
      });
    };

    setupListeners().catch((err) => {
      // Vite dev (no Tauri shell) and edge cases where the IPC bridge
      // isn't ready will reject the listen() promise. The UI is built
      // around streaming events from the Rust backend, so there is
      // nothing to render when they are missing — stay silent instead
      // of crashing the whole component tree.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[reasonixAdapter] stream listeners unavailable:", err);
      }
    });
    return () => {
      unlistenChunk?.();
      unlistenEnd?.();
    };
  }, [
    getCurrentConversation,
    updateLastMessage,
    setStreaming,
    appendContent,
    appendThinking,
    addToolCall,
    addToolResponse,
    updateToolCall,
    setPlan,
    setPermission,
    setSummary,
    resetCurrentStream,
  ]);

  const send = useCallback(
    async (text: string) => {
      let conv = getCurrentConversation();
      if (!conv) {
        conv = createConversation();
      }

      // Pre-flight check — if the active CLI is not available
      // on $PATH, surface a clear, actionable error BEFORE we
      // add the user / assistant messages to the transcript.
      // The old behaviour let the bad request through to
      // `send_chat_message`, which spawned the binary, the
      // OS rejected the spawn, the user got a raw
      // "AI CLI exited with 1" with no install hint, and
      // then had to dig out the right tab / install command
      // themselves. Mirrors the AionUi
      // `useAgentReadinessCheck` flow which short-circuits
      // the same way.
      //
      // The check is a pure read of the `useAgentStore`
      // cache populated by `refreshAgentList` on mount;
      // it never spawns a child or blocks the UI thread.
      const cli = useModelStore.getState().currentApp;
      const registry = useAgentStore.getState().agents;
      const entry = registry.find((a) => a.id === cli);
      if (entry && !entry.available) {
        // Mirror the "no CLI" i18n string AionUi uses
        // (aionui/src/renderer/services/i18n/locales/zh-CN/settings.json:
        // `noCliDetected`). The Rust side never gets
        // involved here — the user gets a clear, localised
        // explanation without us having to spawn a child
        // that we already know will fail.
        const friendly = `${entry.display_name || cli} 不可用：请先在 “AI 助手” 面板安装并登录，或切换到其他引擎。`;
        useToastStore.getState().addToast({
          type: "error",
          message: friendly,
          duration: 6000,
        });
        return;
      }

      // Wipe any per-turn state carried over from a previous
      // interrupted stream. Without this, LoomPanel's tool/plan
      // sections would briefly show the previous turn's leftovers
      // before the new chunks overwrite them.
      resetCurrentStream();

      const userMessage = {
        id: generateId(),
        type: "text" as const,
        role: "user" as const,
        content: text,
        timestamp: Date.now(),
        position: "right" as const,
      };
      addMessageToCurrent(userMessage);

      const assistantMessage = {
        id: generateId(),
        type: "text" as const,
        role: "assistant" as const,
        content: "",
        timestamp: Date.now(),
        position: "left" as const,
      };
      addMessageToCurrent(assistantMessage);

      setStreaming(true);

      try {
        // Per-CLI mode + reasoning live in useComposerPrefsStore; the
        // Rust side (commands/ai.rs::stream_ai) reads them and forwards
        // to the matching adapter's build_stream_command, which is
        // what actually appends --permission-mode / --sandbox / --effort /
        // -c model_reasoning_effort= etc. We send null when the CLI
        // doesn't expose a spec so the adapter can fall back to its
        // own default.
        //
        // `projectPath` is the workspace the user picked from the
        // folder dialog (or restored from localStorage on mount).
        // The Rust side (commands/ai.rs::send_chat_message) uses
        // it two ways:
        //   1. real `Command::current_dir` on the spawned CLI, so
        //      any tools the CLI invokes (`Read` / `Edit` / `Bash`)
        //      actually operate on the project the user sees in
        //      the status bar;
        //   2. a `[cwd: ...]` line prepended to the prompt, as a
        //      redundant, model-visible hint.
        // Sending `null` here used to mean "let Claude run in
        // Tauri's launch CWD" — which is almost never what the
        // user wants and silently disabled Claude's ability to
        // touch the project they just opened. Always forward the
        // hook's `cwd` state, even if it is `undefined` (the Rust
        // side treats that as "no override, inherit parent CWD").
        // `openclawSession` is null for every non-OpenClaw
        // CLI; the Rust side ignores the field unless
        // `cli === "openclaw"`. The composer-side store
        // returns `null` when the user has not picked a
        // session yet, which the adapter translates into
        // "no flag emitted" — the CLI's own missing-
        // session error then surfaces through
        // friendlySendError.
        // `model` is read from `useModelStore.currentModelByCli`
        // (with per-CLI default fallback in
        // `effectiveModelForCli`). Empty string becomes `null`
        // on the wire so the Rust `StreamOptions::model` stays
        // `None` for CLIs that do not have a picker
        // (hermes / openclaw) — the adapters ignore the field
        // in that case, so passing `null` is harmless.
        const modelId = effectiveModelForCli(useModelStore.getState(), cli);
        // mode / reasoning / model are all read from the
        // composer prefs + model stores at send time. We pull
        // the maps once via `getState()` and hand them to the
        // resolvers so the data flow stays explicit (no
        // hidden `getState()` call inside the helper). The
        // store update happened at click time and the maps
        // are now in sync with the user's most recent pick.
        const composerState = useComposerPrefsStore.getState();
        // Read the selected provider's env vars (api_key, api_base)
        // from the model store. The provider preset system in
        // providerPresets.ts bundles env vars per provider (e.g.
        // DeepSeek's ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN);
        // we forward them as `env` so the spawned CLI connects to
        // the right endpoint. Empty when no provider is selected.
        const providerId = useModelStore.getState().currentProviderId;
        const provider = providerId
          ? useModelStore.getState().providers[providerId]
          : null;
        const env: Record<string, string> = {};
        if (provider) {
          if (provider.api_base) {
            // Map provider.api_base to the matching CLI env var.
            // Claude uses ANTHROPIC_BASE_URL, Codex uses
            // OPENAI_BASE_URL, Gemini uses GEMINI_BASE_URL.
            // The `cli` string tells us which one to set.
            if (cli === "claude" || cli === "claude-code") {
              env["ANTHROPIC_BASE_URL"] = provider.api_base;
            } else if (cli === "codex") {
              env["OPENAI_BASE_URL"] = provider.api_base;
            } else if (cli === "gemini") {
              env["GEMINI_BASE_URL"] = provider.api_base;
            }
          }
          if (provider.api_key) {
            if (cli === "claude" || cli === "claude-code") {
              env["ANTHROPIC_AUTH_TOKEN"] = provider.api_key;
            } else if (cli === "codex") {
              env["OPENAI_API_KEY"] = provider.api_key;
            } else if (cli === "gemini") {
              env["GEMINI_API_KEY"] = provider.api_key;
            }
          }
        }
        await invoke("send_chat_message", {
          cli,
          message: text,
          conversationId: conv.id,
          projectPath: cwd ?? null,
          mode: resolveModeId(cli as AppId, composerState.modeByCli),
          reasoning: resolveReasoningId(cli as AppId, composerState.reasoningByCli),
          model: modelId && modelId.length > 0 ? modelId : null,
          env: Object.keys(env).length > 0 ? env : null,
          openclawSession:
            cli === "openclaw" ? resolveOpenclawSession() : null,
        });
      } catch (error) {
        // The old behaviour folded the error string into the
        // assistant message with `appendContent`, which then
        // mixed it into the chat transcript where users would
        // scroll past it. T7 splits the surface: a transient
        // toast (top-right, auto-dismisses) for the immediate
        // signal, and a red notice banner inside the
        // transcript (T6's addNotice) so the failure stays
        // attached to the conversation when the toast fades.
        // Map the raw Rust error to a user-friendly message.
        // The Rust side returns either a raw OS error ("no
        // such file or directory") or a wrapped
        // `AI CLI exited with N` shape. Strip the wrapper
        // and show only the actionable part so the user
        // sees "<cli> 不可用 — ..." instead of a binary
        // exit code.
        const rawMessage =
          error instanceof Error ? error.message : String(error);
        // Two views of the same error: a short toast the user
        // can dismiss, and a fuller notice + assistant bubble
        // that carries Claude's actual stderr (auth / model /
        // network diagnostics) so the user can act on it.
        const friendlyMessage = friendlySendError(rawMessage, cli);
        // The toast caps at ~120 chars to stay readable; we
        // take the first line of the friendly message which
        // strips the embedded stderr tail when the message
        // is multi-line. The full detail stays in the notice
        // and the assistant bubble.
        const firstLine = friendlyMessage.split("\n")[0] ?? friendlyMessage;
        console.error("send_chat_message failed:", error, "raw=", rawMessage);
        useToastStore.getState().addToast({
          type: "error",
          message: `发送消息失败: ${firstLine}`,
          duration: 5000,
        });
        addNotice("error", `发送消息失败: ${friendlyMessage}`);
        // Write the failure into the assistant message itself so
        // it stays visible in the transcript even after the toast
        // fades. The earlier pre-flight check used
        // `useMessageStore.appendContent`, which writes to a
        // different array than the transcript reads — the user
        // would see an empty assistant bubble with the failure
        // only on a transient toast. `updateLastMessage` targets
        // `useConversationStore`, which is what the transcript
        // actually renders.
        const cur = getCurrentConversation();
        if (cur && cur.messages.length > 0) {
          const last = cur.messages[cur.messages.length - 1];
          if (last.role === "assistant") {
            updateLastMessage({
              content: `⚠️ 发送失败: ${friendlyMessage}\n\n请检查 CLI 是否已安装并登录,或在 “AI 助手” 面板切换可用的引擎。`,
            });
          }
        }
        // Unlisten the ai-stream-end listener so a late event
        // replay cannot clobber the error we just wrote. The
        // listener still has its own `⚠️ 发送失败:` marker
        // guard, so the unlisten is belt-and-braces — but it
        // also stops the listener from running any of its
        // other cleanup (setStreaming / resetCurrentStream) on
        // a phantom event, which would otherwise race the
        // catch block's own setStreaming(false).
        unlistenEnd?.();
        unlistenChunk?.();
        unlistenEnd = undefined;
        unlistenChunk = undefined;
        setStreaming(false);
      }
    },
    [
      getCurrentConversation,
      createConversation,
      addMessageToCurrent,
      setStreaming,
      resetCurrentStream,
      addNotice,
      cwd,
    ]
  );

  const cancel = useCallback(() => {
    // Stop the spinner immediately so the UI does not stay frozen
    // for the few hundred ms it takes the kill signal to round-trip
    // and the wait task to observe the child exit. The end event
    // handler will set streaming back to false (it's already false
    // here, so the call is a no-op), and the persisted transcript
    // will end at whatever the last completed chunk was.
    setStreaming(false);
    const conv = getCurrentConversation();
    if (!conv) return;
    // Fire-and-forget: a cancel that fails (e.g. the process already
    // exited) is fine — the registry returns false and the user
    // simply gets the natural "ai-stream-end" event instead.
    void invoke("cancel_ai", { sessionId: conv.id }).catch((err) => {
      // Backend unreachable in vite dev is the common case; demote
      // to console.warn so the console isn't spammed on every click.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn("[reasonixAdapter] cancel_ai failed:", err);
      } else {
        // eslint-disable-next-line no-console
        console.error("cancel_ai failed:", err);
      }
    });
  }, [setStreaming, getCurrentConversation]);

  const approve = useCallback(async (id: string, allow: boolean) => {
    if (allow) {
      await invoke("approve_permission", { id, remember: false });
    } else {
      await invoke("deny_permission", { id });
    }
  }, []);

  const newSession = useCallback(() => {
    createConversation();
  }, [createConversation]);

  const listSessions = useCallback(async () => {
    return conversations.map((c) => ({
      id: c.id,
      path: c.id,
      title: c.name || "未命名对话",
      preview: c.messages[0]?.content?.slice(0, 50),
      updatedAt: c.updatedAt || Date.now(),
      messageCount: c.messages.length,
      agentId: c.metadata?.agentId ?? "claude",
    }));
  }, [conversations]);

  const resumeSession = useCallback((path: string) => {
    selectConversation(path);
  }, [selectConversation]);

  const deleteSessionFn = useCallback((path: string) => {
    deleteConversation(path);
  }, [deleteConversation]);

  const renameSessionFn = useCallback(
    (path: string, title: string): boolean => {
      // The HistoryDrawer calls this with `editTitle.trim()` (see
      // src/components/layout/HistoryDrawer.tsx:104,111), so we
      // also re-trim defensively in case a future caller forgets.
      // An empty / whitespace-only title would otherwise produce
      // a blank header in the transcript, which the user
      // experience team has flagged as "worse than no rename".
      const trimmed = title.trim();
      if (trimmed.length === 0) return false;
      if (!conversations.some((c) => c.id === path)) return false;
      updateConversation(path, { name: trimmed });
      return true;
    },
    [conversations, updateConversation],
  );

  const pickWorkspace = useCallback(async (): Promise<string | null> => {
    // Backend (commands::projects::pick_workspace) pops the native
    // folder picker via tauri-plugin-dialog and returns
    // `Option<String>`. `None` means the user cancelled the dialog
    // (or no workspace is selectable on this platform), and we
    // treat that as a no-op — no toast, no error, just leave the
    // previous cwd in place. `Some(path)` updates both the React
    // state (so StatusBar / TopBar re-render immediately) and
    // localStorage (so the choice survives an app restart).
    try {
      const picked = await invoke<string | null>("pick_workspace");
      if (typeof picked === "string" && picked.length > 0) {
        setCwd(picked);
        writePersistedCwd(picked);
        return picked;
      }
      return null;
    } catch (err) {
      // The plugin only throws on hard failures (e.g. IPC broken);
      // surface to the console so the developer sees it in the dev
      // tools but keep the UI calm. The error toast pipeline is
      // owned by T7; we don't duplicate that here.
      console.error("pickWorkspace failed:", err);
      return null;
    }
  }, []);

  const setModelFn = useCallback(
    (id: string): boolean => {
      // The StatusBar's model menu (see ReasonixStatusBar.tsx)
      // shows two kinds of ids mixed together:
      //   1. Provider ids ("anthropic", "deepseek", …) — these
      //      map to entries in `useModelStore.providers` and
      //      should drive `switchProvider` (i.e. swap the
      //      base-URL / model for the underlying CLI).
      //   2. CLI / app ids ("claude", "codex", "gemini", …) —
      //      these map to a TopBar tab and drive
      //      `setCurrentApp` (i.e. switch which CLI the next
      //      `send_chat_message` actually spawns).
      // The previous implementation only logged the click; the
      // 0.x demo never reached the store. We now route to the
      // correct setter depending on which bucket the id falls
      // into, and return a boolean so a caller (e.g. an
      // upcoming settings panel) can detect a typo.
      const trimmed = id.trim();
      if (!trimmed) return false;
      if (providers[trimmed]) {
        switchProvider(trimmed);
        return true;
      }
      // Last-resort: treat the id as an app id (matches the
      // TopBar tab set in ReasonixApp). This keeps the menu
      // functional even before providers have been populated
      // (T10 wires that up via presets import).
      setCurrentApp(trimmed);
      return true;
    },
    [providers, switchProvider, setCurrentApp],
  );

  const setPlanFn = useCallback((_v: boolean) => {
    // TODO: 实现 Plan 模式
  }, []);

  const setBypassFn = useCallback((_v: boolean) => {
    // Intentional no-op: the "Bypass permissions" toggle was a
    // 0.x demo of the StatusBar API and never made it into the
    // product. The StatusBar no longer renders the toggle, and
    // `setBypass` is no longer exported from this controller. We
    // keep the local binding only because removing it would force
    // a downstream call-site change in any future migration —
    // touching that is out of scope for T1. The next person who
    // comes back to clean this up can delete the binding and the
    // return key together.
  }, []);

  const answerQuestion = useCallback((_id: string, _choices: string[]) => {}, []);

  const refreshMeta = useCallback(async () => {}, []);

  const rewind = useCallback((_turn: number, _scope?: string) => {}, []);

  return {
    state,
    send,
    cancel,
    approve,
    answerQuestion,
    setPlan: setPlanFn,
    setBypass: setBypassFn,
    newSession,
    listSessions,
    resumeSession,
    deleteSession: deleteSessionFn,
    renameSession: renameSessionFn,
    refreshMeta,
    pickWorkspace,
    rewind,
    setModel: setModelFn,
  };
}
