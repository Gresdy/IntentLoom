import { defineConfig, presetUno, presetIcons } from "unocss";

export default defineConfig({
  presets: [presetUno(), presetIcons()],
  shortcuts: {
    "flex-center": "flex items-center justify-center",
    "btn": "px-4 py-2 rounded cursor-pointer transition-colors",
    "btn-primary": "px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600",
  },
});
