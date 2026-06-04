//! Path resolution, filesystem helpers, zip helpers, and the public
//! `get_skills_dirs` / `scan_project_ide_dirs` commands.
//!
//! This is the lowest layer of the skills subsystem: every other module
//! calls into here for path math and to mutate the filesystem safely.

use super::types::SkillsDirs;
use crate::types::ProjectIdeDir;
use crate::types::ProjectScanRequest;
use crate::types::ProjectScanResult;
use crate::utils::path::resolve_canonical;
use std::fs;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use tauri::command;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};


/// Resolve `path` to its canonical form, falling back to a normalized copy
/// of the input when the filesystem call fails (e.g. the path does not yet
/// exist on disk).
pub fn resolve_canonical_or(path: &Path) -> PathBuf {
    resolve_canonical(path).unwrap_or_else(|| crate::utils::path::normalize_path(path))
}

const MANAGED_COPY_MARKER: &str = ".skills-manager-source";
const MARKET_SKILL_METADATA: &str = ".skills-manager.json";

pub fn get_skills_base_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("intentloom")
        .join("skills")
}

pub fn get_platform_skills_dir(platform: &str) -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    match platform {
        "claude-code" => Some(home.join(".claude").join("skills")),
        "windsurf" => Some(home.join(".windsurf").join("skills")),
        "cursor" => Some(home.join(".cursor").join("skills")),
        "vscode" => Some(home.join(".vscode").join("extensions")),
        "antigravity" => Some(home.join(".gemini").join("antigravity").join("skills")),
        "codebuddy" => Some(home.join(".codebuddy").join("skills")),
        "codex" => Some(home.join(".codex").join("skills")),
        "kiro" => Some(home.join(".kiro").join("skills")),
        "openclaw" => Some(home.join(".openclaw").join("skills")),
        "opencode" => Some(home.join(".config").join("opencode").join("skills")),
        "qoder" => Some(home.join(".qoder").join("skills")),
        "trae" => Some(home.join(".trae").join("skills")),
        _ => None,
    }
}

#[command]
pub async fn get_skills_dirs() -> Result<SkillsDirs, String> {
    let base = get_skills_base_dir();
    Ok(SkillsDirs {
        intentloom: base.clone(),
        claude_code: dirs::home_dir()
            .map(|h| h.join(".claude").join("skills"))
            .unwrap_or_else(|| base.join("claude-code")),
        windsurf: dirs::home_dir()
            .map(|h| h.join(".windsurf").join("skills"))
            .unwrap_or_else(|| base.join("windsurf")),
        cursor: dirs::home_dir()
            .map(|h| h.join(".cursor").join("skills"))
            .unwrap_or_else(|| base.join("cursor")),
        vscode: dirs::home_dir()
            .map(|h| h.join(".vscode").join("extensions"))
            .unwrap_or_else(|| base.join("vscode")),
        antigravity: dirs::home_dir()
            .map(|h| h.join(".gemini").join("antigravity").join("skills"))
            .unwrap_or_else(|| base.join("antigravity")),
        codebuddy: dirs::home_dir()
            .map(|h| h.join(".codebuddy").join("skills"))
            .unwrap_or_else(|| base.join("codebuddy")),
        codex: dirs::home_dir()
            .map(|h| h.join(".codex").join("skills"))
            .unwrap_or_else(|| base.join("codex")),
        kiro: dirs::home_dir()
            .map(|h| h.join(".kiro").join("skills"))
            .unwrap_or_else(|| base.join("kiro")),
        openclaw: dirs::home_dir()
            .map(|h| h.join(".openclaw").join("skills"))
            .unwrap_or_else(|| base.join("openclaw")),
        opencode: dirs::home_dir()
            .map(|h| h.join(".config").join("opencode").join("skills"))
            .unwrap_or_else(|| base.join("opencode")),
        qoder: dirs::home_dir()
            .map(|h| h.join(".qoder").join("skills"))
            .unwrap_or_else(|| base.join("qoder")),
        trae: dirs::home_dir()
            .map(|h| h.join(".trae").join("skills"))
            .unwrap_or_else(|| base.join("trae")),
    })
}

#[tauri::command]
pub fn scan_project_ide_dirs(request: ProjectScanRequest) -> Result<ProjectScanResult, String> {
    let project_dir = PathBuf::from(&request.project_dir);

    if !project_dir.exists() {
        return Err("Project directory does not exist".to_string());
    }

    let ide_dir_patterns = [
        (".gemini/antigravity/skills", "Antigravity"),
        (".claude/skills", "Claude Code"),
        (".codebuddy/skills", "CodeBuddy"),
        (".codex/skills", "Codex"),
        (".cursor/skills", "Cursor"),
        (".kiro/skills", "Kiro"),
        (".openclaw/skills", "OpenClaw"),
        (".config/opencode/skills", "OpenCode"),
        (".qoder/skills", "Qoder"),
        (".trae/skills", "Trae"),
        (".github/skills", "VSCode"),
        (".windsurf/skills", "Windsurf"),
    ];

    let mut detected_ide_dirs = Vec::new();

    for (relative_path, label) in ide_dir_patterns.iter() {
        let ide_path = project_dir.join(relative_path);
        if ide_path.exists() && ide_path.is_dir() {
            detected_ide_dirs.push(ProjectIdeDir {
                label: label.to_string(),
                relative_dir: relative_path.to_string(),
                absolute_path: ide_path.display().to_string(),
            });
        }
    }

    Ok(ProjectScanResult {
        project_dir: request.project_dir,
        detected_ide_dirs,
    })
}

// =====================================================================
// Skills Manager helpers (metadata / symlinks / zip)
// =====================================================================

pub fn read_skill_metadata(skill_dir: &Path) -> (String, String) {
    let name = skill_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("skill")
        .to_string();

    let skill_file = skill_dir.join("SKILL.md");
    if !skill_file.exists() {
        return (name, String::new());
    }

    let content = fs::read_to_string(&skill_file).unwrap_or_default();
    let lines = content.lines();

    let mut frontmatter_name: Option<String> = None;
    let mut description = String::new();

    let mut in_frontmatter = false;
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            if !in_frontmatter {
                in_frontmatter = true;
                continue;
            }
            break;
        }
        if in_frontmatter {
            if let Some(value) = trimmed.strip_prefix("name:") {
                frontmatter_name = Some(value.trim().to_string());
            }
            continue;
        }
        if description.is_empty() && !trimmed.is_empty() && !trimmed.starts_with('#') {
            description = trimmed.to_string();
        }
    }

    let final_name = frontmatter_name.unwrap_or(name);
    (final_name, description)
}

pub fn read_market_skill_source_url(skill_dir: &Path) -> Option<String> {
    let metadata_path = skill_dir.join(MARKET_SKILL_METADATA);
    let raw = fs::read_to_string(metadata_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed
        .get("source_url")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

pub fn managed_copy_marker_path(skill_dir: &Path) -> PathBuf {
    skill_dir.join(MANAGED_COPY_MARKER)
}

pub fn read_managed_copy_target(skill_dir: &Path) -> Option<PathBuf> {
    let marker_path = managed_copy_marker_path(skill_dir);
    let raw = fs::read_to_string(marker_path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    resolve_canonical(Path::new(trimmed)).or_else(|| Some(PathBuf::from(trimmed)))
}

#[cfg_attr(not(target_family = "windows"), allow(dead_code))]
pub fn write_managed_copy_marker(skill_dir: &Path, manager_skill_path: &Path) -> Result<(), String> {
    fs::write(
        managed_copy_marker_path(skill_dir),
        manager_skill_path.display().to_string(),
    )
    .map_err(|err| err.to_string())
}

pub fn remove_path(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|err| err.to_string())?;
    if metadata.file_type().is_symlink() {
        // `path.is_dir()` follows symlinks and may report true for a symlink-to-dir.
        // Removing such a symlink with `remove_dir` triggers ENOTDIR on macOS.
        fs::remove_file(path)
            .or_else(|_| fs::remove_dir(path))
            .map_err(|err| err.to_string())
    } else if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|err| err.to_string())
    } else {
        fs::remove_file(path).map_err(|err| err.to_string())
    }
}

pub fn is_symlink_to(path: &Path, target: &Path) -> bool {
    match (resolve_canonical(path), resolve_canonical(target)) {
        (Some(link_target), Some(expected_target)) => link_target == expected_target,
        _ => false,
    }
}

pub fn create_symlink_dir(target: &Path, link: &Path) -> Result<(), String> {
    #[cfg(target_family = "unix")]
    {
        std::os::unix::fs::symlink(target, link).map_err(|err| err.to_string())
    }
    #[cfg(target_family = "windows")]
    {
        std::os::windows::fs::symlink_dir(target, link).map_err(|err| err.to_string())
    }
}

pub fn validate_manager_skill_path(target: &Path, manager_root: &Path) -> Result<PathBuf, String> {
    let canonical =
        resolve_canonical(target).ok_or_else(|| "Target skill does not exist".to_string())?;
    if !canonical.starts_with(manager_root) {
        return Err("Only Skills Manager local skills can be exported".to_string());
    }
    if canonical == manager_root {
        return Err("Refusing to export the skills root directory".to_string());
    }
    if !canonical.join("SKILL.md").exists() {
        return Err("Refusing to export a directory without SKILL.md".to_string());
    }
    Ok(canonical)
}

pub fn ensure_export_path_is_safe(export_path: &Path, skill_paths: &[PathBuf]) -> Result<(), String> {
    let file_name = export_path
        .file_name()
        .ok_or_else(|| "Export path must include a file name".to_string())?;
    let export_parent = export_path
        .parent()
        .ok_or_else(|| "Export path must include a parent directory".to_string())?;
    let normalized_export_parent =
        resolve_canonical(export_parent).unwrap_or_else(|| crate::utils::path::normalize_path(export_parent));
    let normalized_export = normalized_export_parent.join(file_name);
    for skill_path in skill_paths {
        if normalized_export.starts_with(skill_path) {
            return Err("Export path cannot be inside a selected skill directory".to_string());
        }
    }
    Ok(())
}

pub fn zip_skill_directory(
    zip: &mut ZipWriter<File>,
    skill_path: &Path,
    root_name: &str,
) -> Result<(), String> {
    let dir_options = || {
        SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o755)
    };
    let file_options = || {
        SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644)
    };

    let root_dir = format!("{}/", root_name);
    zip.add_directory(&root_dir, dir_options())
        .map_err(|err| err.to_string())?;

    for entry in WalkDir::new(skill_path) {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        let file_type = entry.file_type();

        if file_type.is_symlink() {
            return Err(format!(
                "Refusing to export symlinked content: {}",
                path.display()
            ));
        }
        if path == skill_path {
            continue;
        }

        let rel_path = path
            .strip_prefix(skill_path)
            .map_err(|err| err.to_string())?;
        let zip_path = format!(
            "{}/{}",
            root_name,
            rel_path.to_string_lossy().replace('\\', "/")
        );

        if file_type.is_dir() {
            zip.add_directory(format!("{}/", zip_path), dir_options())
                .map_err(|err| err.to_string())?;
            continue;
        }

        let mut file = File::open(path).map_err(|err| err.to_string())?;
        zip.start_file(zip_path, file_options())
            .map_err(|err| err.to_string())?;
        io::copy(&mut file, zip).map_err(|err| err.to_string())?;
    }

    Ok(())
}

#[cfg(target_family = "windows")]
pub fn create_junction_dir(target: &Path, link: &Path) -> Result<(), String> {
    use std::process::Command;

    fn to_cmd_path(path: &Path) -> String {
        path.to_string_lossy().replace('/', "\\")
    }

    fn validate_path(path: &str) -> Result<(), String> {
        let dangerous_chars = ['|', '^', '<', '>', '%', '!', '"', '&', '(', ')', ';'];
        for ch in dangerous_chars {
            if path.contains(ch) {
                return Err(format!("Path contains dangerous character: '{}'", ch));
            }
        }
        Ok(())
    }

    let target = to_cmd_path(target);
    let link = to_cmd_path(link);

    validate_path(&target)?;
    validate_path(&link)?;

    let output = Command::new("cmd")
        .args(["/C", "mklink", "/J", &link, &target])
        .output()
        .map_err(|err| err.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "unknown error".to_string()
        };
        Err(format!("mklink /J failed: {}", detail))
    }
}

#[cfg(target_family = "windows")]
pub fn should_copy_for_target(target_dir: &Path) -> bool {
    let normalized = target_dir.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
    normalized.ends_with("/.qoder/skills")
}
