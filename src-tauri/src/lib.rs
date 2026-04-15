#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod types;
mod utils;

use std::panic;

pub fn run() {
    // Set panic hook
    panic::set_hook(Box::new(|panic_info| {
        eprintln!("Application panic: {}", panic_info);
    }));

    println!("IntentLoom starting...");

    // Initialize database
    db::init();

    println!("Building Tauri...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::sessions::list_sessions,
            commands::sessions::create_session,
            commands::sessions::get_session,
            commands::ai::call_ai,
            commands::fs::read_dir,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::open_directory,
            // Original skills commands
            commands::skills::search_skills,
            commands::skills::install_skill,
            commands::skills::uninstall_skill_legacy,
            commands::skills::list_installed_skills,
            commands::skills::get_skills_dirs,
            commands::skills::batch_install_skills,
            // Market commands (from skills-manager)
            commands::market::search_marketplaces,
            commands::market::download_marketplace_skill,
            commands::market::update_marketplace_skill,
            // Skills manager commands (from skills-manager)
            commands::skills::link_local_skill,
            commands::skills::read_local_skill_preview,
            commands::skills::scan_overview,
            commands::skills::scan_local_skills,
            commands::skills::import_local_skill,
            commands::skills::delete_local_skills,
            commands::skills::export_local_skills,
            commands::skills::adopt_ide_skill,
            commands::skills::scan_project_ide_dirs,
            commands::skills::uninstall_skill_from_ides,
            commands::skills::uninstall_skill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
