/**
 * #184：刷新页面后没加载过任何缩略图就退出登录，davflare-thumbnails-v1 也要被清掉；
 * 清理时回收 object URL（#178 遗留的清理项）。
 */
import { vi } from "vitest";

import { LazyThumbnailDeps } from "../lazyThumbnail";

const png = { key: "vault/a.png", size: 10, uploaded: "Tue, 06 Oct 2026 14:00:00 GMT" };

/** 模拟一个已有 8 条持久条目的 Cache Storage */
function stubCacheStorage() {
  const stores = new Map<string, Map<string, unknown>>();
  const entries = new Map<string, unknown>();
  for (let i = 0; i < 8; i++) entries.set(`thumb-${i}`, {});
  stores.set("davflare-thumbnails-v1", entries);
  const del = vi.fn(async (name: string) => stores.delete(name));
  vi.stubGlobal("caches", { delete: del, keys: async () => [...stores.keys()] });
  return { stores, del };
}

/** 模拟 F5：模块全部重新加载（新的 auth 状态从 localStorage 读出） */
async function freshModules() {
  vi.resetModules();
  const auth = await import("../auth");
  const cache = await import("../thumbnailCache");
  return { auth, cache };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("logout clears the thumbnail cache without any thumbnail loaded (#184)", () => {
  test("F5 → never open an image folder → logout: persisted entries are gone", async () => {
    localStorage.setItem("flaredrive.auth", JSON.stringify({ username: "bgb", password: "p" }));
    const { stores, del } = stubCacheStorage();
    const { auth, cache } = await freshModules();

    cache.installThumbnailCacheCleanup(); // App 启动时
    await Promise.resolve();
    expect(del).not.toHaveBeenCalled(); // 已登录：启动时不清
    expect(stores.has("davflare-thumbnails-v1")).toBe(true);

    auth.clearCredentials(); // 头像菜单 → 退出登录
    await vi.waitFor(() => expect(stores.has("davflare-thumbnails-v1")).toBe(false));
    expect(del).toHaveBeenCalledWith("davflare-thumbnails-v1");
  });

  test("starting up signed out with a leftover cache clears it", async () => {
    const { stores } = stubCacheStorage();
    const { cache } = await freshModules();
    cache.installThumbnailCacheCleanup();
    await vi.waitFor(() => expect(stores.size).toBe(0));
  });

  test("install is idempotent: one clear per logout", async () => {
    localStorage.setItem("flaredrive.auth", JSON.stringify({ username: "bgb", password: "p" }));
    const { del } = stubCacheStorage();
    const { auth, cache } = await freshModules();
    cache.installThumbnailCacheCleanup();
    cache.installThumbnailCacheCleanup();
    auth.setCredentials({ username: "bgb", password: "p" }); // 登录不清
    expect(del).not.toHaveBeenCalled();
    auth.clearCredentials();
    await vi.waitFor(() => expect(del).toHaveBeenCalledTimes(1));
  });

  test("logout also clears the default loader's memory and revokes its object URLs", async () => {
    localStorage.setItem("flaredrive.auth", JSON.stringify({ username: "bgb", password: "p" }));
    stubCacheStorage();
    const { auth } = await freshModules();
    const lazy = await import("../lazyThumbnail");
    const memoryClear = vi.fn();
    const cache = await import("../thumbnailCache");
    cache.registerThumbnailMemory(memoryClear);
    const unregister = cache.registerThumbnailMemory(() => {
      throw new Error("one failing clearer does not stop the rest");
    });
    cache.installThumbnailCacheCleanup();
    auth.clearCredentials();
    await vi.waitFor(() => expect(memoryClear).toHaveBeenCalledTimes(1));
    unregister();
    expect(typeof lazy.clearLazyThumbnails).toBe("function");
    cache.__resetThumbnailCacheCleanupForTests();
  });
});

describe("loader clear revokes object URLs and voids in-flight work", () => {
  function deps(overrides: Partial<LazyThumbnailDeps> = {}) {
    let n = 0;
    return {
      fetchOriginal: vi.fn(async () => new Blob(["img"])),
      render: vi.fn(async () => new Blob(["thumb"])),
      cacheGet: vi.fn(async () => null as Blob | null),
      cachePut: vi.fn(async () => {}),
      createUrl: vi.fn(() => `blob:thumb-${++n}`),
      revokeUrl: vi.fn(),
      cacheClear: vi.fn(async () => {}),
      ...overrides,
    } satisfies LazyThumbnailDeps;
  }

  test("clearMemory revokes every URL it handed out", async () => {
    const { createLazyThumbnailLoader } = await import("../lazyThumbnail");
    const d = deps({ cacheGet: vi.fn(async (id: string) => (id.includes("b.png") ? new Blob(["c"]) : null)) });
    const loader = createLazyThumbnailLoader(d);
    expect(await loader.load(png)).toBe("blob:thumb-1");
    expect(await loader.load({ ...png, key: "vault/b.png" })).toBe("blob:thumb-2");
    loader.clearMemory();
    expect(d.revokeUrl).toHaveBeenCalledWith("blob:thumb-1");
    expect(d.revokeUrl).toHaveBeenCalledWith("blob:thumb-2");
    loader.clearMemory();
    expect(d.revokeUrl).toHaveBeenCalledTimes(2);
  });

  test("falls back to URL.revokeObjectURL; revoke errors are ignored", async () => {
    const { createLazyThumbnailLoader } = await import("../lazyThumbnail");
    const original = (URL as any).revokeObjectURL;
    const revoke = vi.fn(() => {
      throw new Error("x");
    });
    (URL as any).revokeObjectURL = revoke;
    try {
      const d = deps();
      delete (d as Partial<LazyThumbnailDeps>).revokeUrl;
      const loader = createLazyThumbnailLoader(d);
      await loader.load(png);
      expect(() => loader.clearMemory()).not.toThrow();
      expect(revoke).toHaveBeenCalledWith("blob:thumb-1");
    } finally {
      (URL as any).revokeObjectURL = original;
    }
  });

  test("a load still downloading when logout happens is dropped: no cache write, no URL", async () => {
    const { createLazyThumbnailLoader } = await import("../lazyThumbnail");
    let release!: (b: Blob) => void;
    const d = deps({ fetchOriginal: vi.fn(() => new Promise<Blob>((r) => (release = r))) });
    const loader = createLazyThumbnailLoader(d);
    const pending = loader.load(png);
    await vi.waitFor(() => expect(d.fetchOriginal).toHaveBeenCalled());
    loader.clearMemory();
    release(new Blob(["img"]));
    expect(await pending).toBeNull();
    expect(d.cachePut).not.toHaveBeenCalled();
    expect(d.createUrl).not.toHaveBeenCalled();
  });

  test("logout during the cache write deletes the persisted cache again", async () => {
    const { createLazyThumbnailLoader } = await import("../lazyThumbnail");
    let loaderRef: { clearMemory: () => void } | null = null;
    const d = deps({
      cachePut: vi.fn(async () => {
        loaderRef?.clearMemory();
      }),
    });
    const loader = createLazyThumbnailLoader(d);
    loaderRef = loader;
    expect(await loader.load(png)).toBeNull();
    expect(d.cacheClear).toHaveBeenCalledTimes(1);
    expect(d.createUrl).not.toHaveBeenCalled();
  });

  test("stale while waiting for the cache lookup / a concurrency slot / rendering", async () => {
    const { createLazyThumbnailLoader } = await import("../lazyThumbnail");
    // 查缓存途中被清
    let loader = createLazyThumbnailLoader(
      deps({ cacheGet: vi.fn(async () => (loader.clearMemory(), new Blob(["c"]))) })
    );
    expect(await loader.load(png)).toBeNull();
    // 渲染途中被清
    const d2 = deps({ render: vi.fn(async () => (loader2.clearMemory(), new Blob(["t"]))) });
    const loader2 = createLazyThumbnailLoader(d2);
    expect(await loader2.load(png)).toBeNull();
    expect(d2.cachePut).not.toHaveBeenCalled();
    // 排队等并发名额时被清
    const gates: Array<(b: Blob) => void> = [];
    const d3 = deps({ fetchOriginal: vi.fn(() => new Promise<Blob>((r) => gates.push(r))) });
    const loader3 = createLazyThumbnailLoader(d3);
    const a = loader3.load({ ...png, key: "1" });
    const b = loader3.load({ ...png, key: "2" });
    const c = loader3.load({ ...png, key: "3" }); // 并发 2：第三个在排队
    await vi.waitFor(() => expect(gates.length).toBe(2));
    loader3.clearMemory();
    gates.forEach((g) => g(new Blob(["x"])));
    expect(await Promise.all([a, b, c])).toEqual([null, null, null]);
    expect(d3.fetchOriginal).toHaveBeenCalledTimes(2);
  });
});
