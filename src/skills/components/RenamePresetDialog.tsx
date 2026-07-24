import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import { PRESET_ICON_OPTIONS } from "../lib/presetIcons";

interface Props {
  open: boolean;
  currentName: string;
  currentIcon?: string | null;
  onClose: () => void;
  onRename: (newName: string, icon?: string) => Promise<void>;
}

export function RenamePresetDialog({
  open,
  currentName,
  currentIcon,
  onClose,
  onRename,
}: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);
  const [icon, setIcon] = useState(currentIcon || PRESET_ICON_OPTIONS[0].key);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(currentName);
      setIcon(currentIcon || PRESET_ICON_OPTIONS[0].key);
    }
  }, [open, currentIcon, currentName]);

  if (!open) return null;

  const handleRename = async () => {
    if (!name.trim() || (name.trim() === currentName && icon === (currentIcon || PRESET_ICON_OPTIONS[0].key))) {
      return;
    }
    setLoading(true);
    try {
      await onRename(name.trim(), icon);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-background border border-border-subtle rounded-[4px] px-3 py-2 text-[13px] text-secondary focus:outline-none focus:border-border transition-all placeholder-faint";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-[400px] p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-primary">{t("common.rename")}</h2>
          <button onClick={onClose} className="text-muted hover:text-secondary p-1 rounded transition-colors outline-none">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1">{t("preset.name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("preset.namePlaceholder")}
              className={inputClass}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-tertiary mb-1.5">{t("preset.icon")}</label>
            <div className="grid max-h-[220px] grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1.5 overflow-y-auto pr-1">
              {PRESET_ICON_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = option.key === icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setIcon(option.key)}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-lg border bg-background transition-all outline-none",
                      selected
                        ? `${option.activeClass} ${option.colorClass}`
                        : "border-border-subtle text-muted hover:border-border hover:text-secondary"
                    )}
                    title={option.label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-[4px] text-[13px] font-medium text-tertiary hover:text-secondary hover:bg-surface-hover transition-colors outline-none"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleRename}
              disabled={
                !name.trim() ||
                (name.trim() === currentName && icon === (currentIcon || PRESET_ICON_OPTIONS[0].key)) ||
                loading
              }
              className="px-3 py-1.5 rounded-[4px] bg-accent-dark hover:bg-accent text-white text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-accent-border outline-none"
            >
              {loading ? t("common.loading") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
