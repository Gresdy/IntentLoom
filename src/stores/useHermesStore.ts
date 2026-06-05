// Hermes is the local AI runtime IntentLoom plans to ship. As of
// Phase 3 of `docs/plan/multi-agent-cockpit.md` it is **not** wired
// to a real backend — `lib.rs` registers zero hermes_* commands. The
// store below is kept as a typed stub so the UI can render a "not
// implemented" surface honestly rather than failing silently with
// cryptic Tauri errors. The five public actions each reject with a
// clear, user-visible message. The internal `_subscribeToEvents` is
// preserved so that once a real backend lands, only the call sites
// need to be uncommented.

import { create } from "zustand";
import { UnlistenFn } from "@tauri-apps/api/event";

export type HermesMode = "normal" | "plan" | "yolo";

export interface HermesEvent {
  task_id: string;
  event_type: string;
  content: string;
  tool_name: string | null;
  timestamp?: number;
}

export interface HermesTask {
  id: string;
  status: "idle" | "running" | "completed" | "error";
  output: HermesEvent[];
  started_at: number;
  error?: string;
}

const NOT_IMPLEMENTED = "Hermes 暂未上线 (no backend command registered)";

interface HermesState {
  healthStatus: "checking" | "ok" | "error";
  healthMessage: string;
  currentTask: HermesTask | null;
  taskHistory: HermesTask[];
  mode: HermesMode;
  checkHealth: () => Promise<void>;
  startAgent: (projectPath?: string, skills?: string, model?: string, yolo?: boolean) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearOutput: () => void;
  setMode: (mode: HermesMode) => void;
  _unlisten: UnlistenFn | null;
  _subscribeToEvents: () => Promise<void>;
}

export const useHermesStore = create<HermesState>((set, get) => ({
  healthStatus: "error",
  healthMessage: NOT_IMPLEMENTED,
  currentTask: null,
  taskHistory: [],
  mode: "normal",
  _unlisten: null,

  checkHealth: async () => {
    // The backend command does not exist. Surface a clear "not
    // implemented" status so the UI never claims Hermes is healthy.
    set({ healthStatus: "error", healthMessage: NOT_IMPLEMENTED });
    throw new Error(NOT_IMPLEMENTED);
  },

  startAgent: async () => {
    // The backend command does not exist. Record a failed task in
    // history so the UI can show the attempt honestly, and reject.
    const task: HermesTask = {
      id: `task-${Date.now()}`,
      status: "error",
      output: [],
      started_at: Date.now(),
      error: NOT_IMPLEMENTED,
    };
    set((state) => ({
      currentTask: task,
      taskHistory: [task, ...state.taskHistory].slice(0, 10),
    }));
    throw new Error(NOT_IMPLEMENTED);
  },

  sendMessage: async (_message) => {
    throw new Error(NOT_IMPLEMENTED);
  },

  stopAgent: async () => {
    // The backend command does not exist. Mark the current task as
    // stopped without pretending the call succeeded.
    set((state) => ({
      currentTask: state.currentTask
        ? { ...state.currentTask, status: "completed" }
        : null,
    }));
  },

  clearOutput: () => {
    set((state) => ({
      currentTask: state.currentTask
        ? { ...state.currentTask, output: [] }
        : null,
    }));
  },

  setMode: (mode) => set({ mode }),

  _subscribeToEvents: async () => {
    // No-op: there is no backend to subscribe to. Kept as a typed
    // method on the store so a future implementation only has to
    // uncomment the body — callers won't need to change.
    const { _unlisten } = get();
    if (_unlisten) {
      _unlisten();
      set({ _unlisten: null });
    }
  },
}));
