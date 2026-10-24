import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getApiBase, useAuth } from "./auth";

export interface FolderShortcut {
  path: string;
  name: string;
}
const EVENT = "davflare-shortcuts";
const volatile = new Map<string, FolderShortcut[]>();
export function normalizeFolderPath(path: string): string {
  const clean = path.split("/").filter(Boolean).join("/");
  return clean ? `${clean}/` : "";
}
export function shortcutScope(instance: string, username: string) {
  return `davflare.shortcuts:${encodeURIComponent(instance.replace(/\/+$/, ""))}:${encodeURIComponent(username)}`;
}
export function loadShortcuts(scope: string): FolderShortcut[] {
  if (volatile.has(scope)) return volatile.get(scope)!;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(scope) || "[]");
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    return raw
      .filter(
        (entry): entry is FolderShortcut =>
          entry &&
          typeof entry.path === "string" &&
          typeof entry.name === "string",
      )
      .map((entry) => ({
        path: normalizeFolderPath(entry.path),
        name: entry.name,
      }))
      .filter((entry) => {
        if (seen.has(entry.path)) return false;
        seen.add(entry.path);
        return true;
      });
  } catch {
    return [];
  }
}
export function saveShortcuts(scope: string, items: FolderShortcut[]) {
  try {
    localStorage.setItem(scope, JSON.stringify(items));
    volatile.delete(scope);
  } catch {
    volatile.set(scope, items);
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { scope, items } }));
}
export function relocateShortcuts(
  scope: string,
  source: string,
  target: string,
) {
  const from = normalizeFolderPath(source),
    to = normalizeFolderPath(target);
  if (!from || from === to) return;
  const items = loadShortcuts(scope);
  if (!items.some((item) => item.path.startsWith(from))) return;
  const seen = new Set<string>();
  saveShortcuts(
    scope,
    items
      .map((item) => {
        if (!item.path.startsWith(from)) return item;
        const path = to + item.path.slice(from.length);
        return {
          path,
          name:
            item.path === from
              ? to.split("/").filter(Boolean).pop() || item.name
              : item.name,
        };
      })
      .filter((item) => {
        if (seen.has(item.path)) return false;
        seen.add(item.path);
        return true;
      }),
  );
}
const ShortcutContext = createContext({
  items: [] as FolderShortcut[],
  toggle: (_path: string, _name: string) => {},
  remove: (_path: string) => {},
});
export const useFolderShortcuts = () => useContext(ShortcutContext);
export function FolderShortcutsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { username } = useAuth();
  const scope = shortcutScope(getApiBase(), username ?? "");
  const [snapshot, setSnapshot] = useState(() => ({
    scope,
    items: loadShortcuts(scope),
  }));
  const items =
    snapshot.scope === scope ? snapshot.items : loadShortcuts(scope);
  useEffect(() => {
    setSnapshot({ scope, items: loadShortcuts(scope) });
    const sync = (event: Event) => {
      if (event instanceof CustomEvent) {
        if (event.detail.scope === scope)
          setSnapshot({ scope, items: event.detail.items });
      } else setSnapshot({ scope, items: loadShortcuts(scope) });
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [scope]);
  const toggle = useCallback(
    (path: string, name: string) => {
      if (username === null) return;
      const normalized = normalizeFolderPath(path);
      const current = loadShortcuts(scope);
      saveShortcuts(
        scope,
        current.some((item) => item.path === normalized)
          ? current.filter((item) => item.path !== normalized)
          : [...current, { path: normalized, name }],
      );
    },
    [scope, username],
  );
  const remove = useCallback(
    (path: string) =>
      saveShortcuts(
        scope,
        loadShortcuts(scope).filter(
          (item) => item.path !== normalizeFolderPath(path),
        ),
      ),
    [scope],
  );
  return (
    <ShortcutContext.Provider value={{ items, toggle, remove }}>
      {children}
    </ShortcutContext.Provider>
  );
}
