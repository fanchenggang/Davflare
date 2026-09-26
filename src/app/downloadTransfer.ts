// 下载任务的执行器：流式读取响应体，把进度回报给传输队列，完成后触发浏览器保存。
// 单文件下载有 Content-Length 可显示精确进度；zip 归档为流式打包无总长，
// total 保持 0，UI 以不确定进度条 + 已下载字节数呈现。

import { authFetch } from "./auth";
import { translate } from "./strings";
import { saveBlob } from "./transfer";
import type { TransferTask } from "./types";

export async function processDownloadTask({
  task,
  onTaskProgress,
  signal,
}: {
  task: TransferTask;
  onTaskProgress?: (event: { loaded: number; total: number }) => void;
  onTaskState?: (patch: Partial<TransferTask>) => void;
  signal?: AbortSignal;
}) {
  if (task.type !== "download" || !task.downloadUrl) {
    throw new Error("Invalid task");
  }
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const res = await authFetch(task.downloadUrl, {
    method: task.downloadInit?.method,
    body: task.downloadInit?.body,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || translate("downloadFailed"));
  }

  const headerLength = Number(res.headers.get("Content-Length"));
  const total =
    Number.isFinite(headerLength) && headerLength > 0 ? headerLength : 0;
  onTaskProgress?.({ loaded: 0, total });

  let blob: Blob;
  if (res.body) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onTaskProgress?.({ loaded, total });
    }
    blob = new Blob(chunks, {
      type: res.headers.get("Content-Type") ?? "application/octet-stream",
    });
  } else {
    blob = await res.blob();
    onTaskProgress?.({ loaded: blob.size, total: blob.size });
  }

  saveBlob(blob, task.saveAs || task.name);
}
