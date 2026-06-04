import { useEffect, useRef, useState } from "react";
import { useLogStore, LogEntry, LogLevel } from "../../stores/useLogStore";
import { Download, RefreshCw, Trash2 } from "lucide-react";

const levelColors: Record<LogLevel, { bg: string; text: string; border: string }> = {
  debug: { bg: "#e8f4ff", text: "#1d8eff", border: "#1d8eff" },
  info: { bg: "#e8ffed", text: "#00b42a", border: "#00b42a" },
  warn: { bg: "#fff7e6", text: "#ff7d00", border: "#ff7d00" },
  error: { bg: "#fff1f0", text: "#f53f3f", border: "#f53f3f" },
};

const levelLabels: Record<LogLevel, string> = {
  debug: "调试",
  info: "信息",
  warn: "警告",
  error: "错误",
};

const LogItem: React.FC<{ log: LogEntry; onClick: () => void; isSelected: boolean }> = ({ log, onClick, isSelected }) => {
  return (
    <div
      className={`p-4 border-b border-[#f0ebe3] cursor-pointer transition-all duration-200 ${
        isSelected ? "bg-[#fdf8f3]" : "hover:bg-[#F5F3FF]"
      }`}
      onClick={onClick}
      style={{ borderLeft: isSelected ? "3px solid #7C3AED" : "3px solid transparent" }}
    >
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <span className="text-xs text-[#9CA3AF]" style={{ fontFamily: "monospace" }}>{log.timestamp}</span>
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: levelColors[log.level].bg,
            color: levelColors[log.level].text,
            border: `1px solid ${levelColors[log.level].border}`,
          }}
        >
          {levelLabels[log.level]}
        </span>
        <span className="text-xs text-[#6B7280] bg-[#EDE9FE] px-2 py-0.5 rounded font-mono">
          {log.category}
        </span>
        {log.model && (
          <span className="text-xs text-[#9CA3AF] bg-[#F5F3FF] px-2 py-0.5 rounded">
            {log.model}
          </span>
        )}
        {log.latencyMs && (
          <span className="text-xs text-[#a09080] font-mono">
            {log.latencyMs}ms
          </span>
        )}
        {log.tokensUsed && (
          <span className="text-xs text-[#a09080] font-mono">
            {log.tokensUsed} tokens
          </span>
        )}
      </div>
      <div className="text-sm text-[#1E1B4B] mb-1 font-medium leading-relaxed">{log.message}</div>
      {log.details && (
        <div className="text-xs text-[#9CA3AF] line-clamp-2 mt-1">
          {log.details}
        </div>
      )}
    </div>
  );
};

const LogDetail: React.FC<{ log: LogEntry | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <div className="border-t border-blue-100 bg-blue-50 p-5" style={{ boxShadow: "inset 0 2px 8px rgba(0,0,0,0.03)" }}>
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-base text-blue-800">日志详情</h4>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 transition-colors border border-blue-200"
        >
          关闭
        </button>
      </div>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <span className="text-blue-600">时间：</span>
            <span className="font-mono text-blue-900">{log.timestamp}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-600">级别：</span>
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: levelColors[log.level].bg,
                color: levelColors[log.level].text,
                border: `1px solid ${levelColors[log.level].border}`,
              }}
            >
              {levelLabels[log.level]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-600">类别：</span>
            <span className="font-mono text-blue-900">{log.category}</span>
          </div>
          {log.providerId && (
            <div className="flex items-center gap-2">
              <span className="text-blue-600">供应商：</span>
              <span className="text-blue-900">{log.providerId}</span>
            </div>
          )}
          {log.model && (
            <div className="flex items-center gap-2">
              <span className="text-blue-600">模型：</span>
              <span className="text-blue-900">{log.model}</span>
            </div>
          )}
          {log.latencyMs && (
            <div className="flex items-center gap-2">
              <span className="text-blue-600">延迟：</span>
              <span className="font-mono text-blue-900">{log.latencyMs}ms</span>
            </div>
          )}
          {log.tokensUsed && (
            <div className="flex items-center gap-2">
              <span className="text-blue-600">Token：</span>
              <span className="font-mono text-blue-900">{log.tokensUsed}</span>
            </div>
          )}
        </div>
        <div>
          <span className="text-blue-600 block mb-2">消息：</span>
          <div className="p-4 bg-blue-100 rounded-lg text-blue-800 whitespace-pre-wrap border border-blue-200" style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.6" }}>
            {log.message}
          </div>
        </div>
        {log.details && (
          <div>
            <span className="text-blue-600 block mb-2">详细信息：</span>
            <div className="p-4 bg-blue-100 rounded-lg text-blue-700 whitespace-pre-wrap max-h-48 overflow-auto border border-blue-200" style={{ fontFamily: "monospace", fontSize: "12px" }}>
              {log.details}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface FilterButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  color?: string;
}

const FilterButton: React.FC<FilterButtonProps> = ({ label, isActive, onClick, color }) => {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        isActive ? "text-white" : "text-[#6B7280] bg-[#EDE9FE] hover:bg-[#ebe4d8]"
      }`}
      style={isActive && color ? { backgroundColor: color, border: `1px solid ${color}` } : { border: "1px solid #DDD6FE" }}
    >
      {label}
    </button>
  );
};

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, label, onClick, variant = "default" }) => {
  const baseStyle = "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border";
  const variantStyles = {
    default: "text-[#6B7280] bg-[#F5F3FF] border-[#DDD6FE] hover:bg-[#EDE9FE] hover:border-[#7C3AED]",
    primary: "text-white bg-[#7C3AED] border-[#7C3AED] hover:bg-[#6D28D9]",
    danger: "text-white bg-[#d4564a] border-[#d4564a] hover:bg-[#c0453a]",
  };

  return (
    <button onClick={onClick} className={`${baseStyle} ${variantStyles[variant]}`}>
      <span className="text-sm">{icon}</span>
      {label}
    </button>
  );
};

export const LogsPanel: React.FC = () => {
  const {
    logs,
    isLoading,
    filterLevel,
    filterCategory,
    fetchLogs,
    clearLogs,
    setFilterLevel,
    setFilterCategory,
  } = useLogStore();

  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const categories = Array.from(new Set(logs.map((log) => log.category)));

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = !searchTerm ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesLevel = filterLevel === "all" || log.level === filterLevel;
    const matchesCategory = filterCategory === "all" || log.category === filterCategory;
    return matchesSearch && matchesLevel && matchesCategory;
  });

  const handleExport = () => {
    const logContent = logs.map((log) => {
      return `[${log.timestamp}] [${levelLabels[log.level]}] [${log.category}] ${log.message}${log.details ? `\n${log.details}` : ""}`;
    }).join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intentloom-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "#fdfbf7", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div className="p-5 border-b border-[#e8dfd3]" style={{ backgroundColor: "#F5F3FF", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
        <div className="flex flex-col gap-4">
          {/* Title and Actions */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-[#1E1B4B]">系统日志</h3>
            <div className="flex items-center gap-2">
              <ActionButton
                icon={<RefreshCw size={14} />}
                label="刷新"
                onClick={fetchLogs}
              />
              <ActionButton
                icon={<Download size={14} />}
                label="导出"
                onClick={handleExport}
              />
              <ActionButton
                icon={<Trash2 size={14} />}
                label="清空"
                onClick={clearLogs}
                variant="danger"
              />
            </div>
          </div>

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="搜索日志..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 text-sm bg-white border border-[#DDD6FE] rounded-lg focus:outline-none focus:border-[#7C3AED] transition-colors text-[#1E1B4B] placeholder-[#a09080]"
              />
            </div>

            {/* Level Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#9CA3AF] mr-1">级别:</span>
              <FilterButton
                label="全部"
                isActive={filterLevel === "all"}
                onClick={() => setFilterLevel("all")}
              />
              <FilterButton
                label="调试"
                isActive={filterLevel === "debug"}
                onClick={() => setFilterLevel("debug")}
                color="#1d8eff"
              />
              <FilterButton
                label="信息"
                isActive={filterLevel === "info"}
                onClick={() => setFilterLevel("info")}
                color="#00b42a"
              />
              <FilterButton
                label="警告"
                isActive={filterLevel === "warn"}
                onClick={() => setFilterLevel("warn")}
                color="#ff7d00"
              />
              <FilterButton
                label="错误"
                isActive={filterLevel === "error"}
                onClick={() => setFilterLevel("error")}
                color="#f53f3f"
              />
            </div>
          </div>

          {/* Category Filter */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#9CA3AF] mr-1">分类:</span>
              <FilterButton
                label="全部"
                isActive={filterCategory === "all"}
                onClick={() => setFilterCategory("all")}
              />
              {categories.map((cat) => (
                <FilterButton
                  key={cat}
                  label={cat}
                  isActive={filterCategory === cat}
                  onClick={() => setFilterCategory(cat)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log List */}
      <div className="flex-1 overflow-auto">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div style={{ padding: 40, textAlign: "center", color: "var(--fg-faint)", fontSize: 13 }}>
              {isLoading ? "加载中..." : "暂无日志"}
            </div>
          </div>
        ) : (
          <div>
            {filteredLogs.map((log) => (
              <LogItem
                key={log.id}
                log={log}
                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                isSelected={selectedLog?.id === log.id}
              />
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Log Detail */}
      {selectedLog && (
        <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
};
