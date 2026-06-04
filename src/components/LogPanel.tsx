import { useEffect, useRef, useState } from "react";
import { useLogStore, LogEntry, LogLevel } from "../stores/useLogStore";
import { ChevronDown, ChevronUp, XCircle } from "lucide-react";

const levelColors: Record<LogLevel, string> = {
  debug: "gray",
  info: "blue",
  warn: "orange",
  error: "red",
};

const levelLabels: Record<LogLevel, string> = {
  debug: "调试",
  info: "信息",
  warn: "警告",
  error: "错误",
};

const LogItem: React.FC<{ log: LogEntry; onClick: () => void }> = ({ log, onClick }) => {
  return (
    <div
      className="p-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer text-xs font-mono"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className="text-gray-400">{log.timestamp}</span>
        <span className="badge" style={{ color: levelColors[log.level] === "red" ? "var(--err)" : levelColors[log.level] === "orange" ? "var(--warn)" : levelColors[log.level] === "blue" ? "var(--accent)" : "var(--fg-faint)", borderColor: levelColors[log.level] === "red" ? "var(--err)" : levelColors[log.level] === "orange" ? "var(--warn)" : levelColors[log.level] === "blue" ? "var(--accent)" : "var(--border)" }}>
          {levelLabels[log.level]}
        </span>
        <span className="text-gray-600 bg-gray-100 px-1 rounded">
          {log.category}
        </span>
        {log.model && (
          <span className="text-gray-500">{log.model}</span>
        )}
        {log.latencyMs && (
          <span className="text-gray-400">{log.latencyMs}ms</span>
        )}
        {log.tokensUsed && (
          <span className="text-gray-400">{log.tokensUsed} tokens</span>
        )}
      </div>
      <div className="mt-1 text-gray-800 truncate">{log.message}</div>
      {log.details && (
        <div className="mt-1 text-gray-500 text-xs truncate">
          {log.details}
        </div>
      )}
    </div>
  );
};

const LogDetail: React.FC<{ log: LogEntry | null; onClose: () => void }> = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <div className="h-64 border-t border-blue-100 bg-blue-50 overflow-auto">
      <div className="p-3">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-medium text-blue-800">日志详情</h4>
          <button className="btn btn--small" onClick={onClose}>关闭</button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-blue-600">时间：</span>
              <span className="text-blue-900">{log.timestamp}</span>
            </div>
            <div>
              <span className="text-blue-600">级别：</span>
              <span className="badge" style={{ color: levelColors[log.level] === "red" ? "var(--err)" : levelColors[log.level] === "orange" ? "var(--warn)" : levelColors[log.level] === "blue" ? "var(--accent)" : "var(--fg-faint)", borderColor: levelColors[log.level] === "red" ? "var(--err)" : levelColors[log.level] === "orange" ? "var(--warn)" : levelColors[log.level] === "blue" ? "var(--accent)" : "var(--border)" }}>
                {levelLabels[log.level]}
              </span>
            </div>
            <div>
              <span className="text-blue-600">类别：</span>
              <span className="text-blue-900">{log.category}</span>
            </div>
            {log.providerId && (
              <div>
                <span className="text-blue-600">供应商：</span>
                <span className="text-blue-900">{log.providerId}</span>
              </div>
            )}
            {log.model && (
              <div>
                <span className="text-blue-600">模型：</span>
                <span className="text-blue-900">{log.model}</span>
              </div>
            )}
            {log.latencyMs && (
              <div>
                <span className="text-blue-600">延迟：</span>
                <span className="text-blue-900">{log.latencyMs}ms</span>
              </div>
            )}
            {log.tokensUsed && (
              <div>
                <span className="text-blue-600">Token：</span>
                <span className="text-blue-900">{log.tokensUsed}</span>
              </div>
            )}
          </div>
          <div>
            <span className="text-blue-600">消息：</span>
            <div className="mt-1 p-2 bg-blue-100 rounded text-blue-800 whitespace-pre-wrap">
              {log.message}
            </div>
          </div>
          {log.details && (
            <div>
              <span className="text-blue-600">详细信息：</span>
              <div className="mt-1 p-2 bg-blue-100 rounded text-blue-700 whitespace-pre-wrap max-h-32 overflow-auto">
                {log.details}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const LogPanel: React.FC = () => {
  const {
    logs,
    isLoading,
    filterLevel,
    filterCategory,
    isExpanded,
    fetchLogs,
    clearLogs,
    setFilterLevel,
    setFilterCategory,
    toggleExpanded,
  } = useLogStore();

  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const categories = Array.from(new Set(logs.map((log) => log.category)));

  return (
    <div className={`border-t border-gray-200 bg-white transition-all ${isExpanded ? "h-80" : "h-10"}`}>
      <div className="h-10 px-3 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="font-medium text-sm">日志</span>
          <span className="text-xs text-gray-500">{logs.length} 条记录</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as LogLevel | "all")}
            style={{ width: 80, padding: "4px 8px", background: "var(--bg-soft)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
          >
            <option value="all">全部</option>
            <option value="debug">调试</option>
            <option value="info">信息</option>
            <option value="warn">警告</option>
            <option value="error">错误</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{ width: 100, padding: "4px 8px", background: "var(--bg-soft)", color: "var(--fg)", border: "1px solid var(--border)", borderRadius: "var(--radius)", fontSize: 12 }}
          >
            <option value="all">全部分类</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            className="btn btn--small"
            onClick={clearLogs}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <XCircle size={14} />
            清空
          </button>
          <button
            className="btn btn--small chip--icon"
            onClick={toggleExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="h-48 overflow-auto">
            {logs.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {isLoading ? "加载中..." : "暂无日志"}
              </div>
            ) : (
              logs.map((log) => (
                <LogItem
                  key={log.id}
                  log={log}
                  onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                />
              ))
            )}
            <div ref={logsEndRef} />
          </div>
          {selectedLog && (
            <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
          )}
        </>
      )}
    </div>
  );
};