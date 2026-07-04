/**
 * SkillsManager - Entry point for the migrated xingkongliang/skills-manager
 * module. Wraps the migrated AppContext + views and embeds them inside
 * IntentLoom's shell so the user can reach them from the left nav / Settings.
 *
 * The migrated code lives in `src/skills/` and is treated as a self-contained
 * sub-app: it ships its own React context, i18n, theme provider, and CSS.
 * This component picks the most useful surface (MySkills) and provides a
 * thin tab bar to jump between the migrated Library / Install / Settings /
 * Dashboard views, all sharing the migrated AppProvider state.
 */
import { useEffect, useState, type ReactNode } from "react";
import { AppProvider } from "@/skills/context/AppContext";
import { ThemeProvider, useThemeContext } from "@/skills/context/ThemeContext";
import { Toaster } from "sonner";
import { MySkills } from "@/skills/views/MySkills";
import { InstallSkills } from "@/skills/views/InstallSkills";
import { Dashboard } from "@/skills/views/Dashboard";
import { Settings } from "@/skills/views/Settings";
import { applyTextSize } from "@/skills/lib/textScale";
import { useThemeStore } from "@/stores/useThemeStore";
import { LayoutGrid, Library, Download, Cog, ChartLine } from "lucide-react";
// Scoped design-token bridge from the migrated skills-manager — maps
// its --color-* / --bg-* / --surface-* names onto IntentLoom's own
// tokens so the panel visually inherits the host app's theme.
import "@/skills/index.css";

type SkillsTab = "library" | "install" | "settings" | "dashboard";

function ThemedToaster() {
  const { resolvedTheme } = useThemeContext();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        },
      }}
    />
  );
}

const TABS: { id: SkillsTab; label: string; icon: ReactNode }[] = [
  { id: "library",   label: "Skills 库",   icon: <Library size={14} /> },
  { id: "install",   label: "安装 Skills",  icon: <Download size={14} /> },
  { id: "dashboard", label: "总览",         icon: <ChartLine size={14} /> },
  { id: "settings",  label: "设置",         icon: <Cog size={14} /> },
];

function SkillsContent() {
  const [tab, setTab] = useState<SkillsTab>("library");

  // Apply parent text scale setting to the migrated shell.
  useEffect(() => {
    const root = document.documentElement;
    const stored = root.getAttribute("data-text-size") || "100";
    applyTextSize(stored);
  }, []);

  const view = (() => {
    switch (tab) {
      case "install":   return <InstallSkills />;
      case "settings":  return <Settings />;
      case "dashboard": return <Dashboard />;
      case "library":
      default:          return <MySkills />;
    }
  })();

  return (
    <div className="skills-scope flex h-full w-full flex-col bg-bg text-fg">
      <div className="flex items-center gap-1 border-b border-border-subtle bg-surface px-4 py-2">
        <LayoutGrid size={16} className="mr-2 ilo-fg-accent" />
        <span className="text-sm font-semibold mr-3">Skills</span>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`chip ${tab === t.id ? "active" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <main className="flex-1 min-w-0 overflow-auto">{view}</main>
      <ThemedToaster />
    </div>
  );
}

export function SkillsManager() {
  // Pull the parent theme store so the migrated ThemeProvider stays in sync
  // when the user toggles the parent theme. The ThemeProvider reads from
  // its own hook, but we keep the subscription here so the Skills shell
  // re-renders on theme changes.
  useThemeStore((s) => s.mode);
  return (
    <ThemeProvider>
      <AppProvider>
        <SkillsContent />
      </AppProvider>
    </ThemeProvider>
  );
}
