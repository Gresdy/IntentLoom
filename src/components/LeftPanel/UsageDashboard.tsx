import React, { useEffect, useState } from "react";
import { useUsageStore } from "../../stores/useUsageStore";
import { RefreshCw, Trash2 } from "lucide-react";

export const UsageDashboard: React.FC = () => {
  const {
    summary,
    providerUsage,
    dailyUsage,
    recentLogs,
    setDateRange,
    loadAll,
    clearLogs,
  } = useUsageStore();

  const [datePreset, setDatePreset] = useState<"all" | "7d" | "30d" | "90d">("all");

  useEffect(() => {
    loadAll();
  }, []);

  const handlePresetChange = (preset: "all" | "7d" | "30d" | "90d") => {
    setDatePreset(preset);
    const now = new Date();
    let start: Date | null = null;

    switch (preset) {
      case "7d":
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = null;
    }

    setDateRange(start?.toISOString().split("T")[0] || null, now.toISOString().split("T")[0]);
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleClearLogs = () => {
    setShowClearConfirm(true);
  };

  const confirmClear = async () => {
    const affected = await clearLogs();
    setToast(`已清除 ${affected} 条记录`);
    setShowClearConfirm(false);
    setTimeout(() => setToast(null), 3000);
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(2)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(2)}K`;
    }
    return tokens.toString();
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, padding: "8px 16px", background: "var(--ok)", color: "#fff", borderRadius: "var(--radius)", fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

      {/* Clear Confirm */}
      {showClearConfirm && (
        <div className="modal-backdrop" onClick={() => setShowClearConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__title">清除用量记录</div>
            <p style={{ margin: "0 0 16px", color: "var(--fg-dim)", fontSize: 13 }}>确定要清除所有用量记录吗？此操作不可恢复。</p>
            <div className="modal__actions">
              <button className="btn" onClick={() => setShowClearConfirm(false)}>取消</button>
              <button className="btn" style={{ background: "var(--err)", borderColor: "var(--err)", color: "#fff" }} onClick={confirmClear}>清除</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">用量统计</h2>
        <div className="flex items-center gap-2">
          <select
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value as any)}
            className="px-3 py-1.5 rounded-lg bg-[#252540] text-white text-sm border border-[#2a2a4e]"
          >
            <option value="all">全部时间</option>
            <option value="7d">最近7天</option>
            <option value="30d">最近30天</option>
            <option value="90d">最近90天</option>
          </select>
          <button
            onClick={() => loadAll()}
            className="p-2 rounded-lg hover:bg-[#2a2a4e] transition-colors"
            title="刷新"
          >
            <RefreshCw size={16} className="text-[#a0a0b0]" />
          </button>
          <button
            onClick={handleClearLogs}
            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
            title="清除记录"
          >
            <Trash2 size={16} className="text-red-400" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-[#252540] border border-[#2a2a4e]">
            <div className="text-xs text-[#606080] mb-1">总费用</div>
            <div className="text-2xl font-bold text-white">
              {formatCost(summary.totalCost)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#252540] border border-[#2a2a4e]">
            <div className="text-xs text-[#606080] mb-1">请求次数</div>
            <div className="text-2xl font-bold text-white">
              {summary.totalRequests.toLocaleString()}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#252540] border border-[#2a2a4e]">
            <div className="text-xs text-[#606080] mb-1">输入 Token</div>
            <div className="text-2xl font-bold text-white">
              {formatTokens(summary.totalInputTokens)}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-[#252540] border border-[#2a2a4e]">
            <div className="text-xs text-[#606080] mb-1">输出 Token</div>
            <div className="text-2xl font-bold text-white">
              {formatTokens(summary.totalOutputTokens)}
            </div>
          </div>
        </div>
      )}

      {/* Provider Usage */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white">按供应商</h3>
        {providerUsage.length === 0 ? (
          <div className="p-4 text-center text-[#606080] text-sm">暂无数据</div>
        ) : (
          <div className="space-y-2">
            {providerUsage.map((provider) => (
              <div
                key={provider.providerId}
                className="flex items-center justify-between p-3 rounded-lg bg-[#252540] border border-[#2a2a4e]"
              >
                <div>
                  <div className="text-sm font-medium text-white">
                    {provider.providerName}
                  </div>
                  <div className="text-xs text-[#606080]">
                    {provider.requestCount.toLocaleString()} 次请求 · {formatTokens(provider.totalTokens)} tokens
                  </div>
                </div>
                <div className="text-sm font-medium text-[#6366f1]">
                  {formatCost(provider.totalCost)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily Usage */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white">每日趋势</h3>
        {dailyUsage.length === 0 ? (
          <div className="p-4 text-center text-[#606080] text-sm">暂无数据</div>
        ) : (
          <div className="h-32 flex items-end gap-1">
            {dailyUsage.slice(0, 14).reverse().map((day) => {
              const maxCost = Math.max(...dailyUsage.map(d => d.totalCost), 1);
              const height = (day.totalCost / maxCost) * 100;
              return (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${day.date}: ${formatCost(day.totalCost)}`}
                >
                  <div
                    className="w-full bg-[#6366f1] rounded-t"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <div className="text-[10px] text-[#606080]">
                    {new Date(day.date).getMonth() + 1}/{new Date(day.date).getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Logs */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-white">最近请求</h3>
        {recentLogs.length === 0 ? (
          <div className="p-4 text-center text-[#606080] text-sm">暂无数据</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {recentLogs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-lg bg-[#252540] border border-[#2a2a4e] text-xs"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium">
                    {log.providerName || log.providerId}
                  </span>
                  <span className={`
                    ${log.statusCode >= 200 && log.statusCode < 300 ? "text-green-400" : "text-red-400"}
                  `}>
                    {log.statusCode}
                  </span>
                </div>
                <div className="text-[#606080]">
                  {log.model} · {formatTokens(log.inputTokens + log.outputTokens)} tokens · {formatCost(log.costUsd)} · {log.latencyMs}ms
                </div>
                <div className="text-[#505070] mt-1">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
