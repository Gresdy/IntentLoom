import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { RemoteSkill, LocalSkill, IdeSkill, IdeOption, DownloadTask, MarketSortMode, MarketStatus, Overview } from "./skillTypes";
import { normalizeSkillName } from "./skillUtils";
import { STORAGE_KEYS, defaultMarketStatuses, defaultEnabledMarkets } from "./skillConstants";

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
  confirmInstallToIde: (installTarget: "ide" | "project", targetIds: string[]) => Promise<void>;

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

  setActiveTab: (tab: "local" | "market" | "ide" | "projects" | "settings") => void;
}

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
      console.error("[skills]", "Search failed. Please try again.");
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
      console.error("[skills]", "Failed to scan local skills.");
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
      }
    } catch (e) {
      console.error("Import failed", e);
      console.error("[skills]", "Import failed.");
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
      }
    } catch (e) {
      console.error("Export failed", e);
      console.error("[skills]", "Export failed.");
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
    } catch (e) {
      console.error("Delete failed", e);
      console.error("[skills]", "Delete failed.");
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

  confirmInstallToIde: async (installTarget, targetIds) => {
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

      await get().scanLocalSkills();
    } catch (e) {
      console.error("Install failed", e);
      console.error("[skills]", "Installation failed.");
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
      await get().scanLocalSkills();
    } catch (e) {
      console.error("Uninstall failed", e);
      console.error("[skills]", "Uninstall failed.");
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
      console.error("[skills]", "Please fill in IDE name and directory.");
      return;
    }

    const exists = customIdeOptions.some((o) => o.label === customIdeName);
    if (exists) {
      console.error("[skills]", "IDE name already exists.");
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
      console.error("[skills]", "Failed to open directory.");
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
      await get().scanLocalSkills();
    } catch (e) {
      console.error("Adopt failed", e);
      console.error("[skills]", "Failed to add to central management.");
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

  setActiveTab: (tab) => set({ activeTab: tab }),
}));
