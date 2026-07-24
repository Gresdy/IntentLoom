use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub file_type: String,
}

fn canonical_project_path(path: &Path) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve path: {error}"))?;
    let conn = crate::db::get_connection();
    let mut statement = conn
        .prepare("SELECT path FROM projects")
        .map_err(|error| error.to_string())?;
    let roots = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;

    for root in roots.flatten() {
        let Ok(canonical_root) = std::fs::canonicalize(root) else {
            continue;
        };
        if canonical.starts_with(canonical_root) {
            return Ok(canonical);
        }
    }

    Err("Path is outside the registered project directories".to_string())
}

#[command]
pub async fn read_dir(dir_path: String) -> Result<Vec<FileNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = canonical_project_path(Path::new(&dir_path))?;
        if !path.is_dir() {
            return Err(format!("Not a directory: {dir_path}"));
        }

        let entries = std::fs::read_dir(path).map_err(|error| error.to_string())?;
        let mut nodes: Vec<FileNode> = entries
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let file_name = entry.file_name().to_string_lossy().to_string();
                let file_path = entry.path().to_string_lossy().to_string();
                let file_type = if entry.path().is_dir() {
                    "directory".to_string()
                } else {
                    "file".to_string()
                };
                Some(FileNode {
                    name: file_name,
                    path: file_path,
                    file_type,
                })
            })
            .collect();

        nodes.sort_by(|left, right| match (&left.file_type[..], &right.file_type[..]) {
            ("directory", "file") => std::cmp::Ordering::Less,
            ("file", "directory") => std::cmp::Ordering::Greater,
            _ => left.name.to_lowercase().cmp(&right.name.to_lowercase()),
        });
        Ok(nodes)
    })
    .await
    .map_err(|error| format!("join error: {error}"))?
}

#[command]
pub async fn read_file(file_path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = canonical_project_path(Path::new(&file_path))?;
        if !path.is_file() {
            return Err(format!("Not a file: {file_path}"));
        }
        std::fs::read_to_string(path).map_err(|error| format!("Failed to read file: {error}"))
    })
    .await
    .map_err(|error| format!("join error: {error}"))?
}

#[command]
pub async fn open_directory(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::fs::canonicalize(path)
            .map_err(|error| format!("Failed to resolve directory: {error}"))?;
        if !path.is_dir() {
            return Err("Path is not a directory".to_string());
        }
        opener::open(path).map_err(|error| format!("Failed to open directory: {error}"))
    })
    .await
    .map_err(|error| format!("join error: {error}"))?
}
