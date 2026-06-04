//! Manager commands that mutate the Skills Manager tree: link / adopt /
//! import / delete / export / uninstall. These all funnel through the
//! path / symlink / zip helpers in [`super::paths`].

use super::paths::{
    create_symlink_dir, ensure_export_path_is_safe, is_symlink_to, read_managed_copy_target,
    read_skill_metadata, remove_path, validate_manager_skill_path, zip_skill_directory,
};

#[cfg(target_family = "windows")]
use super::paths::{create_junction_dir, should_copy_for_target, write_managed_copy_marker};
use super::local::manager_root;
use crate::types::{
    AdoptIdeSkillRequest, DeleteLocalSkillRequest, ExportSkillsRequest, ImportRequest,
    InstallResult, LinkRequest, UninstallRequest, UninstallSkillFromIdesRequest,
};
use crate::utils::download::copy_dir_recursive;
use crate::utils::path::{normalize_path, resolve_canonical};
use crate::utils::path::sanitize_dir_name as path_sanitize;
use crate::utils::security::{is_absolute_ide_path, is_valid_ide_path};
use std::fs::{self, File};
use std::path::PathBuf;
use zip::ZipWriter;

#[tauri::command]
pub fn link_local_skill(request: LinkRequest) -> Result<InstallResult, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let normalized_home = normalize_path(&home);
    let manager_root_raw = home.join(".skills-manager/skills");
    let manager_root =
        resolve_canonical(&manager_root_raw).unwrap_or_else(|| normalize_path(&manager_root_raw));

    let skill_path = PathBuf::from(&request.skill_path);
    let skill_canon = resolve_canonical(&skill_path)
        .ok_or_else(|| "Local skill path does not exist".to_string())?;
    if !skill_canon.starts_with(&manager_root) {
        return Err("Local skill path must stay inside Skills Manager storage".to_string());
    }
    let skill_path = skill_canon;

    let safe_name = path_sanitize(&request.skill_name);

    let mut linked = Vec::new();
    let mut skipped = Vec::new();

    for target in request.link_targets {
        let target_base = PathBuf::from(&target.path);
        let normalized_target = normalize_path(&target_base);
        if !normalized_target.starts_with(&normalized_home) {
            return Err(format!(
                "Target directory is outside the home directory: {}",
                target.name
            ));
        }

        // Normalize resolved paths before comparison so Windows verbatim prefixes do not
        // trigger false-positive symlink attack errors.
        let target_canon =
            resolve_canonical(&target_base).unwrap_or_else(|| normalized_target.clone());
        if !target_canon.starts_with(&normalized_home) {
            return Err(format!(
                "Target directory failed the symlink safety check: {}",
                target.name
            ));
        }

        fs::create_dir_all(&target_base).map_err(|err| err.to_string())?;
        let link_path = target_base.join(&safe_name);

        if fs::symlink_metadata(&link_path).is_ok() {
            if is_symlink_to(&link_path, &skill_path) {
                skipped.push(format!("{}: already linked", target.name));
                continue;
            }
            if read_managed_copy_target(&link_path)
                .is_some_and(|managed_target| managed_target == skill_path)
            {
                skipped.push(format!("{}: already synced", target.name));
                continue;
            }
            skipped.push(format!("{}: target already exists", target.name));
            continue;
        }

        let mut linked_done = false;
        let mut link_errors = Vec::new();

        #[cfg(target_family = "windows")]
        if should_copy_for_target(&target_base) {
            match copy_dir_recursive(&skill_path, &link_path) {
                Ok(()) => match write_managed_copy_marker(&link_path, &skill_path) {
                    Ok(()) => {
                        linked.push(format!("{}: synced {}", target.name, link_path.display()));
                        linked_done = true;
                    }
                    Err(err) => {
                        let _ = fs::remove_dir_all(&link_path);
                        link_errors.push(format!("copy marker: {}", err));
                    }
                },
                Err(err) => link_errors.push(format!("copy: {}", err)),
            }
        }

        if !linked_done {
            match create_symlink_dir(&skill_path, &link_path) {
                Ok(()) => {
                    linked.push(format!("{}: {}", target.name, link_path.display()));
                    linked_done = true;
                }
                Err(err) => link_errors.push(format!("symlink: {}", err)),
            }
        }

        #[cfg(target_family = "windows")]
        if !linked_done {
            match create_junction_dir(&skill_path, &link_path) {
                Ok(()) => {
                    linked.push(format!("{}: junction {}", target.name, link_path.display()));
                    linked_done = true;
                }
                Err(err) => link_errors.push(format!("junction: {}", err)),
            }
        }

        if !linked_done {
            let detail = if link_errors.is_empty() {
                "unknown error".to_string()
            } else {
                link_errors.join("; ")
            };
            return Err(format!(
                "Failed to create a link for {} in {}: {}",
                request.skill_name, target.name, detail
            ));
        }
    }

    Ok(InstallResult {
        installed_path: skill_path.display().to_string(),
        linked,
        skipped,
    })
}

#[tauri::command]
pub fn adopt_ide_skill(request: AdoptIdeSkillRequest) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory".to_string())?;
    let normalized_home = normalize_path(&home);
    let manager_root = home.join(".skills-manager/skills");
    fs::create_dir_all(&manager_root).map_err(|err| err.to_string())?;

    let target = PathBuf::from(&request.target_path);
    let normalized_target = normalize_path(&target);
    if !normalized_target.starts_with(&normalized_home) {
        return Err("IDE skill path must stay inside the home directory".to_string());
    }

    fs::symlink_metadata(&target).map_err(|_| "IDE skill path does not exist".to_string())?;
    let target_canon = resolve_canonical(&target);

    let (name, has_skill_file) = if let Some(path) = target_canon.as_ref() {
        (read_skill_metadata(path).0, path.join("SKILL.md").exists())
    } else {
        (
            target
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("skill")
                .to_string(),
            false,
        )
    };

    let safe_name = path_sanitize(&name);
    let manager_target = manager_root.join(&safe_name);

    if manager_target.exists() {
        let manager_canon = resolve_canonical(&manager_target)
            .ok_or_else(|| "Managed skill path does not exist".to_string())?;
        if target_canon
            .as_ref()
            .is_some_and(|target_path| *target_path == manager_canon)
        {
            return Ok(format!("{} is already managed", name));
        }
    } else {
        let source_dir = target_canon
            .as_ref()
            .ok_or_else(|| "IDE skill path does not exist".to_string())?;
        if !has_skill_file {
            return Err("Target directory does not contain SKILL.md".to_string());
        }
        copy_dir_recursive(source_dir, &manager_target)?;
    }

    remove_path(&target)?;

    let mut linked_done = false;
    let mut link_errors = Vec::new();

    match create_symlink_dir(&manager_target, &target) {
        Ok(()) => linked_done = true,
        Err(err) => link_errors.push(format!("symlink: {}", err)),
    }

    #[cfg(target_family = "windows")]
    if !linked_done {
        match create_junction_dir(&manager_target, &target) {
            Ok(()) => linked_done = true,
            Err(err) => link_errors.push(format!("junction: {}", err)),
        }
    }

    if !linked_done {
        copy_dir_recursive(&manager_target, &target)?;
        let detail = if link_errors.is_empty() {
            "unknown error".to_string()
        } else {
            link_errors.join("; ")
        };
        return Err(format!(
            "Managed {} in Skills Manager, but failed to create a link for {}. Restored a local copy instead. {}",
            name, request.ide_label, detail
        ));
    }

    Ok(format!(
        "Managed {} and re-linked it to {}",
        name, request.ide_label
    ))
}

#[tauri::command]
pub fn import_local_skill(request: ImportRequest) -> Result<String, String> {
    let manager_dir = manager_root();

    let source_path = PathBuf::from(&request.source_path);
    if !source_path.exists() {
        return Err("Source path does not exist".to_string());
    }

    if !source_path.join("SKILL.md").exists() {
        return Err("The selected directory does not contain SKILL.md".to_string());
    }

    let (name, _) = read_skill_metadata(&source_path);
    let safe_name = path_sanitize(&name);
    let target_dir = manager_dir.join(&safe_name);

    if target_dir.exists() {
        return Err(format!("Target skill already exists: {}", safe_name));
    }

    fs::create_dir_all(&target_dir).map_err(|err| err.to_string())?;
    copy_dir_recursive(&source_path, &target_dir)?;

    Ok(format!("Imported skill: {}", name))
}

#[tauri::command]
pub fn delete_local_skills(request: DeleteLocalSkillRequest) -> Result<String, String> {
    let manager_root = manager_root();

    if request.target_paths.is_empty() {
        return Err("No skills were provided for deletion".to_string());
    }

    let mut deleted = 0usize;

    for raw_path in request.target_paths {
        let target = PathBuf::from(&raw_path);
        let canonical =
            resolve_canonical(&target).ok_or_else(|| "Target skill does not exist".to_string())?;
        if !canonical.starts_with(&manager_root) {
            return Err("Only Skills Manager local skills can be deleted".to_string());
        }
        if canonical == manager_root {
            return Err("Refusing to delete the skills root directory".to_string());
        }
        if !canonical.join("SKILL.md").exists() {
            return Err("Refusing to delete a directory without SKILL.md".to_string());
        }

        fs::remove_dir_all(&canonical).map_err(|err| err.to_string())?;
        deleted += 1;
    }

    Ok(format!("Deleted {} skills", deleted))
}

#[tauri::command]
pub fn export_local_skills(request: ExportSkillsRequest) -> Result<String, String> {
    let manager_root = manager_root();

    if request.target_paths.is_empty() {
        return Err("No skills were provided for export".to_string());
    }
    if request.export_path.trim().is_empty() {
        return Err("Export path is required".to_string());
    }

    let export_path = PathBuf::from(&request.export_path);
    let export_parent = export_path
        .parent()
        .ok_or_else(|| "Export path must include a parent directory".to_string())?;
    fs::create_dir_all(export_parent).map_err(|err| err.to_string())?;

    let mut skill_paths = Vec::new();
    for raw_path in request.target_paths {
        let canonical = validate_manager_skill_path(&PathBuf::from(raw_path), &manager_root)?;
        skill_paths.push(canonical);
    }

    ensure_export_path_is_safe(&export_path, &skill_paths)?;

    let file = File::create(&export_path).map_err(|err| err.to_string())?;
    let mut zip = ZipWriter::new(file);

    for skill_path in &skill_paths {
        let root_name = skill_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("skill");
        if let Err(err) = zip_skill_directory(&mut zip, skill_path, root_name) {
            let _ = zip.finish();
            let _ = fs::remove_file(&export_path);
            return Err(err);
        }
    }

    zip.finish().map_err(|err| err.to_string())?;
    Ok(export_path.display().to_string())
}

#[tauri::command]
pub fn uninstall_skill(request: UninstallRequest) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let mut allowed_roots = vec![home.join(".skills-manager/skills")];

    let ide_dirs: Vec<String> = if request.ide_dirs.is_empty() {
        vec![
            ".gemini/antigravity/skills".to_string(),
            ".claude/skills".to_string(),
            ".codebuddy/skills".to_string(),
            ".codex/skills".to_string(),
            ".cursor/skills".to_string(),
            ".kiro/skills".to_string(),
            ".qoder/skills".to_string(),
            ".trae/skills".to_string(),
            ".github/skills".to_string(),
            ".windsurf/skills".to_string(),
        ]
    } else {
        request
            .ide_dirs
            .iter()
            .map(|item| item.relative_dir.clone())
            .collect()
    };

    for dir in &ide_dirs {
        if !is_valid_ide_path(dir) {
            return Err("Invalid IDE directory".to_string());
        }
        if is_absolute_ide_path(dir) {
            allowed_roots.push(PathBuf::from(dir));
        } else {
            allowed_roots.push(home.join(dir));
        }
    }
    if let Some(project) = request.project_dir {
        let base = PathBuf::from(project);
        allowed_roots.push(base.join(".codex/skills"));
        allowed_roots.push(base.join(".trae/skills"));
        allowed_roots.push(base.join(".opencode/skill"));
        allowed_roots.push(base.join(".skills-manager/skills"));
    }

    let target = PathBuf::from(&request.target_path);
    let parent = target.parent().unwrap_or(std::path::Path::new(&request.target_path));
    let parent_canon = resolve_canonical(parent).unwrap_or_else(|| normalize_path(parent));
    let allowed_roots_canon: Vec<PathBuf> = allowed_roots
        .iter()
        .map(|root| resolve_canonical(root).unwrap_or_else(|| normalize_path(root)))
        .collect();
    let allowed = allowed_roots_canon
        .iter()
        .any(|root| parent_canon.starts_with(root));
    if !allowed {
        return Err("Target path is outside the allowed directories".to_string());
    }

    let metadata = fs::symlink_metadata(&target).map_err(|err| err.to_string())?;
    if metadata.file_type().is_symlink() {
        // `target.is_dir()` follows symlinks and may report true for a symlink-to-dir.
        // Removing such a symlink with `remove_dir` triggers ENOTDIR/ENOTEMPTY on macOS.
        fs::remove_file(&target)
            .or_else(|_| fs::remove_dir(&target))
            .map_err(|err| err.to_string())?;
        return Ok("Link removed".to_string());
    }

    fs::remove_dir_all(&target).map_err(|err| err.to_string())?;
    Ok("Directory removed".to_string())
}

#[tauri::command]
pub fn uninstall_skill_from_ides(request: UninstallSkillFromIdesRequest) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let mut allowed_roots = vec![home.join(".skills-manager/skills")];

    let ide_dirs = vec![
        ".gemini/antigravity/skills".to_string(),
        ".claude/skills".to_string(),
        ".codebuddy/skills".to_string(),
        ".codex/skills".to_string(),
        ".cursor/skills".to_string(),
        ".kiro/skills".to_string(),
        ".qoder/skills".to_string(),
        ".trae/skills".to_string(),
        ".github/skills".to_string(),
        ".windsurf/skills".to_string(),
    ];

    for dir in &ide_dirs {
        if !is_valid_ide_path(dir) {
            return Err("Invalid IDE directory".to_string());
        }
        allowed_roots.push(home.join(dir));
    }

    let allowed_roots_canon: Vec<PathBuf> = allowed_roots
        .iter()
        .map(|root| resolve_canonical(root).unwrap_or_else(|| normalize_path(root)))
        .collect();

    let mut removed_count = 0;
    for path_str in &request.paths {
        let target = PathBuf::from(path_str);
        let parent = target.parent().unwrap_or(std::path::Path::new(path_str));
        let parent_canon = resolve_canonical(parent).unwrap_or_else(|| normalize_path(parent));

        let allowed = allowed_roots_canon
            .iter()
            .any(|root| parent_canon.starts_with(root));
        if !allowed {
            continue;
        }

        let metadata = fs::symlink_metadata(&target);
        if metadata.is_err() {
            continue;
        }
        let metadata = metadata.unwrap();

        if metadata.file_type().is_symlink() {
            let _ = fs::remove_file(&target);
            removed_count += 1;
        } else if metadata.is_dir() {
            let _ = fs::remove_dir_all(&target);
            removed_count += 1;
        }
    }

    Ok(format!("Removed {} items", removed_count))
}
