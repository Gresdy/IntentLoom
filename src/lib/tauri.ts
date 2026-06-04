/**
 * Unified Tauri IPC entry point.
 *
 * Import `invoke` from here instead of re-defining it per-file.
 * This eliminates the 7 duplicate local definitions scattered across the codebase
 * and ensures consistent, typed invocation everywhere.
 *
 * Usage:
 *   import { invoke } from "../lib/tauri";
 *   const result = await invoke<MyType>("command_name", { arg1, arg2 });
 */
export { invoke } from "@tauri-apps/api/core";
