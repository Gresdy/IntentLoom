#![allow(dead_code)]

//! Compatibility wrappers for tray operations used by the migrated
//! skills-manager commands. They delegate to IntentLoom's real tray.

pub fn refresh_tray_menu(app: &tauri::AppHandle) -> Result<(), String> {
    crate::cc_switch::tray::refresh_tray_menu(app);
    Ok(())
}

pub fn schedule_tray_refresh(app: &tauri::AppHandle) -> Result<(), String> {
    crate::cc_switch::tray::schedule_tray_refresh(app);
    Ok(())
}

pub fn set_tray_icon_enabled(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id(crate::cc_switch::tray::TRAY_ID) {
        tray.set_visible(enabled).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn quit_app(app: &tauri::AppHandle) {
    app.exit(0);
}
