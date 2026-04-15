import { ref, computed } from "vue";
import type { ProjectConfig, ProjectIdeDir } from "./types";
import { ideDirMappings, STORAGE_KEYS } from "./constants";

function loadProjectsFromStorage(): ProjectConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.path === "string" &&
        Array.isArray(item.ideTargets)
    );
  } catch {
    return [];
  }
}

function saveProjectsToStorage(projects: ProjectConfig[]): void {
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
}

function generateProjectId(path: string): string {
  return `project-${path.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-")}`;
}

export function useProjectConfig() {
  const projects = ref<ProjectConfig[]>([]);
  const selectedProjectId = ref<string | null>(null);

  const selectedProject = computed(() =>
    projects.value.find((p) => p.id === selectedProjectId.value) || null
  );

  function loadProjects(): void {
    projects.value = loadProjectsFromStorage();
    if (projects.value.length > 0 && !selectedProjectId.value) {
      selectedProjectId.value = projects.value[0].id;
    }
  }

  function addProject(path: string, name: string, ideTargets: string[] = []): ProjectConfig {
    const existing = projects.value.find((p) => p.path === path);
    if (existing) {
      return existing;
    }

    const id = generateProjectId(path);
    const newProject: ProjectConfig = {
      id,
      name,
      path,
      ideTargets,
      detectedIdeDirs: []
    };

    projects.value.push(newProject);
    projects.value.sort((a, b) => a.name.localeCompare(b.name));
    saveProjectsToStorage(projects.value);
    selectedProjectId.value = id;
    return newProject;
  }

  function removeProject(projectId: string): boolean {
    const index = projects.value.findIndex((p) => p.id === projectId);
    if (index === -1) return false;

    projects.value.splice(index, 1);
    saveProjectsToStorage(projects.value);

    if (selectedProjectId.value === projectId) {
      selectedProjectId.value = projects.value[0]?.id || null;
    }
    return true;
  }

  function updateProjectIdeTargets(projectId: string, ideTargets: string[]): boolean {
    const project = projects.value.find((p) => p.id === projectId);
    if (!project) return false;

    project.ideTargets = ideTargets;
    saveProjectsToStorage(projects.value);
    return true;
  }

  function updateDetectedIdeDirs(projectId: string, detectedIdeDirs: ProjectIdeDir[]): boolean {
    const project = projects.value.find((p) => p.id === projectId);
    if (!project) return false;

    project.detectedIdeDirs = detectedIdeDirs;
    saveProjectsToStorage(projects.value);
    return true;
  }

  function getProjectLinkTargets(project: ProjectConfig): Array<{ name: string; path: string }> {
    return project.ideTargets.map((ideLabel) => {
      const ideConfig = ideDirMappings.find((m: { label: string; path: string }) => m.label === ideLabel);
      if (!ideConfig) {
        return { name: ideLabel, path: "" };
      }

      if (ideConfig.path.startsWith("/")) {
        return { name: ideLabel, path: ideConfig.path };
      }

      const projectPath = project.path;
      return { name: ideLabel, path: `${projectPath}/${ideConfig.path}` };
    }).filter((t) => t.path !== "");
  }

  return {
    projects,
    selectedProjectId,
    selectedProject,
    loadProjects,
    addProject,
    removeProject,
    updateProjectIdeTargets,
    updateDetectedIdeDirs,
    getProjectLinkTargets
  };
}
