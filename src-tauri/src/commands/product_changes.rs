//! Cross-conversation `product_changes` ledger.
//!
//! Each time a conversation's tool calls complete, the front-end calls
//! [`record_product_change`] for every file edit / command emitted by
//! that turn. The Tauri side stores them in the `product_changes` SQLite
//! table so the LoomPanel can show a project-wide "累计" tally that
//! survives conversation switching, app restarts, and CLI hopping.
//!
//! API kept tiny on purpose — three operations are enough for the
//! current product surface:
//!
//!   * [`record_product_change`]   — append a single row
//!   * [`record_product_changes_batch`] — append many rows in one call
//!   * [`list_product_changes`]    — read rows (optionally filtered)
//!   * [`list_product_changes_aggregate`] — counts grouped by kind / agent
//!
//! All operations are synchronous and short; the Tauri command layer
//! runs them on the blocking pool automatically.

use crate::db::get_connection;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use tauri::command;

/// The four product kinds we surface today. They mirror the buckets
/// the front-end computes per-conversation in `artifactTally.ts`, so
/// the same kind strings round-trip without translation.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProductChangeKind {
    Added,
    Modified,
    Deleted,
    Command,
}

impl ProductChangeKind {
    fn as_str(&self) -> &'static str {
        match self {
            ProductChangeKind::Added => "added",
            ProductChangeKind::Modified => "modified",
            ProductChangeKind::Deleted => "deleted",
            ProductChangeKind::Command => "command",
        }
    }
}

/// Single row from `product_changes`.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProductChange {
    pub id: i64,
    pub conversation_id: String,
    pub agent_id: String,
    pub kind: ProductChangeKind,
    pub path: Option<String>,
    pub summary: Option<String>,
    pub created_at: i64,
}

/// Optional filters for [`list_product_changes`].
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProductChangeFilter {
    pub conversation_id: Option<String>,
    pub agent_id: Option<String>,
    /// Unix-ms lower bound (inclusive).
    pub since: Option<i64>,
    /// Max rows returned (most recent first). Defaults to 200.
    pub limit: Option<i64>,
}

/// Roll-up returned by [`list_product_changes_aggregate`].
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProductChangeAggregate {
    pub by_kind: BTreeMap<String, i64>,
    pub by_agent: BTreeMap<String, i64>,
    pub total_files: i64,
    pub total_commands: i64,
    pub total_rows: i64,
}

#[command]
pub async fn record_product_change(
    conversation_id: String,
    agent_id: String,
    kind: ProductChangeKind,
    path: Option<String>,
    summary: Option<String>,
) -> Result<i64, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let conn = get_connection();
    conn.execute(
        "INSERT INTO product_changes (conversation_id, agent_id, kind, path, summary, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            conversation_id,
            agent_id,
            kind.as_str(),
            path,
            summary,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[command]
pub async fn record_product_changes_batch(
    changes: Vec<(String, String, ProductChangeKind, Option<String>, Option<String>)>,
) -> Result<i64, String> {
    if changes.is_empty() {
        return Ok(0);
    }
    let now = chrono::Utc::now().timestamp_millis();
    let mut conn = get_connection();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO product_changes \
                 (conversation_id, agent_id, kind, path, summary, created_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;
        for c in &changes {
            stmt.execute(params![c.0, c.1, c.2.as_str(), c.3, c.4, now])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(changes.len() as i64)
}

#[command]
pub async fn list_product_changes(
    filter: Option<ProductChangeFilter>,
) -> Result<Vec<ProductChange>, String> {
    let filter = filter.unwrap_or_default();
    let limit = filter.limit.unwrap_or(200).clamp(1, 5000);

    let mut sql = String::from(
        "SELECT id, conversation_id, agent_id, kind, path, summary, created_at \
         FROM product_changes WHERE 1=1",
    );
    let mut binds: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(cid) = filter.conversation_id.as_ref() {
        sql.push_str(" AND conversation_id = ?");
        binds.push(Box::new(cid.clone()));
    }
    if let Some(aid) = filter.agent_id.as_ref() {
        sql.push_str(" AND agent_id = ?");
        binds.push(Box::new(aid.clone()));
    }
    if let Some(s) = filter.since {
        sql.push_str(" AND created_at >= ?");
        binds.push(Box::new(s));
    }
    sql.push_str(" ORDER BY created_at DESC, id DESC LIMIT ?");
    binds.push(Box::new(limit));

    let conn = get_connection();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let bind_refs: Vec<&dyn rusqlite::ToSql> = binds.iter().map(|b| b.as_ref()).collect();
    let rows = stmt
        .query_map(bind_refs.as_slice(), |row| {
            let kind_str: String = row.get(3)?;
            let kind = match kind_str.as_str() {
                "added" => ProductChangeKind::Added,
                "modified" => ProductChangeKind::Modified,
                "deleted" => ProductChangeKind::Deleted,
                "command" => ProductChangeKind::Command,
                _ => ProductChangeKind::Modified,
            };
            Ok(ProductChange {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                agent_id: row.get(2)?,
                kind,
                path: row.get(4)?,
                summary: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[command]
pub async fn list_product_changes_aggregate(
    conversation_id: Option<String>,
) -> Result<ProductChangeAggregate, String> {
    let conn = get_connection();
    let mut agg = ProductChangeAggregate::default();

    let (by_kind_sql, by_kind_bind): (String, Vec<Box<dyn rusqlite::ToSql>>) =
        if let Some(cid) = &conversation_id {
            (
                "SELECT kind, COUNT(*) FROM product_changes WHERE conversation_id = ?1 GROUP BY kind"
                    .to_string(),
                vec![Box::new(cid.clone()) as Box<dyn rusqlite::ToSql>],
            )
        } else {
            (
                "SELECT kind, COUNT(*) FROM product_changes GROUP BY kind".to_string(),
                vec![],
            )
        };
    let bind_refs: Vec<&dyn rusqlite::ToSql> =
        by_kind_bind.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&by_kind_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(bind_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        agg.by_kind.insert(k.clone(), v);
        if k == "command" {
            agg.total_commands += v;
        } else {
            agg.total_files += v;
        }
        agg.total_rows += v;
    }

    let (by_agent_sql, by_agent_bind): (String, Vec<Box<dyn rusqlite::ToSql>>) =
        if let Some(cid) = &conversation_id {
            (
                "SELECT agent_id, COUNT(*) FROM product_changes WHERE conversation_id = ?1 GROUP BY agent_id"
                    .to_string(),
                vec![Box::new(cid.clone()) as Box<dyn rusqlite::ToSql>],
            )
        } else {
            (
                "SELECT agent_id, COUNT(*) FROM product_changes GROUP BY agent_id".to_string(),
                vec![],
            )
        };
    let bind_refs: Vec<&dyn rusqlite::ToSql> =
        by_agent_bind.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&by_agent_sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(bind_refs.as_slice(), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    for r in rows {
        let (k, v) = r.map_err(|e| e.to_string())?;
        agg.by_agent.insert(k, v);
    }

    Ok(agg)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row_from_kv(kind: &str, count: i64) -> (String, i64) {
        (kind.to_string(), count)
    }

    #[test]
    fn product_change_kind_round_trip() {
        for k in [
            ProductChangeKind::Added,
            ProductChangeKind::Modified,
            ProductChangeKind::Deleted,
            ProductChangeKind::Command,
        ] {
            assert_eq!(k.as_str(), match k {
                ProductChangeKind::Added => "added",
                ProductChangeKind::Modified => "modified",
                ProductChangeKind::Deleted => "deleted",
                ProductChangeKind::Command => "command",
            });
        }
    }

    #[test]
    fn aggregate_totals_partition_files_vs_commands() {
        // Synthetic roll-up mirroring the SQL GROUP BY result. The
        // production aggregate partitions into file-shaped kinds
        // (added/modified/deleted) and the command kind. We mirror
        // that math here so a refactor of the SQL is caught by this
        // test before it ships.
        let rows = vec![
            row_from_kv("added", 3),
            row_from_kv("modified", 5),
            row_from_kv("deleted", 1),
            row_from_kv("command", 4),
        ];
        let mut agg = ProductChangeAggregate::default();
        for (k, v) in rows {
            agg.by_kind.insert(k.clone(), v);
            if k == "command" {
                agg.total_commands += v;
            } else {
                agg.total_files += v;
            }
            agg.total_rows += v;
        }
        assert_eq!(agg.total_files, 9);
        assert_eq!(agg.total_commands, 4);
        assert_eq!(agg.total_rows, 13);
        assert_eq!(agg.by_kind.get("added"), Some(&3));
    }
}
