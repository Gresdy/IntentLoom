// Per-CLI capability map. Each entry describes the *real* flags a given
// local CLI exposes for permission/mode and (optionally) reasoning effort.
// Sourced from the `--help` text of each binary on 2026-06-05:
//
//   - claude  : `--permission-mode <m>` and `--effort <low|medium|high|xhigh|max>`
//   - codex   : `--sandbox <read-only|workspace-write|danger-full-access>` and
//               `-c model_reasoning_effort=<minimal|low|medium|high|xhigh>`
//   - gemini  : `--approval-mode <default|plan|auto_edit|yolo>` (no reasoning flag)
//   - hermes  : only a boolean `--yolo`; no dropdown
//   - openclaw: `openclaw agent run --help` does not expose a comparable flag
//   - opencode: not installed locally; no dropdown until we verify the help
//
// The point of this file is to keep the composer dropdown in lockstep with
// what each CLI actually accepts — not to invent a "mode" that only the UI
// knows about. When a CLI is missing an entry, the dropdown is hidden and
// the call site falls back to the CLI's defaults.

import type { AppId } from "../shared/types";

export type CliOption = {
  /** Stable id used as the React `key` and as the persisted selection. */
  id: string;
  /** Short label shown in the dropdown row. */
  label: string;
  /** Optional longer description shown muted under the label. */
  description?: string;
};

export type ModeSpec = {
  /**
   * Template used to build the argv fragment. `{value}` is replaced with
   * the option's `value` (or its `id` if no explicit value is given).
   * For Codex the template uses `--sandbox {value}`; for Gemini
   * `--approval-mode {value}`; for Claude `--permission-mode {value}`.
   */
  flagTemplate: string;
  /** Id of the option that's active when the user hasn't picked one. */
  defaultId: string;
  options: CliOption[];
};

export type ReasoningSpec = {
  /** Same template rules as `ModeSpec.flagTemplate`. */
  flagTemplate: string;
  defaultId: string;
  options: CliOption[];
};

export type CliCapabilities = {
  modes?: ModeSpec;
  reasoning?: ReasoningSpec;
};

const CLAUDE_MODES: ModeSpec = {
  flagTemplate: "--permission-mode {value}",
  defaultId: "default",
  options: [
    { id: "default", label: "Default", description: "正常提问" },
    { id: "plan", label: "Plan", description: "只读 + 输出实施计划" },
    { id: "acceptEdits", label: "Accept Edits", description: "自动接受文件编辑" },
    { id: "dontAsk", label: "Don't Ask", description: "不在工具调用时确认" },
    { id: "bypassPermissions", label: "Bypass (YOLO)", description: "跳过所有权限检查" },
  ],
};

const CLAUDE_REASONING: ReasoningSpec = {
  flagTemplate: "--effort {value}",
  defaultId: "high",
  options: [
    { id: "low", label: "低" },
    { id: "medium", label: "中" },
    { id: "high", label: "高" },
    { id: "xhigh", label: "超高" },
    { id: "max", label: "Max" },
  ],
};

const CODEX_MODES: ModeSpec = {
  flagTemplate: "--sandbox {value}",
  defaultId: "read-only",
  options: [
    { id: "read-only", label: "Read Only", description: "只读沙箱" },
    { id: "workspace-write", label: "Workspace Write", description: "允许工作区内写" },
    { id: "danger-full-access", label: "Full Access (YOLO)", description: "跳过沙箱" },
  ],
};

const CODEX_REASONING: ReasoningSpec = {
  // Codex reasoning is set via `-c <key>=<value>`; the value goes after `=`.
  flagTemplate: "-c model_reasoning_effort={value}",
  defaultId: "medium",
  options: [
    { id: "minimal", label: "极低" },
    { id: "low", label: "低" },
    { id: "medium", label: "中" },
    { id: "high", label: "高" },
    { id: "xhigh", label: "超高" },
  ],
};

const GEMINI_MODES: ModeSpec = {
  flagTemplate: "--approval-mode {value}",
  defaultId: "default",
  options: [
    { id: "default", label: "Default", description: "工具调用前确认" },
    { id: "plan", label: "Plan", description: "只读模式" },
    { id: "auto_edit", label: "Auto Edit", description: "自动批准编辑类工具" },
    { id: "yolo", label: "YOLO", description: "自动批准所有工具" },
  ],
};

export const CLI_CAPABILITIES: Record<AppId, CliCapabilities> = {
  claude: { modes: CLAUDE_MODES, reasoning: CLAUDE_REASONING },
  codex: { modes: CODEX_MODES, reasoning: CODEX_REASONING },
  gemini: { modes: GEMINI_MODES },
  // "claude-code" is the legacy tab id; functionally identical to
  // "claude" (same binary, same flags). Keeping it in lockstep avoids
  // a second source of truth for the same adapter.
  "claude-code": { modes: CLAUDE_MODES, reasoning: CLAUDE_REASONING },
  // The remaining CLIs don't expose a comparable flag today; the
  // composer hides the dropdown when the spec is missing.
  hermes: {},
  openclaw: {},
  opencode: {},
};

export function getModeSpec(cli: AppId): ModeSpec | undefined {
  return CLI_CAPABILITIES[cli]?.modes;
}

export function getReasoningSpec(cli: AppId): ReasoningSpec | undefined {
  return CLI_CAPABILITIES[cli]?.reasoning;
}

/**
 * Build the argv fragment for the selected option. Returns `[]` when
 * the CLI doesn't have a spec or the option id is missing — callers
 * should silently drop the fragment rather than fail.
 */
export function renderFlag(
  spec: { flagTemplate: string; defaultId: string; options: CliOption[] } | undefined,
  optionId: string | null,
): string[] {
  if (!spec) return [];
  const opt =
    spec.options.find((o) => o.id === optionId) ??
    spec.options.find((o) => o.id === spec.defaultId);
  if (!opt) return [];
  const value = (opt as CliOption & { value?: string }).value ?? opt.id;
  const rendered = spec.flagTemplate.replace(/\{value\}/g, value).trim();
  if (!rendered) return [];
  if (rendered.startsWith("-c ")) {
    // `-c key=value` is a single argv token; keep it intact.
    return [rendered];
  }
  if (rendered.includes(" ")) {
    return rendered.split(/\s+/);
  }
  return [rendered];
}
