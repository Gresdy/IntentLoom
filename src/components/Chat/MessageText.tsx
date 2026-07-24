/**
 * MessageText — AionUi-style message text rendering.
 */
import { useState, useMemo } from "react";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { formatMessageTime } from "@/chat/formatMessageTime";
import { MarkdownView } from "@/components/Markdown";

export interface MessageTextProps {
  id?: string;
  content: string;
  createdAt?: number;
  isUserMessage?: boolean;
  cronJobName?: string;
  cronJobId?: string;
}

function detectJson(text: string): { isJson: boolean; data: any } {
  try {
    const parsed = JSON.parse(text);
    return { isJson: typeof parsed === 'object' && parsed !== null, data: parsed };
  } catch {
    return { isJson: false, data: text };
  }
}

function parseFileMarker(content: string): { text: string; files: string[] } {
  const marker = "[FILES]";
  const markerIndex = content.indexOf(marker);
  if (markerIndex === -1) {
    return { text: content, files: [] };
  }
  const text = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content.slice(markerIndex + marker.length).trim();
  const files = afterMarker ? afterMarker.split("\n").map(line => line.trim()).filter(Boolean) : [];
  return { text, files };
}

export function MessageText(props: MessageTextProps) {
  const { id, content, createdAt, isUserMessage = false, cronJobName, cronJobId } = props;
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const [showJsonContent, setShowJsonContent] = useState(false);

  const cleanContent = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\[SKILL_SUGGEST\][\s\S]*?\[\/SKILL_SUGGEST\]/gi, "")
    .trim();

  const { text: parsedText, files } = useMemo(() => parseFileMarker(cleanContent), [cleanContent]);
  const { isJson, data } = useMemo(() => detectJson(parsedText), [parsedText]);

  if (!content || !content.trim()) {
    return null;
  }

  const handleCopy = async () => {
    try {
      let textToCopy = parsedText;
      if (isJson) textToCopy = JSON.stringify(data, null, 2);
      if (files.length > 0) textToCopy = `Files:\n${files.map(f => `- ${f}`).join('\n')}\n\n${textToCopy}`;
      await navigator.clipboard.writeText(textToCopy);
      setShowCopyAlert(true);
      setTimeout(() => setShowCopyAlert(false), 2000);
    } catch (err) {
      console.error("[MessageText] Copy failed:", err);
    }
  };

  const messageClass = isUserMessage ? "message-text--user" : "message-text--assistant";

  return (
    <div className={`message-text ${messageClass}`} data-testid="message-text" data-message-id={id}>
      {/* Cron job badge */}
      {(cronJobName || cronJobId) && (
        <div className="message-text__cron-badge">
          <span className="message-text__cron-icon">⏰</span>
          <span className="message-text__cron-label">
            定时任务{cronJobName ? `: ${cronJobName}` : ""}
          </span>
        </div>
      )}

      {/* File preview */}
      {files.length > 0 && (
        <div className="message-text__files">
          {files.map((file, i) => (
            <div key={i} className="message-text__file">
              📄 {file}
            </div>
          ))}
        </div>
      )}

      {/* Message content */}
      <div className="message-text__content">
        {isUserMessage ? (
          <div className="message-text__plain">{parsedText}</div>
        ) : isJson ? (
          <div className="message-text__json">
            <button type="button" className="message-text__json-toggle" onClick={() => setShowJsonContent(!showJsonContent)}>
              {showJsonContent ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{showJsonContent ? "收起" : "展开"}JSON</span>
            </button>
            {showJsonContent && <pre className="message-text__json-content">{JSON.stringify(data, null, 2)}</pre>}
          </div>
        ) : (
          <div className="message-text__markdown" data-testid="message-text-content">
            <MarkdownView>{parsedText}</MarkdownView>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="message-text__actions">
        <button type="button" className="message-text__copy-btn" onClick={handleCopy} title="复制" data-testid="message-text-copy">
          {showCopyAlert ? <Check size={12} /> : <Copy size={12} />}
        </button>
        {createdAt && (
          <span className="message-text__time">{formatMessageTime(createdAt)}</span>
        )}
      </div>

      {/* Copy success toast */}
      {showCopyAlert && <div className="message-text__toast">已复制</div>}
    </div>
  );
}

export default MessageText;
