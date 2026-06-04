//! Public marketplace commands: search, install, list, batch, legacy uninstall.
//!
//! These all operate on the `intentloom` global skills directory plus the
//! per-IDE symlink farm. See [`super::paths`] for the layout helpers.

use super::paths::{get_platform_skills_dir, get_skills_base_dir};
use super::types::{MarketplaceResponse, Skill};
use std::collections::HashMap;
use tauri::command;

#[command]
pub async fn search_skills(
    query: String,
    source: Option<String>,
) -> Result<MarketplaceResponse, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(MarketplaceResponse {
            skills: Vec::new(),
            total: 0,
        });
    }

    let allowed_sources = [
        ("claude-code", "Claude Code"),
        ("openclaw", "OpenClaw"),
    ];

    let source_filter: Option<&str> = if let Some(s) = source.as_deref() {
        if allowed_sources.iter().any(|(k, _)| *k == s) {
            Some(s)
        } else {
            return Err(format!("Unsupported source: {}", s));
        }
    } else {
        None
    };

    let mut aggregated: Vec<Skill> = Vec::new();

    for (key, label) in allowed_sources.iter() {
        if let Some(filter) = source_filter {
            if filter != *key {
                continue;
            }
        }

        let url = format!(
            "https://api.github.com/search/repositories?q={}+topic:skill&per_page=20",
            urlencoding(trimmed)
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header("User-Agent", "intentloom")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| format!("Failed to query GitHub for {}: {}", label, e))?;

        if !response.status().is_success() {
            // Skip sources that rate-limited us; fall through to the next one.
            continue;
        }

        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response from {}: {}", label, e))?;

        if let Some(items) = body.get("items").and_then(|value| value.as_array()) {
            for item in items {
                let name = item
                    .get("name")
                    .and_then(|value| value.as_str())
                    .unwrap_or("skill")
                    .to_string();
                let description = item
                    .get("description")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string();
                let author = item
                    .get("owner")
                    .and_then(|owner| owner.get("login"))
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string();
                let repo_url = item
                    .get("html_url")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .to_string();
                let updated_at = item
                    .get("updated_at")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string());

                aggregated.push(Skill {
                    id: repo_url.clone(),
                    name: name.clone(),
                    description,
                    author,
                    source: label.to_string(),
                    repo_url,
                    local_path: None,
                    symlinks: HashMap::new(),
                    version: None,
                    installed_at: None,
                    updated_at,
                });
            }
        }
    }

    Ok(MarketplaceResponse {
        total: aggregated.len(),
        skills: aggregated,
    })
}

#[command]
pub async fn install_skill(skill: Skill, platform: String) -> Result<String, String> {
    let base_dir = get_skills_base_dir();
    let skill_dir = base_dir.join(&skill.name);

    // Skip download when the directory is already populated.
    if !skill_dir.exists() {
        let zip_url = format!("https://github-zip-api.val.run/zip?source={}", skill.repo_url);

        let response = reqwest::get(&zip_url)
            .await
            .map_err(|e| format!("Failed to download: {}", e))?;

        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| format!("Failed to read ZIP: {}", e))?;

        std::fs::create_dir_all(&skill_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
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

    // Create the per-IDE symlink.
    if let Some(platform_dir) = get_platform_skills_dir(&platform) {
        std::fs::create_dir_all(&platform_dir)
            .map_err(|e| format!("Failed to create platform dir: {}", e))?;

        let symlink_path = platform_dir.join(&skill.name);

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
pub async fn batch_install_skills(
    skills: Vec<Skill>,
    platforms: Vec<String>,
) -> Result<Vec<String>, String> {
    let mut results = Vec::new();

    for skill in skills {
        for platform in &platforms {
            match install_skill(skill.clone(), platform.clone()).await {
                Ok(result) => {
                    results.push(format!(
                        "成功安装 {} 到 {}: {}",
                        skill.name, platform, result
                    ));
                }
                Err(e) => {
                    results.push(format!(
                        "安装 {} 到 {} 失败: {}",
                        skill.name, platform, e
                    ));
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

    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                if !name.is_empty() && skill_names.insert(name.clone()) {
                    let mut symlinks = HashMap::new();
                    for platform in [
                        "claude-code",
                        "windsurf",
                        "cursor",
                        "vscode",
                        "antigravity",
                        "codebuddy",
                        "codex",
                        "kiro",
                        "openclaw",
                        "opencode",
                        "qoder",
                        "trae",
                    ] {
                        if let Some(platform_dir) = get_platform_skills_dir(platform) {
                            let symlink_path = platform_dir.join(&name);
                            if symlink_path.symlink_metadata().is_ok() {
                                symlinks.insert(
                                    platform.to_string(),
                                    symlink_path.to_string_lossy().to_string(),
                                );
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

    if let Some(claude_dir) = get_platform_skills_dir("claude-code") {
        if let Ok(entries) = std::fs::read_dir(&claude_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() || path.symlink_metadata().is_ok() {
                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    if !name.is_empty() && skill_names.insert(name.clone()) {
                        let mut symlinks = HashMap::new();
                        symlinks.insert(
                            "claude-code".to_string(),
                            path.to_string_lossy().to_string(),
                        );
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

    if let Some(openclaw_dir) = get_platform_skills_dir("openclaw") {
        if let Ok(entries) = std::fs::read_dir(&openclaw_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() || path.symlink_metadata().is_ok() {
                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    if !name.is_empty() && skill_names.insert(name.clone()) {
                        let mut symlinks = HashMap::new();
                        symlinks.insert(
                            "openclaw".to_string(),
                            path.to_string_lossy().to_string(),
                        );
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

fn urlencoding(input: &str) -> String {
    // Minimal percent-encoder for the GitHub search query.
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b' ' | b'+' => out.push('+'),
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}
