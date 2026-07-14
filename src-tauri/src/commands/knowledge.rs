// Knowledge Base / Local RAG (v1)
// 本地 RAG 最小闭环：KB CRUD + 文档解析/切片/嵌入 + 检索 + 问答 prompt 构造。

use crate::db::get_connection;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::command;
use uuid::Uuid;

// ── 类型 ────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub embed_model: String,
    pub chunk_size: i32,
    pub chunk_overlap: i32,
    pub top_k: i32,
    pub document_count: i32,
    pub chunk_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KbDocument {
    pub id: String,
    pub kb_id: String,
    pub name: String,
    pub source_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub char_count: i64,
    pub chunk_count: i32,
    pub status: String,
    pub error: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // 前端面板 v2 会用，先暴露字段
pub struct KbChunk {
    pub id: String,
    pub kb_id: String,
    pub doc_id: String,
    pub ord: i32,
    pub content: String,
    pub char_start: i32,
    pub char_end: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KbCitation {
    pub doc_id: String,
    pub doc_name: String,
    pub chunk_id: String,
    pub ord: i32,
    pub score: f32,
    pub preview: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KbAskResult {
    pub question: String,
    pub prompt: String,
    pub citations: Vec<KbCitation>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct IngestDocumentResult {
    pub document: KbDocument,
    pub chunk_count: i32,
}

// ── 行映射 ──────────────────────────────────────────────────────────────

fn row_to_kb(row: &rusqlite::Row) -> rusqlite::Result<KnowledgeBase> {
    Ok(KnowledgeBase {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        provider: row.get("provider")?,
        api_base: row.get("api_base")?,
        api_key: row.get("api_key")?,
        embed_model: row.get("embed_model")?,
        chunk_size: row.get("chunk_size")?,
        chunk_overlap: row.get("chunk_overlap")?,
        top_k: row.get("top_k")?,
        document_count: row.get::<_, i64>("document_count")? as i32,
        chunk_count: row.get::<_, i64>("chunk_count")? as i32,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_document(row: &rusqlite::Row) -> rusqlite::Result<KbDocument> {
    Ok(KbDocument {
        id: row.get("id")?,
        kb_id: row.get("kb_id")?,
        name: row.get("name")?,
        source_path: row.get("source_path")?,
        mime_type: row.get("mime_type")?,
        size_bytes: row.get("size_bytes")?,
        char_count: row.get("char_count")?,
        chunk_count: row.get::<_, i64>("chunk_count")? as i32,
        status: row.get("status")?,
        error: row.get("error")?,
        created_at: row.get("created_at")?,
    })
}

fn fetch_kb(id: &str) -> Result<KnowledgeBase, String> {
    let conn = get_connection();
    conn.query_row(
        "SELECT k.id, k.name, k.description, k.provider, k.api_base, k.api_key, k.embed_model, \
         k.chunk_size, k.chunk_overlap, k.top_k, \
         COALESCE((SELECT COUNT(*) FROM kb_documents d WHERE d.kb_id = k.id), 0) AS document_count, \
         COALESCE((SELECT COUNT(*) FROM kb_chunks c WHERE c.kb_id = k.id), 0) AS chunk_count, \
         k.created_at, k.updated_at \
         FROM knowledge_bases k WHERE k.id = ?1",
        params![id],
        row_to_kb,
    )
    .map_err(|e| e.to_string())
}

fn fetch_document(id: &str) -> Result<KbDocument, String> {
    let conn = get_connection();
    conn.query_row(
        "SELECT id, kb_id, name, source_path, mime_type, size_bytes, char_count, \
         chunk_count, status, error, created_at \
         FROM kb_documents WHERE id = ?1",
        params![id],
        row_to_document,
    )
    .map_err(|e| e.to_string())
}

// ── KB CRUD ─────────────────────────────────────────────────────────────

#[command]
pub async fn list_knowledge_bases() -> Result<Vec<KnowledgeBase>, String> {
    let conn = get_connection();
    let mut stmt = conn
        .prepare(
            "SELECT k.id, k.name, k.description, k.provider, k.api_base, k.api_key, k.embed_model, \
             k.chunk_size, k.chunk_overlap, k.top_k, \
             COALESCE((SELECT COUNT(*) FROM kb_documents d WHERE d.kb_id = k.id), 0) AS document_count, \
             COALESCE((SELECT COUNT(*) FROM kb_chunks c WHERE c.kb_id = k.id), 0) AS chunk_count, \
             k.created_at, k.updated_at \
             FROM knowledge_bases k ORDER BY k.updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_kb)
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[command]
pub async fn create_knowledge_base(
    name: String,
    description: Option<String>,
    provider: Option<String>,
    api_base: Option<String>,
    api_key: Option<String>,
    embed_model: Option<String>,
    chunk_size: Option<i32>,
    chunk_overlap: Option<i32>,
    top_k: Option<i32>,
) -> Result<KnowledgeBase, String> {
    let id = format!("kb-{}", Uuid::new_v4());
    let conn = get_connection();
    conn.execute(
        "INSERT INTO knowledge_bases (id, name, description, provider, api_base, api_key, \
         embed_model, chunk_size, chunk_overlap, top_k) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            id,
            name,
            description.unwrap_or_default(),
            provider.unwrap_or_else(|| "openai".to_string()),
            api_base.unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
            api_key.unwrap_or_default(),
            embed_model.unwrap_or_else(|| "text-embedding-3-small".to_string()),
            chunk_size.unwrap_or(500),
            chunk_overlap.unwrap_or(50),
            top_k.unwrap_or(5),
        ],
    )
    .map_err(|e| e.to_string())?;
    fetch_kb(&id)
}

#[command]
pub async fn update_knowledge_base(
    id: String,
    name: Option<String>,
    description: Option<String>,
    provider: Option<String>,
    api_base: Option<String>,
    api_key: Option<String>,
    embed_model: Option<String>,
    chunk_size: Option<i32>,
    chunk_overlap: Option<i32>,
    top_k: Option<i32>,
) -> Result<KnowledgeBase, String> {
    let conn = get_connection();
    let exists: Option<String> = conn
        .query_row(
            "SELECT id FROM knowledge_bases WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if exists.is_none() {
        return Err(format!("KnowledgeBase not found: {id}"));
    }
    let touch = || -> Result<(), String> {
        conn.execute(
            "UPDATE knowledge_bases SET updated_at = datetime('now') WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    };
    if let Some(v) = name {
        conn.execute("UPDATE knowledge_bases SET name = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = description {
        conn.execute("UPDATE knowledge_bases SET description = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = provider {
        conn.execute("UPDATE knowledge_bases SET provider = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = api_base {
        conn.execute("UPDATE knowledge_bases SET api_base = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = api_key {
        conn.execute("UPDATE knowledge_bases SET api_key = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = embed_model {
        conn.execute("UPDATE knowledge_bases SET embed_model = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = chunk_size {
        conn.execute("UPDATE knowledge_bases SET chunk_size = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = chunk_overlap {
        conn.execute("UPDATE knowledge_bases SET chunk_overlap = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = top_k {
        conn.execute("UPDATE knowledge_bases SET top_k = ?1 WHERE id = ?2", params![v, id])
            .map_err(|e| e.to_string())?;
    }
    touch()?;
    fetch_kb(&id)
}

#[command]
pub async fn delete_knowledge_base(id: String) -> Result<bool, String> {
    let conn = get_connection();
    let n = conn
        .execute("DELETE FROM knowledge_bases WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

// ── 文档解析 ────────────────────────────────────────────────────────────
// v1 支持：md / txt (native), pdf (pdf-extract), html (scraper), docx (zip + 简易 xml)

fn parse_document(path: &Path) -> Result<(String, String), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "pdf" => "application/pdf",
        "html" | "htm" => "text/html",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        _ => "text/plain",
    };
    let text = match ext.as_str() {
        "md" | "markdown" | "txt" => std::fs::read_to_string(path)
            .map_err(|e| format!("read failed: {e}"))?,
        "pdf" => {
            let bytes = std::fs::read(path).map_err(|e| format!("read pdf failed: {e}"))?;
            pdf_extract::extract_text_from_mem(&bytes)
                .map_err(|e| format!("pdf parse failed: {e}"))?
        }
        "html" | "htm" => {
            let raw = std::fs::read_to_string(path)
                .map_err(|e| format!("read html failed: {e}"))?;
            let doc = scraper::Html::parse_document(&raw);
            doc.root_element().text().collect::<Vec<_>>().join(" ")
        }
        "docx" => extract_docx_text(path)?,
        _ => std::fs::read_to_string(path).unwrap_or_default(),
    };
    Ok((mime.to_string(), text))
}

fn mime_of(path: &Path) -> String {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    match ext.as_str() {
        "md" | "markdown" => "text/markdown".into(),
        "txt" => "text/plain".into(),
        "pdf" => "application/pdf".into(),
        "html" | "htm" => "text/html".into(),
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document".into(),
        _ => "text/plain".into(),
    }
}

fn extract_docx_text(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("open docx: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("docx zip: {e}"))?;
    let mut doc_xml = String::new();
    {
        let mut entry = zip
            .by_name("word/document.xml")
            .map_err(|e| format!("docx missing document.xml: {e}"))?;
        use std::io::Read;
        entry
            .read_to_string(&mut doc_xml)
            .map_err(|e| format!("docx read: {e}"))?;
    }
    // 把 XML 标签剥掉，只留 <w:t> 文本节点的拼接，
    // <w:p> 段落分隔处补一个换行。
    let mut out = String::new();
    let mut in_text = false;
    let mut chars = doc_xml.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '<' {
            let mut tag = String::new();
            while let Some(&nc) = chars.peek() {
                if nc == '>' {
                    chars.next();
                    break;
                }
                tag.push(nc);
                chars.next();
            }
            if tag.starts_with("w:t") {
                in_text = true;
            } else if tag == "/w:t" {
                in_text = false;
            } else if tag.starts_with("/w:p") || tag.starts_with("w:p ") || tag == "w:p" {
                out.push('\n');
            }
        } else if in_text {
            out.push(c);
        }
    }
    Ok(out)
}

// ── 切片 ──────────────────────────────────────────────────────────────────
// 简单策略：先按段落（双换行）切；如果段落超 chunk_size，再按字符窗口切，
// 相邻窗口保留 chunk_overlap 字符。

struct Chunk {
    content: String,
    char_start: usize,
    char_end: usize,
}

fn split_text_into_chunks(text: &str, chunk_size: usize, overlap: usize) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let normalized = text.replace("\r\n", "\n");
    for paragraph in normalized.split("\n\n") {
        let p = paragraph.trim();
        if p.is_empty() {
            continue;
        }
        if p.chars().count() <= chunk_size {
            chunks.push(Chunk {
                content: p.to_string(),
                char_start: 0,
                char_end: p.chars().count(),
            });
            continue;
        }
        let chars: Vec<char> = p.chars().collect();
        let step = chunk_size.saturating_sub(overlap).max(1);
        let mut i = 0;
        while i < chars.len() {
            let end = (i + chunk_size).min(chars.len());
            let slice: String = chars[i..end].iter().collect();
            chunks.push(Chunk {
                content: slice,
                char_start: i,
                char_end: end,
            });
            if end == chars.len() {
                break;
            }
            i += step;
        }
    }
    chunks
}

// ── 嵌入 API（OpenAI 兼容） ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct EmbeddingRequest<'a> {
    input: Vec<&'a str>,
    model: &'a str,
}

#[derive(Deserialize, Debug)]
struct EmbeddingResponse {
    data: Vec<EmbeddingItem>,
}

#[derive(Deserialize, Debug)]
struct EmbeddingItem {
    embedding: Vec<f32>,
}

async fn embed_texts(
    api_base: &str,
    api_key: &str,
    model: &str,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }
    let url = format!("{}/embeddings", api_base.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("client build: {e}"))?;
    let input_refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    let body = EmbeddingRequest { input: input_refs, model };
    let mut req = client.post(&url).json(&body);
    if !api_key.is_empty() {
        req = req.bearer_auth(api_key);
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("embedding request failed: {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let txt = resp.text().await.unwrap_or_default();
        return Err(format!("embedding api {status}: {txt}"));
    }
    let parsed: EmbeddingResponse = resp
        .json()
        .await
        .map_err(|e| format!("embedding parse: {e}"))?;
    Ok(parsed.data.into_iter().map(|d| d.embedding).collect())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for i in 0..a.len() {
        dot += (a[i] as f64) * (b[i] as f64);
        na += (a[i] as f64).powi(2);
        nb += (b[i] as f64).powi(2);
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    (dot / (na.sqrt() * nb.sqrt())) as f32
}

// ── 文档 CRUD ────────────────────────────────────────────────────────────

#[command]
pub async fn list_kb_documents(kb_id: String) -> Result<Vec<KbDocument>, String> {
    let conn = get_connection();
    let mut stmt = conn
        .prepare(
            "SELECT id, kb_id, name, source_path, mime_type, size_bytes, char_count, \
             chunk_count, status, error, created_at \
             FROM kb_documents WHERE kb_id = ?1 ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![kb_id], row_to_document)
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[command]
pub async fn delete_kb_document(doc_id: String) -> Result<bool, String> {
    let conn = get_connection();
    let n = conn
        .execute("DELETE FROM kb_documents WHERE id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

fn mark_failed_doc(
    kb_id: &str,
    name: &str,
    source_path: &str,
    mime: &str,
    size_bytes: i64,
    err: &str,
) -> Result<(), String> {
    let conn = get_connection();
    conn.execute(
        "INSERT INTO kb_documents (id, kb_id, name, source_path, mime_type, size_bytes, status, error) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'failed', ?7)",
        params![
            format!("doc-{}", Uuid::new_v4()),
            kb_id, name, source_path, mime, size_bytes, err
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn mark_failed_doc_id(doc_id: &str, err: &str) -> Result<(), String> {
    let conn = get_connection();
    conn.execute(
        "UPDATE kb_documents SET status = 'failed', error = ?1 WHERE id = ?2",
        params![err, doc_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── 文档入库（解析 → 切片 → 嵌入 → 写库） ───────────────────────────────

#[command]
pub async fn ingest_kb_document(
    kb_id: String,
    source_path: String,
) -> Result<IngestDocumentResult, String> {
    let kb = fetch_kb(&kb_id)?;
    let path = Path::new(&source_path);
    if !path.is_file() {
        return Err(format!("not a file: {source_path}"));
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| source_path.clone());
    let size_bytes = std::fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0);

    let (mime, text) = match parse_document(path) {
        Ok(t) => t,
        Err(e) => {
            mark_failed_doc(&kb_id, &name, &source_path, &mime_of(path), size_bytes, &e)?;
            return Err(e);
        }
    };
    let char_count = text.chars().count() as i64;
    if char_count == 0 {
        let e = "文档解析后为空".to_string();
        mark_failed_doc(&kb_id, &name, &source_path, &mime, size_bytes, &e)?;
        return Err(e);
    }

    let chunk_size = kb.chunk_size.max(50) as usize;
    let overlap = kb.chunk_overlap.max(0) as usize;
    let chunks = split_text_into_chunks(&text, chunk_size, overlap);
    if chunks.is_empty() {
        let e = "切片为空".to_string();
        mark_failed_doc(&kb_id, &name, &source_path, &mime, size_bytes, &e)?;
        return Err(e);
    }

    let doc_id = format!("doc-{}", Uuid::new_v4());
    {
        let conn = get_connection();
        conn.execute(
            "INSERT INTO kb_documents (id, kb_id, name, source_path, mime_type, size_bytes, char_count, status) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'ingesting')",
            params![doc_id, kb_id, name, source_path, mime, size_bytes, char_count],
        )
        .map_err(|e| e.to_string())?;
    }

    let batch_size = 32usize;
    let mut total_written = 0i32;
    for batch in chunks.chunks(batch_size) {
        let texts: Vec<String> = batch.iter().map(|c| c.content.clone()).collect();
        let vectors = match embed_texts(&kb.api_base, &kb.api_key, &kb.embed_model, &texts).await {
            Ok(v) => v,
            Err(e) => {
                let msg = format!("embedding failed: {e}");
                let _ = mark_failed_doc_id(&doc_id, &msg);
                return Err(msg);
            }
        };
        if vectors.len() != batch.len() {
            let msg = format!(
                "embedding 返回数量与切片数不一致 ({} != {})",
                vectors.len(),
                batch.len()
            );
            let _ = mark_failed_doc_id(&doc_id, &msg);
            return Err(msg);
        }
        let conn = get_connection();
        for (c, vec) in batch.iter().zip(vectors.iter()) {
            let id = format!("chk-{}", Uuid::new_v4());
            let vec_json = serde_json::to_string(vec).map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO kb_chunks (id, kb_id, doc_id, ord, content, embedding, char_start, char_end) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![id, kb_id, doc_id, total_written, c.content, vec_json, c.char_start as i32, c.char_end as i32],
            )
            .map_err(|e| e.to_string())?;
            total_written += 1;
        }
    }

    let doc = {
        let conn = get_connection();
        conn.execute(
            "UPDATE kb_documents SET status = 'ready', chunk_count = ?1 WHERE id = ?2",
            params![total_written, doc_id],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE knowledge_bases SET updated_at = datetime('now') WHERE id = ?1",
            params![kb_id],
        )
        .map_err(|e| e.to_string())?;
        fetch_document(&doc_id)?
    };
    Ok(IngestDocumentResult {
        document: doc,
        chunk_count: total_written,
    })
}

// ── 检索 ──────────────────────────────────────────────────────────────────
// 把 KB 下所有 chunks 加载到内存 + 向量化 query → cosine 排序 → top_k。
// v1 没有引入 sqlite-vec / hnsw；规模大了换 sqlite-vec 即可，函数签名不变。

#[command]
pub async fn kb_search(
    kb_id: String,
    query: String,
    top_k: Option<i32>,
) -> Result<Vec<KbCitation>, String> {
    let kb = fetch_kb(&kb_id)?;
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let k = top_k.unwrap_or(kb.top_k).max(1) as usize;
    let query_vec = embed_texts(&kb.api_base, &kb.api_key, &kb.embed_model, &[trimmed.to_string()])
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| "embedding returned empty".to_string())?;

    let conn = get_connection();
    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.doc_id, c.content, c.ord, c.embedding, d.name \
             FROM kb_chunks c JOIN kb_documents d ON d.id = c.doc_id \
             WHERE c.kb_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String, i32, String, String)> = stmt
        .query_map(params![kb_id], |r| {
            Ok((
                r.get(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get::<_, i64>(3)? as i32,
                r.get(4)?,
                r.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut scored: Vec<(f32, KbCitation)> = Vec::with_capacity(rows.len());
    for (chunk_id, doc_id, content, ord, embedding, doc_name) in rows {
        let vec: Vec<f32> = match serde_json::from_str(&embedding) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let score = cosine_similarity(&query_vec, &vec);
        let preview: String = content.chars().take(160).collect();
        scored.push((
            score,
            KbCitation {
                doc_id,
                doc_name,
                chunk_id,
                ord,
                score,
                preview,
            },
        ));
    }
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    Ok(scored.into_iter().take(k).map(|(_, c)| c).collect())
}

// ── 问答 ──────────────────────────────────────────────────────────────────
// kb_ask：检索 top-K + 构造 RAG prompt + 返回。
// 真正的 LLM 调用由前端已有的 chat composer 完成（避免后端再绑一套 LLM），
// 但后端先把 prompt + 引用准备好，前端一键「发到聊天」。

#[command]
pub async fn kb_ask(
    kb_id: String,
    question: String,
    top_k: Option<i32>,
) -> Result<KbAskResult, String> {
    let citations = kb_search(kb_id.clone(), question.clone(), top_k).await?;
    let mut context = String::new();
    for (i, c) in citations.iter().enumerate() {
        context.push_str(&format!(
            "[{}] {} (chunk #{})\n{}\n\n",
            i + 1,
            c.doc_name,
            c.ord,
            c.preview
        ));
    }
    let prompt = format!(
        "你是一个基于本地知识库的助手。请只根据下面提供的资料回答问题；资料不足时请直接说明「资料中没有提到」。\n\
         回答时在句末用 [n] 标注引用的资料编号。\n\n\
         ## 检索到的资料\n{context}\n\
         ## 问题\n{question}\n\n\
         ## 回答\n"
    );
    Ok(KbAskResult {
        question,
        prompt,
        citations,
    })
}

// ── 单元测试 ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunker_short_paragraph_yields_one_chunk() {
        let chunks = split_text_into_chunks("hello world", 500, 50);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, "hello world");
        assert_eq!(chunks[0].char_start, 0);
        assert_eq!(chunks[0].char_end, 11);
    }

    #[test]
    fn chunker_splits_long_paragraph_with_overlap() {
        // 100 字符的段落，chunk_size=30, overlap=10 → step=20
        // 期望：30, 30, 30, 30, 20 = 5 个 chunk（最后一个是残余段）
        let text: String = "a".repeat(100);
        let chunks = split_text_into_chunks(&text, 30, 10);
        assert_eq!(chunks.len(), 5);
        assert_eq!(chunks[0].char_start, 0);
        assert_eq!(chunks[0].char_end, 30);
        assert_eq!(chunks[1].char_start, 20);
        assert_eq!(chunks[1].char_end, 50);
        assert_eq!(chunks[4].char_end, 100);
        assert_eq!(chunks[4].char_start, 80);
    }

    #[test]
    fn chunker_splits_by_paragraph_first() {
        let text = "第一段比较短。\n\n第二段也是。\n\n第三段也短。";
        let chunks = split_text_into_chunks(text, 500, 50);
        assert_eq!(chunks.len(), 3);
    }

    #[test]
    fn chunker_skips_empty_paragraphs() {
        let text = "\n\n\n\n   \n\n正文。\n\n\n\n";
        let chunks = split_text_into_chunks(text, 500, 50);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].content, "正文。");
    }

    #[test]
    fn cosine_identical_vectors_yields_one() {
        let v = vec![1.0, 2.0, 3.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_orthogonal_yields_zero() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }

    #[test]
    fn cosine_mismatched_lengths_yields_zero() {
        let a = vec![1.0, 2.0];
        let b = vec![1.0, 2.0, 3.0];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn cosine_empty_yields_zero() {
        let a: Vec<f32> = vec![];
        let b: Vec<f32> = vec![];
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn mime_of_handles_known_extensions() {
        assert_eq!(mime_of(Path::new("/x/a.md")), "text/markdown");
        assert_eq!(mime_of(Path::new("/x/a.txt")), "text/plain");
        assert_eq!(mime_of(Path::new("/x/a.pdf")), "application/pdf");
        assert_eq!(mime_of(Path::new("/x/a.docx")),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        assert_eq!(mime_of(Path::new("/x/a")), "text/plain");
    }
}
