import { useState, useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import { invoke } from "../../lib/tauri";
import { PanelLoader } from "../common/PanelLoader";

// `SessionsPanel` used to live at the bottom of ReasonixApp.tsx and
// was only reachable from the slide-in that `ToolsModal` jumped into.
// Now that every administrative panel lives behind the Settings
// drawer, this component gets its own file so the drawer can
// `React.lazy()` it. The `onResume` / `onDelete` props are forwarded
// up to the app shell so the call site controls navigation (closing
// the drawer, etc.) the same way the legacy slide-in did.

interface SessionRow {
  id?: string;
  path: string;
  agentId?: string;
  title?: string;
  preview?: string;
}

interface SessionsPanelProps {
  onResume: (path: string) => void;
  onDelete: (path: string) => void;
}

export function SessionsPanel({ onResume, onDelete }: SessionsPanelProps) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<SessionRow[]>("list_sessions")
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PanelLoader />;
  if (!sessions.length) {
    return <div className="panel-empty">暂无会话记录</div>;
  }

  return (
    <div className="session-list">
      {sessions.map((s) => (
        <div
          key={s.id || s.path}
          className="session-row"
          onClick={() => onResume(s.path)}
        >
          <MessageSquare size={14} className="ilo-fg-dim session-row__icon" />
          <div className="session-row__body">
            <div className="session-row__title">
              {s.agentId && (
                <span className="session-row__agent" data-agent={s.agentId}>
                  {s.agentId}
                </span>
              )}
              {s.title || "无标题会话"}
            </div>
            {s.preview && <div className="session-row__preview">{s.preview}</div>}
          </div>
          <button
            className="chip chip--icon session-row__delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(s.path);
            }}
            title="删除会话"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
