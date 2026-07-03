// skills-manager module re-export for the IntentLoom project.
// Full port of https://github.com/xingkongliang/skills-manager, exposed as
// a sub-module of the main Tauri app. The Rust core lives in `core/` and
// the IPC commands live in `commands/`.

pub mod commands;
pub mod core;
pub mod tray_stubs;

pub use commands::*;
pub use core::{app_state, central_repo, error, scanner, skill_store, tool_adapters};
