/**
 * SlashCommandMenu — AionUi `slash` command popover port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageTips.tsx
 *   packages/desktop/src/common/chat/slash/...
 *
 * A floating popover that appears below the composer when the user
 * types `/` followed by a query. Up/Down arrows change the active
 * item; Tab/Enter completes the active item; Escape closes the menu;
 * clicking an item completes it. The popover is a controlled
 * component — the parent owns the query text and the open state.
 *
 * IntentLoom port notes:
 *   - The default `commands` list mirrors the four hard-coded entries
 *     in the original `ReasonixComposer.tsx`. Callers can override
 *     with their own list (e.g. for per-CLI extensions).
 *   - `onPick(name)` is the only required callback. The parent
 *     decides what to do with the picked command — for the default
 *     `/model /memory /plan` set, the parent just pastes
 *     `"/<name> "` back into the textarea.
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Zap, Lightbulb, Hash, ListChecks, History, Bot, FileCode } from "lucide-react";

export interface SlashCommand {
  name: string;
  desc: string;
  icon: ReactNode;
  /**
   * Optional secondary names the user can type instead of `name`.
   * Match is case-insensitive on `name` or any alias. Used to keep
   * muscle memory from AionUi (`/clear`, `/init`, `/compact`...) and
   * Claude Code (`/status`, `/agents`) working without expanding the
   * menu UI.
   */
  aliases?: string[];
  /**
   * Hint shown after the command name in the menu, e.g. " [query]".
   * Pure presentational — the composer does not enforce syntax.
   */
  argHint?: string;
  /**
   * If `true`, the composer fires the command immediately on pick
   * (no placeholder text after the name). If `false`/omitted, the
   * composer pastes "/<name> " so the user can add arguments
   * before pressing Enter.
   */
  runOnPick?: boolean;
  /**
   * "builtin" → handled by ReasonixApp or core adapter.
   * "passthrough" → pasted as plain text into the LLM (no special
   * handler). Default is "builtin".
   */
  kind?: "builtin" | "passthrough";
}

export const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  // ── Conversation control ──
  { name: "help", desc: "查看所有 slash 命令", icon: <Lightbulb size={12} />, runOnPick: true, aliases: ["?", "h"] },
  { name: "clear", desc: "清空当前会话", icon: <Hash size={12} />, runOnPick: true, aliases: ["reset"] },
  { name: "compact", desc: "压缩前 N 轮对话上下文", icon: <Hash size={12} />, argHint: "[n]" },
  { name: "history", desc: "打开会话历史面板", icon: <History size={12} />, runOnPick: true, aliases: ["hist"] },
  { name: "export", desc: "导出会话为 Markdown 文件", icon: <FileCode size={12} />, runOnPick: true },
  { name: "share", desc: "复制会话摘要到剪贴板", icon: <FileCode size={12} />, runOnPick: true },

  // ── AI runtime ──
  { name: "model", desc: "切换当前 CLI 的模型", icon: <Zap size={12} />, argHint: "<id>" },
  { name: "memory", desc: "打开记忆面板（设置 → memory）", icon: <Lightbulb size={12} />, runOnPick: true },
  { name: "plan", desc: "切换模式 (normal / plan / yolo)", icon: <Hash size={12} /> },
  { name: "tasks", desc: "查看待办列表", icon: <ListChecks size={12} />, runOnPick: true },
  { name: "agent", desc: "切换 Agent (Claude / Codex / …)", icon: <Bot size={12} />, argHint: "<id>" },
  { name: "agents", desc: "列出所有可用的 Agent", icon: <Bot size={12} />, runOnPick: true },
  { name: "status", desc: "展示 CLI / 模型 / 用量", icon: <Zap size={12} />, runOnPick: true, aliases: ["stat"] },
  { name: "tools", desc: "切换工具可用性", icon: <ListChecks size={12} />, runOnPick: true },

  // ── Workspace ──
  { name: "init", desc: "为当前工作目录生成 CLAUDE.md / AGENTS.md", icon: <FileCode size={12} />, runOnPick: true },
];

export interface SlashCommandMenuProps {
  query: string;
  active: number;
  onActiveChange: (index: number) => void;
  onPick: (cmd: SlashCommand) => void;
  commands?: SlashCommand[];
  /** Max items to show. Default 8. */
  maxItems?: number;
}

export function SlashCommandMenu({
  query,
  active,
  onActiveChange,
  onPick,
  commands = DEFAULT_SLASH_COMMANDS,
  maxItems = 8,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Clamp `active` whenever the matches shrink so the keyboard
  // cursor never lands on a now-stale index.
  const matches = commands
    .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, maxItems);

  useEffect(() => {
    if (active >= matches.length) onActiveChange(0);
    // We intentionally only re-clamp on length changes; doing it
    // on every render would fight a user who's mid-arrow-press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length]);

  if (matches.length === 0) return null;

  return (
    <div className="slashmenu" role="listbox" ref={listRef} data-testid="slash-command-menu">
      {matches.map((cmd, i) => (
        <div
          key={cmd.name}
          role="option"
          aria-selected={i === active}
          className={`slashmenu__item ${i === active ? "slashmenu__item--active" : ""}`}
          onMouseEnter={() => onActiveChange(i)}
          onMouseDown={(e) => e.preventDefault() /* keep textarea focused */}
          onClick={() => onPick(cmd)}
          data-testid={`slash-command-${cmd.name}`}
        >
          <span className="slashmenu__icon">{cmd.icon}</span>
          <span className="slashmenu__name">/{cmd.name}</span>
          <span className="slashmenu__desc">{cmd.desc}</span>
        </div>
      ))}
    </div>
  );
}

export default SlashCommandMenu;
