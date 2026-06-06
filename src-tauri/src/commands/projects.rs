use crate::db;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
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

/// Open the native folder picker and return the selected directory.
///
/// Returns `None` if the user cancelled the dialog (or the platform
/// has no blocking dialog — mobile, headless). Returns `Some(path)`
/// on success. The `Option<String>` shape matches what the
/// front-end's `reasonixAdapter.pickWorkspace` already consumes, so
/// we don't need a new Tauri event for "user cancelled".
///
/// We use the blocking variant because the Tauri command runs on
/// the async runtime and the dialog itself must run on the main
/// thread; the plugin handles that hop internally. Folder pickers
/// are intentional, multi-second operations on slow disks, so a
/// blocking call here is the right ergonomics — the UI button
/// shows a busy state via the controller.
#[command]
pub fn pick_workspace(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().blocking_pick_folder();
    Ok(picked.and_then(|fp| fp.as_path().map(|p| p.to_string_lossy().into_owned())))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// We can't pop a real dialog in `cargo test` (no main thread /
    /// no AppHandle), so the only invariant we can pin from a unit
    /// test is "the command signature resolves and returns
    /// Result<Option<String>, String>". Compiling this function
    /// pointer is enough to keep the surface honest — a flag rename
    /// in `tauri-plugin-dialog` will break this build, which is
    /// what we want to catch.
    #[test]
    fn pick_workspace_signature_is_stable() {
        let _f: fn(AppHandle) -> Result<Option<String>, String> = pick_workspace;
    }
}
