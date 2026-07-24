//! 占位 shim, 保持 `commands::projects` 命名空间存在。
//! 实际 Tauri 命令注册由 `lib.rs` 直接走 `skills::commands::projects::xxx`,
//! 因为 Tauri 的 `#[tauri::command]` 宏按函数原名生成 `__cmd__xxx` 处理器,
//! re-export 后换名只改 Rust 符号, 不会改 Tauri 命令名。

#![allow(dead_code)]
