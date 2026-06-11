/**
 * MessageSkillSuggest + SkillSuggestCard — AionUi port.
 *
 * Originally from
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/MessageSkillSuggest.tsx
 *   packages/desktop/src/renderer/pages/conversation/Messages/components/SkillSuggestCard.tsx
 *
 * When the model wants to recommend a Skill to the user
 * (e.g. "you should try /code-review"), the gateway emits a
 * `skill_suggest` artifact. The card shows the skill's name and
 * description, with two actions: "使用" (consume the suggestion —
 * tells the controller to inject the skill's content as a system
 * prompt) and "稍后" (dismiss).
 *
 * IntentLoom port notes:
 *   - The persistence is local: dismissing flips a local state, not
 *     a backend call, because IntentLoom doesn't have the AionUi
 *     `ipcBridge.conversation.skillSuggest` channel yet. The card is
 *     ready to wire the moment the channel exists.
 *   - The `content` field is rendered read-only in a small <pre>
 *     block so the user can preview the skill before adopting it.
 */

import { useState } from "react";
import { Sparkles, Check, X, ChevronDown, ChevronRight } from "lucide-react";

export interface MessageSkillSuggestProps {
  id: string;
  name: string;
  description: string;
  content?: string;
  agentId?: string;
  onAccept?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function MessageSkillSuggest(props: MessageSkillSuggestProps) {
  const { id, name, description, content, agentId, onAccept, onDismiss } = props;
  const [dismissed, setDismissed] = useState(false);
  const [showContent, setShowContent] = useState(false);

  if (dismissed) return null;

  const handleAccept = () => {
    onAccept?.(id);
    setDismissed(true);
  };

  const handleDismiss = () => {
    onDismiss?.(id);
    setDismissed(true);
  };

  return (
    <div
      className="skill-suggest"
      data-testid="message-skill-suggest"
      data-skill-name={name}
    >
      <div className="skill-suggest__head">
        <span className="skill-suggest__icon" aria-hidden="true">
          <Sparkles size={14} />
        </span>
        <span className="skill-suggest__name">{name}</span>
        <span className="skill-suggest__tag">推荐技能</span>
      </div>
      {description && <div className="skill-suggest__desc">{description}</div>}
      {content && (
        <div className="skill-suggest__content-wrap">
          <button
            type="button"
            className="skill-suggest__content-toggle"
            onClick={() => setShowContent(!showContent)}
            aria-expanded={showContent}
          >
            {showContent ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span>{showContent ? "隐藏内容" : "查看内容"}</span>
          </button>
          {showContent && <pre className="skill-suggest__content">{content}</pre>}
        </div>
      )}
      <div className="skill-suggest__actions">
        <button
          type="button"
          className="skill-suggest__btn skill-suggest__btn--accept"
          onClick={handleAccept}
          data-testid="skill-suggest-accept"
        >
          <Check size={12} />
          <span>使用</span>
        </button>
        <button
          type="button"
          className="skill-suggest__btn skill-suggest__btn--dismiss"
          onClick={handleDismiss}
          data-testid="skill-suggest-dismiss"
        >
          <X size={12} />
          <span>稍后</span>
        </button>
      </div>
      {agentId && <span className="skill-suggest__agent" data-agent-id={agentId} />}
    </div>
  );
}

export default MessageSkillSuggest;
