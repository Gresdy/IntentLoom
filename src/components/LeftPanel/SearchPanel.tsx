import { useCallback, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { invoke } from "../../lib/tauri";

// `SearchPanel` used to live at the bottom of ReasonixApp.tsx and was
// only reachable through the right-panel slide-in. It now lives in
// its own file so the Settings drawer can `React.lazy()` it under
// the "搜索" tab. The component is self-contained: it calls the
// Tauri `search_code` command directly and renders the raw result
// list. A workspace picker would be a nice future addition but the
// current Tauri command already accepts an empty `cwd` and falls
// back to the active session's working directory, so we mirror that
// behaviour here.

interface SearchHit {
  file: string;
  line: number;
  preview?: string;
}

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await invoke<SearchHit[]>("search_code", {
        query,
        cwd: "",
      });
      setResults(res);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  return (
    <div className="search-panel">
      <div className="search-panel__bar">
        <input
          className="search-panel__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="搜索代码..."
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="chip chip--on"
        >
          <SearchIcon size={13} />
        </button>
      </div>
      {results.map((r, i) => (
        <div key={i} className="search-panel__row">
          <div className="search-panel__file">{r.file}</div>
          <div className="search-panel__line">{r.line}</div>
        </div>
      ))}
      {!results.length && query && !searching && (
        <div className="search-panel__empty">无结果</div>
      )}
    </div>
  );
}
