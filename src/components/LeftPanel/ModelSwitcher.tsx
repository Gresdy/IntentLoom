import { useState } from "react";
import { Terminal, CheckOne } from "@icon-park/react";
import { useModelStore } from "../../stores/useModelStore";
import type { AICLI } from "../../shared/types";

const CLIS: { value: AICLI; label: string }[] = [
  { value: "claude-code", label: "Claude Code" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "openclaw", label: "OpenClaw" },
];

export const ModelSwitcher: React.FC = () => {
  const { currentCli, setCurrentCli } = useModelStore();
  const [open, setOpen] = useState(false);

  return (
    <div className="p-3 border-b border-gray-100 relative">
      <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
        <Terminal size={12} />
        模型切换
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 text-left text-sm bg-gray-50 rounded border border-gray-200 hover:bg-gray-100"
      >
        {CLIS.find((c) => c.value === currentCli)?.label || "选择模型"}
      </button>
      {open && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white rounded border border-gray-200 shadow-lg">
          {CLIS.map((cli) => (
            <button
              key={cli.value}
              onClick={() => {
                setCurrentCli(cli.value);
                setOpen(false);
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
            >
              <span>{cli.label}</span>
              {currentCli === cli.value && <CheckOne size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
