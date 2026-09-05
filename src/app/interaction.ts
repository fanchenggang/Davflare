import type * as React from "react";

import { strings } from "./strings";

// 键盘/粘贴/拖拽等全局交互的判定辅助，供 Main 与各 hooks 共用。

export function isTypingTarget(target: EventTarget | null) {
  const el =
    target instanceof HTMLElement
      ? target
      : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (!el) return false;
  const field = el.closest("input, textarea, select, [contenteditable='true']");
  if (field instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit"].includes(field.type);
  }
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    return true;
  }
  return Boolean(field) || el.isContentEditable;
}

export function shouldIgnoreShortcuts(event: KeyboardEvent) {
  if (event.isComposing || event.key === "Process") return true;
  return isTypingTarget(event.target) || isTypingTarget(document.activeElement);
}

export function parentKey(key: string) {
  const trimmed = key.replace(/\/$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(0, index + 1) : "";
}

export function stampPastedName(file: File) {
  const subtype = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const ext = subtype.split("+")[0] || "png";
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${strings.pastedImage} ${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
}

export function dragHasFiles(event: DragEvent | React.DragEvent) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  const list = Array.from(types as ArrayLike<string>);
  if (list.includes("application/x-flaredrive")) return false;
  return list.includes("Files");
}

export function hasOpenOverlay() {
  const nodes = document.querySelectorAll(".MuiModal-root");
  for (let i = 0; i < nodes.length; i++) { const node = nodes[i];
    if (node.getAttribute("aria-hidden") !== "true") return true;
  }
  return false;
}
