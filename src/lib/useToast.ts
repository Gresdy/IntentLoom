import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newToast = { ...toast, id };
    
    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // 自动移除
    const duration = toast.duration ?? 3000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }

    return id;
  },
  
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  
  clearToasts: () => set({ toasts: [] }),
}));

// 便捷方法
export const toast = {
  success: (message: string, duration?: number) => 
    useToastStore.getState().addToast({ type: "success", message, duration }),
  error: (message: string, duration?: number) => 
    useToastStore.getState().addToast({ type: "error", message, duration }),
  warning: (message: string, duration?: number) => 
    useToastStore.getState().addToast({ type: "warning", message, duration }),
  info: (message: string, duration?: number) => 
    useToastStore.getState().addToast({ type: "info", message, duration }),
};
