import { create } from "zustand";
import { invoke } from "../lib/tauri";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

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

interface HermesState {
  healthStatus: "checking" | "ok" | "error";
  healthMessage: string;
  currentTask: HermesTask | null;
  taskHistory: HermesTask[];
  checkHealth: () => Promise<void>;
  startAgent: (projectPath?: string, skills?: string, model?: string, yolo?: boolean) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  stopAgent: () => Promise<void>;
  clearOutput: () => void;
  _unlisten: UnlistenFn | null;
  _subscribeToEvents: () => Promise<void>;
}

export const useHermesStore = create<HermesState>((set, get) => ({
  healthStatus: "checking",
  healthMessage: "",
  currentTask: null,
  taskHistory: [],
  _unlisten: null,

  checkHealth: async () => {
    set({ healthStatus: "checking" });
    try {
      const result = await invoke<string>("hermes_check_health");
      set({ healthStatus: "ok", healthMessage: result });
    } catch (e) {
      set({ healthStatus: "error", healthMessage: String(e) });
    }
  },

  startAgent: async (_projectPath, _skills, _model, _yolo) => {
    const taskId = `task-${Date.now()}`;
    const task: HermesTask = {
      id: taskId,
      status: "running",
      output: [],
      started_at: Date.now(),
    };

    set((state) => ({
      currentTask: task,
      taskHistory: [task, ...state.taskHistory].slice(0, 10),
    }));

    await get()._subscribeToEvents();

    try {
      const status = await invoke<{ available: boolean; error?: string }>("hermes_get_status");
      if (!status.available) {
        throw new Error(status.error || "Hermes 未安装");
      }

      await invoke("hermes_start_session", { taskId });
    } catch (e) {
      set((state) => ({
        currentTask: state.currentTask
          ? { ...state.currentTask, status: "error", error: String(e) }
          : null,
      }));
    }
  },

  sendMessage: async (message) => {
    const { currentTask } = get();
    if (!currentTask || currentTask.status !== "running") return;

    const userEvent: HermesEvent = {
      task_id: currentTask.id,
      event_type: "user_message",
      content: message,
      tool_name: null,
    };

    set((state) => ({
      currentTask: state.currentTask
        ? { ...state.currentTask, output: [...state.currentTask.output, userEvent] }
        : null,
    }));

    try {
      await invoke("hermes_session_send", {
        taskId: currentTask.id,
        message,
      });
    } catch (e) {
      const errEvent: HermesEvent = {
        task_id: currentTask.id,
        event_type: "error",
        content: `发送失败: ${e}`,
        tool_name: null,
      };
      set((state) => ({
        currentTask: state.currentTask
          ? { ...state.currentTask, output: [...state.currentTask.output, errEvent] }
          : null,
      }));
    }
  },

  stopAgent: async () => {
    try {
      await invoke("hermes_stop_session");
    } catch (e) {
      console.error("Failed to stop session:", e);
    }
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

  _subscribeToEvents: async () => {
    const { _unlisten } = get();
    if (_unlisten) {
      _unlisten();
    }

    const unlisten = await listen<HermesEvent>("hermes-event", (event) => {
      const ev = event.payload;

      set((state) => {
        if (!state.currentTask) return state;
        if (ev.task_id && ev.task_id !== state.currentTask.id) return state;

        const evWithTimestamp = { ...ev, timestamp: ev.timestamp ?? Date.now() };
        const newOutput = [...state.currentTask.output, { ...evWithTimestamp, task_id: state.currentTask.id }];
        let newStatus = state.currentTask.status;

        if (ev.event_type === "completed") {
          newStatus = "completed";
        } else if (ev.event_type === "error") {
          newStatus = "error";
        }

        return {
          currentTask: {
            ...state.currentTask,
            status: newStatus,
            output: newOutput,
            error: ev.event_type === "error" ? ev.content : state.currentTask.error,
          },
        };
      });
    });

    set({ _unlisten: unlisten });
  },
}));
