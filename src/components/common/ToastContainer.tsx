import { useToastStore, type Toast, type ToastType } from "../../lib/useToast";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const COLORS: Record<ToastType, string> = {
  success: "var(--ok)",
  error: "var(--err)",
  warning: "var(--warn)",
  info: "var(--accent)",
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slideIn"
      style={{
        background: "var(--bg-elev)",
        border: "1px solid var(--border)",
        minWidth: 280,
        maxWidth: 400,
      }}
    >
      <span style={{ color: COLORS[toast.type] }}>
        {ICONS[toast.type]}
      </span>
      <span className="flex-1" style={{ color: "var(--fg)", fontSize: 13 }}>
        {toast.message}
      </span>
      <button
        onClick={onClose}
        className="p-1 rounded hover:bg-bg-soft transition-colors"
        style={{ color: "var(--fg-faint)" }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div 
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem 
          key={t.id} 
          toast={t} 
          onClose={() => removeToast(t.id)} 
        />
      ))}
    </div>
  );
}
