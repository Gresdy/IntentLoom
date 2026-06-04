//! Skills subsystem.
//!
//! Split into focused modules so the original 1500-line monolith stays
//! readable. Each submodule owns a focused concern:
//! - `paths` — path resolution, fs / symlink / zip helpers
//! - `marketplace` — public marketplace commands (search, install, ...)
//! - `local` — local skill scanning and UI-facing stubs
//! - `manager` — heavier mutations (link, adopt, delete, export, ...)
//! - `types` — public data types re-exported at the parent path

pub mod local;
pub mod manager;
pub mod marketplace;
pub mod paths;
pub mod types;
