import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingState({ message = "加载中...", size = "md" }: LoadingStateProps) {
  const sizes = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8">
      <Loader2 
        size={sizes[size]} 
        className="animate-spin ilo-fg-accent" 
      />
      <span style={{ color: "var(--fg-faint)", fontSize: 13 }}>{message}</span>
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      {icon && (
        <div className="p-4 rounded-full ilo-bg-soft">
          {icon}
        </div>
      )}
      <div>
        <h3 className="font-medium mb-1 ilo-fg">{title}</h3>
        {description && (
          <p style={{ color: "var(--fg-faint)", fontSize: 13 }}>{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  error: string | Error;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const message = error instanceof Error ? error.message : error;
  
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="p-4 rounded-full" style={{ background: "var(--del-bg)" }}>
        <span className="text-2xl">⚠️</span>
      </div>
      <div>
        <h3 className="font-medium mb-1 ilo-fg-err">出错了</h3>
        <p style={{ color: "var(--fg-dim)", fontSize: 13, maxWidth: 320, wordBreak: "break-word" }}>
          {message}
        </p>
      </div>
      {onRetry && (
        <button 
          className="chip chip--on"
          onClick={onRetry}
        >
          重试
        </button>
      )}
    </div>
  );
}
