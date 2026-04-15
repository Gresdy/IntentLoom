use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub file_type: String,
}

#[command]
pub fn read_dir(dir_path: String) -> Result<Vec<FileNode>, String> {
    let path = Path::new(&dir_path);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir_path));
    }

    let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

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

    nodes.sort_by(|a, b| {
        // Directories first, then alphabetical
        match (&a.file_type[..], &b.file_type[..]) {
            ("directory", "file") => std::cmp::Ordering::Less,
            ("file", "directory") => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(nodes)
}

#[command]
pub fn read_file(file_path: String) -> Result<String, String> {
    std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[command]
pub fn write_file(file_path: String, content: String) -> Result<(), String> {
    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[command]
pub fn open_directory(path: String) -> Result<(), String> {
    opener::open(&path).map_err(|e| format!("Failed to open directory: {}", e))
}
