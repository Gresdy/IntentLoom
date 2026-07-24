import { useState } from "react";

interface UseMultiSelectOptions<T> {
  items: T[];
  filtered: T[];
  getKey: (item: T) => string;
  isItemActive: (item: T) => boolean;
}

export function useMultiSelect<T>({
  items,
  filtered,
  getKey,
  isItemActive,
}: UseMultiSelectOptions<T>) {
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());

  const toggleSelect = (key: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isAllSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(getKey(s)));

  const anyDisabled = items
    .filter((s) => selectedIds.has(getKey(s)))
    .some((s) => !isItemActive(s));

  const handleSelectAll = () => {
    setSelectedIds(
      isAllSelected ? new Set<string>() : new Set(filtered.map(getKey))
    );
  };

  const exitMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedIds(new Set<string>());
  };

  return {
    isMultiSelect,
    setIsMultiSelect,
    selectedIds,
    toggleSelect,
    isAllSelected,
    anyDisabled,
    handleSelectAll,
    exitMultiSelect,
  };
}
