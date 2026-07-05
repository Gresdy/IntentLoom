#![allow(dead_code)]

use tauri::State;

use crate::cc_switch::services::omo::{OmoLocalFileData, SLIM, STANDARD};
use crate::cc_switch::services::OmoService;
use crate::cc_switch::store::AppState;

#[tauri::command]
pub async fn cc_switch_read_omo_local_file() -> Result<OmoLocalFileData, String> {
    OmoService::read_local_file(&STANDARD).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cc_switch_get_current_omo_provider_id(state: State<'_, AppState>) -> Result<String, String> {
    let provider = state
        .db
        .get_current_omo_provider("opencode", "omo")
        .map_err(|e| e.to_string())?;
    Ok(provider.map(|p| p.id).unwrap_or_default())
}

#[tauri::command]
pub async fn cc_switch_disable_current_omo(state: State<'_, AppState>) -> Result<(), String> {
    let providers = state
        .db
        .get_all_providers("opencode")
        .map_err(|e| e.to_string())?;
    for (id, p) in &providers {
        if p.category.as_deref() == Some("omo") {
            state
                .db
                .clear_omo_provider_current("opencode", id, "omo")
                .map_err(|e| e.to_string())?;
        }
    }
    OmoService::delete_config_file(&STANDARD).map_err(|e| e.to_string())?;
    Ok(())
}

// ── OMO Slim commands ───────────────────────────────────────

#[tauri::command]
pub async fn cc_switch_read_omo_slim_local_file() -> Result<OmoLocalFileData, String> {
    OmoService::read_local_file(&SLIM).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cc_switch_get_current_omo_slim_provider_id(
    state: State<'_, AppState>,
) -> Result<String, String> {
    let provider = state
        .db
        .get_current_omo_provider("opencode", "omo-slim")
        .map_err(|e| e.to_string())?;
    Ok(provider.map(|p| p.id).unwrap_or_default())
}

#[tauri::command]
pub async fn cc_switch_disable_current_omo_slim(state: State<'_, AppState>) -> Result<(), String> {
    let providers = state
        .db
        .get_all_providers("opencode")
        .map_err(|e| e.to_string())?;
    for (id, p) in &providers {
        if p.category.as_deref() == Some("omo-slim") {
            state
                .db
                .clear_omo_provider_current("opencode", id, "omo-slim")
                .map_err(|e| e.to_string())?;
        }
    }
    OmoService::delete_config_file(&SLIM).map_err(|e| e.to_string())?;
    Ok(())
}
