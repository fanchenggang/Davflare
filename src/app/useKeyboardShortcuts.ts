import { useEffect } from "react";

import { hasOpenOverlay, parentKey, shouldIgnoreShortcuts } from "./interaction";
import { Route } from "./route";
import { FileItem } from "./types";

export interface KeyboardShortcutsParams {
  route: Route;
  visibleFiles: FileItem[];
  selectedKeys: string[];
  focusedKey: string | null;
  setSelectedKeys: (update: string[]) => void;
  setFocusedKey: (key: string | null) => void;
  moveFocused: (delta: number, extendSelection: boolean) => void;
  jumpFocused: (index: number, extendSelection: boolean) => void;
  toggleSelect: (key: string) => void;
  selectAll: () => void;
  navigateFolder: (path: string) => void;
  onOpen: (key: string) => void;
  onRename: (file: FileItem) => void;
  onDetails: (file: FileItem) => void;
  onDelete: (keys: string[]) => void;
}

// 全局键盘导航：方向键/Home/End 移动焦点，Space 选择，Ctrl+A 全选，
// F2 重命名，I 打开详情侧栏，Delete 删除，Enter 打开，Backspace 返回上级，Escape 清空选择。
export function useKeyboardShortcuts(params: KeyboardShortcutsParams) {
  const {
    route,
    visibleFiles,
    selectedKeys,
    focusedKey,
    setSelectedKeys,
    setFocusedKey,
    moveFocused,
    jumpFocused,
    toggleSelect,
    selectAll,
    navigateFolder,
    onOpen,
    onRename,
    onDetails,
    onDelete,
  } = params;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcuts(event)) return;
      if (event.key === "Escape") {
        if (hasOpenOverlay()) return;
        if (selectedKeys.length || focusedKey) {
          event.preventDefault();
          setSelectedKeys([]);
          setFocusedKey(null);
        }
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        moveFocused(event.key === "ArrowDown" ? 1 : -1, event.shiftKey);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        moveFocused(event.key === "ArrowRight" ? 1 : -1, event.shiftKey);
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        jumpFocused(
          event.key === "Home" ? 0 : visibleFiles.length - 1,
          event.shiftKey
        );
        return;
      }
      if (event.key === " " && focusedKey) {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        toggleSelect(focusedKey);
        return;
      }
      if ((event.key === "a" || event.key === "A") && (event.metaKey || event.ctrlKey)) {
        if (hasOpenOverlay()) return;
        event.preventDefault();
        selectAll();
        return;
      }
      if (event.key === "F2") {
        if (hasOpenOverlay()) return;
        const activeKey = focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : null);
        if (!activeKey) return;
        const file = visibleFiles.find((item) => item.key === activeKey);
        if (!file) return;
        event.preventDefault();
        onRename(file);
        return;
      }
      if (event.key === "i" || event.key === "I") {
        if (hasOpenOverlay()) return;
        const activeKey = focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : null);
        if (!activeKey) return;
        const file = visibleFiles.find((item) => item.key === activeKey);
        if (!file) return;
        event.preventDefault();
        onDetails(file);
        return;
      }
      if (event.key === "Backspace") {
        // Backspace 语义是「返回上级」而不是删除，避免破坏性误触；Delete 才删除。
        if (hasOpenOverlay()) return;
        if (route.kind !== "folder" || !route.path) return;
        event.preventDefault();
        navigateFolder(parentKey(route.path));
        return;
      }
      if (event.key === "Delete") {
        if (hasOpenOverlay()) return;
        const targets =
          selectedKeys.length > 0
            ? selectedKeys
            : focusedKey
            ? [focusedKey]
            : [];
        if (!targets.length) return;
        event.preventDefault();
        onDelete(targets);
        return;
      }
      if (event.key === "Enter") {
        if (hasOpenOverlay()) return;
        const activeKey = focusedKey ?? (selectedKeys.length === 1 ? selectedKeys[0] : null);
        if (!activeKey) return;
        const file = visibleFiles.find((item) => item.key === activeKey);
        if (!file) return;
        event.preventDefault();
        if (file.isDir) navigateFolder(file.key);
        else onOpen(file.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    focusedKey,
    jumpFocused,
    moveFocused,
    navigateFolder,
    onDelete,
    onDetails,
    onOpen,
    onRename,
    route,
    selectAll,
    selectedKeys,
    setFocusedKey,
    setSelectedKeys,
    toggleSelect,
    visibleFiles,
  ]);
}
