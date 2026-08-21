import { useEffect, useState } from "react";

export type ViewMode = "grid" | "list";
export type SortField = "name" | "size" | "date";
export type SortOrder = "asc" | "desc";

export interface SortPref {
  field: SortField;
  order: SortOrder;
}

export function usePersistedState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore persistence failures
    }
  }, [key, value]);

  return [value, setValue] as const;
}
