import { create } from "zustand";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  details?: string;
  providerId?: string;
  model?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

interface LogState {
  logs: LogEntry[];
  isLoading: boolean;
  filterLevel: LogLevel | "all";
  filterCategory: string | "all";
  isExpanded: boolean;
  setLogs: (logs: LogEntry[]) => void;
  addLog: (log: LogEntry) => void;
  fetchLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
  setFilterLevel: (level: LogLevel | "all") => void;
  setFilterCategory: (category: string | "all") => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
}

const invoke = async (command: string, args?: any) => {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke(command, args);
};

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  isLoading: false,
  filterLevel: "all",
  filterCategory: "all",
  isExpanded: false,

  setLogs: (logs) => set({ logs }),

  addLog: (log) => set((state) => ({
    logs: [log, ...state.logs].slice(0, 500)
  })),

  fetchLogs: async () => {
    set({ isLoading: true });
    try {
      const { filterLevel, filterCategory } = get();
      const logs = await invoke("get_logs", {
        limit: 500,
        level: filterLevel === "all" ? null : filterLevel,
        category: filterCategory === "all" ? null : filterCategory,
      });
      set({ logs: logs as LogEntry[], isLoading: false });
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      set({ isLoading: false });
    }
  },

  clearLogs: async () => {
    try {
      await invoke("clear_logs");
      set({ logs: [] });
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  },

  setFilterLevel: (level) => {
    set({ filterLevel: level });
    get().fetchLogs();
  },

  setFilterCategory: (category) => {
    set({ filterCategory: category });
    get().fetchLogs();
  },

  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded })),

  setExpanded: (expanded) => set({ isExpanded: expanded }),
}));