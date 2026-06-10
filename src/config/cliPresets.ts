/**
 * Per-CLI model catalog. Drives the composer's Model dropdown
 * and the reasoning dropdown's "is this option valid for the
 * current model?" gate. Modeled after cc-switch's
 * `Provider.models` table
 * (https://github.com/bestruirui/cc-switch) — each CLI gets its
 * own list of models so switching tabs actually changes what
 * you can pick, instead of showing the same flat "Claude"
 * catalog on every tab.
 *
 * `supportsReasoning` is the key bit that wires the user's
 * two complaints together:
 *   1. "推理模式和模型没有联动" — when a model doesn't support
 *      reasoning (e.g. `gemini-2.5-flash` or `claude-haiku-4`),
 *      the reasoning dropdown collapses to a no-op; when it
 *      does, the dropdown shows the CLI's full reasoning
 *      ladder. The composer reads this flag at render time so
 *      the link is immediate, not deferred to send time.
 *   2. "不同平台可以配置不同的模型" — every CLI has its own
 *      list keyed by `AppId`. The `claude-code` legacy id
 *      inherits the claude list so the old top-tab peer stays
 *      in lockstep with the canonical one.
 */

import type { AppId } from "../shared/types";

export interface ModelOption {
  /**
   * Stable id used as the React `key`, persisted across
   * reloads, and forwarded verbatim to the CLI flag / env
   * (e.g. `ANTHROPIC_MODEL=claude-sonnet-4.5` or
   * `codex exec -m gpt-5`). Changing an id is a breaking
   * change for any saved selection.
   */
  id: string;
  /** Short label shown in the dropdown row. */
  label: string;
  /** Optional muted description under the label. */
  description?: string;
  /**
   * Whether the model has a reasoning knob the user can turn
   * from the composer. When `false` the reasoning dropdown
   * collapses to "(本模型不支持)" so the link the user asked
   * for is visible without a hidden state.
   *
   * Defaults to `true` for any model the user is likely to
   * reach for on a thinking-enabled CLI. Set `false` for
   * cheap / fast / flash-class models whose vendor spec says
   * "no reasoning".
   */
  supportsReasoning?: boolean;
}

/** Catalog of models per CLI. */
export const CLI_MODELS: Record<AppId, ModelOption[]> = {
  claude: [
    {
      id: "claude-sonnet-4.5",
      label: "Sonnet 4.5",
      description: "均衡,默认推荐",
      supportsReasoning: true,
    },
    {
      id: "claude-opus-4",
      label: "Opus 4",
      description: "推理更强,慢",
      supportsReasoning: true,
    },
    {
      id: "claude-haiku-4",
      label: "Haiku 4",
      description: "快,无推理",
      supportsReasoning: false,
    },
    {
      id: "claude-sonnet-4",
      label: "Sonnet 4",
      description: "上一代主力",
      supportsReasoning: true,
    },
  ],
  codex: [
    {
      id: "gpt-5",
      label: "GPT-5",
      description: "OpenAI 最新主力",
      supportsReasoning: true,
    },
    {
      id: "gpt-5-mini",
      label: "GPT-5 mini",
      description: "更快,弱推理",
      supportsReasoning: true,
    },
    {
      id: "gpt-5-nano",
      label: "GPT-5 nano",
      description: "最便宜",
      supportsReasoning: false,
    },
    {
      id: "o4-mini",
      label: "o4-mini",
      description: "推理模型",
      supportsReasoning: true,
    },
    {
      id: "o3",
      label: "o3",
      description: "推理模型 (上代)",
      supportsReasoning: true,
    },
  ],
  gemini: [
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      description: "强,无推理参数",
      supportsReasoning: false,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      description: "快,无推理参数",
      supportsReasoning: false,
    },
    {
      id: "gemini-2.0-flash",
      label: "Gemini 2.0 Flash",
      description: "上一代快模型",
      supportsReasoning: false,
    },
  ],
  opencode: [
    // opencode is unverified on this machine; we still ship a
    // single placeholder so the dropdown isn't empty if the
    // user installs opencode and clicks the tab. The
    // placeholder id "default" is the value the upstream
    // opencode CLI uses when no `-m` is passed.
    {
      id: "default",
      label: "(使用 CLI 默认)",
      description: "opencode 协议未验证",
      supportsReasoning: false,
    },
  ],
  openclaw: [],
  hermes: [],
  // Legacy alias kept in lockstep with the canonical claude
  // entry (same binary, same flags). Adding a duplicate list
  // here would mean two sources of truth that could drift; the
  // helper `modelsForCli` returns this list when asked for
  // `claude-code`.
  "claude-code": [],
};

/**
 * Default model per CLI — the value the composer falls back to
 * when the user has not picked anything yet. Returning `""`
 * means "do not pass any `-m` / `ANTHROPIC_MODEL` hint", which
 * the adapter treats as "let the CLI decide" (the right
 * behaviour for hermes / openclaw whose CLIs own their own
 * model config).
 */
export const CLI_DEFAULT_MODEL: Record<AppId, string> = {
  claude: "claude-sonnet-4.5",
  codex: "gpt-5",
  gemini: "gemini-2.5-pro",
  opencode: "default",
  openclaw: "",
  hermes: "",
  "claude-code": "claude-sonnet-4.5",
};

/**
 * Resolve the model list for a CLI. Always returns an array —
 * an empty array means "the CLI does not expose a model
 * picker" (e.g. openclaw / hermes), and the composer hides
 * the dropdown rather than showing an empty one. The
 * `claude-code` legacy id piggybacks on the canonical claude
 * list to keep the old top-tab peer in lockstep.
 */
export function modelsForCli(cli: AppId): ModelOption[] {
  if (cli === "claude-code") return CLI_MODELS.claude;
  return CLI_MODELS[cli] ?? [];
}

/**
 * Resolve the default model for a CLI. Empty string means "do
 * not pass any model hint" (hermes / openclaw).
 */
export function defaultModelForCli(cli: AppId): string {
  if (cli === "claude-code") return CLI_DEFAULT_MODEL.claude;
  return CLI_DEFAULT_MODEL[cli] ?? "";
}

/**
 * Look up a single model by id. Returns `null` when the id is
 * unknown so callers can fall back to the CLI default instead
 * of crashing on a stale `localStorage` value.
 */
export function findModel(cli: AppId, modelId: string | null | undefined): ModelOption | null {
  if (!modelId) return null;
  return modelsForCli(cli).find((m) => m.id === modelId) ?? null;
}

/**
 * Whether the given model supports a reasoning knob the user
 * can flip from the composer. Defaults to `true` for any
 * model that has no explicit flag (forward-compat: new
 * models we add later that are not listed yet still treat as
 * reasoning-capable) and `false` for known no-reasoning ones
 * (the cheap / fast family on every vendor).
 */
export function modelSupportsReasoning(
  cli: AppId,
  modelId: string | null | undefined,
): boolean {
  const m = findModel(cli, modelId);
  if (!m) return true; // unknown → assume yes, let the dropdown show
  return m.supportsReasoning ?? true;
}
