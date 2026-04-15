use crate::db;
use serde::{Deserialize, Serialize};
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub created_at: String,
}

#[command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    let conn = db::get_connection();
    let mut stmt = conn
        .prepare("SELECT id, name, path, created_at FROM projects ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(projects)
}

#[command]
pub fn add_project(path: String) -> Result<Project, String> {
    let conn = db::get_connection();
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&path)
        .to_string();

    conn.execute(
        "INSERT INTO projects (name, path) VALUES (?1, ?2)",
        [&name, &path],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    Ok(Project {
        id,
        name,
        path,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[command]
pub fn remove_project(id: i64) -> Result<(), String> {
    let conn = db::get_connection();
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
