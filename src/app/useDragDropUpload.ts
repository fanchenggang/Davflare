import { useEffect, useRef, useState } from "react";

import { collectFilesFromDataTransfer } from "./transfer";
import { dragHasFiles } from "./interaction";

// 全窗口拖拽上传：dragenter/leave 计数防抖控制遮罩显隐，drop 收集文件入队。
export function useDragDropUpload(options: {
  active: boolean;
  enqueueToCwd: (files: File[]) => void;
}) {
  const { active, enqueueToCwd } = options;
  const [dropActive, setDropActive] = useState(false);
  const dropDepth = useRef(0);

  useEffect(() => {
    if (!active) {
      dropDepth.current = 0;
      setDropActive(false);
      return;
    }
    const onEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      dropDepth.current += 1;
      setDropActive(true);
    };
    const onLeave = () => {
      dropDepth.current = Math.max(0, dropDepth.current - 1);
      if (dropDepth.current === 0) setDropActive(false);
    };
    const onOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
    };
    const onDrop = async (event: DragEvent) => {
      const wasFiles = dragHasFiles(event);
      dropDepth.current = 0;
      setDropActive(false);
      if (!wasFiles || !event.dataTransfer) return;
      event.preventDefault();
      const dropped = await collectFilesFromDataTransfer(event.dataTransfer);
      if (dropped.length) enqueueToCwd(dropped);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [active, enqueueToCwd]);

  return dropActive;
}
