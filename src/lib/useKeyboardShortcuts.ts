import { useEffect, useCallback } from "react";

type ShortcutHandler = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // 忽略在输入框中的快捷键（除了特殊组合）
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || 
                      target.tagName === "TEXTAREA" || 
                      target.isContentEditable;

      for (const shortcut of shortcuts) {
        const matchesKey = e.key.toLowerCase() === shortcut.key.toLowerCase() ||
                           e.key === shortcut.key;
        
        const matchesCtrl = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
        const matchesShift = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const matchesAlt = shortcut.alt ? e.altKey : !e.altKey;

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
          // 输入框中的 Escape 和 Tab 总是生效
          if (!isInput || e.key === "Escape" || e.key === "Tab") {
            e.preventDefault();
            shortcut.handler();
            return;
          }
        }
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// 快捷键常量
export const SHORTCUTS = {
  // 全局
  SEARCH: { key: "k", ctrl: true, description: "搜索" },
  OPEN: { key: "o", ctrl: true, description: "打开文件夹" },
  NEW_PROJECT: { key: "n", ctrl: true, description: "新建项目" },
  SETTINGS: { key: ",", ctrl: true, description: "设置" },
  
  // 聊天
  SEND: { key: "Enter", description: "发送消息" },
  NEW_CHAT: { key: "n", ctrl: true, shift: true, description: "新建对话" },
  
  // 会话
  CLEAR: { key: "l", ctrl: true, shift: true, description: "清空对话" },
} as const;
