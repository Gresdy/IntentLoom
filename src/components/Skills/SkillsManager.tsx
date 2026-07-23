/**
 * SkillsManager - Entry point for the migrated xingkongliang/skills-manager
 * module. Wraps the migrated AppContext + views and embeds them inside
 * IntentLoom's shell so the user can reach them from Settings.
 *
 * Layout:
 *   - Header: title + 4 uniform chips (no color coding — only the active
 *     one is filled).
 *   - Two columns: left = at-a-glance skill overview (counts + status),
 *     right = the active tab's content.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppProvider, useApp } from "@/skills/context/AppContext";
import { toast } from "sonner";
import { ThemeProvider } from "@/skills/context/ThemeContext";
import { MySkills } from "@/skills/views/MySkills";
import { InstallSkills } from "@/skills/views/InstallSkills";
import { Dashboard } from "@/skills/views/Dashboard";
import { Settings } from "@/skills/views/Settings";
import { applyTextSize } from "@/skills/lib/textScale";
import { useThemeStore } from "@/stores/useThemeStore";
import { Sparkles, Library, Download, ChartLine, Cog, HardDrive } from "lucide-react";
// Scoped design-token bridge from the migrated skills-manager.
import "@/skills/index.css";

type SkillsTab = "library" | "install" | "dashboard" | "settings";

const TAB_ITEMS: { id: SkillsTab; label: string; icon: ReactNode }[] = [
  { id: "library", label: "Skills 库", icon: <Library size={14} /> },
  { id: "install", label: "安装", icon: <Download size={14} /> },
  { id: "dashboard", label: "总览", icon: <ChartLine size={14} /> },
  { id: "settings", label: "设置", icon: <Cog size={14} /> },
];

function Overview() {
  // Pure presentational overview derived from current AppContext state.
  // No new IPC — just re-uses the same data the migrated views already
  // load, so the numbers stay in sync without extra requests.
  const { tools, managedSkills, projects } = useApp() as any;
  const enabledTools = useMemo(
    () => (Array.isArray(tools) ? tools.filter((t: any) => t?.enabled).length : 0),
    [tools],
  );
  const installed = managedSkills?.length ?? 0;
  const needsUpdate = useMemo(
    () => (Array.isArray(managedSkills) ? managedSkills.filter((s: any) => s?.update_status && s.update_status !== "up_to_date").length : 0),
    [managedSkills],
  );
  const projectsCount = Array.isArray(projects) ? projects.length : 0;

  const cells = [
    { label: "已安装", value: installed, hint: "已管理的 Skills" },
    { label: "待更新", value: needsUpdate, hint: "可升级版本" },
    { label: "可用 Agent", value: enabledTools, hint: "已启用的目标" },
    { label: "项目", value: projectsCount, hint: "关联工程" },
  ];

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border-subtle bg-bg-soft p-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-fg-faint">
              {c.label}
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">
              {c.value}
            </div>
            <div className="text-[11px] text-fg-faint">{c.hint}</div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center gap-2 rounded-md border border-border-subtle bg-bg-soft px-3 py-2 text-[11px] text-fg-faint">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Skills 服务已就绪 — 切换上方 tab 管理、浏览或配置。
      </div>
    </div>
  );
}

function SkillsContent() {
  const [tab, setTab] = useState<SkillsTab>("library");
  const [scanning, setScanning] = useState(false);
  // AppProvider exposes a scanLocalSkills helper that walks the standard
  // agent skill dirs (~/.claude/skills, ~/.hermes/skills, …) and writes
  // results into the discovered_skills table. AppContext's
  // refreshManagedSkills is called after to make the new skills appear.
  // Older builds without this wiring simply degrade to "no button".
  const app = useApp() as any;
  const refreshManagedSkills = app.refreshManagedSkills;
  const scanLocalSkills = app.scanLocalSkills as
    | (() => Promise<{ tools_scanned: number; skills_found: number }>)
    | undefined;

  const handleScanLocal = async () => {
    if (!scanLocalSkills || scanning) return;
    setScanning(true);
    try {
      const result = await scanLocalSkills();
      if (typeof refreshManagedSkills === "function") {
        await refreshManagedSkills();
      }
      if (result.skills_found === 0) {
        toast.info("未在本机 ~/.claude / ~/.hermes / ~/.gemini 等目录下找到 skill");
      } else {
        toast.success(
          `扫描完成:${result.tools_scanned} 个 agent 中发现 ${result.skills_found} 个本地 skill`,
        );
      }
    } catch (e) {
      toast.error(`扫描失败:${String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    const stored = root.getAttribute("data-text-size") || "100";
    applyTextSize(stored);
  }, []);

  const view = (() => {
    switch (tab) {
      case "install": return <InstallSkills />;
      case "settings": return <Settings />;
      case "dashboard": return <Dashboard />;
      case "library":
      default: return <MySkills />;
    }
  })();

  return (
    <div className="skills-scope flex h-full w-full flex-col bg-bg text-fg">
      {/* Header — uniform chip row, only the active one is filled */}
      <div className="flex items-center gap-1.5 border-b border-border-subtle bg-bg-soft px-3 py-2">
        <div className="mr-2 flex items-center gap-1.5 pl-0.5 text-sm font-semibold text-fg">
          <Sparkles size={14} className="ilo-fg-accent" />
          Skills
        </div>
        <div className="ml-1 flex flex-1 items-center gap-1">
          {TAB_ITEMS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs " +
                  (active
                    ? "bg-accent text-accent-fg"
                    : "text-fg-dim hover:bg-bg-elev")
                }
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
          {scanLocalSkills ? (
            <button
              onClick={handleScanLocal}
              disabled={scanning}
              title="扫描 ~/.claude/skills、~/.hermes/skills 等本地 agent skill 目录"
              className="ml-auto mr-2 inline-flex items-center gap-1 rounded-md border border-border-subtle bg-bg-soft px-2 py-1 text-xs text-fg-dim transition-colors hover:border-accent hover:text-fg disabled:opacity-60"
            >
              <HardDrive size={12} className={scanning ? "animate-pulse" : ""} />
              <span>{scanning ? "扫描中…" : "扫描本地"}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Two columns: left = overview, right = active tab content */}
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] overflow-hidden">
        <aside className="border-r border-border-subtle bg-bg-elev/50 overflow-y-auto">
          <Overview />
        </aside>
        <main className="min-w-0 overflow-y-auto">{view}</main>
      </div>
    </div>
  );
}

export function SkillsManager() {
  useThemeStore((s) => s.mode);
  return (
    <ThemeProvider>
      <AppProvider>
        <SkillsContent />
      </AppProvider>
    </ThemeProvider>
  );
}
