import { useEffect, useRef, useState } from "react";

import { fetchFolderCounts } from "./transfer";
import { FileItem } from "./types";

const FOLDER_COUNT_CACHE_KEY = "flaredrive.folderCounts";
const FOLDER_COUNT_FILL_MAX = 50;

function loadFolderCountCache(): Record<string, number> {
  try {
    return JSON.parse(
      sessionStorage.getItem(FOLDER_COUNT_CACHE_KEY) || "{}"
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function saveFolderCountCache(counts: Record<string, number>) {
  try {
    sessionStorage.setItem(FOLDER_COUNT_CACHE_KEY, JSON.stringify(counts));
  } catch {
    // 忽略持久化失败
  }
}

// 惰性补全可见文件夹的子项计数（缓存到 sessionStorage，重复进入不重复请求）
export function useFolderCounts(options: {
  active: boolean;
  visibleFiles: FileItem[];
}) {
  const { active, visibleFiles } = options;
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>(
    loadFolderCountCache
  );
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!active) return;
    const targets = visibleFiles
      .filter(
        (file) =>
          file.isDir &&
          folderCounts[file.key] === undefined &&
          !inFlight.current.has(file.key)
      )
      .slice(0, FOLDER_COUNT_FILL_MAX);
    if (!targets.length) return;
    for (const target of targets) inFlight.current.add(target.key);
    let cancelled = false;
    fetchFolderCounts(targets.map((target) => target.key)).then((counts) => {
      for (const target of targets) {
        inFlight.current.delete(target.key);
      }
      if (cancelled) return;
      if (Object.keys(counts).length === 0) return;
      setFolderCounts((prev) => {
        const next = { ...prev, ...counts };
        saveFolderCountCache(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [folderCounts, active, visibleFiles]);

  return { folderCounts, setFolderCounts };
}
