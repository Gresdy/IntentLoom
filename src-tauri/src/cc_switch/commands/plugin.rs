#![allow(dead_code)]

#![allow(non_snake_case)]

use crate::cc_switch::config::ConfigStatus;

/// Claude 插件：获取 ~/.claude/config.json 状态
#[tauri::command]
pub async fn cc_switch_get_claude_plugin_status() -> Result<ConfigStatus, String> {
    crate::cc_switch::claude_plugin::claude_config_status()
        .map(|(exists, path)| ConfigStatus {
            exists,
            path: path.to_string_lossy().to_string(),
        })
        .map_err(|e| e.to_string())
}

/// Claude 插件：读取配置内容（若不存在返回 Ok(None)）
#[tauri::command]
pub async fn cc_switch_read_claude_plugin_config() -> Result<Option<String>, String> {
    crate::cc_switch::claude_plugin::read_claude_config().map_err(|e| e.to_string())
}

/// Claude 插件：写入/清除固定配置
#[tauri::command]
pub async fn cc_switch_apply_claude_plugin_config(official: bool) -> Result<bool, String> {
    if official {
        crate::cc_switch::claude_plugin::clear_claude_config().map_err(|e| e.to_string())
    } else {
        crate::cc_switch::claude_plugin::write_claude_config().map_err(|e| e.to_string())
    }
}

/// Claude 插件：检测是否已写入目标配置
#[tauri::command]
pub async fn cc_switch_is_claude_plugin_applied() -> Result<bool, String> {
    crate::cc_switch::claude_plugin::is_claude_config_applied().map_err(|e| e.to_string())
}

/// Claude Code：跳过初次安装确认（写入 ~/.claude.json 的 hasCompletedOnboarding=true）
#[tauri::command]
pub async fn cc_switch_apply_claude_onboarding_skip() -> Result<bool, String> {
    crate::cc_switch::claude_mcp::set_has_completed_onboarding().map_err(|e| e.to_string())
}

/// Claude Code：恢复初次安装确认（删除 ~/.claude.json 的 hasCompletedOnboarding 字段）
#[tauri::command]
pub async fn cc_switch_clear_claude_onboarding_skip() -> Result<bool, String> {
    crate::cc_switch::claude_mcp::clear_has_completed_onboarding().map_err(|e| e.to_string())
}
