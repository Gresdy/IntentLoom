//! Per-adapter configuration store.
//!
//! This mirrors the shape of AionUi's `acp.config[backend]` bag
//! (`cli_path`, `yoloMode`, `preferredMode`, `preferredModelId`, …)
//! but stripped to the knobs IntentLoom actually exposes: a
//! user-supplied `cli_path` override plus a list of extra
//! environment variables to pass to the CLI when streaming a turn.
//!
//! The file lives in `app_data_dir("intentloom/agents.json")` and is
//! loaded on startup by [`AgentConfigStore::load`]. The
//! [`tauri::command`] surface in `commands/agents.rs` reads and
//! writes through [`AgentConfigStore::set`].
//!
//! Reads are non-blocking and tolerate a missing / corrupt file:
//! they fall back to the empty default. Writes go through a
//! `std::sync::Mutex` and are persisted to disk synchronously
//! after each mutation so the next launch sees them — we don't
//! queue background flushes because the volume is tiny (one
//! small JSON file, hand-edited at human pace) and a power loss
//! after a successful UI write would be confusing.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Per-adapter override. The keys here are a strict superset of
/// the AionUi `acp.config[backend]` schema; we only wire up
/// `cli_path` and `env` for now because the rest of IntentLoom's
/// composer surface is still under design (see
/// `docs/plan/multi-agent-cockpit.md`).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    /// User-supplied absolute path to the binary. When `Some`,
    /// the adapter lookup prefers this over the `$PATH` scan in
    /// [`crate::agents::which`]. Used by users who installed the
    /// CLI into a non-standard prefix (e.g. `~/bin` or a venv
    /// they don't want on `$PATH`).
    pub cli_path: Option<String>,
    /// Extra environment variables to pass when the CLI is
    /// spawned. Merged on top of the parent process env; entries
    /// with a value of `""` are forwarded unchanged so the user
    /// can intentionally clear a var inherited from the shell.
    /// Insertion order is the iteration order of [`BTreeMap`] so
    /// the resulting JSON is deterministic on disk.
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

impl AgentConfig {
    /// The "no overrides" default. Cheaply cloneable.
    pub fn empty() -> Self {
        Self::default()
    }
}

/// File-on-disk schema: a single map keyed by adapter id
/// (e.g. "claude", "codex", "openclaw"). Adapters that the user
/// has never touched simply have no entry — that is distinct
/// from an entry with all-default fields, because the UI
/// shouldn't render a setup card just because the file exists.
pub type ConfigFile = BTreeMap<String, AgentConfig>;

/// The live store, owned by Tauri's state container. Methods
/// hand out `&AgentConfig` so callers can probe without taking
/// the lock; mutations are serialized through the inner `Mutex`.
pub struct AgentConfigStore {
    inner: Mutex<ConfigFile>,
    path: PathBuf,
}

impl AgentConfigStore {
    /// Load from `app_data_dir("intentloom/agents.json")`, or
    /// return an empty store if the file is missing / unreadable /
    /// malformed. The store is always usable after construction;
    /// the lock is only needed for mutations.
    pub fn load(app_data_dir: &Path) -> Self {
        let path = config_path(app_data_dir);
        let inner = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<ConfigFile>(&raw).ok())
            .unwrap_or_default();
        Self { inner: Mutex::new(inner), path }
    }

    /// Snapshot the config for one adapter, or an empty default
    /// if the user has never set one up. Cheap; clones.
    pub fn get(&self, id: &str) -> AgentConfig {
        let guard = self.inner.lock().expect("agent config mutex poisoned");
        guard.get(id).cloned().unwrap_or_default()
    }

    /// Insert (or replace) the config for one adapter and persist
    /// the whole map to disk. Returns the new config so the
    /// caller can update its UI state without a second round-trip.
    pub fn set(&self, id: impl Into<String>, config: AgentConfig) -> AgentConfig {
        let id = id.into();
        let mut guard = self.inner.lock().expect("agent config mutex poisoned");
        if config.cli_path.is_none() && config.env.is_empty() {
            // Treat "all defaults" as a deletion so the on-disk
            // file doesn't accumulate empty entries over time.
            guard.remove(&id);
        } else {
            guard.insert(id.clone(), config.clone());
        }
        // Snapshot the values we want to write + the new map, drop
        // the lock, then write. This keeps the critical section
        // short and avoids holding the lock across a fsync.
        let to_write = guard.clone();
        drop(guard);
        if let Err(e) = persist(&self.path, &to_write) {
            tracing::error!(?e, path = %self.path.display(), "failed to persist agent config");
        }
        // Return the stored (or previously-stored) value so the
        // caller can re-read it.
        to_write.get(&id).cloned().unwrap_or_default()
    }

    /// Wipe a single adapter's overrides. Convenient for the
    /// "reset to defaults" button on the settings card.
    pub fn clear(&self, id: &str) {
        let mut guard = self.inner.lock().expect("agent config mutex poisoned");
        guard.remove(id);
        let snapshot = guard.clone();
        drop(guard);
        if let Err(e) = persist(&self.path, &snapshot) {
            tracing::error!(?e, "failed to persist agent config after clear");
        }
    }

    /// All configured adapter ids, in stable order. Used by the
    /// panel to decide which entries need a "reset" affordance.
    pub fn configured_ids(&self) -> Vec<String> {
        let guard = self.inner.lock().expect("agent config mutex poisoned");
        guard.keys().cloned().collect()
    }
}

fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("intentloom").join("agents.json")
}

fn persist(path: &Path, snapshot: &ConfigFile) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Pretty-print so the file is human-readable when the user opens
    // it in a text editor. The volume is tiny.
    let body = serde_json::to_string_pretty(snapshot)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(path, body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn tempdir(tag: &str) -> PathBuf {
        let pid = std::process::id();
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("intentloom_cfg_{tag}_{pid}_{n}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn load_missing_file_yields_empty_store() {
        let dir = tempdir("missing");
        let store = AgentConfigStore::load(&dir);
        assert!(store.get("claude").cli_path.is_none());
        assert!(store.get("claude").env.is_empty());
        assert!(store.configured_ids().is_empty());
    }

    #[test]
    fn set_then_get_round_trips() {
        let dir = tempdir("rt");
        let store = AgentConfigStore::load(&dir);
        let cfg = AgentConfig {
            cli_path: Some("/opt/claude/bin/claude".into()),
            env: BTreeMap::from([("ANTHROPIC_BASE_URL".into(), "https://proxy".into())]),
        };
        store.set("claude", cfg.clone());
        let got = store.get("claude");
        assert_eq!(got.cli_path, cfg.cli_path);
        assert_eq!(got.env.get("ANTHROPIC_BASE_URL").map(String::as_str), Some("https://proxy"));
    }

    #[test]
    fn empty_set_clears_the_entry() {
        let dir = tempdir("empty");
        let store = AgentConfigStore::load(&dir);
        // Set then immediately replace with the empty default.
        store.set("claude", AgentConfig { cli_path: Some("/x".into()), env: BTreeMap::new() });
        store.set("claude", AgentConfig::default());
        // Should be gone from the map.
        assert!(store.get("claude").cli_path.is_none());
        assert!(store.configured_ids().is_empty());
    }

    #[test]
    fn persist_writes_a_readable_file() {
        let dir = tempdir("persist");
        let store = AgentConfigStore::load(&dir);
        let mut env = BTreeMap::new();
        env.insert("FOO".into(), "bar".into());
        store.set("codex", AgentConfig { cli_path: Some("/u".into()), env });
        // Re-load from the same dir and confirm we see the value.
        let reloaded = AgentConfigStore::load(&dir);
        assert_eq!(reloaded.get("codex").cli_path.as_deref(), Some("/u"));
        assert_eq!(reloaded.get("codex").env.get("FOO").map(String::as_str), Some("bar"));
    }

    #[test]
    fn corrupt_file_yields_empty_store() {
        let dir = tempdir("corrupt");
        // Drop a file that is definitely not valid JSON where
        // the store expects to find agents.json.
        let path = dir.join("intentloom").join("agents.json");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"this is not json").unwrap();
        let store = AgentConfigStore::load(&dir);
        assert!(store.configured_ids().is_empty());
    }
}
