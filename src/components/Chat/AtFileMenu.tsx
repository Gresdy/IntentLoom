/**
 * AtFileMenu — AionUi `@`-mention file picker port.
 *
 * Originally from
 *   packages/desktop/src/renderer/components/chat/AtFileMenu/index.tsx
 *
 * A floating popover that appears below the composer when the user
 * types `@` followed by a query. Up/Down arrows change the active
 * item; Tab/Enter completes the active item; Escape closes the menu;
 * clicking an item completes it. The popover is a controlled
 * component — the parent owns the query text, the open state, and
 * the workspace file list.
 *
 * IntentLoom port notes:
 *   - We do NOT call Tauri's fs API here; the parent reads the
 *     workspace tree once and passes a flat `string[]` of relative
 *     paths. The composer filters those with a simple `includes`
 *     check (case-insensitive). Substring match is good enough for
 *     up to a few thousand files; if needed, swap in fuse.js later.
 *   - `onPick(path)` returns the selected path; the composer is
 *     responsible for splicing it back into the textarea at the
 *     `@` cursor position.
 */

import { useEffect, useRef } from "react";
import { FileText, Folder } from "lucide-react";

export interface AtFileMenuProps {
  query: string;
  active: number;
  onActiveChange: (index: number) => void;
  onPick: (path: string) => void;
  files: string[];
  /** Max items to show. Default 8. */
  maxItems?: number;
}

export function AtFileMenu({
  query,
  active,
  onActiveChange,
  onPick,
  files,
  maxItems = 8,
}: AtFileMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Case-insensitive substring match on the basename first, then the
  // full path. Empty query lists everything (capped at `maxItems`).
  const q = query.toLowerCase();
  const matches = files
    .filter((f) => {
      if (!q) return true;
      const base = f.split("/").pop() ?? f;
      return base.toLowerCase().includes(q) || f.toLowerCase().includes(q);
    })
    .slice(0, maxItems);

  // Clamp `active` whenever the matches shrink so the keyboard cursor
  // never lands on a now-stale index.
  useEffect(() => {
    if (active >= matches.length) onActiveChange(0);
    // We intentionally only re-clamp on length changes; doing it on
    // every render would fight a user who's mid-arrow-press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches.length]);

  if (matches.length === 0) return null;

  return (
    <div className="atmenu" role="listbox" ref={listRef} data-testid="at-file-menu">
      {matches.map((path, i) => {
        const base = path.split("/").pop() ?? path;
        const isDir = base.endsWith("/") || (!base.includes(".") && !base.startsWith("."));
        return (
          <div
            key={path}
            role="option"
            aria-selected={i === active}
            className={`atmenu__item ${i === active ? "atmenu__item--active" : ""}`}
            onMouseEnter={() => onActiveChange(i)}
            onMouseDown={(e) => e.preventDefault() /* keep textarea focused */}
            onClick={() => onPick(path)}
            data-testid={`at-file-${base}`}
          >
            <span className="atmenu__icon">
              {isDir ? <Folder size={12} /> : <FileText size={12} />}
            </span>
            <span className="atmenu__name">{base}</span>
            <span className="atmenu__path">{path}</span>
          </div>
        );
      })}
    </div>
  );
}

export default AtFileMenu;
