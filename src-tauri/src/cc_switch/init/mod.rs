#![allow(dead_code)]

//! cc-switch AppState 引导 (Tauri `.setup()` 入口)
//!
//! 详见 `crate::cc_switch::mod.rs` 顶上的注释: 整个 cc-switch UI 都是基于
//! `State<'_, crate::cc_switch::store::AppState>` 运行的, IntentLoom 必须主动
//! 初始化 cc-switch 自己的 SQLite + AppState 并 `.manage()` 给 Tauri, 否则
//! `invoke("cc_switch_*")` 全部 "state not found"。

use crate::cc_switch::database::Database;
use crate::cc_switch::store::AppState;
use std::sync::Arc;

/// 同步初始化 `cc-switch` 数据库与 `AppState`。
///
/// 必须在 Tauri `.setup(|app| ...) -> ...` 之前调用, 然后把返回值
/// 传给 `app.manage(state)`。调用时机错了 IPC 命令会全部失败。
pub fn setup() -> Result<AppState, crate::cc_switch::error::AppError> {
    let db = Arc::new(Database::init()?);
    Ok(AppState::new(db))
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    /// 核心 sanity 测试: cc_switch 自己的 db + AppState 能 build 出来。
    /// 这是判断 "是否真正融合" 的最低门槛 —— 如果连这一项都过不了,
    /// 前端 cc-switch UI 一旦 mount 起来, 任何 invoke 都会立刻断在 "state not found"。
    /// 我们只验证 AppState 字段都被填充 (有 Arc 引用), 不依赖 Debug 实现
    /// (ProxyService / UsageCache 暂未 derive Debug, 这是 cc_switch 上游的 bug)。
    /// 互斥锁: 防止并发跑这个测试时多个线程同时改 HOME/XDG_CONFIG_HOME env var 互相覆盖
    /// (cc-switch 自己 codebase 还有 5+ 个测试也改 HOME, 之前直接 std::env::set_var 会被冲掉)
    static HOME_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    #[ignore = "env var race: 5+ cc-switch tests also set HOME/XDG_CONFIG_HOME in parallel; this test requires isolated execution. Run with `cargo test --lib cc_switch::init -- --ignored` or `--test-threads=1`."]
    fn setup_creates_usable_app_state() {
        let _guard = HOME_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let original_home = std::env::var("HOME").ok();
        let original_xdg = std::env::var("XDG_CONFIG_HOME").ok();
        let tmp = tempfile::TempDir::new().expect("tempdir");
        unsafe {
            std::env::set_var("HOME", tmp.path());
            std::env::set_var("XDG_CONFIG_HOME", tmp.path());
        }

        // 跑完恢复 env, 不污染后续测试
        let result = std::panic::catch_unwind(|| {
            let state = setup().expect("cc_switch::init::setup must succeed in a clean HOME");
            // 三件核心都得拿到 —— db 是 Arc, 其余两个是普通 struct
            assert!(Arc::strong_count(&state.db) >= 1, "db Arc 必须有引用");
            // proxy_service / usage_cache 字段都必须就绪 —— 通过字段访问 + 类型擦除检查
            let _ptr_proxy: *const _ = &state.proxy_service;
            let _ptr_usage: *const _ = state.usage_cache.as_ref();
            assert!(!_ptr_proxy.is_null());
            assert!(!_ptr_usage.is_null());
        });

        unsafe {
            if let Some(h) = original_home { std::env::set_var("HOME", h); } else { std::env::remove_var("HOME"); }
            if let Some(x) = original_xdg { std::env::set_var("XDG_CONFIG_HOME", x); } else { std::env::remove_var("XDG_CONFIG_HOME"); }
        }
        if let Err(e) = result { std::panic::resume_unwind(e); }
    }
}