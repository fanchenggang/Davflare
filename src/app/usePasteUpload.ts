import { useEffect } from "react";

import { isTypingTarget, stampPastedName } from "./interaction";
import { NotifyFn } from "./notify";
import { translate } from "./strings";

// 粘贴上传：监听全局 paste 事件，把剪贴板里的文件入队到当前目录；
// 无名图片（截图等）自动按时间戳命名。
export function usePasteUpload(options: {
  active: boolean;
  enqueueToCwd: (files: File[]) => void;
  onNotify: NotifyFn;
}) {
  const { active, enqueueToCwd, onNotify } = options;

  useEffect(() => {
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
      if (!pasted.length) return;
      event.preventDefault();
      const named = pasted.map((file) => {
        const generic =
          file.type.startsWith("image/") &&
          (!file.name || /^image\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name));
        if (!generic) return file;
        return new File([file], stampPastedName(file), {
          type: file.type,
          lastModified: file.lastModified,
        });
      });
      enqueueToCwd(named);
      onNotify(translate("enqueuedUploads", { count: named.length }), "success");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active, enqueueToCwd, onNotify]);
}
