// 没有预生成缩略图的图片（WebDAV / Obsidian / rclone 上传，#149）在浏览器里懒生成缩略图：
// 进入视口才下载原图，缩成 144px 方图，结果按「路径 + 大小 + 修改时间」缓存在内存和
// Cache Storage 里，下次打开同一目录不用重新下载。
// 不回写服务端：给原文件补 fd-thumbnail 元数据只能整份重写对象，会改掉它的修改时间 / ETag，
// 让 Remotely Save 之类的同步客户端以为文件被改过。
import pLimit from "p-limit";

import { authFetch, getCredentials, subscribeAuth } from "./auth";
import { FileItem } from "./types";
import { encodeKey } from "./utils";

/** 超过这个大小的图片不懒生成，保持类型图标：大图下载慢，也会拖慢解码 */
export const LAZY_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
/** 同时最多下载 / 解码几张原图，滚动一大屏截图时不会把带宽和主线程占满 */
export const LAZY_THUMBNAIL_CONCURRENCY = 2;
export const LAZY_THUMBNAIL_SIZE = 144;
const DECODE_TIMEOUT_MS = 8000;
const CACHE_NAME = "davflare-thumbnails-v1";

const RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
]);
const RASTER_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

/** 能否懒生成：普通栅格图（不含 svg）、没有预生成缩略图、大小在上限内 */
export function canLazyThumbnail(file: Pick<FileItem, "isDir" | "thumbnail" | "size" | "contentType" | "name">): boolean {
  if (file.isDir || file.thumbnail) return false;
  if (!(file.size > 0) || file.size > LAZY_THUMBNAIL_MAX_BYTES) return false;
  const type = (file.contentType || "").split(";")[0].trim().toLowerCase();
  if (RASTER_TYPES.has(type)) return true;
  // 有些客户端上传时不带类型，存成 octet-stream：按扩展名兜底
  return (type === "" || type === "application/octet-stream") && RASTER_EXT_RE.test(file.name);
}

/** 缓存键：内容变了（大小或修改时间变化）就换一张 */
export function lazyThumbnailId(file: Pick<FileItem, "key" | "size" | "uploaded">): string {
  return `${file.key}\u0000${file.size}\u0000${file.uploaded}`;
}

function cacheRequestUrl(id: string): string {
  return `${location.origin}/__davflare_thumbnail__/${encodeURIComponent(id)}`;
}

export interface LazyThumbnailDeps {
  fetchOriginal: (key: string) => Promise<Blob | null>;
  render: (blob: Blob) => Promise<Blob>;
  cacheGet: (id: string) => Promise<Blob | null>;
  cachePut: (id: string, blob: Blob) => Promise<void>;
  createUrl: (blob: Blob) => string;
}

async function fetchOriginal(key: string): Promise<Blob | null> {
  const response = await authFetch(`/webdav/${encodeKey(key)}`);
  if (!response.ok) return null;
  return response.blob();
}

function decodeImage(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    const timer = setTimeout(() => finish(() => reject(new Error("Image load timeout"))), DECODE_TIMEOUT_MS);
    let settled = false;
    function finish(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(objectUrl);
      fn();
    }
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(new Error("Image load failed")));
    image.src = objectUrl;
  });
}

/** 居中裁成方形再缩到 144px（与列表里 object-fit: cover 的显示一致，不拉伸） */
export async function renderSquareThumbnail(blob: Blob): Promise<Blob> {
  const image = await decodeImage(blob);
  const side = Math.min(image.width, image.height);
  if (!(side > 0)) throw new Error("Empty image");
  const canvas = document.createElement("canvas");
  canvas.width = LAZY_THUMBNAIL_SIZE;
  canvas.height = LAZY_THUMBNAIL_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  ctx.drawImage(
    image,
    (image.width - side) / 2,
    (image.height - side) / 2,
    side,
    side,
    0,
    0,
    LAZY_THUMBNAIL_SIZE,
    LAZY_THUMBNAIL_SIZE
  );
  if ("close" in image && typeof image.close === "function") image.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error("toBlob failed"))), "image/png")
  );
}

async function cacheGet(id: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheRequestUrl(id));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

async function cachePut(id: string, blob: Blob): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheRequestUrl(id),
      new Response(blob, { headers: { "Content-Type": "image/png" } })
    );
  } catch {
    // 配额不足 / 隐私模式：只是下次要重新生成
  }
}

export const defaultLazyThumbnailDeps: LazyThumbnailDeps = {
  fetchOriginal,
  render: renderSquareThumbnail,
  cacheGet,
  cachePut,
  createUrl: (blob) => URL.createObjectURL(blob),
};

/** 生成器：内存缓存 + 并发限制；失败返回 null（显示类型图标），同一张不会反复重试 */
export function createLazyThumbnailLoader(deps: LazyThumbnailDeps = defaultLazyThumbnailDeps) {
  const memory = new Map<string, Promise<string | null>>();
  const limit = pLimit(LAZY_THUMBNAIL_CONCURRENCY);
  function load(file: Pick<FileItem, "key" | "size" | "uploaded">): Promise<string | null> {
    const id = lazyThumbnailId(file);
    let pending = memory.get(id);
    if (!pending) {
      pending = (async () => {
        try {
          const cached = await deps.cacheGet(id);
          if (cached) return deps.createUrl(cached);
          return await limit(async () => {
            const original = await deps.fetchOriginal(file.key);
            if (!original) return null;
            const thumb = await deps.render(original);
            await deps.cachePut(id, thumb);
            return deps.createUrl(thumb);
          });
        } catch {
          return null;
        }
      })();
      memory.set(id, pending);
    }
    return pending;
  }
  return { load, clearMemory: () => memory.clear() };
}

const defaultLoader = createLazyThumbnailLoader();
let logoutHooked = false;

/** 默认生成器；第一次用到时挂上「退出登录即清缓存」 */
export function loadLazyThumbnail(file: Pick<FileItem, "key" | "size" | "uploaded">): Promise<string | null> {
  if (!logoutHooked) {
    logoutHooked = true;
    subscribeAuth(() => {
      if (!getCredentials()) void clearLazyThumbnails();
    });
  }
  return defaultLoader.load(file);
}

/** 退出登录时清掉懒生成的缩略图（内存 + Cache Storage），私有图片的小图不留在这台浏览器里 */
export async function clearLazyThumbnails(): Promise<void> {
  defaultLoader.clearMemory();
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // ignore
  }
}
