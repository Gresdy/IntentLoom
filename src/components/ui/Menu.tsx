import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";

export type MenuOption = {
  id: string;
  label: string;
  description?: string;
};

type MenuProps = {
  /** Short caption shown muted to the left of the value (e.g. "Mode"). */
  caption?: string;
  /** Id of the currently selected option. */
  value: string | null;
  /** All options shown in the panel. The selected one is marked with a check. */
  options: MenuOption[];
  /** Called when the user picks a new option. */
  onChange: (id: string) => void;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
  /** When true, the panel hangs below the trigger (default: above). */
  downward?: boolean;
};

/**
 * Tiny popover-style dropdown used by the composer for per-CLI mode and
 * reasoning effort. Renders a compact pill trigger that opens a single
 * panel of options. Closes on outside click, Escape, or selection.
 */
export function Menu({
  caption,
  value,
  options,
  onChange,
  triggerClassName,
  downward,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <div className="menu" ref={wrapRef}>
      <button
        type="button"
        className={`menu__trigger chip${triggerClassName ? " " + triggerClassName : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={selected?.label}
      >
        {caption && <span className="menu__caption">{caption}</span>}
        <span className="menu__value">{selected?.label ?? "Default"}</span>
        <ChevronDown size={11} className={`menu__chevron${open ? " menu__chevron--open" : ""}`} />
      </button>
      {open && (
        <div className={`menu__panel${downward ? " menu__panel--downward" : ""}`} role="listbox">
          {options.map((opt) => {
            const active = opt.id === value;
            return (
              <button
                type="button"
                key={opt.id}
                role="option"
                aria-selected={active}
                className={`menu__item${active ? " menu__item--active" : ""}`}
                onClick={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
              >
                <span className="menu__item-main">
                  <span className="menu__item-label">{opt.label}</span>
                  {opt.description && (
                    <span className="menu__item-desc">{opt.description}</span>
                  )}
                </span>
                {active && <Check size={12} className="menu__item-check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Re-export for callers that prefer `Menu.Trigger` style. */
export type { ReactNode };
