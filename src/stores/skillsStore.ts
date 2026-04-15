import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { RemoteSkill, LocalSkill, IdeSkill, IdeOption, DownloadTask, MarketSortMode, MarketStatus, ProjectConfig, Overview } from "../composables/types";
import { normalizeSkillName } from "../composables/utils";
import { STORAGE_KEYS, defaultMarketStatuses, defaultEnabledMarkets } from "../composables/constants";

// Update state
interface UpdateState {
  checking: boolean;
  updateAvailable: boolean;
  latestVersion: string;
  downloading: boolean;
  downloadProgress: number;
  downloaded: boolean;
  upToDate: boolean;
  error: string | null;
}

interface SkillsState {
  // Market search
  query: string;
  results: RemoteSkill[];
  loading: boolean;
  hasMore: boolean;
  marketSortMode: MarketSortMode;
  marketConfigs: Record<string, string>;
  marketStatuses: MarketStatus[];
  enabledMarkets: Record<string, boolean>;
  downloadingIds: Set<string>;
  recentTaskStatus: Record<string, "download" | "update">;

  // Local skills
  localSkills: LocalSkill[];
  localLoading: boolean;
  installingId: string | null;
  updatingId: string | null;
  localSkillNameSet: Set<string>;

  // IDE
  ideOptions: IdeOption[];
  selectedIdeFilter: string;
  customIdeName: string;
  customIdeDir: string;
  customIdeOptions: IdeOption[];
  filteredIdeSkills: IdeSkill[];

  // Download queue
  downloadQueue: DownloadTask[];

  // Install modal
  showInstallModal: boolean;
  pendingInstallSkill: LocalSkill | null;

  // Uninstall modal
  showUninstallModal: boolean;
  uninstallTargetName: string;
  uninstallMode: "ide" | "local";
  uninstallTarget: string | null;

  // Loading overlay
  busy: boolean;
  busyText: string;

  // Active tab
  activeTab: "local" | "market" | "ide" | "projects" | "settings";

  // Toast
  toasts: Array<{ id: string; type: "success" | "error" | "info"; content: string }>;

  // Update store
  update: UpdateState;
  appName: string;
  currentVersion: string;

  // Project
  projects: ProjectConfig[];
  selectedProjectId: string | null;

  // Actions
  setQuery: (query: string) => void;
  setMarketSortMode: (mode: MarketSortMode) => void;
  searchMarketplace: (newSearch?: boolean, forceRefresh?: boolean) => Promise<void>;
  downloadSkill: (skill: RemoteSkill) => void;
  updateSkill: (skill: RemoteSkill) => void;

  scanLocalSkills: () => Promise<void>;
  importLocalSkill: () => Promise<void>;
  exportLocalSkills: (skills: LocalSkill[]) => Promise<void>;
  deleteLocalSkills: (skills: LocalSkill[]) => Promise<void>;
  updateLocalSkill: (skill: LocalSkill) => void;
  updateLocalSkills: (skills: LocalSkill[]) => void;

  openInstallModal: (skill: LocalSkill) => void;
  closeInstallModal: () => void;
  confirmInstallToIde: (installTarget: "ide" | "project", targetIds: string[], projects: ProjectConfig[]) => Promise<void>;

  openUninstallModal: (targetName: string, mode: "ide" | "local", target: string) => void;
  openUninstallManyModal: (paths: string[]) => void;
  confirmUninstall: () => Promise<void>;
  cancelUninstall: () => void;

  openDeleteLocalModal: (skills: LocalSkill[]) => void;

  addCustomIde: () => void;
  removeCustomIde: (label: string) => void;

  openSkillDirectory: (path: string) => void;
  adoptIdeSkill: (skill: IdeSkill) => void;
  adoptManyIdeSkills: (skills: IdeSkill[]) => void;

  saveMarketConfigs: (configs: Record<string, string>, enabled: Record<string, boolean>) => void;
  addManualSkill: (sourceUrl: string, name: string) => void;

  retryDownload: (taskId: string) => void;
  removeFromQueue: (taskId: string) => void;

  loadAppInfo: () => Promise<void>;
  checkUpdate: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installAndRestart: () => Promise<void>;

  loadProjects: () => void;
  addProject: (path: string, name: string, ideTargets: string[]) => ProjectConfig | undefined;
  removeProject: (projectId: string) => boolean;
  updateProjectIdeTargets: (projectId: string, ideTargets: string[]) => boolean;
  updateDetectedIdeDirs: (projectId: string, detectedIdeDirs: Array<{ label: string; relativeDir: string; absolutePath: string }>) => boolean;

  addToast: (type: "success" | "error" | "info", content: string) => void;
  removeToast: (id: string) => void;

  setActiveTab: (tab: "local" | "market" | "ide" | "projects" | "settings") => void;
}

let updateObj: any = null;

export const useSkillsStore = create<SkillsState>((set, get) => ({
  // Initial state
  query: "",
  results: [],
  loading: false,
  hasMore: false,
  marketSortMode: "default",
  marketConfigs: {},
  marketStatuses: [...defaultMarketStatuses],
  enabledMarkets: { ...defaultEnabledMarkets },
  downloadingIds: new Set(),
  recentTaskStatus: {},

  localSkills: [],
  localLoading: false,
  installingId: null,
  updatingId: null,
  localSkillNameSet: new Set(),

  ideOptions: [],
  selectedIdeFilter: "",
  customIdeName: "",
  customIdeDir: "",
  customIdeOptions: [],
  filteredIdeSkills: [],

  downloadQueue: [],

  showInstallModal: false,
  pendingInstallSkill: null,

  showUninstallModal: false,
  uninstallTargetName: "",
  uninstallMode: "ide",
  uninstallTarget: null,

  busy: false,
  busyText: "",

  activeTab: "local",

  toasts: [],

  update: {
    checking: false,
    updateAvailable: false,
    latestVersion: "",
    downloading: false,
    downloadProgress: 0,
    downloaded: false,
    upToDate: false,
    error: null,
  },
  appName: "Skills Manager",
  currentVersion: "0.3.5",

  projects: [],
  selectedProjectId: null,

  // Actions
  setQuery: (query) => set({ query }),

  setMarketSortMode: (mode) => set({ marketSortMode: mode }),

  searchMarketplace: async (newSearch = true, forceRefresh = false) => {
    const { query } = get();
    if (get().loading) return;

    set({ loading: true });

    try {
      const response = await invoke<{
        skills: RemoteSkill[];
        total: number;
        limit: number;
        offset: number;
        market_statuses: MarketStatus[];
      }>("search_marketplaces", {
        query: query.trim(),
        limit: 20,
        offset: newSearch ? 0 : get().results.length,
        apiKeys: get().marketConfigs,
        enabledMarkets: get().enabledMarkets,
      });

      set({
        results: newSearch || forceRefresh ? response.skills : [...get().results, ...response.skills],
        hasMore: response.skills.length === 20,
        marketStatuses: response.market_statuses,
      });
    } catch (e) {
      console.error("Search failed", e);
      get().addToast("error", "Search failed. Please try again.");
    } finally {
      set({ loading: false });
    }
  },

  downloadSkill: (skill) => {
    const task: DownloadTask = {
      id: skill.id,
      name: skill.name,
      status: "pending",
    };
    set((state) => ({
      downloadQueue: [...state.downloadQueue, task],
      downloadingIds: new Set([...state.downloadingIds, skill.id]),
      recentTaskStatus: { ...state.recentTaskStatus, [skill.id]: "download" },
    }));
  },

  updateSkill: (skill) => {
    const task: DownloadTask = {
      id: skill.id,
      name: skill.name,
      status: "pending",
    };
    set((state) => ({
      downloadQueue: [...state.downloadQueue, task],
      downloadingIds: new Set([...state.downloadingIds, skill.id]),
      recentTaskStatus: { ...state.recentTaskStatus, [skill.id]: "update" },
    }));
  },

  scanLocalSkills: async () => {
    set({ localLoading: true });
    try {
      const overview = await invoke<Overview>("scan_overview", { request: { projectDir: null, ideDirs: [] } });

      // Combine manager skills and IDE skills into localSkills
      // Convert IdeSkill to LocalSkill format for the local tab display
      const allLocalSkills = [
        ...overview.managerSkills,
        ...overview.ideSkills.map((ideSkill) => ({
          id: ideSkill.id,
          name: ideSkill.name,
          description: "", // IdeSkill doesn't have description
          path: ideSkill.path,
          source: ideSkill.source,
          sourceUrl: undefined as string | undefined,
          ide: ideSkill.ide,
          usedBy: [],
        })),
      ];

      const nameSet = new Set(allLocalSkills.map((s) => normalizeSkillName(s.name)));

      // Build ideOptions from ide skills
      const ideLabels = [...new Set(overview.ideSkills.map((s) => s.ide))];
      const defaultIdeOptions: IdeOption[] = [
        { id: "antigravity", label: "Antigravity", globalDir: "" },
        { id: "claude", label: "Claude", globalDir: "" },
        { id: "codebuddy", label: "CodeBuddy", globalDir: "" },
        { id: "codex", label: "Codex", globalDir: "" },
        { id: "cursor", label: "Cursor", globalDir: "" },
        { id: "kiro", label: "Kiro", globalDir: "" },
        { id: "qoder", label: "Qoder", globalDir: "" },
        { id: "trae", label: "Trae", globalDir: "" },
        { id: "vscode", label: "VSCode", globalDir: "" },
        { id: "windsurf", label: "Windsurf", globalDir: "" },
      ];
      const ideOptions = defaultIdeOptions.filter((o) => ideLabels.includes(o.label));

      set({
        localSkills: allLocalSkills,
        localSkillNameSet: nameSet,
        filteredIdeSkills: overview.ideSkills,
        ideOptions: ideOptions,
      });
    } catch (e) {
      console.error("Scan failed", e);
      get().addToast("error", "Failed to scan local skills.");
    } finally {
      set({ localLoading: false });
    }
  },

  importLocalSkill: async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Skill Directory",
      });

      if (selected && typeof selected === "string") {
        set({ busy: true, busyText: "Importing..." });
        await invoke("import_local_skill", { dir: selected });
        await get().scanLocalSkills();
        get().addToast("success", "Skill imported successfully.");
      }
    } catch (e) {
      console.error("Import failed", e);
      get().addToast("error", "Import failed.");
    } finally {
      set({ busy: false, busyText: "" });
    }
  },

  exportLocalSkills: async (skills) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const target = await open({
        directory: true,
        multiple: false,
        title: "Select Export Path",
      });

      if (target && typeof target === "string") {
        set({ busy: true, busyText: "Exporting..." });
        const paths = skills.map((s) => s.path);
        await invoke("export_local_skills", { paths, targetDir: target });
        get().addToast("success", `Exported to ${target}`);
      }
    } catch (e) {
      console.error("Export failed", e);
      get().addToast("error", "Export failed.");
    } finally {
      set({ busy: false, busyText: "" });
    }
  },

  deleteLocalSkills: async (skills) => {
    try {
      set({ busy: true, busyText: "Deleting..." });
      const paths = skills.map((s) => s.path);
      await invoke("delete_local_skills", { paths });
      await get().scanLocalSkills();
      get().addToast("success", "Deleted successfully.");
    } catch (e) {
      console.error("Delete failed", e);
      get().addToast("error", "Delete failed.");
    } finally {
      set({ busy: false, busyText: "" });
    }
  },

  updateLocalSkill: (skill) => {
    get().updateLocalSkills([skill]);
  },

  updateLocalSkills: (skills) => {
    skills.forEach((skill) => {
      if (skill.sourceUrl?.trim()) {
        const remoteSkill: RemoteSkill = {
          id: skill.sourceUrl,
          name: skill.name,
          namespace: "",
          sourceUrl: skill.sourceUrl,
          description: skill.description,
          author: "",
          installs: 0,
          stars: 0,
          marketId: "local",
          marketLabel: "local",
        };
        get().downloadSkill(remoteSkill);
      }
    });
  },

  openInstallModal: (skill) => {
    set({ showInstallModal: true, pendingInstallSkill: skill });
  },

  closeInstallModal: () => {
    set({ showInstallModal: false, pendingInstallSkill: null });
  },

  confirmInstallToIde: async (installTarget, targetIds, _projects) => {
    const { pendingInstallSkill } = get();
    if (!pendingInstallSkill) return;

    set({ busy: true, busyText: "Installing...", showInstallModal: false });

    try {
      const targetIdeLabels = installTarget === "ide" ? targetIds : [];
      const targetProjectIds = installTarget === "project" ? targetIds : [];

      await invoke("install_skill", {
        skillPath: pendingInstallSkill.path,
        targetIdeLabels,
        targetProjectIds,
      });

      get().addToast("success", `Installed to ${installTarget}`);
      await get().scanLocalSkills();
    } catch (e) {
      console.error("Install failed", e);
      get().addToast("error", "Installation failed.");
    } finally {
      set({ busy: false, busyText: "", pendingInstallSkill: null });
    }
  },

  openUninstallModal: (targetName, mode, target) => {
    set({ showUninstallModal: true, uninstallTargetName: targetName, uninstallMode: mode, uninstallTarget: target });
  },

  openUninstallManyModal: (paths) => {
    set({
      showUninstallModal: true,
      uninstallTargetName: `${paths.length} skills`,
      uninstallMode: "ide",
      uninstallTarget: paths.join("|"),
    });
  },

  confirmUninstall: async () => {
    const { uninstallTarget, uninstallMode } = get();
    if (!uninstallTarget) return;

    set({ busy: true, busyText: "Uninstalling...", showUninstallModal: false });

    try {
      if (uninstallMode === "local") {
        const paths = uninstallTarget.split("|");
        await invoke("delete_local_skills", { paths });
      } else {
        const paths = uninstallTarget.split("|");
        await invoke("uninstall_skill_from_ides", { paths });
      }
      get().addToast("success", "Uninstalled successfully.");
      await get().scanLocalSkills();
    } catch (e) {
      console.error("Uninstall failed", e);
      get().addToast("error", "Uninstall failed.");
    } finally {
      set({ busy: false, busyText: "", uninstallTarget: null });
    }
  },

  cancelUninstall: () => {
    set({ showUninstallModal: false, uninstallTarget: null });
  },

  openDeleteLocalModal: (skills) => {
    set({
      showUninstallModal: true,
      uninstallTargetName: `${skills.length} skills`,
      uninstallMode: "local",
      uninstallTarget: skills.map((s) => s.path).join("|"),
    });
  },

  addCustomIde: () => {
    const { customIdeName, customIdeDir, customIdeOptions } = get();
    if (!customIdeName.trim() || !customIdeDir.trim()) {
      get().addToast("error", "Please fill in IDE name and directory.");
      return;
    }

    const exists = customIdeOptions.some((o) => o.label === customIdeName);
    if (exists) {
      get().addToast("error", "IDE name already exists.");
      return;
    }

    const newOption: IdeOption = {
      id: `custom-${Date.now()}`,
      label: customIdeName.trim(),
      globalDir: customIdeDir.trim(),
    };

    set({
      customIdeOptions: [...customIdeOptions, newOption],
      customIdeName: "",
      customIdeDir: "",
    });
  },

  removeCustomIde: (label) => {
    set((state) => ({
      customIdeOptions: state.customIdeOptions.filter((o) => o.label !== label),
    }));
  },

  openSkillDirectory: async (path) => {
    try {
      await invoke("open_directory", { path });
    } catch (e) {
      console.error("Failed to open directory", e);
      get().addToast("error", "Failed to open directory.");
    }
  },

  adoptIdeSkill: (skill) => {
    get().adoptManyIdeSkills([skill]);
  },

  adoptManyIdeSkills: async (skills) => {
    set({ busy: true, busyText: "Adding to central management..." });
    try {
      const paths = skills.map((s) => s.path);
      await invoke("adopt_ide_skills", { paths });
      get().addToast("success", `Managed ${skills.length} skills.`);
      await get().scanLocalSkills();
    } catch (e) {
      console.error("Adopt failed", e);
      get().addToast("error", "Failed to add to central management.");
    } finally {
      set({ busy: false, busyText: "" });
    }
  },

  saveMarketConfigs: (configs, enabled) => {
    set({
      marketConfigs: configs,
      enabledMarkets: enabled,
    });
    localStorage.setItem(STORAGE_KEYS.MARKET_CONFIGS, JSON.stringify(configs));
    localStorage.setItem(STORAGE_KEYS.ENABLED_MARKETS, JSON.stringify(enabled));
  },

  addManualSkill: (sourceUrl, name) => {
    get().downloadSkill({
      id: sourceUrl,
      name,
      sourceUrl,
      description: "Manually added skill",
      author: "",
      stars: 0,
      installs: 0,
      marketLabel: "manual",
      marketId: "manual",
    } as RemoteSkill);
  },

  retryDownload: (taskId) => {
    set((state) => ({
      downloadQueue: state.downloadQueue.map((t) =>
        t.id === taskId ? { ...t, status: "pending" as const, error: undefined } : t
      ),
    }));
  },

  removeFromQueue: (taskId) => {
    set((state) => {
      const newDownloadingIds = new Set(state.downloadingIds);
      newDownloadingIds.delete(taskId);

      const { [taskId]: _, ...newRecentStatus } = state.recentTaskStatus;

      return {
        downloadQueue: state.downloadQueue.filter((t) => t.id !== taskId),
        downloadingIds: newDownloadingIds,
        recentTaskStatus: newRecentStatus,
      };
    });
  },

  loadAppInfo: async () => {
    try {
      const { getName, getVersion } = await import("@tauri-apps/api/app");
      const name = await getName();
      const version = await getVersion();
      set({ appName: name, currentVersion: version });
    } catch {
      // Use defaults
    }
  },

  checkUpdate: async () => {
    const { update } = get();
    if (update.checking) return;

    set((s) => ({ update: { ...s.update, checking: true, updateAvailable: false, upToDate: false, downloaded: false, error: null } }));

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      updateObj = await check();
      if (updateObj) {
        set((s) => ({ update: { ...s.update, latestVersion: updateObj!.version, updateAvailable: true } }));
      } else {
        set((s) => ({ update: { ...s.update, upToDate: true } }));
      }
    } catch (e) {
      set((s) => ({ update: { ...s.update, error: e instanceof Error ? e.message : "Update check failed" } }));
    } finally {
      set((s) => ({ update: { ...s.update, checking: false } }));
    }
  },

  downloadUpdate: async () => {
    if (!updateObj) return;

    set((s) => ({ update: { ...s.update, downloading: true, downloadProgress: 0 } }));

    try {
      await updateObj.downloadAndInstall((event: any) => {
        switch (event.event) {
          case "Started":
            set((s) => ({ update: { ...s.update, downloadProgress: 0 } }));
            break;
          case "Progress":
            set((s) => ({ update: { ...s.update, downloadProgress: Math.min(s.update.downloadProgress + 5, 90) } }));
            break;
          case "Finished":
            set((s) => ({ update: { ...s.update, downloadProgress: 100, downloaded: true, downloading: false } }));
            break;
        }
      });
    } catch (e) {
      set((s) => ({ update: { ...s.update, error: e instanceof Error ? e.message : "Download failed", downloading: false } }));
    }
  },

  installAndRestart: async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set((s) => ({ update: { ...s.update, error: e instanceof Error ? e.message : "Restart failed" } }));
    }
  },

  loadProjects: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const projects = parsed.filter(
        (item: any) =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.path === "string" &&
          Array.isArray(item.ideTargets)
      );
      set({ projects });
      if (projects.length > 0 && !get().selectedProjectId) {
        set({ selectedProjectId: projects[0].id });
      }
    } catch {
      // Ignore
    }
  },

  addProject: (path, name, ideTargets) => {
    const { projects } = get();
    const existing = projects.find((p) => p.path === path);
    if (existing) return existing;

    const id = `project-${path.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}`;
    const newProject: ProjectConfig = {
      id,
      name,
      path,
      ideTargets,
      detectedIdeDirs: [],
    };

    const newProjects = [...projects, newProject].sort((a, b) => a.name.localeCompare(b.name));
    set({ projects: newProjects, selectedProjectId: id });
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(newProjects));
    return newProject;
  },

  removeProject: (projectId) => {
    const { projects, selectedProjectId } = get();
    const index = projects.findIndex((p) => p.id === projectId);
    if (index === -1) return false;

    const newProjects = projects.filter((p) => p.id !== projectId);
    set({
      projects: newProjects,
      selectedProjectId: selectedProjectId === projectId ? newProjects[0]?.id || null : selectedProjectId,
    });
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(newProjects));
    return true;
  },

  updateProjectIdeTargets: (projectId, ideTargets) => {
    const { projects } = get();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return false;

    project.ideTargets = ideTargets;
    set({ projects: [...projects] });
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    return true;
  },

  updateDetectedIdeDirs: (projectId, detectedIdeDirs) => {
    const { projects } = get();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return false;

    project.detectedIdeDirs = detectedIdeDirs;
    set({ projects: [...projects] });
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    return true;
  },

  addToast: (type, content) => {
    const id = `toast-${Date.now()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, content }],
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, 3000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
}));
