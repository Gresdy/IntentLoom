import { create } from "zustand";
import { invoke } from "../lib/tauri";
import type {
  KnowledgeBase,
  KbDocument,
  KbCitation,
  KbAskResult,
  KbIngestResult,
} from "../shared/types";

/// 知识库模块的 Zustand store。
/// - `bases` 缓存所有 KB（顶栏面板展示用）
/// - `activeKbId` 当前选中的 KB（右侧详情面板绑定）
/// - `documentsByKb` 按 KB 缓存文档列表，避免重复拉取
/// - `askHistory` 仅做最近 N 条的内存缓存，UI 用，不入库（v2 再做持久化）

const MAX_ASK_HISTORY = 50;

interface AskHistoryEntry {
  id: string;
  kbId: string;
  question: string;
  prompt: string;
  citations: KbCitation[];
  createdAt: number;
}

interface KnowledgeBaseState {
  bases: KnowledgeBase[];
  activeKbId: string | null;
  documentsByKb: Record<string, KbDocument[]>;
  loadingBases: boolean;
  loadingDocs: boolean;
  ingestingDocId: string | null;
  searching: boolean;
  asking: boolean;
  lastCitations: KbCitation[];
  lastPrompt: string;
  askHistory: AskHistoryEntry[];
  error: string | null;

  loadBases: () => Promise<void>;
  setActiveKb: (id: string | null) => void;
  createBase: (input: {
    name: string;
    description?: string;
    provider?: string;
    apiBase?: string;
    apiKey?: string;
    embedModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    topK?: number;
  }) => Promise<KnowledgeBase>;
  updateBase: (
    id: string,
    patch: Partial<{
      name: string;
      description: string;
      provider: string;
      apiBase: string;
      apiKey: string;
      embedModel: string;
      chunkSize: number;
      chunkOverlap: number;
      topK: number;
    }>,
  ) => Promise<KnowledgeBase>;
  deleteBase: (id: string) => Promise<void>;

  loadDocuments: (kbId: string) => Promise<KbDocument[]>;
  ingestDocument: (kbId: string, sourcePath: string) => Promise<KbIngestResult>;
  deleteDocument: (docId: string) => Promise<void>;

  search: (kbId: string, query: string, topK?: number) => Promise<KbCitation[]>;
  ask: (kbId: string, question: string, topK?: number) => Promise<KbAskResult>;
  clearAsk: () => void;
}

function genId(): string {
  return `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useKnowledgeBaseStore = create<KnowledgeBaseState>((set, get) => ({
  bases: [],
  activeKbId: null,
  documentsByKb: {},
  loadingBases: false,
  loadingDocs: false,
  ingestingDocId: null,
  searching: false,
  asking: false,
  lastCitations: [],
  lastPrompt: "",
  askHistory: [],
  error: null,

  loadBases: async () => {
    set({ loadingBases: true, error: null });
    try {
      const bases = await invoke<KnowledgeBase[]>("list_knowledge_bases");
      set({ bases, loadingBases: false });
      // 自动选第一个 KB 作为 active
      if (!get().activeKbId && bases.length > 0) {
        set({ activeKbId: bases[0].id });
      }
    } catch (e) {
      set({ error: String(e), loadingBases: false });
    }
  },

  setActiveKb: (id) => set({ activeKbId: id }),

  createBase: async (input) => {
    const kb = await invoke<KnowledgeBase>("create_knowledge_base", input);
    set((s) => ({ bases: [kb, ...s.bases], activeKbId: kb.id }));
    return kb;
  },

  updateBase: async (id, patch) => {
    const kb = await invoke<KnowledgeBase>("update_knowledge_base", { id, ...patch });
    set((s) => ({ bases: s.bases.map((b) => (b.id === id ? kb : b)) }));
    return kb;
  },

  deleteBase: async (id) => {
    await invoke("delete_knowledge_base", { id });
    set((s) => {
      const nextDocs = { ...s.documentsByKb };
      delete nextDocs[id];
      const remaining = s.bases.filter((b) => b.id !== id);
      return {
        bases: remaining,
        documentsByKb: nextDocs,
        activeKbId: s.activeKbId === id ? (remaining[0]?.id ?? null) : s.activeKbId,
      };
    });
  },

  loadDocuments: async (kbId) => {
    set({ loadingDocs: true, error: null });
    try {
      const docs = await invoke<KbDocument[]>("list_kb_documents", { kbId });
      set((s) => ({
        documentsByKb: { ...s.documentsByKb, [kbId]: docs },
        loadingDocs: false,
      }));
      return docs;
    } catch (e) {
      set({ error: String(e), loadingDocs: false });
      return [];
    }
  },

  ingestDocument: async (kbId, sourcePath) => {
    set({ ingestingDocId: `${kbId}::${sourcePath}`, error: null });
    try {
      const result = await invoke<KbIngestResult>("ingest_kb_document", {
        kbId,
        sourcePath,
      });
      // 刷新文档列表 + KB 计数
      await get().loadDocuments(kbId);
      await get().loadBases();
      set({ ingestingDocId: null });
      return result;
    } catch (e) {
      set({ error: String(e), ingestingDocId: null });
      throw e;
    }
  },

  deleteDocument: async (docId) => {
    await invoke("delete_kb_document", { docId });
    // 找到所属 KB 并刷新
    const all = get().documentsByKb;
    for (const [kbId, docs] of Object.entries(all)) {
      if (docs.some((d) => d.id === docId)) {
        await get().loadDocuments(kbId);
        break;
      }
    }
    await get().loadBases();
  },

  search: async (kbId, query, topK) => {
    set({ searching: true, error: null });
    try {
      const citations = await invoke<KbCitation[]>("kb_search", {
        kbId,
        query,
        topK,
      });
      set({ searching: false, lastCitations: citations });
      return citations;
    } catch (e) {
      set({ error: String(e), searching: false });
      throw e;
    }
  },

  ask: async (kbId, question, topK) => {
    set({ asking: true, error: null });
    try {
      const result = await invoke<KbAskResult>("kb_ask", { kbId, question, topK });
      set((s) => {
        const entry: AskHistoryEntry = {
          id: genId(),
          kbId,
          question,
          prompt: result.prompt,
          citations: result.citations,
          createdAt: Date.now(),
        };
        const history = [entry, ...s.askHistory].slice(0, MAX_ASK_HISTORY);
        return {
          asking: false,
          lastPrompt: result.prompt,
          lastCitations: result.citations,
          askHistory: history,
        };
      });
      return result;
    } catch (e) {
      set({ error: String(e), asking: false });
      throw e;
    }
  },

  clearAsk: () => set({ lastPrompt: "", lastCitations: [] }),
}));
