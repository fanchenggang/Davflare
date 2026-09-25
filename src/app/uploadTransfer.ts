// 上传链路：缩略图生成、目录补齐、拖拽/目录选择、XHR 直传与大文件分块上传。
// 从 transfer.ts 拆出（processTransferTask 依赖全部这些环节）。
import pLimit from "p-limit";

import { authFetch, basicAuthHeader } from "./auth";
import { TransferTask, UploadPart } from "./types";
import { encodeKey } from "./utils";
import { translate } from "./strings";

export const WEBDAV_ENDPOINT = "/webdav/";

const THUMBNAIL_SIZE = 144;

export async function generateThumbnail(file: File) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  var ctx = canvas.getContext("2d")!;

  if (file.type.startsWith("image/")) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        URL.revokeObjectURL(objectUrl);
        fn();
      };
      const timer = setTimeout(
        () => settle(() => reject(new Error("Image load timeout"))),
        2000
      );
      image.onload = () => settle(() => resolve(image));
      image.onerror = () =>
        settle(() => reject(new Error("Image load failed")));
      image.src = objectUrl;
    });
    ctx.drawImage(image, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  } else if (file.type === "video/mp4") {
    // Generate thumbnail from video；成功/失败都必须清理超时器与 objectURL，
    // 避免缩略图任务在 load 超时后永远悬在 pending。
    const objectUrl = URL.createObjectURL(file);
    try {
      const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
        let settled = false;
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn();
        };
        const timer = setTimeout(
          () => finish(() => reject(new Error("Video load timeout"))),
          2000
        );
        video.onerror = () =>
          finish(() => reject(new Error("Video load failed")));
        video.onloadeddata = async () => {
          try {
            await video.play();
            video.pause();
            video.currentTime = 0;
            finish(() => resolve(video));
          } catch (error) {
            finish(() => reject(error as Error));
          }
        };
        video.src = objectUrl;
        video.load();
      });
      ctx.drawImage(video, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } else if (file.type === "application/pdf") {
    const pdfjsLib = await import(
      // @ts-ignore
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    const pdf = await pdfjsLib.getDocument(URL.createObjectURL(file)).promise;
    const page = await pdf.getPage(1);
    const { width, height } = page.getViewport({ scale: 1 });
    var scale = THUMBNAIL_SIZE / Math.max(width, height);
    const viewport = page.getViewport({ scale });
    const renderContext = { canvasContext: ctx, viewport };
    await page.render(renderContext).promise;
  }

  const thumbnailBlob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((blob) => resolve(blob!))
  );

  return thumbnailBlob;
}

export async function blobDigest(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-1", new Uint8Array(await blob.arrayBuffer()));
  const digestArray = Array.from(new Uint8Array(digest));
  const digestHex = digestArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return digestHex;
}

// 分块阈值/分块尺寸统一低于 Workers 约 100MB 单请求上限：
// 恰好 100MB 的文件若切成一个分块会顶在请求体边缘，这里用 50MB 更安全。
export const SIZE_LIMIT = 50 * 1000 * 1000; // 50MB

// Folders already ensured this session (so we don't send redundant MKCOLs)
const ensuredDirs = new Set<string>();

export async function ensureParentDirs(remoteKey: string) {
  const segments = remoteKey.split("/").filter(Boolean);
  segments.pop(); // remove the file name itself
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (ensuredDirs.has(current)) continue;
    try {
      await authFetch(`${WEBDAV_ENDPOINT}${encodeKey(current)}`, {
        method: "MKCOL",
      });
    } catch {
      // ignore: the folder may already exist (MKCOL returns 405 there)
    }
    ensuredDirs.add(current);
  }
}

// Collects files from a drop event. Browsers that keep folder structure
// (Chrome) populate dataTransfer.files with webkitRelativePath already set.
// Others expose the folder as an entry, which we walk to rebuild the path.
export async function collectFilesFromDataTransfer(
  dt: DataTransfer
): Promise<File[]> {
  const files = Array.from(dt.files || []);
  if (files.length > 0) return files;

  const items = Array.from(dt.items || []);
  if (items.length === 0) return files;

  type AnyEntry = any;
  const result: File[] = [];
  const walk = async (entry: AnyEntry, path: string) => {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) =>
        entry.file(resolve, reject)
      );
      try {
        Object.defineProperty(file, "webkitRelativePath", {
          value: `${path}${entry.name}`,
          configurable: true,
        });
      } catch {
        // ignore
      }
      result.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readAll = async (): Promise<AnyEntry[]> => {
        const batch: AnyEntry[] = await new Promise((resolve, reject) =>
          reader.readEntries(resolve, reject)
        );
        if (batch.length === 0) return [];
        return [...batch, ...(await readAll())];
      };
      for (const child of await readAll()) {
        await walk(child, `${path}${entry.name}/`);
      }
    }
  };

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) await walk(entry, "");
  }
  return result;
}

export async function selectDirectoryFiles(): Promise<File[]> {
  const picker = (window as any).showDirectoryPicker;

  if (picker) {
    try {
      const rootHandle = await picker();
      const files: File[] = [];

      const walk = async (handle: any, path: string) => {
        for await (const entry of handle.values()) {
          if (entry.kind === "file") {
            const file: File = await entry.getFile();
            try {
              Object.defineProperty(file, "webkitRelativePath", {
                value: `${path}${entry.name}`,
                configurable: true,
              });
            } catch {
              // ignore
            }
            files.push(file);
          } else if (entry.kind === "directory") {
            await walk(entry, `${path}${entry.name}/`);
          }
        }
      };

      await walk(rootHandle, "");
      return files;
    } catch (error) {
      if ((error as any)?.name === "AbortError") return [];
      // Fall through to the webkitdirectory fallback on other failures.
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = () => resolve(Array.from(input.files || []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function xhrFetch(
  url: RequestInfo | URL,
  requestInit: RequestInit & {
    signal?: AbortSignal;
    onUploadProgress?: (progressEvent: ProgressEvent) => void;
  }
) {
  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = requestInit.onUploadProgress ?? null;
    xhr.open(
      requestInit.method ?? "GET",
      url instanceof Request ? url.url : url
    );
    const headers = new Headers(requestInit.headers);
    const authorization = basicAuthHeader();
    if (authorization) headers.set("Authorization", authorization);
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));

    const abort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };

    if (requestInit.signal) {
      if (requestInit.signal.aborted) {
        abort();
        return;
      }
      requestInit.signal.addEventListener("abort", abort, { once: true });
    }

    xhr.onload = () => {
      requestInit.signal?.removeEventListener("abort", abort);
      const parsed = new Headers();
      const raw = xhr.getAllResponseHeaders().trim();
      if (raw) {
        for (const line of raw.split("\r\n")) {
          const idx = line.indexOf(":");
          if (idx === -1) continue;
          const key = line.slice(0, idx).trim();
          const value = line.slice(idx + 1).trim();
          if (key) parsed.append(key, value);
        }
      }
      const status = xhr.status;
      if (!status) {
        reject(new Error(translate("networkRequestFailed")));
        return;
      }
      try {
        // 204/205/304 必须使用 null body，否则 Response 构造器会抛 TypeError；
        // onload 里的异常不会 settle Promise，任务会永远挂在 in-progress。
        const body =
          status === 204 || status === 205 || status === 304
            ? null
            : xhr.responseText;
        resolve(new Response(body, { status, headers: parsed }));
      } catch (error) {
        reject(error as Error);
      }
    };
    xhr.onerror = () => {
      requestInit.signal?.removeEventListener("abort", abort);
      reject(new Error(translate("networkRequestFailed")));
    };
    xhr.onabort = () => {
      requestInit.signal?.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (
      requestInit.body instanceof Blob ||
      typeof requestInit.body === "string"
    ) {
      xhr.send(requestInit.body);
    }
  });
}

export async function multipartUpload(
  key: string,
  file: File,
  options?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    uploadId?: string;
    uploadedParts?: UploadPart[];
    onUploadProgress?: (progressEvent: {
      loaded: number;
      total: number;
    }) => void;
    onState?: (state: {
      uploadId: string;
      uploadedParts: UploadPart[];
      loaded: number;
    }) => void;
  }
) {
  const headers = options?.headers || {};
  headers["content-type"] = file.type;

  let uploadId = options?.uploadId;
  const uploadedParts: UploadPart[] = [...(options?.uploadedParts || [])];
  const done = new Set(uploadedParts.map((part) => part.partNumber));
  const totalChunks = Math.ceil(file.size / SIZE_LIMIT) || 1;
  const partsLoaded = Array.from({ length: totalChunks + 1 }, () => 0);

  for (const part of uploadedParts) {
    const start = (part.partNumber - 1) * SIZE_LIMIT;
    const end = Math.min(part.partNumber * SIZE_LIMIT, file.size);
    partsLoaded[part.partNumber] = Math.max(0, end - start);
  }

  const emitProgress = (persist = false) => {
    const loaded = partsLoaded.reduce((a, b) => a + b, 0);
    options?.onUploadProgress?.({ loaded, total: file.size });
    if (persist && uploadId) {
      options?.onState?.({
        uploadId,
        uploadedParts: [...uploadedParts],
        loaded,
      });
    }
  };
  emitProgress(true);

  if (!uploadId) {
    const uploadResponse = await authFetch(`/webdav/${encodeKey(key)}?uploads`, {
      headers,
      method: "POST",
    });
    if (!uploadResponse.ok) {
      throw new Error((await uploadResponse.text()) || translate("multipartCreateFailed"));
    }
    const created = await uploadResponse.json<{ uploadId: string }>();
    uploadId = created.uploadId;
    options?.onState?.({
      uploadId,
      uploadedParts: [...uploadedParts],
      loaded: partsLoaded.reduce((a, b) => a + b, 0),
    });
  }

  const remaining = Array.from({ length: totalChunks }, (_, i) => i + 1).filter(
    (partNumber) => !done.has(partNumber)
  );

  const limit = pLimit(2);
  const promises = remaining.map((i) =>
    limit(async () => {
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const chunk = file.slice((i - 1) * SIZE_LIMIT, i * SIZE_LIMIT);
      const searchParams = new URLSearchParams({
        partNumber: i.toString(),
        uploadId: uploadId!,
      });
      const uploadUrl = `/webdav/${encodeKey(key)}?${searchParams}`;

      const uploadPart = () =>
        xhrFetch(uploadUrl, {
          method: "PUT",
          headers,
          body: chunk,
          signal: options?.signal,
          onUploadProgress: (progressEvent) => {
            partsLoaded[i] = progressEvent.loaded;
            emitProgress();
          },
        });

      const retryReducer = (acc: Promise<Response>) =>
        acc
          .then((res) => {
            const retryAfter = res.headers.get("retry-after");
            if (!retryAfter) return res;
            return uploadPart();
          })
          .catch(uploadPart);
      const response = await [1, 2].reduce(retryReducer, uploadPart());
      if (!response.ok) {
        throw new Error((await response.text()) || translate("partUploadFailed", { n: i }));
      }
      const etag = response.headers.get("etag");
      if (!etag) throw new Error(translate("partMissingEtag", { n: i }));
      const finished = { partNumber: i, etag };
      uploadedParts.push(finished);
      done.add(i);
      partsLoaded[i] = chunk.size;
      emitProgress(true);
      return finished;
    })
  );
  await Promise.all(promises);

  uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
  const completeParams = new URLSearchParams({ uploadId });
  const response = await authFetch(`/webdav/${encodeKey(key)}?${completeParams}`, {
    method: "POST",
    body: JSON.stringify({ parts: uploadedParts }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response;
}


export async function processTransferTask({
  task,
  onTaskProgress,
  onTaskState,
  signal,
}: {
  task: TransferTask;
  onTaskProgress?: (event: { loaded: number; total: number }) => void;
  onTaskState?: (patch: Partial<TransferTask>) => void;
  signal?: AbortSignal;
}) {
  const { remoteKey, file } = task;
  if (task.type !== "upload" || !file) throw new Error("Invalid task");
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  let thumbnailDigest = null;

  await ensureParentDirs(remoteKey);

  if (
    file.type.startsWith("image/") ||
    file.type === "video/mp4" ||
    file.type === "application/pdf"
  ) {
    try {
      const thumbnailBlob = await generateThumbnail(file);
      const digestHex = await blobDigest(thumbnailBlob);

      const thumbnailUploadUrl = `/webdav/_$flaredrive$/thumbnails/${digestHex}.png`;
      try {
        await authFetch(thumbnailUploadUrl, {
          method: "PUT",
          body: thumbnailBlob,
        });
        thumbnailDigest = digestHex;
      } catch (error) {
        console.log(`Upload ${digestHex}.png failed`);
      }
    } catch (error) {
      console.log(`Generate thumbnail failed`);
    }
  }

  const headers: { "fd-thumbnail"?: string } = {};
  if (thumbnailDigest) headers["fd-thumbnail"] = thumbnailDigest;
  if (file.size >= SIZE_LIMIT) {
    return await multipartUpload(remoteKey, file, {
      headers,
      signal,
      uploadId: task.uploadId,
      uploadedParts: task.uploadedParts,
      onUploadProgress: onTaskProgress,
      onState: (state) => onTaskState?.(state),
    });
  } else {
    const uploadUrl = `${WEBDAV_ENDPOINT}${encodeKey(remoteKey)}`;
    const response = await xhrFetch(uploadUrl, {
      method: "PUT",
      headers,
      body: file,
      signal,
      onUploadProgress: onTaskProgress,
    });
    if (!response.ok) {
      throw new Error((await response.text()) || translate("uploadFailedGeneric"));
    }
    return response;
  }
}
