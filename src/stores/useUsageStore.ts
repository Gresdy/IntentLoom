import { create } from "zustand";
import { invoke } from "../lib/tauri";

export interface UsageLog {
  id: number;
  providerId: string;
  providerName?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  latencyMs: number;
  statusCode: number;
  errorMessage?: string;
  createdAt: string;
}

export interface UsageSummary {
  totalRequests: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
}

export interface ProviderUsage {
  providerId: string;
  providerName: string;
  requestCount: number;
  totalTokens: number;
  totalCost: number;
}

export interface DailyUsage {
  date: string;
  requestCount: number;
  totalCost: number;
  totalTokens: number;
}

interface UsageState {
  summary: UsageSummary | null;
  providerUsage: ProviderUsage[];
  dailyUsage: DailyUsage[];
  recentLogs: UsageLog[];
  isLoading: boolean;
  startDate: string | null;
  endDate: string | null;
  setDateRange: (start: string | null, end: string | null) => void;
  loadSummary: () => Promise<void>;
  loadProviderUsage: () => Promise<void>;
  loadDailyUsage: () => Promise<void>;
  loadRecentLogs: (limit?: number) => Promise<void>;
  logUsage: (input: {
    providerId: string;
    providerName?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    latencyMs: number;
    statusCode: number;
    errorMessage?: string;
  }) => Promise<UsageLog | null>;
  clearLogs: (beforeDate?: string) => Promise<number>;
  loadAll: () => Promise<void>;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  summary: null,
  providerUsage: [],
  dailyUsage: [],
  recentLogs: [],
  isLoading: false,
  startDate: null,
  endDate: null,

  setDateRange: (start, end) => {
    set({ startDate: start, endDate: end });
  },

  loadSummary: async () => {
    const { startDate, endDate } = get();
    try {
      const summary = await invoke<UsageSummary>("get_usage_summary", {
        startDate,
        endDate,
      });
      set({ summary });
    } catch (error) {
      console.error("Failed to load usage summary:", error);
    }
  },

  loadProviderUsage: async () => {
    const { startDate, endDate } = get();
    try {
      const providerUsage = await invoke<ProviderUsage[]>("get_usage_by_provider", {
        startDate,
        endDate,
      });
      set({ providerUsage });
    } catch (error) {
      console.error("Failed to load provider usage:", error);
    }
  },

  loadDailyUsage: async () => {
    const { startDate, endDate } = get();
    try {
      const dailyUsage = await invoke<DailyUsage[]>("get_daily_usage", {
        startDate,
        endDate,
      });
      set({ dailyUsage });
    } catch (error) {
      console.error("Failed to load daily usage:", error);
    }
  },

  loadRecentLogs: async (limit = 50) => {
    try {
      const recentLogs = await invoke<UsageLog[]>("get_recent_usage_logs", { limit });
      set({ recentLogs });
    } catch (error) {
      console.error("Failed to load recent logs:", error);
    }
  },

  logUsage: async (input) => {
    try {
      const log = await invoke<UsageLog>("log_usage", { input });
      await get().loadSummary();
      await get().loadProviderUsage();
      await get().loadRecentLogs();
      return log;
    } catch (error) {
      console.error("Failed to log usage:", error);
      return null;
    }
  },

  clearLogs: async (beforeDate) => {
    try {
      const affected = await invoke<number>("clear_usage_logs", { beforeDate });
      await get().loadAll();
      return affected;
    } catch (error) {
      console.error("Failed to clear logs:", error);
      return 0;
    }
  },

  loadAll: async () => {
    set({ isLoading: true });
    try {
      await Promise.all([
        get().loadSummary(),
        get().loadProviderUsage(),
        get().loadDailyUsage(),
        get().loadRecentLogs(),
      ]);
    } finally {
      set({ isLoading: false });
    }
  },
}));
