/**
 * #149：WebDAV 上传、没有预生成缩略图的图片在浏览器里懒生成缩略图。
 */
import { onTestFinished, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import {
  LAZY_THUMBNAIL_CONCURRENCY,
  LAZY_THUMBNAIL_MAX_BYTES,
  LazyThumbnailDeps,
  canLazyThumbnail,
  clearLazyThumbnails,
  createLazyThumbnailLoader,
  defaultLazyThumbnailDeps,
  lazyThumbnailId,
  loadLazyThumbnail,
  renderSquareThumbnail,
} from "../lazyThumbnail";
import { clearCredentials, setCredentials } from "../auth";
import { FileItem } from "../types";

const png: FileItem = {
  key: "vault/附件/截图 1.png",
  name: "截图 1.png",
  isDir: false,
  size: 300 * 1024,
  uploaded: "Tue, 06 Oct 2026 14:00:00 GMT",
  contentType: "image/png",
};

describe("canLazyThumbnail", () => {
  test("small raster images without a pre-generated thumbnail", () => {
    expect(canLazyThumbnail(png)).toBe(true);
    for (const contentType of ["image/jpeg", "image/gif", "image/webp", "image/PNG; charset=binary"]) {
      expect(canLazyThumbnail({ ...png, contentType })).toBe(true);
    }
    expect(canLazyThumbnail({ ...png, size: LAZY_THUMBNAIL_MAX_BYTES })).toBe(true);
  });

  test("skips big files, dirs, empty files, svg, non-images and files that already have one", () => {
    expect(canLazyThumbnail({ ...png, size: LAZY_THUMBNAIL_MAX_BYTES + 1 })).toBe(false);
    expect(canLazyThumbnail({ ...png, size: 0 })).toBe(false);
    expect(canLazyThumbnail({ ...png, isDir: true })).toBe(false);
    expect(canLazyThumbnail({ ...png, thumbnail: "abc" })).toBe(false);
    expect(canLazyThumbnail({ ...png, name: "a.svg", contentType: "image/svg+xml" })).toBe(false);
    expect(canLazyThumbnail({ ...png, name: "a.txt", contentType: "text/plain" })).toBe(false);
    expect(canLazyThumbnail({ ...png, name: "a.mp4", contentType: "video/mp4" })).toBe(false);
  });

  test("untyped uploads fall back to the extension", () => {
    expect(canLazyThumbnail({ ...png, name: "a.JPG", contentType: "application/octet-stream" })).toBe(true);
    expect(canLazyThumbnail({ ...png, name: "a.webp", contentType: "" })).toBe(true);
    expect(canLazyThumbnail({ ...png, name: "a.bin", contentType: "application/octet-stream" })).toBe(false);
    expect(canLazyThumbnail({ ...png, name: "a.svg", contentType: "" })).toBe(false);
  });
});

function fakeDeps(overrides: Partial<LazyThumbnailDeps> = {}) {
  const store = new Map<string, Blob>();
  const deps: LazyThumbnailDeps = {
    fetchOriginal: vi.fn(async (key: string) => new Blob([`orig:${key}`], { type: "image/png" })),
    render: vi.fn(async (blob: Blob) => new Blob(["thumb:", blob], { type: "image/png" })),
    cacheGet: vi.fn(async (id: string) => store.get(id) ?? null),
    cachePut: vi.fn(async (id: string, blob: Blob) => {
      store.set(id, blob);
    }),
    createUrl: vi.fn((blob: Blob) => `blob:${blob.size}`),
    ...overrides,
  };
  return { deps, store };
}

describe("createLazyThumbnailLoader", () => {
  test("miss: downloads the original once, renders, stores in the cache", async () => {
    const { deps, store } = fakeDeps();
    const { load } = createLazyThumbnailLoader(deps);
    const [a, b] = await Promise.all([load(png), load(png)]);
    expect(a).toMatch(/^blob:/);
    expect(b).toBe(a);
    expect(deps.fetchOriginal).toHaveBeenCalledTimes(1);
    expect(deps.fetchOriginal).toHaveBeenCalledWith(png.key);
    expect(store.has(lazyThumbnailId(png))).toBe(true);
  });

  test("persistent cache hit skips the download", async () => {
    const { deps, store } = fakeDeps();
    store.set(lazyThumbnailId(png), new Blob(["cached"]));
    const { load } = createLazyThumbnailLoader(deps);
    expect(await load(png)).toBe("blob:6");
    expect(deps.fetchOriginal).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  test("changed size or mtime regenerates", async () => {
    const { deps } = fakeDeps();
    const { load } = createLazyThumbnailLoader(deps);
    await load(png);
    await load({ ...png, uploaded: "Wed, 07 Oct 2026 01:00:00 GMT" });
    await load({ ...png, size: png.size + 1 });
    expect(deps.fetchOriginal).toHaveBeenCalledTimes(3);
  });

  test("failures resolve to null (icon stays) and are not retried in a loop", async () => {
    const { deps } = fakeDeps({ render: vi.fn(async () => Promise.reject(new Error("decode"))) });
    const { load } = createLazyThumbnailLoader(deps);
    expect(await load(png)).toBeNull();
    expect(await load(png)).toBeNull();
    expect(deps.fetchOriginal).toHaveBeenCalledTimes(1);
    expect(deps.cachePut).not.toHaveBeenCalled();

    const missing = fakeDeps({ fetchOriginal: vi.fn(async () => null) });
    expect(await createLazyThumbnailLoader(missing.deps).load(png)).toBeNull();
    expect(missing.deps.render).not.toHaveBeenCalled();
  });

  test(`at most ${LAZY_THUMBNAIL_CONCURRENCY} originals download at once`, async () => {
    let running = 0;
    let peak = 0;
    const { deps } = fakeDeps({
      fetchOriginal: vi.fn(async (key: string) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        return new Blob([key]);
      }),
    });
    const { load } = createLazyThumbnailLoader(deps);
    const files = Array.from({ length: 8 }, (_, i) => ({ ...png, key: `p/${i}.png` }));
    const urls = await Promise.all(files.map((file) => load(file)));
    expect(urls.every(Boolean)).toBe(true);
    expect(peak).toBe(LAZY_THUMBNAIL_CONCURRENCY);
  });

  test("clearMemory forgets results", async () => {
    const { deps, store } = fakeDeps();
    const loader = createLazyThumbnailLoader(deps);
    await loader.load(png);
    store.clear();
    loader.clearMemory();
    await loader.load(png);
    expect(deps.fetchOriginal).toHaveBeenCalledTimes(2);
  });
});

describe("clearLazyThumbnails", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("drops the persistent cache (used on logout)", async () => {
    const del = vi.fn(async () => true);
    vi.stubGlobal("caches", { delete: del });
    await clearLazyThumbnails();
    expect(del).toHaveBeenCalledWith("davflare-thumbnails-v1");
  });

  test("no Cache Storage / errors are ignored", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearLazyThumbnails()).resolves.toBeUndefined();
    vi.stubGlobal("caches", { delete: vi.fn(async () => Promise.reject(new Error("x"))) });
    await expect(clearLazyThumbnails()).resolves.toBeUndefined();
  });
});

describe("default deps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("fetchOriginal reads /webdav/<encoded key> with auth; non-OK → null", async () => {
    const fetchMock = vi.fn(async () => new Response("IMG", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setCredentials({ username: "u", password: "p" });
    const blob = await defaultLazyThumbnailDeps.fetchOriginal("vault/附件/截图 1.png");
    expect(blob).not.toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/webdav/vault/${encodeURIComponent("附件")}/${encodeURIComponent("截图 1.png")}`);
    expect(new Headers(init.headers).get("Authorization")).toMatch(/^Basic /);
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    expect(await defaultLazyThumbnailDeps.fetchOriginal("gone.png")).toBeNull();
  });

  test("Cache Storage get / put; missing or failing Cache Storage is harmless", async () => {
    const stored = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (url: string) => stored.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => {
        stored.set(url, response);
      }),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    expect(await defaultLazyThumbnailDeps.cacheGet("id-1")).toBeNull();
    await defaultLazyThumbnailDeps.cachePut("id-1", new Blob(["T"], { type: "image/png" }));
    expect(cache.put).toHaveBeenCalledTimes(1);
    const url = cache.put.mock.calls[0][0] as string;
    expect(url).toContain("/__davflare_thumbnail__/id-1");
    expect(stored.get(url)!.headers.get("Content-Type")).toBe("image/png");
    expect(await defaultLazyThumbnailDeps.cacheGet("id-1")).not.toBeNull();

    vi.stubGlobal("caches", { open: vi.fn(async () => Promise.reject(new Error("quota"))) });
    expect(await defaultLazyThumbnailDeps.cacheGet("id-1")).toBeNull();
    await expect(defaultLazyThumbnailDeps.cachePut("id-1", new Blob(["T"]))).resolves.toBeUndefined();
    vi.stubGlobal("caches", undefined);
    expect(await defaultLazyThumbnailDeps.cacheGet("id-1")).toBeNull();
    await expect(defaultLazyThumbnailDeps.cachePut("id-1", new Blob(["T"]))).resolves.toBeUndefined();
    expect(defaultLazyThumbnailDeps.createUrl).toBeTypeOf("function");
  });

  function stubCanvas(ctx: unknown, out: Blob | null = new Blob(["png"], { type: "image/png" })) {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback) {
      cb(out);
    });
  }

  test("renderSquareThumbnail centre-crops to a 144px square (createImageBitmap path)", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 300, height: 100, close })));
    const drawImage = vi.fn();
    stubCanvas({ drawImage });
    const out = await renderSquareThumbnail(new Blob(["x"]));
    expect(out.type).toBe("image/png");
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 100, 100, 0, 0, 144, 144);
    expect(close).toHaveBeenCalled();
  });

  test("renderSquareThumbnail falls back to <img> and rejects bad input", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    onTestFinished(() => {
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    });
    let mode: "load" | "error" = "load";
    class FakeImage {
      width = 80;
      height = 200;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        setTimeout(() => (mode === "load" ? this.onload?.() : this.onerror?.()), 0);
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const drawImage = vi.fn();
    stubCanvas({ drawImage });
    await renderSquareThumbnail(new Blob(["x"]));
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 60, 80, 80, 0, 0, 144, 144);

    mode = "error";
    await expect(renderSquareThumbnail(new Blob(["x"]))).rejects.toThrow("Image load failed");

    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 0, height: 0 })));
    await expect(renderSquareThumbnail(new Blob(["x"]))).rejects.toThrow("Empty image");
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10 })));
    stubCanvas(null);
    await expect(renderSquareThumbnail(new Blob(["x"]))).rejects.toThrow("No 2d context");
    stubCanvas({ drawImage }, null);
    await expect(renderSquareThumbnail(new Blob(["x"]))).rejects.toThrow("toBlob failed");
  });

  test("loadLazyThumbnail: failures → null; logging out clears the cache", async () => {
    const del = vi.fn(async () => true);
    vi.stubGlobal("caches", { open: vi.fn(async () => Promise.reject(new Error("x"))), delete: del });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    setCredentials({ username: "u", password: "p" });
    expect(await loadLazyThumbnail({ key: "z.png", size: 1, uploaded: "t" })).toBeNull();
    clearCredentials();
    await Promise.resolve();
    expect(del).toHaveBeenCalledWith("davflare-thumbnails-v1");
  });
});

describe("LazyThumbnail component", () => {
  const loadMock = vi.fn(async () => "blob:thumb");

  beforeEach(() => {
    vi.resetModules();
    loadMock.mockClear();
    vi.doMock("../lazyThumbnail", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../lazyThumbnail")>()),
      loadLazyThumbnail: loadMock,
    }));
  });

  afterEach(() => {
    vi.doUnmock("../lazyThumbnail");
    vi.unstubAllGlobals();
  });

  async function renderLazy() {
    const { LazyThumbnail } = await import("../../AuthThumbnail");
    return render(
      <ThemeProvider theme={createTheme()}>
        <LazyThumbnail file={png} size={64} />
      </ThemeProvider>
    );
  }

  test("waits until the tile scrolls into view", async () => {
    let callback: IntersectionObserverCallback | null = null;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn((cb: IntersectionObserverCallback) => {
        callback = cb;
        return { observe, disconnect, unobserve: vi.fn(), takeRecords: () => [] };
      })
    );
    await renderLazy();
    expect(observe).toHaveBeenCalledTimes(1);
    expect(loadMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();

    await act(async () => {
      callback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1));
    expect(loadMock).toHaveBeenCalledWith({ key: png.key, size: png.size, uploaded: png.uploaded });
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:thumb"));
    expect(disconnect).toHaveBeenCalled();
  });

  test("without IntersectionObserver it loads right away", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    await renderLazy();
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("alt", png.name));
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  test("failure keeps the type icon", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    loadMock.mockResolvedValueOnce(null as unknown as string);
    await renderLazy();
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("img")).toBeNull();
  });
});
