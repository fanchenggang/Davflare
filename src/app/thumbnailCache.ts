// 懒生成缩略图（#149）的「退出登录即清理」：独立成小模块，不依赖 p-limit，
// 应用启动时（App 挂载）就能挂上，不用等第一次加载缩略图（#184）。
import { getCredentials, subscribeAuth } from "./auth";

export const THUMBNAIL_CACHE_NAME = "davflare-thumbnails-v1";

/** 各生成器的内存清理（清内存缓存 + 回收 object URL） */
const memoryClearers = new Set<() => void>();

export function registerThumbnailMemory(clear: () => void): () => void {
  memoryClearers.add(clear);
  return () => {
    memoryClearers.delete(clear);
  };
}

/** 只删 Cache Storage 里的持久缓存 */
export async function deleteThumbnailCacheStorage(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(THUMBNAIL_CACHE_NAME);
  } catch {
    // 隐私模式 / 不支持：没有可清的
  }
}

/** 清掉懒生成的缩略图：内存缓存、object URL、Cache Storage 持久条目 */
export async function clearThumbnailCache(): Promise<void> {
  for (const clear of memoryClearers) {
    try {
      clear();
    } catch {
      // 一个清理失败不影响其他
    }
  }
  await deleteThumbnailCacheStorage();
}

let installed = false;

/**
 * 挂上「退出登录 → 清缩略图缓存」。幂等，可多次调用。
 * 挂上时如果已经是未登录状态（例如上次退出时页面没机会清理），顺手把残留的持久缓存清掉。
 */
export function installThumbnailCacheCleanup(): void {
  if (installed) return;
  installed = true;
  subscribeAuth(() => {
    if (!getCredentials()) void clearThumbnailCache();
  });
  if (!getCredentials()) void clearThumbnailCache();
}

/** 仅测试用：重置安装状态 */
export function __resetThumbnailCacheCleanupForTests(): void {
  installed = false;
  memoryClearers.clear();
}
