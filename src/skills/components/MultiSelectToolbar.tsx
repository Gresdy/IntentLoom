import { Trash2, CheckCircle2, Circle, RotateCcw, Tag, Download, Upload } from "lucide-react";
import { cn } from "../utils";

interface MultiSelectToolbarLabels {
  hint: string;
  selected: string;
  update?: string;
  updateProject?: string;
  updateCenter?: string;
  delete: string;
  enable: string;
  disable: string;
  selectAll: string;
  deselectAll: string;
  cancel: string;
  editTags?: string;
}

interface MultiSelectToolbarProps {
  selectedCount: number;
  isAllSelected: boolean;
  anyDisabled: boolean;
  anyUpdatable?: boolean;
  anyCanUpdateProject?: boolean;
  anyCanUpdateCenter?: boolean;
  showToggle: boolean;
  updating?: boolean;
  updatingProject?: boolean;
  updatingCenter?: boolean;
  labels: MultiSelectToolbarLabels;
  onUpdate?: () => void;
  onUpdateProject?: () => void;
  onUpdateCenter?: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onSelectAll: () => void;
  onCancel: () => void;
  onEditTags?: () => void;
}

export function MultiSelectToolbar({
  selectedCount,
  isAllSelected,
  anyDisabled,
  anyUpdatable = false,
  anyCanUpdateProject = false,
  anyCanUpdateCenter = false,
  showToggle,
  updating = false,
  updatingProject = false,
  updatingCenter = false,
  labels,
  onUpdate,
  onUpdateProject,
  onUpdateCenter,
  onDelete,
  onToggle,
  onSelectAll,
  onCancel,
  onEditTags,
}: MultiSelectToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <span className="text-[13px] text-muted">
        {selectedCount > 0 ? labels.selected : labels.hint}
      </span>
      {selectedCount > 0 && (
        <>
          {anyUpdatable && labels.update && onUpdate && (
            <button
              onClick={onUpdate}
              disabled={updating}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              <RotateCcw className={cn("h-3.5 w-3.5", updating && "animate-spin")} />
              {labels.update}
            </button>
          )}
          {anyCanUpdateProject && labels.updateProject && onUpdateProject && (
            <button
              onClick={onUpdateProject}
              disabled={updatingProject}
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-600/90 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-sky-500 transition-colors disabled:opacity-50"
            >
              <Download className={cn("h-3.5 w-3.5", updatingProject && "animate-spin")} />
              {labels.updateProject}
            </button>
          )}
          {anyCanUpdateCenter && labels.updateCenter && onUpdateCenter && (
            <button
              onClick={onUpdateCenter}
              disabled={updatingCenter}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-600/90 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              <Upload className={cn("h-3.5 w-3.5", updatingCenter && "animate-spin")} />
              {labels.updateCenter}
            </button>
          )}
          {onEditTags && labels.editTags && (
            <button
              onClick={onEditTags}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600/90 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-violet-500 transition-colors"
            >
              <Tag className="h-3.5 w-3.5" />
              {labels.editTags}
            </button>
          )}
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600/90 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {labels.delete}
          </button>
          {showToggle && (
            <button
              onClick={onToggle}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium text-white transition-colors",
                anyDisabled
                  ? "bg-emerald-600/90 hover:bg-emerald-500"
                  : "bg-amber-600/90 hover:bg-amber-500"
              )}
            >
              {anyDisabled
                ? <CheckCircle2 className="h-3.5 w-3.5" />
                : <Circle className="h-3.5 w-3.5" />}
              {anyDisabled ? labels.enable : labels.disable}
            </button>
          )}
        </>
      )}
      <button
        onClick={onSelectAll}
        className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted hover:text-secondary hover:bg-surface-hover transition-colors"
      >
        {isAllSelected ? labels.deselectAll : labels.selectAll}
      </button>
      <button
        onClick={onCancel}
        className="rounded-md px-2.5 py-1 text-[13px] font-medium text-muted hover:text-secondary hover:bg-surface-hover transition-colors"
      >
        {labels.cancel}
      </button>
    </div>
  );
}
