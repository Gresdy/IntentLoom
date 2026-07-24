#![allow(dead_code)]

use crate::cc_switch::services::env_checker::{check_env_conflicts as check_conflicts, EnvConflict};
use crate::cc_switch::services::env_manager::{
    delete_env_vars as delete_vars, restore_from_backup, BackupInfo,
};

/// Check environment variable conflicts for a specific app
#[tauri::command]
pub fn cc_switch_check_env_conflicts(app: String) -> Result<Vec<EnvConflict>, String> {
    check_conflicts(&app)
}

/// Delete environment variables with backup
#[tauri::command]
pub fn cc_switch_delete_env_vars(conflicts: Vec<EnvConflict>) -> Result<BackupInfo, String> {
    delete_vars(conflicts)
}

/// Restore environment variables from backup file
#[tauri::command]
pub fn cc_switch_restore_env_backup(backup_path: String) -> Result<(), String> {
    restore_from_backup(backup_path)
}
