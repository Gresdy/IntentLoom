/**
 * MessageAvailableCommands — AionUi `MessageAvailableCommands` port.
 *
 * AionUi emits an `available_commands` message when an ACP-based
 * agent (Claude / Codex / Gemini / etc.) reports the slash
 * commands it natively supports. AionUi renders them as a
 * collapsible "可用命令" card so the user can pick from the
 * full list without retyping from the composer.
 *
 * IntentLoom already has 14 hard-coded slash commands in
 * `SlashCommandMenu.tsx`. This component renders the CLI-emitted
 * list as a small inline card — a useful extra affordance the
 * user can read while deciding which command to invoke, and a
 * perfect symmetric counterpart to the existing
 * `MessageSkillSuggest` (which we already render the same way).
 *
 * The component is intentionally small and reuses the existing
 * `.notice` + `.chip` chrome so the visual style stays
 * consistent with the rest of the chat (the user explicitly
 * said "整体 UI 风格不要动"). We don't reach for
 * AionUi's `AionCollapse` / `CollapsibleContent` because those
 * are arco-design primitives that would change the look.
 *
 * AionUi reference:
 *   src/renderer/pages/conversation/Messages/acp/
 *   MessageAvailableCommands.tsx
 *   src/common/chat/chatLib.ts (IMessageAvailableCommands)
 */

import { useState } from "react";
import { ChevronRight, Hammer } from "lucide-react";

export interface AvailableCommand {
  name: string;
  description: string;
  hint?: string;
}

export interface MessageAvailableCommandsProps {
  id: string;
  commands: AvailableCommand[];
  agentId?: string;
}

export function MessageAvailableCommands({
  id,
  commands,
  agentId,
}: MessageAvailableCommandsProps) {
  // Default-collapsed so the list doesn't push the transcript
  // around when the model emits a long list. A click on the
  // header reveals the full table.
  const [open, setOpen] = useState(false);
  if (!commands || commands.length === 0) return null;
  return (
    <div
      className="notice notice--info message-available-commands"
      data-testid="message-available-commands"
      data-message-id={id}
      data-agent-id={agentId}
    >
      <button
        type="button"
        className="message-available-commands__header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="message-available-commands-toggle"
      >
        <Hammer size={12} className="ilo-fg-accent" />
        <span className="message-available-commands__title">
          可用命令（{commands.length}）
        </span>
        <ChevronRight
          size={12}
          className={
            "message-available-commands__chevron" +
            (open ? " message-available-commands__chevron--open" : "")
          }
        />
      </button>
      {open && (
        <ul
          className="message-available-commands__list"
          data-testid="message-available-commands-list"
        >
          {commands.map((cmd) => (
            <li
              key={cmd.name}
              className="message-available-commands__item"
              data-testid="message-available-commands-item"
            >
              <code className="message-available-commands__name">/{cmd.name}</code>
              <span className="message-available-commands__desc">
                {cmd.description}
                {cmd.hint && (
                  <span className="message-available-commands__hint">
                    {" "}
                    ({cmd.hint})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
