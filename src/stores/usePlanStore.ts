import { create } from "zustand";
import type { Plan } from "../shared/types";

interface PlanState {
  plan: Plan | null;
  isExecuting: boolean;
  setPlan: (plan: Plan | null) => void;
  updateTask: (taskId: string, updates: Partial<{ completed: boolean }>) => void;
  setIsExecuting: (executing: boolean) => void;
}

export const usePlanStore = create<PlanState>((set) => ({
  plan: null,
  isExecuting: false,
  setPlan: (plan) => set({ plan }),
  updateTask: (taskId, updates) =>
    set((state) => {
      if (!state.plan) return state;
      return {
        plan: {
          ...state.plan,
          tasks: state.plan.tasks.map((t) =>
            t.id === taskId ? { ...t, ...updates } : t
          ),
        },
      };
    }),
  setIsExecuting: (executing) => set({ isExecuting: executing }),
}));
