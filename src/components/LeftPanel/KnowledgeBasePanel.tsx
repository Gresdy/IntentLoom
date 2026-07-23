import { useEffect, useState, useMemo } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Plus,
  Trash2,
  Database,
  FileText,
  Search,
  Send,
  RefreshCw,
  AlertCircle,
  Loader2,
  BookOpen,
  Settings as SettingsIcon,
  X,
  Pencil,
  Check,
} from "lucide-react";
import { useKnowledgeBaseStore } from "../../stores/knowledgeBaseStore";
import type { KnowledgeBase, KbDocument } from "../../shared/types";
import { useToastStore } from "../../lib/useToast";

const fmtSize = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const statusLabel: Record<KbDocument["status"], string> = {
  pending: "等待中",
  ingesting: "处理中",
  ready: "就绪",
  failed: "失败",
};

export function KnowledgeBasePanel() {
  const {
    bases,
    activeKbId,
    documentsByKb,
    loadingBases,
    loadingDocs,
    ingestingDocId,
    searching,
    asking,
    lastCitations,
    askHistory,
    error,
    loadBases,
    setActiveKb,
    createBase,
    updateBase,
    deleteBase,
    loadDocuments,
    ingestDocument,
    deleteDocument,
    ask,
    clearAsk,
  } = useKnowledgeBaseStore();
  const addToast = useToastStore((s) => s.addToast);

  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [question, setQuestion] = useState("");
  const [tab, setTab] = useState<"ask" | "search">("ask");

  const activeKb = useMemo(
    () => bases.find((b) => b.id === activeKbId) ?? null,
    [bases, activeKbId],
  );
  const activeDocs = activeKbId ? (documentsByKb[activeKbId] ?? []) : [];

  useEffect(() => {
    void loadBases();
  }, [loadBases]);

  useEffect(() => {
    if (activeKbId && !documentsByKb[activeKbId]) {
      void loadDocuments(activeKbId);
    }
  }, [activeKbId, documentsByKb, loadDocuments]);

  const handleCreate = async (form: CreateKbForm) => {
    try {
      const kb = await createBase(form);
      setShowCreate(false);
      addToast({ type: "success", message: `已创建知识库：${kb.name}` });
    } catch (e) {
      addToast({ type: "error", message: `创建失败：${e}` });
    }
  };

  const handleDeleteKb = async (kb: KnowledgeBase) => {
    if (
      !window.confirm(`确定删除知识库「${kb.name}」？所有文档与向量将被清除。`)
    ) {
      return;
    }
    try {
      await deleteBase(kb.id);
      addToast({ type: "success", message: `已删除 ${kb.name}` });
    } catch (e) {
      addToast({ type: "error", message: `删除失败：${e}` });
    }
  };

  const handleImportDoc = async () => {
    if (!activeKb) return;
    const selected = await openDialog({
      multiple: true,
      filters: [
        {
          name: "知识库文档",
          extensions: ["md", "markdown", "txt", "pdf", "html", "htm", "docx"],
        },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) {
      try {
        const result = await ingestDocument(activeKb.id, p);
        addToast({
          type: "success",
          message: `已入库 ${result.document.name}（${result.chunkCount} 个切片）`,
        });
      } catch (e) {
        addToast({ type: "error", message: `入库失败：${e}` });
      }
    }
  };

  const handleDeleteDoc = async (doc: KbDocument) => {
    if (!window.confirm(`确定删除「${doc.name}」？相关向量会被一起清理。`))
      return;
    try {
      await deleteDocument(doc.id);
      addToast({ type: "success", message: `已删除 ${doc.name}` });
    } catch (e) {
      addToast({ type: "error", message: `删除失败：${e}` });
    }
  };

  const handleAsk = async () => {
    if (!activeKb) return;
    const q = question.trim();
    if (!q) return;
    try {
      await ask(activeKb.id, q);
    } catch (e) {
      addToast({ type: "error", message: `检索失败：${e}` });
    }
  };

  const handleCopyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: "success", message: "已复制 RAG prompt，可粘贴到聊天" });
    } catch {
      addToast({ type: "error", message: "复制失败" });
    }
  };

  return (
    <div className="kb-root">
      {/* ── 左：KB 列表 ───────────────────────────────────── */}
      <aside className="kb-col kb-col--left">
        <header className="kb-col__head">
          <div className="kb-col__title">
            <Database size={14} />
            <span>知识库</span>
          </div>
          <button
            className="chip chip--on chip--icon"
            onClick={() => setShowCreate(true)}
            title="新建知识库"
          >
            <Plus size={12} />
          </button>
        </header>
        <div className="kb-list">
          {loadingBases && bases.length === 0 && (
            <div className="kb-empty">
              <Loader2 size={14} className="spin" /> 加载中…
            </div>
          )}
          {!loadingBases && bases.length === 0 && (
            <div className="kb-empty">还没有知识库，点击右上角 + 创建。</div>
          )}
          {bases.map((kb) => (
            <button
              key={kb.id}
              className={`kb-list__item${activeKbId === kb.id ? " active" : ""}`}
              onClick={() => setActiveKb(kb.id)}
            >
              <div className="kb-list__name">{kb.name}</div>
              <div className="kb-list__meta">
                {kb.documentCount} 文档 · {kb.chunkCount} 切片
              </div>
              {kb.description && (
                <div className="kb-list__desc">{kb.description}</div>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* ── 中：文档列表 ───────────────────────────────────── */}
      <section className="kb-col kb-col--mid">
        {activeKb ? (
          <>
            <header className="kb-col__head">
              <div className="kb-col__title">
                <FileText size={14} />
                <span>文档</span>
                <span className="kb-col__sub">{activeKb.name}</span>
              </div>
              <div className="kb-col__actions">
                <button
                  className="chip chip--icon"
                  onClick={() => setShowSettings(true)}
                  title="知识库设置"
                >
                  <SettingsIcon size={12} />
                </button>
                <button
                  className="chip chip--icon"
                  onClick={() => activeKbId && loadDocuments(activeKbId)}
                  title="刷新"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  className="chip chip--on chip--icon"
                  onClick={handleImportDoc}
                  title="导入文档"
                  disabled={!!ingestingDocId}
                >
                  <Plus size={12} />
                </button>
                <button
                  className="chip chip--icon"
                  onClick={() => handleDeleteKb(activeKb)}
                  title="删除知识库"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </header>
            <div className="kb-docs">
              {loadingDocs && activeDocs.length === 0 && (
                <div className="kb-empty">
                  <Loader2 size={14} className="spin" /> 加载文档…
                </div>
              )}
              {!loadingDocs && activeDocs.length === 0 && (
                <div className="kb-empty">
                  暂无文档，点击右上 + 导入 md / txt / pdf / docx / html。
                </div>
              )}
              {activeDocs.map((doc) => {
                const ingKey = `${activeKb.id}::${doc.sourcePath}`;
                const isIngesting = ingestingDocId === ingKey;
                return (
                  <div key={doc.id} className="kb-doc">
                    <div className="kb-doc__main">
                      <FileText size={14} className="ilo-fg-dim" />
                      <div className="kb-doc__body">
                        <div className="kb-doc__name" title={doc.sourcePath}>
                          {doc.name}
                        </div>
                        <div className="kb-doc__meta">
                          {fmtSize(doc.sizeBytes)} · {doc.charCount} 字 ·{" "}
                          {doc.chunkCount} 切片
                        </div>
                        {doc.error && (
                          <div className="kb-doc__err">
                            <AlertCircle size={11} /> {doc.error}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="kb-doc__aside">
                      <span
                        className={`kb-doc__status kb-doc__status--${doc.status}`}
                      >
                        {isIngesting ? (
                          <>
                            <Loader2 size={10} className="spin" /> 处理中
                          </>
                        ) : (
                          statusLabel[doc.status]
                        )}
                      </span>
                      <button
                        className="chip chip--icon"
                        onClick={() => handleDeleteDoc(doc)}
                        title="删除文档"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="kb-empty kb-empty--center">
            请在左侧选择一个知识库
          </div>
        )}
      </section>

      {/* ── 右：问答 / 检索 ───────────────────────────────────── */}
      <section className="kb-col kb-col--right">
        {activeKb ? (
          <>
            <header className="kb-col__head">
              <div className="kb-col__title">
                <BookOpen size={14} />
                <span>{tab === "ask" ? "知识库问答" : "检索"}</span>
              </div>
              <div className="kb-col__actions">
                <button
                  className={`chip${tab === "ask" ? " chip--on" : ""}`}
                  onClick={() => setTab("ask")}
                >
                  问答
                </button>
                <button
                  className={`chip${tab === "search" ? " chip--on" : ""}`}
                  onClick={() => setTab("search")}
                >
                  检索
                </button>
              </div>
            </header>
            <div className="kb-ask">
              <textarea
                className="kb-ask__input"
                placeholder={
                  tab === "ask"
                    ? "向知识库提问，系统会检索相关文档并构造 RAG prompt…"
                    : "输入关键字，检索最相似的 chunk…"
                }
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
              />
              <div className="kb-ask__bar">
                <span className="kb-ask__hint">
                  将使用 {activeKb.embedModel}（{activeKb.provider}）
                </span>
                <div className="kb-ask__actions">
                  {lastCitations.length > 0 && (
                    <button className="chip" onClick={clearAsk}>
                      清空
                    </button>
                  )}
                  <button
                    className="chip chip--on"
                    onClick={handleAsk}
                    disabled={asking || searching || !question.trim()}
                  >
                    {asking || searching ? (
                      <Loader2 size={12} className="spin" />
                    ) : tab === "ask" ? (
                      <Send size={12} />
                    ) : (
                      <Search size={12} />
                    )}
                    <span>{tab === "ask" ? "生成 prompt" : "检索"}</span>
                  </button>
                </div>
              </div>

              {lastCitations.length > 0 && (
                <div className="kb-citations">
                  <div className="kb-citations__head">
                    <span>引用 {lastCitations.length} 条</span>
                  </div>
                  {lastCitations.map((c, i) => (
                    <div key={c.chunkId} className="kb-cite">
                      <div className="kb-cite__head">
                        <span className="kb-cite__idx">[{i + 1}]</span>
                        <span className="kb-cite__doc">{c.docName}</span>
                        <span className="kb-cite__ord">chunk #{c.ord}</span>
                        <span className="kb-cite__score">
                          相似度 {(c.score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="kb-cite__preview">{c.preview}…</div>
                    </div>
                  ))}
                </div>
              )}

              {lastCitations.length === 0 &&
                askHistory.length > 0 &&
                tab === "ask" && (
                <div className="kb-history">
                  <div className="kb-citations__head">最近问答</div>
                  {askHistory.slice(0, 5).map((h) => (
                    <div key={h.id} className="kb-history__row">
                      <div className="kb-history__q">{h.question}</div>
                      <button
                        className="chip"
                        onClick={() => handleCopyPrompt(h.prompt)}
                      >
                        复制 RAG prompt
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="kb-error">
                  <AlertCircle size={12} /> {error}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="kb-empty kb-empty--center">请先选择知识库</div>
        )}
      </section>

      {showCreate && (
        <CreateKbModal
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}
      {showSettings && activeKb && (
        <KbSettingsModal
          kb={activeKb}
          onClose={() => setShowSettings(false)}
          onSubmit={async (patch) => {
            try {
              await updateBase(activeKb.id, patch);
              addToast({ type: "success", message: "已保存" });
              setShowSettings(false);
            } catch (e) {
              addToast({ type: "error", message: `保存失败：${e}` });
            }
          }}
        />
      )}
    </div>
  );
}

interface CreateKbForm {
  name: string;
  description?: string;
  apiBase?: string;
  apiKey?: string;
  embedModel?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  topK?: number;
}

function CreateKbModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (f: CreateKbForm) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [apiBase, setApiBase] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [embedModel, setEmbedModel] = useState("text-embedding-3-small");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [topK, setTopK] = useState(5);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer drawer--narrow"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div className="drawer__title">
            <Database size={14} /> 新建知识库
          </div>
          <button className="chip chip--icon" onClick={onClose}>
            <X size={14} />
          </button>
        </header>
        <div className="drawer__body drawer__body--single">
          <div className="kb-form">
            <Field label="名称 *">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：产品手册"
              />
            </Field>
            <Field label="描述">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="可选，写清知识库用途"
              />
            </Field>
            <Field label="嵌入 API Base">
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
            </Field>
            <Field label="API Key">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </Field>
            <Field label="嵌入模型">
              <input
                value={embedModel}
                onChange={(e) => setEmbedModel(e.target.value)}
              />
            </Field>
            <div className="kb-form__row">
              <Field label="切片大小">
                <input
                  type="number"
                  value={chunkSize}
                  min={50}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                />
              </Field>
              <Field label="重叠">
                <input
                  type="number"
                  value={chunkOverlap}
                  min={0}
                  onChange={(e) => setChunkOverlap(Number(e.target.value))}
                />
              </Field>
              <Field label="Top-K">
                <input
                  type="number"
                  value={topK}
                  min={1}
                  onChange={(e) => setTopK(Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </div>
        <footer className="drawer__actions">
          <button className="chip" onClick={onClose}>
            取消
          </button>
          <button
            className="chip chip--on"
            disabled={!name.trim()}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                apiBase: apiBase.trim() || undefined,
                apiKey: apiKey.trim() || undefined,
                embedModel: embedModel.trim() || undefined,
                chunkSize,
                chunkOverlap,
                topK,
              })
            }
          >
            <Check size={12} /> 创建
          </button>
        </footer>
      </aside>
    </div>
  );
}

function KbSettingsModal({
  kb,
  onClose,
  onSubmit,
}: {
  kb: KnowledgeBase;
  onClose: () => void;
  onSubmit: (patch: Partial<CreateKbForm>) => void;
}) {
  const [apiBase, setApiBase] = useState(kb.apiBase);
  const [apiKey, setApiKey] = useState("");
  const [embedModel, setEmbedModel] = useState(kb.embedModel);
  const [chunkSize, setChunkSize] = useState(kb.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState(kb.chunkOverlap);
  const [topK, setTopK] = useState(kb.topK);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer drawer--narrow"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer__head">
          <div className="drawer__title">
            <Pencil size={14} /> {kb.name} · 设置
          </div>
          <button className="chip chip--icon" onClick={onClose}>
            <X size={14} />
          </button>
        </header>
        <div className="drawer__body drawer__body--single">
          <div className="kb-form">
            <Field label="嵌入 API Base">
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
            </Field>
            <Field label="API Key">
              <input
                type="password"
                value={apiKey}
                placeholder={kb.hasApiKey ? "已配置；留空则保持不变" : "未配置"}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </Field>
            <Field label="嵌入模型">
              <input
                value={embedModel}
                onChange={(e) => setEmbedModel(e.target.value)}
              />
            </Field>
            <div className="kb-form__row">
              <Field label="切片大小">
                <input
                  type="number"
                  value={chunkSize}
                  min={50}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                />
              </Field>
              <Field label="重叠">
                <input
                  type="number"
                  value={chunkOverlap}
                  min={0}
                  onChange={(e) => setChunkOverlap(Number(e.target.value))}
                />
              </Field>
              <Field label="Top-K">
                <input
                  type="number"
                  value={topK}
                  min={1}
                  onChange={(e) => setTopK(Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </div>
        <footer className="drawer__actions">
          <button className="chip" onClick={onClose}>
            取消
          </button>
          <button
            className="chip chip--on"
            onClick={() =>
              onSubmit({
                apiBase: apiBase.trim() || undefined,
                apiKey: apiKey.trim() || undefined,
                embedModel: embedModel.trim() || undefined,
                chunkSize,
                chunkOverlap,
                topK,
              })
            }
          >
            <Check size={12} /> 保存
          </button>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="kb-form__field">
      <span className="kb-form__label">{label}</span>
      {children}
    </label>
  );
}

export default KnowledgeBasePanel;
