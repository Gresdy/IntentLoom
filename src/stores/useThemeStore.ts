import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeState {
  mode: ThemeMode;
  accentColor: string;
  fontSize: "small" | "medium" | "large";
  sidebarCollapsed: boolean;
  fontSizeValue: number;
  
  setMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setFontSize: (size: "small" | "medium" | "large") => void;
  toggleSidebar: () => void;
  applyTheme: () => void;
}

const FONT_SIZES = {
  small: 13,
  medium: 14,
  large: 15,
};

const ACCENT_COLORS = [
  { name: "珊瑚红", value: "#d97757" },
  { name: "天蓝色", value: "#3b82f6" },
  { name: "翠绿色", value: "#10b981" },
  { name: "紫罗兰", value: "#8b5cf6" },
  { name: "玫瑰粉", value: "#f43f5e" },
  { name: "琥珀金", value: "#f59e0b" },
];

const MATCH_MEDIA = typeof window !== "undefined" 
  ? window.matchMedia("(prefers-color-scheme: dark)") 
  : null;

function getSystemTheme(): "dark" | "light" {
  if (!MATCH_MEDIA) return "dark";
  return MATCH_MEDIA.matches ? "dark" : "light";
}

function applyCSSVariables(mode: ThemeMode, accentColor: string, fontSize: "small" | "medium" | "large") {
  const root = document.documentElement;
  const resolvedMode = mode === "system" ? getSystemTheme() : mode;
  
  root.setAttribute("data-theme", resolvedMode);
  root.style.setProperty("--accent", accentColor);
  root.style.setProperty("--font-size", `${FONT_SIZES[fontSize]}px`);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      accentColor: "#d97757",
      fontSize: "medium",
      sidebarCollapsed: true,
      fontSizeValue: FONT_SIZES.medium,

      setMode: (mode) => {
        set({ mode });
        const state = get();
        state.applyTheme();
      },

      setAccentColor: (color) => {
        set({ accentColor: color });
        const state = get();
        state.applyTheme();
      },

      setFontSize: (size) => {
        set({ fontSize: size, fontSizeValue: FONT_SIZES[size] });
        const state = get();
        state.applyTheme();
      },

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      applyTheme: () => {
        const { mode, accentColor, fontSize } = get();
        applyCSSVariables(mode, accentColor, fontSize);
      },
    }),
    {
      name: "intentloom-theme",
      onRehydrateStorage: () => (state) => {
        state?.applyTheme();
      },
    }
  )
);

// 预置颜色列表供 UI 使用
export const ACCENT_COLORS_LIST = ACCENT_COLORS;
export const FONT_SIZE_OPTIONS = [
  { label: "小", value: "small" as const },
  { label: "中", value: "medium" as const },
  { label: "大", value: "large" as const },
];
