//! Public types shared by the skills subsystem.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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
