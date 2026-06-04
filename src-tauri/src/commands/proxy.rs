use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use tauri::command;

static PROXY_RUNNING: AtomicBool = AtomicBool::new(false);
static PROXY_PORT: AtomicU16 = AtomicU16::new(0);

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
}

#[command]
pub async fn get_proxy_status() -> Result<ProxyStatus, String> {
    let running = PROXY_RUNNING.load(Ordering::SeqCst);
    let port = PROXY_PORT.load(Ordering::SeqCst);
    let url = if running && port > 0 {
        format!("http://127.0.0.1:{port}")
    } else {
        String::new()
    };
    Ok(ProxyStatus { running, port, url })
}

#[command]
pub async fn start_proxy(port: Option<u16>) -> Result<ProxyStatus, String> {
    let port = port.unwrap_or(0);
    PROXY_PORT.store(port, Ordering::SeqCst);
    PROXY_RUNNING.store(true, Ordering::SeqCst);
    get_proxy_status().await
}

#[command]
pub async fn stop_proxy() -> Result<ProxyStatus, String> {
    PROXY_RUNNING.store(false, Ordering::SeqCst);
    PROXY_PORT.store(0, Ordering::SeqCst);
    get_proxy_status().await
}
