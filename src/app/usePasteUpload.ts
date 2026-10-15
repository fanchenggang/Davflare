import { useEffect } from "react";

import { HostedImage } from "./images";
import { isTypingTarget } from "./interaction";
import { NotifyFn } from "./notify";
import {
  collectClipboardFiles,
  namePastedFile,
  partitionPasteFiles,
  uploadPastedImagesToHost,
} from "./pasteImageHost";
import { translate } from "./strings";

/**
 * 粘贴上传：
 * - 图床开启时：剪贴板图片 → POST /api/images，toast 复制 CDN 链；可选同时入队当前目录
 * - 非图片（或图床关闭）：仍入队到当前目录（旧行为）
 * - 文本快传（PasteDialog）走按钮，不抢剪贴板纯文本
 */
export function usePasteUpload(options: {
  active: boolean;
  enqueueToCwd?: (files: File[]) => void;
  onNotify: NotifyFn;
  /** 图床功能开关；关则图片也只入队当前目录 */
  imageHostEnabled?: boolean;
  /** 图床上传时是否同时落到当前目录（文件管理器） */
  alsoSaveImagesToCwd?: boolean;
  /** 图床上传成功回调（例如刷新 #/images 列表） */
  onImageHosted?: (image: HostedImage) => void;
}) {
  const {
    active,
    enqueueToCwd,
    onNotify,
    imageHostEnabled = false,
    alsoSaveImagesToCwd = false,
    onImageHosted,
  } = options;

  useEffect(() => {
    if (!active) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const pasted = collectClipboardFiles(event.clipboardData?.items);
      if (!pasted.length) return;
      event.preventDefault();

      const named = pasted.map(namePastedFile);
      const { images, others } = partitionPasteFiles(named);

      if (imageHostEnabled && images.length > 0) {
        if (alsoSaveImagesToCwd && enqueueToCwd) {
          enqueueToCwd(images);
        }
        void uploadPastedImagesToHost({
          files: images,
          onNotify,
          onUploaded: onImageHosted,
        });
      } else if (images.length > 0 && enqueueToCwd) {
        enqueueToCwd(images);
        onNotify(translate("enqueuedUploads", { count: images.length }), "success");
      }

      if (others.length > 0 && enqueueToCwd) {
        enqueueToCwd(others);
        onNotify(translate("enqueuedUploads", { count: others.length }), "success");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [
    active,
    alsoSaveImagesToCwd,
    enqueueToCwd,
    imageHostEnabled,
    onImageHosted,
    onNotify,
  ]);
}
