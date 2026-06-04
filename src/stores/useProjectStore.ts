import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectConfig } from "./skillTypes";

interface ProjectState {
  projects: ProjectConfig[];
  selectedProjectId: string | null;
  loadProjects: () => void;
  addProject: (path: string, name: string, ideTargets: string[]) => ProjectConfig | undefined;
  removeProject: (projectId: string) => boolean;
  selectProject: (id: string | null) => void;
  updateProjectIdeTargets: (projectId: string, ideTargets: string[]) => boolean;
  updateDetectedIdeDirs: (
    projectId: string,
    detectedIdeDirs: ProjectConfig["detectedIdeDirs"]
  ) => boolean;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      selectedProjectId: null,

      loadProjects: () => {
        // Persist middleware hydrates automatically. This is a no-op kept
        // for callers that want to force a re-read from storage.
      },

      addProject: (path, name, ideTargets) => {
        const { projects } = get();
        const existing = projects.find((p) => p.path === path);
        if (existing) return existing;

        const id = `project-${path
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")}`;
        const newProject: ProjectConfig = {
          id,
          name,
          path,
          ideTargets,
          detectedIdeDirs: [],
        };

        const next = [...projects, newProject].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        set({ projects: next, selectedProjectId: id });
        return newProject;
      },

      removeProject: (projectId) => {
        const { projects, selectedProjectId } = get();
        const index = projects.findIndex((p) => p.id === projectId);
        if (index === -1) return false;
        const next = projects.filter((p) => p.id !== projectId);
        set({
          projects: next,
          selectedProjectId:
            selectedProjectId === projectId ? next[0]?.id ?? null : selectedProjectId,
        });
        return true;
      },

      selectProject: (id) => set({ selectedProjectId: id }),

      updateProjectIdeTargets: (projectId, ideTargets) => {
        const { projects } = get();
        const project = projects.find((p) => p.id === projectId);
        if (!project) return false;
        project.ideTargets = ideTargets;
        set({ projects: [...projects] });
        return true;
      },

      updateDetectedIdeDirs: (projectId, detectedIdeDirs) => {
        const { projects } = get();
        const project = projects.find((p) => p.id === projectId);
        if (!project) return false;
        project.detectedIdeDirs = detectedIdeDirs;
        set({ projects: [...projects] });
        return true;
      },
    }),
    {
      name: "intentloom-projects",
      partialize: (s) => ({
        projects: s.projects,
        selectedProjectId: s.selectedProjectId,
      }),
    }
  )
);
