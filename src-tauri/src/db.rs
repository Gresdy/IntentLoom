use rusqlite::Connection;
use std::sync::Mutex;
use tracing::info;

static DB_CONNECTION: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();

pub fn init() {
    let db_path = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("intentloom")
        .join("intentloom.db");

    std::fs::create_dir_all(db_path.parent().unwrap()).ok();

    let conn = Connection::open(&db_path).expect("Failed to open database");

    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS experts (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            system_prompt TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#6366f1',
            enabled INTEGER NOT NULL DEFAULT 1,
            is_template INTEGER NOT NULL DEFAULT 0,
            department TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            skills TEXT,
            mcp_servers TEXT,
            knowledge_base TEXT,
            avatar TEXT,
            model TEXT,
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pending_permissions (
            id TEXT PRIMARY KEY,
            tool TEXT NOT NULL,
            args TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS acp_sessions (
            session_id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            workspace TEXT NOT NULL,
            cli_path TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        ",
    )
    .expect("Failed to create database tables");

    info!("Database initialized at {:?}", db_path);

    DB_CONNECTION
        .set(Mutex::new(conn))
        .expect("Failed to set database connection");
}

pub fn get_connection() -> std::sync::MutexGuard<'static, Connection> {
    DB_CONNECTION
        .get()
        .expect("Database not initialized")
        .lock()
        .expect("Failed to lock database connection")
}
