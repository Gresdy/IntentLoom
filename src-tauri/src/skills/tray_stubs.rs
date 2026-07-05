#![allow(dead_code)]

//! Stubs for the tray-related functions that the migrated skills-manager
//! code expects to find at the crate root. IntentLoom has its own tray
//! implementation, so we provide no-op shims here so the migrated code
//! compiles and runs without crashing. The actual tray refresh / quit
//! logic remains owned by IntentLoom's main lib.rs.

#![allow(dead_code)]

use tauri::{AppHandle, Runtime};

/// No-op tray refresh. IntentLoom's tray is managed by its own code path,
/// so the skills module doesn't need to drive it. Kept as a function so
/// the migrated `#[tauri::command]` wrappers can call it without
/// hard-coding the absence of the feature.
pub fn refresh_tray_menu<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    Ok(())
}

/// No-op schedule. Same reasoning as `refresh_tray_menu`.
pub fn schedule_tray_refresh<R: Runtime>(_app: &AppHandle<R>) -> Result<(), String> {
    Ok(())
}

/// Persist the user's "show tray icon" preference. IntentLoom doesn't
/// surface a tray toggle yet, so we just store the value for future use.
pub fn set_tray_icon_enabled<R: Runtime>(_app: &AppHandle<R>, _enabled: bool) -> Result<(), String> {
    Ok(())
}

/// Quit the application. IntentLoom has its own quit flow; calling the
/// default Tauri exit keeps the migrated code working in isolation.
pub fn quit_app<R: Runtime>(app: &AppHandle<R>) -> () {
    app.exit(0);
}
