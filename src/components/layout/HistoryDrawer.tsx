import { useState, useMemo } from "react";
import { X, Search, Trash2, Edit2, MessageSquare, Clock } from "lucide-react";

interface Session {
  id: string;
  path: string;
  title: string;
  preview?: string;
  updatedAt: number;
  messageCount?: number;
}

interface HistoryDrawerProps {
  sessions: Session[];
  onResume: (path: string) => void;
  onDelete: (path: string) => void;
  onRename: (path: string, title: string) => void;
  onClose: () => void;
}

export function HistoryDrawer({ sessions, onResume, onDelete, onRename, onClose }: HistoryDrawerProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions;
    const lower = search.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        s.preview?.toLowerCase().includes(lower)
    );
  }, [sessions, search]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer drawer--wide" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <header className="drawer__head">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            <div className="drawer__title">会话历史</div>
            <span 
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--bg-soft)", color: "var(--fg-faint)" }}
            >
              {filteredSessions.length}
            </span>
          </div>
          <button className="chip" onClick={onClose}>
            <X size={14} />
          </button>
        </header>

        {/* 搜索 */}
        <div 
          className="flex items-center gap-2 mx-4 mt-4 p-2 rounded-lg"
          style={{ background: "var(--bg)" }}
        >
          <Search size={14} style={{ color: "var(--fg-faint)" }} />
          <input
            type="text"
            placeholder="搜索会话..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none"
            style={{ color: "var(--fg)", fontSize: 13 }}
          />
        </div>

        {/* 会话列表 */}
        <div className="drawer__body">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12" style={{ color: "var(--fg-faint)" }}>
              {search ? "未找到匹配的会话" : "暂无会话历史"}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredSessions.map((session) => (
                <div 
                  key={session.id}
                  className="hist-item"
                  onClick={() => onResume(session.path)}
                >
                  {editingId === session.id ? (
                    <input
                      className="hist-item__rename"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => {
                        if (editTitle.trim()) {
                          onRename(session.path, editTitle.trim());
                        }
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (editTitle.trim()) {
                            onRename(session.path, editTitle.trim());
                          }
                          setEditingId(null);
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <button 
                      className="hist-item__main"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingId(session.id);
                        setEditTitle(session.title);
                      }}
                    >
                      <div className="hist-item__preview">{session.title}</div>
                      <div className="hist-item__meta">
                        <Clock size={10} />
                        <span>{formatDate(session.updatedAt)}</span>
                        {session.messageCount && (
                          <>
                            <span>·</span>
                            <span>{session.messageCount} 条消息</span>
                          </>
                        )}
                      </div>
                    </button>
                  )}
                  
                  {/* 操作按钮 */}
                  <div className="hist-item__actions">
                    <button
                      className="hist-act"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(session.id);
                        setEditTitle(session.title);
                      }}
                      title="重命名"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      className="hist-act hist-act--danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("确定要删除这个会话吗？")) {
                          onDelete(session.path);
                        }
                      }}
                      title="删除"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div 
          className="shrink-0 px-4 py-3 text-xs"
          style={{ borderTop: "1px solid var(--border-soft)", color: "var(--fg-faint)" }}
        >
          双击会话标题可重命名 · 点击删除按钮删除会话
        </div>
      </aside>
    </div>
  );
}
