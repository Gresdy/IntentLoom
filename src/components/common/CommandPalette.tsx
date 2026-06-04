import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, Plus, FolderOpen, Settings, Moon } from "lucide-react";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  action: () => void;
  category?: string;
  shortcut?: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ isOpen, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.description?.toLowerCase().includes(lower)
    );
  }, [commands, query]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      const cat = cmd.category || "其他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeCommand = useCallback(
    (index: number) => {
      const flattened = filteredCommands;
      if (index >= 0 && index < flattened.length) {
        flattened[index].action();
        onClose();
        setQuery("");
      }
    },
    [filteredCommands, onClose]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          executeCommand(selectedIndex);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          setQuery("");
          break;
      }
    },
    [filteredCommands, selectedIndex, executeCommand, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl overflow-hidden shadow-2xl animate-scaleIn"
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-soft)" }}
        >
          <Search size={18} style={{ color: "var(--fg-faint)" }} />
          <input
            type="text"
            className="flex-1 bg-transparent outline-none"
            style={{ color: "var(--fg)", fontSize: 15 }}
            placeholder="输入命令搜索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <kbd
            className="px-2 py-1 rounded text-xs"
            style={{ background: "var(--bg-elev-2)", border: "1px solid var(--border)", fontFamily: "var(--mono)" }}
          >
            ESC
          </kbd>
        </div>

        {/* 命令列表 */}
        <div className="max-h-80 overflow-y-auto py-2">
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div
                className="px-4 py-1 text-xs uppercase"
                style={{ color: "var(--fg-faint)", letterSpacing: "0.05em" }}
              >
                {category}
              </div>
              {cmds.map((cmd) => {
                const currentIndex = flatIndex++;
                return (
                  <button
                    key={cmd.id}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                      currentIndex === selectedIndex ? "bg-accent-soft" : ""
                    }`}
                    style={currentIndex === selectedIndex ? { background: "var(--accent-soft)" } : {}}
                    onClick={() => {
                      cmd.action();
                      onClose();
                      setQuery("");
                    }}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    {cmd.icon && (
                      <span style={{ color: "var(--fg-dim)" }}>{cmd.icon}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div style={{ color: "var(--fg)", fontSize: 14 }}>{cmd.label}</div>
                      {cmd.description && (
                        <div style={{ color: "var(--fg-faint)", fontSize: 12 }}>{cmd.description}</div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ background: "var(--bg-elev-2)", border: "1px solid var(--border)", fontFamily: "var(--mono)" }}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center" style={{ color: "var(--fg-faint)" }}>
              未找到匹配的命令
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 预定义命令工厂
export function useCommandPalette(actions: {
  onNewChat?: () => void;
  onOpenFolder?: () => void;
  onSettings?: () => void;
  onToggleTheme?: () => void;
}) {
  const commands: Command[] = useMemo(
    () => [
      {
        id: "new-chat",
        label: "新建对话",
        description: "开始新的聊天会话",
        icon: <Plus size={16} />,
        category: "会话",
        shortcut: "Ctrl+N",
        action: actions.onNewChat || (() => {}),
      },
      {
        id: "open-folder",
        label: "打开文件夹",
        description: "打开现有项目文件夹",
        icon: <FolderOpen size={16} />,
        category: "项目",
        shortcut: "Ctrl+O",
        action: actions.onOpenFolder || (() => {}),
      },
      {
        id: "settings",
        label: "打开设置",
        description: "打开应用设置面板",
        icon: <Settings size={16} />,
        category: "应用",
        shortcut: "Ctrl+,",
        action: actions.onSettings || (() => {}),
      },
      {
        id: "toggle-theme",
        label: "切换主题",
        description: "在浅色和深色主题间切换",
        icon: <Moon size={16} />,
        category: "应用",
        action: actions.onToggleTheme || (() => {}),
      },
    ],
    [actions]
  );

  return commands;
}
