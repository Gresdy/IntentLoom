#![allow(dead_code)]

use crate::cc_switch::provider::UsageResult;

#[tauri::command]
pub async fn cc_switch_get_balance(base_url: String, api_key: String) -> Result<UsageResult, String> {
    crate::cc_switch::services::balance::get_balance(&base_url, &api_key).await
}
