// Simple i18n implementation for React
import { useState } from "react";

const messages: Record<string, Record<string, any>> = {
  "zh-CN": {
    app: {
      tabs: {
        local: "已有 Skills",
        market: "Market",
        ide: "IDE 浏览",
        projects: "项目管理",
        settings: "设置"
      }
    },
    market: {
      title: "商店检索",
      searchPlaceholder: "输入关键字搜索技能...",
      search: "搜索",
      searching: "搜索中...",
      refresh: "刷新",
      refreshing: "刷新中...",
      manualAdd: "手动添加",
      manualAddTitle: "手动添加 Skill",
      manualUrlLabel: "来源 URL",
      manualUrlPlaceholder: "例如 https://github.com/owner/repo/tree/main/skills/foo",
      manualUrlHint: "支持 GitHub 仓库、GitHub 子目录和 ZIP 下载链接。",
      manualNameLabel: "技能名称（可选）",
      manualNamePlaceholder: "留空时自动推断",
      manualNameHint: "若无法从 URL 推断技能名，请手动填写。",
      manualCancel: "取消",
      manualSubmit: "加入下载队列",
      resultsTitle: "搜索结果",
      loadingHint: "正在加载技能列表...",
      emptyHint: "未找到匹配的技能。",
      meta: "作者 {author} • ⭐️ {stars} • ⬇️ {installs}",
      update: "更新",
      updated: "已更新",
      downloading: "正在更新...",
      download: "下载",
      downloaded: "已下载",
      queued: "排队中",
      unavailable: "暂不可用",
      source: "来源：{source}",
      viewSource: "查看",
      loadMore: "加载更多",
      sortLabel: "排序",
      sortDefault: "默认（按 Star）",
      sortStars: "按 Star 从高到低",
      sortInstalls: "按下载量从高到低"
    },
    local: {
      title: "已有 Skills",
      hint: "导入本地 Skill 需要选择包含 SKILL.md 的 Skill 文件夹。",
      total: "总数 {count}",
      filteredTotal: "显示 {shown} / {total}",
      selectAll: "全选",
      searchPlaceholder: "搜索名称、描述或路径",
      scanning: "正在扫描本地 Skills...",
      emptyHint: "暂无本地 Skill，请尝试从市场下载。",
      searchEmptyHint: "没有匹配的 Skill",
      install: "安装到编辑器",
      installSelected: "批量安装到编辑器 ({count})",
      updateOne: "更新",
      updateSelected: "更新选中 ({count})",
      exportOne: "导出",
      exportSelected: "导出选中 ({count})",
      import: "导入本地 Skill",
      openDir: "打开目录",
      deleteOne: "删除",
      deleteSelected: "删除选中 ({count})",
      deleteAll: "全部删除",
      processing: "处理中...",
      linked: "已关联",
      unused: "未关联"
    },
    ide: {
      title: "IDE 浏览",
      switchHint: "切换 IDE 查看其技能列表。",
      total: "当前列表 {count}",
      selectAll: "全选",
      addHint: "添加自定义 IDE（名称 + 相对路径或绝对路径）。",
      namePlaceholder: "IDE 名称",
      dirPlaceholder: "例如 .myide/skills",
      addButton: "添加 IDE",
      deleteButton: "删除",
      loading: "加载中...",
      emptyHint: "该 IDE 暂无 skills",
      sourceLink: "链接",
      sourceLocal: "本地",
      unmanaged: "未托管",
      openDir: "打开目录",
      adopt: "纳入统一管理",
      uninstall: "卸载",
      uninstallSelected: "卸载选中 ({count})",
      adoptSelected: "纳管选中 ({count})"
    },
    installModal: {
      selectTargetTitle: "选择安装目标",
      globalIde: "全局 IDE",
      project: "项目",
      noProjects: "暂无项目",
      installToIde: "安装到 IDE",
      installToProject: "安装到项目",
      cancel: "取消"
    },
    uninstallModal: {
      title: "确认卸载",
      hint: "将移除该 IDE 下的技能目录或软链接，无法恢复。",
      deleteTitle: "确认删除本地 Skill",
      deleteHint: "将从 Skills Manager 本地仓库删除所选 Skill，无法恢复。",
      cancel: "取消",
      confirm: "确认卸载",
      deleteConfirm: "确认删除"
    },
    loading: {
      title: "处理中"
    },
    messages: {
      selectSkillsForProject: "请为项目 {name} 选择要安装的 Skills"
    },
    errors: {
      fillIde: "请填写编辑器名称和目录。",
      ideExists: "IDE 名称已存在",
      projectNoIdeTargets: "项目尚未配置 IDE 目标，请先配置。"
    },
    marketSettings: {
      title: "市场管理",
      online: "在线",
      unavailable: "暂不可用",
      needsKey: "需要 API Key",
      cancel: "取消",
      save: "保存"
    },
    download: {
      title: "正在下载",
      pending: "等待中...",
      downloading: "下载中...",
      done: "完成",
      error: "下载失败",
      retry: "重试"
    },
    projects: {
      title: "项目管理",
      hint: "为不同项目配置独立的 Skills 环境。",
      add: "添加项目",
      addTitle: "添加新项目",
      addHint: "选择项目文件夹并输入项目名称。",
      remove: "移除",
      linkSkills: "安装 Skills",
      openDirectory: "打开目录",
      emptyHint: "暂无项目，点击上方按钮添加。",
      projectPath: "项目路径",
      projectName: "项目名称",
      selectIdeTargets: "选择 IDE 目标",
      configureHint: "选择该项目需要使用的 IDE，安装 Skills 时会链接到这些 IDE 的项目目录。",
      cancel: "取消",
      save: "保存",
      ideTargets: "IDE 目标：{count} 个",
      detected: "已检测：{count} 个",
      selectFolder: "选择项目文件夹",
      selectFolderButton: "选择文件夹",
      untitled: "未命名项目"
    },
    settings: {
      about: {
        title: "关于",
        checkUpdate: "检查更新",
        github: "GitHub"
      },
      update: {
        checking: "检查中...",
        downloading: "正在下载...",
        downloadAndInstall: "下载并安装",
        installAndRestart: "安装并重启",
        upToDate: "已是最新版本",
        newVersionAvailable: "发现新版本 {version}"
      }
    }
  },
  "en-US": {
    app: {
      tabs: {
        local: "Local Skills",
        market: "Market",
        ide: "IDE Browser",
        projects: "Projects",
        settings: "Settings"
      }
    },
    market: {
      title: "Marketplace Search",
      searchPlaceholder: "Search skills (name / description / author)",
      search: "Search",
      searching: "Searching...",
      refresh: "Refresh",
      refreshing: "Loading",
      manualAdd: "Manual Add",
      manualAddTitle: "Add Skill Manually",
      manualUrlLabel: "Source URL",
      manualUrlPlaceholder: "e.g. https://github.com/owner/repo/tree/main/skills/foo",
      manualUrlHint: "Supports GitHub repos, GitHub subdirectories, and ZIP download links.",
      manualNameLabel: "Skill Name (Optional)",
      manualNamePlaceholder: "Auto-detect when left blank",
      manualNameHint: "If the URL cannot be inferred, enter the skill name manually.",
      manualCancel: "Cancel",
      manualSubmit: "Queue Download",
      resultsTitle: "Results",
      loadingHint: "Loading...",
      emptyHint: "No results",
      meta: "Author {author} • ⭐️ {stars} • ⬇️ {installs}",
      update: "Update",
      updated: "Updated",
      downloading: "Updating...",
      download: "Download",
      downloaded: "Downloaded",
      queued: "In Queue",
      unavailable: "Unavailable",
      source: "Source: {source}",
      viewSource: "View",
      loadMore: "Load More",
      sortLabel: "Sort By",
      sortDefault: "Default (Stars)",
      sortStars: "Stars (High to Low)",
      sortInstalls: "Installs (High to Low)"
    },
    local: {
      title: "Local Skills",
      hint: "To import local skills, select the folder containing SKILL.md.",
      total: "Total {count}",
      filteredTotal: "Showing {shown} / {total}",
      selectAll: "Select all",
      searchPlaceholder: "Search name, description or path",
      scanning: "Scanning local skills...",
      emptyHint: "No local skills found. Try downloading some from the Market.",
      searchEmptyHint: "No matching skills",
      install: "Install to IDE",
      installSelected: "Batch install to IDE ({count})",
      updateOne: "Update",
      updateSelected: "Update Selected ({count})",
      exportOne: "Export",
      exportSelected: "Export selected ({count})",
      import: "Import Local Skill",
      openDir: "Open Folder",
      deleteOne: "Delete",
      deleteSelected: "Delete selected ({count})",
      deleteAll: "Delete all",
      processing: "Processing...",
      linked: "Linked",
      unused: "Not linked"
    },
    ide: {
      title: "IDE Browser",
      switchHint: "Switch IDE to view its skills.",
      total: "{count} skills",
      selectAll: "Select all",
      addHint: "Add custom IDE (name + relative or absolute path).",
      namePlaceholder: "IDE name",
      dirPlaceholder: "e.g. .myide/skills",
      addButton: "Add IDE",
      deleteButton: "Remove",
      loading: "Loading...",
      emptyHint: "No skills for this IDE",
      sourceLink: "Linked",
      sourceLocal: "Local",
      unmanaged: "Unmanaged",
      openDir: "Open Folder",
      adopt: "Manage Centrally",
      uninstall: "Uninstall",
      uninstallSelected: "Uninstall selected ({count})",
      adoptSelected: "Manage selected ({count})"
    },
    installModal: {
      selectTargetTitle: "Select Install Target",
      globalIde: "Global IDE",
      project: "Project",
      noProjects: "No projects",
      installToIde: "Install to IDE",
      installToProject: "Install to Project",
      cancel: "Cancel"
    },
    uninstallModal: {
      title: "Confirm uninstall",
      hint: "This will remove the directory or symlink. This cannot be undone.",
      deleteTitle: "Confirm local skill deletion",
      deleteHint: "This will remove the selected skills from Skills Manager local storage. This cannot be undone.",
      cancel: "Cancel",
      confirm: "Uninstall",
      deleteConfirm: "Delete"
    },
    loading: {
      title: "Processing"
    },
    messages: {
      selectSkillsForProject: "Select skills to install for project {name}"
    },
    errors: {
      fillIde: "Please fill in IDE name and directory.",
      ideExists: "IDE name already exists",
      projectNoIdeTargets: "Project has no IDE targets configured. Please configure first."
    },
    marketSettings: {
      title: "Market Settings",
      online: "Online",
      unavailable: "Unavailable",
      needsKey: "Needs API Key",
      cancel: "Cancel",
      save: "Save"
    },
    download: {
      title: "Downloading",
      pending: "Pending...",
      downloading: "Downloading...",
      done: "Done",
      error: "Download failed",
      retry: "Retry"
    },
    projects: {
      title: "Projects",
      hint: "Configure separate Skills environments for different projects.",
      add: "Add Project",
      addTitle: "Add New Project",
      addHint: "Select project folder and enter project name.",
      remove: "Remove",
      linkSkills: "Link Skills",
      openDirectory: "Open Directory",
      emptyHint: "No projects yet. Click the button above to add one.",
      projectPath: "Project Path",
      projectName: "Project Name",
      selectIdeTargets: "Select IDE Targets",
      configureHint: "Select IDEs that this project needs. Skills will be linked to these IDE directories in the project.",
      cancel: "Cancel",
      save: "Save",
      ideTargets: "IDE Targets: {count}",
      detected: "Detected: {count}",
      selectFolder: "Select Project Folder",
      selectFolderButton: "Select Folder",
      untitled: "Untitled Project"
    },
    settings: {
      about: {
        title: "About",
        checkUpdate: "Check for Updates",
        github: "GitHub"
      },
      update: {
        checking: "Checking...",
        downloading: "Downloading...",
        downloadAndInstall: "Download and Install",
        installAndRestart: "Install and Restart",
        upToDate: "Up to date",
        newVersionAvailable: "New version {version} available"
      }
    }
  }
};

type Locale = "zh-CN" | "en-US";

function getLocale(): Locale {
  const stored = localStorage.getItem("skillsManager.locale");
  if (stored === "zh-CN" || stored === "en-US") return stored;
  return navigator.language.startsWith("zh") ? "zh-CN" : "en-US";
}

function saveLocale(newLocale: Locale): void {
  localStorage.setItem("skillsManager.locale", newLocale);
}

function getNestedValue(obj: any, path: string): string {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj) || path;
}

export function useI18n() {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  const t = (key: string, params?: Record<string, string | number>): string => {
    let message = getNestedValue(messages[locale], key);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        message = message.replace(`{${k}}`, String(v));
      });
    }
    return message;
  };

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    saveLocale(newLocale);
  };

  return { locale, setLocale, t };
}

export default { useI18n };
