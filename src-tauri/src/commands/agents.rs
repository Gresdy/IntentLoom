use crate::agents;
use crate::agents::config::AgentConfigStore;
use crate::agents::AuthState;
use crate::agents::SetupState;
use crate::agents::HealthCheck;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{command, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub available: bool,
    /// Resolved absolute path to the binary. Prefers the user's
    /// `cli_path` override from [`AgentConfigStore`] over the
    /// plain `$PATH` scan. `None` if neither resolves.
    pub path: Option<String>,
    pub version: Option<String>,
    pub supports_streaming: bool,
    pub description: String,
    /// Per-adapter auth state. The hint is surfaced next to the
    /// chip in the Agents panel and tells the user what command
    /// to run when credentials are missing.
    pub auth: AuthState,
    /// Coarse-grained "can the user use this right now?" signal
    /// the panel uses to pick an install vs login CTA. Distinct
    /// from `auth` (which is "do we *see* a credential?") — this
    /// is the "is the agent *usable*?" answer.
    pub setup: SetupState,
    /// User-overridden env vars to pass when the CLI is spawned.
    /// Empty when the user hasn't touched this adapter.
    pub env: std::collections::BTreeMap<String, String>,
}

/// Index used by the (now-deprecated) `switch_agent` IPC. Kept around
/// so old frontend calls don't blow up at deserialization; the
/// frontend switched to routing via the `cli` parameter on
/// `send_chat_message` long ago, so this counter stays at zero.
static CURRENT_AGENT_IDX: AtomicUsize = AtomicUsize::new(0);

/// Resolve the binary path for one adapter, preferring the user's
/// `cli_path` override. The override must point at an executable
/// file or it is ignored and we fall back to the `$PATH` scan —
/// a stale override (the user uninstalled the CLI) would otherwise
/// fool the panel into showing "已安装" when nothing is there.
fn resolve_path(
    cli_override: Option<&str>,
    binary: &str,
) -> Option<String> {
    if let Some(p) = cli_override {
        if !p.is_empty() {
            let candidate = PathBuf::from(p);
            if candidate.is_file() {
                let is_exec = agents::is_executable(&candidate);
                if is_exec {
                    return Some(candidate.to_string_lossy().to_string());
                }
            }
        }
    }
    agents::which(binary)
}

#[command]
pub async fn list_agents(store: State<'_, AgentConfigStore>) -> Result<Vec<AgentInfo>, String> {
    // The adapter registry is the source of truth. We resolve the
    // binary path via the user's `cli_path` override (preferred)
    // or `agents::which` (fallback), and the version via each
    // adapter's `version()` trait method — the trait default spawns
    // `<bin> --version` with a hard timeout so a misbehaving CLI
    // cannot stall this call.
    let adapters = agents::all_adapters();
    let mut out = Vec::with_capacity(adapters.len());
    for a in adapters {
        let cfg = store.get(a.id());
        let path = resolve_path(cfg.cli_path.as_deref(), a.binary());
        out.push(AgentInfo {
            id: a.id().to_string(),
            name: a.binary().to_string(),
            display_name: a.display_name().to_string(),
            available: path.is_some(),
            path,
            version: a.version(),
            supports_streaming: a.supports_streaming(),
            description: a.description().to_string(),
            auth: a.auth_state(),
            setup: a.setup_status(),
            env: cfg.env,
        });
    }
    Ok(out)
}

#[command]
pub async fn get_agent_config(
    id: String,
    store: State<'_, AgentConfigStore>,
) -> Result<agents::AgentConfig, String> {
    Ok(store.get(&id))
}

#[command]
pub async fn set_agent_config(
    id: String,
    config: agents::AgentConfig,
    store: State<'_, AgentConfigStore>,
) -> Result<agents::AgentConfig, String> {
    Ok(store.set(id, config))
}

#[command]
pub async fn clear_agent_config(
    id: String,
    store: State<'_, AgentConfigStore>,
) -> Result<(), String> {
    store.clear(&id);
    Ok(())
}

#[command]
pub async fn switch_agent(agent_id: String) -> Result<String, String> {
    tracing::warn!(
        agent_id = %agent_id,
        "switch_agent is deprecated; route is decided by cli param on send_chat_message"
    );
    Ok(agent_id)
}

#[command]
pub async fn current_agent(
    store: State<'_, AgentConfigStore>,
) -> Result<String, String> {
    let agents = list_agents(store).await?;
    let idx = CURRENT_AGENT_IDX.load(Ordering::SeqCst);
    Ok(agents
        .get(idx)
        .map(|a| a.id.clone())
        .unwrap_or_else(|| "claude".to_string()))
}

/// Wire shape returned by [`check_agent_health`]. The default
/// `list_agents` call is the source of truth for the agent chip —
/// it does the resolution + version probe + auth probe in one
/// pass. This DTO is the on-demand counterpart: the front-end
/// fires it when the user clicks the "重新检测" button on a
/// specific agent (or auto-retries after a failed `send_chat_message`).
///
/// We keep the same `auth` / `setup` fields as [`AgentInfo`] so
/// the chip can be re-rendered from this single payload without
/// also calling `list_agents`. The new `health` field carries
/// the latency / version / error detail that the bulk
/// `list_agents` path doesn't compute (it only does
/// `check_available` + a one-shot `version()`).
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentHealthReport {
    pub id: String,
    pub name: String,
    pub display_name: String,
    /// Coarse-grained result of the handshake probe. Maps to
    /// the chip's "可用 / 不可用" affordance. The `error`
    /// inside is short and user-visible.
    pub health: HealthCheck,
    /// Per-adapter auth state — same shape as
    /// [`AgentInfo::auth`].
    pub auth: AuthState,
    /// Coarse-grained "can the user use this right now?"
    /// signal — same shape as [`AgentInfo::setup`]. The
    /// front-end shows this verbatim; re-deriving it here
    /// keeps the readiness check self-contained so a caller
    /// that only invokes `check_agent_health` (and not
    /// `list_agents`) still gets the right CTA.
    pub setup: SetupState,
}

/// On-demand health probe for one agent — references AionUi's
/// `acpConversation.checkAgentHealth` (a real handshake against
/// the running CLI). The default implementation in
/// [`crate::agents::AgentAdapter::health_check`] is intentionally
/// cheap: a `<bin> --version` round-trip with a hard
/// 5-second timeout. Adapters that want a deeper probe (e.g.
/// a real OAuth round-trip for CLI tools that lazy-login on
/// first prompt) override the trait method to issue it.
///
/// The probe is synchronous from the call site's perspective —
/// the underlying work runs on a worker thread with a bounded
/// channel, the same pattern as `list_agents`'s version probe,
/// so a misbehaving CLI cannot park the Tauri worker. Returns
/// `Err(_)` only when the adapter id is not in the registry;
/// every other failure path is encoded in the `health.error`
/// field of the success payload so the UI can render a
/// "已检测 — 不可用" card instead of an error toast.
#[command]
pub async fn check_agent_health(
    id: String,
    store: State<'_, AgentConfigStore>,
) -> Result<AgentHealthReport, String> {
    let adapter = agents::find_adapter(&id)
        .ok_or_else(|| format!("Unknown AI agent: {id}"))?;
    // Touch the config store so a user-supplied `cli_path`
    // override is reflected in the `auth` / `setup` shape the
    // caller gets back — same lookup order as `list_agents`,
    // i.e. the override beats the bare-name $PATH scan. The
    // actual override path is consulted by the *spawn* path in
    // `commands::ai::build_command`; the trait's
    // `health_check()` uses the bare name so the result line
    // always agrees with what `which` would have returned for
    // a fresh install.
    let _cfg = store.get(&id);
    let health = adapter.health_check();
    Ok(AgentHealthReport {
        id: id.clone(),
        name: adapter.binary().to_string(),
        display_name: adapter.display_name().to_string(),
        health,
        auth: adapter.auth_state(),
        setup: adapter.setup_status(),
    })
}
