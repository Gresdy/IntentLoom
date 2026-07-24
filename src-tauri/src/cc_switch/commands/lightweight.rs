#![allow(dead_code)]

#[tauri::command]
pub fn cc_switch_enter_lightweight_mode(app: tauri::AppHandle) -> Result<(), String> {
    crate::cc_switch::lightweight::enter_lightweight_mode(&app)
}

#[tauri::command]
pub fn cc_switch_exit_lightweight_mode(app: tauri::AppHandle) -> Result<(), String> {
    crate::cc_switch::lightweight::exit_lightweight_mode(&app)
}

#[tauri::command]
pub fn cc_switch_is_lightweight_mode() -> bool {
    crate::cc_switch::lightweight::is_lightweight_mode()
}
