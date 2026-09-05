import { useCallback, useMemo } from "react";

import { copyPaste, fetchPath } from "./transfer";
import { useTransferQueue, useUploadEnqueue } from "./transferQueue";
import { basename, uniqueName, uniquifyUploadFiles } from "./utils";
import { FileItem } from "./types";

/** 把剪贴板的一组 key 复制/剪切到目标目录，重名自动追加序号。 */
export async function transferKeys(
  keys: string[],
  destination: string,
  mode: "copy" | "cut"
) {
  let existing: FileItem[] = [];
  try {
    existing = await fetchPath(destination);
  } catch {
    existing = [];
  }
  const taken = new Set(existing.map((file) => file.name));

  for (const key of keys) {
    const name = basename(key);
    if (mode === "cut") {
      const parent = key.slice(0, key.length - name.length);
      if (parent === destination) continue;
    }
    const targetName = uniqueName(name, taken);
    await copyPaste(key, `${destination}${targetName}`, mode === "cut");
    taken.add(targetName);
  }
}

// 上传入队的各入口：文件选择器、文件夹选择器、重名规避（含进行中任务占位）。
export function useUploadInputs(options: { cwd: string; files: FileItem[] }) {
  const { cwd, files } = options;
  const transferQueue = useTransferQueue();
  const uploadEnqueue = useUploadEnqueue();

  // 当前目录已被文件与进行中上传占用的名字
  const takenForCwd = useMemo(() => {
    const taken = new Set(files.map((item) => item.name));
    for (const task of transferQueue) {
      if (task.type !== "upload") continue;
      if (task.basedir !== cwd) continue;
      if (task.status === "canceled" || task.status === "completed") continue;
      const rest = task.remoteKey.startsWith(cwd)
        ? task.remoteKey.slice(cwd.length)
        : task.name;
      taken.add(rest.split("/").filter(Boolean)[0] || task.name);
    }
    return taken;
  }, [cwd, files, transferQueue]);

  const enqueueToDir = useCallback(
    (incoming: File[], basedir: string, taken: Iterable<string>) => {
      if (!incoming.length) return;
      const unique = uniquifyUploadFiles(incoming, taken);
      uploadEnqueue(...unique.map((file) => ({ file, basedir })));
    },
    [uploadEnqueue]
  );

  return { transferQueue, uploadEnqueue, takenForCwd, enqueueToDir };
}
