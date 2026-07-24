/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import UnoCSS from "unocss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), UnoCSS()],
  clearScreen: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@cc-switch": fileURLToPath(new URL("./src/cc-switch", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("/src/cc-switch/config/") ||
            id.includes("/src/cc-switch/components/providers/")
          ) {
            return "cc-switch-providers";
          }
          if (
            id.includes("/src/cc-switch/components/settings/") ||
            id.includes("/src/cc-switch/components/proxy/") ||
            id.includes("/src/cc-switch/components/usage/")
          ) {
            return "cc-switch-settings";
          }
          if (id.includes("/src/cc-switch/components/sessions/"))
            return "cc-switch-sessions";
          if (id.includes("monaco-editor")) return "editor-monaco";
          if (id.includes("@codemirror") || id.includes("/codemirror/"))
            return "editor-codemirror";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("micromark")
          ) {
            return "markdown";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
