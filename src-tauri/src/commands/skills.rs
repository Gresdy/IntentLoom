use crate::types::{
    AdoptIdeSkillRequest, DeleteLocalSkillRequest, ExportSkillsRequest, IdeSkill, ImportRequest,
    InstallResult, LinkRequest, LocalScanRequest, LocalSkill, LocalSkillPreview, Overview,
    ProjectIdeDir, ProjectScanRequest, ProjectScanResult, UninstallRequest,
    UninstallSkillFromIdesRequest,
};
use crate::utils::download::copy_dir_recursive;
use crate::utils::path::{normalize_path, resolve_canonical, sanitize_dir_name};
use crate::utils::security::{is_absolute_ide_path, is_valid_ide_path};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use tauri::command;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub source: String,
    pub repo_url: String,
    #[serde(default)]
    pub local_path: Option<String>,
    #[serde(default)]
    pub symlinks: HashMap<String, String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub installed_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MarketplaceResponse {
    pub skills: Vec<Skill>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SkillsDirs {
    pub intentloom: PathBuf,
    pub claude_code: PathBuf,
    pub windsurf: PathBuf,
    pub cursor: PathBuf,
    pub vscode: PathBuf,
    pub antigravity: PathBuf,
    pub codebuddy: PathBuf,
    pub codex: PathBuf,
    pub kiro: PathBuf,
    pub openclaw: PathBuf,
    pub opencode: PathBuf,
    pub qoder: PathBuf,
    pub trae: PathBuf,
}

fn get_skills_base_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("intentloom")
        .join("skills")
}

fn get_platform_skills_dir(platform: &str) -> Option<PathBuf> {
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

#[command]
pub async fn search_skills(query: String, source: Option<String>) -> Result<MarketplaceResponse, String> {
    let mut all_skills = Vec::new();

    // 创建一个 reqwest 客户端，用于复用连接
    let client = reqwest::Client::new();

    // Search Claude Plugins
    if source.is_none() || source.as_deref() == Some("claude-plugins") {
        if let Ok(resp) = client.get("https://claude-plugins.dev/api/skills").send().await {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(skills) = data.get("skills").and_then(|s| s.as_array()) {
                    for s in skills {
                        if let Some(name) = s.get("name").and_then(|n| n.as_str()) {
                            if name.to_lowercase().contains(&query.to_lowercase())
                                || s.get("description").and_then(|d| d.as_str()).unwrap_or("").to_lowercase().contains(&query.to_lowercase())
                            {
                                all_skills.push(Skill {
                                    id: s.get("id").and_then(|i| i.as_str()).unwrap_or(name).to_string(),
                                    name: name.to_string(),
                                    description: s.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                                    author: s.get("author").and_then(|a| a.as_str()).unwrap_or("unknown").to_string(),
                                    source: "claude-plugins".to_string(),
                                    repo_url: s.get("repo_url").or(s.get("url")).and_then(|u| u.as_str()).unwrap_or("").to_string(),
                                    local_path: None,
                                    symlinks: HashMap::new(),
                                    version: s.get("version").and_then(|v| v.as_str()).map(String::from),
                                    installed_at: None,
                                    updated_at: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Search SkillsLLM
    if source.is_none() || source.as_deref() == Some("skillsllm") {
        if let Ok(resp) = client.get("https://skillsllm.com/api/skills").send().await {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(skills) = data.get("skills").and_then(|s| s.as_array()) {
                    for s in skills {
                        if let Some(name) = s.get("name").and_then(|n| n.as_str()) {
                            if name.to_lowercase().contains(&query.to_lowercase())
                                || s.get("description").and_then(|d| d.as_str()).unwrap_or("").to_lowercase().contains(&query.to_lowercase())
                            {
                                all_skills.push(Skill {
                                    id: s.get("id").and_then(|i| i.as_str()).unwrap_or(name).to_string(),
                                    name: name.to_string(),
                                    description: s.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                                    author: s.get("author").and_then(|a| a.as_str()).unwrap_or("unknown").to_string(),
                                    source: "skillsllm".to_string(),
                                    repo_url: s.get("repo_url").or(s.get("url")).and_then(|u| u.as_str()).unwrap_or("").to_string(),
                                    local_path: None,
                                    symlinks: HashMap::new(),
                                    version: s.get("version").and_then(|v| v.as_str()).map(String::from),
                                    installed_at: None,
                                    updated_at: None,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Search SkillsMP
    if source.is_none() || source.as_deref() == Some("skillsmp") {
        let url = format!("https://skillsmp.com/api/v1/skills/search?q={}", urlencoding::encode(&query));
        if let Ok(resp) = client.get(&url).send().await {
            if let Ok(data) = resp.json::<serde_json::Value>().await {
                if let Some(skills) = data.get("skills").and_then(|s| s.as_array()) {
                    for s in skills {
                        if let Some(name) = s.get("name").and_then(|n| n.as_str()) {
                            all_skills.push(Skill {
                                id: s.get("id").and_then(|i| i.as_str()).unwrap_or(name).to_string(),
                                name: name.to_string(),
                                description: s.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                                author: s.get("author").and_then(|a| a.as_str()).unwrap_or("unknown").to_string(),
                                source: "skillsmp".to_string(),
                                repo_url: s.get("repo_url").or(s.get("url")).and_then(|u| u.as_str()).unwrap_or("").to_string(),
                                local_path: None,
                                symlinks: HashMap::new(),
                                version: s.get("version").and_then(|v| v.as_str()).map(String::from),
                                installed_at: None,
                                updated_at: None,
                            });
                        }
                    }
                }
            }
        }
    }

    let total = all_skills.len();
    Ok(MarketplaceResponse { skills: all_skills, total })
}

#[command]
pub async fn install_skill(skill: Skill, platform: String) -> Result<String, String> {
    let base_dir = get_skills_base_dir();
    let skill_dir = base_dir.join(&skill.name);

    // Check if skill already exists (skip download if yes)
    if !skill_dir.exists() {
        // Download from ZIP proxy
        let zip_url = format!("https://github-zip-api.val.run/zip?source={}", skill.repo_url);

        let response = reqwest::get(&zip_url)
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        // Extract ZIP
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to read ZIP: {}", e))?;

        std::fs::create_dir_all(&skill_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("Failed to read ZIP entry: {}", e))?;
            let outpath = match file.enclosed_name() {
                Some(path) => skill_dir.join(path),
                None => continue,
            };

            if file.name().ends_with('/') {
                std::fs::create_dir_all(&outpath)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                if let Some(parent) = outpath.parent() {
                    if !parent.exists() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| format!("Failed to create directory: {}", e))?;
                    }
                }
                let mut outfile = std::fs::File::create(&outpath)
                    .map_err(|e| format!("Failed to create file: {}", e))?;
                std::io::copy(&mut file, &mut outfile)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            }
        }
    }

    // Create symlink for the platform
    if let Some(platform_dir) = get_platform_skills_dir(&platform) {
        std::fs::create_dir_all(&platform_dir)
            .map_err(|e| format!("Failed to create platform dir: {}", e))?;

        let symlink_path = platform_dir.join(&skill.name);

        // Remove existing symlink/file if exists
        if symlink_path.exists() || symlink_path.symlink_metadata().is_ok() {
            std::fs::remove_file(&symlink_path)
                .map_err(|e| format!("Failed to remove existing: {}", e))?;
        }

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&skill_dir, &symlink_path)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;

        #[cfg(not(windows))]
        std::os::unix::fs::symlink(&skill_dir, &symlink_path)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;

        Ok(symlink_path.to_string_lossy().to_string())
    } else {
        Err(format!("Unknown platform: {}", platform))
    }
}

#[command]
pub async fn batch_install_skills(skills: Vec<Skill>, platforms: Vec<String>) -> Result<Vec<String>, String> {
    let mut results = Vec::new();
    
    for skill in skills {
        for platform in &platforms {
            match install_skill(skill.clone(), platform.clone()).await {
                Ok(result) => {
                    results.push(format!("成功安装 {} 到 {}: {}", skill.name, platform, result));
                }
                Err(e) => {
                    results.push(format!("安装 {} 到 {} 失败: {}", skill.name, platform, e));
                }
            }
        }
    }
    
    Ok(results)
}

#[command]
pub async fn uninstall_skill_legacy(skill_name: String, platform: String) -> Result<(), String> {
    if let Some(platform_dir) = get_platform_skills_dir(&platform) {
        let symlink_path = platform_dir.join(&skill_name);

        if symlink_path.exists() || symlink_path.symlink_metadata().is_ok() {
            std::fs::remove_file(&symlink_path)
                .map_err(|e| format!("Failed to remove symlink: {}", e))?;
        }

        // Check if any other symlinks exist for this skill
        let base_dir = get_skills_base_dir();
        let skill_dir = base_dir.join(&skill_name);

        let mut has_other_symlinks = false;
        if skill_dir.exists() {
            for platform_check in ["claude-code", "windsurf", "cursor", "vscode"] {
                if platform_check == platform {
                    continue;
                }
                if let Some(other_dir) = get_platform_skills_dir(platform_check) {
                    let other_symlink = other_dir.join(&skill_name);
                    if other_symlink.exists() || other_symlink.symlink_metadata().is_ok() {
                        has_other_symlinks = true;
                        break;
                    }
                }
            }

            // If no other symlinks, remove the skill directory
            if !has_other_symlinks {
                std::fs::remove_dir_all(&skill_dir)
                    .map_err(|e| format!("Failed to remove skill dir: {}", e))?;
            }
        }

        Ok(())
    } else {
        Err(format!("Unknown platform: {}", platform))
    }
}

#[command]
pub fn list_installed_skills() -> Result<Vec<Skill>, String> {
    let base_dir = get_skills_base_dir();
    let mut skills = Vec::new();
    let mut skill_names = std::collections::HashSet::new();

    // Read skills from IntentLoom's base directory
    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                if !name.is_empty() && skill_names.insert(name.clone()) {
                    let mut symlinks = HashMap::new();

                    // Check for existing symlinks
                    for platform in ["claude-code", "windsurf", "cursor", "vscode", "antigravity", "codebuddy", "codex", "kiro", "openclaw", "opencode", "qoder", "trae"] {
                        if let Some(platform_dir) = get_platform_skills_dir(platform) {
                            let symlink_path = platform_dir.join(&name);
                            if symlink_path.symlink_metadata().is_ok() {
                                symlinks.insert(platform.to_string(), symlink_path.to_string_lossy().to_string());
                            }
                        }
                    }

                    skills.push(Skill {
                        id: name.clone(),
                        name: name.clone(),
                        description: String::new(),
                        author: String::new(),
                        source: String::new(),
                        repo_url: String::new(),
                        local_path: Some(path.to_string_lossy().to_string()),
                        symlinks,
                        version: None,
                        installed_at: None,
                        updated_at: None,
                    });
                }
            }
        }
    }

    // Read skills from Claude Code directory
    if let Some(claude_dir) = get_platform_skills_dir("claude-code") {
        if let Ok(entries) = std::fs::read_dir(&claude_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() || path.symlink_metadata().is_ok() {
                    let name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    if !name.is_empty() && skill_names.insert(name.clone()) {
                        let mut symlinks = HashMap::new();
                        symlinks.insert("claude-code".to_string(), path.to_string_lossy().to_string());

                        skills.push(Skill {
                            id: name.clone(),
                            name: name.clone(),
                            description: String::new(),
                            author: String::new(),
                            source: String::new(),
                            repo_url: String::new(),
                            local_path: Some(path.to_string_lossy().to_string()),
                            symlinks,
                            version: None,
                            installed_at: None,
                            updated_at: None,
                        });
                    }
                }
            }
        }
    }

    // Read skills from OpenClaw directory
    if let Some(openclaw_dir) = get_platform_skills_dir("openclaw") {
        if let Ok(entries) = std::fs::read_dir(&openclaw_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() || path.symlink_metadata().is_ok() {
                    let name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();

                    if !name.is_empty() && skill_names.insert(name.clone()) {
                        let mut symlinks = HashMap::new();
                        symlinks.insert("openclaw".to_string(), path.to_string_lossy().to_string());

                        skills.push(Skill {
                            id: name.clone(),
                            name: name.clone(),
                            description: String::new(),
                            author: String::new(),
                            source: String::new(),
                            repo_url: String::new(),
                            local_path: Some(path.to_string_lossy().to_string()),
                            symlinks,
                            version: None,
                            installed_at: None,
                            updated_at: None,
                        });
                    }
                }
            }
        }
    }

    Ok(skills)
}

#[command]
pub async fn _import_local_skill(path: String) -> Result<(), String> {
    let base_dir = get_skills_base_dir();
    let skill_path = PathBuf::from(path);
    
    // Get skill name from directory
    let skill_name = skill_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    
    if skill_name.is_empty() {
        return Err("Invalid skill directory".to_string());
    }
    
    let target_dir = base_dir.join(&skill_name);
    
    // Check if skill already exists
    if target_dir.exists() {
        return Err(format!("Skill '{}' already exists", skill_name));
    }
    
    // Create target directory
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    // Copy skill files
    fn copy_dir(from: &PathBuf, to: &PathBuf) -> Result<(), String> {
        for entry in std::fs::read_dir(from).map_err(|e| format!("Failed to read directory: {}", e))? {
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
    // For now, just return success
    // In a real implementation, you would save this to a config file
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

// ============================================================
// Skills Manager Commands (from skills-manager)
// ============================================================

const MANAGED_COPY_MARKER: &str = ".skills-manager-source";
const MARKET_SKILL_METADATA: &str = ".skills-manager.json";

fn read_skill_metadata(skill_dir: &Path) -> (String, String) {
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

fn read_market_skill_source_url(skill_dir: &Path) -> Option<String> {
    let metadata_path = skill_dir.join(MARKET_SKILL_METADATA);
    let raw = fs::read_to_string(metadata_path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed
        .get("source_url")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
}

fn managed_copy_marker_path(skill_dir: &Path) -> PathBuf {
    skill_dir.join(MANAGED_COPY_MARKER)
}

fn read_managed_copy_target(skill_dir: &Path) -> Option<PathBuf> {
    let marker_path = managed_copy_marker_path(skill_dir);
    let raw = fs::read_to_string(marker_path).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    resolve_canonical(Path::new(trimmed)).or_else(|| Some(PathBuf::from(trimmed)))
}

#[cfg(target_family = "windows")]
fn write_managed_copy_marker(skill_dir: &Path, manager_skill_path: &Path) -> Result<(), String> {
    fs::write(
        managed_copy_marker_path(skill_dir),
        manager_skill_path.display().to_string(),
    )
    .map_err(|err| err.to_string())
}

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
            source_url: read_market_skill_source_url(&path),
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

            if let Some(target) = resolve_canonical(&absolute_target) {
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

fn remove_path(path: &Path) -> Result<(), String> {
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

fn is_symlink_to(path: &Path, target: &Path) -> bool {
    match (resolve_canonical(path), resolve_canonical(target)) {
        (Some(link_target), Some(expected_target)) => link_target == expected_target,
        _ => false,
    }
}

fn create_symlink_dir(target: &Path, link: &Path) -> Result<(), String> {
    #[cfg(target_family = "unix")]
    {
        std::os::unix::fs::symlink(target, link).map_err(|err| err.to_string())
    }
    #[cfg(target_family = "windows")]
    {
        std::os::windows::fs::symlink_dir(target, link).map_err(|err| err.to_string())
    }
}

fn validate_manager_skill_path(target: &Path, manager_root: &Path) -> Result<PathBuf, String> {
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

fn ensure_export_path_is_safe(export_path: &Path, skill_paths: &[PathBuf]) -> Result<(), String> {
    let file_name = export_path
        .file_name()
        .ok_or_else(|| "Export path must include a file name".to_string())?;
    let export_parent = export_path
        .parent()
        .ok_or_else(|| "Export path must include a parent directory".to_string())?;
    let normalized_export_parent =
        resolve_canonical(export_parent).unwrap_or_else(|| normalize_path(export_parent));
    let normalized_export = normalized_export_parent.join(file_name);
    for skill_path in skill_paths {
        if normalized_export.starts_with(skill_path) {
            return Err("Export path cannot be inside a selected skill directory".to_string());
        }
    }
    Ok(())
}

fn zip_skill_directory(
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
fn create_junction_dir(target: &Path, link: &Path) -> Result<(), String> {
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
fn should_copy_for_target(target_dir: &Path) -> bool {
    let normalized = target_dir.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
    normalized.ends_with("/.qoder/skills")
}

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

    let safe_name = sanitize_dir_name(&request.skill_name);

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
pub fn scan_overview(request: LocalScanRequest) -> Result<Overview, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;

    let manager_dir = home.join(".skills-manager/skills");
    let mut manager_skills = collect_skills_from_dir(&manager_dir, "manager", None);

    // Resolve IDE directories: absolute paths are used directly, relative paths are joined with home
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
                // Absolute path: use directly
                if is_absolute_ide_path(&item.relative_dir) {
                    Ok((item.label.clone(), PathBuf::from(&item.relative_dir)))
                } else {
                    // Relative path: join with home directory
                    Ok((item.label.clone(), home.join(&item.relative_dir)))
                }
            })
            .collect::<Result<Vec<_>, String>>()?
    };

    let mut ide_skills: Vec<IdeSkill> = Vec::new();

    let mut manager_map: Vec<(PathBuf, usize)> = Vec::new();
    for (idx, skill) in manager_skills.iter().enumerate() {
        if let Some(path) = resolve_canonical(Path::new(&skill.path)) {
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
            // For absolute paths, also check the same path under project
            // For relative paths, join with project directory
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
pub fn scan_local_skills() -> Result<Vec<LocalSkill>, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let manager_dir = home.join(".skills-manager/skills");
    let skills = collect_skills_from_dir(&manager_dir, "manager", None);
    Ok(skills)
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
        // Absolute path: add directly to allowed roots
        if is_absolute_ide_path(dir) {
            allowed_roots.push(PathBuf::from(dir));
        } else {
            // Relative path: join with home directory
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
    let parent = target.parent().unwrap_or(Path::new(&request.target_path));
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

    // Default IDE directories
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
        let parent = target.parent().unwrap_or(Path::new(path_str));
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

#[tauri::command]
pub fn import_local_skill(request: ImportRequest) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let manager_dir = home.join(".skills-manager/skills");

    let source_path = PathBuf::from(&request.source_path);
    if !source_path.exists() {
        return Err("Source path does not exist".to_string());
    }

    if !source_path.join("SKILL.md").exists() {
        return Err("The selected directory does not contain SKILL.md".to_string());
    }

    let (name, _) = read_skill_metadata(&source_path);
    let safe_name = sanitize_dir_name(&name);
    let target_dir = manager_dir.join(&safe_name);

    if target_dir.exists() {
        return Err(format!("Target skill already exists: {}", safe_name));
    }

    fs::create_dir_all(&target_dir).map_err(|err| err.to_string())?;
    copy_dir_recursive(&source_path, &target_dir)?;

    Ok(format!("Imported skill: {}", name))
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

    let safe_name = sanitize_dir_name(&name);
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
pub fn read_local_skill_preview(skill_path: String) -> Result<LocalSkillPreview, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let manager_root = resolve_canonical(&home.join(".skills-manager/skills"))
        .unwrap_or_else(|| normalize_path(&home.join(".skills-manager/skills")));
    let canonical = validate_manager_skill_path(&PathBuf::from(skill_path), &manager_root)?;
    let skill_md_path = canonical.join("SKILL.md");
    let skill_md_content = fs::read_to_string(&skill_md_path).map_err(|err| err.to_string())?;

    Ok(LocalSkillPreview {
        skill_md_path: skill_md_path.display().to_string(),
        skill_md_content,
    })
}

#[tauri::command]
pub fn delete_local_skills(request: DeleteLocalSkillRequest) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let manager_root = resolve_canonical(&home.join(".skills-manager/skills"))
        .unwrap_or_else(|| normalize_path(&home.join(".skills-manager/skills")));

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
    let home = dirs::home_dir().ok_or("Unable to determine the home directory")?;
    let manager_root = resolve_canonical(&home.join(".skills-manager/skills"))
        .unwrap_or_else(|| normalize_path(&home.join(".skills-manager/skills")));

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
