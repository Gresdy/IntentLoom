#![allow(dead_code)]

use crate::cc_switch::services::subscription::SubscriptionQuota;

#[tauri::command]
pub async fn cc_switch_get_coding_plan_quota(
    base_url: String,
    api_key: String,
    // 火山方舟用控制面 AK/SK 签名查询用量；其他供应商不传，沿用 api_key。
    access_key_id: Option<String>,
    secret_access_key: Option<String>,
) -> Result<SubscriptionQuota, String> {
    crate::cc_switch::services::coding_plan::get_coding_plan_quota(
        &base_url,
        &api_key,
        access_key_id.as_deref(),
        secret_access_key.as_deref(),
    )
    .await
}
