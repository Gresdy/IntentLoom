import { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  showClose?: boolean;
}

const SIZES = {
  sm: 320,
  md: 480,
  lg: 560,
  xl: 720,
};

export function Dialog({ isOpen, onClose, title, children, size = "md", showClose = true }: DialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.6)" }}
      onClick={onClose}
    >
      <div
        className="relative rounded-xl overflow-hidden animate-scaleIn"
        style={{
          width: "100%",
          maxWidth: SIZES[size],
          maxHeight: "90vh",
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showClose) && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid var(--border-soft)" }}
          >
            {title && <h2 className="font-semibold">{title}</h2>}
            {showClose && (
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-bg-soft transition-colors"
                style={{ color: "var(--fg-faint)" }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 60px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  variant = "default",
}: ConfirmDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="p-4">
        <p style={{ color: "var(--fg-dim)", marginBottom: 20 }}>{message}</p>
        <div className="flex gap-3 justify-end">
          <button className="chip" onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={`chip ${variant === "danger" ? "chip--danger" : "chip--on"}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            style={variant === "danger" ? { color: "var(--err)", borderColor: "var(--err)" } : {}}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
