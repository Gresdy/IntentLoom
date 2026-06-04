import { create } from "zustand";
import type {
  ThinkingProcess,
  ThinkingPhase,
  TaskItem,
} from "../shared/thinking";

interface ThinkingStore {
  isProcessing: boolean;
  thinkingProcess: ThinkingProcess | null;
  expandedPhases: Set<ThinkingPhase>;
  error: string | null;
  showThinkingPanel: boolean;
  currentMessageId: string | null;

  setProcessing: (processing: boolean) => void;
  setThinkingProcess: (process: ThinkingProcess | null, messageId?: string) => void;
  togglePhase: (phase: ThinkingPhase) => void;
  expandAllPhases: () => void;
  collapseAllPhases: () => void;
  setError: (error: string | null) => void;
  setShowThinkingPanel: (show: boolean) => void;

  updateTaskStatus: (taskId: string, status: TaskItem["status"]) => void;
  updateTaskResult: (taskId: string, result: string, error?: string) => void;
  clearThinking: () => void;
}

export const useThinkingStore = create<ThinkingStore>((set) => ({
  isProcessing: false,
  thinkingProcess: null,
  expandedPhases: new Set<ThinkingPhase>(["intent", "reasoning", "tasks"]),
  error: null,
  showThinkingPanel: true,
  currentMessageId: null,

  setProcessing: (processing) => set({ isProcessing: processing }),

  setThinkingProcess: (process, messageId) =>
    set({
      thinkingProcess: process,
      isProcessing: false,
      error: null,
      currentMessageId: messageId ?? null,
    }),

  togglePhase: (phase) =>
    set((state) => {
      const newExpanded = new Set(state.expandedPhases);
      if (newExpanded.has(phase)) {
        newExpanded.delete(phase);
      } else {
        newExpanded.add(phase);
      }
      return { expandedPhases: newExpanded };
    }),

  expandAllPhases: () =>
    set({
      expandedPhases: new Set<ThinkingPhase>(["intent", "reasoning", "tasks"]),
    }),

  collapseAllPhases: () => set({ expandedPhases: new Set<ThinkingPhase>() }),

  setError: (error) => set({ error, isProcessing: false }),

  setShowThinkingPanel: (show) => set({ showThinkingPanel: show }),

  updateTaskStatus: (taskId, status) =>
    set((state) => {
      if (!state.thinkingProcess) return state;

      const updatedTasks = state.thinkingProcess.tasks.map((task) =>
        task.id === taskId ? { ...task, status } : task
      );

      return {
        thinkingProcess: {
          ...state.thinkingProcess,
          tasks: updatedTasks,
        },
      };
    }),

  updateTaskResult: (taskId, result, error) =>
    set((state) => {
      if (!state.thinkingProcess) return state;

      const updatedTasks = state.thinkingProcess.tasks.map((task) =>
        task.id === taskId ? { ...task, result, error } : task
      );

      return {
        thinkingProcess: {
          ...state.thinkingProcess,
          tasks: updatedTasks,
        },
      };
    }),

  clearThinking: () =>
    set({
      thinkingProcess: null,
      isProcessing: false,
      error: null,
      currentMessageId: null,
    }),
}));

export const getThinkingState = (state: ThinkingStore) => ({
  isProcessing: state.isProcessing,
  thinkingProcess: state.thinkingProcess,
  showThinkingPanel: state.showThinkingPanel,
  expandedPhases: state.expandedPhases,
});

export const getThinkingActions = (state: ThinkingStore) => ({
  setProcessing: state.setProcessing,
  setThinkingProcess: state.setThinkingProcess,
  togglePhase: state.togglePhase,
  expandAllPhases: state.expandAllPhases,
  collapseAllPhases: state.collapseAllPhases,
  setShowThinkingPanel: state.setShowThinkingPanel,
  clearThinking: state.clearThinking,
});
