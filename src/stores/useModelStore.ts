import { create } from "zustand";
import type { AICLI, Provider } from "../shared/types";

interface ModelState {
  currentCli: AICLI;
  currentProvider: Provider | null;
  setCurrentCli: (cli: AICLI) => void;
  setCurrentProvider: (provider: Provider | null) => void;
}

export const useModelStore = create<ModelState>((set) => ({
  currentCli: "claude-code",
  currentProvider: null,
  setCurrentCli: (cli) => set({ currentCli: cli }),
  setCurrentProvider: (provider) => set({ currentProvider: provider }),
}));
