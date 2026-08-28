import { useEffect, useState } from "react";

const STORAGE_KEY = "flaredrive.recent";
const MAX_RECENT = 20;
const EVENT = "flaredrive-recent";

export interface RecentEntry {
  key: string;
  name: string;
  isDir: boolean;
  at: number;
}

export function loadRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.key === "string" &&
          typeof item.name === "string"
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecent(entry: {
  key: string;
  name: string;
  isDir: boolean;
}): RecentEntry[] {
  const next = [
    { ...entry, at: Date.now() },
    ...loadRecent().filter((item) => item.key !== entry.key),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore quota
  }
  return next;
}

export function useRecent(): RecentEntry[] {
  const [items, setItems] = useState<RecentEntry[]>(() => loadRecent());
  useEffect(() => {
    const sync = () => setItems(loadRecent());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, []);
  return items;
}
