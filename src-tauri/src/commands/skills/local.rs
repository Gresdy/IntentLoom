//! Local skill management: scanning the Skills Manager tree, previewing,
//! importing an arbitrary directory, and the legacy UI helpers still
//! referenced from `SkillsPanel.tsx`.
//!
//! Heavier operations (linking, adopting, deleting, exporting, uninstalling)
//! live in [`super::manager`].

use super::paths::{read_managed_copy_target, read_skill_metadata, resolve_canonical_or};
use crate::types::{
    IdeSkill, LocalScanRequest, LocalSkill, LocalSkillPreview, Overview,
};
use crate::utils::security::{is_absolute_ide_path, is_valid_ide_path};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::command;

const MANAGER_DIR_RELATIVE: &str = ".skills-manager/skills";

pub fn manager_root() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    resolve_canonical_or(&home.join(MANAGER_DIR_RELATIVE))
}

#[command]
pub fn scan_local_skills() -> Result<Vec<LocalSkill>, String> {
    let manager_dir = manager_root();
    Ok(collect_skills_from_dir(&manager_dir, "manager", None))
}

#[tauri::command]
pub fn scan_overview(request: LocalScanRequest) -> Result<Overview, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;

    let manager_dir = home.join(".skills-manager/skills");
    let mut manager_skills = collect_skills_from_dir(&manager_dir, "manager", None);

    // Resolve IDE directories: absolute paths are used directly, relative paths are joined with home.
    let ide_dirs: Vec<(String, PathBuf)> = if request.ide_dirs.is_empty() {
        vec![
            (
                "Antigravity".to_string(),
                home.join(".gemini/antigravity/skills"),
            ),
            ("Claude".to_string(), home.join(".claude/skills")),
            ("CodeBuddy".to_string(), home.join(".codebuddy/skills")),
            ("Codex".to_string(), home.join(".codex/skills")),
            ("Cursor".to_string(), home.join(".cursor/skills")),
            ("Kiro".to_string(), home.join(".kiro/skills")),
            ("Qoder".to_string(), home.join(".qoder/skills")),
            ("Trae".to_string(), home.join(".trae/skills")),
            ("VSCode".to_string(), home.join(".github/skills")),
            ("Windsurf".to_string(), home.join(".windsurf/skills")),
        ]
    } else {
        request
            .ide_dirs
            .iter()
            .map(|item| {
                if !is_valid_ide_path(&item.relative_dir) {
                    return Err(format!("Invalid IDE directory: {}", item.label));
                }
                if is_absolute_ide_path(&item.relative_dir) {
                    Ok((item.label.clone(), PathBuf::from(&item.relative_dir)))
                } else {
                    Ok((item.label.clone(), home.join(&item.relative_dir)))
                }
            })
            .collect::<Result<Vec<_>, String>>()?
    };

    let mut ide_skills: Vec<IdeSkill> = Vec::new();

    let mut manager_map: Vec<(PathBuf, usize)> = Vec::new();
    for (idx, skill) in manager_skills.iter().enumerate() {
        if let Some(path) = crate::utils::path::resolve_canonical(Path::new(&skill.path)) {
            manager_map.push((path, idx));
        }
    }

    for (label, dir) in &ide_dirs {
        ide_skills.extend(collect_ide_skills(
            dir,
            label,
            &manager_map,
            &mut manager_skills,
        ));
    }

    if let Some(project) = request.project_dir {
        let base = PathBuf::from(project);
        for (label, dir) in &ide_dirs {
            let project_dir = if dir.is_absolute() {
                dir.clone()
            } else {
                base.join(dir)
            };
            ide_skills.extend(collect_ide_skills(
                &project_dir,
                label,
                &manager_map,
                &mut manager_skills,
            ));
        }
    }

    Ok(Overview {
        manager_skills,
        ide_skills,
    })
}

#[tauri::command]
pub fn read_local_skill_preview(skill_path: String) -> Result<LocalSkillPreview, String> {
    let manager_root = manager_root();
    let canonical = super::paths::validate_manager_skill_path(
        &PathBuf::from(skill_path),
        &manager_root,
    )?;
    let skill_md_path = canonical.join("SKILL.md");
    let skill_md_content = fs::read_to_string(&skill_md_path).map_err(|err| err.to_string())?;

    Ok(LocalSkillPreview {
        skill_md_path: skill_md_path.display().to_string(),
        skill_md_content,
    })
}

#[command]
pub async fn _import_local_skill(path: String) -> Result<(), String> {
    let base_dir = super::paths::get_skills_base_dir();
    let skill_path = PathBuf::from(path);

    let skill_name = skill_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    if skill_name.is_empty() {
        return Err("Invalid skill directory".to_string());
    }

    let target_dir = base_dir.join(&skill_name);

    if target_dir.exists() {
        return Err(format!("Skill '{}' already exists", skill_name));
    }

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    fn copy_dir(from: &PathBuf, to: &PathBuf) -> Result<(), String> {
        for entry in std::fs::read_dir(from)
            .map_err(|e| format!("Failed to read directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let entry_path = entry.path();
            let target_path = to.join(entry.file_name());

            if entry_path.is_dir() {
                std::fs::create_dir_all(&target_path)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
                copy_dir(&entry_path, &target_path)?;
            } else {
                std::fs::copy(&entry_path, &target_path)
                    .map_err(|e| format!("Failed to copy file: {}", e))?;
            }
        }
        Ok(())
    }

    copy_dir(&skill_path, &target_dir)?;
    Ok(())
}

#[command]
pub async fn _save_ide_config(_config: serde_json::Value) -> Result<(), String> {
    // No-op for now; reserved for future persistence.
    Ok(())
}

#[command]
pub async fn _open_folder(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .status()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .status()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .status()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

// =====================================================================
// Local scan helpers (private to this module).
// =====================================================================

fn collect_skills_from_dir(base: &Path, source: &str, ide: Option<&str>) -> Vec<LocalSkill> {
    let mut skills = Vec::new();
    if !base.exists() {
        return skills;
    }

    let entries = match fs::read_dir(base) {
        Ok(entries) => entries,
        Err(_) => return skills,
    };

    for entry in entries {
        let entry = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() || !path.join("SKILL.md").exists() {
            continue;
        }
        let (name, description) = read_skill_metadata(&path);
        skills.push(LocalSkill {
            id: path.display().to_string(),
            name,
            description,
            path: path.display().to_string(),
            source: source.to_string(),
            source_url: super::paths::read_market_skill_source_url(&path),
            ide: ide.map(|value| value.to_string()),
            used_by: Vec::new(),
        });
    }

    skills
}

fn collect_ide_skills(
    base: &Path,
    ide_label: &str,
    manager_map: &[(PathBuf, usize)],
    manager_skills: &mut [LocalSkill],
) -> Vec<IdeSkill> {
    let mut skills = Vec::new();
    if !base.exists() {
        return skills;
    }

    let entries = match fs::read_dir(base) {
        Ok(entries) => entries,
        Err(_) => return skills,
    };

    for entry in entries {
        let entry = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let link_target = fs::read_link(&path).ok();
        let managed_copy_target = read_managed_copy_target(&path);
        if !metadata.is_dir() && link_target.is_none() {
            continue;
        }

        let skill_dir = path.as_path();
        let has_skill_file = skill_dir.join("SKILL.md").exists();
        if !has_skill_file && link_target.is_none() && managed_copy_target.is_none() {
            continue;
        }

        let name = if has_skill_file {
            read_skill_metadata(skill_dir).0
        } else {
            skill_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("skill")
                .to_string()
        };

        let path = skill_dir.to_path_buf();
        let mut managed = false;
        let source = if let Some(link_target) = link_target {
            let absolute_target = if link_target.is_relative() {
                if let Some(parent) = path.parent() {
                    parent.join(&link_target)
                } else {
                    link_target.clone()
                }
            } else {
                link_target
            };

            if let Some(target) = crate::utils::path::resolve_canonical(&absolute_target) {
                for (manager_path, idx) in manager_map {
                    if *manager_path == target {
                        managed = true;
                        if let Some(skill) = manager_skills.get_mut(*idx) {
                            if !skill.used_by.contains(&ide_label.to_string()) {
                                skill.used_by.push(ide_label.to_string());
                            }
                        }
                        break;
                    }
                }
            }
            "link"
        } else if let Some(copy_target) = managed_copy_target {
            for (manager_path, idx) in manager_map {
                if *manager_path == copy_target {
                    managed = true;
                    if let Some(skill) = manager_skills.get_mut(*idx) {
                        if !skill.used_by.contains(&ide_label.to_string()) {
                            skill.used_by.push(ide_label.to_string());
                        }
                    }
                    break;
                }
            }
            "link"
        } else {
            "local"
        };

        skills.push(IdeSkill {
            id: path.display().to_string(),
            name,
            path: path.display().to_string(),
            ide: ide_label.to_string(),
            source: source.to_string(),
            managed,
        });
    }

    skills
}
