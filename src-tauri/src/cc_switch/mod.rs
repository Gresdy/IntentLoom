#![allow(dead_code)]

mod app_config;
// cc-switch 自带一堆 struct/enum (RemoteSkill, LinkTarget, etc.), 整库塞进 IntentLoom
// 后 IntentLoom 主代码只用到其中一小部分, ~60 个 dead_code 警告全是 cc-switch
// 上游未用完的辅助类型. 在这个 mod 根统一 allow 是最稳的折中:
//   - 不动 cc-switch 上游代码 (将来同步升级时不会被覆盖)
//   - 不污染 IntentLoom 主 crate 的 lint 策略
pub mod app_store;
pub mod auto_launch;
pub mod claude_desktop_config;
pub mod claude_mcp;
pub mod claude_plugin;
pub mod codex_config;
pub mod codex_history_migration;
pub mod commands;
pub mod config;
pub mod database;
pub mod deeplink;
pub mod error;
pub mod gemini_config;
pub mod gemini_mcp;
pub mod hermes_config;
pub mod init_status;
pub mod lightweight;
#[cfg(target_os = "linux")]
pub mod linux_fix;
pub mod mcp;
pub mod openclaw_config;
pub mod opencode_config;
pub mod panic_hook;
pub mod prompt;
pub mod prompt_files;
pub mod provider;
pub mod provider_defaults;
pub mod proxy;
pub mod services;
pub mod session_manager;
pub mod settings;
pub mod store;

pub mod tray;
pub mod usage_events;
pub mod usage_script;

pub use app_config::{AppType, InstalledSkill, McpApps, McpServer, MultiAppConfig, SkillApps};
pub use codex_config::{get_codex_auth_path, get_codex_config_path, write_codex_live_atomic};

pub use commands::*;
pub use config::{get_claude_mcp_path, get_claude_settings_path, read_json_file};
pub use database::Database;
pub use deeplink::{import_provider_from_deeplink, parse_deeplink_url, DeepLinkImportRequest};
pub use error::AppError;
pub use mcp::{
    import_from_claude, import_from_codex, import_from_gemini, remove_server_from_claude,
    remove_server_from_codex, remove_server_from_gemini, sync_enabled_to_claude,
    sync_enabled_to_codex, sync_enabled_to_gemini, sync_single_server_to_claude,
    sync_single_server_to_codex, sync_single_server_to_gemini,
};
pub use provider::{Provider, ProviderMeta};
pub use services::{
    skill::{migrate_skills_to_ssot, ImportSkillSelection},
    ConfigService, EndpointLatency, McpService, PromptService, ProviderService, ProxyService,
    SkillService, SpeedtestService,
};
pub use settings::{update_settings, AppSettings};
pub use store::AppState;
/// 更新托盘菜单的Tauri命令
#[tauri::command]
async fn update_tray_menu(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    match tray::create_tray_menu(&app, state.inner()) {
        Ok(new_menu) => {
            if let Some(tray) = app.tray_by_id(tray::TRAY_ID) {
                tray.set_menu(Some(new_menu))
                    .map_err(|e| format!("更新托盘菜单失败: {e}"))?;
                return Ok(true);
            }
            Ok(false)
        }
        Err(err) => {
            log::error!("创建托盘菜单失败: {err}");
            Ok(false)
        }
    }
}

#[allow(dead_code)]
pub fn refresh_tray_menu(app: &tauri::AppHandle, _state: &crate::cc_switch::store::AppState) -> bool {
    tray::refresh_tray_menu(app);
    app.tray_by_id(tray::TRAY_ID).is_some()
}

#[allow(dead_code)]
pub fn quit_app(app: &tauri::AppHandle) {
    app.exit(0);
}

#[allow(dead_code)]
pub fn set_tray_icon_enabled(app: &tauri::AppHandle, enabled: bool) {
    if let Some(tray) = app.tray_by_id(tray::TRAY_ID) {
        if let Err(error) = tray.set_visible(enabled) {
            log::warn!("设置托盘图标可见性失败: {error}");
        }
    }
}

#[allow(dead_code)]
pub fn schedule_tray_refresh(app: &tauri::AppHandle) {
    tray::schedule_tray_refresh(app);
}

/// Stub: cc-switch 的 `restart_process` 命令调用的底层实现。
/// IntentLoom 由 Tauri 自带的 updater 负责重启，无需 cc-switch 自己的逻辑。
#[allow(dead_code)]
pub fn restart_process() -> Result<(), String> { Ok(()) }

/// Stub: cc-switch 原始 lib.rs 里的退出清理。IntentLoom 由 tauri-plugin-window-state
/// 自己管窗口状态，cc_switch 的退出清理逻辑只跟它自己的代理/Live 配置有关，
/// 在这里用 no-op 占位即可。
#[allow(dead_code)]
pub async fn cleanup_before_exit(_app_handle: &tauri::AppHandle) {}

/// Stub: 同上,IntentLoom 不需要 cc-switch 的窗口状态保存逻辑。
#[allow(dead_code)]
pub fn save_window_state_before_exit(_app_handle: &tauri::AppHandle) {}

/// cc-switch 运行时初始化入口。
///
/// 这个模块是 IntentLoom 与 cc-switch 在 runtime 层真正"融合"的关键。
/// 原版 cc-switch 的 `run()` 函数会在 Tauri Builder 启动前:
///   1. 打开 ~/.cc-switch/cc-switch.db, 跑 schema migrations
///   2. 构造 `Database` 的 `Arc<Database>`
///   3. 构造 `ProxyService::new(db.clone())`
///   4. 构造 `AppState { db, proxy_service, usage_cache }`
///   5. Tauri Builder `.manage(app_state)` 注册全局 state
///
/// 但 cc-switch 的 258 个 Tauri 命令全部 `state: State<'_, AppState>`,
/// 如果第 5 步不做, 一旦前端调 `invoke("cc_switch_get_providers", ...)`,
/// Tauri 就会在 dispatch 阶段报 "state 'cc_switch::store::AppState' not found",
/// 整个设置面板瞬间全部死掉 —— 这就是用户说"没有真正融合"的根因。
///
/// `IntentLoom 现在必须主动初始化 cc-switch 自己的 SQLite + AppState 并 manage()`,
/// 否则按钮一点就崩。
pub mod init;
