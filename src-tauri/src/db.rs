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

        -- ── Knowledge Base (本地 RAG) ─────────────────────────────────────
        -- 每个 knowledge_base 是一组文档 + 一个向量索引 + 一份嵌入配置。
        -- 文档 (kb_documents) 与切片 (kb_chunks) 1:N；切片单独存向量，
        -- 检索时把 kb_id 下的所有 chunks 加载到内存做 cosine 排序。
        -- v1 没有接 sqlite-vec，embedding 用 JSON 文本存；chunk 量级
        -- 在 ~万级以内都能扛得住，v2 再换 HNSW / sqlite-vec。
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT 'openai',
            api_base TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
            api_key TEXT NOT NULL DEFAULT '',
            embed_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
            chunk_size INTEGER NOT NULL DEFAULT 500,
            chunk_overlap INTEGER NOT NULL DEFAULT 50,
            top_k INTEGER NOT NULL DEFAULT 5,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS kb_documents (
            id TEXT PRIMARY KEY,
            kb_id TEXT NOT NULL,
            name TEXT NOT NULL,
            source_path TEXT NOT NULL DEFAULT '',
            mime_type TEXT NOT NULL DEFAULT 'text/plain',
            size_bytes INTEGER NOT NULL DEFAULT 0,
            char_count INTEGER NOT NULL DEFAULT 0,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_kb_documents_kb ON kb_documents(kb_id);

        CREATE TABLE IF NOT EXISTS kb_chunks (
            id TEXT PRIMARY KEY,
            kb_id TEXT NOT NULL,
            doc_id TEXT NOT NULL,
            ord INTEGER NOT NULL,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            char_start INTEGER NOT NULL DEFAULT 0,
            char_end INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            FOREIGN KEY (doc_id) REFERENCES kb_documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb ON kb_chunks(kb_id);
        CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc ON kb_chunks(doc_id);

        CREATE TABLE IF NOT EXISTS kb_qa_history (
            id TEXT PRIMARY KEY,
            kb_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            citations TEXT NOT NULL DEFAULT '[]',
            cli TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_kb_qa_history_kb ON kb_qa_history(kb_id, created_at);
        ",
    )
    .expect("Failed to create database tables");

    conn.execute_batch(
        "\
        CREATE TABLE IF NOT EXISTS product_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            path TEXT,
            summary TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pc_conv ON product_changes(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_pc_agent ON product_changes(agent_id);
        CREATE INDEX IF NOT EXISTS idx_pc_kind ON product_changes(kind);
        ",
    )
    .expect("Failed to create product_changes table");

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
