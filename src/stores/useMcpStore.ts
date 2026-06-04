import { create } from "zustand";
import { invoke } from "../lib/tauri";

export interface McpApps {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
  opencode: boolean;
  openclaw: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  server: Record<string, any>;
  apps: McpApps;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface McpServerInput {
  name: string;
  server: Record<string, any>;
  apps: McpApps;
}

interface McpState {
  servers: McpServer[];
  isLoading: boolean;
  loadServers: () => Promise<void>;
  loadServersForApp: (app: string) => Promise<void>;
  createServer: (input: McpServerInput) => Promise<McpServer | null>;
  updateServer: (id: string, input: McpServerInput) => Promise<boolean>;
  deleteServer: (id: string) => Promise<boolean>;
  toggleServerApp: (id: string, app: string, enabled: boolean) => Promise<boolean>;
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  isLoading: false,

  loadServers: async () => {
    set({ isLoading: true });
    try {
      const servers = await invoke<McpServer[]>("get_mcp_servers");
      set({ servers, isLoading: false });
    } catch (error) {
      console.error("Failed to load MCP servers:", error);
      set({ isLoading: false });
    }
  },

  loadServersForApp: async (app) => {
    set({ isLoading: true });
    try {
      const servers = await invoke<McpServer[]>("get_mcp_servers_for_app", { app });
      set({ servers, isLoading: false });
    } catch (error) {
      console.error("Failed to load MCP servers for app:", error);
      set({ isLoading: false });
    }
  },

  createServer: async (input) => {
    try {
      const server = await invoke<McpServer>("create_mcp_server", { input });
      await get().loadServers();
      return server;
    } catch (error) {
      console.error("Failed to create MCP server:", error);
      return null;
    }
  },

  updateServer: async (id, input) => {
    try {
      const result = await invoke<boolean>("update_mcp_server", { id, input });
      if (result) {
        await get().loadServers();
      }
      return result;
    } catch (error) {
      console.error("Failed to update MCP server:", error);
      return false;
    }
  },

  deleteServer: async (id) => {
    try {
      const result = await invoke<boolean>("delete_mcp_server", { id });
      if (result) {
        await get().loadServers();
      }
      return result;
    } catch (error) {
      console.error("Failed to delete MCP server:", error);
      return false;
    }
  },

  toggleServerApp: async (id, app, enabled) => {
    try {
      const result = await invoke<boolean>("toggle_mcp_server_app", { id, app, enabled });
      if (result) {
        await get().loadServers();
      }
      return result;
    } catch (error) {
      console.error("Failed to toggle MCP server app:", error);
      return false;
    }
  },
}));
