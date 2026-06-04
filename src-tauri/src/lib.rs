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

    // Initialize logging
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(false)
        .try_init();

    println!("IntentLoom starting...");

    // Initialize database
    db::init();

    println!("Building Tauri...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // projects / sessions
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::sessions::list_sessions,
            commands::sessions::create_session,
            commands::sessions::get_session,
            // filesystem
            commands::fs::read_dir,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::open_directory,
            // AI
            commands::ai::call_ai,
            commands::ai::stream_ai,
            commands::ai::cancel_ai,
            // agents
            commands::agents::list_agents,
            commands::agents::switch_agent,
            commands::agents::current_agent,
            // permissions
            commands::permissions::approve_permission,
            commands::permissions::deny_permission,
            commands::permissions::list_pending_permissions,
            commands::permissions::request_permission,
            // ACP
            commands::acp::acp_connect,
            commands::acp::acp_disconnect,
            commands::acp::acp_send_prompt,
            commands::acp::acp_list_sessions,
            // proxy
            commands::proxy::get_proxy_status,
            commands::proxy::start_proxy,
            commands::proxy::stop_proxy,
            // experts
            commands::experts::list_experts,
            commands::experts::create_expert,
            commands::experts::update_expert,
            commands::experts::delete_expert,
            commands::experts::toggle_expert_active,
            commands::experts::scan_expert_files,
            commands::experts::import_expert_to_project,
            // skills
            commands::skills::marketplace::search_skills,
            commands::skills::marketplace::install_skill,
            commands::skills::marketplace::uninstall_skill_legacy,
            commands::skills::marketplace::list_installed_skills,
            commands::skills::paths::get_skills_dirs,
            commands::skills::marketplace::batch_install_skills,
            commands::skills::manager::link_local_skill,
            commands::skills::local::read_local_skill_preview,
            commands::skills::local::scan_overview,
            commands::skills::local::scan_local_skills,
            commands::skills::manager::import_local_skill,
            commands::skills::manager::delete_local_skills,
            commands::skills::manager::export_local_skills,
            commands::skills::manager::adopt_ide_skill,
            commands::skills::paths::scan_project_ide_dirs,
            commands::skills::manager::uninstall_skill_from_ides,
            commands::skills::manager::uninstall_skill,
            // markets
            commands::market::search_marketplaces,
            commands::market::download_marketplace_skill,
            commands::market::update_marketplace_skill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
