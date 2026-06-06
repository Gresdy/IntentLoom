import { useCallback, useMemo, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "./tauri";
import { useConversationStore } from "@/stores/conversationStore";
import { useMessageStore } from "@/stores/messageStore";
import { useModelStore } from "@/stores/useModelStore";
import { resolveModeId, resolveReasoningId } from "@/stores/useComposerPrefsStore";
import { buildArtifactSummary, hasAnyArtifact } from "@/lib/artifactTally";
import type { ArtifactTally } from "@/lib/artifactTally";
import { useProductChangesStore } from "@/lib/useProductChanges";
import { parseStreamChunk } from "@/lib/streamChunkParser";
import { useToastStore } from "@/lib/useToast";
import type { ToolCall } from "@/types/message";

export type Mode = "normal" | "plan" | "yolo";

export type ReasonixItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming?: boolean; reasoning?: string }
  | { kind: "tool"; id: string; name: string; args: any; status: string; result?: any; diff?: any[]; kind2?: string }
  | { kind: "phase"; id: string; text: string }
  | { kind: "notice"; id: string; level: string; text: string }
  | { kind: "summary"; id: string; tally: ArtifactTally };

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
function toolCallToItem(tc: ToolCall, idSuffix: string): ReasonixItem {
  return {
    kind: "tool",
    id: idSuffix,
    name: tc.name,
    args: tc.arguments,
    status: tc.status,
    result: tc.result,
    diff: tc.diff,
    kind2: tc.kind,
  };
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
    addNotice,
    setSummary,
    resetCurrentStream,
  } = useMessageStore();

  const currentConversation = useMemo(() => {
    return conversations.find((c) => c.id === currentConversationId);
  }, [conversations, currentConversationId]);

  const conversationMessages = currentConversation?.messages ?? [];

  const items: ReasonixItem[] = useMemo(() => {
    const result: ReasonixItem[] = [];

    for (const msg of conversationMessages) {
      if (msg.role === "user") {
        result.push({ kind: "user", id: msg.id, text: msg.content });
      } else if (msg.role === "assistant") {
        result.push({
          kind: "assistant",
          id: msg.id,
          text: msg.content,
          streaming: false,
          reasoning: msg.thinking,
        });
        // Persisted tool calls on the assistant message become ToolCards
        // in the transcript. W3 of the-loom-as-product.md: this is what
        // makes "文件改动内联展示" work after the stream ends — the
        // live stream lights up LoomPanel, the persisted mirror shows
        // the same content inline in chat history.
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            result.push(toolCallToItem(tc, `${msg.id}-tc-${tc.id}`));
          }
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
        });
        // Live tool cards: the in-flight tool calls from messageStore.
        // After stream-end these get persisted onto the assistant
        // message (see ai-stream-end handler) and the live snapshot
        // resets, so we don't double-render.
        for (const tc of currentToolCalls) {
          result.push(toolCallToItem(tc, `live-tc-${tc.id}`));
        }
      }
    }

    if (currentConversationId) {
      const tally = summaryByConversation[currentConversationId];
      if (tally && hasAnyArtifact(tally)) {
        result.push({
          kind: "summary",
          id: `summary-${currentConversationId}`,
          tally,
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
      result.push({ kind: "notice", id: n.id, level: n.level, text: n.text });
    }

    return result;
  }, [
    conversationMessages,
    isStreaming,
    currentThinking,
    currentToolCalls,
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

  useEffect(() => {
    let unlistenChunk: (() => void) | undefined;
    let unlistenEnd: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenChunk = await listen<string>("ai-stream-chunk", (event) => {
        const raw = event.payload;
        const parsed = parseStreamChunk(raw);

        // Fallback: not JSON or unrecognized shape. The historical
        // behavior was to treat the whole line as text. Keep that
        // contract so adapters that haven't migrated to the new
        // event contract still render something visible.
        if (!parsed) {
          appendContent(raw);
          return;
        }

        switch (parsed.kind) {
          case "text":
            appendContent(parsed.text);
            break;
          case "thinking":
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
            if (parsed.id) {
              updateToolCall(parsed.id, { status: "completed" });
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
            updateLastMessage({
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
        const cli = useModelStore.getState().currentApp;
        await invoke("send_chat_message", {
          cli,
          message: text,
          conversationId: conv.id,
          projectPath: null,
          mode: resolveModeId(cli as Parameters<typeof resolveModeId>[0]),
          reasoning: resolveReasoningId(cli as Parameters<typeof resolveReasoningId>[0]),
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
        const message =
          error instanceof Error ? error.message : String(error);
        console.error("send_chat_message failed:", error);
        useToastStore.getState().addToast({
          type: "error",
          message: `发送消息失败: ${message}`,
          duration: 5000,
        });
        addNotice("error", `发送消息失败: ${message}`);
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
