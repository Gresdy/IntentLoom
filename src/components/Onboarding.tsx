import { useState, useEffect, useCallback, useRef, type ComponentType } from "react";
import { X, PanelLeft, MessageSquare, Layers, LayoutGrid, ArrowRight } from "lucide-react";

// One-time, post-install tour that walks the user past the four
// primary areas (sidebar, chat, loom, tools). Once dismissed we
// stash a flag in localStorage so the welcome card never reappears.
//
// The brief is intentionally picture-first: per the design rules we
// never write a long description of what each surface is *for* into
// the chrome of the app, so the tour leads with the area icon and
// shows the label only as a small caption. Hover tooltips on the
// sidebar/topbar items continue to carry feature hints; this tour
// is a one-shot layout reveal, not a feature manual.

const STORAGE_KEY = "intentloom.onboarded";

interface Step {
  key: string;
  icon: ComponentType<{ size?: number }>;
  label: string;
}

const STEPS: Step[] = [
  { key: "sidebar", icon: PanelLeft, label: "侧栏" },
  { key: "chat", icon: MessageSquare, label: "对话" },
  { key: "loom", icon: Layers, label: "织机" },
  { key: "tools", icon: LayoutGrid, label: "工具" },
];

interface Pos { top: number; left: number }

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number>(-1); // -1 = welcome, 0..3 = tour
  const [pos, setPos] = useState<Pos | null>(null);
  const tourRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    setOpen(true);
  }, []);

  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
    setOpen(false);
  }, []);

  const advance = useCallback(() => {
    setStep((s) => {
      if (s >= STEPS.length - 1) {
        dismiss();
        return s;
      }
      return s + 1;
    });
  }, [dismiss]);

  // Esc dismisses; → also advances when in tour mode.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      } else if (step >= 0 && e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, dismiss, advance]);

  // Track the bounding rect of the current step's [data-tour] node.
  useEffect(() => {
    if (step < 0 || !open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].key}"]`);
      if (!el) {
        setPos(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Anchor the bubble at the top-left corner of the focused area
      // with a small inset so it doesn't sit under the cursor.
      setPos({
        top: Math.max(16, r.top + 16),
        left: Math.max(16, r.left + 16),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, open]);

  if (!open) return null;

  if (step === -1) {
    return (
      <div className="onboarding-backdrop" onClick={dismiss} role="dialog" aria-modal="true">
        <div className="onboarding-card" onClick={(e) => e.stopPropagation()}>
          <div className="onboarding-logo" aria-hidden>I</div>
          <div className="onboarding-name">IntentLoom</div>
          <div className="onboarding-icons" aria-hidden>
            {STEPS.map(({ key, icon: Icon }) => (
              <span key={key} className="onboarding-icons__dot">
                <Icon size={18} />
              </span>
            ))}
          </div>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-skip" onClick={dismiss}>
              跳过
            </button>
            <button type="button" className="onboarding-start" onClick={() => setStep(0)}>
              开始
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      ref={tourRef}
      className="onboarding-tour"
      onClick={advance}
      role="dialog"
      aria-modal="true"
      aria-label={`引导 ${step + 1}/${STEPS.length}`}
    >
      <button
        type="button"
        className="onboarding-close"
        onClick={(e) => { e.stopPropagation(); dismiss(); }}
        title="关闭引导"
        aria-label="关闭引导"
      >
        <X size={14} />
      </button>
      {pos && (
        <>
          <div
            className="onboarding-indicator"
            style={{ top: pos.top, left: pos.left }}
            aria-hidden
          >
            <Icon size={18} />
            <span className="onboarding-step">{step + 1}/{STEPS.length}</span>
          </div>
          <div
            className="onboarding-tooltip"
            style={{ top: pos.top + 44, left: pos.left }}
          >
            <div className="onboarding-tooltip__label">{current.label}</div>
            <div className="onboarding-tooltip__progress">
              {STEPS.map((s, i) => (
                <span
                  key={s.key}
                  className={`onboarding-tooltip__dot${i === step ? " is-active" : ""}${i < step ? " is-done" : ""}`}
                />
              ))}
            </div>
            <button
              type="button"
              className="onboarding-tooltip__next"
              onClick={(e) => { e.stopPropagation(); advance(); }}
            >
              {isLast ? "完成" : "下一处"}
              {!isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
