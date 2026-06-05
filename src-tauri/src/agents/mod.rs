//! Local-CLI adapter registry.
//!
//! Each adapter is a tiny unit that knows how to talk to one specific
//! CLI binary (claude / gemini / codex / opencode / openclaw). They share
//! a common interface ([`AgentAdapter`]) so the rest of the codebase can
//! dispatch to any of them without special-casing.
//!
//! Phase 1 of `docs/plan/multi-agent-cockpit.md` calls for adapter
//! skeletons plus per-adapter hello-world tests. This module ships
//! those skeletons. The streaming behaviour (stream-json normalization,
//! event emission) is still funnelled through `commands::ai::stream_ai`
//! and will be migrated per-adapter in W2 once the protocol for each
//! CLI is verified on a real install.
//!
//! Honestly-flagged limitations live in each adapter file — every
//! non-Claude adapter carries a "protocol unverified" comment.

pub mod claude;
pub mod codex;
pub mod gemini;
pub mod openclaw;
pub mod opencode;

pub use claude::ClaudeAdapter;
pub use codex::CodexAdapter;
pub use gemini::GeminiAdapter;
pub use openclaw::OpenClawAdapter;
pub use opencode::OpenCodeAdapter;

use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

/// Common interface every local-CLI adapter must implement.
///
/// Today the trait focuses on identity (`id`, `binary`, `display_name`)
/// plus `check_available()` for the TopBar tab gating. Methods that
/// require per-CLI protocol knowledge (stream-json shape, approval
/// hooks, resume semantics) are deliberately left out and will be
/// added per-adapter as we verify them.
pub trait AgentAdapter: Send + Sync {
    /// Stable id, matches `useModelStore.currentApp` on the frontend.
    fn id(&self) -> &'static str;
    /// Human-readable label for the TopBar tab.
    fn display_name(&self) -> &'static str;
    /// Binary name to spawn (resolved through `$PATH`).
    fn binary(&self) -> &'static str;
    /// One-line description shown in tooltips / ToolsModal.
    fn description(&self) -> &'static str;
    /// Whether this CLI supports streaming responses. All known CLIs
    /// do, so the default is `true`.
    fn supports_streaming(&self) -> bool {
        true
    }
    /// Best-effort availability check via `which`.
    fn check_available(&self) -> bool {
        which(self.binary()).is_some()
    }
    /// Probed CLI version, when the adapter knows how to ask. Default
    /// is `None` (unprobed).
    fn version(&self) -> Option<String> {
        None
    }
    /// Build the [`Command`] used to spawn the CLI for streaming.
    /// Adapters that have been verified against their real `--help` output
    /// override this; the default is the Claude Code shape
    /// (`--print-format-json --prompt <msg>`) and is used as the placeholder
    /// for unverified adapters (currently `opencode`).
    fn build_stream_command(&self, prompt: &str) -> Command {
        let mut cmd = Command::new(self.binary());
        cmd.arg("--print-format-json")
            .arg("--prompt")
            .arg(prompt)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cmd
    }
}

/// Tiny `which` implementation, copied from `commands::agents::which` so
/// the adapter registry can probe availability without taking a
/// dependency on the Tauri command surface.
pub fn which(bin: &str) -> Option<String> {
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(bin);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

/// Static registry of all known adapters, in display order. Iterate this
/// to build the TopBar tab list and the `list_agents` Tauri command
/// payload.
pub fn all_adapters() -> Vec<Box<dyn AgentAdapter>> {
    vec![
        Box::new(ClaudeAdapter),
        Box::new(GeminiAdapter),
        Box::new(CodexAdapter),
        Box::new(OpenCodeAdapter),
        Box::new(OpenClawAdapter),
    ]
}

/// Lookup an adapter by its frontend id (matches
/// `useModelStore.currentApp`).
pub fn find_adapter(id: &str) -> Option<Box<dyn AgentAdapter>> {
    all_adapters().into_iter().find(|a| a.id() == id)
}

/// Resolve a binary name for a frontend id, returning `None` for
/// unknown ids. The wrapper used by `commands::ai::stream_ai` to keep
/// its `binary_for` helper honest.
pub fn binary_for(id: &str) -> Option<&'static str> {
    find_adapter(id).map(|a| a.binary())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_contains_five_adapters() {
        assert_eq!(all_adapters().len(), 5);
    }

    #[test]
    fn all_adapters_have_unique_ids() {
        let mut ids: Vec<&str> = all_adapters().iter().map(|a| a.id()).collect();
        ids.sort();
        let original = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), original, "duplicate adapter ids in registry");
    }

    #[test]
    fn all_known_ids_resolve() {
        for id in ["claude", "gemini", "codex", "opencode", "openclaw"] {
            assert!(
                find_adapter(id).is_some(),
                "adapter '{id}' missing from registry"
            );
        }
    }

    #[test]
    fn unknown_id_returns_none() {
        assert!(find_adapter("nope").is_none());
        assert!(find_adapter("").is_none());
    }

    #[test]
    fn binary_for_keeps_existing_aliases() {
        assert_eq!(binary_for("claude"), Some("claude"));
        // Future: when "claude-code" gets a separate alias adapter, this
        // assertion will need to track that. Today we still accept the
        // legacy id and resolve it to the same binary.
    }

    #[test]
    fn which_returns_none_for_missing_binary() {
        assert!(which("definitely-not-a-real-binary-xyz").is_none());
    }
}
