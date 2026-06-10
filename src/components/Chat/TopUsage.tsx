// Top usage bar — the thin horizontal strip between the topbar
// and the transcript. Inspired by the way aionui surfaces a
// model's context-window usage as a persistent, glanceable
// signal: model name on the left, fill bar in the middle, total
// token count + cost (when available) on the right.
//
// Three data sources, in priority order:
//   1. `useMessageStore.currentUsage` — populated by the streaming
//      controller's `usage_update` events when the CLI emits them.
//      This is the authoritative number while a turn is live.
//   2. A rough estimate derived from the current conversation's
//      message text (CJK chars weigh ~1.5 tokens each, ASCII chars
//      ~0.25 tokens each — a commonly-cited BPE heuristic for
//      Sonnet / 4o-grade tokenisers).
//   3. A 0-token placeholder when there is no conversation yet.
//
// The progress fill caps at the context-window budget for the
// active CLI. Defaults are conservative; the budget map is keyed
// by `AppId` so swapping CLI tabs shifts the bar's denominator.

import { useMemo } from "react";
import { Cpu, Zap, Clock, Coins } from "lucide-react";
import { useModelStore } from "@/stores/useModelStore";
import { useMessageStore } from "@/stores/messageStore";
import { useConversationStore } from "@/stores/conversationStore";
import { useReasonixController } from "@/lib/reasonixAdapter";

// Per-CLI context-window budget. Canonical advertised limits,
// rounded down to a friendly number. Keeping a single source of
// truth here means the bar can never report a fill > 100% unless
// the user has actually exceeded the model limit (we clamp via
// `Math.min` at render time).
const CONTEXT_BUDGET: Record<string, number> = {
  claude: 200_000,
  codex: 200_000,
  gemini: 1_000_000,
  opencode: 128_000,
  openclaw: 128_000,
  hermes: 128_000,
};

const DEFAULT_BUDGET = 128_000;

// Pick a displayable model name. Priority:
//   1. `ANTHROPIC_MODEL` / `CODEX_MODEL` / etc. on the active
//      provider's settingsConfig (the user-configured override).
//   2. The provider's `name` field (e.g. "Anthropic", "DeepSeek").
//   3. The CLI id as a last resort.
function resolveModelName(
  cli: string,
  providerName: string | undefined,
  modelOverride: string | undefined,
): string {
  if (modelOverride && modelOverride.length > 0) return modelOverride;
  if (providerName && providerName.length > 0) return providerName;
  return cli;
}

// Rough token estimate. CJK characters weigh closer to 1.5
// tokens on Claude / GPT-4 family tokenisers; ASCII weighs ~0.25.
// The goal is a glanceable fill, not a billing-grade number — the
// streaming controller's `currentUsage` overrides this when present.
function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff)
    ) {
      cjk++;
    }
  }
  const nonCjk = text.length - cjk;
  return Math.ceil(cjk * 1.5 + nonCjk / 4);
}

function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 10_000) return `${(n / 1_000).toFixed(2)}k`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function TopUsage() {
  const cli = useModelStore((s) => s.currentApp);
  const providers = useModelStore((s) => s.providers);
  const currentProviderId = useModelStore((s) => s.currentProviderId);
  const currentUsage = useMessageStore((s) => s.currentUsage);
  const isStreaming = useMessageStore((s) => s.isStreaming);
  const currentConversationId = useConversationStore(
    (s) => s.currentConversationId,
  );
  const conversations = useConversationStore((s) => s.conversations);

  // The status bar at the bottom of the page already computes a
  // `turnStartAt` for the active turn; rather than duplicate that
  // logic we read the controller's `state` so the top usage and
  // bottom status stay in lockstep.
  const { state } = useReasonixController();
  const turnStartAt = state.turnStartAt;

  const provider = currentProviderId ? providers[currentProviderId] : undefined;
  const settings = provider?.settingsConfig as
    | Record<string, string>
    | undefined;
  const modelOverride =
    settings?.ANTHROPIC_MODEL ??
    settings?.CODEX_MODEL ??
    settings?.GEMINI_MODEL ??
    settings?.OPENCODE_MODEL ??
    settings?.OPENCLAW_MODEL ??
    settings?.HERMES_MODEL;

  const modelName = resolveModelName(cli, provider?.name, modelOverride);

  const budget = CONTEXT_BUDGET[cli] ?? DEFAULT_BUDGET;

  // Tokens used right now. `currentUsage` wins while streaming;
  // otherwise we estimate from the conversation's persisted
  // message text so the bar still moves as the user scrolls
  // history.
  const usedTokens = useMemo(() => {
    if (currentUsage) {
      return (
        currentUsage.totalTokens ??
        (currentUsage.inputTokens ?? 0) + (currentUsage.outputTokens ?? 0)
      );
    }
    if (!currentConversationId) return 0;
    const conv = conversations.find((c) => c.id === currentConversationId);
    if (!conv) return 0;
    let total = 0;
    for (const m of conv.messages) {
      total += estimateTokens(m.content || "");
      if (m.thinking) total += estimateTokens(String(m.thinking));
    }
    return total;
  }, [currentUsage, currentConversationId, conversations]);

  const fillPct = Math.max(0, Math.min(100, (usedTokens / budget) * 100));

  // Cost: only show when the streaming controller reported a
  // dollar amount. The estimate path can't manufacture a price
  // without a per-model rate table, and inventing one would
  // mislead the user.
  const cost = currentUsage?.cost;
  const hasCost = typeof cost === "number" && cost > 0;

  // Elapsed-time label for the right edge. Only relevant while
  // the turn is live; we read the controller's `turnStartAt` so
  // the timer ticks the same way the bottom status bar does.
  const elapsedMs = turnStartAt ? Date.now() - turnStartAt : 0;
  const showElapsed = isStreaming && Boolean(turnStartAt);

  return (
    <div className="top-usage" role="status" aria-label="当前模型用量">
      <span className="top-usage__model" title={modelName}>
        <Cpu size={11} className="top-usage__icon" />
        <span className="top-usage__model-name">{modelName}</span>
      </span>

      <div className="top-usage__bar" aria-hidden="true">
        <div
          className="top-usage__fill"
          style={{ width: `${fillPct}%` }}
          data-fill={fillPct >= 90 ? "high" : fillPct >= 60 ? "mid" : "ok"}
        />
      </div>

      <span
        className="top-usage__tokens"
        title={`${usedTokens} tokens of ${budget} budget`}
      >
        <Zap size={10} className="top-usage__icon" />
        {formatTokens(usedTokens)}
        <span className="top-usage__sep">/</span>
        {formatTokens(budget)}
      </span>

      <span className="top-usage__right">
        {hasCost && (
          <span className="top-usage__cost" title="本次会话累计花费">
            <Coins size={10} className="top-usage__icon" />
            {formatCost(cost!)}
          </span>
        )}
        {showElapsed && (
          <span className="top-usage__elapsed" title="本轮已耗时">
            <Clock size={10} className="top-usage__icon" />
            {Math.max(0, Math.floor(elapsedMs / 1000))}s
          </span>
        )}
      </span>
    </div>
  );
}
