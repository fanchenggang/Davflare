import { useCallback, useRef, useState } from "react";

import { FileItem } from "./types";

// 多选 + 焦点导航模型：Shift 范围选择、全选切换、焦点移动与滚动定位。
export function useMultiSelect(visibleFiles: FileItem[]) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const selectionAnchor = useRef<string | null>(null);

  const scrollFocusedIntoView = useCallback((key: string) => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-file-key]");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.dataset.fileKey === key) {
        node.scrollIntoView({ block: "nearest" });
        return;
      }
    }
  }, []);

  const jumpFocused = useCallback(
    (index: number, extendSelection: boolean) => {
      if (!visibleFiles.length) return;
      const clamped = Math.max(0, Math.min(index, visibleFiles.length - 1));
      const next = visibleFiles[clamped];
      setFocusedKey(next.key);
      if (extendSelection) {
        setSelectedKeys((prev) =>
          prev.includes(next.key) ? prev : [...prev, next.key]
        );
      }
      scrollFocusedIntoView(next.key);
    },
    [scrollFocusedIntoView, visibleFiles]
  );

  const moveFocused = useCallback(
    (delta: number, extendSelection: boolean) => {
      if (!visibleFiles.length) return;
      const currentIndex = focusedKey
        ? visibleFiles.findIndex((file) => file.key === focusedKey)
        : -1;
      jumpFocused(currentIndex + delta, extendSelection);
    },
    [focusedKey, jumpFocused, visibleFiles]
  );

  const toggleSelect = useCallback(
    (key: string, event?: { shiftKey?: boolean }) => {
      setSelectedKeys((prev) => {
        if (event?.shiftKey && selectionAnchor.current) {
          const anchorIndex = visibleFiles.findIndex(
            (file) => file.key === selectionAnchor.current
          );
          const targetIndex = visibleFiles.findIndex(
            (file) => file.key === key
          );
          if (anchorIndex >= 0 && targetIndex >= 0) {
            const [start, end] =
              anchorIndex <= targetIndex
                ? [anchorIndex, targetIndex]
                : [targetIndex, anchorIndex];
            const merged = new Set(prev);
            for (const file of visibleFiles.slice(start, end + 1)) {
              merged.add(file.key);
            }
            return [...merged];
          }
        }
        return prev.includes(key)
          ? prev.filter((item) => item !== key)
          : [...prev, key];
      });
      selectionAnchor.current = key;
    },
    [visibleFiles]
  );

  const selectAll = useCallback(() => {
    setSelectedKeys((prev) => {
      const all = visibleFiles.map((file) => file.key);
      if (prev.length === all.length) return [];
      return all;
    });
  }, [visibleFiles]);

  return {
    selectedKeys,
    setSelectedKeys,
    focusedKey,
    setFocusedKey,
    toggleSelect,
    selectAll,
    jumpFocused,
    moveFocused,
  };
}
