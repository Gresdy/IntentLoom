use crate::db::get_connection;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Expert {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub color: String,
    pub enabled: bool,
    pub is_template: bool,
    pub department: Option<String>,
    pub sort_order: i32,
    pub skills: Option<String>,
    pub mcp_servers: Option<String>,
    pub knowledge_base: Option<String>,
    pub avatar: Option<String>,
    pub model: Option<String>,
    pub is_active: bool,
    pub project_id: Option<String>,
}

fn row_to_expert(row: &rusqlite::Row) -> rusqlite::Result<Expert> {
    Ok(Expert {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        system_prompt: row.get("system_prompt")?,
        color: row.get("color")?,
        enabled: row.get::<_, i64>("enabled")? != 0,
        is_template: row.get::<_, i64>("is_template")? != 0,
        department: row.get("department")?,
        sort_order: row.get("sort_order")?,
        skills: row.get("skills")?,
        mcp_servers: row.get("mcp_servers")?,
        knowledge_base: row.get("knowledge_base")?,
        avatar: row.get("avatar")?,
        model: row.get("model")?,
        is_active: row.get::<_, i64>("is_active")? != 0,
        project_id: row.get("project_id")?,
    })
}

#[command]
pub async fn list_experts(project_id: Option<String>) -> Result<Vec<Expert>, String> {
    let conn = get_connection();
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, system_prompt, color, enabled, is_template, \
             department, sort_order, skills, mcp_servers, knowledge_base, avatar, model, is_active, project_id \
             FROM experts ORDER BY sort_order ASC, name ASC",
        )
        .map_err(|e| e.to_string())?;
    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<Expert> { row_to_expert(row) };
    let rows = stmt
        .query_map([], map_row)
        .map_err(|e| e.to_string())?;
    let all: Vec<Expert> = rows
        .filter_map(|r| r.ok())
        .filter(|e| match &project_id {
            Some(pid) => e.project_id.as_deref() == Some(pid.as_str()),
            None => true,
        })
        .collect();
    Ok(all)
}

#[command]
pub async fn create_expert(
    name: String,
    description: Option<String>,
    system_prompt: Option<String>,
    color: Option<String>,
    avatar: Option<String>,
    skills: Option<Vec<String>>,
    mcp_servers: Option<Vec<String>>,
    knowledge_base: Option<Vec<String>>,
    model: Option<String>,
    is_active: Option<bool>,
    sort_order: Option<i32>,
    project_id: Option<String>,
) -> Result<Expert, String> {
    let id = format!(
        "exp-{}-{:x}",
        chrono::Utc::now().timestamp_millis(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.subsec_nanos())
            .unwrap_or(0)
    );
    let conn = get_connection();
    conn.execute(
        "INSERT INTO experts (id, project_id, name, description, system_prompt, color, \
         skills, mcp_servers, knowledge_base, avatar, model, is_active, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            project_id,
            name,
            description.unwrap_or_default(),
            system_prompt.unwrap_or_default(),
            color.unwrap_or_else(|| "#6366f1".to_string()),
            skills.map(|v| serde_json::to_string(&v).unwrap_or_default()),
            mcp_servers.map(|v| serde_json::to_string(&v).unwrap_or_default()),
            knowledge_base.map(|v| serde_json::to_string(&v).unwrap_or_default()),
            avatar,
            model,
            if is_active.unwrap_or(true) { 1 } else { 0 },
            sort_order.unwrap_or(0),
        ],
    )
    .map_err(|e| e.to_string())?;
    fetch_expert(&id)
}

fn fetch_expert(id: &str) -> Result<Expert, String> {
    let conn = get_connection();
    conn.query_row(
        "SELECT id, name, description, system_prompt, color, enabled, is_template, \
         department, sort_order, skills, mcp_servers, knowledge_base, avatar, model, is_active, project_id \
         FROM experts WHERE id = ?1",
        params![id],
        row_to_expert,
    )
    .map_err(|e| e.to_string())
}

#[command]
pub async fn update_expert(
    id: String,
    name: Option<String>,
    description: Option<String>,
    avatar: Option<String>,
    system_prompt: Option<String>,
    skills: Option<Vec<String>>,
    mcp_servers: Option<Vec<String>>,
    model: Option<String>,
    knowledge_base: Option<Vec<String>>,
    color: Option<String>,
    is_active: Option<bool>,
    sort_order: Option<i32>,
) -> Result<Expert, String> {
    let conn = get_connection();
    let exists: Option<String> = conn
        .query_row("SELECT id FROM experts WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!("Expert not found: {id}"));
    }

    if let Some(v) = &name {
        conn.execute("UPDATE experts SET name = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &description {
        conn.execute(
            "UPDATE experts SET description = ?1 WHERE id = ?2",
            params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &system_prompt {
        conn.execute(
            "UPDATE experts SET system_prompt = ?1 WHERE id = ?2",
            params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &color {
        conn.execute("UPDATE experts SET color = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &avatar {
        conn.execute("UPDATE experts SET avatar = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &model {
        conn.execute("UPDATE experts SET model = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &skills {
        let json = serde_json::to_string(v).unwrap_or_default();
        conn.execute(
            "UPDATE experts SET skills = ?1 WHERE id = ?2",
            params![json, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &mcp_servers {
        let json = serde_json::to_string(v).unwrap_or_default();
        conn.execute(
            "UPDATE experts SET mcp_servers = ?1 WHERE id = ?2",
            params![json, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = &knowledge_base {
        let json = serde_json::to_string(v).unwrap_or_default();
        conn.execute(
            "UPDATE experts SET knowledge_base = ?1 WHERE id = ?2",
            params![json, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = is_active {
        conn.execute(
            "UPDATE experts SET is_active = ?1 WHERE id = ?2",
            params![if v { 1 } else { 0 }, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(v) = sort_order {
        conn.execute(
            "UPDATE experts SET sort_order = ?1 WHERE id = ?2",
            params![v, id],
        )
        .map_err(|e| e.to_string())?;
    }
    fetch_expert(&id)
}

#[command]
pub async fn delete_expert(id: String) -> Result<bool, String> {
    let conn = get_connection();
    let n = conn
        .execute("DELETE FROM experts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

#[command]
pub async fn toggle_expert_active(id: String) -> Result<Expert, String> {
    let conn = get_connection();
    conn.execute(
        "UPDATE experts SET is_active = 1 - is_active WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    fetch_expert(&id)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    pub path: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub files: Vec<ScannedFile>,
}

#[command]
pub async fn scan_expert_files(dir_path: String) -> Result<ScanResult, String> {
    let mut files = Vec::new();
    let path = Path::new(&dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {dir_path}"));
    }
    for entry in WalkDir::new(path).max_depth(3).into_iter().flatten() {
        let p = entry.path();
        if p.is_file() && p.extension().map(|e| e == "md").unwrap_or(false) {
            if let Ok(content) = std::fs::read_to_string(p) {
                files.push(ScannedFile {
                    path: p.to_string_lossy().to_string(),
                    content,
                });
            }
        }
    }
    Ok(ScanResult { files })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportExpertRequest {
    pub expert_id: String,
    pub project_id: Option<String>,
    pub name: String,
    pub system_prompt: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub skills: Option<Vec<String>>,
}

#[command]
pub async fn import_expert_to_project(request: ImportExpertRequest) -> Result<Expert, String> {
    create_expert(
        request.name,
        request.description,
        Some(request.system_prompt),
        request.color,
        None,
        request.skills,
        None,
        None,
        None,
        Some(true),
        None,
        request.project_id,
    )
    .await
}
