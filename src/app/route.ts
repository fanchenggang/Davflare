import { useCallback, useEffect, useState } from "react";

export type Route =
  | { kind: "folder"; path: string }
  | { kind: "trash" }
  | { kind: "shares" };

function encodeRoute(route: Route): string {
  switch (route.kind) {
    case "folder":
      return `#/${route.path.split("/").map(encodeURIComponent).join("/")}`;
    case "trash":
      return "#/trash";
    case "shares":
      return "#/shares";
  }
}

function decodeRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  if (raw === "trash") return { kind: "trash" };
  if (raw === "shares") return { kind: "shares" };

  const path = raw
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");

  return { kind: "folder", path: path ? `${path}/` : "" };
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() =>
    decodeRoute(window.location.hash)
  );

  useEffect(() => {
    const onHashChange = () => setRoute(decodeRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    const nextHash = encodeRoute(next);
    if (window.location.hash === nextHash) {
      setRoute(next);
      return;
    }
    window.location.hash = nextHash;
  }, []);

  return [route, navigate];
}
